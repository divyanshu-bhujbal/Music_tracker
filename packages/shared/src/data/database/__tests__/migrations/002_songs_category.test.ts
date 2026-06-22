import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require('better-sqlite3');

interface SqliteDb {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    all(...params: unknown[]): Record<string, unknown>[];
  };
  exec(sql: string): unknown;
  pragma(source: string, options?: { simple?: boolean }): unknown;
  close(): unknown;
  open: boolean;
}

const migration001Path = join(__dirname, '../../migrations/001_core_infrastructure.sql');
const migration002Path = join(__dirname, '../../migrations/002_songs_category.sql');

function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];

    if (inSingleQuote) {
      current += ch;
      if (ch === "'" && sql[i + 1] !== "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      current += ch;
      if (ch === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      current += ch;
      continue;
    }

    if (ch === '"') {
      inDoubleQuote = true;
      current += ch;
      continue;
    }

    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }

    current += ch;
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) {
    statements.push(trimmed);
  }

  return statements;
}

function isPragmaStatement(stmt: string): boolean {
  return stmt.trimStart().toUpperCase().startsWith('PRAGMA');
}

function executeMigration(db: SqliteDb, sqlContent: string): void {
  const statements = splitStatements(sqlContent);
  for (const stmt of statements) {
    if (isPragmaStatement(stmt)) {
      db.exec(stmt);
    } else {
      db.prepare(stmt).run();
    }
  }
}

