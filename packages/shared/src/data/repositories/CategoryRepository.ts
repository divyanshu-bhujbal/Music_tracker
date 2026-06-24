/**
 * Read-only data access layer for the `categories` table.
 *
 * Categories are application-defined collection types managed by
 * software (migrations), not by users. This repository provides
 * only read queries — no create, update, or delete methods.
 *
 * Lifecycle: The repository does NOT call `open()` or `close()` —
 * the caller manages the connection lifecycle.
 */

import type { DatabaseConnection } from '../database/DatabaseConnection.js';
import type { Category } from '../../domain/models/Category.js';

export class CategoryRepository {
  private readonly db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  async findById(id: string): Promise<Category | null> {
    const rows = await this.db.query<Category>(
      'SELECT * FROM categories WHERE id = ?',
      [id],
    );

    return rows.length > 0 ? rows[0] : null;
  }

  async findAll(): Promise<Category[]> {
    return this.db.query<Category>(
      'SELECT * FROM categories ORDER BY sort_order ASC',
    );
  }

  async findEnabled(): Promise<Category[]> {
    return this.db.query<Category>(
      'SELECT * FROM categories WHERE enabled = 1 ORDER BY sort_order ASC',
    );
  }

  async count(): Promise<number> {
    const rows = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM categories',
    );

    return rows[0].count;
  }
}
