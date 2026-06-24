/**
 * Read-only category definition (songs, future: books...).
 *
 * Application-defined collection types. Managed by software (migrations),
 * not by users. Categories are seeded at migration time and read by the
 * sidebar navigation and category framework.
 *
 * Source: PROJECT_CONSTITUTION.md §14.2, 02_DATABASE_SCHEMA.md §4
 */

export interface Category {
  id: string;
  display_name: string;
  icon_name: string;
  enabled: number;
  sort_order: number;
  introduced_in_version: string;
}
