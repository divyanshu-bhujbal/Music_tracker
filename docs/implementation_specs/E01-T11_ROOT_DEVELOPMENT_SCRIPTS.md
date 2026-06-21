# E01 T11 — Root-Level Development Scripts: Implementation Specification

## 1. Goal

Audit and finalize the root `package.json` scripts section to match the E-01 epic specification. Add the missing `test:watch` script. Fix the broken `clean` pipeline — the root invokes `pnpm -r clean` but zero workspace packages define a `clean` script, so it silently does nothing. Add `clean` scripts to all 5 workspace packages that remove build artifacts (`dist/`, `dist-electron/`, `*.tsbuildinfo`). Verify all 8 epic-specified scripts delegate correctly and satisfy the acceptance criteria. This task is the final wiring step of E-01 — the developer workflow gate.

## 2. Scope

| In scope | Detail |
|----------|--------|
| Root `package.json` | Add `test:watch` script; audit existing 8 scripts |
| `packages/shared/package.json` | Add `clean` script (remove `dist/`, `*.tsbuildinfo`) |
| `packages/renderer/package.json` | Add `clean` script; add `test:watch` script |
| `packages/platform/package.json` | Add `clean` script |
| `apps/electron/package.json` | Add `clean` script (remove `dist/`, `dist-electron/`, `*.tsbuildinfo`) |
| `apps/capacitor/package.json` | Add `clean` script (remove `dist/`, `*.tsbuildinfo`) |
| Verification | `pnpm dev:electron` launches Electron; `pnpm dev:capacitor` serves in browser; `pnpm build` produces artifacts; `pnpm clean` removes them; `pnpm test:watch` starts Jest watcher |

## 3. Out of Scope

| Out of scope | Handled by |
|-------------|-----------|
| `dev:renderer` root script | Not in epic spec. Renderer standalone dev is available via `pnpm --filter @collectio/renderer dev`. |
| Adding `rimraf` as dependency | `rimraf` is used via `npx rimraf` — available from hoisted `node_modules/.bin/`. No new dependency needed. If `rimraf` is not already in `node_modules/`, add as a root devDependency. |
| `build:electron` and `build:capacitor` removal | These already exist and are useful. They are not in the epic spec but removing them risks breaking developer workflow. Keep them. |
| `cap:sync` and `cap:open` scripts | Already exist in `apps/capacitor/package.json` from T-01.6. Not root-level scripts. |
| `pack` and `dist` scripts in electron app | Already exist from T-01.5. E-17 concern. |
| Per-package `dev` scripts | Already exist (renderer: `vite`, electron: `vite`, capacitor: `vite`). No changes needed. |
| `preview` script in renderer | Already exists from T-01.8. Not in epic spec. Keep it. |
| CI workflow modification | T-01.9 CI runs `pnpm test` and `pnpm typecheck` — these scripts already delegate correctly. No CI changes needed. |
| `clean` removing `node_modules/` | `clean` only removes build artifacts, not dependencies. Reinstalling is `pnpm install`. |

## 4. Files to Create

None. All files are modifications.

## 5. Files to Modify

### 5.1 Root `package.json`

- **Purpose:** Finalize the developer workflow scripts at the monorepo root. Add the missing `test:watch` script. Audit all existing scripts against the epic specification.
- **Responsibility:** Provide a unified CLI interface for all cross-package operations: dev servers, builds, linting, type-checking, testing (single-run and watch), and cleanup.
- **Public API:** Consumed by the developer via `pnpm <script-name>` from the repository root. Also consumed by CI (T-01.9) which invokes `pnpm typecheck`, `pnpm lint`, `pnpm test`.

**Current scripts (after T-01.1 through T-01.10):**

