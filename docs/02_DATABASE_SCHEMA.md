# Database Schema

> Source: PROJECT_CONSTITUTION.md Sections 13–14
> Target: Personal Collection Manager V1.0

---

## 1. Design Principles

| Principle | Rule |
|---|---|
| **Normal form** | Third Normal Form (3NF) — no transitive dependencies |
| **Primary keys** | UUID v4 for all user-content entities (prevents cross-device merge collisions) |
| **Soft delete** | All user-content entities have nullable `deleted_at`; queries filter `WHERE deleted_at IS NULL` |
| **Audit columns** | `created_at`, `updated_at`, `deleted_at` on every entity |
| **No EAV** | Category-specific attributes in typed columns — no generic key-value entity tables |
| **Timestamp format** | ISO-8601 datetime strings (`YYYY-MM-DDTHH:mm:ss.sssZ`) |
| **Schema versioning** | `schema_version` key in `app_metadata` tracks migration level |

---

## 2. Entity Relationship Diagram

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│  app_metadata │       │  app_settings │       │   devices    │
│  (key-value)  │       │  (key-value)  │       │              │
└──────────────┘       └──────────────┘       └──────┬───────┘
                                                     │
                                                     │ FK
                                                     ▼
                                              ┌──────────────┐
                                              │  sync_log    │
                                              └──────────────┘

┌──────────────┐       ┌──────────────┐
│  categories  │       │  languages   │
│  (reference) │       │  (reference) │
└──────────────┘       └──────┬───────┘
                              │ FK
                              ▼
                       ┌──────────────┐       ┌──────────────┐
                       │    songs     │       │   artists    │
                       └──────┬───────┘       └──────┬───────┘
                              │                      │
                              │    ┌─────────────────┘
                              │    │
                              ▼    ▼
                       ┌──────────────────┐
                       │  song_artists    │
                       │  (junction M:N)  │
                       └──────────────────┘
