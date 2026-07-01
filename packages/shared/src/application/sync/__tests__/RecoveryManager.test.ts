import type { DatabaseConnection } from '../../../data/database/DatabaseConnection.js';
import type { EncryptedFileFormat } from '../../../data/database/EncryptedFileFormat.js';
import type { AppMetadataRepository } from '../../../data/repositories/AppMetadataRepository.js';
import type { CloudStorageProvider } from '../../../domain/interfaces/CloudStorageProvider.js';
import { CloudStorageError } from '../../../domain/errors/CloudStorageError.js';
import { AuthenticationError } from '../../../domain/errors/AuthenticationError.js';
import { DatabaseError } from '../../../data/database/DatabaseError.js';
import { DatabaseIntegrityCheck } from '../../../data/database/DatabaseIntegrityCheck.js';
import { RecoveryManager } from '../RecoveryManager.js';

function createMockDb(healthy = true): DatabaseConnection {
  return {
    open: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    execute: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockImplementation(async <T>(sql: string): Promise<T[]> => {
      if (sql.includes('PRAGMA integrity_check')) {
        return [{ integrity_check: healthy ? 'ok' : 'corrupt' }] as T[];
      }
      if (sql.includes('PRAGMA foreign_key_check')) {
        return [] as T[];
      }
      return [] as T[];
    }),
    transaction: jest.fn().mockImplementation(
      async <R>(fn: (db: DatabaseConnection) => Promise<R>): Promise<R> => {
        return fn(createMockDb(healthy));
      },
    ),
    serialize: jest.fn().mockResolvedValue(new Uint8Array(0)),
  };
}

function createMockAppMetadataRepo(
  values: Record<string, string | null> = {},
): AppMetadataRepository {
  const store = { ...values };
  return {
    get: jest.fn().mockImplementation(async (key: string) => store[key] ?? null),
    set: jest.fn().mockImplementation(async (key: string, value: string) => {
      store[key] = value;
    }),
    getAll: jest.fn().mockResolvedValue(store),
    has: jest.fn().mockImplementation(async (key: string) => store[key] !== undefined),
  } as unknown as AppMetadataRepository;
}

