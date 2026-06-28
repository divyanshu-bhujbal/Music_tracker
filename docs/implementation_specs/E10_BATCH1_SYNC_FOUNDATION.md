# E-10 Batch 1 — Sync Foundation (DirtyStateTracker, SyncTimer, SyncLock, NetworkMonitor)

> **Epic:** E-10_SYNC_ENGINE.md | **Phase:** 3 | **Batch:** 1 of 3
> **Depends On:** E-02 (Database Layer) completed
> **Blocks:** E-10 Batch 2 (ChangeTracker, ConflictResolver)
> **Platform Impact:** Mostly UNCHANGED (pure TypeScript). `NetworkMonitor` is the only shared platform service — uses `navigator.onLine` + DOM events, available in both Electron BrowserWindow and Capacitor WebView.
> **Date:** 2026-06-28

---

## 1. Goal

Implement the four zero-dependency foundation components for the sync engine:
- **DirtyStateTracker** — Computes dirty state by comparing `MAX(updated_at)` across entity tables against `last_successful_sync`
- **SyncTimer** — Inactivity timer that fires a callback after a configurable delay; resets on write events
- **SyncLock** — In-memory mutex preventing concurrent sync operations
- **NetworkMonitor** — Online/offline detection via platform DOM APIs; emits status changes

These components have zero cross-dependencies. They can be built, tested, and verified entirely in parallel.

## 2. Scope

- T-10.1: `DirtyStateTracker` — dirty detection, pending change count, entity table discovery
- T-10.2: `SyncTimer` — inactivity timer with start/reset/cancel/pause/resume lifecycle
- T-10.3: `SyncLock` — in-memory acquire/release mutex with isHeld check
- T-10.12: `NetworkMonitor` — `navigator.onLine` + `window.addEventListener('online'/'offline')` with callback-based status change API
- Unit tests for each component (4 test files)
- Barrel exports for the new `sync/` directory and `platform/shared/` update

## 3. Out of Scope

- `ChangeTracker` (T-10.4/10.5) — local/remote change identification (Batch 2)
- `ConflictResolver` (T-10.6/10.7) — LWW merge + orphaned FK resolution (Batch 2)
- `SyncEngine` orchestrator (T-10.8) — 14-step algorithm (Batch 3)
- `useSyncStore` Zustand store (T-10.11) — Batch 3
- Shutdown sync, startup sync, manual sync trigger (integrated into SyncEngine, Batch 3)
- DI file registration — these components are wired into the DI files in Batch 3
- `NetworkMonitor` integration with `SyncEngine` — Batch 3
- Configurable timer delay reading from `app_settings` — SyncEngine handles this in Batch 3; timer accepts delay as constructor parameter

## 4. Files To Create

| # | File | Task | Package |
|---|------|------|---------|
| 1 | `packages/shared/src/application/sync/DirtyStateTracker.ts` | T-10.1 | `@collectio/shared` |
| 2 | `packages/shared/src/application/sync/SyncTimer.ts` | T-10.2 | `@collectio/shared` |
| 3 | `packages/shared/src/application/sync/SyncLock.ts` | T-10.3 | `@collectio/shared` |
| 4 | `packages/platform/src/shared/NetworkMonitor.ts` | T-10.12 | `@collectio/platform` |
| 5 | `packages/shared/src/application/sync/index.ts` | Barrel | `@collectio/shared` |
| 6 | `packages/shared/src/application/sync/__tests__/DirtyStateTracker.test.ts` | T-10.1 tests | `@collectio/shared` |
| 7 | `packages/shared/src/application/sync/__tests__/SyncTimer.test.ts` | T-10.2 tests | `@collectio/shared` |
| 8 | `packages/shared/src/application/sync/__tests__/SyncLock.test.ts` | T-10.3 tests | `@collectio/shared` |
| 9 | `packages/platform/src/shared/__tests__/NetworkMonitor.test.ts` | T-10.12 tests | `@collectio/platform` |

## 5. Files To Modify

