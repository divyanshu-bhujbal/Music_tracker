# E01 T09 — Configure CI Pipeline: Implementation Specification

## 1. Goal

Create a GitHub Actions CI pipeline (`.github/workflows/ci.yml`) that runs on every push to any branch and every pull request targeting `main`. The pipeline enforces quality gates — `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm test` — across all 5 workspace packages. Failing any gate blocks the commit from being merged. This establishes an automated, enforceable quality baseline before any application code is written, satisfying the M0 milestone criterion: "Project monorepo with CI running lint and tests on every commit."

This task also fixes a pre-existing gap: `apps/electron/package.json` is missing a `test` script, which would cause `pnpm -r test` to error with "Missing script: test".

## 2. Scope

| In scope | Detail |
|----------|--------|
| `.github/workflows/ci.yml` | GitHub Actions workflow — trigger, jobs, steps, caching |
| Workflow triggers | `push` to any branch + `pull_request` targeting `main` |
| CI job steps | Checkout → Setup Node.js 20 → Setup pnpm 9 → `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm test` |
| Caching | pnpm store cache to speed up installs; node_modules from CI cache |
| Failure mode | Any step with non-zero exit code fails the workflow (red X on commit) |
| `apps/electron/package.json` | Add missing `"test": "echo 'tests not configured yet'"` script |

## 3. Out of Scope

| Out of scope | Handled by |
|-------------|-----------|
| Real test implementation | T-01.10 (Configure Jest + React Testing Library) — CI's `pnpm test` step runs placeholder `echo` scripts that exit 0 |
| `pnpm build` step in CI | Not required by epic spec. `typecheck` already runs `tsc --noEmit`. Adding `build` is optional — can be added later if needed. The epic lists steps as: checkout → install → typecheck → lint → test. |
| Android APK builds in CI | E-17 (Release Preparation) — requires Android SDK, Gradle, and emulator infrastructure |
| Windows installer builds in CI | E-17 — requires Windows runner (more expensive) and signing certificates |
| Electron-builder packaging | E-17 — not needed at scaffolding stage |
| Code coverage reporting (Coveralls, Codecov) | E-16 (Testing & QA) — add when real tests exist |
| Deployment or release automation | E-17 — deferred to release preparation |
| Matrix builds (multi-OS, multi-Node version) | V2 — V1 targets single OS (Linux) and single Node version (20.x) |
| Renovate / Dependabot configuration | V2 — dependency update automation is not in epic spec |
| PR status checks / branch protection rules | GitHub repository settings — configured manually by repo admin, not in the workflow file |
| `pnpm build` step | Not in epic spec steps. All packages `build` script does `tsc --noEmit` + optional `vite build`. The `typecheck` step already covers `tsc --noEmit`. Adding `build` is a minor improvement (catches Vite config errors) but not gating. |
| Secrets or environment variables in CI | No secrets needed — no tokens, credentials, or API keys required for lint/typecheck/test |

## 4. Files to Create

### 4.1 `.github/workflows/ci.yml`

- **Purpose:** GitHub Actions workflow definition — the CI pipeline that runs on every push and PR.
- **Responsibility:** Define trigger events, job configuration, Node.js and pnpm setup, caching strategy, and the ordered sequence of quality gate steps. Enforce that a commit is only "green" when all steps pass.
- **Public API:** Consumed by GitHub Actions engine. Visible in the "Actions" tab of the GitHub repository. Status reported on commits and PRs.

**Workflow structure:**

```
1. name: CI

2. on:
   - push (any branch)
   - pull_request (targeting main)

3. jobs:
   - ci:
     - runs-on: ubuntu-latest
     - timeout-minutes: 10
     - strategy: (default — single job, no matrix)

4. Steps (ordered, sequential):
   a. Checkout repository
      - actions/checkout@v4

   b. Setup Node.js
      - actions/setup-node@v4
      - node-version: 20
      - (pnpm is set up separately)

   c. Setup pnpm
      - pnpm/action-setup@v4
      - version: 9
      - (uses Node.js 20 — compatible with pnpm 9.x)

   d. Get pnpm store directory
      - Shell command: pnpm store path
      - Output captured for cache key

   e. Cache pnpm store
      - actions/cache@v4
      - Path: pnpm store directory from step (d)
      - Key: pnpm-{{ runner.os }}-{{ hashFiles('pnpm-lock.yaml') }}
      - Restore-keys: pnpm-{{ runner.os }}-

   f. Install dependencies
      - run: pnpm install --frozen-lockfile
      - (--frozen-lockfile: fail if lockfile is out of sync, don't modify it)

   g. Typecheck
      - run: pnpm typecheck
      - (runs tsc --noEmit in all 5 packages)

   h. Lint
      - run: pnpm lint
      - (runs eslint in all 5 packages)

   i. Test
      - run: pnpm test
      - (runs placeholder scripts — exits 0 until T-01.10 adds real tests)
```

