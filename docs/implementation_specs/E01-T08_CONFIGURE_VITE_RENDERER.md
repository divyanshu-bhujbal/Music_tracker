# E01 T08 — Configure Vite for Renderer: Implementation Specification

## 1. Goal

Add a Vite build pipeline to `packages/renderer/` — the shared React web UI package. This gives the renderer a standalone dev server (port 5173) with HMR, path alias resolution (`@shared`, `@platform`), and a `vite build` step for standalone preview. The renderer remains consumed as source code by both app packages via `workspace:*` — its `"main": "src/index.ts"` barrel export is unchanged. The Vite pipeline is for developer ergonomics (independent renderer development without launching Electron or Capacitor) and for a future standalone web build.

**Architecture decision:** The renderer is a library package consumed by the two app packages. Both app packages (`apps/electron/`, `apps/capacitor/`) already have their own Vite configs with `@vitejs/plugin-react` that compile the renderer's source code during app builds. T-01.8 adds a third Vite config — the renderer's OWN config — for independent development. All three Vite configs must use the same path alias mapping as the renderer's `tsconfig.json` `paths`.

## 2. Scope

| In scope | Detail |
|----------|--------|
| `packages/renderer/vite.config.ts` | Vite config: `@vitejs/plugin-react`, path aliases (`@shared`, `@platform`), dev server port 5173, build to `dist/`, sourcemaps |
| `packages/renderer/index.html` | Minimal HTML shell for standalone dev server — `<div id="root">` + `<script type="module" src="/src/main.tsx">` |
| `packages/renderer/src/main.tsx` | Dev entry point — `ReactDOM.createRoot(document.getElementById('root')).render(<App />)` with a minimal placeholder `App` component |
| `packages/renderer/package.json` | Add `vite` and `@vitejs/plugin-react` devDependencies; add `dev` and `preview` scripts; update `build` script |
| `packages/renderer/src/App.tsx` | Minimal React component rendered by `main.tsx` — displays "Collectio" heading, confirming Vite + React pipeline works |

## 3. Out of Scope

| Out of scope | Handled by |
|-------------|-----------|
| Modifying `apps/electron/vite.config.ts` | The electron app already has a working Vite config with React plugin. No change needed. |
| Modifying `apps/capacitor/vite.config.ts` | The capacitor app already has a working Vite config with React plugin. No change needed. |
| Changing `"main": "src/index.ts"` in renderer package.json | The barrel export remains the package entry point. `main.tsx` is a dev-only entry, not the package API. |
| Writing a real App component with routing, sidebar, etc. | E-15 (UI Shell) — the placeholder `App.tsx` is a scaffold artifact for verifying Vite + React pipeline |
| Configuring `@vitejs/plugin-react` options beyond defaults | Default `react()` plugin config handles JSX transform correctly with the existing `"jsx": "react-jsx"` tsconfig option |
| CSS or theme configuration | E-15 (UI Shell) — MUI theme setup is deferred |
| Running the standalone dev server from a root-level script | T-01.11 (Root-Level Development Scripts) — the epic spec may add `dev:renderer` or equivalent |
| `vite-plugin-electron` or any Electron-specific plugin | Renderer is pure web — Electron plugins belong in `apps/electron/` |
| Capacitor-specific plugins in renderer Vite config | Capacitor plugins belong in `apps/capacitor/` |
| Environment variable configuration (`.env` files) | No env vars needed at scaffolding stage |
| `vite-plugin-pwa` or service worker integration | V2 — not in scope for V1 |

## 4. Files to Create

### 4.1 `packages/renderer/vite.config.ts`

- **Purpose:** Vite build and dev server configuration for the shared React web UI package.
- **Responsibility:** Compile TypeScript + JSX via `@vitejs/plugin-react`, resolve `@shared` and `@platform` path aliases, serve dev server on port 5173 with HMR, produce optimized production build in `dist/`.
- **Public API:** Consumed by `vite dev`, `vite build`, and `vite preview` CLI commands invoked from the renderer package directory.

**Config structure:**