```

---

## 3. Infrastructure Tables (Migration 001)

### app_metadata

Stores fixed application-level key-value configuration. Key set is enumerated in code — not a general EAV store. No user data is stored here.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `key` | TEXT | PRIMARY KEY | Enumerated keys (see below) |
| `value` | TEXT | NOT NULL | Associated value |

**Well-known keys:**

| Key | Purpose |
|-----|---------|
| `schema_version` | Current migration version (integer as string) |
| `device_id` | UUID v4 of this device |
| `kdf_salt` | Argon2id salt (32 bytes, hex-encoded) — stored locally, enables credential restore flow without cloud download |
| `initialized` | `"true"` after first-launch setup completes |
| `last_successful_sync` | ISO-8601 timestamp of last completed sync |
| `cloud_file_id` | Google Drive file ID of the encrypted database |
| `cloud_modified_time` | Google Drive `modifiedTime` of the cloud file |

---

### devices

Registers every device that has participated in synchronization.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `name` | TEXT | NOT NULL | User-assigned or auto-generated (e.g., "Samsung Galaxy S23") |
| `platform` | TEXT | NOT NULL | `ANDROID` or `WINDOWS` |
| `registered_at` | TEXT | NOT NULL | ISO-8601 datetime of device registration |
| `last_seen_at` | TEXT | NOT NULL | ISO-8601 datetime of last sync participation |

---

### sync_log

Persistent log of sync events for diagnostics and UI display.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Sequential log entry ID |
| `device_id` | TEXT | FOREIGN KEY → devices.id | Device that performed the sync |
| `started_at` | TEXT | NOT NULL | ISO-8601 — when sync began |
| `completed_at` | TEXT | NULLABLE | ISO-8601 — when sync completed |
| `direction` | TEXT | — | `UPLOAD`, `DOWNLOAD`, or `MERGE` |
| `status` | TEXT | — | `SUCCESS`, `FAILURE`, or `IN_PROGRESS` |
| `records_affected` | INTEGER | — | Count of records changed in this sync |
| `error_message` | TEXT | NULLABLE | Error description if status = FAILURE |

---

### app_settings

User-configurable settings that propagate across devices via sync.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `key` | TEXT | PRIMARY KEY | Enumerated keys (see below) |
| `value` | TEXT | NOT NULL | Setting value |
| `updated_at` | TEXT | NOT NULL | ISO-8601 — last modification timestamp (enables LWW sync) |

**Well-known keys:**

| Key | Default | Description |
|-----|---------|-------------|
| `trash_retention_days` | `"-1"` | Days before auto-purge; `-1` = indefinite (V1) |
| `theme` | `"light"` | UI theme: `light` or `dark` |
| `default_view` | `"table"` | Default category view: `table` or `tile` |
| `sync_on_startup` | `"true"` | Whether to sync on app launch |
| `auto_sync_delay_seconds` | `"120"` | Inactivity timer duration before auto-sync |

Device-specific settings (device name, notification preferences) are stored in platform local storage, not in this table.

---

## 4. Reference Tables (Migration 001)

### languages

Controlled reference table for spoken/written languages. Seeded at migration 1 with ~60 ISO 639-1 languages. User additions are allowed and flagged.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Numeric ID |
| `iso_code` | TEXT | UNIQUE, NOT NULL | ISO 639-1 two-letter code (e.g., `en`, `ja`, `ar`) |
| `name` | TEXT | NOT NULL | English name (e.g., `Japanese`) |
| `native_name` | TEXT | NOT NULL | Name in the language itself (e.g., `日本語`) |
| `user_added` | INTEGER | NOT NULL, DEFAULT 0 | `1` if added by user; `0` if seeded |
| `created_at` | TEXT | NOT NULL | ISO-8601 datetime |

**Seed list (60 languages):**
af, ar, az, be, bg, bn, ca, cs, cy, da, de, el, en, eo, es, et, eu, fa, fi, fr, ga, gl, gu, he, hi, hr, hu, hy, id, is, it, ja, ka, kk, kn, ko, lt, lv, mk, ml, mn, mr, ms, mt, nl, no, pa, pl, pt, ro, ru, sk, sl, sq, sr, sv, sw, ta, te, th, tl, tr, uk, ur, uz, vi, zh

---

### categories

Application-defined collection types. Managed by software, not by users.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | TEXT | PRIMARY KEY | Slug (e.g., `songs`, `books`, `movies`) |
| `display_name` | TEXT | NOT NULL | UI display name |
| `icon_name` | TEXT | NOT NULL | Icon identifier from icon library |
| `enabled` | INTEGER | NOT NULL, DEFAULT 1 | Whether the category is active |
| `sort_order` | INTEGER | NOT NULL | Display order in sidebar |
| `introduced_in_version` | TEXT | NOT NULL | App version that added this category |

**Seed data (Migration 001):**

| id | display_name | icon_name | sort_order | introduced_in_version |
|----|-------------|-----------|------------|----------------------|
| `songs` | `Songs` | `music-note` | `1` | `1.0.0` |

---

## 5. Songs Category Tables (Migration 002)

### artists

Independent entities representing musical artists or groups. Future metadata (biography, country, formed_year) added via new migrations — no schema changes to other tables.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `display_name` | TEXT | NOT NULL | Artist display name |
| `created_at` | TEXT | NOT NULL | ISO-8601 |
| `updated_at` | TEXT | NOT NULL | ISO-8601 (enables LWW sync) |
| `deleted_at` | TEXT | NULLABLE | ISO-8601 soft delete |

**Note:** Duplicate display names are allowed (constitution does not enforce artist name uniqueness).

---

### songs

Primary entity for the Songs category.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `name` | TEXT | NOT NULL | Song name |
| `album_name` | TEXT | NULLABLE | Optional album name |
| `language_id` | INTEGER | NOT NULL, FOREIGN KEY → languages.id | Associated language |
| `added_at` | TEXT | NOT NULL | ISO-8601 — set at creation, **never modified** |
| `updated_at` | TEXT | NOT NULL | ISO-8601 (enables LWW sync) |
| `deleted_at` | TEXT | NULLABLE | ISO-8601 soft delete |

**`added_at` vs `updated_at`:** `added_at` represents when the user added the song to their collection and is immutable. `updated_at` changes on every edit. This distinction enables sorting/filtering by "date collected" without conflating with edit history.

---

### song_artists

Junction table for the many-to-many relationship between songs and artists.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `song_id` | TEXT | NOT NULL, FOREIGN KEY → songs.id | Song reference |
| `artist_id` | TEXT | NOT NULL, FOREIGN KEY → artists.id | Artist reference |
| `sort_order` | INTEGER | NOT NULL, DEFAULT 0 | Display order of artists on a song |
| `updated_at` | TEXT | NOT NULL | ISO-8601 (enables LWW sync) |

**Primary key:** Composite (`song_id`, `artist_id`)

**Why `updated_at` on a junction table?** Required for Last-Write-Wins merging. If Device A reorders artists on a song and Device B removes one, the later timestamp wins the conflict.

---

## 6. Duplicate Detection Logic

Duplicate detection runs at the **application layer** (not in SQL) during song creation.

### Normalization Pipeline

Applied to both the candidate name and all stored song names. Normalization is for **comparison purposes only** — stored display values are never modified.

1. **Unicode NFC normalization** — resolves decomposed character sequences to canonical composed form
2. **Convert to lowercase**
3. **Trim** leading and trailing whitespace
4. **Collapse** all internal whitespace sequences to a single space

Only exact string matches after normalization trigger a duplicate check. **No fuzzy, probabilistic, or distance-based matching.**

### Comparison Logic

| Match Type | Condition | Resolution Options |
|------------|-----------|-------------------|
| **Scenario A — Exact** | Same normalized name + same artist ID set | Overwrite Existing, Skip Creation |
| **Scenario B — Partial** | Same normalized name + different/overlapping artist set | Merge Artists onto Existing Song, Create Separate Entry |
| **No match** | Name differs after normalization | Save as new (no resolution needed) |

The user **always** makes the resolution choice — the app never auto-resolves duplicates.

---

## 7. Schema Version History

| Version | Migration File | Description |
|---------|---------------|-------------|
| 0 | _(initial creation)_ | Empty database |
| 1 | `001_core_infrastructure` | `app_metadata`, `devices`, `sync_log`, `app_settings`, `languages`, `categories` |
| 2 | `002_songs_category` | `artists`, `songs`, `song_artists` |
| 3+ | _reserved_ | Future categories (Books, Movies, Games) and field additions |

---

## 8. Key SQLite Pragmas

These must be enabled at connection open:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
```

| Pragma | Value | Reason |
|--------|-------|--------|
| `foreign_keys` | ON | Enforce FK constraints (not default in SQLite) |
| `journal_mode` | WAL | Write-Ahead Logging — better concurrent read/write performance |
| `synchronous` | NORMAL | Balance between safety and speed (FULL not needed with WAL) |
| `busy_timeout` | 5000ms | Wait up to 5s if DB is locked by another connection |
