# E-10: Synchronization Engine

**Phase:** 3 | **Type:** Feature | **Depends On:** E-09, E-02 | **Blocks:** E-13

---

## Overview

**Purpose:** Implement the 14-step sync algorithm, dirty state tracking, inactivity timer, LWW conflict resolution, and sync lock.

**Platform impact:** UNCHANGED — zero platform dependencies. Pure TypeScript. The sync engine operates on `DatabaseConnection`, `CloudStorageProvider`, and `CryptoProvider` — all platform-abstracted interfaces.

---

## Tasks

| ID | Task | File |
|----|------|------|
| T-10.1 | Implement DirtyStateTracker | `packages/shared/src/application/sync/DirtyStateTracker.ts` |
| T-10.2 | Implement InactivityTimer | `packages/shared/src/application/sync/SyncTimer.ts` |
| T-10.3 | Implement SyncLock | `packages/shared/src/application/sync/SyncLock.ts` |
| T-10.4 | Implement LocalChangeIdentification | `packages/shared/src/application/sync/ChangeTracker.ts` |
| T-10.5 | Implement RemoteChangeIdentification | (same file as T-10.4) |
| T-10.6 | Implement LWWMergeLogic | `packages/shared/src/application/sync/ConflictResolver.ts` |
| T-10.7 | Implement OrphanedFKResolution | (same file as T-10.6) |
| T-10.8 | Implement SyncAlgorithmOrchestrator | `packages/shared/src/application/sync/SyncEngine.ts` |
| T-10.9 | Implement StartupSync | Integrated into T-10.8 |
| T-10.10 | Implement ShutdownSync | Integrated into T-10.8 |
| T-10.11 | Implement ManualSyncTrigger | `packages/shared/src/application/sync/useSyncStore.ts` |
| T-10.12 | Implement OfflineDegradation | `packages/platform/src/shared/NetworkMonitor.ts` |
| T-10.13 | Implement SyncFailureHandling | Integrated into T-10.8 |
| T-10.14 | LWW merge unit tests | `packages/shared/src/application/sync/__tests__/` |
| T-10.15 | Full sync cycle integration tests | `packages/shared/src/application/sync/__tests__/` |

## Acceptance Criteria

**Unchanged from original E-10 plan.** All 15 tasks have identical acceptance criteria.

## Platform Note

The only platform-specific element is shutdown sync (T-10.10): the sync engine emits an event, and the platform adapter (Electron `app.on('before-quit')` / Capacitor `App.addListener('appStateChange')`) triggers the sync. The sync engine itself is unaware of the platform lifecycle.
