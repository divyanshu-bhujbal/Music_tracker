# Migration Strategy

> Source: PROJECT_CONSTITUTION.md Section 13
> Target: Personal Collection Manager V1.0

---

## 1. Migration System Overview

**Pattern:** Versioned migration runner — identical to the approach used by Flyway and Liquibase, applied at the SQLite level.

### Core Rules

| Rule | Description |
|------|-------------|
| **Run at startup** | Migration runner executes before any data access on every app launch |
| **Version tracked in DB** | `schema_version` key in `app_metadata` stores current migration level |
| **Sequential execution** | Pending migrations found in ascending numerical order, executed one at a time |
| **Each migration is a transaction** | Migrations execute within a SQLite transaction; failure rolls back that migration only |
| **Never modify released migrations** | Once a migration ships in a release, it is immutable. All schema changes are new migrations |
| **Version updated after each success** | After migration N succeeds, `schema_version` is set to N before migration N+1 runs |

### Failure Handling

```
STARTUP
  │
  ├─ Read schema_version from app_metadata
  │   └─ If table doesn't exist → version = 0 (initial creation)
  │
  ├─ Find pending migration files:
  │   migrations/
  │     001_core_infrastructure.sql
  │     002_songs_category.sql
  │     ...
  │   Sorted by filename prefix (ascending)
  │
  └─ FOR each pending migration:
      │
      ├─ BEGIN TRANSACTION
      ├─ Execute all SQL in the migration file
      ├─ IF success:
      │   ├─ UPDATE app_metadata SET value = :newVersion WHERE key = 'schema_version'
      │   ├─ COMMIT
      │   └─ Continue to next migration
      │
      └─ IF failure:
          ├─ ROLLBACK
          ├─ Log error with migration number and failure reason
          ├─ Alert user: "Database update failed. Please contact support."
          └─ ABORT startup — app does not operate with a mismatched schema
```

---

## 2. Migration File Convention

### Naming

```
migrations/
  001_<description>.sql
  002_<description>.sql
  ...
```

- Three-digit zero-padded number prefix determines execution order
- Underscore-separated description after the number
- Extension `.sql`
- Sorted by filename (lexicographic ensures numeric order for 3-digit padding)

### Content

- Raw SQL statements, no special markers or rollback sections
- Each file is a single logical migration (a set of related table changes)
- Comments allowed with `--` prefix for documentation
- Can include DDL (CREATE/ALTER/DROP), DML (INSERT seed data), and PRAGMA statements

### Example: 001_core_infrastructure.sql

```sql
-- Migration 001: Core Infrastructure Tables
-- Creates: app_metadata, devices, sync_log, app_settings, languages, categories
-- Seeded with ~60 languages and the 'songs' category entry

PRAGMA foreign_keys = ON;

CREATE TABLE app_metadata (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

INSERT INTO app_metadata (key, value) VALUES ('schema_version', '0');

CREATE TABLE devices (
    id            TEXT PRIMARY KEY NOT NULL,
    name          TEXT NOT NULL,
    platform      TEXT NOT NULL CHECK (platform IN ('ANDROID', 'WINDOWS')),
    registered_at TEXT NOT NULL,
    last_seen_at  TEXT NOT NULL
);

-- ... remaining table creation and seed data ...
```

---

## 3. Schema Version History

| Version | Migration File | Tables Created | Seed Data |
|---------|---------------|----------------|-----------|
| 0 | _(initial creation)_ | None | Empty database |
| 1 | `001_core_infrastructure.sql` | `app_metadata`, `devices`, `sync_log`, `app_settings`, `languages`, `categories` | ~60 languages, `songs` category |
| 2 | `002_songs_category.sql` | `artists`, `songs`, `song_artists` | None |
| 3+ | _future migrations_ | Future category tables, field additions, indexes | Per-category seed data |

---

## 4. Migration Rules

### Entity Tables

- All user-content entities use UUID v4 TEXT primary keys
- All user-content entities must have: `created_at`, `updated_at`, `deleted_at`
- All datetime columns store ISO-8601 strings
- All foreign keys explicitly declared with `REFERENCES`
- `NOT NULL` constraints on all required fields

### Adding a Category (Future: Books, Movies, Games)

A category migration (e.g., `003_books_category.sql`) must:

