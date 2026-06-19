# E01 T03 — Scaffold packages/renderer: Implementation Specification

## 1. Goal

Create the `@collectio/renderer` package — the shared React web UI that runs identically on Electron (BrowserWindow) and Capacitor (WebView). This package contains all screens, components, dialogs, navigation, category UI modules, and hooks. It depends on `@collectio/shared` for domain types and will depend on `@collectio/platform` for provider interfaces (injected via React context at the app entry point). It must never directly import platform-specific implementations (`platform/electron/` or `platform/capacitor/`).

## 2. Scope

| In scope | Detail |
|----------|--------|
| `packages/renderer/package.json` | Name: `@collectio/renderer`, `"type": "module"`, 8+ runtime deps, workspace devDep, pinned exact versions |
| `packages/renderer/tsconfig.json` | Strict mode, `"jsx": "react-jsx"`, path aliases to `@shared` and `@platform` |
| `packages/renderer/src/index.ts` | Empty barrel export |
| Dependency installation | `pnpm install` must install all 8+ runtime packages and resolve peer deps |
| Workspace recognition | `@collectio/renderer` must resolve in monorepo and be importable from `@collectio/shared` |

## 3. Out of Scope

| Out of scope | Handled by |
|-------------|-----------|
| Creating internal directories (`screens/`, `components/`, `dialogs/`, `navigation/`, `categories/`, `hooks/`) | Future tasks (E-02, E-03, E-05, E-15) |
| Writing any React component or hook code | Future tasks |
| Vite configuration for the renderer package | T-01.8 |
| ESLint/Prettier configuration | T-01.7 |
| Jest + React Testing Library configuration | T-01.10 |
| CI pipeline | T-01.9 |
| Category registration or UI wiring | E-02, E-15 |
| Import alias binding in Vite (only tsconfig paths set here) | T-01.8 (Vite config adds resolve.alias) |
| Modifying `apps/capacitor/` to import renderer | T-01.6 |
| Adding Vite HMR or dev server | T-01.8 |

## 4. Files to Create

| File | Content | Notes |
|------|---------|-------|
| `packages/renderer/package.json` | Package manifest | See spec below — 12+ dependency entries |
| `packages/renderer/tsconfig.json` | TypeScript config | Strict, JSX, path aliases |
| `packages/renderer/src/index.ts` | Barrel export | `export {}` (empty module) |

### `packages/renderer/package.json` (Target)

```json
{
  "name": "@collectio/renderer",
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
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-router-dom": "6.30.4",
    "@tanstack/react-query": "5.101.0",
    "@tanstack/react-virtual": "3.14.3",
    "zustand": "5.0.14",
    "@mui/material": "6.5.0",
    "@mui/icons-material": "6.5.0",
    "@emotion/react": "11.14.0",
    "@emotion/styled": "11.14.1",
    "immer": "11.1.8",
    "use-sync-external-store": "1.6.0"
  },
  "devDependencies": {
    "@collectio/shared": "workspace:*",
    "typescript": "5.9.3",
    "@types/react": "18.3.31",
    "@types/react-dom": "18.3.30"
  }
}
```

**Key decisions for each dependency:**

| Package | Version | Rationale |
|---------|---------|-----------|
| `react` | `18.3.1` | Pinned per agent rules (`07_AGENT_RULES.md` Section 1) |
| `react-dom` | `18.3.1` | Pinned per agent rules |
| `react-router-dom` | `6.30.4` | Latest v6; architecture says "v6+". v7 has breaking API changes (Remix merge) that don't match architecture doc patterns |
| `@tanstack/react-query` | `5.101.0` | Latest stable v5; peer: `react ^18 \|\| ^19` |
| `@tanstack/react-virtual` | `3.14.3` | Pinned per agent rules + implementation decisions PK-05 |
| `zustand` | `5.0.14` | Latest v5; peer deps: `immer >=9`, `use-sync-external-store >=1.2`, `react >=18` |
| `@mui/material` | `6.5.0` | MUI v6 — stable, well-documented, supports React 18. v5 (5.18.0) is last v5, v7+ exist. v6 is pragmatic for a new scaffold |
| `@mui/icons-material` | `6.5.0` | Must match `@mui/material` major.minor |
| `@emotion/react` | `11.14.0` | Peer dep of MUI — not listed in epic spec but required by `@mui/material` |
| `@emotion/styled` | `11.14.1` | Peer dep of MUI — same reason |
| `immer` | `11.1.8` | Peer dep of `zustand@5` — required for Zustand's Immer middleware |
| `use-sync-external-store` | `1.6.0` | Peer dep of `zustand@5` — required for React external store subscription |
| `@types/react` | `18.3.31` | Latest React 18.3.x types — must match `react@18.3.1` |
| `@types/react-dom` | `18.3.30` | Must match `@types/react` major.minor |