```
1. Plugins:
   - @vitejs/plugin-react() — default config (no options needed; tsconfig "jsx": "react-jsx" handles JSX transform)

2. resolve.alias:
   - @shared → resolve to ../shared/src (must be absolute path via fileURLToPath + dirname)
   - @platform → resolve to ../platform/src (same pattern)

3. server:
   - port: 5173
   - strictPort: false (fallback to next available if 5173 is in use)

4. build:
   - outDir: dist
   - sourcemap: true
```

**Key decisions:**

| Decision | Rationale |
|----------|-----------|
| **AD-T08-01:** `@vitejs/plugin-react@4.3.4` | Same exact version as both `apps/electron/package.json` and `apps/capacitor/package.json`. Consistency across all 3 Vite configs. |
| **AD-T08-02:** `vite@5.4.21` | Same exact version as both app packages. Pinned, no range. |
| **AD-T08-03:** Dev entry `src/main.tsx` is separate from package barrel `src/index.ts` | `"main": "src/index.ts"` is the package public API consumed by apps. `main.tsx` is a standalone dev entry with `ReactDOM.createRoot()`. Never import `main.tsx` from other packages. |
| **AD-T08-04:** Renderer Vite build is for standalone development only | Both app packages continue to consume renderer source code via `workspace:*` resolving to `"main": "src/index.ts"`. The renderer's own `vite build` output in `dist/` is not consumed by other packages. This keeps the existing consumption model intact. |
| **AD-T08-05:** Vite `resolve.alias` must exactly mirror tsconfig `paths` | `@shared` → `../shared/src` and `@platform` → `../platform/src`. Mismatched aliases between Vite and tsc cause imports that pass type-check to fail at bundle time. |
| **AD-T08-06:** No `vite-plugin-electron` in renderer | The renderer is a pure web package. Electron compilation is handled by `apps/electron/vite.config.ts`. Adding electron plugins to renderer violates layer boundaries (Rule 13.4). |
| **AD-T08-07:** `build` script becomes `tsc --noEmit && vite build` | Matches the pattern established by both app packages: type-check first, then bundle. TypeScript errors fail fast before Vite runs. |
| **AD-T08-08:** Dev server port 5173 is configurable, not hard-fixed | `strictPort: false` allows Vite to use the next available port if 5173 is occupied. Avoids "port in use" failures on developer machines. |

### 4.2 `packages/renderer/index.html`

- **Purpose:** HTML shell for the standalone Vite dev server. This is NOT a production deployment artifact — both app packages have their own `index.html` files.
- **Responsibility:** Provide a minimal DOM mount point (`<div id="root">`) and load the dev entry script (`/src/main.tsx`) as an ES module.
- **Public API:** None — consumed by Vite dev server at the package root.

**Content:**
```
- DOCTYPE html
- <html lang="en">
- <head> with charset, viewport meta, title "Collectio"
- <body> with <div id="root"></div>
- <script type="module" src="/src/main.tsx"></script>
```

**Key decisions:**

| Decision | Rationale |
|----------|-----------|
| Title "Collectio" | Matches the placeholder application name from the constitution (OD-03). |
| `<div id="root">` not `<div id="app">` | Matches both `apps/electron/index.html` and `apps/capacitor/index.html` — consistent DOM mount point across all 3 Vite entry points. |
| `<script type="module">` with `src` attribute (not inline) | Standard Vite pattern. The `src` path is resolved by Vite's dev server module graph — `main.tsx` imports are processed through Vite's transform pipeline. |
| `lang="en"` | V1 is English-only (TD-05). |
| Viewport meta `width=device-width, initial-scale=1.0` | Standard responsive meta. Required for Capacitor WebView but harmless in standalone dev. |

### 4.3 `packages/renderer/src/main.tsx`

- **Purpose:** Standalone dev entry point — mounts the React application into the DOM.
- **Responsibility:** Import React 18's `createRoot` API, import the placeholder `App` component, call `createRoot(document.getElementById('root')).render(<App />)`. This is the renderer's standalone bootstrap, NOT the package's public API.
- **Public API:** None — this file is imported only by `index.html` in the standalone dev server. It is NOT exported from the package barrel (`index.ts`). Other packages must NOT import from `@collectio/renderer/main.tsx`.

**Key decisions:**

