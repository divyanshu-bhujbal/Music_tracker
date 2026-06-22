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

const migrationPath = join(__dirname, '../../migrations/001_core_infrastructure.sql');

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

describe('001_core_infrastructure.sql', () => {
  let db: SqliteDb;
  let migrationSql: string;

  beforeAll(() => {
    migrationSql = readFileSync(migrationPath, 'utf-8');
  });

  beforeEach(() => {
    db = new (Database as new () => SqliteDb)();
    db.pragma('foreign_keys = ON');
    executeMigration(db, migrationSql);
  });

  afterEach(() => {
    db.close();
  });

  describe('table existence and structure', () => {
    it('creates all 6 tables', () => {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all()
        .map((r) => r.name);
      expect(tables).toContain('app_metadata');
      expect(tables).toContain('devices');
      expect(tables).toContain('sync_log');
      expect(tables).toContain('app_settings');
      expect(tables).toContain('languages');
      expect(tables).toContain('categories');
    });

    it('app_metadata has correct columns', () => {
      const cols = db.pragma('table_info(app_metadata)', { simple: false }) as Record<string, unknown>[];
      const names = cols.map((c) => c.name);
      expect(names).toEqual(['key', 'value']);
    });

    it('devices has correct columns', () => {
      const cols = db.pragma('table_info(devices)', { simple: false }) as Record<string, unknown>[];
      const names = cols.map((c) => c.name);
      expect(names).toEqual(['id', 'name', 'platform', 'registered_at', 'last_seen_at']);
    });

    it('devices CHECK constraint rejects invalid platform', () => {
      expect(() => {
        db.prepare(
          "INSERT INTO devices (id, name, platform, registered_at, last_seen_at) VALUES ('d1', 'Test', 'LINUX', '2024-01-01', '2024-01-01')",
        ).run();
      }).toThrow();
    });

    it('devices CHECK constraint accepts valid platforms', () => {
      db.prepare(
        "INSERT INTO devices (id, name, platform, registered_at, last_seen_at) VALUES ('d1', 'Test', 'ANDROID', '2024-01-01', '2024-01-01')",
      ).run();
      db.prepare(
        "INSERT INTO devices (id, name, platform, registered_at, last_seen_at) VALUES ('d2', 'Test2', 'WINDOWS', '2024-01-01', '2024-01-01')",
      ).run();
      const count = db
        .prepare('SELECT count(*) AS cnt FROM devices')
        .all()[0].cnt as number;
      expect(count).toBe(2);
    });

    it('sync_log has correct columns', () => {
      const cols = db.pragma('table_info(sync_log)', { simple: false }) as Record<string, unknown>[];
      const names = cols.map((c) => c.name);
      expect(names).toEqual([
        'id',
        'device_id',
        'started_at',
        'completed_at',
        'direction',
        'status',
        'records_affected',
        'error_message',
      ]);
    });

    it('sync_log has FK on device_id', () => {
      const fkList = db.pragma('foreign_key_list(sync_log)', { simple: false }) as Record<string, unknown>[];
      const fk = fkList.find((r) => r.from === 'device_id');
      expect(fk).toBeDefined();
      expect(fk!.table).toBe('devices');
    });

    it('app_settings has correct columns', () => {
      const cols = db.pragma('table_info(app_settings)', { simple: false }) as Record<string, unknown>[];
      const names = cols.map((c) => c.name);
      expect(names).toEqual(['key', 'value', 'updated_at']);
    });

    it('languages has correct columns', () => {
      const cols = db.pragma('table_info(languages)', { simple: false }) as Record<string, unknown>[];
      const names = cols.map((c) => c.name);
      expect(names).toEqual(['id', 'iso_code', 'name', 'native_name', 'user_added', 'created_at']);
    });

    it('languages has UNIQUE constraint on iso_code', () => {
      expect(() => {
        db.prepare(
          "INSERT INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('en', 'English2', 'English2', 0, '2024-01-01')",
        ).run();
      }).toThrow();
    });

    it('languages user_added defaults to 0', () => {
      db.prepare(
        "INSERT INTO languages (iso_code, name, native_name, created_at) VALUES ('xx', 'Test', 'Test', '2024-01-01')",
      ).run();
      const row = db
        .prepare("SELECT user_added FROM languages WHERE iso_code = 'xx'")
        .all()[0];
      expect(row.user_added).toBe(0);
    });

    it('categories has correct columns', () => {
      const cols = db.pragma('table_info(categories)', { simple: false }) as Record<string, unknown>[];
      const names = cols.map((c) => c.name);
      expect(names).toEqual([
        'id',
        'display_name',
        'icon_name',
        'enabled',
        'sort_order',
        'introduced_in_version',
      ]);
    });

    it('categories enabled defaults to 1', () => {
      db.prepare(
        "INSERT INTO categories (id, display_name, icon_name, sort_order, introduced_in_version) VALUES ('test', 'Test', 'icon', 2, '1.0.0')",
      ).run();
      const row = db
        .prepare("SELECT enabled FROM categories WHERE id = 'test'")
        .all()[0];
      expect(row.enabled).toBe(1);
    });
  });

  describe('seed data content', () => {
    it('app_metadata has schema_version = 0', () => {
      const row = db
        .prepare("SELECT value FROM app_metadata WHERE key = 'schema_version'")
        .all()[0];
      expect(row.value).toBe('0');
    });

    it('languages has exactly 67 rows', () => {
      const count = db
        .prepare('SELECT count(*) AS cnt FROM languages')
        .all()[0].cnt as number;
      expect(count).toBe(67);
    });

    it('all languages have user_added = 0', () => {
      const count = db
        .prepare('SELECT count(*) AS cnt FROM languages WHERE user_added != 0')
        .all()[0].cnt as number;
      expect(count).toBe(0);
    });

    it('all languages have created_at', () => {
      const count = db
        .prepare('SELECT count(*) AS cnt FROM languages WHERE created_at IS NULL')
        .all()[0].cnt as number;
      expect(count).toBe(0);
    });

    it('all languages have unique iso_code', () => {
      const distinct = db
        .prepare('SELECT count(DISTINCT iso_code) AS cnt FROM languages')
        .all()[0].cnt as number;
      expect(distinct).toBe(67);
    });

    it('all languages have non-empty fields', () => {
      const count = db
        .prepare(
          "SELECT count(*) AS cnt FROM languages WHERE iso_code = '' OR name = '' OR native_name = ''",
        )
        .all()[0].cnt as number;
      expect(count).toBe(0);
    });

    it('English language entry is correct', () => {
      const row = db
        .prepare("SELECT name, native_name FROM languages WHERE iso_code = 'en'")
        .all()[0];
      expect(row.name).toBe('English');
      expect(row.native_name).toBe('English');
    });

    it('Japanese language entry is correct', () => {
      const row = db
        .prepare("SELECT name, native_name FROM languages WHERE iso_code = 'ja'")
        .all()[0];
      expect(row.name).toBe('Japanese');
      expect(row.native_name).toBe('日本語');
    });

    it('Chinese language entry is correct', () => {
      const row = db
        .prepare("SELECT name, native_name FROM languages WHERE iso_code = 'zh'")
        .all()[0];
      expect(row.name).toBe('Chinese');
      expect(row.native_name).toBe('中文');
    });

    it('categories has songs entry', () => {
      const row = db
        .prepare("SELECT * FROM categories WHERE id = 'songs'")
        .all()[0];
      expect(row.id).toBe('songs');
      expect(row.display_name).toBe('Songs');
      expect(row.icon_name).toBe('music-note');
      expect(row.enabled).toBe(1);
      expect(row.sort_order).toBe(1);
      expect(row.introduced_in_version).toBe('1.0.0');
    });

    it('categories has exactly 1 row', () => {
      const count = db
        .prepare('SELECT count(*) AS cnt FROM categories')
        .all()[0].cnt as number;
      expect(count).toBe(1);
    });
  });

  describe('constraint enforcement', () => {
    it('FK enforcement on sync_log rejects non-existent device', () => {
      expect(() => {
        db.prepare(
          "INSERT INTO sync_log (device_id, started_at, direction, status) VALUES ('nonexistent', '2024-01-01T00:00:00.000Z', 'UPLOAD', 'IN_PROGRESS')",
        ).run();
      }).toThrow();
    });

    it('NOT NULL enforcement on devices', () => {
      expect(() => {
        db.prepare(
          "INSERT INTO devices (id, name, platform, last_seen_at) VALUES ('dev-1', 'Test', 'ANDROID', '2024-01-01T00:00:00.000Z')",
        ).run();
      }).toThrow();
    });

    it('UNIQUE enforcement on languages.iso_code', () => {
      expect(() => {
        db.prepare(
          "INSERT INTO languages (iso_code, name, native_name, created_at) VALUES ('en', 'English2', 'English2', CURRENT_TIMESTAMP)",
        ).run();
      }).toThrow();
    });
  });

  describe('idempotency', () => {
    it('running migration twice does not error', () => {
      expect(() => {
        executeMigration(db, migrationSql);
      }).not.toThrow();
    });

    it('running migration twice does not duplicate languages', () => {
      executeMigration(db, migrationSql);
      const count = db
        .prepare('SELECT count(*) AS cnt FROM languages')
        .all()[0].cnt as number;
      expect(count).toBe(67);
    });

    it('running migration twice does not duplicate categories', () => {
      executeMigration(db, migrationSql);
      const count = db
        .prepare('SELECT count(*) AS cnt FROM categories')
        .all()[0].cnt as number;
      expect(count).toBe(1);
    });

    it('running migration twice does not duplicate app_metadata', () => {
      executeMigration(db, migrationSql);
      const count = db
        .prepare('SELECT count(*) AS cnt FROM app_metadata')
        .all()[0].cnt as number;
      expect(count).toBe(1);
    });
  });

  describe('integrity', () => {
    it('PRAGMA integrity_check returns ok', () => {
      const result = db.pragma('integrity_check', { simple: true });
      expect(result).toBe('ok');
    });
  });

  describe('full ISO code list', () => {
    it('all 67 ISO codes are present in order', () => {
      const expected = [
        'af', 'ar', 'az', 'be', 'bg', 'bn', 'ca', 'cs', 'cy', 'da',
        'de', 'el', 'en', 'eo', 'es', 'et', 'eu', 'fa', 'fi', 'fr',
        'ga', 'gl', 'gu', 'he', 'hi', 'hr', 'hu', 'hy', 'id', 'is',
        'it', 'ja', 'ka', 'kk', 'kn', 'ko', 'lt', 'lv', 'mk', 'ml',
        'mn', 'mr', 'ms', 'mt', 'nl', 'no', 'pa', 'pl', 'pt', 'ro',
        'ru', 'sk', 'sl', 'sq', 'sr', 'sv', 'sw', 'ta', 'te', 'th',
        'tl', 'tr', 'uk', 'ur', 'uz', 'vi', 'zh',
      ];
      const rows = db
        .prepare('SELECT iso_code FROM languages ORDER BY iso_code')
        .all();
      const codes = rows.map((r) => r.iso_code as string);
      expect(codes).toEqual(expected);
    });
  });
});