| Script | Command | Epic Match | Status |
|--------|---------|------------|--------|
| `dev:electron` | `pnpm --filter @collectio/electron-app dev` | Yes — "runs Electron app in dev mode with Vite HMR" | Working |
| `dev:capacitor` | `pnpm --filter @collectio/capacitor-app dev` | Yes — "runs Vite dev server" | Working |
| `build:electron` | `pnpm --filter @collectio/electron-app build` | Not in epic spec | Working (keep) |
| `build:capacitor` | `pnpm --filter @collectio/capacitor-app build` | Not in epic spec | Working (keep) |
| `build` | `pnpm -r build` | Yes — "builds shared → renderer → electron-app + capacitor-app" | Working |
| `lint` | `pnpm -r lint` | Yes — "eslint across all packages" | Working |
| `typecheck` | `pnpm -r typecheck` | Yes — "tsc --noEmit across all packages" | Working |
| `test` | `pnpm -r test` | Yes — "jest across all packages" | Working |
| `test:watch` | _(missing)_ | Yes — "jest in watch mode" | **ADD** |
| `clean` | `pnpm -r clean` | Yes — "removes all dist/ and build/ directories" | **FIX** (per-package scripts missing) |

**Changes:**

Add `test:watch` script:
```
"test:watch": "pnpm -r test:watch"
```

**No other changes to existing scripts.** All 8 existing scripts are correct and delegate properly. The `dev:electron` and `dev:capacitor` scripts are verified working. `build`, `lint`, `typecheck`, `test`, and `clean` delegate via `pnpm -r` and will work once per-package scripts are fixed.

**Scripts that remain unchanged (audit result):**

| Script | Delegation | Verified |
|--------|-----------|----------|
| `dev:electron` | `pnpm --filter @collectio/electron-app dev` | Electron app has `dev: vite` |
| `dev:capacitor` | `pnpm --filter @collectio/capacitor-app dev` | Capacitor app has `dev: vite` |
| `build:electron` | `pnpm --filter @collectio/electron-app build` | Per-package build does `tsc --noEmit && vite build` |
| `build:capacitor` | `pnpm --filter @collectio/capacitor-app build` | Per-package build does `tsc --noEmit && vite build` |
| `build` | `pnpm -r build` | All 5 packages have `build` scripts; pnpm respects workspace dep order |
| `lint` | `pnpm -r lint` | All 5 packages have `eslint` commands |
| `typecheck` | `pnpm -r typecheck` | All 5 packages have `tsc --noEmit` |
| `test` | `pnpm -r test` | shared + renderer run `jest --coverage`; platform/electron/capacitor echo |
| `clean` | `pnpm -r clean` | Root wired; per-package clean broken (fix below) |

### 5.2 `packages/shared/package.json`

- **Purpose:** Add `clean` script to remove build artifacts from the shared package.
- **Responsibility:** Remove `dist/` directory (tsc declarations output) and `*.tsbuildinfo` files (composite project cache).
- **Public API:** `clean` script consumed by `pnpm -r clean` from root.

**Add to `scripts`:**

| Script | Command |
|--------|---------|
| `clean` | `npx rimraf dist *.tsbuildinfo` |

**What it removes:**
- `dist/` — TypeScript declaration output (`outDir` in tsconfig)
- `*.tsbuildinfo` — TypeScript incremental compilation cache (generated because `composite: true`)

**No `test:watch` script added:** The shared package has real tests (Jest), but adding `test:watch` to shared means `pnpm -r test:watch` would run two concurrent Jest watchers (shared + renderer). This is noisy but acceptable. Shared's `test:watch` is included via renderer's addition.

### 5.3 `packages/renderer/package.json`

- **Purpose:** Add `clean` and `test:watch` scripts to the renderer package.
- **Responsibility:** `clean` removes build artifacts. `test:watch` runs Jest in watch mode for test-driven development.
- **Public API:** Scripts consumed by `pnpm -r clean` and `pnpm -r test:watch` from root.

**Add to `scripts`:**

| Script | Command |
|--------|---------|
| `clean` | `npx rimraf dist *.tsbuildinfo .vite` |
| `test:watch` | `jest --watch` |

**What `clean` removes:**
- `dist/` — Vite build output
- `*.tsbuildinfo` — TypeScript incremental cache
- `.vite/` — Vite dev server cache

### 5.4 `packages/platform/package.json`

- **Purpose:** Add `clean` script to the platform package.
- **Responsibility:** Remove build artifacts.
- **Public API:** Script consumed by `pnpm -r clean` from root.

**Add to `scripts`:**