| # | File | Change |
|---|------|--------|
| 1 | `packages/platform/src/shared/index.ts` | Add `export { NetworkMonitor } from './NetworkMonitor.js'` |
| 2 | `packages/shared/src/application/index.ts` | Add `export { DirtyStateTracker, SyncTimer, SyncLock } from './sync/index.js'` |
| 3 | `packages/shared/src/index.ts` | Re-export sync foundation types if any are needed by external consumers (likely none for Batch 1; `SyncLock` and `SyncTimer` may be needed by the DI container in Batch 3 — add when needed) |

## 6. File Specifications

### 6.1 `DirtyStateTracker.ts`

**Purpose:** Compute whether the local database has pending changes that need syncing. The dirty flag is **computed at runtime** (never stored as a separate row) by comparing the maximum `updated_at` across all entity tables against the stored `last_successful_sync` timestamp from `app_metadata`.

**Responsibility:**
- Discover entity tables (tables with an `updated_at` column) via SQLite schema introspection
- Query `MAX(updated_at)` across all discovered tables
- Read `last_successful_sync` from `app_metadata`
- Determine dirty state: `latestChange > last_successful_sync`
- Count pending changes: `COUNT(*) WHERE updated_at > last_successful_sync` across all entity tables
- Works with an open `DatabaseConnection` — does not open/close it

**Public API:**

| Method | Returns | Purpose |
|--------|---------|---------|
| `isDirty()` | `Promise<boolean>` | `true` if `MAX(updated_at) > last_successful_sync` |
| `getPendingCount()` | `Promise<number>` | COUNT of records across all entity tables where `updated_at > last_successful_sync` |
| `getLatestChange()` | `Promise<string \| null>` | ISO-8601 timestamp of newest `updated_at` across all entity tables, or `null` if no records exist |

**Constructor dependency:** `DatabaseConnection`

**Implementation specifics:**

- Table discovery query:
  ```sql
  SELECT m.name FROM sqlite_master m
  WHERE m.type = 'table'
  AND m.name NOT IN ('sqlite_sequence')
  AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) WHERE name = 'updated_at')
  ```
  This is self-discovering — adding a `books` table in migration 3 with `updated_at` automatically includes it. `app_settings` (has `updated_at`) is correctly included — setting changes should trigger dirty state.

- `isDirty()` algorithm:
  1. Get `latestChange` via `getLatestChange()`
  2. If `null` → no records exist → not dirty (return `false`)
  3. Read `last_successful_sync` from `app_metadata`
  4. If `last_successful_sync` is `null` → no sync has ever completed → dirty (return `true`)
  5. Compare: `latestChange > last_successful_sync` (lexicographic ISO-8601 comparison)
  6. Return result

- `getPendingCount()` algorithm:
  1. Get `last_successful_sync` from `app_metadata`
  2. If `null` → query `SELECT COUNT(*) FROM (...)` across all entity tables without WHERE clause (all records are pending)
  3. If set → for each entity table, `SELECT COUNT(*) FROM <table> WHERE updated_at > ?` with `last_successful_sync`
  4. Sum all counts

- `getLatestChange()` algorithm:
  - Build a `UNION ALL` query: `SELECT MAX(updated_at) AS latest FROM (<table1> UNION ALL <table2> ...)` across discovered tables
  - Each subquery: `SELECT updated_at FROM <table>` (returns rows, union strips duplicates, then MAX across union)
  - Or more efficiently: `SELECT MAX(updated_at) FROM (SELECT MAX(updated_at) AS updated_at FROM <table1> UNION ALL SELECT MAX(updated_at) AS updated_at FROM <table2> ...)`

- Cache discovered table names after first call. In V1, table schema doesn't change at runtime (migrations run at startup before any sync code executes).

**Source of truth:** 03_SYNC_STATE_MACHINE.md §3 (Dirty State Logic)

---

### 6.2 `SyncTimer.ts`

**Purpose:** Countdown timer that fires a callback after a configurable delay. Subsequent calls to `reset()` restart the countdown. This prevents rapid consecutive edits from triggering multiple sync operations.

**Responsibility:**
- Manage a single `setTimeout`-based countdown
- `start()` begins the countdown
- `reset()` restarts the countdown from the full delay
- `cancel()` stops the timer without firing the callback
- `pause()` stops and saves remaining time; `resume()` restarts from saved time
- Expose `isRunning()` for external state checks (e.g., suppressing timer during active sync)

**Public API:**