**Key decisions:**

| Decision | Rationale |
|----------|-----------|
| **AD-T09-01:** `ubuntu-latest` runner | Cheapest, fastest GitHub Actions runner. No platform-specific builds — CI validates code quality only (TypeScript, lint, test). Android/Windows builds are E-17. |
| **AD-T09-02:** Node.js 20 | Minimum version compatible with pnpm 9.x per PK-07. "Node 20.x (minimum for pnpm 9.x)" from version compatibility matrix. |
| **AD-T09-03:** pnpm 9 (not 11) | pnpm 11 requires Node 22+ (built-in `node:sqlite`). Pinning to 9 prevents CI from auto-upgrading to incompatible version. |
| **AD-T09-04:** `--frozen-lockfile` on install | Prevents CI from silently modifying `pnpm-lock.yaml`. If `package.json` deps drift from lockfile, CI fails explicitly. |
| **AD-T09-05:** pnpm store cache (not node_modules cache) | Caching the pnpm global store is faster and more reliable than caching `node_modules/`. pnpm's content-addressable store deduplicates across all packages. |
| **AD-T09-06:** No `build` step | The epic spec explicitly lists steps: checkout → install → typecheck → lint → test. `build` is not in that list. The `typecheck` step already covers `tsc --noEmit` (which is what 3 of 5 packages' `build` scripts do). App packages' `build` additionally runs `vite build` — not needed for quality gating at scaffolding. |
| **AD-T09-07:** `timeout-minutes: 10` | Scaffold code is minimal — install + typecheck + lint + test completes in under 2 minutes. 10 minutes is generous headroom. |
| **AD-T09-08:** Single job, no matrix | No multi-OS or multi-Node testing needed at V1 scaffolding. Simpler is better. A matrix can be added in E-16 if needed. |

## 5. Files to Modify

### 5.1 `apps/electron/package.json`

- **Purpose:** Add missing `test` script so `pnpm -r test` doesn't error on the electron package.
- **Responsibility:** Provide a placeholder `test` script that exits 0, matching the pattern used by `shared`, `renderer`, `platform`, and `capacitor`.
- **Public API:** `scripts.test` consumed by `pnpm -r test` from root and CI.

**Change:**

| Field | Before | After |
|-------|--------|-------|
| `scripts.test` | _(not present)_ | `"echo 'tests not configured yet'"` |

**Rationale:** `pnpm -r test` iterates all workspace packages. If any package lacks a `test` script, pnpm errors "Missing script: test". The electron app is the only package currently missing this script. Adding the same placeholder as the other 4 packages prevents a hard CI failure. When T-01.10 adds real test infrastructure, this placeholder is replaced with a real test runner command.

## 6. Interfaces

No runtime interfaces. The CI pipeline is a declarative YAML configuration consumed by GitHub Actions. The interface is the contract between developer workflow and quality gates:

- **Trigger interface:** Push and PR events from GitHub's event system
- **Script interface:** Root `package.json` scripts (`pnpm typecheck`, `pnpm lint`, `pnpm test`) — these are the stable CI entry points
- **Package interface:** Every workspace package MUST have `typecheck`, `lint`, and `test` scripts (name contract)
- **Exit code interface:** Any step returning non-zero exit code fails the workflow (standard Unix convention)

## 7. Data Flow

```
Developer pushes a commit to a branch
  → GitHub receives push event
    → GitHub Actions reads .github/workflows/ci.yml
      → Job: ci (ubuntu-latest)
        → Step 1: actions/checkout@v4
          → Clones repository at the pushed commit SHA
        → Step 2: actions/setup-node@v4
          → Installs Node.js 20.x
        → Step 3: pnpm/action-setup@v4
          → Installs pnpm 9.x
        → Step 4: Get pnpm store path
          → Shell: pnpm store path → captures output
        → Step 5: actions/cache@v4
          → Restores pnpm global store cache if key matches
          → Cache key: pnpm-linux-<hash of pnpm-lock.yaml>
        → Step 6: pnpm install --frozen-lockfile
          → Reads pnpm-lock.yaml (exact versions)
          → Installs from cached store where possible
          → Fails if lockfile is out of sync with package.json files
          → Exit 0 → next step
          → Exit non-zero → workflow fails (red)
        → Step 7: pnpm typecheck
          → Root script: pnpm -r typecheck
          → Runs in each package:
            - packages/shared:     tsc --noEmit  (strict mode)
            - packages/renderer:   tsc --noEmit  (strict + JSX)
            - packages/platform:   tsc --noEmit  (strict)
            - apps/electron:       tsc --noEmit  (strict + node)
            - apps/capacitor:      tsc --noEmit  (strict + JSX)
          → Any tsc error → non-zero exit → workflow fails
          → Exit 0 → next step
        → Step 8: pnpm lint
          → Root script: pnpm -r lint
          → Runs in each package:
            - shared:     eslint src/**/*.ts
            - renderer:   eslint src/**/*.{ts,tsx}
            - platform:   eslint src/**/*.ts
            - electron:   eslint src/**/*.{ts,tsx}
            - capacitor:  eslint src/**/*.{ts,tsx}
          → Any eslint violation → non-zero exit → workflow fails
          → Exit 0 → next step
        → Step 9: pnpm test
          → Root script: pnpm -r test
          → Runs in each package:
            - shared:     echo 'tests not configured yet'  (exit 0)
            - renderer:   echo 'tests not configured yet'  (exit 0)
            - platform:   echo 'tests not configured yet'  (exit 0)
            - electron:   echo 'tests not configured yet'  (exit 0)
            - capacitor:  echo 'tests not configured yet'  (exit 0)
          → Exit 0 → workflow passes (green)

Developer opens a pull request targeting main
  → Same flow as push
  → PR shows CI status check (green check or red X)
  → Branch protection rules (if configured) can require CI to pass before merge
```

**Post T-01.10 data flow (future):**
When T-01.10 replaces placeholder `test` scripts with Jest + RTL:
- `shared`: `jest` → real tests run → exit code reflects actual pass/fail
- `renderer`: `jest` with jsdom → React component tests run
- CI automatically enforces real tests without any workflow file change

## 8. State Changes

| Before | After |
|--------|-------|
| No `.github/` directory exists | `.github/workflows/ci.yml` exists |
| No CI pipeline | GitHub Actions workflow runs on every push and PR |
| `apps/electron/package.json` has no `test` script | Has `"test": "echo 'tests not configured yet'"` |
| `pnpm -r test` errors "Missing script: test" on electron | `pnpm -r test` succeeds — all 5 packages have test scripts |
| No automated quality enforcement | Every commit is automatically typechecked and linted |
| No status checks on PRs | PRs show CI status (green/red) |
| Push with type error has no automated feedback | Push with type error → CI fails → red X on commit |
| Push with lint error has no automated feedback | Push with lint error → CI fails → red X on commit |

## 9. Database Changes

None. Pure CI infrastructure configuration task.

## 10. Error Handling

| Failure scenario | CI behavior |
|-----------------|------------|
| `pnpm/action-setup@v4` fails — network issue | Workflow fails at setup step. Re-run manually or wait for network recovery. |
| `pnpm install --frozen-lockfile` fails — lockfile out of sync | Workflow fails at install step. Developer must run `pnpm install` locally to update lockfile, then push updated `pnpm-lock.yaml`. |
| `pnpm install` fails — package not found | Exact version pins ensure this only happens if npm registry is down or package is unpublished. Workflow fails at install step. |
| `pnpm typecheck` fails — TypeScript error in code | Workflow fails at typecheck step. Error output shows file path, line number, and error message. Developer fixes error and pushes. |
| `pnpm lint` fails — ESLint violation in code | Workflow fails at lint step. Error output shows file path, line number, rule name. Developer fixes violation and pushes. |
| `pnpm test` fails — test failure (future, after T-01.10) | Workflow fails at test step. Error output shows failing test name and expectation. Developer fixes test or code. |
| `pnpm -r test` errors — package missing test script | Workflow fails at test step. This is the bug T-01.9 fixes by adding `test` script to electron. After fix, CI passes. |
| Cache miss (first run or lockfile changed) | pnpm install downloads all packages. Slower (~30-60s) but succeeds. Cache populates for next run. |
| Workflow times out (>10 minutes) | GitHub Actions kills the job. Investigate hung test or infinite loop. Timeout protects against runaway processes. |
| GitHub Actions service outage | Workflow doesn't run. Commit status shows "pending". Developers can still merge manually (if branch protection not configured). |

## 11. Logging Requirements

GitHub Actions provides built-in logging:
- Each step's stdout and stderr are captured and displayed in the Actions UI
- Failed steps show the error output inline
- Step timings are recorded (duration visible in UI)
- Workflow run history is retained per GitHub's default retention policy (90 days)

No additional logging configuration is needed. The root `package.json` scripts delegate to pnpm, which logs each package's script execution. CI inherits this transparently.

## 12. Security Requirements

| Requirement | How satisfied |
|-------------|---------------|
| No secrets in workflow file | `ci.yml` is purely declarative — no tokens, API keys, or credentials |
| No GitHub token misuse | `actions/checkout@v4` uses the built-in `GITHUB_TOKEN` (auto-generated, ephemeral, scoped to the repository) |
| `GITHUB_TOKEN` has minimal permissions | Default permissions: read repository contents, write checks/statuses. No write access to repository code. |
| No third-party action abuse | All actions used are official GitHub/verified: `actions/checkout@v4` (GitHub), `actions/setup-node@v4` (GitHub), `actions/cache@v4` (GitHub), `pnpm/action-setup@v4` (pnpm org) |
| Pinned action versions | All actions use `@v4` (major version), which is the standard pattern for GitHub Actions stability. Major version tags are maintained by action authors and receive security patches. |
| No unfiltered user input in CI | The workflow runs code from the repository only — no external scripts or parameters |
| `--frozen-lockfile` prevents dependency injection | Lockfile must match what's in the repository. An attacker cannot inject malicious package versions by modifying `package.json` without also updating the lockfile (which CI would reject) |
| Workflow file is version-controlled and reviewed | `.github/workflows/ci.yml` is committed to the repo — all changes go through PR review |

## 13. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-1 | `.github/workflows/ci.yml` exists | File present at expected path in repository |
| AC-2 | Workflow triggers on push to any branch | Push a commit → "Actions" tab shows running workflow |
| AC-3 | Workflow triggers on PR targeting `main` | Open a PR against `main` → PR shows CI status check |
| AC-4 | `pnpm install` succeeds in CI | CI log shows install step passing with exit 0 |
| AC-5 | `pnpm typecheck` succeeds in CI (clean code) | CI log shows typecheck step passing all 5 packages |
| AC-6 | `pnpm lint` succeeds in CI (clean code) | CI log shows lint step passing all 5 packages |
| AC-7 | `pnpm test` succeeds in CI (placeholder tests) | CI log shows test step passing all 5 packages |
| AC-8 | TypeScript error causes CI failure (red) | Push a commit with a type error → CI fails at typecheck step |
| AC-9 | Lint error causes CI failure (red) | Push a commit with a lint violation → CI fails at lint step |
| AC-10 | `pnpm -r test` does not error on electron package | Electron now has `test` script — no "Missing script" error |
| AC-11 | Cache works on second run | Re-run workflow without lockfile changes → pnpm install step is faster (cache hit) |
| AC-12 | Workflow file is valid YAML | GitHub Actions parses the file without syntax errors |
| AC-13 | All workflows complete within 10 minutes | Even with cold cache, scaffold code is fast |
| AC-14 | `pnpm install` uses `--frozen-lockfile` | Inspect workflow file — install command includes flag |

## 14. Test Cases

| # | Test | Steps | Expected |
|---|------|-------|----------|
| TC-1 | Create workflow file | 1. Create `.github/` directory<br>2. Create `workflows/ci.yml` with full spec<br>3. Add `test` script to electron package.json | File exists; valid YAML |
| TC-2 | Push triggers CI | Push a commit to a branch | Workflow appears in "Actions" tab; runs to completion |
| TC-3 | CI passes on clean code | Push a commit with no type/lint errors | All 5 packages pass typecheck + lint + test; green check |
| TC-4 | TypeScript error fails CI | 1. Add `const x: number = "wrong"` to `packages/shared/src/index.ts`<br>2. Push commit | CI fails at typecheck step; red X; error message shows type mismatch |
| TC-5 | Lint error fails CI | 1. Add `const x: any = 1` to `packages/shared/src/index.ts`<br>2. Push commit | CI fails at lint step; red X; error message shows `no-explicit-any` |
| TC-6 | PR triggers CI | 1. Create a branch<br>2. Push a commit<br>3. Open PR against `main` | PR shows CI status check; green check on clean code |
| TC-7 | `pnpm -r test` passes all packages | Run `pnpm -r test` locally | All 5 packages exit 0; no "Missing script" error |
| TC-8 | Cache hit on second run | 1. Push commit (CI runs, populates cache)<br>2. Push another commit without changing `pnpm-lock.yaml` | Second run's install step is faster; cache key matches |
| TC-9 | Cache miss on lockfile change | 1. Add a dummy dependency<br>2. Run `pnpm install` locally<br>3. Commit updated lockfile<br>4. Push | CI cache key changes; full install runs; new cache saved |
| TC-10 | `--frozen-lockfile` rejects mismatched lockfile | 1. Modify a version in a package.json without running `pnpm install`<br>2. Push commit | `pnpm install` in CI fails; "ERR_PNPM_OUTDATED_LOCKFILE" |
| TC-11 | Electron app has test script | `cd apps/electron && pnpm test` | Outputs "tests not configured yet"; exit 0 |
| TC-12 | Workflow completes under 10 minutes | Push a clean commit; observe CI runtime | Total duration <2 minutes (including cache miss) |
| TC-13 | Node.js version is 20.x | Inspect CI log "Setup Node.js" step | Logs: "Node.js version: 20.x.x" |
| TC-14 | pnpm version is 9.x | Inspect CI log "Setup pnpm" step | Logs: "pnpm version: 9.x.x" |
| TC-15 | Clean up test violations | Revert TC-4 and TC-5 changes | CI passes; all packages clean |

## 15. Definition of Done

1. `.github/workflows/ci.yml` exists with correct YAML syntax (parsed by GitHub Actions without errors)
2. Workflow triggers on `push` (any branch) and `pull_request` (targeting `main`)
3. Workflow uses `ubuntu-latest` runner with `timeout-minutes: 10`
4. Job steps execute in order: checkout → setup Node 20 → setup pnpm 9 → cache → install → typecheck → lint → test
5. `pnpm install` uses `--frozen-lockfile` flag
6. pnpm store cache is configured with key `pnpm-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}`
7. `apps/electron/package.json` has `"test": "echo 'tests not configured yet'"` in scripts
8. Pushing a clean commit → CI passes (green check) on all 5 packages
9. Pushing a commit with a type error → CI fails (red X) at typecheck step
10. Pushing a commit with a lint error → CI fails (red X) at lint step
11. Opening a PR against `main` → CI runs and status is visible on the PR
12. `pnpm -r test` runs successfully across all 5 packages (no "Missing script" errors)
13. All actions are from official sources: `actions/checkout@v4`, `actions/setup-node@v4`, `actions/cache@v4`, `pnpm/action-setup@v4`
14. No secrets, tokens, or credentials in the workflow file
15. Workflow completes within 10 minutes (with cold cache)

## 16. Implementation Order

1. Create `.github/` directory at repository root
2. Create `.github/workflows/` directory
3. Create `.github/workflows/ci.yml` with the workflow definition
4. Add `"test": "echo 'tests not configured yet'"` to `apps/electron/package.json` scripts
5. Verify YAML syntax: `npx yamllint .github/workflows/ci.yml` (optional — GitHub Actions validates on push)
6. Commit and push CI workflow + electron package.json change
7. Observe CI running in "Actions" tab — verify all steps pass (green)
8. Push a commit with an intentional type error — verify CI fails (red) at typecheck step
9. Revert the type error commit
10. Push a commit with an intentional lint error — verify CI fails (red) at lint step
11. Revert the lint error commit
12. Open a PR against `main` — verify CI status check appears
13. Verify cache works: push second clean commit, observe faster install step

## 17. Traceability

| Source Document | Section | Requirement |
|----------------|---------|-------------|
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.9 | `.github/workflows/ci.yml`, push/PR triggers, checkout → install → typecheck → lint → test |
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.9 AC-1 | Push a commit → CI runs |
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.9 AC-2 | Push with TypeScript error → CI fails (red) |
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.9 AC-3 | Push with lint error → CI fails (red) |
| `PROJECT_CONSTITUTION.md` | Section 25 (M0) | "Project monorepo with CI running lint and tests on every commit" |
| `06_IMPLEMENTATION_DECISIONS.md` | PK-07 | pnpm 9.x required, Node 20.x minimum |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-04 | `node-linker=hoisted` — `.npmrc` is version-controlled, CI respects it |
| `06_IMPLEMENTATION_DECISIONS.md` | Section 9 | Version compatibility matrix: pnpm@9.x, node@20.x, typescript@5.9.3 |
| `07_AGENT_RULES.md` | Rule 9.4 | Verify TypeScript before every build — enforced by `pnpm typecheck` step |
| `07_AGENT_RULES.md` | Rule 11.1 | Strict mode mandatory — enforced by `tsc --noEmit` with `strict: true` |
| `08_SPIKE_RETROSPECTIVE.md` | Lesson 5 | Pin all versions — `--frozen-lockfile` enforces this in CI |
| `08_SPIKE_RETROSPECTIVE.md` | Section 3 | pnpm 9.x, Node 20.x — APPROVED for production |