| Decision | Rationale |
|----------|-----------|
| Separate file from `index.ts` | `index.ts` is the package barrel (empty export at scaffold). `main.tsx` is the dev entry. Conflating them would mean every consumer imports ReactDOM — violating the barrel pattern. |
| `.tsx` extension | Rule 11.6 — all files containing JSX must use `.tsx`. Contains `<App />` and `<StrictMode>`. |
| `React.StrictMode` wrapper | Standard for React 18 development. Surfacing potential issues (double-mount warnings in dev) early. Note: React Strict Mode double-mount is a known issue with Capacitor connection management (PL-07) but is handled by the `isConnection()`/`retrieveConnection()` pattern — no conflict at scaffolding stage. |
| Imports from `./App` not `@collectio/renderer` | `App` is a local file in the same package. Self-referencing via the workspace name creates circular dependency warnings. |

### 4.4 `packages/renderer/src/App.tsx`

- **Purpose:** Minimal placeholder React component to verify the Vite + React pipeline works end-to-end.
- **Responsibility:** Render a single `<h1>` with text "Collectio" wrapped in a minimal layout. This is a scaffold artifact — it will be replaced by the real app shell in E-15.
- **Public API:** Exports a default React functional component. Imported by `main.tsx`.

**Key decisions:**

| Decision | Rationale |
|----------|-----------|
| Minimal component (no routing, no MUI theme) | This is a pipeline verification artifact, not a UI deliverable. Full UI shell is E-15. |
| "Collectio" heading | Confirms the React component tree renders. Distinct enough to visually verify the dev server is serving the renderer, not an app's `index.html`. |
| Export default function | Standard React component convention. |
| `.tsx` extension | Contains JSX — Rule 11.6. |

## 5. Files to Modify

### 5.1 `packages/renderer/package.json`

- **Purpose:** Add Vite tooling dependencies and scripts for standalone dev/build/preview.
- **Responsibility:** Declare exact-pinned Vite and React plugin devDependencies. Provide `dev`, `build`, and `preview` scripts.
- **Public API:** `scripts.dev` consumed by `pnpm --filter @collectio/renderer dev`. `scripts.build` consumed by `pnpm -r build` (root). `scripts.preview` for local production preview.

**Changes:**

| Field | Before | After |
|-------|--------|-------|
| `scripts.build` | `"tsc --noEmit"` | `"tsc --noEmit && vite build"` |
| `scripts.dev` | _(not present)_ | `"vite"` |
| `scripts.preview` | _(not present)_ | `"vite preview"` |
| `devDependencies` | 4 entries | 6 entries (add `vite`, `@vitejs/plugin-react`) |

**Add to `devDependencies`:**

| Package | Version | Role |
|---------|---------|------|
| `vite` | `5.4.21` | Bundler and dev server — same version as both app packages |
| `@vitejs/plugin-react` | `4.3.4` | React JSX transform and Fast Refresh — same version as both app packages |

**Fields that MUST NOT change:**

| Field | Value | Reason |
|-------|-------|--------|
| `"main"` | `"src/index.ts"` | Package entry point consumed by app packages via `workspace:*`. Must remain the barrel export. |
| `"types"` | `"src/index.ts"` | Must match `"main"`. |
| `"type"` | `"module"` | All workspace packages use ESM. |
| `"private"` | `true` | Not published to npm. |

## 6. Interfaces

No runtime interfaces. The "interface" is the build contract between the renderer package and the Vite toolchain:

| Contract element | Specification |
|-----------------|---------------|
| `vite.config.ts` | Must use `@vitejs/plugin-react()` with default config |
| `resolve.alias` | `@shared` → `path.resolve(__dirname, '../shared/src')`, `@platform` → `path.resolve(__dirname, '../platform/src')` |
| `index.html` | Must have `<div id="root">` with id `"root"` — consistent with app packages |
| `main.tsx` | Must call `document.getElementById('root')` — must match the id in `index.html` |
| Path aliases | Must match `tsconfig.json` `paths` exactly — `@shared` and `@platform` pointing to the same source directories |

## 7. Data Flow