| Method | Purpose |
|--------|---------|
| `start(delayMs?: number)` | Start timer. Optional delay overrides the configured default. If already running, restarts with new delay. Idempotent — calling on already-started timer restarts it. |
| `reset()` | Restart timer with the originally configured delay. Equivalent to `start()` with no argument. |
| `cancel()` | Stop timer. Does NOT fire callback. Safe to call when not running (no-op). |
| `pause()` | Stop timer and remember remaining milliseconds. Next `resume()` continues from saved time. |
| `resume()` | Restart timer from saved remaining time (from last `pause()`). Throws if not paused. |
| `isRunning()` | `boolean` — whether timer is currently counting down |
| `getRemainingMs()` | `number` — estimated milliseconds remaining, or `0` if not running |
| `setDelay(ms: number)` | Change the default delay without restarting. Clamped to valid range. |

**Constructor:** `(onExpiry: () => void, delayMs: number)`

- `onExpiry`: Callback invoked when timer expires. Must be `async`-safe (SyncEngine will pass an async function; timer calls it with no `await` — fire-and-forget).
- `delayMs`: Default delay in milliseconds. Clamped to range `30_000`–`600_000` (30s–10min per 03_SYNC_STATE_MACHINE.md §4).

**Properties:**
- Uses `setTimeout`/`clearTimeout` (Node.js + browser standard).
- Timer is a single in-memory timeout handle. No DB writes, no persistence.
- If the process crashes/kills, the timer dies with the process. This is acceptable — next app launch checks dirty state via `DirtyStateTracker.isDirty()`.
- `pause()` stores `remainingMs = delayMs - (Date.now() - startTime)`. `resume()` starts a new `setTimeout` with `remainingMs`.

**Timer lifecycle states:**

```
            start()
  IDLE ────────────────► COUNTING
    ▲                       │
    │            ┌──────────┼──────────┐
    │       reset()    pause()     timer fires
    │            │          │          │
    │            ▼          ▼          ▼
    │       COUNTING    PAUSED     EXPIRED
    │       (restart)      │      (callback called,
    │            │     resume()     returns to IDLE)
    │            │          │
    │            │          ▼
    │            └──► COUNTING
    │
    └──── cancel() (from COUNTING or PAUSED)
```

**Source of truth:** 03_SYNC_STATE_MACHINE.md §4 (Auto-Sync Timer)

---

### 6.3 `SyncLock.ts`

**Purpose:** In-memory mutex preventing concurrent sync operations within a single process.

**Responsibility:**
- Allow a single holder to acquire the lock
- Reject subsequent `acquire()` calls while held
- Release returns the lock to unheld state
- Must be a class (not a module-level variable) so it can be mocked in tests

**Public API:**

| Method | Returns | Purpose |
|--------|---------|---------|
| `acquire()` | `boolean` | `true` if lock was acquired (was not held). `false` if already held — caller must abort sync. |
| `release()` | `void` | Release the lock. Safe to call if not held (no-op). Must be called in `finally` to ensure cleanup. |
| `isHeld()` | `boolean` | Whether the lock is currently held. |

**Constructor:** `()` — no dependencies.

**Properties:**
- Single boolean flag in memory.
- No timeout — a stuck lock requires app restart (acceptable per 03_SYNC_STATE_MACHINE.md §11).
- No process-level or filesystem lock — V1 is single-process.
- If app crashes mid-sync → lock dies with process → next startup sync reacquires naturally.

**Source of truth:** 03_SYNC_STATE_MACHINE.md §11 (Sync Lock)

---

### 6.4 `NetworkMonitor.ts`

**Purpose:** Detect network connectivity state and notify subscribers on changes. Used by the sync engine to suppress sync attempts when offline and trigger auto-sync on reconnection.

**Responsibility:**
- Initialize by reading `navigator.onLine`
- Subscribe to `window` `online`/`offline` events
- Expose current connectivity state
- Provide callback-based subscription for status changes
- Provide cleanup method to remove event listeners

**Location rationale:** Epic specifies `packages/platform/src/shared/`. This is correct — it uses `navigator.onLine` and `window.addEventListener` (DOM APIs available in both Electron BrowserWindow and Capacitor WebView). It could not live in `shared/application/` which is pure TypeScript with no DOM. It could not live in `platform/electron/` or `platform/capacitor/` because it uses the same DOM APIs on both.

