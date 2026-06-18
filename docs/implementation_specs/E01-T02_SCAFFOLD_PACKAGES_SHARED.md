# E01 T02 — Scaffold packages/shared: Implementation Specification

## 1. Goal

Create the `@collectio/shared` package — the pure TypeScript core of the application. This package houses the Domain layer (models, interfaces, repository contracts), Application layer (sync engine, search, duplicate detection, settings), and Data layer (repository implementations, migration runner, raw SQL). It must have zero dependencies on React, Electron, Capacitor, or any UI library. All other packages depend on it; it depends on nothing but TypeScript.

## 2. Scope

| In scope | Detail |
|----------|--------|
| `packages/shared/package.json` | Name: `@collectio/shared`, `"type": "module"`, zero runtime deps, pinned devDependencies |
| `packages/shared/tsconfig.json` | Strict mode, target ES2022, no JSX, `skipLibCheck` |
| `packages/shared/src/index.ts` | Empty barrel export (`export {}`) |
| Workspace recognition | `pnpm install` must recognize `@collectio/shared` |

## 3. Out of Scope

| Out of scope | Handled by |
|-------------|-----------|
| Creating `domain/`, `application/`, `data/` subdirectories | E-02, E-03, E-04, E-05 (future tasks that populate them) |
| Populating domain models (Song, Artist, Language, etc.) | E-02 |
| Populating application layer (SyncEngine, SearchEngine, etc.) | E-03, E-04, E-05 |
| Populating data layer (repository implementations, migrations) | E-03, E-04, E-05 |
| ESLint configuration (`.eslintrc.js`) | T-01.7 |
| Jest configuration (`jest.config.ts`) | T-01.10 |
| Import alias setup (`@shared/`) | Deferred — `shared` has no aliases (imports only from itself) |
| CI pipeline configuration | T-01.9 |
| Root-level dev scripts (`dev:electron`, `build`, etc.) | T-01.1 |
| Any code that imports from `@collectio/shared` | Downstream tasks (T-01.3, T-01.4, T-01.5, T-01.6) |

## 4. Files to Create

| File | Content | Notes |
|------|---------|-------|
| `packages/shared/package.json` | Package manifest | See spec below |
| `packages/shared/tsconfig.json` | TypeScript config | See spec below |
| `packages/shared/src/index.ts` | Barrel export | `export {}` (empty module) |

### `packages/shared/package.json` (Target)

```json
{
  "name": "@collectio/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "echo 'lint not configured yet'",
    "test": "echo 'tests not configured yet'",
    "build": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "5.9.3"
  }
}
```

**Key decisions:**
- `"main"` and `"types"` point to `src/index.ts` (TypeScript source) — downstream packages consume the source directly via bundler, no pre-compilation needed
- `devDependencies` is minimal: only `typescript` at this stage. ESLint, Jest, and Prettier are added by T-01.7 and T-01.10
- `lint` and `test` scripts are temporary no-ops that will be replaced by T-01.7 and T-01.10
- `build` does `tsc --noEmit` (typecheck only, no output) — this package is consumed as source, not compiled
- Pinned `5.9.3` (no `^` or `~`) per agent rules