```
Developer invokes: pnpm --filter @collectio/renderer dev
  -> packages/renderer/package.json scripts.dev: "vite"
    -> Vite reads vite.config.ts
    -> Vite reads index.html (entry HTML)
    -> index.html loads /src/main.tsx
    -> main.tsx imports ./App
    -> App.tsx renders <h1>Collectio</h1>
    -> @vitejs/plugin-react transforms JSX via "jsx": "react-jsx"
    -> Path aliases @shared and @platform resolve via resolve.alias
    -> Dev server starts on port 5173 (or next available)
    -> Browser opens, displays "Collectio" heading
    -> HMR: edit App.tsx → browser updates without full reload

Developer invokes: pnpm --filter @collectio/renderer build
  -> packages/renderer/package.json scripts.build: "tsc --noEmit && vite build"
    -> Step 1: tsc --noEmit
      -> Reads tsconfig.json (strict mode, noEmit)
      -> Resolves path aliases via tsconfig paths
      -> Reports type errors (non-zero exit if any)
    -> Step 2: vite build (only if tsc succeeds)
      -> Reads vite.config.ts
      -> Resolves entry from index.html
      -> Bundles React, ReactDOM, and App component
      -> Outputs optimized JS/CSS/HTML to dist/
      -> Produces sourcemaps

Root-level build (unchanged):
  pnpm -r build
    -> Runs build script in all packages:
      -> packages/shared:     tsc --noEmit
      -> packages/renderer:  tsc --noEmit && vite build
      -> packages/platform:  tsc --noEmit
      -> apps/electron:      tsc --noEmit && vite build
      -> apps/capacitor:     tsc --noEmit && vite build

App packages consuming renderer (unchanged):
  apps/electron/vite.config.ts:
    -> import '@collectio/renderer' resolves to packages/renderer/src/index.ts (via workspace:*)
    -> @vitejs/plugin-react transforms JSX in renderer source files
    -> renderer source is bundled INTO the electron app output

  apps/capacitor/vite.config.ts:
    -> Same pattern — renderer source bundled into capacitor app output
    -> The renderer's own dist/ is NOT consumed by either app
```

## 8. State Changes

| Before | After |
|--------|-------|
| `packages/renderer/` has no `vite.config.ts` | `vite.config.ts` exists with React plugin and path aliases |
| `packages/renderer/` has no `index.html` | `index.html` exists with `<div id="root">` and module script entry |
| `packages/renderer/src/` contains only `index.ts` (barrel) | Also contains `main.tsx` (dev entry) and `App.tsx` (placeholder component) |
| `packages/renderer/package.json` has no `dev` or `preview` scripts | `dev: "vite"`, `preview: "vite preview"` added |
| `packages/renderer/package.json` `build` is `tsc --noEmit` | `build` is `tsc --noEmit && vite build` |
| `packages/renderer/package.json` has 4 devDependencies | 6 devDependencies (add `vite`, `@vitejs/plugin-react`) |
| No `dist/` in renderer (no build step) | `dist/` produced by `vite build` (gitignored) |
| `pnpm --filter @collectio/renderer dev` fails (no script) | Launches Vite dev server on port 5173 |
| `pnpm -r build` runs tsc only for renderer | Runs tsc + vite build for renderer |
| `pnpm typecheck` from root | Still passes — identical tsc invocation for renderer |
| `pnpm lint` from root | Still passes — new `.tsx` files are covered by existing lint glob |
| App packages' dev/build | Unchanged — they continue consuming renderer source |

## 9. Database Changes

None. Pure build tooling configuration task.

## 10. Error Handling