**Public API:**

| Method | Returns | Purpose |
|--------|---------|---------|
| `isOnline()` | `boolean` | Current connectivity state |
| `onStatusChange(callback)` | `() => void` | Register a callback. Returns an unsubscribe function. Callback receives `{ isOnline: boolean }`. |
| `destroy()` | `void` | Remove all event listeners. Call on app shutdown. |

**Constructor:** `()` — no dependencies. Subscribes to DOM events internally.

**Implemented using:**
- `window.navigator.onLine` for initial state
- `window.addEventListener('online', handler)` / `window.addEventListener('offline', handler)`
- Callbacks are invoked synchronously on DOM events
- `destroy()` removes both event listeners

**Design notes:**
- `navigator.onLine` may return `true` on some platforms even when the network is unavailable but a local network interface exists (e.g., connected to Wi-Fi with no internet). This is acceptable — the sync engine will fail gracefully on actual HTTP errors.
- Electron: `BrowserWindow` renderer process has `navigator.onLine` and DOM events behaving identically to a regular browser.
- Capacitor: WebView has the same APIs.
- The 10-second debounce on offline→online transition (per 03_SYNC_STATE_MACHINE.md §5) is implemented by the sync engine (Batch 3), not by `NetworkMonitor`. `NetworkMonitor` reports the raw event immediately.

---

## 7. Interfaces

No new interfaces are defined in Batch 1. All four components are exported as concrete classes. The sync engine (Batch 3) will depend on these classes directly — they are implementation details of the sync module, not extension points.

| Class | Injectability | Mocked In Tests? |
|-------|--------------|-----------------|
| `DirtyStateTracker` | Constructor accepts `DatabaseConnection` | Yes — pass in-memory SQLite |
| `SyncTimer` | Constructor accepts callback + delay | Yes — pass jest.fn() callback |
| `SyncLock` | No constructor dependencies | Yes — direct instantiation |
| `NetworkMonitor` | No constructor dependencies | Yes — mock `navigator` and `window.addEventListener` |

## 8. Data Flow

### 8.1 Dirty State Detection

```
Entity write occurs (INSERT/UPDATE/DELETE on any entity table)
  │
  ▼
entity.updated_at = NOW()   (set by repository layer, already implemented)
  │
  ▼
[Later, when SyncEngine checks dirty state...]
  │
  ▼
DirtyStateTracker.getLatestChange()
  ├─ Query: SELECT m.name FROM sqlite_master WHERE ... (discover tables with updated_at)
  ├─ Query: SELECT MAX(updated_at) FROM (
  │           SELECT MAX(updated_at) AS updated_at FROM artists UNION ALL
  │           SELECT MAX(updated_at) AS updated_at FROM songs UNION ALL
  │           ...
  │         )
  └─ Return latest timestamp string
  │
  ▼
DirtyStateTracker.isDirty()
  ├─ latestChange = getLatestChange()
  ├─ lastSync = SELECT value FROM app_metadata WHERE key = 'last_successful_sync'
  └─ Return latestChange > lastSync
```

### 8.2 Timer Lifecycle

```
User writes (e.g., edits a song)
  │
  ▼
Repository write completes
  │
  ▼
SyncTimer.reset()           ← SyncEngine calls this on every write (Batch 3)
  ├─ clearTimeout(currentTimer)
  ├─ currentTimer = setTimeout(onExpiry, delayMs)
  └─ Timer now counting down from delayMs
  │
  ▼
[120 seconds pass with no writes...]
  │
  ▼
setTimeout fires → onExpiry() callback
  │
  ▼
SyncEngine checks: isDirty() && isOnline()  (Batch 3 logic)
  ├─ true → execute sync
  └─ false → do nothing
```

### 8.3 Sync Lock

```
SyncEngine.execute() or manual sync trigger
  │
  ▼
SyncLock.acquire()
  ├─ was not held → set held = true, return true
  └─ was already held → return false
      └─ SyncEngine aborts with "Sync already in progress"
  │
  ▼
[14-step sync algorithm executes]
  │
  ▼
finally { SyncLock.release() }
```

### 8.4 Network Status

