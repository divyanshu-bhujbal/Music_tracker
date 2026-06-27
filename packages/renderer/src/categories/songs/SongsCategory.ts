import type { CategoryDefinition, DuplicateCheckResult } from '@collectio/shared';
import type { DatabaseConnection } from '@collectio/shared';
import { SongRepository } from '@collectio/shared';
import { SongArtistRepository } from '@collectio/shared';
import { ArtistRepository } from '@collectio/shared';
import { SongDuplicateDetector } from '@collectio/shared';

import migration002Sql from '../../../../shared/src/data/database/migrations/002_songs_category.sql?raw';

import { SongCreateDialog } from './components/SongCreateDialog.js';
import { SongEditDialog } from './components/SongEditDialog.js';
import { SongDetailDialog } from './components/SongDetailDialog.js';

/**
 * Database connection injected via configure().
 * Set once at app startup before registration.
 */
let _db: DatabaseConnection | null = null;

/**
 * Concrete CategoryDefinition for the Songs category.
 *
 * This is the first registered category in the application.
 * The definition is a frozen module-level constant.
 *
 * Usage:
 * ```ts
 * SongsCategory.configure(db);
 * CategoryRegistry.register(SongsCategory);
 * ```
 */
export const SongsCategory: CategoryDefinition = {
  id: 'songs',
  displayName: 'Songs',
  iconName: 'music-note',
  migrations: [{ version: 2, sql: migration002Sql }],
  repositories: {
    SongRepository,
    ArtistRepository,
    SongArtistRepository,
  },
  tableColumns: [
    { key: 'selection', label: '', sortable: false, filterable: false, flex: 0, fixedWidth: 48 },
    { key: 'name', label: 'Song Name', sortable: true, filterable: true, flex: 3 },
    { key: 'artists', label: 'Artist(s)', sortable: true, filterable: true, flex: 2 },
    { key: 'album_name', label: 'Album', sortable: true, filterable: true, flex: 2 },
    { key: 'language_id', label: 'Language', sortable: true, filterable: true, flex: 1, fixedWidth: 120 },
    { key: 'added_at', label: 'Date Added', sortable: true, filterable: false, flex: 1, fixedWidth: 140 },
  ],
  searchFields: ['name', 'album_name'],
  filterFields: [
    { key: 'name', label: 'Song Name', sourceField: 'name' },
    { key: 'artists', label: 'Artist(s)', sourceField: 'display_name' },
    { key: 'album_name', label: 'Album', sourceField: 'album_name' },
    { key: 'language_id', label: 'Language', sourceField: 'name' },
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createForm: SongCreateDialog as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editForm: SongEditDialog as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detailView: SongDetailDialog as any,
  duplicateDetector: async (candidate: unknown): Promise<DuplicateCheckResult[]> => {
    if (!_db) {
      throw new Error(
        'configureSongsCategory(db) must be called before using duplicateDetector',
      );
    }
    const { name, artistIds } = candidate as { name: string; artistIds: string[] };
    const detector = new SongDuplicateDetector(_db);
    return detector.checkForDuplicates({ name, artistIds });
  },
};

/**
 * Get the configured database connection.
 * Used by components that need direct DB access.
 */
export function getDb(): DatabaseConnection | null {
  return _db;
}

/**
 * Configure the Songs category with a database connection.
 * Must be called once at app startup before CategoryRegistry.register().
 *
 * @param db - The DatabaseConnection to use for duplicate detection
 */
export function configure(db: DatabaseConnection): void {
  _db = db;
}
