import type { DatabaseConnection } from '../database/DatabaseConnection.js';
import type { Artist } from '../../domain/models/Artist.js';

export class ArtistRepository {
  private readonly db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  async create(displayName: string): Promise<Artist> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.execute(
      'INSERT INTO artists (id, display_name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)',
      [id, displayName, now, now],
    );
    return { id, display_name: displayName, created_at: now, updated_at: now, deleted_at: null };
  }

  async findById(id: string): Promise<Artist | null> {
    const rows = await this.db.query<Artist>(
      'SELECT * FROM artists WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async findByName(displayName: string): Promise<Artist[]> {
    return this.db.query<Artist>(
      'SELECT * FROM artists WHERE display_name = ? AND deleted_at IS NULL ORDER BY created_at ASC',
      [displayName],
    );
  }

  async findAll(): Promise<Artist[]> {
    return this.db.query<Artist>(
      'SELECT * FROM artists WHERE deleted_at IS NULL ORDER BY display_name ASC',
    );
  }

  async findAllIncludingDeleted(): Promise<Artist[]> {
    return this.db.query<Artist>(
      'SELECT * FROM artists ORDER BY display_name ASC',
    );
  }

  async update(id: string, displayName: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(
      'UPDATE artists SET display_name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      [displayName, now, id],
    );
  }

  async softDelete(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(
      'UPDATE artists SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      [now, now, id],
    );
  }

  async restore(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(
      'UPDATE artists SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL',
      [now, id],
    );
  }

  async count(): Promise<number> {
    const rows = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM artists WHERE deleted_at IS NULL',
    );
    return rows[0].count;
  }
}
