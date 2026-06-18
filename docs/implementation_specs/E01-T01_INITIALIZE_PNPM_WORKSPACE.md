# E01 T01 — Initialize pnpm Workspace: Implementation Specification

## 1. Goal

Configure the pnpm monorepo root so that all 5 workspace packages (`shared`, `renderer`, `platform`, `electron-app`, `capacitor-app`) plus any future additions are recognized, installable, and callable via root-level scripts. This must be compatible with the existing `apps/capacitor/` (E-00b spike artifact).

## 2. Scope

| In scope | Detail |
|----------|--------|
| Root `package.json` | Add/update all workspace-level scripts |
| `pnpm-workspace.yaml` | Verify correctness (already present) |
| `.npmrc` | Resolve conflict between epic spec and validated spike findings |
| Package recognition | `pnpm install` must recognize all existing workspace packages |
| Script passthrough | Root scripts must delegate to child packages via `pnpm -r` or `--filter` |

## 3. Out of Scope

| Out of scope | Handled by |
|-------------|-----------|
| Creating `packages/*` directories or package.json files | T-01.2 through T-01.4 |
| Creating `apps/electron/` | T-01.5 |
| Modifying `apps/capacitor/` config | E-00b spike (already done) |
| ESLint/Prettier configuration | T-01.7 |
| Jest/React Testing Library setup | T-01.10 |
| Vite configuration (renderer) | T-01.8 |
| CI pipeline files | T-01.9 |
| Installing new dependencies at root | None needed — root has no dependencies |
| Pin exact versions in `apps/capacitor/package.json` | Separate task or spike follow-up |

## 4. Files to Create

*None.* All target files already exist.

## 5. Files to Modify

| File | Action | Reason |
|------|--------|--------|
| `package.json` (root) | Update `scripts` block | Currently has 4 scripts; spec requires minimum 6, T-01.11 expands to 8 |
| `.npmrc` | Evaluate adding `strict-peer-dependencies=true` | Spec requirement; must not break existing install |

| File | Action | Reason |
|------|--------|--------|
| `pnpm-workspace.yaml` | No change | Already contains `packages/*` and `apps/*` — matches spec exactly |

### Root `package.json` Scripts (Target State)

