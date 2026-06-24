import type { DatabaseConnection } from '../database/DatabaseConnection.js';
import type { SongArtist } from '../../domain/models/SongArtist.js';

export class SongArtistRepository {
  private readonly db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  async findBySongId(songId: string): Promise<SongArtist[]> {
    return this.db.query<SongArtist>(
      'SELECT * FROM song_artists WHERE song_id = ? ORDER BY sort_order ASC',
      [songId],
    );
  }

  async findByArtistId(artistId: string): Promise<SongArtist[]> {
    return this.db.query<SongArtist>(
      'SELECT * FROM song_artists WHERE artist_id = ? ORDER BY sort_order ASC',
      [artistId],
    );
  }

  async add(songId: string, artistId: string, sortOrder: number): Promise<SongArtist> {
    const now = new Date().toISOString();
    await this.db.execute(
      'INSERT INTO song_artists (song_id, artist_id, sort_order, updated_at) VALUES (?, ?, ?, ?)',
      [songId, artistId, sortOrder, now],
    );
    return { song_id: songId, artist_id: artistId, sort_order: sortOrder, updated_at: now };
  }

  async remove(songId: string, artistId: string): Promise<void> {
    await this.db.execute(
      'DELETE FROM song_artists WHERE song_id = ? AND artist_id = ?',
      [songId, artistId],
    );
  }

  async updateSortOrder(songId: string, artistId: string, sortOrder: number): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(
      'UPDATE song_artists SET sort_order = ?, updated_at = ? WHERE song_id = ? AND artist_id = ?',
      [sortOrder, now, songId, artistId],
    );
  }

  async count(): Promise<number> {
    const rows = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM song_artists',
    );
    return rows[0].count;
  }
}