```
App startup
  │
  ▼
NetworkMonitor constructed
  ├─ reads navigator.onLine
  └─ registers window 'online'/'offline' listeners
  │
  ▼
window fires 'offline' event
  ├─ handler calls all subscribed callbacks with { isOnline: false }
  └─ SyncEngine callback → pauses SyncTimer (Batch 3)
  │
  ▼
window fires 'online' event
  ├─ handler calls all subscribed callbacks with { isOnline: true }
  └─ SyncEngine callback → 10s debounce → auto-sync if dirty (Batch 3)
```

## 9. State Changes

**None.** These components manage only in-memory state. No database writes are performed by `SyncTimer`, `SyncLock`, or `NetworkMonitor`. `DirtyStateTracker` is read-only — it queries `app_metadata` and entity tables but never writes.

## 10. Database Changes

**None.** No schema migrations, no new tables, no seed data. `DirtyStateTracker` reads from existing tables (`app_metadata`, entity tables).

## 11. Error Handling

| Component | Error Scenario | Behavior |
|-----------|---------------|----------|
| `DirtyStateTracker.isDirty()` | `last_successful_sync` not set (null) | Return `true` — treat as dirty (no sync has ever completed) |
| `DirtyStateTracker.getLatestChange()` | No entity tables exist (migrations not run yet) | Return `null` |
| `DirtyStateTracker.getPendingCount()` | `last_successful_sync` is null | Count all records across all tables (all are pending first sync) |
| `DirtyStateTracker`* | DatabaseConnection throws `ConnectionError` | Re-throw — caller handles (SyncEngine in Batch 3) |
| `SyncTimer.start()` | Delay < 30,000ms or > 600,000ms | Clamp to range silently |
| `SyncTimer.resume()` | Called when not paused | Throw `Error('Timer is not paused')` |
| `SyncTimer.pause()` | Called when not running | No-op (safe to call on idle timer) |
| `SyncTimer.cancel()` | Called when not running | No-op |
| `SyncLock.release()` | Called when not held | No-op (safe to call in `finally` block) |
| `NetworkMonitor` constructor | `window` undefined (SSR context) | V1 runs only in Electron BrowserWindow and Capacitor WebView — both have `window`. Not a concern. |
| `NetworkMonitor.onStatusChange()` | Callback throws | Do not catch. Let error propagate — this is a programming error, not a runtime condition. |
| `NetworkMonitor.destroy()` | Called multiple times | No-op on subsequent calls (remove already-removed listeners is safe) |

## 12. Logging Requirements

Minimal logging for Batch 1. These are low-level components — verbose logging at this layer would produce noise when wired into the orchestrator.

| Component | Event | Level | Message |
|-----------|-------|-------|---------|
| `DirtyStateTracker` | Entity tables discovered | `debug` | `DirtyStateTracker: discovered ${count} entity tables: [names]` |
| `DirtyStateTracker` | Dirty check | `debug` | `DirtyStateTracker: isDirty=${result} (latest=${latestChange}, lastSync=${lastSync})` |
| `SyncTimer` | Timer started/reset | `debug` | `SyncTimer: started (${delayMs}ms)` |
| `SyncTimer` | Timer expired | `debug` | `SyncTimer: expired` |
| `SyncTimer` | Timer cancelled/paused | `debug` | `SyncTimer: ${action}` |
| `SyncLock` | Acquire failed (contention) | `warn` | `SyncLock: acquire denied — lock already held` |
| `SyncLock` | Acquire/lock state changes | No log | Too frequent; sync engine will log at higher level |
| `NetworkMonitor` | Status change | `info` | `NetworkMonitor: ${isOnline ? 'online' : 'offline'}` |
| `NetworkMonitor` | Startup | `debug` | `NetworkMonitor: initialized (${navigator.onLine ? 'online' : 'offline'})` |

All logs use `console.debug/info/warn`. No custom logging framework.

## 13. Security Requirements

**None.** These components manage no secrets, make no network calls (except NetworkMonitor which only reads status, not data), and perform no cryptographic operations.

## 14. Test Cases

### 14.1 DirtyStateTracker Tests

**File:** `packages/shared/src/application/sync/__tests__/DirtyStateTracker.test.ts`

**Setup:** Create in-memory `DatabaseConnection` (configured with test tables). All tests use `beforeEach` to create fresh SQLite tables.