describe('002_songs_category.sql', () => {
  let db: SqliteDb;
  let migrationSql: string;

  beforeAll(() => {
    migrationSql = readFileSync(migration002Path, 'utf-8');
  });

  beforeEach(() => {
    db = new (Database as new () => SqliteDb)();
    db.pragma('foreign_keys = ON');

    const sql001 = readFileSync(migration001Path, 'utf-8');
    executeMigration(db, sql001);

    executeMigration(db, migrationSql);
  });

  afterEach(() => {
    db.close();
  });

  describe('table existence', () => {
    it('adds 3 tables alongside the 6 from migration 001 (9 total)', () => {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all()
        .map((r) => r.name);
      expect(tables).toContain('artists');
      expect(tables).toContain('songs');
      expect(tables).toContain('song_artists');
      expect(tables).toContain('app_metadata');
      expect(tables).toContain('devices');
      expect(tables).toContain('sync_log');
      expect(tables).toContain('app_settings');
      expect(tables).toContain('languages');
      expect(tables).toContain('categories');
    });
  });

  describe('artists table structure', () => {
    it('has correct columns', () => {
      const cols = db.pragma('table_info(artists)', { simple: false }) as Record<string, unknown>[];
      const names = cols.map((c) => c.name);
      expect(names).toEqual(['id', 'display_name', 'created_at', 'updated_at', 'deleted_at']);
    });

    it('id is TEXT PRIMARY KEY NOT NULL', () => {
      const cols = db.pragma('table_info(artists)', { simple: false }) as Record<string, unknown>[];
      const idCol = cols.find((c) => c.name === 'id');
      expect(idCol!.pk).toBe(1);
      expect(idCol!.type).toBe('TEXT');
      expect(idCol!.notnull).toBe(1);
    });

    it('display_name has no UNIQUE constraint', () => {
      const ts = new Date().toISOString();
      db.prepare(
        "INSERT INTO artists (id, display_name, created_at, updated_at) VALUES ('a1', 'Same Name', ?, ?)",
      ).run(ts, ts);
      db.prepare(
        "INSERT INTO artists (id, display_name, created_at, updated_at) VALUES ('a2', 'Same Name', ?, ?)",
      ).run(ts, ts);
      const count = db
        .prepare("SELECT count(*) AS cnt FROM artists WHERE display_name = 'Same Name'")
        .all()[0].cnt as number;
      expect(count).toBe(2);
    });

    it('deleted_at is nullable', () => {
      const ts = new Date().toISOString();
      db.prepare(
        "INSERT INTO artists (id, display_name, created_at, updated_at) VALUES ('a1', 'Test', ?, ?)",
      ).run(ts, ts);
      const row = db.prepare("SELECT deleted_at FROM artists WHERE id = 'a1'").all()[0];
      expect(row.deleted_at).toBeNull();
    });

    it('deleted_at accepts a timestamp', () => {
      const ts = new Date().toISOString();
      db.prepare(
        "INSERT INTO artists (id, display_name, created_at, updated_at, deleted_at) VALUES ('a1', 'Test', ?, ?, ?)",
      ).run(ts, ts, '2024-06-01T00:00:00.000Z');
      const row = db.prepare("SELECT deleted_at FROM artists WHERE id = 'a1'").all()[0];
      expect(row.deleted_at).toBe('2024-06-01T00:00:00.000Z');
    });

    it('accepts UUID-formatted id', () => {
      const ts = new Date().toISOString();
      db.prepare(
        "INSERT INTO artists (id, display_name, created_at, updated_at) VALUES ('550e8400-e29b-41d4-a716-446655440000', 'Test', ?, ?)",
      ).run(ts, ts);
      const count = db
        .prepare('SELECT count(*) AS cnt FROM artists')
        .all()[0].cnt as number;
      expect(count).toBe(1);
    });
  });

  describe('songs table structure', () => {
    it('has correct columns', () => {
      const cols = db.pragma('table_info(songs)', { simple: false }) as Record<string, unknown>[];
      const names = cols.map((c) => c.name);
      expect(names).toEqual([
        'id',
        'name',
        'album_name',
        'language_id',
        'added_at',
        'updated_at',
        'deleted_at',
      ]);
    });

    it('id is TEXT PRIMARY KEY NOT NULL', () => {
      const cols = db.pragma('table_info(songs)', { simple: false }) as Record<string, unknown>[];
      const idCol = cols.find((c) => c.name === 'id');
      expect(idCol!.pk).toBe(1);
      expect(idCol!.type).toBe('TEXT');
      expect(idCol!.notnull).toBe(1);
    });

    it('language_id has FK to languages', () => {
      const fkList = db.pragma('foreign_key_list(songs)', { simple: false }) as Record<string, unknown>[];
      const fk = fkList.find((r) => r.from === 'language_id');
      expect(fk).toBeDefined();
      expect(fk!.table).toBe('languages');
    });

    it('album_name is nullable', () => {
      const ts = new Date().toISOString();
      db.prepare(
        "INSERT INTO songs (id, name, language_id, added_at, updated_at) VALUES ('s1', 'Test Song', 1, ?, ?)",
      ).run(ts, ts);
      const row = db.prepare("SELECT album_name FROM songs WHERE id = 's1'").all()[0];
      expect(row.album_name).toBeNull();
    });

    it('album_name accepts a value', () => {
      const ts = new Date().toISOString();
      db.prepare(
        "INSERT INTO songs (id, name, album_name, language_id, added_at, updated_at) VALUES ('s1', 'Test Song', 'Test Album', 1, ?, ?)",
      ).run(ts, ts);
      const row = db.prepare("SELECT album_name FROM songs WHERE id = 's1'").all()[0];
      expect(row.album_name).toBe('Test Album');
    });

    it('added_at and updated_at are both NOT NULL with no DEFAULT', () => {
      expect(() => {
        db.prepare(
          "INSERT INTO songs (id, name, language_id, updated_at) VALUES ('s1', 'Test', 1, '2024-01-01')",
        ).run();
      }).toThrow();
    });

    it('deleted_at is nullable', () => {
      const ts = new Date().toISOString();
      db.prepare(
        "INSERT INTO songs (id, name, language_id, added_at, updated_at) VALUES ('s1', 'Test', 1, ?, ?)",
      ).run(ts, ts);
      const row = db.prepare("SELECT deleted_at FROM songs WHERE id = 's1'").all()[0];
      expect(row.deleted_at).toBeNull();
    });
  });

  describe('song_artists table structure', () => {
    it('has correct columns', () => {
      const cols = db.pragma('table_info(song_artists)', { simple: false }) as Record<string, unknown>[];
      const names = cols.map((c) => c.name);
      expect(names).toEqual(['song_id', 'artist_id', 'sort_order', 'updated_at']);
    });

    it('has composite PRIMARY KEY on (song_id, artist_id)', () => {
      const cols = db.pragma('table_info(song_artists)', { simple: false }) as Record<string, unknown>[];
      const songIdCol = cols.find((c) => c.name === 'song_id');
      const artistIdCol = cols.find((c) => c.name === 'artist_id');
      expect(songIdCol!.pk).toBe(1);
      expect(artistIdCol!.pk).toBe(2);
    });

    it('song_id has FK to songs', () => {
      const fkList = db.pragma('foreign_key_list(song_artists)', { simple: false }) as Record<string, unknown>[];
      const fk = fkList.find((r) => r.from === 'song_id');
      expect(fk).toBeDefined();
      expect(fk!.table).toBe('songs');
    });

    it('artist_id has FK to artists', () => {
      const fkList = db.pragma('foreign_key_list(song_artists)', { simple: false }) as Record<string, unknown>[];
      const fk = fkList.find((r) => r.from === 'artist_id');
      expect(fk).toBeDefined();
      expect(fk!.table).toBe('artists');
    });

    it('sort_order defaults to 0', () => {
      const ts = new Date().toISOString();
      db.prepare(
        "INSERT INTO artists (id, display_name, created_at, updated_at) VALUES ('a1', 'Artist', ?, ?)",
      ).run(ts, ts);
      db.prepare(
        "INSERT INTO songs (id, name, language_id, added_at, updated_at) VALUES ('s1', 'Song', 1, ?, ?)",
      ).run(ts, ts);
      db.prepare(
        "INSERT INTO song_artists (song_id, artist_id, updated_at) VALUES ('s1', 'a1', ?)",
      ).run(ts);
      const row = db
        .prepare("SELECT sort_order FROM song_artists WHERE song_id = 's1' AND artist_id = 'a1'")
        .all()[0];
      expect(row.sort_order).toBe(0);
    });

    it('sort_order accepts explicit value', () => {
      const ts = new Date().toISOString();
      db.prepare(
        "INSERT INTO artists (id, display_name, created_at, updated_at) VALUES ('a2', 'Artist2', ?, ?)",
      ).run(ts, ts);
      db.prepare(
        "INSERT INTO songs (id, name, language_id, added_at, updated_at) VALUES ('s2', 'Song2', 1, ?, ?)",
      ).run(ts, ts);
      db.prepare(
        "INSERT INTO song_artists (song_id, artist_id, sort_order, updated_at) VALUES ('s2', 'a2', 5, ?)",
      ).run(ts);
      const row = db
        .prepare("SELECT sort_order FROM song_artists WHERE song_id = 's2' AND artist_id = 'a2'")
        .all()[0];
      expect(row.sort_order).toBe(5);
    });

    it('updated_at is NOT NULL', () => {
      expect(() => {
        db.prepare(
          "INSERT INTO song_artists (song_id, artist_id) VALUES ('s1', 'a1')",
        ).run();
      }).toThrow();
    });
  });

  describe('constraint enforcement', () => {
    it('FK: songs.language_id rejects non-existent language', () => {
      const ts = new Date().toISOString();
      expect(() => {
        db.prepare(
          "INSERT INTO songs (id, name, language_id, added_at, updated_at) VALUES ('s1', 'Test', 999, ?, ?)",
        ).run(ts, ts);
      }).toThrow();
    });

    it('FK: songs.language_id accepts valid language', () => {
      const ts = new Date().toISOString();
      db.prepare(
        "INSERT INTO songs (id, name, language_id, added_at, updated_at) VALUES ('s1', 'Test', 1, ?, ?)",
      ).run(ts, ts);
      const count = db
        .prepare('SELECT count(*) AS cnt FROM songs')
        .all()[0].cnt as number;
      expect(count).toBe(1);
    });

    it('FK: song_artists.song_id rejects non-existent song', () => {
      const ts = new Date().toISOString();
      db.prepare(
        "INSERT INTO artists (id, display_name, created_at, updated_at) VALUES ('a1', 'Artist', ?, ?)",
      ).run(ts, ts);
      expect(() => {
        db.prepare(
          "INSERT INTO song_artists (song_id, artist_id, sort_order, updated_at) VALUES ('nonexistent', 'a1', 0, ?)",
        ).run(ts);
      }).toThrow();
    });

    it('FK: song_artists.artist_id rejects non-existent artist', () => {
      const ts = new Date().toISOString();
      db.prepare(
        "INSERT INTO songs (id, name, language_id, added_at, updated_at) VALUES ('s1', 'Song', 1, ?, ?)",
      ).run(ts, ts);
      expect(() => {
        db.prepare(
          "INSERT INTO song_artists (song_id, artist_id, sort_order, updated_at) VALUES ('s1', 'nonexistent', 0, ?)",
        ).run(ts);
      }).toThrow();
    });

    it('Composite PK rejects duplicate (song_id, artist_id) pair', () => {
      const ts = new Date().toISOString();
      db.prepare(
        "INSERT INTO artists (id, display_name, created_at, updated_at) VALUES ('a1', 'Artist', ?, ?)",
      ).run(ts, ts);
      db.prepare(
        "INSERT INTO songs (id, name, language_id, added_at, updated_at) VALUES ('s1', 'Song', 1, ?, ?)",
      ).run(ts, ts);
      db.prepare(
        "INSERT INTO song_artists (song_id, artist_id, sort_order, updated_at) VALUES ('s1', 'a1', 0, ?)",
      ).run(ts);
      expect(() => {
        db.prepare(
          "INSERT INTO song_artists (song_id, artist_id, sort_order, updated_at) VALUES ('s1', 'a1', 1, ?)",
        ).run(ts);
      }).toThrow();
    });

    it('NOT NULL enforcement on songs.name', () => {
      const ts = new Date().toISOString();
      expect(() => {
        db.prepare(
          "INSERT INTO songs (id, language_id, added_at, updated_at) VALUES ('s1', 1, ?, ?)",
        ).run(ts, ts);
      }).toThrow();
    });

    it('NOT NULL enforcement on artists.display_name', () => {
      const ts = new Date().toISOString();
      expect(() => {
        db.prepare(
          "INSERT INTO artists (id, created_at, updated_at) VALUES ('a1', ?, ?)",
        ).run(ts, ts);
      }).toThrow();
    });
  });

  describe('idempotency', () => {
    it('running migration twice does not error', () => {
      expect(() => {
        executeMigration(db, migrationSql);
      }).not.toThrow();
    });

    it('running migration twice does not create duplicate tables', () => {
      executeMigration(db, migrationSql);
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all()
        .map((r) => r.name);
      const artistCount = tables.filter((n) => n === 'artists').length;
      const songsCount = tables.filter((n) => n === 'songs').length;
      const songArtistsCount = tables.filter((n) => n === 'song_artists').length;
      expect(artistCount).toBe(1);
      expect(songsCount).toBe(1);
      expect(songArtistsCount).toBe(1);
    });

    it('tables remain empty after idempotent re-run', () => {
      executeMigration(db, migrationSql);
      const artistCount = db
        .prepare('SELECT count(*) AS cnt FROM artists')
        .all()[0].cnt as number;
      const songCount = db
        .prepare('SELECT count(*) AS cnt FROM songs')
        .all()[0].cnt as number;
      const junctionCount = db
        .prepare('SELECT count(*) AS cnt FROM song_artists')
        .all()[0].cnt as number;
      expect(artistCount).toBe(0);
      expect(songCount).toBe(0);
      expect(junctionCount).toBe(0);
    });
  });

  describe('cross-migration integrity', () => {
    it('migration 001 tables still accessible after migration 002', () => {
      const langCount = db
        .prepare('SELECT count(*) AS cnt FROM languages')
        .all()[0].cnt as number;
      expect(langCount).toBe(67);
    });

    it('PRAGMA integrity_check returns ok after both migrations', () => {
      const result = db.pragma('integrity_check', { simple: true });
      expect(result).toBe('ok');
    });
  });

  describe('soft-delete columns', () => {
    it('artists.deleted_at and songs.deleted_at are independent', () => {
      const ts = new Date().toISOString();
      db.prepare(
        "INSERT INTO artists (id, display_name, created_at, updated_at, deleted_at) VALUES ('a1', 'Artist', ?, ?, ?)",
      ).run(ts, ts, '2024-01-01T00:00:00.000Z');
      db.prepare(
        "INSERT INTO songs (id, name, language_id, added_at, updated_at) VALUES ('s1', 'Song', 1, ?, ?)",
      ).run(ts, ts);

      const artist = db.prepare("SELECT deleted_at FROM artists WHERE id = 'a1'").all()[0];
      const song = db.prepare("SELECT deleted_at FROM songs WHERE id = 's1'").all()[0];
      expect(artist.deleted_at).toBe('2024-01-01T00:00:00.000Z');
      expect(song.deleted_at).toBeNull();
    });
  });
});
