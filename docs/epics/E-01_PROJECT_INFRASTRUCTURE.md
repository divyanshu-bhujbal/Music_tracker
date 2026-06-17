# E-01: Project Infrastructure

**Phase:** 1 | **Type:** Foundation | **Depends On:** E-00b | **Blocks:** E-02, E-03, E-05, E-15

---

## Overview

**Purpose:** Set up the pnpm monorepo with 5 workspace packages and 2 app entries. Configure TypeScript strict mode, ESLint, Prettier, Vite, and CI across all packages.

**Architecture context:** The project is a pnpm monorepo with:
- `packages/shared/` — Pure TypeScript business logic (domain + application + data)
- `packages/renderer/` — Shared React web UI (screens, components, dialogs, navigation)
- `packages/platform/` — Platform adapters (electron/ and capacitor/ subdirs)
- `apps/electron/` — Electron app entry (main process + preload)
- `apps/capacitor/` — Capacitor app entry (React DOM mount + capacitor.config.ts)

---

## Tasks

### T-01.1 — Initialize pnpm Workspace

| Property | Detail |
|----------|--------|
| **Depends on** | — |
| **Blocks** | T-01.2 through T-01.11 |

**Files produced:**
- `package.json` (root — workspace scripts only)
- `pnpm-workspace.yaml`
- `.npmrc`

**Requirements:**
- Root `package.json` defines workspace scripts: `dev:electron`, `dev:capacitor`, `build`, `lint`, `test`, `typecheck`
- `pnpm-workspace.yaml` lists `packages/*` and `apps/*`
- `.npmrc` enables `shamefully-hoist=false` and `strict-peer-dependencies=true`

**Acceptance criteria:**
1. `pnpm install` succeeds at root
2. Monorepo recognizes all packages under `packages/` and `apps/`

---

### T-01.2 — Scaffold packages/shared

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.1 |
| **Blocks** | T-01.3, T-01.4, T-01.5, T-01.6 |

**Files produced:**
- `packages/shared/package.json` — name: `@collectio/shared`, type: `module`
- `packages/shared/tsconfig.json` — strict mode, no JSX, target ES2022
- `packages/shared/src/index.ts` — empty barrel export

**Requirements:**
- Zero dependencies on React, React DOM, Electron, Capacitor, or any UI library
- Only devDependencies: TypeScript, ESLint, Jest, Prettier

**Acceptance criteria:**
1. `tsc --noEmit` passes in `packages/shared/`
2. Package imports resolve within the monorepo as `@collectio/shared`

---

### T-01.3 — Scaffold packages/renderer

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.2 |
| **Blocks** | T-01.6, T-01.7 |

**Files produced:**
- `packages/renderer/package.json` — name: `@collectio/renderer`, type: `module`
- `packages/renderer/tsconfig.json` — strict mode, JSX react-jsx, paths: `@shared` → `../shared/src`
- `packages/renderer/src/index.ts` — empty barrel export