**Why `immer` and `use-sync-external-store` are listed:** These are peer dependencies of `zustand@5`. With `node-linker=hoisted`, pnpm may not auto-install peer deps unless explicitly listed. This avoids install warnings.

**Why `@emotion/react` and `@emotion/styled` are listed:** The epic spec for T-01.3 lists only `@mui/material` and `@mui/icons-material` but MUI v5+ requires Emotion as a peer dependency. Without these, TypeScript and the bundler will fail to resolve MUI's internal imports. These are listed as direct `dependencies` (they're runtime requirements, not dev-only).

### `packages/renderer/tsconfig.json` (Target)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "paths": {
      "@shared/*": ["../shared/src/*"],
      "@shared": ["../shared/src"],
      "@platform/*": ["../platform/src/*"],
      "@platform": ["../platform/src"]
    }
  },
  "include": ["src"]
}
```

**Key decisions:**

- `"jsx": "react-jsx"` — React 17+ automatic JSX transform (no `import React from 'react'` required per file)
- `"lib": ["ES2022", "DOM", "DOM.Iterable"]` — DOM libs needed for React components (not needed in `shared` which has no DOM)
- `"paths"` — Maps `@shared` to `../shared/src` and `@platform` to `../platform/src`. The `@platform` path points to a directory that won't exist until T-01.4 — this is safe; path aliases are inert until an import references them.
- All other options match `packages/shared/tsconfig.json` for consistency
- `"noEmit": true` — this package is consumed as source by Vite, not pre-compiled

### `packages/renderer/src/index.ts` (Target)

```typescript
export {};
```

Same pattern as `packages/shared/src/index.ts` — empty barrel export that explicitly marks the file as a module.

## 5. Files to Modify

| File | Action | Reason |
|------|--------|--------|
| `pnpm-lock.yaml` | Auto-updated | 12+ new packages added; existing `react`/`react-dom` versions may be deduplicated |

**Indirect effects on existing files (no manual edits — pnpm resolves automatically):**
- `apps/capacitor/package.json` has `"react": "^18.3.0"` and `"react-dom": "^18.3.0"` — after install, pnpm will deduplicate to `18.3.1` (pinned by renderer) due to hoisted layout
- `apps/capacitor/tsconfig.json` type resolution may change — `skipLibCheck: true` prevents cascading errors

## 6. Interfaces

No runtime interfaces are produced by this task. The package is a shell with no exported code. Future tasks define:
- React component interfaces (screen, dialog, table, tile components)
- Hook interfaces (useActiveCategory, useSync, useSettings)
- Category UI module convention (`CategoryDefinition` UI portions)

## 7. State Changes

| Before | After |
|--------|-------|
| `packages/renderer/` does not exist | `packages/renderer/package.json`, `tsconfig.json`, `src/index.ts` exist |
| `@collectio/renderer` not in workspace | `@collectio/renderer` recognized by pnpm |
| `react` may resolve as `18.3.0` (from capacitor app's `^18.3.0`) | `react` resolves as `18.3.1` (pinned by renderer, deduplicated) |
| No MUI, TanStack, Zustand, Emotion, React Router installed | All installed at root `node_modules/` (hoisted layout) |
| `pnpm-lock.yaml` has ~50 entries | `pnpm-lock.yaml` has ~200+ entries (substantial dependency tree) |

## 8. Database Changes

None. This is a UI package scaffold with no database interaction.

## 9. Error Handling

| Failure scenario | Behavior |
|-----------------|----------|
| `pnpm install` fails due to peer dependency conflict | Check which package caused the conflict. Most likely: `@mui/material` version mismatch with React, or `zustand` peer deps missing. Fix by adjusting version pins. |
| MUI installs but `@emotion/react` is missing | TypeScript will fail to resolve MUI component types — MUI internally imports from `@emotion/react`. Add `@emotion/react` and `@emotion/styled` as explicit dependencies. |
| `zustand` installs but `immer` is missing | `immer` is an optional peer dep — only needed if Zustand's Immer middleware is used. Listed as explicit dep to prevent future issues. If install fails, remove `immer` from deps. |
| `@platform` path alias causes TypeScript error | TypeScript path aliases are evaluated lazily — no error unless an import actually uses `@platform/some-file`. Empty barrel won't trigger this. |
| `@collectio/shared` devDep not resolving | Verify `workspace:*` protocol; verify `packages/shared/package.json` has correct `name` field; run `pnpm install` after creating |
| `react`/`react-dom` version conflict between capacitor app and renderer | pnpm should resolve to `18.3.1` (renderer's exact pin beats capacitor's `^18.3.0` range). If conflict persists, update capacitor app's `react` to `18.3.1`. |
| `tsc --noEmit` fails with JSX errors | Ensure `@types/react` and `@types/react-dom` are installed; verify `"jsx": "react-jsx"` is in tsconfig |

## 10. Logging Requirements

None. Task produces configuration files only.

## 11. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-1 | `tsc --noEmit` passes in `packages/renderer/` with zero errors | Run `npx tsc --noEmit` in `packages/renderer/` — exit 0 |
| AC-2 | `import React from 'react'` compiles (in a temp .tsx file) | Create temp `src/__test.tsx` with `import React from 'react'; export const Test = () => <div />;` — `tsc --noEmit` must pass |
| AC-3 | `import { Button } from '@mui/material'` compiles | Add `import { Button } from '@mui/material';` to temp test file — `tsc --noEmit` must pass |
| AC-4 | Import from `@collectio/shared` resolves | `import {} from '@collectio/shared';` must resolve without TypeScript errors |
| AC-5 | Path alias `@shared/` resolves | `import {} from '@shared/index';` must resolve to `packages/shared/src/index.ts` |
| AC-6 | Path alias `@platform/` defined (though target doesn't exist yet) | Inspect tsconfig `paths` — `@platform` and `@platform/*` must be defined |
| AC-7 | `pnpm install` at root succeeds | Run `pnpm install` — exit 0, no peer dependency errors |
| AC-8 | Package resolves as `@collectio/renderer` in monorepo | Run `pnpm list --recursive --depth 0` — must show `@collectio/renderer` |
| AC-9 | All dependencies pinned to exact versions (no `^` or `~`) | Inspect `package.json` — all version strings must be bare numbers (e.g., `"18.3.1"`, not `"^18.3.1"`) |
| AC-10 | Existing `pnpm build:capacitor` still works | Run from root — capacitor app build must succeed (no regression from new hoisted deps) |
| AC-11 | Existing `pnpm typecheck` still passes | Run from root — capacitor app typecheck must succeed |

## 12. Test Cases

| # | Test | Steps | Expected |
|---|------|-------|----------|
| TC-1 | Package creation and install | 1. Create the 3 files<br>2. `pnpm install` | Exit 0; no errors |
| TC-2 | TypeScript compilation | `cd packages/renderer && npx tsc --noEmit` | Exit 0 |
| TC-3 | React JSX compiles | Create temp `src/__test.tsx` with `export const X = () => <div/>;` then run `npx tsc --noEmit` | Exit 0 |
| TC-4 | MUI import compiles | Add `import { Button } from '@mui/material';` to temp test file then `npx tsc --noEmit` | Exit 0 |
| TC-5 | React Router import compiles | Add `import { BrowserRouter } from 'react-router-dom';` to temp test file then `npx tsc --noEmit` | Exit 0 |
| TC-6 | TanStack Query import compiles | Add `import { useQuery } from '@tanstack/react-query';` to temp test file then `npx tsc --noEmit` | Exit 0 |
| TC-7 | Zustand import compiles | Add `import { create } from 'zustand';` to temp test file then `npx tsc --noEmit` | Exit 0 |
| TC-8 | Workspace dep resolution | `node -e "require.resolve('@collectio/shared')"` in renderer package | Must resolve |
| TC-9 | Path alias resolution | Add `import {} from '@shared/index';` to temp test file then `npx tsc --noEmit` | Exit 0 |
| TC-10 | Capacitor app not broken | `pnpm build:capacitor` from root | Exit 0 |
| TC-11 | Capacitor typecheck not broken | `pnpm typecheck` from root | Exit 0 |
| TC-12 | No platform-specific imports permitted | Attempt `import { Capacitor } from '@capacitor/core';` in renderer — `tsc --noEmit` | Exit 0 (no error because `@capacitor/core` is not typed as forbidden — this is a convention check, not a mechanical one) |
| TC-13 | Package name resolution | `pnpm list --recursive --depth 0` | Output includes `@collectio/renderer@0.0.0` |
| TC-14 | Clean temp test file | Remove `src/__test.tsx` | Done after verification |

## Implementation Order

1. Create `packages/renderer/` directory (implied by writing files)
2. Write `packages/renderer/package.json` with all 12 dependencies
3. Write `packages/renderer/tsconfig.json` with JSX + path aliases
4. Write `packages/renderer/src/index.ts`
5. Run `pnpm install` at root — verify exit 0, no peer dep errors
6. Run `npx tsc --noEmit` in `packages/renderer/` — verify exit 0
7. Create temp `src/__test.tsx` to validate React, MUI, React Router, TanStack Query, Zustand imports compile
8. Run `pnpm build:capacitor` to verify no regression
9. Run `pnpm typecheck` to verify no regression
10. Remove temp test file
11. Run `pnpm list --recursive --depth 0` to verify workspace recognition

## Dependency Version Verification (Pre-Implementation Research)

The following npm registry checks were performed to validate version compatibility with React 18.3.1:

| Package | Latest | React 18 Compatible | Recommended | Rationale |
|---------|--------|---------------------|-------------|-----------|
| `react-router-dom` | 7.18.0 (v7) | v6: yes, v7: yes (`>=18`) | **6.30.4** | v7 has breaking API changes (Remix merge). v6 matches architecture doc patterns |
| `@tanstack/react-query` | 5.101.0 (v5) | Yes (`^18 \|\| ^19`) | **5.101.0** | Latest v5, well-maintained |
| `zustand` | 5.0.14 (v5) | Yes (`>=18`) | **5.0.14** | Latest stable |
| `@mui/material` | 9.1.1 (v9) | v5/v6/v7/v8/v9 all support React 18 | **6.5.0** | v6 is stable and widely documented; v9 was released very recently |
| `@mui/icons-material` | 9.1.1 | Match MUI version | **6.5.0** | Must match @mui/material |
| `@emotion/react` | 11.14.0 | Required by MUI | **11.14.0** | Latest |
| `@emotion/styled` | 11.14.1 | Required by MUI | **11.14.1** | Latest |
| `immer` | 11.1.8 | Peer of zustand | **11.1.8** | Latest |
| `use-sync-external-store` | 1.6.0 | Peer of zustand | **1.6.0** | Latest |
| `@types/react` | 19.2.17 (v19) | **18.3.31** | **18.3.31** | Must match React 18.3.x — do NOT use v19 types |
| `@types/react-dom` | 19.2.3 (v19) | **18.3.30** | **18.3.30** | Must match @types/react major.minor |

## Architecture Decisions

### AD-T03-01: MUI v6 over v5 or v7+

**Decision:** Use `@mui/material@6.5.0` (MUI v6) instead of v5 (end of v5 lifecycle) or v7+ (very recent, less community knowledge).

**Reason:** v6 supports React 18, has widespread adoption, and is stable. v5 (5.18.0) is the last v5 release and functional but v6 has performance improvements. v9 (latest) was released within weeks of this spec and carries risk.

### AD-T03-02: Explicit Peer Dependencies

**Decision:** `@emotion/react`, `@emotion/styled`, `immer`, and `use-sync-external-store` are listed as explicit `dependencies` rather than relying on pnpm's peer dependency auto-installation.

**Reason:** With `node-linker=hoisted`, pnpm's handling of peer dependencies depends on the `auto-install-peers` setting (default: true). Explicitly listing them ensures they are always available and eliminates warnings. This also makes the dependency graph auditable at a glance.

### AD-T03-03: React Router v6 over v7

**Decision:** Use `react-router-dom@6.30.4` instead of `7.18.0`.

**Reason:** React Router v7 (2025) merged Remix patterns and significantly changed the API — data loaders, actions, and route module conventions. The architecture doc's navigation structure (`01_ARCHITECTURE.md` Section 5) describes standard `<Route>` components and sidebar navigation, which aligns with v6 patterns. v6 is stable, well-documented, and matches the architecture design. A future migration to v7 can be evaluated separately.

## Traceability

| Source Document | Section | Requirement |
|----------------|---------|-------------|
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.3 | 3 files produced, JSX react-jsx, paths to shared, workspace devDep |
| `05_FOLDER_STRUCTURE.md` | Section 1 | `packages/renderer/` directory layout, internal subdirectories |
| `05_FOLDER_STRUCTURE.md` | Section 2 | Package-to-layer mapping: renderer allowed/forbidden imports |
| `05_FOLDER_STRUCTURE.md` | Section 4 | Import aliases: `@shared/`, `@renderer/`, `@platform/` |
| `01_ARCHITECTURE.md` | Section 2 | Technology stack: React 18+, React Router v6+, Zustand, TanStack Query, MUI |
| `01_ARCHITECTURE.md` | Section 3 | Renderer layer responsibilities, no business logic |
| `07_AGENT_RULES.md` | Rule 11.1 | Strict mode mandatory |
| `07_AGENT_RULES.md` | Rule 13.2 | Domain layer is pure TypeScript (shared, not renderer concern) |
| `07_AGENT_RULES.md` | Section 1 | Pinned exact versions for: react, react-dom, @tanstack/react-virtual, typescript |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-02 | Virtualization mandatory — `@tanstack/react-virtual` required |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-04 | `node-linker=hoisted` required |
| `06_IMPLEMENTATION_DECISIONS.md` | PK-05 | `@tanstack/react-virtual` v3.14.3 |
