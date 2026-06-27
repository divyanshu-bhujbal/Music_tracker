import type { FC } from 'react';
import type { Migration } from '../../data/database/MigrationTypes.js';
import type { DatabaseConnection } from '../../data/database/DatabaseConnection.js';

/**
 * Table column metadata for the category's table view.
 */
export interface ColumnDefinition {
  /** Unique field key matching the entity property name */
  key: string;
  /** Human-readable column header label */
  label: string;
  /** Whether this column supports sorting */
  sortable: boolean;
  /** Whether this column supports filtering */
  filterable: boolean;
  /** Flex-grow weight (relative to siblings) */
  flex: number;
  /** Optional fixed pixel width (overrides flex when set) */
  fixedWidth?: number;
}

/**
 * Column filter configuration.
 */
export interface FilterDefinition {
  /** Filter key (matches ColumnDefinition.key) */
  key: string;
  /** Human-readable filter label */
  label: string;
  /** Entity field name used as the data source for filter values */
  sourceField: string;
}

/**
 * Result returned by a category's duplicate detector.
 */
export interface DuplicateCheckResult {
  /** Match type: 'exact' (same name + same artist set) or 'partial' (same name, different/overlapping artists) */
  type: 'exact' | 'partial';
  /** The existing item that matched */
  existingItem: unknown;
  /** Resolution options offered to the user (e.g., ['Overwrite Existing', 'Skip Creation']) */
  resolutionOptions: string[];
}

/**
 * Map of repository class constructors keyed by entity name.
 * Each value is a constructor that takes DatabaseConnection as its sole argument.
 */
export type RepositoryMap = Record<string, new (db: DatabaseConnection) => unknown>;

/**
 * The extensibility contract for a category (Songs, Books, Movies, Games, etc.).
 *
 * Adding a new category requires only implementing this interface
 * and writing the database migration. Zero changes to core application code.
 */
export interface CategoryDefinition {
  /** Unique slug matching the categories.id DB column (e.g., "songs") */
  id: string;

  /** Human-readable label for sidebar and navigation (e.g., "Songs") */
  displayName: string;

  /** MUI icon identifier string (e.g., "music-note") */
  iconName: string;

  /** SQL migration files for this category's tables */
  migrations: Migration[];

  /** Repository class constructors keyed by entity name */
  repositories: RepositoryMap;

  /** Column definitions for the table view */
  tableColumns: ColumnDefinition[];

  /** Field names included in global search (e.g., ["name", "album_name"]) */
  searchFields: string[];

  /** Column filter configurations */
  filterFields: FilterDefinition[];

  /** Form component for creating an item */
  createForm: FC<{ onSave: (item: unknown) => void; onCancel: () => void }>;

  /** Form component for editing an item */
  editForm: FC<{ item: unknown; onSave: (item: unknown) => void; onCancel: () => void }>;

  /** Read-only detail component */
  detailView: FC<{ item: unknown; onClose: () => void }>;

  /** Async function that checks a candidate item for potential duplicates */
  duplicateDetector: (candidate: unknown) => Promise<DuplicateCheckResult[]>;
}
