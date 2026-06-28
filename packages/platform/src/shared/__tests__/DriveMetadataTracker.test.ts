import type { DatabaseConnection } from '@collectio/shared';
import { DriveMetadataTracker } from '../DriveMetadataTracker.js';

function createMockDb(initialData?: Map<string, string>) {
  const data = new Map(initialData ?? []);

  const mockExecute = jest.fn(async (sql: string, params?: unknown[]) => {
    if (sql.startsWith('INSERT')) {
      const key = sql.includes('cloud_file_id') ? 'cloud_file_id' : 'cloud_modified_time';
      data.set(key, params?.[0] as string ?? '');
    }
    if (sql.startsWith('DELETE')) {
      data.delete('cloud_file_id');
      data.delete('cloud_modified_time');
    }
  });

  const mockQuery = jest.fn(async <T>(sql: string): Promise<T[]> => {
    if (sql.includes('cloud_file_id')) {
      const value = data.get('cloud_file_id');
      return (value ? [{ value }] : []) as T[];
    }
    if (sql.includes('cloud_modified_time')) {
      const value = data.get('cloud_modified_time');
      return (value ? [{ value }] : []) as T[];
    }
    return [] as T[];
  });

  const mockTransaction = jest.fn(async <T>(fn: (tx: DatabaseConnection) => Promise<T>): Promise<T> => {
    return fn({ execute: mockExecute, query: mockQuery } as unknown as DatabaseConnection);
  });

  return {
    db: {
      execute: mockExecute,
      query: mockQuery,
      transaction: mockTransaction,
    } as unknown as DatabaseConnection,
    data,
    mockExecute,
    mockQuery,
    mockTransaction,
  };
}

describe('DriveMetadataTracker', () => {
  // MT-01
  it('getCloudFileId() returns stored value', async () => {
    const { db } = createMockDb(new Map([['cloud_file_id', 'abc123']]));

    const tracker = new DriveMetadataTracker(db);
    const result = await tracker.getCloudFileId();

    expect(result).toBe('abc123');
  });

  // MT-02
  it('getCloudFileId() returns null when not stored', async () => {
    const { db } = createMockDb();

    const tracker = new DriveMetadataTracker(db);
    const result = await tracker.getCloudFileId();

    expect(result).toBeNull();
  });

  // MT-03
  it('getCloudModifiedTime() returns stored value', async () => {
    const { db } = createMockDb(new Map([['cloud_modified_time', '2026-01-01T00:00:00Z']]));

    const tracker = new DriveMetadataTracker(db);
    const result = await tracker.getCloudModifiedTime();

    expect(result).toBe('2026-01-01T00:00:00Z');
  });

  // MT-04
  it('setCloudFileMetadata() writes both keys', async () => {
    const { db, data } = createMockDb();

    const tracker = new DriveMetadataTracker(db);
    await tracker.setCloudFileMetadata('xyz', '2026-02-02');

    expect(data.get('cloud_file_id')).toBe('xyz');
    expect(data.get('cloud_modified_time')).toBe('2026-02-02');
  });

  // MT-05
  it('setCloudFileMetadata() overwrites existing values', async () => {
    const { db, data } = createMockDb(new Map([
      ['cloud_file_id', 'old-id'],
      ['cloud_modified_time', 'old-time'],
    ]));

    const tracker = new DriveMetadataTracker(db);
    await tracker.setCloudFileMetadata('new-id', 'new-time');

    expect(data.get('cloud_file_id')).toBe('new-id');
    expect(data.get('cloud_modified_time')).toBe('new-time');
  });

  // MT-06
  it('clearCloudFileMetadata() removes both keys', async () => {
    const { db, data } = createMockDb(new Map([
      ['cloud_file_id', 'abc123'],
      ['cloud_modified_time', '2026-01-01T00:00:00Z'],
    ]));

    const tracker = new DriveMetadataTracker(db);
    await tracker.clearCloudFileMetadata();

    expect(data.has('cloud_file_id')).toBe(false);
    expect(data.has('cloud_modified_time')).toBe(false);
  });

  // MT-07
  it('clearCloudFileMetadata() is idempotent', async () => {
    const { db } = createMockDb();

    const tracker = new DriveMetadataTracker(db);

    await expect(tracker.clearCloudFileMetadata()).resolves.toBeUndefined();
    await expect(tracker.clearCloudFileMetadata()).resolves.toBeUndefined();
  });
});