**Dependencies:**
- `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `zustand`, `@mui/material`, `@mui/icons-material`, `@tanstack/react-virtual`
- DevDep on `@collectio/shared` (workspace protocol)

**Acceptance criteria:**
1. Import `react` and `@mui/material` — no build errors
2. Import from `@collectio/shared` resolves correctly

---

### T-01.4 — Scaffold packages/platform

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.2 |
| **Blocks** | T-01.6, T-01.8 |

**Files produced:**
- `packages/platform/package.json` — name: `@collectio/platform`
- `packages/platform/tsconfig.json` — strict mode, paths to shared

**Subdirectories created:**
- `packages/platform/src/electron/`
- `packages/platform/src/capacitor/`
- `packages/platform/src/shared/`

**Dependencies (by subdirectory):**
- `electron/`: `electron`, `electron-store`, `better-sqlite3`, `argon2`, `google-auth-library`
- `capacitor/`: `@capacitor/core`, `@capacitor-community/sqlite`, `@capacitor/secure-storage`, `@capacitor/browser`, `argon2-wasm`
- `shared/`: `@collectio/shared` (workspace protocol) — no platform-specific deps

**Acceptance criteria:**
1. Each subdirectory exports an `index.ts` barrel
2. Imports from `@collectio/shared` resolve

---

### T-01.5 — Scaffold apps/electron

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.2 |
| **Blocks** | T-01.9, T-01.11 |

**Files produced:**
- `apps/electron/package.json` — name: `@collectio/electron-app`
- `apps/electron/tsconfig.json` — strict, paths to `@collectio/renderer`, `@collectio/platform`
- `apps/electron/src/main.ts` — minimal Electron main process (create window, load renderer)
- `apps/electron/src/preload.ts` — context bridge stub
- `apps/electron/electron-builder.yml` — basic Windows build config
- `apps/electron/vite.config.ts` — Vite config for Electron main + renderer

**Dependencies:**
- `electron`, `electron-builder`, `vite`, `vite-plugin-electron`
- `@collectio/renderer`, `@collectio/platform` (workspace protocol)

**Acceptance criteria:**
1. `pnpm dev:electron` launches an Electron window
2. Window loads content from `packages/renderer`

---

### T-01.6 — Scaffold apps/capacitor

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.2, T-01.3 |
| **Blocks** | T-01.10, T-01.11 |

**Files produced:**
- `apps/capacitor/package.json` — name: `@collectio/capacitor-app`
- `apps/capacitor/tsconfig.json` — strict, paths to shared/renderer/platform
- `apps/capacitor/src/index.tsx` — `ReactDOM.createRoot(document.getElementById('root')).render(...)`
- `apps/capacitor/src/index.html` — minimal HTML shell with `<div id="root">`
- `apps/capacitor/capacitor.config.ts` — `appId: com.collectio.app`, `appName: Collectio`, `webDir: dist`
- `apps/capacitor/vite.config.ts` — Vite config for web build

**Note:** The `android/` directory is generated by the Capacitor CLI (`npx cap add android`) after the web build is configured. This task creates the config that generates it.

**Dependencies:**
- `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`
- `@collectio/renderer`, `@collectio/platform` (workspace protocol)
- `vite`

**Acceptance criteria:**
1. `pnpm dev:capacitor` serves the app in a browser for development
2. `pnpm build:capacitor && npx cap sync` generates `android/` directory
3. `npx cap open android` opens the project in Android Studio

---

### T-01.7 — Configure Shared ESLint and Prettier

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.1 |
| **Blocks** | T-01.9 |

**Files produced:**
- `.eslintrc.js` (root — shared config for all packages)
- `.prettierrc` (root)
- `.prettierignore`
- `.eslintignore`

**Requirements:**
- ESLint parser: `@typescript-eslint/parser`
- Plugins: `@typescript-eslint`, `react`, `react-hooks`
- Rules: strict TypeScript, no unused vars, no explicit any, no console (warn)
- Prettier: single quotes, trailing commas, 100 print width, 2-space tabs
- Each package's `package.json` adds `lint` script: `eslint 'src/**/*.{ts,tsx}'`

**Acceptance criteria:**
1. `pnpm lint` from root runs across all packages
2. Intentional lint error causes non-zero exit

---

### T-01.8 — Configure Vite for Renderer

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.3 |
| **Blocks** | T-01.9, T-01.10 |

**Files produced:**
- `packages/renderer/vite.config.ts` — Vite config with React plugin, path aliases
- `packages/renderer/index.html` — root HTML for dev server

**Requirements:**
- Path aliases: `@shared` → `../shared/src`, `@platform` → `../platform/src`
- React plugin for JSX transform
- Dev server on port 5173
- Build output to `dist/` with code splitting

**Acceptance criteria:**
1. `pnpm --filter @collectio/renderer dev` runs Vite dev server
2. Hot module replacement works
3. Path aliases resolve correctly in dev and build

---

### T-01.9 — Configure CI Pipeline

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.1, T-01.5, T-01.7, T-01.8 |
| **Blocks** | (quality gate for all future tasks) |

**Files produced:**
- `.github/workflows/ci.yml` (or equivalent CI config file)

**Requirements:**
- Trigger: push to any branch, PR to main
- Steps: checkout → `pnpm install` → `pnpm typecheck` → `pnpm lint` → `pnpm test`
- Typecheck runs `tsc --noEmit` on each package
- Lint runs ESLint across all packages
- Test runs Jest for shared, RTL for renderer
- Build fails on any non-zero exit

**Acceptance criteria:**
1. Push a commit to a branch → CI runs
2. Push a commit with a TypeScript error → CI fails (red)
3. Push a commit with a lint error → CI fails (red)

---

### T-01.10 — Configure Jest + React Testing Library

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.3, T-01.6 |
| **Blocks** | E-16 |

**Files produced:**
- `jest.config.js` (root — shared base config)
- `packages/shared/jest.config.ts`
- `packages/renderer/jest.config.ts` — includes `@testing-library/jest-dom`, jsdom environment
- `packages/renderer/src/test-setup.ts` — RTL setup file

**Requirements:**
- `packages/shared`: `ts-jest` preset, Node environment
- `packages/renderer`: jsdom environment, `@testing-library/react` imports, path aliases to shared + platform
- Coverage threshold: ≥80% for shared, ≥70% for renderer instructions (enforced by CI)
- Each package has `test` script in `package.json`

**Acceptance criteria:**
1. `pnpm test` runs all tests across all packages
2. A sample test in shared and renderer passes
3. Coverage reports generated

---

### T-01.11 — Root-Level Development Scripts

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.1, T-01.5, T-01.6 |
| **Blocks** | (developer workflow gate) |

**Files updated:**
- Root `package.json` `scripts` section

**Scripts:**
```
dev:electron   → runs Electron app in dev mode with Vite HMR
dev:capacitor  → runs Vite dev server + opens Capacitor app
build          → builds shared → renderer → electron-app + capacitor-app
lint           → eslint across all packages
typecheck      → tsc --noEmit across all packages
test           → jest across all packages
test:watch     → jest in watch mode
clean          → removes all dist/ and build/ directories
```

**Acceptance criteria:**
1. `pnpm dev:electron` launches a working Electron app (blank, no features)
2. `pnpm dev:capacitor` launches the app in a browser
3. `pnpm build` produces artifacts for both platforms