### `packages/shared/tsconfig.json` (Target)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true
  },
  "include": ["src"]
}
```

**Key decisions:**
- `"strict": true` — mandatory per agent rules Rule 11.1
- `"module": "ESNext"` + `"moduleResolution": "bundler"` — matches the capacitor app's config and is required for Vite compatibility
- `"noEmit": true` — this package is consumed as source, not compiled. The `build` script only typechecks
- `"declaration": true` + `"declarationMap": true` + `"sourceMap": true` — enabled for future use if any downstream package needs to resolve types
- `"composite": true` — enables project references for future incremental builds (not used yet, but harmless)
- No `"jsx"` — this package must have zero React code per architecture rule 13.2
- No path aliases — `shared` has no imports from other packages per architecture constraint
- Matches the capacitor app's tsconfig pattern where applicable

### `packages/shared/src/index.ts` (Target)

```typescript
export {};
```

**Why `export {}` instead of an empty file:**
- TypeScript treats files without exports as scripts (ambient declarations), not modules
- `tsc --noEmit` may warn about "no inputs" if the file has no module-level exports
- `export {}` explicitly marks the file as a module, satisfying the compiler
- This is the idiomatic TypeScript pattern for empty barrel files

## 5. Files to Modify

| File | Action | Reason |
|------|--------|--------|
| `packages/shared/package.json` (root) | **No change** | Root scripts reference `@collectio/shared` but don't modify it |
| `pnpm-lock.yaml` | Auto-updated | `pnpm install` will update this after package creation |

## 6. Interfaces

No runtime interfaces are produced by this task. The package is a shell with no exported code. The architectural interfaces (Domain layer types, Repository contracts, etc.) are defined by future tasks (E-02, E-03).

## 7. State Changes

| Before | After |
|--------|-------|
| `packages/` directory does not exist | `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts` exist |
| `@collectio/shared` not in workspace | `@collectio/shared` recognized by pnpm workspace |
| `pnpm-lock.yaml` does not reference `@collectio/shared` | `pnpm-lock.yaml` updated with shared package entry |

## 8. Database Changes

None. This is a build-system scaffolding task with no database interaction.

## 9. Error Handling

| Failure scenario | Behavior |
|-----------------|----------|
| `packages/shared/package.json` has syntax error | `pnpm install` fails with JSON parse error — fix the JSON |
| `tsconfig.json` has invalid options | `tsc --noEmit` fails — fix the tsconfig |
| `src/index.ts` is empty (no `export {}`) | `tsc --noEmit` may warn about no module declaration — add `export {}` |
| `pnpm install` fails after package creation | Check for typos in `package.json` name field; verify workspace glob in `pnpm-workspace.yaml` includes `packages/*` |
| TypeScript version resolution fails | Verify `5.9.3` exists in npm registry; verify `node-linker=hoisted` in `.npmrc` doesn't conflict |

## 10. Logging Requirements

None. Task produces configuration files only.

## 11. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-1 | `tsc --noEmit` passes in `packages/shared/` with zero errors | Run `npx tsc --noEmit` in `packages/shared/` — exit 0 |
| AC-2 | Package resolves as `@collectio/shared` in the monorepo | Run `pnpm list --recursive --depth 0` — must show `@collectio/shared` |
| AC-3 | `package.json` has correct name, type, and zero runtime dependencies | Inspect `packages/shared/package.json` |
| AC-4 | `tsconfig.json` has `"strict": true` and no `"jsx"` | Inspect `packages/shared/tsconfig.json` |
| AC-5 | `src/index.ts` compiles without errors | `tsc --noEmit` in `packages/shared/` — exit 0 |
| AC-6 | Import of `@collectio/shared` resolves from another workspace package | From `apps/capacitor/`, run `node -e "require.resolve('@collectio/shared')"` — must resolve |
| AC-7 | `pnpm install` at root completes without errors | Run `pnpm install` — exit 0 |
| AC-8 | No runtime dependencies exist | `dependencies` field in `package.json` is empty or absent |

## 12. Test Cases

| # | Test | Steps | Expected |
|---|------|-------|----------|
| TC-1 | Fresh install after package creation | 1. Create the 3 files<br>2. `pnpm install`<br>3. `cd packages/shared && npx tsc --noEmit` | Exit 0; no TypeScript errors |
| TC-2 | Package name resolution | `pnpm list --recursive --depth 0` | Output includes `@collectio/shared` at version `0.0.0` |
| TC-3 | Package name resolution from capacitor | `pnpm --filter @collectio/capacitor-app exec node -e "try{require.resolve('@collectio/shared');console.log('OK')}catch(e){console.log('FAIL')}"` | Output: `OK` |
| TC-4 | No React/Capacitor imports compile | `npx tsc --noEmit` with no source imports | Exit 0 (no source code to check — this is a negative test confirming the shell compiles) |
| TC-5 | Strict mode enforced | Add a file with implicit any: `const x = 1; function f(t) { return t; }` and run `npx tsc --noEmit` | Exit non-zero — strict mode catches implicit `any` |
| TC-6 | No JSX in shared package | Attempt to create a `.tsx` file and run `npx tsc --noEmit` | Exit non-zero — `"jsx": "react-jsx"` is not in tsconfig, so `.tsx` files are rejected |
| TC-7 | tsconfig has no path aliases | Inspect `tsconfig.json` `compilerOptions.paths` | Field must not exist — `shared` must have no references to other packages |
| TC-8 | `package.json` has no `dependencies` field | Inspect `package.json` | `dependencies` must be absent or empty object |
| TC-9 | TypeScript version pinned exact | Inspect `devDependencies.typescript` | Must be `"5.9.3"` (no `^` or `~`) |

## Implementation Order

1. Create `packages/shared/` directory (implied by writing files into it)
2. Write `packages/shared/package.json`
3. Write `packages/shared/tsconfig.json`
4. Write `packages/shared/src/index.ts`
5. Run `pnpm install` at root to register the package
6. Run `npx tsc --noEmit` in `packages/shared/` to verify compilation
7. Run `pnpm list --recursive --depth 0` to verify workspace recognition

## Traceability

| Source Document | Section | Requirement |
|----------------|---------|-------------|
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.2 | 3 files produced, zero dependencies, strict mode |
| `05_FOLDER_STRUCTURE.md` | Section 1 | `packages/shared/` directory layout, internal subdirectories |
| `01_ARCHITECTURE.md` | Section 3 | Domain layer is pure TypeScript; boundary rules |
| `07_AGENT_RULES.md` | Rule 11.1 | Strict mode mandatory |
| `07_AGENT_RULES.md` | Rule 13.2 | Domain layer: zero React, zero platform, zero database |
| `07_AGENT_RULES.md` | Section 1 | Exact pinned versions (no `^` or `~`) |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-01 | `DatabaseConnection` interface is async (deferred to data layer tasks) |