function createMockCloudProvider(
  downloadResult?: { data: Uint8Array; modifiedTime: string },
  downloadError?: Error,
): CloudStorageProvider {
  return {
    upload: jest.fn().mockResolvedValue({ fileId: 'file1', modifiedTime: '' }),
    download: jest.fn().mockImplementation(async () => {
      if (downloadError) throw downloadError;
      return downloadResult ?? { data: new Uint8Array(0), modifiedTime: '' };
    }),
    list: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockEncryptedFileFormat(
  unpackResult?: { database: Uint8Array; salt: Uint8Array },
  unpackError?: Error,
): EncryptedFileFormat {
  return {
    pack: jest.fn(),
    unpack: jest.fn().mockImplementation(async () => {
      if (unpackError) throw unpackError;
      return unpackResult ?? {
        database: new Uint8Array([1, 2, 3]),
        salt: new Uint8Array(32).fill(0xaa),
      };
    }),
  } as unknown as EncryptedFileFormat;
}

describe('RecoveryManager', () => {
  describe('RM-01: healthy DB → returns HEALTHY', () => {
    it('returns HEALTHY without making cloud calls', async () => {
      const db = createMockDb();
      // Override to return healthy
      const healthyCheck = new DatabaseIntegrityCheck(db);
      jest.spyOn(healthyCheck, 'check').mockResolvedValue({
        healthy: true,
        integrityResult: 'ok',
        foreignKeyViolations: 0,
        foreignKeyDetails: '',
        checkedAt: new Date().toISOString(),
      });

      const manager = new RecoveryManager({
        integrityCheck: healthyCheck,
        cloudStorageProvider: createMockCloudProvider(),
        encryptedFileFormat: createMockEncryptedFileFormat(),
        appMetadataRepo: createMockAppMetadataRepo(),
        getDerivedKey: jest.fn(),
        openInMemoryDb: jest.fn(),
        replaceLocalDb: jest.fn(),
        isOnline: jest.fn(),
      });

      const result = await manager.recover();

      expect(result.status).toBe('HEALTHY');
    });
  });

  describe('RM-02: no cloud backup → returns NO_CLOUD_BACKUP', () => {
    it('returns NO_CLOUD_BACKUP when cloud_file_id is null', async () => {
      const db = createMockDb();
      const integrityCheck = new DatabaseIntegrityCheck(db);
      jest.spyOn(integrityCheck, 'check').mockResolvedValue({
        healthy: false,
        integrityResult: 'corrupt',
        foreignKeyViolations: 0,
        foreignKeyDetails: '',
        checkedAt: new Date().toISOString(),
      });

      const manager = new RecoveryManager({
        integrityCheck,
        cloudStorageProvider: createMockCloudProvider(),
        encryptedFileFormat: createMockEncryptedFileFormat(),
        appMetadataRepo: createMockAppMetadataRepo({ cloud_file_id: null }),
        getDerivedKey: jest.fn(),
        openInMemoryDb: jest.fn(),
        replaceLocalDb: jest.fn(),
        isOnline: jest.fn(),
      });

      const result = await manager.recover();

      expect(result.status).toBe('NO_CLOUD_BACKUP');
      expect(result.reason).toContain('No cloud backup available');
    });
  });

  describe('RM-03: offline → returns FAILED', () => {
    it('returns FAILED with offline reason', async () => {
      const db = createMockDb();
      const integrityCheck = new DatabaseIntegrityCheck(db);
      jest.spyOn(integrityCheck, 'check').mockResolvedValue({
        healthy: false,
        integrityResult: 'corrupt',
        foreignKeyViolations: 0,
        foreignKeyDetails: '',
        checkedAt: new Date().toISOString(),
      });

      const manager = new RecoveryManager({
        integrityCheck,
        cloudStorageProvider: createMockCloudProvider(),
        encryptedFileFormat: createMockEncryptedFileFormat(),
        appMetadataRepo: createMockAppMetadataRepo({ cloud_file_id: 'abc' }),
        getDerivedKey: jest.fn(),
        openInMemoryDb: jest.fn(),
        replaceLocalDb: jest.fn(),
        isOnline: () => false,
      });

      const result = await manager.recover();

      expect(result.status).toBe('FAILED');
      expect(result.reason).toContain('Offline');
    });
  });

  describe('RM-04: download fails → returns FAILED', () => {
    it('returns FAILED with download error message', async () => {
      const db = createMockDb();
      const integrityCheck = new DatabaseIntegrityCheck(db);
      jest.spyOn(integrityCheck, 'check').mockResolvedValue({
        healthy: false,
        integrityResult: 'corrupt',
        foreignKeyViolations: 0,
        foreignKeyDetails: '',
        checkedAt: new Date().toISOString(),
      });

      const manager = new RecoveryManager({
        integrityCheck,
        cloudStorageProvider: createMockCloudProvider(
          undefined,
          new CloudStorageError('NETWORK', 'Network error'),
        ),
        encryptedFileFormat: createMockEncryptedFileFormat(),
        appMetadataRepo: createMockAppMetadataRepo({ cloud_file_id: 'abc' }),
        getDerivedKey: jest.fn(),
        openInMemoryDb: jest.fn(),
        replaceLocalDb: jest.fn(),
        isOnline: () => true,
      });

      const result = await manager.recover();

      expect(result.status).toBe('FAILED');
      expect(result.reason).toContain('Failed to download');
    });
  });

  describe('RM-05: download 404 → returns FAILED', () => {
    it('returns FAILED for NOT_FOUND error', async () => {
      const db = createMockDb();
      const integrityCheck = new DatabaseIntegrityCheck(db);
      jest.spyOn(integrityCheck, 'check').mockResolvedValue({
        healthy: false,
        integrityResult: 'corrupt',
        foreignKeyViolations: 0,
        foreignKeyDetails: '',
        checkedAt: new Date().toISOString(),
      });

      const manager = new RecoveryManager({
        integrityCheck,
        cloudStorageProvider: createMockCloudProvider(
          undefined,
          new CloudStorageError('NOT_FOUND', 'File not found'),
        ),
        encryptedFileFormat: createMockEncryptedFileFormat(),
        appMetadataRepo: createMockAppMetadataRepo({ cloud_file_id: 'abc' }),
        getDerivedKey: jest.fn(),
        openInMemoryDb: jest.fn(),
        replaceLocalDb: jest.fn(),
        isOnline: () => true,
      });

      const result = await manager.recover();

      expect(result.status).toBe('FAILED');
    });
  });

  describe('RM-06: no derived key → returns FAILED', () => {
    it('returns FAILED with missing key reason', async () => {
      const db = createMockDb();
      const integrityCheck = new DatabaseIntegrityCheck(db);
      jest.spyOn(integrityCheck, 'check').mockResolvedValue({
        healthy: false,
        integrityResult: 'corrupt',
        foreignKeyViolations: 0,
        foreignKeyDetails: '',
        checkedAt: new Date().toISOString(),
      });

      const manager = new RecoveryManager({
        integrityCheck,
        cloudStorageProvider: createMockCloudProvider(),
        encryptedFileFormat: createMockEncryptedFileFormat(),
        appMetadataRepo: createMockAppMetadataRepo({ cloud_file_id: 'abc' }),
        getDerivedKey: async () => null,
        openInMemoryDb: jest.fn(),
        replaceLocalDb: jest.fn(),
        isOnline: () => true,
      });

      const result = await manager.recover();

      expect(result.status).toBe('FAILED');
      expect(result.reason).toContain('No derived key');
    });
  });

  describe('RM-07: decrypt fails → returns FAILED', () => {
    it('returns FAILED with auth error message', async () => {
      const db = createMockDb();
      const integrityCheck = new DatabaseIntegrityCheck(db);
      jest.spyOn(integrityCheck, 'check').mockResolvedValue({
        healthy: false,
        integrityResult: 'corrupt',
        foreignKeyViolations: 0,
        foreignKeyDetails: '',
        checkedAt: new Date().toISOString(),
      });

      const manager = new RecoveryManager({
        integrityCheck,
        cloudStorageProvider: createMockCloudProvider(),
        encryptedFileFormat: createMockEncryptedFileFormat(
          undefined,
          new AuthenticationError('wrong key'),
        ),
        appMetadataRepo: createMockAppMetadataRepo({ cloud_file_id: 'abc' }),
        getDerivedKey: async () => new Uint8Array(32),
        openInMemoryDb: jest.fn(),
        replaceLocalDb: jest.fn(),
        isOnline: () => true,
      });

      const result = await manager.recover();

      expect(result.status).toBe('FAILED');
      expect(result.reason).toContain('authentication tag');
    });
  });

  describe('RM-08: cloud backup also corrupt → returns FAILED', () => {
    it('returns FAILED when backup integrity check fails', async () => {
      const db = createMockDb(false);
      const integrityCheck = new DatabaseIntegrityCheck(db);
      jest.spyOn(integrityCheck, 'check')
        .mockResolvedValueOnce({
          healthy: false,
          integrityResult: 'corrupt',
          foreignKeyViolations: 0,
          foreignKeyDetails: '',
          checkedAt: new Date().toISOString(),
        })
        .mockResolvedValueOnce({
          healthy: false,
          integrityResult: 'backup corrupt',
          foreignKeyViolations: 0,
          foreignKeyDetails: '',
          checkedAt: new Date().toISOString(),
        });

      // Create a mock in-memory DB that also fails integrity
      const inMemoryDb = createMockDb(false);
      const inMemoryIntegrityCheck = new DatabaseIntegrityCheck(inMemoryDb);
      jest.spyOn(inMemoryIntegrityCheck, 'check').mockResolvedValue({
        healthy: false,
        integrityResult: 'backup corrupt',
        foreignKeyViolations: 0,
        foreignKeyDetails: '',
        checkedAt: new Date().toISOString(),
      });

      const manager = new RecoveryManager({
        integrityCheck,
        cloudStorageProvider: createMockCloudProvider(),
        encryptedFileFormat: createMockEncryptedFileFormat(),
        appMetadataRepo: createMockAppMetadataRepo({ cloud_file_id: 'abc' }),
        getDerivedKey: async () => new Uint8Array(32),
        openInMemoryDb: async () => inMemoryDb,
        replaceLocalDb: jest.fn(),
        isOnline: () => true,
      });

      const result = await manager.recover();

      expect(result.status).toBe('FAILED');
      expect(result.reason).toContain('Cloud backup is also corrupt');
    });
  });

  describe('RM-09: successful recovery → returns RECOVERED', () => {
    it('returns RECOVERED with all metadata', async () => {
      const db = createMockDb();
      const integrityCheck = new DatabaseIntegrityCheck(db);
      jest.spyOn(integrityCheck, 'check')
        .mockResolvedValueOnce({
          healthy: false,
          integrityResult: 'corrupt',
          foreignKeyViolations: 0,
          foreignKeyDetails: '',
          checkedAt: new Date().toISOString(),
        })
        .mockResolvedValueOnce({
          healthy: true,
          integrityResult: 'ok',
          foreignKeyViolations: 0,
          foreignKeyDetails: '',
          checkedAt: new Date().toISOString(),
        });

      const inMemoryDb = createMockDb();
      const appMetadataRepo = createMockAppMetadataRepo({ cloud_file_id: 'abc' });
      const replaceLocalDb = jest.fn().mockResolvedValue(undefined);

      const manager = new RecoveryManager({
        integrityCheck,
        cloudStorageProvider: createMockCloudProvider({
          data: new Uint8Array([1, 2, 3]),
          modifiedTime: '2026-06-30T10:00:00.000Z',
        }),
        encryptedFileFormat: createMockEncryptedFileFormat({
          database: new Uint8Array([4, 5, 6]),
          salt: new Uint8Array(32).fill(0xbb),
        }),
        appMetadataRepo,
        getDerivedKey: async () => new Uint8Array(32),
        openInMemoryDb: async () => inMemoryDb,
        replaceLocalDb,
        isOnline: () => true,
      });

      const result = await manager.recover();

      expect(result.status).toBe('RECOVERED');
      expect(result.cloudBackupTime).toBe('2026-06-30T10:00:00.000Z');
      expect(result.localChangesLost).toBe(true);
      expect(result.recordsPreserved).toBe(true);
      expect(replaceLocalDb).toHaveBeenCalledTimes(1);
      expect(appMetadataRepo.set).toHaveBeenCalledWith('kdf_salt', expect.any(String));
    });
  });

  describe('RM-10: unsupported platform → UNSUPPORTED_PLATFORM', () => {
    it('returns UNSUPPORTED_PLATFORM when replaceLocalDb throws', async () => {
      const db = createMockDb();
      const integrityCheck = new DatabaseIntegrityCheck(db);
      jest.spyOn(integrityCheck, 'check')
        .mockResolvedValueOnce({
          healthy: false,
          integrityResult: 'corrupt',
          foreignKeyViolations: 0,
          foreignKeyDetails: '',
          checkedAt: new Date().toISOString(),
        })
        .mockResolvedValueOnce({
          healthy: true,
          integrityResult: 'ok',
          foreignKeyViolations: 0,
          foreignKeyDetails: '',
          checkedAt: new Date().toISOString(),
        });

      const inMemoryDb = createMockDb();

      const manager = new RecoveryManager({
        integrityCheck,
        cloudStorageProvider: createMockCloudProvider(),
        encryptedFileFormat: createMockEncryptedFileFormat(),
        appMetadataRepo: createMockAppMetadataRepo({ cloud_file_id: 'abc' }),
        getDerivedKey: async () => new Uint8Array(32),
        openInMemoryDb: async () => inMemoryDb,
        replaceLocalDb: async () => {
          throw new DatabaseError('not yet implemented');
        },
        isOnline: () => true,
      });

      const result = await manager.recover();

      expect(result.status).toBe('UNSUPPORTED_PLATFORM');
      expect(result.reason).toContain('Windows device');
    });
  });

  describe('RM-11: recover() never throws', () => {
    it('returns result even on unexpected errors', async () => {
      const db = createMockDb();
      const integrityCheck = new DatabaseIntegrityCheck(db);
      jest.spyOn(integrityCheck, 'check').mockRejectedValue(
        new Error('unexpected'),
      );

      const manager = new RecoveryManager({
        integrityCheck,
        cloudStorageProvider: createMockCloudProvider(),
        encryptedFileFormat: createMockEncryptedFileFormat(),
        appMetadataRepo: createMockAppMetadataRepo(),
        getDerivedKey: jest.fn(),
        openInMemoryDb: jest.fn(),
        replaceLocalDb: jest.fn(),
        isOnline: jest.fn(),
      });

      const result = await manager.recover();

      // Should not throw — returns a result
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
    });
  });

  describe('RM-12: integrity check before recovery', () => {
    it('calls integrity check before any cloud operations', async () => {
      const db = createMockDb();
      const integrityCheck = new DatabaseIntegrityCheck(db);
      const checkSpy = jest.spyOn(integrityCheck, 'check').mockResolvedValue({
        healthy: true,
        integrityResult: 'ok',
        foreignKeyViolations: 0,
        foreignKeyDetails: '',
        checkedAt: new Date().toISOString(),
      });

      const cloudProvider = createMockCloudProvider();

      const manager = new RecoveryManager({
        integrityCheck,
        cloudStorageProvider: cloudProvider,
        encryptedFileFormat: createMockEncryptedFileFormat(),
        appMetadataRepo: createMockAppMetadataRepo(),
        getDerivedKey: jest.fn(),
        openInMemoryDb: jest.fn(),
        replaceLocalDb: jest.fn(),
        isOnline: jest.fn(),
      });

      await manager.recover();

      expect(checkSpy).toHaveBeenCalledTimes(1);
      // Cloud download should NOT have been called (healthy DB)
      expect(cloudProvider.download).not.toHaveBeenCalled();
    });
  });
});
