import type { DatabaseConnection } from '../../../data/database/DatabaseConnection.js';
import type { ChangeSet, EntityChanges } from '../ChangeTracker.js';
import { ConflictResolver } from '../ConflictResolver.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeSchema(
  name: string,
  primaryKeyColumns: string[],
): EntityChanges['schema'] {
  return { name, primaryKeyColumns };
}

function makeChanges(
  tableName: string,
  rows: Record<string, unknown>[],
  pkColumns: string[],
): ChangeSet {
  const map = new Map<string, EntityChanges>();
  map.set(tableName, { schema: makeSchema(tableName, pkColumns), rows });
  return map;
}

function now(): string {
  return new Date().toISOString();
}

function timeAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function timeFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

// ─── Mock DB for orphan tests ─────────────────────────────────────────

function createMockDb() {
  const tables = new Map<string, Array<Record<string, unknown>>>();
  const tableInfo = new Map<string, Array<{ name: string; pk: number }>>();
  const deletedRows: Array<{ table: string; pk: Record<string, unknown> }> = [];
  const softDeletedRows: Array<{
    table: string;
    pk: Record<string, unknown>;
    deleted_at: string;
  }> = [];

  const queryFn = jest.fn(
    async (sql: string): Promise<unknown[]> => {
      // Table discovery
      if (sql.includes('sqlite_master') && sql.includes('updated_at')) {
        const results: { name: string }[] = [];
        for (const [name, rows] of tables) {
          if (rows.length > 0 && 'updated_at' in rows[0]) {
            results.push({ name });
          } else if (tableInfo.has(name)) {
            const info = tableInfo.get(name)!;
            if (info.some((c) => c.name === 'updated_at')) {
              results.push({ name });
            }
          }
        }
        return results;
      }

      // PK column discovery
      if (sql.includes('pragma_table_info') && sql.includes('pk > 0')) {
        const tableName = sql.match(/FROM '(\w+)'/)?.[1];
        if (!tableName) return [];
        const info = tableInfo.get(tableName) ?? [];
        return info.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk);
      }

      // deleted_at check
      if (sql.includes('pragma_table_info') && sql.includes("name = 'deleted_at'")) {
        const tableName = sql.match(/FROM '(\w+)'/)?.[1];
        if (!tableName) return [];
        const info = tableInfo.get(tableName) ?? [];
        if (info.some((c) => c.name === 'deleted_at')) {
          return [{ name: 'deleted_at' }];
        }
        return [];
      }

      // PRAGMA foreign_key_list
      if (sql.startsWith('PRAGMA foreign_key_list')) {
        const tableName = sql.match(/foreign_key_list\("(\w+)"\)/)?.[1];
        if (!tableName) return [];
        // Return FK relationships based on table
        const fks: Record<string, unknown>[] = [];
        if (tableName === 'song_artists') {
          fks.push({
            id: 1,
            seq: 0,
            table: 'songs',
            from: 'song_id',
            to: 'id',
          });
          fks.push({
            id: 2,
            seq: 0,
            table: 'artists',
            from: 'artist_id',
            to: 'id',
          });
        }
        return fks;
      }

      // SELECT * with JOIN for orphan detection
      if (sql.includes('LEFT JOIN')) {
        // Simplified: return empty for now — orphans detected in WHERE clause
        const tableName = sql.match(/FROM "(\w+)"/)?.[1];
        if (!tableName) return [];
        return [];
      }

      // SELECT * (no WHERE)
      if (sql.startsWith('SELECT * FROM') && !sql.includes('WHERE')) {
        const tableName = sql.match(/FROM "(\w+)"/)?.[1];
        if (!tableName) return [];
        return tables.get(tableName) ?? [];
      }

      return [];
    },
  );

  const executeFn = jest.fn(
    async (sql: string, params?: unknown[]): Promise<void> => {
      // DELETE FROM table WHERE ...
      if (sql.startsWith('DELETE FROM')) {
        const tableName = sql.match(/DELETE FROM "(\w+)"/)?.[1];
        if (tableName) {
          const pkCols = sql
            .match(/WHERE (.+)/)?.[1]
            ?.split(' AND ')
            .map((s) => s.match(/"(\w+)"/)?.[1])
            .filter(Boolean) ?? [];
          const pk: Record<string, unknown> = {};
          pkCols.forEach((col, i) => {
            pk[col!] = params?.[i];
          });
          deletedRows.push({ table: tableName, pk });
          // Actually remove from mock
          const rows = tables.get(tableName) ?? [];
          const newRows = rows.filter((r) => {
            return !pkCols.every((col) => r[col!] === pk[col!]);
          });
          tables.set(tableName, newRows);
        }
        return;
      }

      // UPDATE table SET deleted_at = ? WHERE ...
      if (sql.includes('SET deleted_at = ?')) {
        const tableName = sql.match(/UPDATE "(\w+)"/)?.[1];
        const deletedAt = params?.[0] as string;
        if (tableName && deletedAt) {
          const pkCols = sql
            .match(/WHERE (.+)/)?.[1]
            ?.split(' AND ')
            .map((s) => s.match(/"(\w+)"/)?.[1])
            .filter(Boolean) ?? [];
          const pk: Record<string, unknown> = {};
          pkCols.forEach((col, i) => {
            pk[col!] = params?.[i + 1];
          });
          softDeletedRows.push({ table: tableName, pk, deleted_at: deletedAt });
          // Actually update in mock
          const rows = tables.get(tableName) ?? [];
          for (const row of rows) {
            if (pkCols.every((col) => row[col!] === pk[col!])) {
              row.deleted_at = deletedAt;
            }
          }
        }
        return;
      }
    },
  );

  return {
    _tables: tables,
    _tableInfo: tableInfo,
    _deletedRows: deletedRows,
    _softDeletedRows: softDeletedRows,
    open: jest.fn(),
    close: jest.fn(),
    execute: executeFn as unknown as DatabaseConnection['execute'],
    query: queryFn as unknown as DatabaseConnection['query'],
    transaction: jest.fn(),
    serialize: jest.fn().mockResolvedValue(new Uint8Array(0)),
  } as {
    _tables: typeof tables;
    _tableInfo: typeof tableInfo;
    _deletedRows: typeof deletedRows;
    _softDeletedRows: typeof softDeletedRows;
    open: jest.Mock;
    close: jest.Mock;
    execute: jest.Mock;
    query: jest.Mock;
    transaction: jest.Mock;
    serialize: jest.Mock;
  };
}

