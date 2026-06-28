import type { DatabaseConnection } from '../../../data/database/DatabaseConnection.js';
import { ChangeTracker } from '../ChangeTracker.js';

function createMockDb() {
  const tables = new Map<string, Array<Record<string, unknown>>>();
  // Table schemas: name -> [{name, pk}] for pragma_table_info
  const tableInfo = new Map<string, Array<{ name: string; pk: number }>>();

  const queryFn = jest.fn(
    async (sql: string, params?: unknown[]): Promise<unknown[]> => {
      // Table discovery (sqlite_master + updated_at)
      if (sql.includes('sqlite_master') && sql.includes('updated_at')) {
        const results: { name: string }[] = [];
        for (const [name, rows] of tables) {
          if (rows.length > 0 && 'updated_at' in rows[0]) {
            results.push({ name });
          } else if (rows.length === 0) {
            // Check tableInfo for schema-only tables
            if (tableInfo.has(name)) {
              const info = tableInfo.get(name)!;
              if (info.some((c) => c.name === 'updated_at')) {
                results.push({ name });
              }
            }
          }
        }
        return results;
      }

      // PK column discovery: pragma_table_info with pk > 0
      if (sql.includes('pragma_table_info') && sql.includes('pk > 0')) {
        const tableName = sql.match(/pragma_table_info\('(\w+)'\)/)?.[1];
        if (!tableName) return [];
        const info = tableInfo.get(tableName) ?? [];
        return info.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk);
      }

      // SELECT * FROM table (no WHERE)
      if (sql.startsWith('SELECT * FROM') && !sql.includes('WHERE')) {
        const tableName = sql.match(/FROM "(\w+)"/)?.[1];
        if (!tableName) return [];
        return tables.get(tableName) ?? [];
      }

      // SELECT * FROM table WHERE updated_at > ?
      if (sql.includes('WHERE updated_at > ?')) {
        const tableName = sql.match(/FROM "(\w+)"/)?.[1];
        if (!tableName) return [];
        const rows = tables.get(tableName) ?? [];
        const cutoff = params?.[0] as string;
        return rows.filter((r) => (r.updated_at as string) > cutoff);
      }

      return [];
    },
  );

  return {
    _tables: tables,
    _tableInfo: tableInfo,
    open: jest.fn(),
    close: jest.fn(),
    execute: jest.fn(),
    query: queryFn as unknown as DatabaseConnection['query'],
    transaction: jest.fn(),
    serialize: jest.fn().mockResolvedValue(new Uint8Array(0)),
  } as {
    _tables: typeof tables;
    _tableInfo: typeof tableInfo;
    open: jest.Mock;
    close: jest.Mock;
    execute: jest.Mock;
    query: jest.Mock;
    transaction: jest.Mock;
    serialize: jest.Mock;
  };
}

