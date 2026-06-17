# E-06: Songs Category — Data

**Phase:** 2 | **Type:** Feature | **Depends On:** E-05 | **Blocks:** E-07

---

## Overview

**Purpose:** Implement the `ArtistRepository`, `SongRepository`, and `SongArtistRepository` for the Songs category. Register the `SongsCategory` definition.

**Platform impact:** UNCHANGED — repositories use `DatabaseConnection` which abstracts the platform. SQL queries are identical. Migration 002 creates the tables; all data access is through parameterized SQL.

---

## Tasks

| ID | Task | File |
|----|------|------|
| T-06.1 | Implement ArtistRepository | `packages/shared/src/data/repositories/ArtistRepository.ts` |
| T-06.2 | Implement SongRepository | `packages/shared/src/data/repositories/SongRepository.ts` |
| T-06.3 | Implement SongArtistRepository | `packages/shared/src/data/repositories/SongArtistRepository.ts` |
| T-06.4 | Implement SongDuplicateDetector | `packages/shared/src/application/duplicate/SongDuplicateDetector.ts` |
| T-06.5 | Duplicate detection unit tests | `packages/shared/src/application/duplicate/__tests__/` |
| T-06.6 | SongRepository unit tests | `packages/shared/src/data/repositories/__tests__/` |
| T-06.7 | ArtistRepository unit tests | `packages/shared/src/data/repositories/__tests__/` |
| T-06.8 | Register SongsCategory definition | `packages/renderer/src/categories/songs/SongsCategory.ts` |

## Acceptance Criteria

**Unchanged from original E-06 plan.** All 8 tasks have identical acceptance criteria. The only implementation change: repository methods are `async` because `DatabaseConnection` is async.

## Platform Note

Repositories receive `DatabaseConnection` via constructor injection. On Electron, this is `BetterSqlite3Connection` (sync wrapped in Promise). On Capacitor, this is `CapacitorSqliteConnection` (natively async). The repository implementations do not know or care which platform they're running on.