| ID | Test | Setup | Expected |
|----|------|-------|----------|
| DT-01 | `isDirty()` returns `false` when no changes exist | Insert songs with `updated_at = T-100`; set `last_successful_sync = T` | `false` (all records older than last sync) |
| DT-02 | `isDirty()` returns `true` when change exists | Insert song with `updated_at = T+100`; set `last_successful_sync = T` | `true` |
| DT-03 | `isDirty()` returns `true` when `last_successful_sync` is null | Insert any song; do not set `last_successful_sync` | `true` (never synced) |
| DT-04 | `isDirty()` returns `false` when no entity tables exist | Empty database; migration not run | `false` (no tables → no changes) |
| DT-05 | `getPendingCount()` returns 0 when no pending changes | 5 songs with `updated_at < last_successful_sync` | `0` |
| DT-06 | `getPendingCount()` returns correct count across multiple tables | 3 songs, 2 artists, 1 song_artist with `updated_at > last_successful_sync` | `6` |
| DT-07 | `getPendingCount()` counts app_settings changes | 1 app_settings row with `updated_at > last_successful_sync` | count includes app_settings |
| DT-08 | `getLatestChange()` returns newest timestamp | songs: T+10, artists: T+50, song_artists: T+30 | `T+50` |
| DT-09 | `getLatestChange()` returns `null` when no tables exist | Empty database | `null` |
| DT-10 | Table discovery finds all entity tables | Create artists, songs, song_artists, app_settings tables with `updated_at` column | All 4 tables discovered |
| DT-11 | Table discovery excludes infrastructure tables | Create `app_metadata` (no `updated_at`), `devices` (no `updated_at`), `sync_log` (no `updated_at`) | Only tables WITH `updated_at` discovered |
| DT-12 | Table discovery works after migration adds new table | Create books table with `updated_at` (simulating migration 003) | books table is discovered (cache invalidated) |

### 14.2 SyncTimer Tests

**File:** `packages/shared/src/application/sync/__tests__/SyncTimer.test.ts`

**Setup:** Use Jest fake timers (`jest.useFakeTimers()`). Pass `jest.fn()` as callback.

| ID | Test | Setup | Expected |
|----|------|-------|----------|
| TM-01 | `start()` fires callback after delay | `start(1000)`, advance timers by 1000ms | Callback called exactly once |
| TM-02 | `start()` does not fire before delay | `start(5000)`, advance by 4000ms | Callback NOT called |
| TM-03 | `reset()` restarts countdown | `start(1000)`, advance 500ms, `reset()`, advance 500ms | Callback NOT called yet (restarted to 1000ms) |
| TM-04 | `reset()` fires after full new delay | `start(1000)`, advance 500ms, `reset()`, advance 1000ms | Callback called once |
| TM-05 | `cancel()` prevents callback | `start(1000)`, `cancel()`, advance 5000ms | Callback NEVER called |
| TM-06 | `pause()` prevents callback | `start(1000)`, advance 300ms, `pause()`, advance 5000ms | Callback NOT called |
| TM-07 | `resume()` after `pause()` fires with remaining time | `start(1000)`, advance 300ms, `pause()`, `resume()`, advance 700ms | Callback called once at 1000ms total |
| TM-08 | `pause()` then `cancel()` then `resume()` throws | `start(1000)`, `pause()`, `cancel()`, then `resume()` | `resume()` throws Error |
| TM-09 | `resume()` without `pause()` throws | `start(1000)`, then `resume()` | `resume()` throws Error |
| TM-10 | `isRunning()` returns correct state | After `start()` → `true`. After `cancel()` → `false`. After `pause()` → `false`. After `resume()` → `true`. After expiry → `false`. | All assertions pass |
| TM-11 | `getRemainingMs()` returns estimate | `start(10000)`, advance 3000ms | `getRemainingMs()` ≈ 7000 (±100ms) |
| TM-12 | `setDelay()` changes delay without restarting | `start(1000)`, `setDelay(5000)`, advance 1000ms | Callback fires at original 1000ms (delay change only affects next start) |
| TM-13 | Delay clamped below 30s | `new SyncTimer(cb, 1000)` | Delay is clamped to 30000ms |
| TM-14 | Delay clamped above 600s | `new SyncTimer(cb, 999999)` | Delay is clamped to 600000ms |
| TM-15 | Double `start()` restarts timer | `start(1000)`, advance 500ms, `start(1000)`, advance 500ms | Callback NOT called yet |
| TM-16 | `cancel()` on idle timer is safe | `cancel()` without `start()` | No throw |
| TM-17 | Timer only fires once per `start()` | `start(1000)`, advance 2000ms | Callback called once (not twice) |

