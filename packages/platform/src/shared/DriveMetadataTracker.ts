import type { DatabaseConnection } from '@collectio/shared';

/**
 * Thin persistence wrapper for cloud file metadata.
 *
 * Reads/writes `cloud_file_id` and `cloud_modified_time` keys in the
 * `app_metadata` table. Used by GoogleDriveProvider to track which Drive
 * file corresponds to the encrypted database.
 *
 * Uses DatabaseConnection directly (not AppMetadataRepository) to avoid
 * coupling for a 2-row write. Both keys are already defined in AppMetadataKey.
 */
export class DriveMetadataTracker {
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Returns the stored Google Drive file ID, or null if not yet synced.
   */
  async getCloudFileId(): Promise<string | null> {
    const rows = await this.db.query<{ value: string }>(
      `SELECT value FROM app_metadata WHERE key = 'cloud_file_id'`,
    );
    return rows.length > 0 ? rows[0].value : null;
  }

  /**
   * Returns the stored Drive modifiedTime, or null if not yet synced.
   */
  async getCloudModifiedTime(): Promise<string | null> {
    const rows = await this.db.query<{ value: string }>(
      `SELECT value FROM app_metadata WHERE key = 'cloud_modified_time'`,
    );
    return rows.length > 0 ? rows[0].value : null;
  }

  /**
   * Persists cloud file metadata atomically within a single transaction.
   */
  async setCloudFileMetadata(
    fileId: string,
    modifiedTime: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(
        `INSERT INTO app_metadata (key, value) VALUES ('cloud_file_id', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [fileId],
      );
      await tx.execute(
        `INSERT INTO app_metadata (key, value) VALUES ('cloud_modified_time', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [modifiedTime],
      );
    });
    console.debug(`DriveMetadataTracker: set cloud_file_id=${fileId}`);
  }

  /**
   * Removes both cloud file metadata keys. Idempotent.
   */
  async clearCloudFileMetadata(): Promise<void> {
    await this.db.execute(
      `DELETE FROM app_metadata WHERE key IN ('cloud_file_id', 'cloud_modified_time')`,
    );
    console.debug('DriveMetadataTracker: cloud metadata cleared');
  }
}