// ─── LWW Merge Tests ──────────────────────────────────────────────────

describe('ConflictResolver', () => {
  let resolver: ConflictResolver;

  beforeEach(() => {
    resolver = new ConflictResolver();
  });

  describe('LWW Merge', () => {
    // CF-01
    it('local newer wins', () => {
      const local = makeChanges('songs', [
        { id: '1', updated_at: timeFromNow(10_000) },
      ], ['id']);
      const remote = makeChanges('songs', [
        { id: '1', updated_at: timeAgo(10_000) },
      ], ['id']);

      const result = resolver.resolve(local, remote);
      const songs = result.winners.get('songs');
      expect(songs).toBeDefined();
      expect(songs!.rows[0].id).toBe('1');
      expect(result.conflictsResolved).toBe(1);
    });

    // CF-02
    it('remote newer wins', () => {
      const local = makeChanges('songs', [
        { id: '1', updated_at: timeAgo(10_000) },
      ], ['id']);
      const remote = makeChanges('songs', [
        { id: '1', updated_at: timeFromNow(10_000) },
      ], ['id']);

      const result = resolver.resolve(local, remote);
      const songs = result.winners.get('songs');
      expect(songs).toBeDefined();
      expect(songs!.rows[0].updated_at).toBe(remote.get('songs')!.rows[0].updated_at);
      expect(result.conflictsResolved).toBe(1);
    });

    // CF-03
    it('same timestamp — deterministic tiebreak local wins', () => {
      const ts = now();
      const local = makeChanges('songs', [
        { id: '1', updated_at: ts, name: 'Local' },
      ], ['id']);
      const remote = makeChanges('songs', [
        { id: '1', updated_at: ts, name: 'Remote' },
      ], ['id']);

      const result = resolver.resolve(local, remote);
      const songs = result.winners.get('songs');
      expect(songs!.rows[0].name).toBe('Local');
      expect(result.conflictsResolved).toBe(1);
    });

    // CF-04
    it('only local has record — local wins', () => {
      const local = makeChanges('songs', [
        { id: '1', updated_at: now() },
      ], ['id']);
      const remote = new Map<string, EntityChanges>();

      const result = resolver.resolve(local, remote);
      const songs = result.winners.get('songs');
      expect(songs!.rows).toHaveLength(1);
      expect(result.newLocalOnly).toBe(1);
    });

    // CF-05
    it('only remote has record — remote wins', () => {
      const local = new Map<string, EntityChanges>();
      const remote = makeChanges('songs', [
        { id: '1', updated_at: now() },
      ], ['id']);

      const result = resolver.resolve(local, remote);
      const songs = result.winners.get('songs');
      expect(songs!.rows).toHaveLength(1);
      expect(result.newRemoteOnly).toBe(1);
    });

    // CF-06
    it('both soft-deleted, local more recent — local wins', () => {
      const localTs = timeFromNow(5000);
      const remoteTs = timeAgo(5000);
      const local = makeChanges('songs', [
        { id: '1', updated_at: localTs, deleted_at: localTs },
      ], ['id']);
      const remote = makeChanges('songs', [
        { id: '1', updated_at: remoteTs, deleted_at: remoteTs },
      ], ['id']);

      const result = resolver.resolve(local, remote);
      const songs = result.winners.get('songs');
      expect(songs!.rows[0].deleted_at).toBe(localTs);
      expect(result.conflictsResolved).toBe(1);
    });

    // CF-07
    it('local deleted, remote edited (remote newer) — remote wins', () => {
      const local = makeChanges('songs', [
        { id: '1', updated_at: timeFromNow(5000), deleted_at: timeFromNow(5000) },
      ], ['id']);
      const remote = makeChanges('songs', [
        { id: '1', updated_at: timeFromNow(10_000), deleted_at: null },
      ], ['id']);

      const result = resolver.resolve(local, remote);
      const songs = result.winners.get('songs');
      expect(songs!.rows[0].deleted_at).toBeNull();
      expect(result.conflictsResolved).toBe(1);
    });

    // CF-08
    it('remote deleted, local edited (local newer) — local wins', () => {
      const local = makeChanges('songs', [
        { id: '1', updated_at: timeFromNow(10_000), deleted_at: null },
      ], ['id']);
      const remote = makeChanges('songs', [
        { id: '1', updated_at: timeFromNow(5000), deleted_at: timeFromNow(5000) },
      ], ['id']);

      const result = resolver.resolve(local, remote);
      const songs = result.winners.get('songs');
      expect(songs!.rows[0].deleted_at).toBeNull();
      expect(result.conflictsResolved).toBe(1);
    });

    // CF-09
    it('multiple records across different tables', () => {
      const local = makeChanges('songs', [
        { id: '1', updated_at: timeFromNow(1000) },
        { id: '2', updated_at: timeFromNow(2000) },
      ], ['id']);
      local.set('artists', {
        schema: makeSchema('artists', ['id']),
        rows: [
          { id: '1', updated_at: timeFromNow(1000) },
          { id: '2', updated_at: timeFromNow(2000) },
          { id: '3', updated_at: timeFromNow(3000) },
        ],
      });

      const remote = makeChanges('songs', [
        { id: '2', updated_at: timeAgo(1000) },
      ], ['id']);
      remote.set('artists', {
        schema: makeSchema('artists', ['id']),
        rows: [
          { id: '2', updated_at: timeAgo(2000) },
          { id: '4', updated_at: timeFromNow(500) },
        ],
      });

      const result = resolver.resolve(local, remote);
      // Songs: id=1 (local-only), id=2 (conflict: local newer) = 2 songs
      expect(result.winners.get('songs')!.rows).toHaveLength(2);
      // Artists: id=1,3 (local-only), id=2 (conflict: local newer), id=4 (remote-only) = 4 artists
      expect(result.winners.get('artists')!.rows).toHaveLength(4);
      expect(result.conflictsResolved).toBe(2); // song 2, artist 2
      expect(result.newLocalOnly).toBe(3); // song 1, artist 1, artist 3
      expect(result.newRemoteOnly).toBe(1); // artist 4
    });

    // CF-10
    it('conflictsResolved count', () => {
      const local = makeChanges('songs', [
        { id: '1', updated_at: timeFromNow(1000) },
        { id: '2', updated_at: timeFromNow(2000) },
        { id: '3', updated_at: timeFromNow(3000) },
      ], ['id']);
      const remote = makeChanges('songs', [
        { id: '1', updated_at: timeAgo(1000) },
        { id: '2', updated_at: timeAgo(2000) },
        { id: '3', updated_at: timeAgo(3000) },
      ], ['id']);

      const result = resolver.resolve(local, remote);
      expect(result.conflictsResolved).toBe(3);
    });

    // CF-11
    it('newLocalOnly count', () => {
      const local = makeChanges('songs', [
        { id: '1', updated_at: now() },
        { id: '2', updated_at: now() },
      ], ['id']);
      const remote = new Map<string, EntityChanges>();

      const result = resolver.resolve(local, remote);
      expect(result.newLocalOnly).toBe(2);
    });

    // CF-12
    it('newRemoteOnly count', () => {
      const local = new Map<string, EntityChanges>();
      const remote = makeChanges('songs', [
        { id: '1', updated_at: now() },
        { id: '2', updated_at: now() },
        { id: '3', updated_at: now() },
      ], ['id']);

      const result = resolver.resolve(local, remote);
      expect(result.newRemoteOnly).toBe(3);
    });

    // CF-13
    it('totalRecordsAffected equals sum of winners', () => {
      const local = makeChanges('songs', [
        { id: '1', updated_at: timeFromNow(1000) },
      ], ['id']);
      local.set('artists', {
        schema: makeSchema('artists', ['id']),
        rows: [{ id: '1', updated_at: now() }],
      });
      const remote = makeChanges('songs', [
        { id: '2', updated_at: now() },
      ], ['id']);

      const result = resolver.resolve(local, remote);
      expect(result.totalRecordsAffected).toBe(
        result.conflictsResolved + result.newLocalOnly + result.newRemoteOnly,
      );
    });

    // CF-14
    it('junction table merge — local newer', () => {
      const localTs = timeFromNow(10_000);
      const remoteTs = timeAgo(10_000);
      const local = makeChanges('song_artists', [
        { song_id: 's1', artist_id: 'a1', updated_at: localTs },
      ], ['song_id', 'artist_id']);
      const remote = makeChanges('song_artists', [
        { song_id: 's1', artist_id: 'a1', updated_at: remoteTs },
      ], ['song_id', 'artist_id']);

      const result = resolver.resolve(local, remote);
      expect(result.conflictsResolved).toBe(1);
      const sa = result.winners.get('song_artists');
      expect(sa!.rows[0].updated_at).toBe(localTs);
    });

    // CF-15
    it('junction table — different composite keys are different records', () => {
      const local = makeChanges('song_artists', [
        { song_id: 's1', artist_id: 'a1', updated_at: now() },
      ], ['song_id', 'artist_id']);
      const remote = makeChanges('song_artists', [
        { song_id: 's1', artist_id: 'a2', updated_at: now() },
      ], ['song_id', 'artist_id']);

      const result = resolver.resolve(local, remote);
      expect(result.newLocalOnly).toBe(1);
      expect(result.newRemoteOnly).toBe(1);
      expect(result.conflictsResolved).toBe(0);
      const sa = result.winners.get('song_artists');
      expect(sa!.rows).toHaveLength(2);
    });

    // CF-16
    it('app_settings merge — PK is "key" not "id"', () => {
      const local = makeChanges('app_settings', [
        { key: 'theme', value: 'dark', updated_at: timeFromNow(10_000) },
      ], ['key']);
      const remote = makeChanges('app_settings', [
        { key: 'theme', value: 'light', updated_at: timeAgo(10_000) },
      ], ['key']);

      const result = resolver.resolve(local, remote);
      const settings = result.winners.get('app_settings');
      expect(settings!.rows[0].value).toBe('dark');
      expect(result.conflictsResolved).toBe(1);
    });

    // CF-17
    it('empty local changes, non-empty remote', () => {
      const local = new Map<string, EntityChanges>();
      const remote = makeChanges('songs', [
        { id: '1', updated_at: now() },
        { id: '2', updated_at: now() },
      ], ['id']);

      const result = resolver.resolve(local, remote);
      expect(result.winners.get('songs')!.rows).toHaveLength(2);
      expect(result.newRemoteOnly).toBe(2);
      expect(result.newLocalOnly).toBe(0);
    });

    // CF-18
    it('empty remote changes, non-empty local', () => {
      const local = makeChanges('songs', [
        { id: '1', updated_at: now() },
      ], ['id']);
      const remote = new Map<string, EntityChanges>();

      const result = resolver.resolve(local, remote);
      expect(result.winners.get('songs')!.rows).toHaveLength(1);
      expect(result.newLocalOnly).toBe(1);
      expect(result.newRemoteOnly).toBe(0);
    });

    // CF-19
    it('both empty', () => {
      const local = new Map<string, EntityChanges>();
      const remote = new Map<string, EntityChanges>();

      const result = resolver.resolve(local, remote);
      expect(result.winners.size).toBe(0);
      expect(result.conflictsResolved).toBe(0);
      expect(result.newLocalOnly).toBe(0);
      expect(result.newRemoteOnly).toBe(0);
      expect(result.totalRecordsAffected).toBe(0);
    });

    // CF-20
    it('tables in local but not in remote', () => {
      const local = makeChanges('songs', [
        { id: '1', updated_at: now() },
      ], ['id']);
      const remote = new Map<string, EntityChanges>();

      const result = resolver.resolve(local, remote);
      expect(result.winners.has('songs')).toBe(true);
      expect(result.newLocalOnly).toBe(1);
    });

    // CF-21
    it('tables in remote but not in local', () => {
      const local = new Map<string, EntityChanges>();
      const remote = makeChanges('songs', [
        { id: '1', updated_at: now() },
      ], ['id']);

      const result = resolver.resolve(local, remote);
      expect(result.winners.has('songs')).toBe(true);
      expect(result.newRemoteOnly).toBe(1);
    });

    // CF-22
    it('record has null updated_at — treated as epoch 0', () => {
      const remoteTs = now();
      const local = makeChanges('songs', [
        { id: '1', updated_at: null },
      ], ['id']);
      const remote = makeChanges('songs', [
        { id: '1', updated_at: remoteTs },
      ], ['id']);

      const result = resolver.resolve(local, remote);
      const songs = result.winners.get('songs');
      // Remote should win (now > epoch 0)
      expect(songs!.rows[0].updated_at).toBe(remoteTs);
      expect(result.conflictsResolved).toBe(1);
    });
  });

  // ─── Orphan FK Resolution Tests ───────────────────────────────────

  describe('Orphan FK Resolution', () => {
    let db: ReturnType<typeof createMockDb>;

    beforeEach(() => {
      db = createMockDb();
    });

    // OR-01
    it('junction references soft-deleted song', async () => {
      db._tables.set('songs', [
        { id: 's1', name: 'Deleted', updated_at: now(), deleted_at: now() },
      ]);
      db._tables.set('song_artists', [
        { song_id: 's1', artist_id: 'a1', updated_at: now() },
      ]);
      db._tables.set('artists', [
        { id: 'a1', updated_at: now(), deleted_at: null },
      ]);

      db._tableInfo.set('songs', [
        { name: 'id', pk: 1 },
        { name: 'updated_at', pk: 0 },
        { name: 'deleted_at', pk: 0 },
      ]);
      db._tableInfo.set('song_artists', [
        { name: 'song_id', pk: 1 },
        { name: 'artist_id', pk: 2 },
        { name: 'updated_at', pk: 0 },
      ]);
      db._tableInfo.set('artists', [
        { name: 'id', pk: 1 },
        { name: 'updated_at', pk: 0 },
        { name: 'deleted_at', pk: 0 },
      ]);

      // Mock the orphan detection query
      db.query.mockImplementation(
        async (sql: string): Promise<unknown[]> => {
          if (sql.includes('LEFT JOIN') && sql.includes('songs')) {
            // Return orphan row
            return [{ song_id: 's1', artist_id: 'a1', updated_at: now() }];
          }
          if (sql.includes('sqlite_master') && sql.includes('updated_at')) {
            return [
              { name: 'songs' },
              { name: 'song_artists' },
              { name: 'artists' },
            ];
          }
          if (sql.includes('pragma_table_info') && sql.includes('pk > 0')) {
            const tableName = sql.match(/FROM '(\w+)'/)?.[1];
            if (tableName === 'songs') return [{ name: 'id', pk: 1 }];
            if (tableName === 'song_artists')
              return [
                { name: 'song_id', pk: 1 },
                { name: 'artist_id', pk: 2 },
              ];
            if (tableName === 'artists') return [{ name: 'id', pk: 1 }];
          }
          if (sql.includes("name = 'deleted_at'")) {
            const tableName = sql.match(/FROM '(\w+)'/)?.[1];
            if (tableName === 'songs' || tableName === 'artists')
              return [{ name: 'deleted_at' }];
            return [];
          }
          if (sql.includes('foreign_key_list')) {
            const tableName = sql.match(/foreign_key_list\("(\w+)"\)/)?.[1];
            if (tableName === 'song_artists') {
              return [
                { id: 1, seq: 0, table: 'songs', from: 'song_id', to: 'id' },
                {
                  id: 2,
                  seq: 0,
                  table: 'artists',
                  from: 'artist_id',
                  to: 'id',
                },
              ];
            }
          }
          return [];
        },
      );

      const resolver = new ConflictResolver();
      const report = await resolver.resolveOrphans(
        db as unknown as DatabaseConnection,
      );

      expect(report.orphansFound).toBe(1);
      expect(db._deletedRows.length + db._softDeletedRows.length).toBe(1);
    });

    // OR-02
    it('junction references soft-deleted artist', async () => {
      db._tables.set('artists', [
        { id: 'a1', updated_at: now(), deleted_at: now() },
      ]);
      db._tables.set('song_artists', [
        { song_id: 's1', artist_id: 'a1', updated_at: now() },
      ]);
      db._tables.set('songs', [
        { id: 's1', updated_at: now(), deleted_at: null },
      ]);

      db._tableInfo.set('artists', [
        { name: 'id', pk: 1 },
        { name: 'updated_at', pk: 0 },
        { name: 'deleted_at', pk: 0 },
      ]);
      db._tableInfo.set('song_artists', [
        { name: 'song_id', pk: 1 },
        { name: 'artist_id', pk: 2 },
        { name: 'updated_at', pk: 0 },
      ]);
      db._tableInfo.set('songs', [
        { name: 'id', pk: 1 },
        { name: 'updated_at', pk: 0 },
        { name: 'deleted_at', pk: 0 },
      ]);

      db.query.mockImplementation(
        async (sql: string): Promise<unknown[]> => {
          if (sql.includes('LEFT JOIN') && sql.includes('"artists"')) {
            return [{ song_id: 's1', artist_id: 'a1', updated_at: now() }];
          }
          if (sql.includes('LEFT JOIN') && sql.includes('"songs"')) {
            return []; // songs is not soft-deleted, no orphans
          }
          if (sql.includes('sqlite_master') && sql.includes('updated_at')) {
            return [
              { name: 'songs' },
              { name: 'song_artists' },
              { name: 'artists' },
            ];
          }
          if (sql.includes('pragma_table_info') && sql.includes('pk > 0')) {
            const tableName = sql.match(/FROM '(\w+)'/)?.[1];
            if (tableName === 'songs') return [{ name: 'id', pk: 1 }];
            if (tableName === 'song_artists')
              return [
                { name: 'song_id', pk: 1 },
                { name: 'artist_id', pk: 2 },
              ];
            if (tableName === 'artists') return [{ name: 'id', pk: 1 }];
          }
          if (sql.includes("name = 'deleted_at'")) {
            const tableName = sql.match(/FROM '(\w+)'/)?.[1];
            if (tableName === 'artists' || tableName === 'songs')
              return [{ name: 'deleted_at' }];
            return [];
          }
          if (sql.includes('foreign_key_list')) {
            const tableName = sql.match(/foreign_key_list\("(\w+)"\)/)?.[1];
            if (tableName === 'song_artists') {
              return [
                { id: 1, seq: 0, table: 'songs', from: 'song_id', to: 'id' },
                {
                  id: 2,
                  seq: 0,
                  table: 'artists',
                  from: 'artist_id',
                  to: 'id',
                },
              ];
            }
          }
          return [];
        },
      );

      const resolver = new ConflictResolver();
      const report = await resolver.resolveOrphans(
        db as unknown as DatabaseConnection,
      );

      expect(report.orphansFound).toBe(1);
      expect(db._deletedRows.length + db._softDeletedRows.length).toBe(1);
    });

    // OR-03
    it('no orphans → no deletions', async () => {
      db._tables.set('songs', [
        { id: 's1', updated_at: now(), deleted_at: null },
      ]);
      db._tables.set('song_artists', [
        { song_id: 's1', artist_id: 'a1', updated_at: now() },
      ]);
      db._tables.set('artists', [
        { id: 'a1', updated_at: now(), deleted_at: null },
      ]);

      db._tableInfo.set('songs', [
        { name: 'id', pk: 1 },
        { name: 'updated_at', pk: 0 },
        { name: 'deleted_at', pk: 0 },
      ]);
      db._tableInfo.set('song_artists', [
        { name: 'song_id', pk: 1 },
        { name: 'artist_id', pk: 2 },
        { name: 'updated_at', pk: 0 },
      ]);
      db._tableInfo.set('artists', [
        { name: 'id', pk: 1 },
        { name: 'updated_at', pk: 0 },
        { name: 'deleted_at', pk: 0 },
      ]);

      db.query.mockImplementation(
        async (sql: string): Promise<unknown[]> => {
          if (sql.includes('LEFT JOIN')) return []; // No orphans
          if (sql.includes('sqlite_master') && sql.includes('updated_at')) {
            return [
              { name: 'songs' },
              { name: 'song_artists' },
              { name: 'artists' },
            ];
          }
          if (sql.includes('pragma_table_info') && sql.includes('pk > 0')) {
            const tableName = sql.match(/FROM '(\w+)'/)?.[1];
            if (tableName === 'songs') return [{ name: 'id', pk: 1 }];
            if (tableName === 'song_artists')
              return [
                { name: 'song_id', pk: 1 },
                { name: 'artist_id', pk: 2 },
              ];
            if (tableName === 'artists') return [{ name: 'id', pk: 1 }];
          }
          if (sql.includes("name = 'deleted_at'")) {
            const tableName = sql.match(/FROM '(\w+)'/)?.[1];
            if (tableName === 'songs' || tableName === 'artists')
              return [{ name: 'deleted_at' }];
            return [];
          }
          if (sql.includes('foreign_key_list')) {
            const tableName = sql.match(/foreign_key_list\("(\w+)"\)/)?.[1];
            if (tableName === 'song_artists') {
              return [
                { id: 1, seq: 0, table: 'songs', from: 'song_id', to: 'id' },
                {
                  id: 2,
                  seq: 0,
                  table: 'artists',
                  from: 'artist_id',
                  to: 'id',
                },
              ];
            }
          }
          return [];
        },
      );

      const resolver = new ConflictResolver();
      const report = await resolver.resolveOrphans(
        db as unknown as DatabaseConnection,
      );

      expect(report.orphansFound).toBe(0);
      expect(report.details).toHaveLength(0);
    });

    // OR-06
    it('empty database (no entity tables)', async () => {
      db.query.mockImplementation(async (sql: string): Promise<unknown[]> => {
        if (sql.includes('sqlite_master') && sql.includes('updated_at')) {
          return []; // No entity tables
        }
        return [];
      });

      const resolver = new ConflictResolver();
      const report = await resolver.resolveOrphans(
        db as unknown as DatabaseConnection,
      );

      expect(report.orphansFound).toBe(0);
      expect(report.details).toHaveLength(0);
    });

    // OR-07
    it('FK check ignores infrastructure tables', async () => {
      // sync_log → devices FK exists but should be ignored
      db._tables.set('sync_log', [
        { id: 1, device_id: 'd1', updated_at: now() },
      ]);
      db._tables.set('devices', [{ id: 'd1', updated_at: now() }]);

      db._tableInfo.set('sync_log', [
        { name: 'id', pk: 1 },
        { name: 'device_id', pk: 0 },
        { name: 'updated_at', pk: 0 },
      ]);
      db._tableInfo.set('devices', [
        { name: 'id', pk: 1 },
        { name: 'updated_at', pk: 0 },
      ]);

      db.query.mockImplementation(
        async (sql: string): Promise<unknown[]> => {
          if (sql.includes('sqlite_master') && sql.includes('updated_at')) {
            return [{ name: 'sync_log' }];
          }
          if (sql.includes('pragma_table_info') && sql.includes('pk > 0')) {
            return [{ name: 'id', pk: 1 }];
          }
          if (sql.includes("name = 'deleted_at'")) return [];
          if (sql.includes('foreign_key_list')) {
            return [
              {
                id: 1,
                seq: 0,
                table: 'devices',
                from: 'device_id',
                to: 'id',
              },
            ];
          }
          return [];
        },
      );

      const resolver = new ConflictResolver();
      const report = await resolver.resolveOrphans(
        db as unknown as DatabaseConnection,
      );

      // devices is infrastructure — should be ignored
      expect(report.orphansFound).toBe(0);
    });

    // OR-08
    it('FK check ignores reference tables', async () => {
      // songs → languages FK exists but should be ignored
      db._tables.set('songs', [
        { id: 's1', language_id: 1, updated_at: now(), deleted_at: null },
      ]);
      db._tables.set('languages', [{ id: 1, updated_at: now() }]);

      db._tableInfo.set('songs', [
        { name: 'id', pk: 1 },
        { name: 'language_id', pk: 0 },
        { name: 'updated_at', pk: 0 },
        { name: 'deleted_at', pk: 0 },
      ]);
      db._tableInfo.set('languages', [
        { name: 'id', pk: 1 },
        { name: 'updated_at', pk: 0 },
      ]);

      db.query.mockImplementation(
        async (sql: string): Promise<unknown[]> => {
          if (sql.includes('sqlite_master') && sql.includes('updated_at')) {
            return [{ name: 'songs' }];
          }
          if (sql.includes('pragma_table_info') && sql.includes('pk > 0')) {
            return [{ name: 'id', pk: 1 }];
          }
          if (sql.includes("name = 'deleted_at'"))
            return [{ name: 'deleted_at' }];
          if (sql.includes('foreign_key_list')) {
            return [
              {
                id: 1,
                seq: 0,
                table: 'languages',
                from: 'language_id',
                to: 'id',
              },
            ];
          }
          return [];
        },
      );

      const resolver = new ConflictResolver();
      const report = await resolver.resolveOrphans(
        db as unknown as DatabaseConnection,
      );

      // languages is a reference table — should be ignored
      expect(report.orphansFound).toBe(0);
    });
  });
});