| Failure scenario | Behavior |
|-----------------|----------|
| `pnpm install` fails — `vite@5.4.21` not found | Verify version exists on npm: `npm view vite@5.4.21 version` |
| `pnpm install` fails — `@vitejs/plugin-react@4.3.4` not found | Verify version exists: `npm view @vitejs/plugin-react@4.3.4 version` |
| `pnpm install` fails — peer dependency conflict | Both packages have no peer deps beyond what's already installed. If conflict arises, check for hoisting issues. |
| `vite dev` fails — "Cannot find module @shared/..." | Path alias mismatch between Vite and tsconfig. Verify `resolve.alias` paths match `tsconfig.json` `paths`. Check that relative paths resolve correctly from the renderer directory. |
| `vite dev` fails — "Cannot find module @platform/..." | Same as above. Verify `@platform` alias points to `../platform/src`. |
| `vite dev` fails — port 5173 in use | `strictPort: false` allows Vite to use next available port. Vite logs the actual port. No error — informational only. |
| `vite build` fails — JSX transform error | Verify `@vitejs/plugin-react` is in plugins array. Verify import in `vite.config.ts`. |
| `vite build` fails — module resolution error | Verify `index.html` script src points to `/src/main.tsx` (starts with `/` — root-relative to project dir). |
| `tsc --noEmit` fails after adding `main.tsx` / `App.tsx` | Verify `.tsx` extension (Rule 11.6). Verify both files are within `"include": ["src"]`. Fix type errors. |
| `pnpm lint` fails on new `.tsx` files | Verify lint glob is `src/**/*.{ts,tsx}` (already set in T-01.7). Fix lint violations. |
| `pnpm -r build` fails because renderer build now takes longer | Vite build for a minimal component is sub-second. No timeout risk. |
| `pnpm dev:electron` breaks after renderer changes | The electron app Vite config compiles renderer source. New renderer files (App.tsx, main.tsx) are not imported by the renderer barrel — they are invisible to the electron app. No break. |
| Duplicate React instances (one from renderer dist/, one from app bundle) | Renderer dist/ is not consumed by apps. Apps consume source via `workspace:*`. No duplication. |

## 11. Logging Requirements

None beyond Vite's standard CLI output:
- Dev server: port number, local URL, HMR ready status
- Build: output file sizes, chunk map, build duration
- Errors: file path, line/column, error message

## 12. Security Requirements

| Requirement | How satisfied |
|-------------|---------------|
| No secrets in Vite config | `vite.config.ts` contains only plugin registration and path aliases — no tokens, keys, or credentials |
| No environment variable exposure | No `define` or `envPrefix` configuration — Vite defaults only expose `import.meta.env.MODE`, `DEV`, `PROD` |
| Dev server bound to localhost | Vite defaults to `localhost` — not accessible from network (consistent with local development) |
| Build output in gitignored `dist/` | `dist` already in `.gitignore` from T-01.1 |
| `.vite` cache not committed | `.vite` already in `.gitignore` from T-01.1 |
| No Node.js API exposure to renderer | Renderer is a web package — no `vite-plugin-electron-renderer`, no Node.js polyfills |
| Dependencies are exact-pinned | `vite@5.4.21` and `@vitejs/plugin-react@4.3.4` — no caret or tilde ranges |

## 13. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-1 | `pnpm install` succeeds after adding Vite devDependencies | Run `pnpm install` — exit 0, no peer dep warnings |
| AC-2 | `pnpm --filter @collectio/renderer dev` launches Vite dev server | Run command — must output "Local:" URL on port 5173 (or next available) |
| AC-3 | Dev server displays "Collectio" heading in browser | Open dev server URL — page renders `<h1>Collectio</h1>` |
| AC-4 | HMR works — edit `App.tsx`, browser updates without full reload | Change heading text in `App.tsx`, save — browser updates within 1 second |
| AC-5 | `pnpm --filter @collectio/renderer build` succeeds | Run command — `vite build` exits 0, produces `dist/` with HTML + JS + sourcemaps |
| AC-6 | `pnpm run typecheck` in renderer still passes | `cd packages/renderer && npx tsc --noEmit` — exit 0 |
| AC-7 | `pnpm lint` in renderer still passes | `cd packages/renderer && npx eslint` — exit 0 on new `.tsx` files |
| AC-8 | Path alias `@shared` resolves in Vite dev server | `import { } from '@shared'` in any renderer file — no "Cannot find module" error |
| AC-9 | Path alias `@platform` resolves in Vite dev server | `import { } from '@platform'` in any renderer file — no "Cannot find module" error |
| AC-10 | `pnpm dev:electron` still works | Electron app launches and loads renderer content — no regression |
| AC-11 | `pnpm dev:capacitor` still works | Capacitor dev server starts — no regression |
| AC-12 | `pnpm -r build` succeeds across all packages | Run from root — all 5 packages build successfully |
| AC-13 | `pnpm typecheck` from root passes | Run from root — all 5 packages type-check clean |
| AC-14 | All version pins are exact | Inspect `devDependencies` — no `^` or `~` on `vite` or `@vitejs/plugin-react` |
| AC-15 | Renderer `"main"` field unchanged | `"main": "src/index.ts"` — app packages still resolve import correctly |
| AC-16 | New `.tsx` files have correct extension | `main.tsx` and `App.tsx` — not `.ts` |

