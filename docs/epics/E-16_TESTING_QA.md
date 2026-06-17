# E-16: Testing and QA

**Phase:** 4 | **Type:** Quality | **Depends On:** ALL EPICS | **Blocks:** E-17

---

## Overview

**Purpose:** Full test coverage — unit tests for shared package, component tests for renderer, integration tests for sync, manual smoke tests on both platforms, and bug fix cycle.

**Platform impact:** REVISED. Testing tooling changes from React Native Testing Library + Detox to React Testing Library (web) + Playwright.

---

## Tooling Mapping Table

| Original (Option A) | Revised (Option D) | Notes |
|---------------------|-------------------|-------|
| Jest | Jest | Unchanged — same test runner |
| React Native Testing Library | React Testing Library (RTL) | Same API pattern (`render`, `screen`, `fireEvent`, `userEvent`) |
| Detox (Android E2E) | Playwright | Tests the web app in Chromium (matching Electron's renderer) and Android WebView emulation |
| Manual smoke test on RN Android | Manual smoke test on Capacitor Android | Same procedure; different app shell |
| Manual smoke test on RNW Windows | Manual smoke test on Electron Windows | Same procedure; different app shell |
| No Windows E2E (out of scope) | Playwright tests Electron app | Now testable — Electron runs Chromium; Playwright can automate it |

---

## Tasks

### T-16.1 — Unit Tests: Domain Layer

| Property | Detail |
|----------|--------|
| **Depends on** | E-05 |
| **Blocks** | T-16.10 |

**Files produced:**
- `packages/shared/src/domain/__tests__/` — model type validation, interface conformance

**Requirements:**
- All domain models have type-check tests (compile-time + runtime shape verification)
- Interface conformity tests for all provider interfaces

**Acceptance criteria:** Unchanged from original.

---

### T-16.2 — Unit Tests: Application Layer

| Property | Detail |
|----------|--------|
| **Depends on** | E-05, E-08, E-10, E-14 |
| **Blocks** | T-16.10 |

**Files produced:**
- `packages/shared/src/application/__tests__/` — SyncEngine, ConflictResolver, SearchEngine, etc.

**Requirements:**
- Sync algorithm: test all LWW merge scenarios (local newer, remote newer, tie, orphan FK)
- Search/filter: test query composition, AND logic, sort cycling
- Duplicate detection: normalization pipeline, scenario A/B
- Settings: read/write defaults, validation
- Coverage threshold: ≥80% for application layer

**Acceptance criteria:** Unchanged from original.

---

### T-16.3 — Integration Tests: Data Layer

| Property | Detail |
|----------|--------|
| **Depends on** | E-02, E-06 |
| **Blocks** | T-16.10 |

**Files produced:**
- `packages/shared/src/data/__tests__/` — repositories with in-memory SQLite

**Requirements:**
- Use an in-memory SQLite database for tests
- Test all 9 repositories: CRUD, soft-delete, restore, bulk operations, FK enforcement
- Test migration runner: fresh install, incremental upgrade, idempotency, failure recovery
- Test encrypted file format: round-trip, wrong password, tampered data, format errors

**Acceptance criteria:** Unchanged from original.

---

### T-16.4 — Component Tests: Renderer

| Property | Detail |
|----------|--------|
| **Depends on** | E-07, E-15 |
| **Blocks** | T-16.10 |

**Files produced:**
- `packages/renderer/src/__tests__/` — React component tests

**Requirements:**
- Uses `@testing-library/react` with jsdom
- Tests: all screens render, dialogs open/close, form validation, duplicate detection dialog, artist autocomplete, language picker, sidebar collapse/expand, search filtering, column sort
- Coverage threshold: ≥70% for renderer

**Acceptance criteria:** Unchanged from original (behavioral tests). Component rendering uses MUI — RTL queries are library-agnostic (`screen.getByText`, `screen.getByRole`).

---

### T-16.5 — E2E Tests: Electron

| Property | Detail |
|----------|--------|
| **Depends on** | E-10 |
| **Blocks** | T-16.9, T-16.10 |

**Files produced:**
- `apps/electron/e2e/` — Playwright test scripts

**Requirements:**
- Tests: launch Electron app → setup flow → create songs → search → filter → sync → verify cloud upload
- Launches Electron with Playwright's `_electron.launch()`
- Covers critical user journeys

**Acceptance criteria:**
1. Setup flow completes end-to-end
2. Song CRUD works via UI interactions
3. Sync produces expected cloud state
4. All critical-path tests pass

---

### T-16.6 — E2E Tests: Capacitor (Web)

| Property | Detail |
|----------|--------|
| **Depends on** | E-10 |
| **Blocks** | T-16.9, T-16.10 |

**Files produced:**
- `apps/capacitor/e2e/` — Playwright test scripts

**Requirements:**
- Tests the web app in a Chromium browser (matching Android WebView rendering)
- Same test scenarios as T-16.5
- Runs against the Vite dev server

**Acceptance criteria:** Same as T-16.5. Tests run on CI (headless Chromium).

---

### T-16.7 — Create Manual Test Plan

| Property | Detail |
|----------|--------|
| **Depends on** | ALL EPICS |
| **Blocks** | T-16.8, T-16.9 |

**Requirements:**
- Documented test plan covering all FR-* requirements
- All sync edge cases from constitution Section 15
- All recovery scenarios from Section 17.2
- Platform-specific features: right-click, keyboard shortcuts, touch targets, pull-to-refresh

**Acceptance criteria:** Unchanged from original.

---

### T-16.8 — Manual Smoke Test: Electron (Windows)

| Property | Detail |
|----------|--------|
| **Depends on** | T-16.7 |
| **Blocks** | M3 gate |

**Requirements:**
- Install Electron app on Windows machine
- Full manual walkthrough: setup → create 20+ songs → search, sort, filter → duplicate detection → delete + restore → settings → sync → offline mode
- Platform-specific: right-click menus, keyboard shortcuts, hover states, window resize behavior

**Acceptance criteria:** Unchanged from original.

---

### T-16.9 — Manual Smoke Test: Capacitor (Android)

| Property | Detail |
|----------|--------|
| **Depends on** | T-16.7 |
| **Blocks** | M3 gate |

**Requirements:**
- Install Capacitor app on physical Android device
- Same manual walkthrough as T-16.8
- Platform-specific: touch targets, back gesture, pull-to-refresh, keyboard appearance, WebView scroll behavior

**Acceptance criteria:** Unchanged from original.

---

### T-16.10 — Bug Fix Cycle

| Property | Detail |
|----------|--------|
| **Depends on** | T-16.5 through T-16.9 |
| **Blocks** | E-17 |

**Requirements:**
- All critical and high severity bugs fixed
- Medium severity bugs assessed: fixed or deferred with documented rationale
- Regression tests pass
- No new issues introduced by fixes

**Acceptance criteria:** Unchanged from original.