### 14.3 SyncLock Tests

**File:** `packages/shared/src/application/sync/__tests__/SyncLock.test.ts`

| ID | Test | Setup | Expected |
|----|------|-------|----------|
| LK-01 | `acquire()` returns `true` when not held | New SyncLock | `true` |
| LK-02 | `acquire()` returns `false` when already held | `acquire()` once, then `acquire()` again | First `true`, second `false` |
| LK-03 | `isHeld()` returns `true` after acquire | `acquire()` | `isHeld()` → `true` |
| LK-04 | `isHeld()` returns `false` after release | `acquire()`, `release()` | `isHeld()` → `false` |
| LK-05 | `release()` on unlocked lock is safe | `release()` without `acquire()` | No throw |
| LK-06 | Re-acquire after release succeeds | `acquire()`, `release()`, `acquire()` | Both `acquire()` calls return `true` |
| LK-07 | Double release is safe | `acquire()`, `release()`, `release()` | No throw |
| LK-08 | Concurrent acquire attempts all see consistent state | Two synchronous `acquire()` calls | First `true`, second `false` |

### 14.4 NetworkMonitor Tests

**File:** `packages/platform/src/shared/__tests__/NetworkMonitor.test.ts`

**Setup:** Mock `navigator.onLine` and `window.addEventListener`/`removeEventListener`. Re-mock between tests.

| ID | Test | Setup | Expected |
|----|------|-------|----------|
| NM-01 | `isOnline()` returns `navigator.onLine` value | Mock `navigator.onLine = true` | `isOnline()` → `true` |
| NM-02 | `isOnline()` returns `false` when offline | Mock `navigator.onLine = false` | `isOnline()` → `false` |
| NM-03 | Registers `online` event listener on construction | Construct NetworkMonitor | `window.addEventListener` called with `'online'` |
| NM-04 | Registers `offline` event listener on construction | Construct NetworkMonitor | `window.addEventListener` called with `'offline'` |
| NM-05 | `onStatusChange` callback fires on `online` event | Subscribe callback; simulate `window.dispatchEvent(new Event('online'))` | Callback called with `{ isOnline: true }` |
| NM-06 | `onStatusChange` callback fires on `offline` event | Subscribe callback; simulate `window.dispatchEvent(new Event('offline'))` | Callback called with `{ isOnline: false }` |
| NM-07 | Multiple subscribers all receive notification | Subscribe 2 callbacks; simulate `'online'` event | Both callbacks called |
| NM-08 | Unsubscribe removes callback | Subscribe → get unsubscribe function → call it → simulate event | Callback NOT called |
| NM-09 | `destroy()` removes all DOM listeners | `destroy()`, then simulate event | No listeners remain; callbacks NOT called |
| NM-10 | `destroy()` multiple times is safe | `destroy()`, `destroy()` | No throw |
| NM-11 | Callback fires synchronously on event | Subscribe callback; track execution order | Callback is called before event handler returns |

## 15. Acceptance Criteria

1. `DirtyStateTracker.isDirty()` correctly detects dirty state per 03_SYNC_STATE_MACHINE.md §3
2. `DirtyStateTracker.getPendingCount()` returns correct count across all entity tables including `app_settings`
3. `DirtyStateTracker` discovers entity tables automatically via `sqlite_master` + `pragma_table_info` — no hardcoded table list
4. `SyncTimer.start()` fires callback after configured delay
5. `SyncTimer.reset()` restarts countdown from full delay
6. `SyncTimer.cancel()` prevents callback from firing
7. `SyncTimer.pause()`/`resume()` preserves remaining time
8. `SyncLock.acquire()` returns `true` on first call, `false` on subsequent calls while held
9. `SyncLock.release()` allows re-acquisition
10. `SyncLock.release()` is safe to call in `finally` (no-op when not held)
11. `NetworkMonitor.isOnline()` reflects `navigator.onLine`
12. `NetworkMonitor.onStatusChange()` notifies subscribers on connectivity changes
13. `NetworkMonitor.destroy()` cleans up all event listeners
14. All unit tests pass (`pnpm --filter @collectio/shared test` for files 1–3; `pnpm --filter @collectio/platform test` for file 4)
15. `pnpm typecheck` passes with zero errors across all 5 workspace packages
16. `pnpm lint` passes with zero errors/warnings