| Script | Command | Notes |
|--------|---------|-------|
| `dev:electron` | `pnpm --filter @collectio/electron-app dev` | Will fail until T-01.5 (package doesn't exist yet) |
| `dev:capacitor` | `pnpm --filter @collectio/capacitor-app dev` | Already exists |
| `build:electron` | `pnpm --filter @collectio/electron-app build` | Will fail until T-01.5 (package doesn't exist yet) |
| `build:capacitor` | `pnpm --filter @collectio/capacitor-app build` | Already exists |
| `build` | `pnpm -r build` | Builds all packages, order determined by dependency graph |
| `lint` | `pnpm -r lint` | Already exists |
| `typecheck` | `pnpm -r typecheck` | Already exists |
| `test` | `pnpm -r test` | Will no-op until T-01.10 adds test scripts |
| `clean` | `pnpm -r clean` | Will no-op until packages add clean scripts |

## 6. Interfaces

No code interfaces are produced by this task. The workspace configuration is a build-system concern.

## 7. State Changes

| Before | After |
|--------|-------|
| Root `package.json` has 4 scripts: `dev:capacitor`, `build:capacitor`, `lint`, `typecheck` | Root `package.json` has 9 scripts: `dev:electron`, `dev:capacitor`, `build:electron`, `build:capacitor`, `build`, `lint`, `typecheck`, `test`, `clean` |
| `.npmrc` has only `node-linker=hoisted` | `.npmrc` retains `node-linker=hoisted` plus `strict-peer-dependencies=true` (conditional — retain only if `pnpm install` succeeds with it) |

## 8. Database Changes

None. This is a build-system task with no database interaction.

## 9. Error Handling

| Failure scenario | Behavior |
|-----------------|----------|
| `pnpm install` fails after `.npmrc` change | Revert `.npmrc` to `node-linker=hoisted` only; log the peer-dependency conflicts; document as deferred to the relevant package task |
| `pnpm -r <script>` fails because a package lacks the script | Expected. `pnpm -r` skips packages missing the script. No-op is safe. |
| `pnpm dev:electron` runs before `apps/electron/` exists | Graceful failure — pnpm reports "package not found" and exits. Acceptable state until T-01.5. |
| `pnpm build` runs before all packages exist | pnpm reports missing package errors. Acceptable until all scaffold tasks complete. |

## 10. Logging Requirements

None. Task produces no runtime artifacts, only configuration files.

## 11. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-1 | `pnpm install` succeeds at root with no errors | Run `pnpm install` — must exit 0 |
| AC-2 | Workspace recognizes `apps/capacitor/` | Run `pnpm list --recursive --depth 0` — must show `@collectio/capacitor-app` |
| AC-3 | Root `package.json` defines all required scripts | Inspect `package.json` — must contain `dev:electron`, `dev:capacitor`, `build`, `lint`, `test`, `typecheck`, `clean` |
| AC-4 | `pnpm lint` propagates to `apps/capacitor/` | Run `pnpm lint` — must execute lint script in capacitor app (no-op or pass) |
| AC-5 | `pnpm typecheck` propagates to `apps/capacitor/` | Run `pnpm typecheck` — must execute typecheck in capacitor app |
| AC-6 | Existing `apps/capacitor/` continues to build | Run `pnpm build:capacitor` — must succeed |
| AC-7 | `pnpm-workspace.yaml` includes `packages/*` and `apps/*` | Already verified — no change expected |

## 12. Test Cases

| # | Test | Steps | Expected |
|---|------|-------|----------|
| TC-1 | Fresh install after config change | 1. Modify `.npmrc` and `package.json`<br>2. `pnpm install` | Exit 0; no warnings about unresolvable packages |
| TC-2 | Workspace detection — existing package | `pnpm list --recursive --depth 0` | `@collectio/capacitor-app` appears in output |
| TC-3 | Recursive script — typecheck | `pnpm typecheck` | Runs typecheck for `@collectio/capacitor-app` (and any other package with the script) |
| TC-4 | Recursive script — lint | `pnpm lint` | Runs lint for `@collectio/capacitor-app` (and any other package with the script) |
| TC-5 | Script targeting non-existent package | `pnpm dev:electron` | Reports "package not found" error |
| TC-6 | Capacitor build still works | `pnpm build:capacitor` | Build succeeds (this is an existing working flow) |
| TC-7 | `strict-peer-dependencies=true` compatibility | 1. Add `strict-peer-dependencies=true` to `.npmrc`<br>2. `pnpm install` | If exit 0 → keep setting. If exit non-zero → remove setting, document conflicts, defer to per-package resolution |

## Architecture Decision: `.npmrc` Conflict

The epic spec (E-01, T-01.1) and the validated spike (`06_IMPLEMENTATION_DECISIONS.md` AD-04, `07_AGENT_RULES.md` Section 3) disagree on `.npmrc`:

| Source | Requirement |
|--------|------------|
| E-01 spec | `shamefully-hoist=false`, `strict-peer-dependencies=true` |
| AD-04 / Agent Rules | `node-linker=hoisted` (mandatory for Capacitor Gradle build) |

**Resolution:** `node-linker=hoisted` is a hard constraint — without it, `apps/capacitor/android/` cannot compile because Capacitor's Gradle build cannot find plugin Android source through pnpm's symlink-based virtual store. The epic spec predates the spike and is stale on this point.

- **Keep** `node-linker=hoisted`
- **Do NOT add** `shamefully-hoist=false` — this is incompatible with `node-linker=hoisted` and was based on pre-spike assumptions
- **Add** `strict-peer-dependencies=true` only if `pnpm install` succeeds with it on the existing dependency tree. If it fails, defer to per-package peer dependency resolution.

## Implementation Order

1. Update root `package.json` `scripts` block with the full script set
2. Evaluate adding `strict-peer-dependencies=true` to `.npmrc`
3. Run `pnpm install` to verify
4. Run `pnpm typecheck` and `pnpm build:capacitor` to verify existing flow intact
5. Run `pnpm list --recursive --depth 0` to verify workspace recognition
6. If `strict-peer-dependencies=true` causes install failure → remove it, document which peer deps conflict, defer to per-package resolution

## Traceability

| Source Document | Section | Requirement |
|----------------|---------|-------------|
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.1 | Root `package.json`, `pnpm-workspace.yaml`, `.npmrc` |
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.11 | Root-level development scripts (expanded set) |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-04 | `node-linker=hoisted` required |
| `07_AGENT_RULES.md` | Section 3 | `.npmrc` must contain `node-linker=hoisted` |
| `05_FOLDER_STRUCTURE.md` | Section 1 | Monorepo root layout, package naming |