1. Create the category's entity tables with UUID PKs and audit columns
2. Create any junction tables (M:N relationships) with `updated_at` column
3. INSERT the category row into the `categories` table
4. All within a single transaction

### Adding Fields to Existing Tables

A migration for field additions (e.g., `004_artist_metadata.sql`) must:

1. Use `ALTER TABLE ... ADD COLUMN` (SQLite supports this for simple additions)
2. Set DEFAULT values where applicable (NOT NULL columns must have defaults)
3. No data migration logic — the new column is applied to all existing rows

### Adding Indexes

A migration for performance (e.g., `005_search_indexes.sql`) must:
1. CREATE INDEX statements for columns used in search/filter queries
2. Document in the file which query patterns each index supports

### Never Do in a Migration

| Forbidden | Reason |
|-----------|--------|
| Modify a released migration file | Would break existing installations |
| DROP COLUMN | Not supported in older SQLite versions |
| Rename a column | SQLite has no RENAME COLUMN in older versions |
| Data transformations that touch every row | Performance risk on large databases |
| Multiple migrations in one file | Violates atomicity principle |

---

## 5. Rollback Policy

**V1 policy: No automatic rollback.**

If a migration fails:
- The failed migration is rolled back (transaction abort)
- The `schema_version` remains at the last successful migration
- The user is alerted with instructions to contact support
- The app does not operate with a mismatched schema

### Manual Recovery Path

If migration N fails in production:
1. User is directed to reinstall the app (or restore from cloud backup)
2. Cloud backup contains the pre-migration schema (previous version)
3. Developer fixes the migration and releases a patch
4. User updates → migration runs correctly on the next launch

### Rollback Points (Optional Enhancement)

A future version may add rollback points:
- Before each migration, the database file is copied to a `.rollback` file
- If migration fails, the `.rollback` file is restored
- This requires implementing manual file copy (SQLite has no built-in snapshot)

---

## 6. Testing Migrations

### Required Tests

| Test Type | What It Validates |
|-----------|-------------------|
| **Fresh install** | Run all migrations from version 0 → schema matches expected state |
| **Incremental upgrade** | Start at version N-1, run migration N → correct changes applied |
| **Idempotency** | Running the migration runner twice produces the same result (no duplicate execution) |
| **Constraint enforcement** | FK, NOT NULL, UNIQUE constraints function after migration |
| **Seed data** | Seed rows exist with correct values and count |
| **Edge cases** | Empty database, version mismatch detection, concurrent access prevention |

### Test Strategy

1. **Unit tests:** Each migration file tested in isolation against a fresh in-memory SQLite database
2. **Integration tests:** All migrations run sequentially from version 0 to latest, then verified
3. **Platform tests:** Migrations executed on both Android emulator and Windows — same SQL files produce identical schemas

---

## 7. Migration in Production

### App Update Flow

```
User updates app (version 1.0 → 1.1 with new migration 003)
  │
  ├─ App launches
  ├─ Migration runner detects current schema_version = 2
  ├─ Pending migration 003 found
  ├─ Migration 003 executes (CREATE TABLE books, etc.)
  ├─ schema_version updated to 3
  ├─ App continues with new schema
  └─ User data is preserved (all existing rows unchanged)
```

### Database Integrity Check

After all migrations complete, the runner executes:
```sql
PRAGMA integrity_check;
PRAGMA foreign_key_check;
```

If either check fails → database is corrupted → app refuses to operate → recovery path offered.

### Migration Logging

Each migration execution is logged:
- Migration number
- Start time
- End time (and duration)
- Success/failure status
- Error message if failed

This is not stored in a database table (the migration runner runs before any tables may exist). Instead, write to a local log file or console.

---

## 8. Future: Migration Version Compatibility

### Cross-Device Schema Compatibility

When Device A (schema v3) syncs with Device B (schema v2):
1. Device B downloads the cloud database (schema v3)
2. Device B's schema is v2 — cannot read v3 tables
3. Resolution: the cloud database always reflects the **minimum schema version across all active devices**

**V1 assumption:** All devices stay on the same app version during normal use. Cross-version sync is a V2 concern.

### File Format Versioning

The encrypted file format includes a **format version byte** (Section 16.3 of constitution):
- Byte offset 4 holds `0x01` for V1
- Future versions can introduce new encryption schemes without breaking V1 databases
- The decryption step checks this byte and uses the appropriate algorithm