## 16. Definition Of Done

- [ ] `DirtyStateTracker.ts` created with `isDirty()`, `getPendingCount()`, `getLatestChange()` methods
- [ ] `DirtyStateTracker` uses `sqlite_master` introspection for table discovery (future-proof for new categories)
- [ ] `SyncTimer.ts` created with `start()`, `reset()`, `cancel()`, `pause()`, `resume()`, `isRunning()`, `getRemainingMs()`, `setDelay()`
- [ ] `SyncTimer` delay clamped to 30,000–600,000ms range
- [ ] `SyncLock.ts` created with `acquire()`, `release()`, `isHeld()`
- [ ] `NetworkMonitor.ts` created in `packages/platform/src/shared/` with `isOnline()`, `onStatusChange()`, `destroy()`
- [ ] `NetworkMonitor` uses `navigator.onLine` + `window.addEventListener('online'/'offline')`
- [ ] `packages/platform/src/shared/index.ts` updated with `NetworkMonitor` export
- [ ] `packages/shared/src/application/sync/index.ts` created with barrel exports
- [ ] `packages/shared/src/application/index.ts` updated with sync module re-exports
- [ ] All 4 test files created with all test cases from §14 passing
- [ ] TypeScript strict mode: zero errors
- [ ] ESLint: zero warnings

## Appendix A: Code Patterns to Follow

| Pattern | Reference File | What to Copy |
|---------|---------------|-------------|
| Class structure | `packages/platform/src/shared/TokenRefresher.ts` | Private fields, constructor injection, no default exports |
| Async method style | `packages/shared/src/data/repositories/AppMetadataRepository.ts` | `async` methods, `await this.db.query<T>(...)` |
| Test file setup | `packages/platform/src/shared/__tests__/TokenRefresher.test.ts` | `describe`/`it`, `beforeEach`/`afterEach`, mock construction |
| Fake timers in tests | Same as above | `jest.useFakeTimers()`, `jest.advanceTimersByTime()` |
| Barrel export | `packages/platform/src/shared/index.ts` | `export { ClassName } from './FileName.js'` (`.js` extension mandatory) |
| Application barrel | `packages/shared/src/application/index.ts` | Re-export from subdirectories |
| JSDoc on public methods | `packages/shared/src/data/database/DatabaseConnection.ts` | Every public method has `@param` and `@returns` |

## Appendix B: Dependency Graph for Batch 1

```
                          DatabaseConnection
                          (already exists)
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
           DirtyStateTracker           [SyncEngine]
           (depends on DB)            (Batch 3 — wire
                    │                 everything together)
                    │
              (no other deps)
                    
                    
              SyncLock                 SyncTimer
           (no dependencies)     (no dependencies —
                                only receives callback
                                and delay via constructor)
                    
                    
             NetworkMonitor
           (no dependencies —
            uses DOM APIs only)
```

No component depends on any other Batch 1 component. All four are independently instantiable and testable.

## Appendix C: Integration Notes for Batch 3

These notes are for the coding agent implementing Batch 3. Do not implement in Batch 1.

**DI Wiring (future):**
```
// apps/*/src/di.ts — Batch 3 will add:
const networkMonitor = new NetworkMonitor();
const syncLock = new SyncLock();
const dirtyStateTracker = new DirtyStateTracker(db);
const syncTimer = new SyncTimer(onSyncTimerExpiry, configuredDelay);
```

**SyncEngine integration (future):**
- `DirtyStateTracker` → called at startup to detect dirty state; called before sync to check if needed
- `SyncTimer` → started on write events; cancelled on manual sync; paused when offline/backgrounded; resumed when online/foregrounded
- `SyncLock` → acquired at sync start; released in `finally` after step 14
- `NetworkMonitor` → `onStatusChange()` calls sync engine's handler for offline/online transitions
