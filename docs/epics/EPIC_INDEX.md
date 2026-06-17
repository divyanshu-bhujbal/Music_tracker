# Epic Index — Personal Collection Manager V1.1

> **Architecture:** Electron (Windows) + Capacitor + React (Android)
> **Revision:** v1.1 — Option A (RN+RNO) rejected after E-00 spike
> **Total Epics:** 18 | **Total Tasks:** 148

---

## Quick Reference

| Epic | Document | Tasks | Platform Impact | Key Dependency |
|------|----------|-------|----------------|----------------|
| E-00 | `E-00_TECHNICAL_SPIKE.md` | 7 | ARCHIVED | COMPLETED — Option A rejected |
| E-00b | `E-00b_CAPACITOR_VALIDATION.md` | 7 | NEW | E-00 |
| E-01 | `E-01_PROJECT_INFRASTRUCTURE.md` | 11 | REWRITTEN | E-00b |
| E-02 | `E-02_DATABASE_LAYER.md` | 15 | REVISED | E-01 |
| E-03 | `E-03_SECURITY_PRIMITIVES.md` | 6 | REVISED | E-01 |
| E-04 | `E-04_PLATFORM_SERVICES.md` | 8 | REVISED | E-03 |
| E-05 | `E-05_CATEGORY_FRAMEWORK.md` | 6 | UNCHANGED | E-02 |
| E-06 | `E-06_SONGS_DATA.md` | 8 | UNCHANGED | E-05 |
| E-07 | `E-07_SONGS_UI.md` | 9 | MINOR (MUI) | E-06, E-15 |
| E-08 | `E-08_SEARCH_FILTER.md` | 7 | UNCHANGED | E-07 |
| E-09 | `E-09_CLOUD_STORAGE.md` | 5 | UNCHANGED | E-04 |
| E-10 | `E-10_SYNC_ENGINE.md` | 15 | UNCHANGED | E-09, E-02 |
| E-11 | _(Conflict Resolution UI — embedded in E-07/E-10)_ | — | — | — |
| E-12 | `E-12_TRASH_RECOVERY.md` | 5 | UNCHANGED | E-07 |
| E-13 | `E-13_BACKUP.md` | 4 | UNCHANGED | E-10 |
| E-14 | `E-14_SETTINGS.md` | 7 | UNCHANGED | E-02 |
| E-15 | `E-15_UI_SHELL.md` | 11 | REVISED | E-01 |
| E-16 | `E-16_TESTING_QA.md` | 10 | REVISED | ALL |
| E-17 | `E-17_RELEASE_PREPARATION.md` | 8 | REVISED | E-16 |
| **Total** | | **148** | | |

---

## Platform Impact Legend

| Tag | Meaning |
|-----|---------|
| **ARCHIVED** | Epic completed; outcome recorded; no further tasks |
| **NEW** | New epic for the revised architecture |
| **REWRITTEN** | Platforms changed entirely; all tasks rewritten |
| **REVISED** | Platform-specific tasks replaced; business logic unchanged |
| **MINOR** | Component library mapping table added; AC preserved |
| **UNCHANGED** | Zero platform dependency; tasks + AC identical |

---

## Dependency Graph (Full)

```
E-00 → E-00b → E-01 ──┬── E-02 ──┬── E-05 ──► E-06 ──┬── E-07 ──┬── E-08
                       │          │                     │          │
                       │          │                     │          └── E-12
                       │          │                     │
                       │          └── E-14              │
                       │                                │
                       ├── E-03 ──► E-04 ──► E-09 ──► E-10 ──► E-13
                       │
                       └── E-15 ──────────────────────► E-07

E-16 ◄── ALL EPICS
  │
  └── E-17
```