| Script | Command |
|--------|---------|
| `clean` | `npx rimraf dist *.tsbuildinfo` |

**What it removes:**
- `dist/` — TypeScript declaration output
- `*.tsbuildinfo` — TypeScript incremental cache

**No `test:watch` added:** Platform has an echo `test` script — no test infrastructure to watch.

### 5.5 `apps/electron/package.json`

- **Purpose:** Add `clean` script to the electron app package.
- **Responsibility:** Remove build artifacts including the Electron-specific `dist-electron/` directory.
- **Public API:** Script consumed by `pnpm -r clean` from root.

**Add to `scripts`:**

| Script | Command |
|--------|---------|
| `clean` | `npx rimraf dist dist-electron *.tsbuildinfo` |

**What it removes:**
- `dist/` — Vite renderer build output
- `dist-electron/` — Vite main/preload build output (`vite-plugin-electron`)
- `*.tsbuildinfo` — TypeScript incremental cache (only generated if tsconfig has `composite: true`; app packages currently don't, but safe to include)

**No `test:watch` added:** Electron has echo test script — no test infrastructure.

### 5.6 `apps/capacitor/package.json`

- **Purpose:** Add `clean` script to the capacitor app package.
- **Responsibility:** Remove build artifacts.
- **Public API:** Script consumed by `pnpm -r clean` from root.

**Add to `scripts`:**

| Script | Command |
|--------|---------|
| `clean` | `npx rimraf dist *.tsbuildinfo` |

**What it removes:**
- `dist/` — Vite build output (web assets loaded by Capacitor WebView)
- `*.tsbuildinfo` — TypeScript incremental cache

**No `test:watch` added:** Capacitor has echo test script — no test infrastructure.

## 6. Interfaces

No runtime interfaces. The interface is the script name contract between root and workspace packages:

| Root Script | Expected Per-Package Scripts |
|------------|------------------------------|
| `pnpm -r build` | Each package must have `build` |
| `pnpm -r lint` | Each package must have `lint` |
| `pnpm -r typecheck` | Each package must have `typecheck` |
| `pnpm -r test` | Each package must have `test` |
| `pnpm -r test:watch` | Each package may have `test:watch` (optional — pnpm skips missing scripts) |
| `pnpm -r clean` | Each package must have `clean` (required — otherwise `clean` silently does nothing) |
| `pnpm --filter @collectio/electron-app dev` | `apps/electron/` must have `dev` |
| `pnpm --filter @collectio/capacitor-app dev` | `apps/capacitor/` must have `dev` |

**Note:** `pnpm -r` runs a script in all workspace packages that define it. If a package lacks the script, pnpm silently skips it (no error). This is acceptable for `test:watch` but unacceptable for `clean` — hence `clean` must be added to all 5 packages.

## 7. Data Flow

```
Developer invokes: pnpm dev:electron
  → Root: pnpm --filter @collectio/electron-app dev
    → apps/electron/: vite
      → vite-plugin-electron compiles main.ts + preload.ts to dist-electron/
      → @vitejs/plugin-react compiles renderer entry (imports from @collectio/renderer)
      → Electron BrowserWindow opens
      → Window loads localhost dev server
      → HMR: edit renderer source → electron window updates

Developer invokes: pnpm dev:capacitor
  → Root: pnpm --filter @collectio/capacitor-app dev
    → apps/capacitor/: vite
      → @vitejs/plugin-react compiles renderer entry
      → Dev server starts on default port
      → Browser opens → shows renderer content

Developer invokes: pnpm build
  → Root: pnpm -r build
    → shared:     tsc --noEmit
    → renderer:   tsc --noEmit && vite build
    → platform:   tsc --noEmit
    → electron:   tsc --noEmit && vite build
    → capacitor:  tsc --noEmit && vite build
    (pnpm respects workspace dependency order: shared first, then renderer+platform, then apps)

Developer invokes: pnpm lint
  → Root: pnpm -r lint
    → All 5 packages run eslint on their source files

Developer invokes: pnpm typecheck
  → Root: pnpm -r typecheck
    → All 5 packages run tsc --noEmit

Developer invokes: pnpm test
  → Root: pnpm -r test
    → shared:    jest --coverage (real tests, coverage threshold 80%)
    → renderer:  jest --coverage (real tests, coverage threshold 70%)
    → platform:  echo 'tests not configured yet' (exit 0)
    → electron:  echo 'tests not configured yet' (exit 0)
    → capacitor: echo 'tests not configured yet' (exit 0)

Developer invokes: pnpm test:watch
  → Root: pnpm -r test:watch
    → shared:    jest --watch (interactive watch mode)
    → renderer:  jest --watch (interactive watch mode)
    → platform:  (no test:watch script — pnpm skips)
    → electron:  (no test:watch script — pnpm skips)
    → capacitor: (no test:watch script — pnpm skips)

Developer invokes: pnpm clean
  → Root: pnpm -r clean
    → shared:    npx rimraf dist *.tsbuildinfo
    → renderer:  npx rimraf dist *.tsbuildinfo .vite
    → platform:  npx rimraf dist *.tsbuildinfo
    → electron:  npx rimraf dist dist-electron *.tsbuildinfo
    → capacitor: npx rimraf dist *.tsbuildinfo
    (runs concurrently — all packages cleaned in parallel)
```

## 8. State Changes

| Before | After |
|--------|-------|
| Root has 9 scripts | Root has 10 scripts (add `test:watch`) |
| No `test:watch` script at root or in any package | Root + shared + renderer have `test:watch` |
| `pnpm test:watch` fails "Missing script: test:watch" | `pnpm test:watch` starts Jest watchers for shared + renderer |
| Zero workspace packages have `clean` script | All 5 workspace packages have `clean` |
| `pnpm clean` succeeds but removes nothing (silent no-op) | `pnpm clean` removes `dist/`, `dist-electron/`, `*.tsbuildinfo`, `.vite/` from all packages |
| `pnpm build` after install — produces artifacts | `pnpm clean && pnpm build` — clean removes everything, build regenerates |

## 9. Database Changes

None. Pure script configuration task.

## 10. Error Handling

| Failure scenario | Behavior |
|-----------------|----------|
| `pnpm clean` fails — `rimraf` not found | `npx` downloads `rimraf` automatically. If offline: install `rimraf` as root devDependency first. |
| `pnpm clean` fails — permission denied | File locked by running process (e.g., Electron dev server still open). Stop running processes, retry. |
| `pnpm test:watch` fails — `jest --watch` not recognized | Verify `jest` is in `devDependencies` of the package. T-01.10 added it. |
| `pnpm dev:electron` fails after `pnpm clean` | Clean removed `dist-electron/`. Vite regenerates it. No failure expected. |
| `pnpm -r clean` runs but some package fails | pnpm continues to next package. Exit code from failed package surfaces. |
| `pnpm test:watch` terminal output interleaved | Two jest watchers output to same terminal. Expected. Developer runs per-package watch if clarity needed. |
| `rimraf` glob pattern doesn't match on Windows | `rimraf` handles glob expansion internally — works cross-platform. `*.tsbuildinfo` matches in all shells. |
| `pnpm -r test:watch` fails because only 2 of 5 packages have the script | pnpm `-r` only runs in packages that define the script. Missing scripts are silently skipped. No error. |

## 11. Logging Requirements

None beyond standard CLI output from delegated tools:
- `vite` (dev/build): port number, build output sizes, HMR status
- `tsc`: file paths and line numbers for type errors, or no output on success
- `eslint`: violation details, or no output on success
- `jest`: test suite counts, pass/fail, coverage summary table
- `rimraf`: no output on success (standard Unix behavior)

## 12. Security Requirements

| Requirement | How satisfied |
|-------------|---------------|
| No secrets in scripts | All scripts delegate to package-level commands — no tokens, keys, or credentials |
| `clean` does not delete outside the package | `rimraf` is invoked with relative paths from each package directory |
| `clean` does not delete `node_modules/` | Only `dist/`, `dist-electron/`, `*.tsbuildinfo`, `.vite/` — explicitly scoped |
| Scripts are auditable | All commands are explicit shell invocations with no `eval` or dynamic code execution |

## 13. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-1 | `pnpm dev:electron` launches an Electron window | Run command — Electron window opens, displays renderer content |
| AC-2 | `pnpm dev:capacitor` serves the app in a browser | Run command — Vite dev server starts; browser opens at localhost URL |
| AC-3 | `pnpm build` runs across all 5 packages and exits 0 | Run command — all 5 packages build; `dist/` directories produced |
| AC-4 | `pnpm lint` runs ESLint across all packages and exits 0 | Run command — all 5 packages pass lint |
| AC-5 | `pnpm typecheck` runs tsc across all packages and exits 0 | Run command — all 5 packages type-check clean |
| AC-6 | `pnpm test` runs Jest + echo across all packages and exits 0 | Run command — shared + renderer pass Jest; others echo exit 0 |
| AC-7 | `pnpm test:watch` starts Jest watchers | Run command — Jest watch mode starts for shared + renderer; interactive prompt appears |
| AC-8 | `pnpm clean` removes build artifacts from all packages | Run command — verify `dist/`, `dist-electron/`, `*.tsbuildinfo` deleted |
| AC-9 | `pnpm build` succeeds after `pnpm clean` | Run `pnpm clean && pnpm build` — artifacts regenerated, build exits 0 |
| AC-10 | All workspace packages have `clean` script | Inspect each `package.json` — all 5 contain `"clean"` key |
| AC-11 | `clean` script uses `rimraf` (cross-platform) | Inspect each clean command — uses `npx rimraf`, not `rm -rf` or `del` |
| AC-12 | Root has `test:watch` script | Inspect root `package.json` — `"test:watch": "pnpm -r test:watch"` |
| AC-13 | Existing scripts unchanged (no regression) | Diff root `package.json` before/after — only `test:watch` added |

## 14. Test Cases

| # | Test | Steps | Expected |
|---|------|-------|----------|
| TC-1 | dev:electron launches | `pnpm dev:electron` from root | Electron window opens; no errors in console |
| TC-2 | dev:capacitor serves | `pnpm dev:capacitor` from root | Vite dev server starts; browser opens |
| TC-3 | build succeeds | `pnpm build` from root | All 5 packages build; exit 0 |
| TC-4 | lint succeeds | `pnpm lint` from root | All 5 packages pass; exit 0 |
| TC-5 | typecheck succeeds | `pnpm typecheck` from root | All 5 packages pass; exit 0 |
| TC-6 | test succeeds | `pnpm test` from root | Shared + renderer pass Jest; others echo; exit 0 |
| TC-7 | test:watch starts | `pnpm test:watch` from root | Jest watch mode starts; "Press a to run all tests" prompt |
| TC-8 | clean removes artifacts | 1. `pnpm build`<br>2. `pnpm clean`<br>3. Check packages for `dist/` | No `dist/`, `dist-electron/`, or `*.tsbuildinfo` remain |
| TC-9 | build after clean | `pnpm clean && pnpm build` | Build succeeds; artifacts regenerated |
| TC-10 | shared has clean + no test:watch | Inspect `packages/shared/package.json` | Has `clean`; no `test:watch` (optional) |
| TC-11 | renderer has clean + test:watch | Inspect `packages/renderer/package.json` | Has both `clean` and `test:watch` |
| TC-12 | platform has clean | Inspect `packages/platform/package.json` | Has `clean` |
| TC-13 | electron has clean | Inspect `apps/electron/package.json` | Has `clean` |
| TC-14 | capacitor has clean | Inspect `apps/capacitor/package.json` | Has `clean` |
| TC-15 | clean on all packages without errors | `pnpm clean` (even if no artifacts exist) | Exit 0 — `rimraf` doesn't error on missing paths |
| TC-16 | Existing root scripts unchanged | Diff root scripts before vs after | Only `test:watch` is new; all others identical |
| TC-17 | `rimraf` available in each package context | `cd packages/shared && npx rimraf --version` | Outputs version number |
| TC-18 | `clean` removes only intended files | After `pnpm clean`, verify `node_modules/`, `src/`, `package.json` remain | Source code and dependencies untouched |

## 15. Definition of Done

1. Root `package.json` has `"test:watch": "pnpm -r test:watch"` added to `scripts`
2. `packages/shared/package.json` has `"clean": "npx rimraf dist *.tsbuildinfo"` in `scripts`
3. `packages/renderer/package.json` has `"clean": "npx rimraf dist *.tsbuildinfo .vite"` and `"test:watch": "jest --watch"` in `scripts`
4. `packages/platform/package.json` has `"clean": "npx rimraf dist *.tsbuildinfo"` in `scripts`
5. `apps/electron/package.json` has `"clean": "npx rimraf dist dist-electron *.tsbuildinfo"` in `scripts`
6. `apps/capacitor/package.json` has `"clean": "npx rimraf dist *.tsbuildinfo"` in `scripts`
7. `pnpm dev:electron` launches Electron window (blank, no features) with no errors
8. `pnpm dev:capacitor` serves app in browser with no errors
9. `pnpm build` exits 0 across all 5 packages
10. `pnpm lint` exits 0 across all 5 packages
11. `pnpm typecheck` exits 0 across all 5 packages
12. `pnpm test` exits 0 across all 5 packages
13. `pnpm test:watch` starts Jest watch mode for shared + renderer
14. `pnpm clean` removes build artifacts from all 5 packages, exits 0
15. `pnpm build` succeeds after `pnpm clean` (artifacts regenerated)
16. All `clean` scripts use `npx rimraf` (cross-platform), not `rm -rf` or `del`
17. No existing scripts were changed (only additions)

## 16. Implementation Order

1. Add `"clean": "npx rimraf dist *.tsbuildinfo"` to `packages/shared/package.json` scripts
2. Add `"clean"` and `"test:watch"` to `packages/renderer/package.json` scripts
3. Add `"clean": "npx rimraf dist *.tsbuildinfo"` to `packages/platform/package.json` scripts
4. Add `"clean": "npx rimraf dist dist-electron *.tsbuildinfo"` to `apps/electron/package.json` scripts
5. Add `"clean": "npx rimraf dist *.tsbuildinfo"` to `apps/capacitor/package.json` scripts
6. Add `"test:watch": "pnpm -r test:watch"` to root `package.json` scripts
7. Verify `rimraf` is available: `npx rimraf --version` from root
8. Run `pnpm build` — verify all packages build, exit 0
9. Run `pnpm clean` — verify output directories removed from all packages
10. Run `pnpm build` — verify artifacts regenerated after clean
11. Run `pnpm test:watch` — verify Jest watch starts (Ctrl+C to exit)
12. Run `pnpm test` — verify all tests pass
13. Run `pnpm lint` — verify all packages pass lint
14. Run `pnpm typecheck` — verify all packages pass typecheck
15. Run `pnpm dev:electron` — verify Electron window launches (close it after)
16. Run `pnpm dev:capacitor` — verify Vite dev server starts (Ctrl+C to exit)

## 17. Traceability

| Source Document | Section | Requirement |
|----------------|---------|-------------|
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.11 | 8 root scripts: dev:electron, dev:capacitor, build, lint, typecheck, test, test:watch, clean |
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.11 AC-1 | `pnpm dev:electron` launches working Electron app (blank, no features) |
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.11 AC-2 | `pnpm dev:capacitor` launches app in browser |
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.11 AC-3 | `pnpm build` produces artifacts for both platforms |
| `PROJECT_CONSTITUTION.md` | Section 12 | Build system: Vite, pnpm, TypeScript — all invoked via root scripts |
| `01_ARCHITECTURE.md` | Section 2 | Technology stack table — tooling invoked via these scripts |
| `05_FOLDER_STRUCTURE.md` | Section 1 | `pnpm-workspace.yaml` + root `package.json` — scripts delegate to workspace packages |
| `07_AGENT_RULES.md` | Rule 9.6 | Never quote globs in npm scripts — `rimraf` globs are unquoted |
| `07_AGENT_RULES.md` | Rule 9.4 | Verify TypeScript before build — `build` scripts in apps/renderer do `tsc --noEmit && vite build` |
| `07_AGENT_RULES.md` | Rule 4.3 | Use `isConnection()` before `createConnection()` — not affected by script changes |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-04 | `node-linker=hoisted` — `npx rimraf` resolves from root `node_modules/.bin/` |