function createSecondMockDb() {
  // Separate DB instance for remote changes tests
  return createMockDb();
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

describe('ChangeTracker', () => {
  let db: ReturnType<typeof createMockDb>;
  let tracker: ChangeTracker;

  beforeEach(() => {
    db = createMockDb();
    tracker = new ChangeTracker(db as unknown as DatabaseConnection);
  });

  // CT-01
  it('getLocalChanges() returns empty set when no changes exist', async () => {
    db._tables.set('songs', [
      { id: '1', name: 'Song A', updated_at: timeAgo(100_000) },
    ]);
    db._tableInfo.set('songs', [
      { name: 'id', pk: 1 },
      { name: 'name', pk: 0 },
      { name: 'updated_at', pk: 0 },
    ]);

    const result = await tracker.getLocalChanges(now());
    const songs = result.get('songs');
    expect(songs).toBeDefined();
    expect(songs!.rows).toHaveLength(0);
  });

  // CT-02
  it('getLocalChanges() returns changed rows', async () => {
    db._tables.set('songs', [
      { id: '1', name: 'A', updated_at: timeFromNow(1000) },
      { id: '2', name: 'B', updated_at: timeFromNow(2000) },
      { id: '3', name: 'C', updated_at: timeFromNow(3000) },
    ]);
    db._tableInfo.set('songs', [
      { name: 'id', pk: 1 },
      { name: 'name', pk: 0 },
      { name: 'updated_at', pk: 0 },
    ]);

    const result = await tracker.getLocalChanges(timeAgo(100));
    const songs = result.get('songs');
    expect(songs).toBeDefined();
    expect(songs!.rows).toHaveLength(3);
  });

  // CT-03
  it('getLocalChanges() returns all rows when lastSyncTime is null', async () => {
    db._tables.set('songs', [
      { id: '1', updated_at: timeAgo(5000) },
      { id: '2', updated_at: timeAgo(3000) },
      { id: '3', updated_at: timeAgo(1000) },
    ]);
    db._tableInfo.set('songs', [
      { name: 'id', pk: 1 },
      { name: 'updated_at', pk: 0 },
    ]);

    const result = await tracker.getLocalChanges(null);
    const songs = result.get('songs');
    expect(songs).toBeDefined();
    expect(songs!.rows).toHaveLength(3);
  });

  // CT-04
  it('getLocalChanges() discovers entity tables dynamically', async () => {
    db._tables.set('artists', [{ id: '1', updated_at: now() }]);
    db._tables.set('songs', [{ id: '1', updated_at: now() }]);
    db._tables.set('song_artists', [
      { song_id: 's1', artist_id: 'a1', updated_at: now() },
    ]);
    db._tables.set('app_settings', [
      { key: 'theme', updated_at: now() },
    ]);

    db._tableInfo.set('artists', [
      { name: 'id', pk: 1 },
      { name: 'updated_at', pk: 0 },
    ]);
    db._tableInfo.set('songs', [
      { name: 'id', pk: 1 },
      { name: 'updated_at', pk: 0 },
    ]);
    db._tableInfo.set('song_artists', [
      { name: 'song_id', pk: 1 },
      { name: 'artist_id', pk: 2 },
      { name: 'updated_at', pk: 0 },
    ]);
    db._tableInfo.set('app_settings', [
      { name: 'key', pk: 1 },
      { name: 'updated_at', pk: 0 },
    ]);

    const result = await tracker.getLocalChanges(null);
    expect(result.has('artists')).toBe(true);
    expect(result.has('songs')).toBe(true);
    expect(result.has('song_artists')).toBe(true);
    expect(result.has('app_settings')).toBe(true);
  });

  // CT-05
  it('getLocalChanges() excludes tables without updated_at', async () => {
    db._tables.set('app_metadata', [
      { key: 'schema_version', value: '1' },
    ]);
    db._tables.set('songs', [{ id: '1', updated_at: now() }]);
    db._tableInfo.set('songs', [
      { name: 'id', pk: 1 },
      { name: 'updated_at', pk: 0 },
    ]);

    const result = await tracker.getLocalChanges(null);
    expect(result.has('app_metadata')).toBe(false);
    expect(result.has('songs')).toBe(true);
  });

  // CT-06
  it('getLocalChanges() discovers PK columns correctly', async () => {
    db._tables.set('artists', [{ id: '1', updated_at: now() }]);
    db._tableInfo.set('artists', [
      { name: 'id', pk: 1 },
      { name: 'display_name', pk: 0 },
      { name: 'updated_at', pk: 0 },
    ]);

    const result = await tracker.getLocalChanges(null);
    const artists = result.get('artists');
    expect(artists).toBeDefined();
    expect(artists!.schema.primaryKeyColumns).toEqual(['id']);
  });

  // CT-07
  it('composite PK discovery', async () => {
    db._tables.set('song_artists', [
      { song_id: 's1', artist_id: 'a1', updated_at: now() },
    ]);
    db._tableInfo.set('song_artists', [
      { name: 'song_id', pk: 1 },
      { name: 'artist_id', pk: 2 },
      { name: 'updated_at', pk: 0 },
    ]);

    const result = await tracker.getLocalChanges(null);
    const sa = result.get('song_artists');
    expect(sa).toBeDefined();
    expect(sa!.schema.primaryKeyColumns).toEqual(['song_id', 'artist_id']);
  });

  // CT-08
  it('getLocalChanges() returns rows from multiple tables', async () => {
    db._tables.set('songs', [
      { id: '1', updated_at: timeFromNow(1000) },
      { id: '2', updated_at: timeFromNow(2000) },
    ]);
    db._tables.set('artists', [
      { id: '1', updated_at: timeFromNow(1500) },
    ]);
    db._tables.set('song_artists', [
      { song_id: 's1', artist_id: 'a1', updated_at: timeFromNow(500) },
    ]);

    db._tableInfo.set('songs', [
      { name: 'id', pk: 1 },
      { name: 'updated_at', pk: 0 },
    ]);
    db._tableInfo.set('artists', [
      { name: 'id', pk: 1 },
      { name: 'updated_at', pk: 0 },
    ]);
    db._tableInfo.set('song_artists', [
      { name: 'song_id', pk: 1 },
      { name: 'artist_id', pk: 2 },
      { name: 'updated_at', pk: 0 },
    ]);

    const result = await tracker.getLocalChanges(timeAgo(100));
    expect(result.get('songs')!.rows).toHaveLength(2);
    expect(result.get('artists')!.rows).toHaveLength(1);
    expect(result.get('song_artists')!.rows).toHaveLength(1);
  });

  // CT-09
  it('getRemoteChanges() queries the passed DB connection', async () => {
    const remoteDb = createSecondMockDb();
    remoteDb._tables.set('songs', [
      { id: '10', name: 'Remote Song', updated_at: timeFromNow(5000) },
    ]);
    remoteDb._tableInfo.set('songs', [
      { name: 'id', pk: 1 },
      { name: 'name', pk: 0 },
      { name: 'updated_at', pk: 0 },
    ]);

    // Local DB has different data
    db._tables.set('songs', [
      { id: '1', name: 'Local Song', updated_at: timeFromNow(1000) },
    ]);
    db._tableInfo.set('songs', [
      { name: 'id', pk: 1 },
      { name: 'name', pk: 0 },
      { name: 'updated_at', pk: 0 },
    ]);

    const result = await tracker.getRemoteChanges(
      remoteDb as unknown as DatabaseConnection,
      timeAgo(100),
    );
    const songs = result.get('songs');
    expect(songs).toBeDefined();
    expect(songs!.rows).toHaveLength(1);
    expect(songs!.rows[0].name).toBe('Remote Song');
  });

  // CT-10
  it('getRemoteChanges() works with empty remote DB', async () => {
    const remoteDb = createSecondMockDb();
    remoteDb._tables.set('songs', []);
    remoteDb._tableInfo.set('songs', [
      { name: 'id', pk: 1 },
      { name: 'updated_at', pk: 0 },
    ]);

    const result = await tracker.getRemoteChanges(
      remoteDb as unknown as DatabaseConnection,
      null,
    );
    // Table exists in ChangeSet with empty rows
    expect(result.size).toBe(1);
    expect(result.get('songs')!.rows).toHaveLength(0);
  });

  // CT-11
  it('table schema cache works (same tables, single discovery)', async () => {
    db._tables.set('songs', [{ id: '1', updated_at: now() }]);
    db._tableInfo.set('songs', [
      { name: 'id', pk: 1 },
      { name: 'updated_at', pk: 0 },
    ]);

    await tracker.getLocalChanges(null);
    await tracker.getLocalChanges(null);

    // Table discovery query runs per-call (no caching — M4 fix)
    const discoveryCalls = db.query.mock.calls.filter(
      (call: unknown[]) =>
        Array.isArray(call) &&
        typeof call[0] === 'string' &&
        call[0].includes('sqlite_master'),
    );
    expect(discoveryCalls).toHaveLength(2);
  });

  // CT-12
  it('row includes all columns', async () => {
    db._tables.set('songs', [
      {
        id: '1',
        name: 'Test',
        album_name: 'Album',
        language_id: 1,
        updated_at: now(),
        deleted_at: null,
      },
    ]);
    db._tableInfo.set('songs', [
      { name: 'id', pk: 1 },
      { name: 'name', pk: 0 },
      { name: 'album_name', pk: 0 },
      { name: 'language_id', pk: 0 },
      { name: 'updated_at', pk: 0 },
      { name: 'deleted_at', pk: 0 },
    ]);

    const result = await tracker.getLocalChanges(null);
    const songs = result.get('songs');
    expect(songs).toBeDefined();
    expect(songs!.rows[0]).toHaveProperty('id', '1');
    expect(songs!.rows[0]).toHaveProperty('name', 'Test');
    expect(songs!.rows[0]).toHaveProperty('album_name', 'Album');
    expect(songs!.rows[0]).toHaveProperty('language_id', 1);
    expect(songs!.rows[0]).toHaveProperty('updated_at');
    expect(songs!.rows[0]).toHaveProperty('deleted_at', null);
  });

  // CT-13
  it('app_settings table discovered and queried', async () => {
    db._tables.set('app_settings', [
      { key: 'theme', value: 'dark', updated_at: timeFromNow(1000) },
    ]);
    db._tableInfo.set('app_settings', [
      { name: 'key', pk: 1 },
      { name: 'value', pk: 0 },
      { name: 'updated_at', pk: 0 },
    ]);

    const result = await tracker.getLocalChanges(timeAgo(100));
    const settings = result.get('app_settings');
    expect(settings).toBeDefined();
    expect(settings!.rows).toHaveLength(1);
    expect(settings!.rows[0].key).toBe('theme');
    expect(settings!.schema.primaryKeyColumns).toEqual(['key']);
  });
});