## 14. Test Cases

| # | Test | Steps | Expected |
|---|------|-------|----------|
| TC-1 | Install dependencies | 1. Add `vite` and `@vitejs/plugin-react` to devDependencies<br>2. Run `pnpm install` | Exit 0; no warnings |
| TC-2 | TypeScript compiles clean | `cd packages/renderer && npx tsc --noEmit` | Exit 0; zero errors |
| TC-3 | Lint passes on new files | `cd packages/renderer && npx eslint src/**/*.{ts,tsx}` | Exit 0; zero violations |
| TC-4 | Dev server starts | `pnpm --filter @collectio/renderer dev` | Logs "Local: http://localhost:5173/" or similar |
| TC-5 | Browser renders content | Open dev server URL in browser | Page shows "Collectio" heading |
| TC-6 | HMR on component change | Edit `App.tsx` — change heading text, save | Browser updates without full page reload |
| TC-7 | HMR on new component | Add a new `.tsx` component, import into `App.tsx` | Browser updates; component renders |
| TC-8 | Production build | `pnpm --filter @collectio/renderer build` | Exit 0; `dist/` contains `index.html`, JS bundle, sourcemaps |
| TC-9 | Preview production build | `pnpm --filter @collectio/renderer preview` | Vite serves `dist/` on preview port; page shows "Collectio" |
| TC-10 | Path alias @shared resolves | In `App.tsx`, add `import { } from '@shared'`; run dev server | No module resolution error |
| TC-11 | Path alias @platform resolves | In `App.tsx`, add `import { } from '@platform'`; run dev server | No module resolution error |
| TC-12 | Root build includes renderer | `pnpm -r build` from root | All 5 packages build; renderer produces `dist/` |
| TC-13 | Root typecheck passes | `pnpm typecheck` from root | All 5 packages exit 0 |
| TC-14 | Root lint passes | `pnpm lint` from root | All 5 packages exit 0 |
| TC-15 | Electron dev still works | `pnpm dev:electron` | Electron window opens; loads content |
| TC-16 | Capacitor dev still works | `pnpm dev:capacitor` | Vite dev server starts for capacitor app |
| TC-17 | No JSX in `.ts` file | Verify `main.tsx` and `App.tsx` have `.tsx` extension | Files are `.tsx`, not `.ts` |
| TC-18 | `"main"` field unchanged | `node -e "console.log(require('./packages/renderer/package.json').main)"` | Output: `src/index.ts` |
| TC-19 | Build with tsc error fails fast | Intentionally add a type error to `main.tsx`; run build | tsc step fails; vite build does NOT run |
| TC-20 | Dev server serves index.html at root | `curl http://localhost:5173/` (or browser) | Returns HTML with `<div id="root">` |

## 15. Definition of Done

1. `packages/renderer/vite.config.ts` exists with `@vitejs/plugin-react`, path aliases matching tsconfig, port 5173, and build config
2. `packages/renderer/index.html` exists with `<div id="root">` and `<script type="module" src="/src/main.tsx">`
3. `packages/renderer/src/main.tsx` exists with React 18 `createRoot` and StrictMode wrapper (`.tsx` extension)
4. `packages/renderer/src/App.tsx` exists with minimal "Collectio" placeholder component (`.tsx` extension)
5. `packages/renderer/package.json` has `vite@5.4.21` and `@vitejs/plugin-react@4.3.4` in `devDependencies` (exact pins — no `^`/`~`)
6. `packages/renderer/package.json` has `"dev": "vite"`, `"preview": "vite preview"`, and `"build": "tsc --noEmit && vite build"` scripts
7. `packages/renderer/package.json` `"main"` field is unchanged (`"src/index.ts"`)
8. `pnpm install` succeeds with zero warnings
9. `pnpm --filter @collectio/renderer dev` launches Vite dev server and displays "Collectio" in browser
10. HMR works — editing `App.tsx` updates browser without full reload
11. `pnpm --filter @collectio/renderer build` exits 0 and produces `dist/`
12. `pnpm typecheck` from root passes all 5 packages
13. `pnpm lint` from root passes all 5 packages
14. `pnpm dev:electron` still launches Electron window (no regression)
15. `pnpm dev:capacitor` still starts Capacitor dev server (no regression)
16. All new files use correct extensions: `.tsx` for JSX, `.ts` for pure TypeScript
17. `dist/` and `.vite/` are covered by `.gitignore` (already present)

