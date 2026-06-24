/**
 * Reference language entity (60 seeded + user additions).
 *
 * Controlled reference table for spoken/written languages.
 * Seeded at migration 1 with approximately 60 ISO 639-1 languages.
 * User additions are allowed and flagged via `user_added`.
 *
 * Source: PROJECT_CONSTITUTION.md §14.2, 02_DATABASE_SCHEMA.md §4
 */

export interface Language {
  id: number;
  iso_code: string;
  name: string;
  native_name: string;
  user_added: number;
  created_at: string;
}
