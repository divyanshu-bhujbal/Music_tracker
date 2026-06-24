/**
 * Typed data access layer for the `languages` table.
 *
 * Provides CRUD, search, and seeded/user-split queries for the
 * controlled reference language table. Seeded languages have
 * `user_added = 0`; user additions have `user_added = 1`.
 *
 * Lifecycle: The repository does NOT call `open()` or `close()` —
 * the caller manages the connection lifecycle.
 */

import type { DatabaseConnection } from '../database/DatabaseConnection.js';
import type { Language } from '../../domain/models/Language.js';

export class LanguageRepository {
  private readonly db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  async findById(id: number): Promise<Language | null> {
    const rows = await this.db.query<Language>(
      'SELECT * FROM languages WHERE id = ?',
      [id],
    );

    return rows.length > 0 ? rows[0] : null;
  }

  async findByIsoCode(isoCode: string): Promise<Language | null> {
    const rows = await this.db.query<Language>(
      'SELECT * FROM languages WHERE iso_code = ?',
      [isoCode],
    );

    return rows.length > 0 ? rows[0] : null;
  }

  async findAll(): Promise<Language[]> {
    return this.db.query<Language>(
      'SELECT * FROM languages ORDER BY name ASC',
    );
  }

  async findSeeded(): Promise<Language[]> {
    return this.db.query<Language>(
      'SELECT * FROM languages WHERE user_added = 0 ORDER BY name ASC',
    );
  }

  async findUserAdded(): Promise<Language[]> {
    return this.db.query<Language>(
      'SELECT * FROM languages WHERE user_added = 1 ORDER BY created_at DESC',
    );
  }

  async search(query: string): Promise<Language[]> {
    if (query === '') {
      return [];
    }

    const pattern = `%${query}%`;

    return this.db.query<Language>(
      'SELECT * FROM languages WHERE name LIKE ? OR native_name LIKE ? ORDER BY name ASC',
      [pattern, pattern],
    );
  }

  async create(
    isoCode: string,
    name: string,
    nativeName: string,
  ): Promise<Language> {
    const createdAt = new Date().toISOString();

    await this.db.execute(
      'INSERT INTO languages (iso_code, name, native_name, user_added, created_at) VALUES (?, ?, ?, 1, ?)',
      [isoCode, name, nativeName, createdAt],
    );

    const rows = await this.db.query<{ id: number }>(
      'SELECT last_insert_rowid() AS id',
    );
    const id = rows[0].id;

    return {
      id,
      iso_code: isoCode,
      name,
      native_name: nativeName,
      user_added: 1,
      created_at: createdAt,
    };
  }

  async count(): Promise<number> {
    const rows = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM languages',
    );

    return rows[0].count;
  }
}