## 16. Implementation Order

1. Verify `vite@5.4.21` and `@vitejs/plugin-react@4.3.4` exist on npm (`npm view vite@5.4.21 version`, `npm view @vitejs/plugin-react@4.3.4 version`)
2. Add `vite` and `@vitejs/plugin-react` to `packages/renderer/package.json` `devDependencies`
3. Add `"dev": "vite"`, `"preview": "vite preview"` scripts; update `"build"` to `"tsc --noEmit && vite build"`
4. Create `packages/renderer/vite.config.ts` with React plugin, path aliases, and server/build config
5. Create `packages/renderer/index.html` with `<div id="root">` and module script
6. Create `packages/renderer/src/main.tsx` (`.tsx` extension) with React 18 `createRoot`
7. Create `packages/renderer/src/App.tsx` (`.tsx` extension) with placeholder "Collectio" heading
8. Run `pnpm install` — verify exit 0, no warnings
9. Run `pnpm --filter @collectio/renderer typecheck` — verify exit 0
10. Run `pnpm --filter @collectio/renderer lint` — verify exit 0
11. Run `pnpm --filter @collectio/renderer dev` — verify dev server launches, browser shows "Collectio"
12. Test HMR — edit `App.tsx`, verify browser updates
13. Run `pnpm --filter @collectio/renderer build` — verify exit 0, `dist/` produced
14. Run `pnpm --filter @collectio/renderer preview` — verify served content
15. Run `pnpm dev:electron` — verify no regression
16. Run `pnpm dev:capacitor` — verify no regression
17. Run `pnpm typecheck` from root — verify all 5 packages pass
18. Run `pnpm lint` from root — verify all 5 packages pass
19. Run `pnpm -r build` from root — verify all 5 packages build successfully

## 17. Traceability

| Source Document | Section | Requirement |
|----------------|---------|-------------|
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.8 | Vite config with React plugin, path aliases `@shared`/`@platform`, dev server port 5173, build to `dist/`, code splitting |
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.8 AC-1 | `pnpm --filter @collectio/renderer dev` runs Vite dev server |
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.8 AC-2 | Hot module replacement works |
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.8 AC-3 | Path aliases resolve correctly in dev and build |
| `PROJECT_CONSTITUTION.md` | Section 12 | Vite as bundler (Row: "Bundler") |
| `01_ARCHITECTURE.md` | Section 2 | Vite — Fast HMR for renderer; path aliases via tsconfig paths |
| `05_FOLDER_STRUCTURE.md` | Section 4 | Import aliases: `@shared` → `packages/shared/src/`, `@renderer` → `packages/renderer/src/`, `@platform` → `packages/platform/src/` |
| `07_AGENT_RULES.md` | Rule 9.4 | Verify TypeScript before every build — `tsc --noEmit && vite build` |
| `07_AGENT_RULES.md` | Rule 11.1 | Strict mode is mandatory |
| `07_AGENT_RULES.md` | Rule 11.4 | Verify versions against npm registry before pinning |
| `07_AGENT_RULES.md` | Rule 11.6 | All files containing JSX must use `.tsx` extension |
| `07_AGENT_RULES.md` | Rule 13.4 | Renderer must never import platform-specific code — `@platform` alias resolves to interface layer only |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-04 | `node-linker=hoisted` enables root bin resolution |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-07 | `@types/react-dom@18.3.7` — independent version track from `@types/react@18.3.31` |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-12 | `.tsx` extension required for files containing JSX |
| `06_IMPLEMENTATION_DECISIONS.md` | PK-07 | Renderer UI dependencies already installed (React, MUI, etc.) |
| `08_SPIKE_RETROSPECTIVE.md` | Section 3 | Vite 5.4.21 — APPROVED for production |