```
E-00  (COMPLETED) ──────────────────────────────────────────────────┐
  │                                                                   │
  ▼                                                                   │
E-00b (NEW) ──────────────────────────────────────────────────────┐   │
  │                                                                 │   │
  ▼                                                                 │   │
E-01  (REWRITTEN: pnpm monorepo) ─────────────────────────────────┐│   │
  │                                                                ││   │
  ├── E-02 (REVISED: DB layer) ──┬── E-05 (UNCHANGED: Category) ──┼┼───┘
  │                              │    │                             ││
  │                              │    └── E-06 (UNCHANGED: Songs data)│
  │                              │         │                          │
  │                              │         └── E-07 (MINOR: Songs UI) │
  │                              │              │                     │
  │                              │              ├── E-08 (UNCHANGED: Search)│
  │                              │              └── E-12 (UNCHANGED: Trash) │
  │                              │                                        │
  │                              └── E-14 (UNCHANGED: Settings)           │
  │                                                                        │
  ├── E-03 (REVISED: Security) ──► E-04 (REVISED: Platform) ──┐          │
  │                                                             │          │
  │                                                             ▼          │
  │                                                        E-09 (UNCHANGED: Cloud)─┐
  │                                                             │                │
  │                                                             ▼                │
  │                                                        E-10 (UNCHANGED: Sync) │
  │                                                             │                │
  │                                                             ▼                │
  │                                                        E-13 (UNCHANGED: Backup)│
  │                                                                              │
  └── E-15 (REVISED: UI Shell) ──► E-07                                         │
                                                                                  │
  E-16 (REVISED: Testing) ◄── ALL EPICS ◄────────────────────────────────────────┘
    │
    └── E-17 (REVISED: Release)
```

### Critical Path

```
E-00 → E-00b → E-01 → E-02 → E-05 → E-06 → E-07 → E-16 → E-17
```

### Parallelizable Branches

- **Branch A (DB → Category → Songs → UI):** E-02 → E-05 → E-06 → E-07
- **Branch B (Security → Platform → Cloud → Sync):** E-03 → E-04 → E-09 → E-10
- **Branch C (UI Shell):** E-15 (starts after E-01; feeds E-07)
- **Branches A and B** run in parallel after E-01 completes

---

## Implementation Sequence (Dependency-Ordered)

```
1. E-00   — COMPLETED (historical reference)
2. E-00b  — Capacitor spike (gates the architecture decision)
3. E-01   — Project infrastructure (monorepo, toolchain, CI)
4. E-02   — Database layer (connection adapters, migration runner)
5. E-03   — Security primitives (Argon2id, AES-GCM)
6. E-05   — Category framework (CategoryDefinition, registry)
    ── These can run in parallel after E-01:
         E-15 — UI shell
         E-02 + E-03
7. E-04   — Platform services (OAuth, secure storage)
8. E-06   — Songs data layer
9. E-09   — Cloud storage layer
10. E-07  — Songs UI
11. E-08  — Search and filter engine
12. E-12  — Trash and recovery
13. E-10  — Sync engine (can start after E-09 + E-02)
14. E-14  — Settings and configuration
15. E-13  — Backup system
16. E-16  — Testing and QA
17. E-17  — Release preparation
```

---

## File Inventory

```
docs/epics/
├── EPIC_INDEX.md                        # This file
├── E-00_TECHNICAL_SPIKE.md              # Completed spike (archived)
├── E-00b_CAPACITOR_VALIDATION.md        # Capacitor spike (new)
├── E-01_PROJECT_INFRASTRUCTURE.md       # Monorepo setup (rewritten)
├── E-02_DATABASE_LAYER.md               # DB layer (revised)
├── E-03_SECURITY_PRIMITIVES.md          # Security (revised)
├── E-04_PLATFORM_SERVICES.md            # Platform services (revised)
├── E-05_CATEGORY_FRAMEWORK.md           # Category framework (reference)
├── E-06_SONGS_DATA.md                   # Songs data (reference)
├── E-07_SONGS_UI.md                     # Songs UI (minor update)
├── E-08_SEARCH_FILTER.md                # Search/filter (reference)
├── E-09_CLOUD_STORAGE.md                # Cloud storage (reference)
├── E-10_SYNC_ENGINE.md                  # Sync engine (reference)
├── E-12_TRASH_RECOVERY.md               # Trash/recovery (reference)
├── E-13_BACKUP.md                       # Backup (reference)
├── E-14_SETTINGS.md                     # Settings (reference)
└── E-17_RELEASE_PREPARATION.md          # Release (revised)
```
