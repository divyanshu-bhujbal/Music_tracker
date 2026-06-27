import type { DatabaseConnection } from '../database/DatabaseConnection.js';
import type { Song, CreateSongInput, UpdateSongInput, SongWithArtists } from '../../domain/models/Song.js';
import type { FilterResult } from '../../application/search/FilterEngine.js';
import type { SortResult } from '../../application/search/SortEngine.js';

export class SongRepository {
  private readonly db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  async create(input: CreateSongInput): Promise<Song> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.execute(
      'INSERT INTO songs (id, name, album_name, language_id, added_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)',
      [id, input.name, input.album_name, input.language_id, now, now],
    );
    return {
      id,
      name: input.name,
      album_name: input.album_name,
      language_id: input.language_id,
      added_at: now,
      updated_at: now,
      deleted_at: null,
    };
  }

  async findById(id: string): Promise<Song | null> {
    const rows = await this.db.query<Song>(
      'SELECT * FROM songs WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async findSongWithArtists(id: string): Promise<SongWithArtists | null> {
    interface JoinRow {
      id: string;
      name: string;
      album_name: string | null;
      language_id: number;
      added_at: string;
      updated_at: string;
      deleted_at: string | null;
      artist_id: string | null;
      artist_display_name: string | null;
      artist_sort_order: number | null;
    }

    const rows = await this.db.query<JoinRow>(
      `SELECT
        s.id, s.name, s.album_name, s.language_id, s.added_at, s.updated_at, s.deleted_at,
        a.id AS artist_id, a.display_name AS artist_display_name, sa.sort_order AS artist_sort_order
      FROM songs s
      LEFT JOIN song_artists sa ON s.id = sa.song_id
      LEFT JOIN artists a ON sa.artist_id = a.id AND a.deleted_at IS NULL
      WHERE s.id = ? AND s.deleted_at IS NULL
      ORDER BY sa.sort_order ASC`,
      [id],
    );

    if (rows.length === 0) {
      return null;
    }

    const first = rows[0];
    const song: SongWithArtists = {
      id: first.id,
      name: first.name,
      album_name: first.album_name,
      language_id: first.language_id,
      added_at: first.added_at,
      updated_at: first.updated_at,
      deleted_at: first.deleted_at,
      artists: [],
    };

    for (const row of rows) {
      if (row.artist_id !== null) {
        song.artists.push({
          id: row.artist_id,
          display_name: row.artist_display_name!,
          sort_order: row.artist_sort_order!,
        });
      }
    }

    return song;
  }

  async findAll(): Promise<Song[]> {
    return this.db.query<Song>(
      'SELECT * FROM songs WHERE deleted_at IS NULL ORDER BY updated_at DESC',
    );
  }

  async findAllIncludingDeleted(): Promise<Song[]> {
    return this.db.query<Song>(
      'SELECT * FROM songs ORDER BY updated_at DESC',
    );
  }

  async findByLanguageId(languageId: number): Promise<Song[]> {
    return this.db.query<Song>(
      'SELECT * FROM songs WHERE language_id = ? AND deleted_at IS NULL ORDER BY name ASC',
      [languageId],
    );
  }

  async update(id: string, input: UpdateSongInput): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(
      'UPDATE songs SET name = ?, album_name = ?, language_id = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      [input.name, input.album_name, input.language_id, now, id],
    );
  }

  async softDelete(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(
      'UPDATE songs SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      [now, now, id],
    );
  }

  async restore(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(
      'UPDATE songs SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL',
      [now, id],
    );
  }

  async count(): Promise<number> {
    const rows = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM songs WHERE deleted_at IS NULL',
    );
    return rows[0].count;
  }

  async findFiltered(
    filter: FilterResult,
    sort: SortResult,
  ): Promise<Song[]> {
    const joinClauses = [...new Set(filter.joins)].join(' ');
    let sql = 'SELECT * FROM songs';
    if (joinClauses) {
      sql += ` ${joinClauses}`;
    }
    sql += ' WHERE deleted_at IS NULL';
    if (filter.whereClause) {
      sql += ` AND ${filter.whereClause}`;
    }
    if (sort.orderByClause) {
      sql += ` ${sort.orderByClause}`;
    }
    return this.db.query<Song>(sql, filter.params);
  }
}
