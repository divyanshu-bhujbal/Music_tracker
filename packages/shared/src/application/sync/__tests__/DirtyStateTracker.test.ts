import type { DatabaseConnection } from '../../../data/database/DatabaseConnection.js';
import { DirtyStateTracker } from '../DirtyStateTracker.js';

function createMockDb() {
  const tables = new Map<string, Array<Record<string, unknown>>>();
  const metadata = new Map<string, string>();

  const queryFn = jest.fn(async (sql: string, params?: unknown[]): Promise<unknown[]> => {
      // Table discovery
      if (sql.includes('sqlite_master') && sql.includes('updated_at')) {
        const results: { name: string }[] = [];
        for (const [name, rows] of tables) {
          if (rows.length > 0 && 'updated_at' in rows[0]) {
            results.push({ name });
          }
        }
        return results;
      }

      // last_successful_sync
      if (sql.includes("key = 'last_successful_sync'")) {
        const val = metadata.get('last_successful_sync');
        return val !== undefined ? [{ value: val }] : [];
      }

      // MAX(updated_at) — outer query
      if (sql.includes('SELECT MAX(updated_at) AS updated_at FROM (')) {
        // Find the max updated_at across all tables in the _tables map
        let maxTs: string | null = null;
        for (const [, rows] of tables) {
          for (const row of rows) {
            const ts = row.updated_at as string | undefined;
            if (ts && (maxTs === null || ts > maxTs)) {
              maxTs = ts;
            }
          }
        }
        return [{ updated_at: maxTs }];
      }

      // COUNT(*) with WHERE
      if (sql.includes('COUNT(*)') && sql.includes('WHERE updated_at > ?')) {
        const tableName = sql.match(/FROM "(\w+)"/)?.[1];
        if (!tableName) return [{ count: 0 }];
        const rows = tables.get(tableName) ?? [];
        const cutoff = params?.[0] as string;
        const count = rows.filter((r) => (r.updated_at as string) > cutoff).length;
        return [{ count }];
      }

      // COUNT(*) without WHERE
      if (sql.includes('COUNT(*)') && !sql.includes('WHERE')) {
        const tableName = sql.match(/FROM "(\w+)"/)?.[1];
        if (!tableName) return [{ count: 0 }];
        return [{ count: (tables.get(tableName) ?? []).length }];
      }

      return [];
    });

  const db = {
    _tables: tables,
    _metadata: metadata,
    open: jest.fn(),
    close: jest.fn(),
    execute: jest.fn(),
    query: queryFn as unknown as DatabaseConnection['query'],
    transaction: jest.fn(),
    serialize: jest.fn().mockResolvedValue(new Uint8Array(0)),
  };

  return db;
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

describe('DirtyStateTracker', () => {
  let db: ReturnType<typeof createMockDb>;
  let tracker: DirtyStateTracker;

  beforeEach(() => {
    db = createMockDb();
    tracker = new DirtyStateTracker(db as unknown as DatabaseConnection);
  });

  // DT-01
  it('isDirty() returns false when no changes exist', async () => {
    db._tables.set('songs', [
      { id: '1', updated_at: timeAgo(100_000) },
      { id: '2', updated_at: timeAgo(50_000) },
    ]);
    db._metadata.set('last_successful_sync', now());

    const result = await tracker.isDirty();
    expect(result).toBe(false);
  });

  // DT-02
  it('isDirty() returns true when change exists', async () => {
    db._tables.set('songs', [
      { id: '1', updated_at: timeFromNow(100_000) },
    ]);
    db._metadata.set('last_successful_sync', now());

    const result = await tracker.isDirty();
    expect(result).toBe(true);
  });

  // DT-03
  it('isDirty() returns true when last_successful_sync is null', async () => {
    db._tables.set('songs', [
      { id: '1', updated_at: now() },
    ]);

    const result = await tracker.isDirty();
    expect(result).toBe(true);
  });

  // DT-04
  it('isDirty() returns false when no entity tables exist', async () => {
    // No tables in the mock
    const result = await tracker.isDirty();
    expect(result).toBe(false);
  });

  // DT-05
  it('getPendingCount() returns 0 when no pending changes', async () => {
    db._tables.set('songs', [
      { id: '1', updated_at: timeAgo(100_000) },
      { id: '2', updated_at: timeAgo(50_000) },
    ]);
    db._metadata.set('last_successful_sync', now());

    const result = await tracker.getPendingCount();
    expect(result).toBe(0);
  });

  // DT-06
  it('getPendingCount() returns correct count across multiple tables', async () => {
    const syncTime = timeAgo(10_000);
    db._tables.set('songs', [
      { id: '1', updated_at: timeFromNow(1000) },
      { id: '2', updated_at: timeFromNow(2000) },
      { id: '3', updated_at: timeFromNow(3000) },
    ]);
    db._tables.set('artists', [
      { id: '1', updated_at: timeFromNow(1000) },
      { id: '2', updated_at: timeFromNow(2000) },
    ]);
    db._tables.set('song_artists', [
      { id: '1', updated_at: timeFromNow(1000) },
    ]);
    db._metadata.set('last_successful_sync', syncTime);

    const result = await tracker.getPendingCount();
    expect(result).toBe(6);
  });

  // DT-07
  it('getPendingCount() counts app_settings changes', async () => {
    const syncTime = timeAgo(10_000);
    db._tables.set('app_settings', [
      { key: 'theme', updated_at: timeFromNow(1000) },
    ]);
    db._metadata.set('last_successful_sync', syncTime);

    const result = await tracker.getPendingCount();
    expect(result).toBe(1);
  });

  // DT-08
  it('getLatestChange() returns newest timestamp', async () => {
    const t1 = timeFromNow(10_000);
    const t2 = timeFromNow(50_000);
    const t3 = timeFromNow(30_000);
    db._tables.set('songs', [{ updated_at: t1 }]);
    db._tables.set('artists', [{ updated_at: t2 }]);
    db._tables.set('song_artists', [{ updated_at: t3 }]);

    const result = await tracker.getLatestChange();
    expect(result).toBe(t2);
  });

  // DT-09
  it('getLatestChange() returns null when no tables exist', async () => {
    const result = await tracker.getLatestChange();
    expect(result).toBeNull();
  });

  // DT-10
  it('table discovery finds all entity tables with updated_at', async () => {
    db._tables.set('artists', [{ id: '1', updated_at: now() }]);
    db._tables.set('songs', [{ id: '1', updated_at: now() }]);
    db._tables.set('song_artists', [{ id: '1', updated_at: now() }]);
    db._tables.set('app_settings', [{ key: 'theme', updated_at: now() }]);

    const tables = await (tracker as unknown as { getEntityTables(): Promise<string[]> }).getEntityTables();
    expect(tables).toContain('artists');
    expect(tables).toContain('songs');
    expect(tables).toContain('song_artists');
    expect(tables).toContain('app_settings');
  });

  // DT-11
  it('table discovery excludes infrastructure tables without updated_at', async () => {
    db._tables.set('app_metadata', [{ key: 'schema_version', value: '1' }]);
    db._tables.set('devices', [{ id: '1', name: 'test' }]);
    db._tables.set('sync_log', [{ id: 1 }]);
    db._tables.set('songs', [{ id: '1', updated_at: now() }]);

    const tables = await (tracker as unknown as { getEntityTables(): Promise<string[]> }).getEntityTables();
    expect(tables).not.toContain('app_metadata');
    expect(tables).not.toContain('devices');
    expect(tables).not.toContain('sync_log');
    expect(tables).toContain('songs');
  });
});
