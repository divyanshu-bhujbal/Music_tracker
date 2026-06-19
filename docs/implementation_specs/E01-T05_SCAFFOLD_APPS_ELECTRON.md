# E01 T05 — Scaffold apps/electron: Implementation Specification

## 1. Goal

Create the `apps/electron/` package — the Electron desktop entry point that wraps the shared React web UI (`@collectio/renderer`) in an Electron `BrowserWindow`. This is the Windows distribution target for the Personal Collection Manager. The package provides the Electron main process (window creation, lifecycle management), preload script (context bridge stub), Vite build configuration for main/preload compilation, electron-builder packaging config, and a `dev` script that launches a working Electron window.

This is the last remaining scaffolding task for E-01. Tasks T-01.1 through T-01.4 and T-01.6 are complete. Root `package.json` already has `dev:electron` and `build:electron` scripts targeting `@collectio/electron-app`.

## 2. Scope

| In scope | Detail |
|----------|--------|
| `apps/electron/package.json` | Package manifest: name `@collectio/electron-app`, `"type": "module"`, workspace deps on `@collectio/renderer` and `@collectio/platform`, runtime dep on `electron`, devDeps for Vite + electron-builder toolchain |
| `apps/electron/tsconfig.json` | Strict TypeScript, Node.js environment, path aliases to renderer and platform |
| `apps/electron/src/main.ts` | Minimal Electron main process — create `BrowserWindow`, load renderer, handle lifecycle events (`ready`, `window-all-closed`, `activate`) |
| `apps/electron/src/preload.ts` | Context bridge stub — empty preload script with a type annotation for `contextBridge` (no exposed APIs at scaffolding stage) |
| `apps/electron/electron-builder.yml` | Basic Windows-only build config with app ID, product name, directories, NSIS target |
| `apps/electron/vite.config.ts` | Vite config with `vite-plugin-electron` for main + preload compilation, `@vitejs/plugin-react` for renderer JSX |
| `apps/electron/index.html` | Minimal HTML shell — loads renderer entry via `<script type="module" src="/src/renderer.ts">` |
| `apps/electron/src/renderer.ts` | Renderer entry point — imports `@collectio/renderer` and mounts React root |
| Workspace recognition | `@collectio/electron-app` must resolve in the monorepo |
| Dev launch | `pnpm dev:electron` launches an Electron window that displays the renderer package content |

## 3. Out of Scope

| Out of scope | Handled by |
|-------------|-----------|
| Writing Electron provider implementations (`ElectronAuthProvider.ts`, etc.) | E-03 (Security Primitives), E-04 (Platform Services) |
| Dependency injection container setup | E-04 — platform providers injected via React context at future app entry point wiring |
| Context bridge API exposure (`contextBridge.exposeInMainWorld`) | E-04 — preload is a stub at scaffolding stage |
| Right-click context menus (`Menu.buildFromTemplate()`) | E-15 (UI Shell) |
| Keyboard shortcuts (`globalShortcut` API) | E-15 (UI Shell) |
| Window state persistence (position, size, maximized) | E-15 |
| Native notifications | Deferred |
| Auto-update (electron-updater) | E-17 (Release Preparation) |
| Code signing configuration | E-17 |
| macOS or Linux build targets | V2 — constitution Section 6.3: iOS/macOS deferred |
| `vite-plugin-electron-renderer` (Node.js API polyfills in renderer) | Not needed at scaffolding — add when renderer needs `__dirname`, `require`, or Node.js built-ins |
| Any React component or UI code in the electron app | Renderer package owns all UI — electron app only loads it |
| Modifying `packages/renderer/` or `packages/platform/` | These packages are consumed as-is |
| `electron-store` or `safeStorage` configuration | Already installed in `packages/platform/`; wiring deferred to E-04 |
| `better-sqlite3` native compilation verification | Native compilation is pre-validated by `packages/platform/` (T-01.4 already installed it) |
| `argon2` native compilation verification | Same as above |

## 4. Files to Create

| File | Content | Notes |
|------|---------|-------|
| `apps/electron/package.json` | Package manifest | See spec below — 3 runtime deps, 7 devDeps |
| `apps/electron/tsconfig.json` | TypeScript config | Strict, Node.js lib, paths to renderer + platform |
| `apps/electron/vite.config.ts` | Vite config | vite-plugin-electron + @vitejs/plugin-react |
| `apps/electron/electron-builder.yml` | Build config | Windows NSIS, app ID, product name |
| `apps/electron/index.html` | HTML shell | Minimal `<div id="root">` + module script |
| `apps/electron/src/main.ts` | Electron main process | BrowserWindow creation, lifecycle handlers |
| `apps/electron/src/preload.ts` | Preload script stub | Empty preload with contextBridge type annotation |
| `apps/electron/src/renderer.ts` | Renderer entry | React DOM mount, imports from `@collectio/renderer` |

### `apps/electron/package.json` (Target)

```json
{
  "name": "@collectio/electron-app",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "pack": "electron-builder --dir",
    "dist": "electron-builder"
  },
  "dependencies": {
    "electron": "30.5.1",
    "@collectio/renderer": "workspace:*",
    "@collectio/platform": "workspace:*"
  },
  "devDependencies": {
    "vite": "5.4.21",
    "vite-plugin-electron": "1.0.4",
    "@vitejs/plugin-react": "4.3.4",
    "electron-builder": "26.15.5",
    "typescript": "5.9.3",
    "@types/node": "20.19.43",
    "@types/react": "18.3.31",
    "@types/react-dom": "18.3.7"
  }
}
```

**Dependency decisions:**

| Package | Version | Role | Rationale |
|---------|---------|------|-----------|
| `electron` | `30.5.1` | Runtime — Electron desktop shell | Pinned to latest v30 patch; matches architecture target "Electron 30+" (`01_ARCHITECTURE.md` Section 2). Already present in `packages/platform/` — pnpm deduplicates to single copy. |
| `@collectio/renderer` | `workspace:*` | Runtime — shared React UI | The electron app loads the renderer package content. |
| `@collectio/platform` | `workspace:*` | Runtime — platform adapters | App entry point imports Electron-specific providers from `@collectio/platform`. |
| `vite` | `5.4.21` | Dev — bundler | Same version as capacitor app (`apps/capacitor/package.json`); consistent across monorepo. |
| `vite-plugin-electron` | `1.0.4` | Dev — main/preload compilation | Latest stable v1. Compiles `main.ts` and `preload.ts` from ESNext/TypeScript to CommonJS for Electron main process. Peer dep `vite-plugin-electron-renderer` omitted — not needed at scaffolding (no Node.js APIs in renderer yet). |
| `@vitejs/plugin-react` | `4.3.4` | Dev — renderer JSX transform | Required for React JSX in the renderer served by Vite dev server. Pinned to latest 4.3.x (capacitor app uses `^4.3.0` — same family). |
| `electron-builder` | `26.15.5` | Dev — packaging | Latest non-alpha release. Produces NSIS installer for Windows. |
| `typescript` | `5.9.3` | Dev — type checking | Consistent with all other packages. |
| `@types/node` | `20.19.43` | Dev — Node.js type definitions | Latest 20.x types matching Node 20 runtime. Required for `main.ts` and `preload.ts` which use Node.js APIs (`path`, `fs`, `__dirname`). |
| `@types/react` | `18.3.31` | Dev — React type definitions | Same version as `packages/renderer/package.json`. Required for `src/renderer.ts` which imports React. |
| `@types/react-dom` | `18.3.7` | Dev — React DOM type definitions | Same version as `packages/renderer/package.json`. See AD-07 (`06_IMPLEMENTATION_DECISIONS.md`) — `18.3.30` does not exist. |

**Why `electron` is both in `packages/platform/` and `apps/electron/`:**
- `packages/platform/` has `electron` for type resolution in provider implementations (`ElectronAuthProvider`, `ElectronStorageProvider`) — it needs `electron` types but doesn't run the Electron process.
- `apps/electron/` has `electron` as a runtime dependency — it IS the Electron process.
- pnpm's hoisted layout deduplicates to a single copy at root `node_modules/`. This is the standard pattern for monorepos with Electron.

**Why `vite-plugin-electron-renderer` (peer dep of `vite-plugin-electron`) is excluded:**
- `vite-plugin-electron-renderer` provides Node.js API polyfills (`__dirname`, `require`, `fs`) in the renderer (web) context.
- At scaffolding stage, the renderer is a pure React web app with no Node.js API access — content security policy forbids it.
- Future tasks (E-04) that need Node.js APIs in the renderer will add this dependency. Excluding it now is deliberate and documented.

**Scripts:**

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `vite` | Starts Vite dev server + compiles main/preload + launches Electron |
| `build` | `tsc --noEmit && vite build` | Typecheck then production Vite build |
| `typecheck` | `tsc --noEmit` | TypeScript compilation check only |
| `pack` | `electron-builder --dir` | Package into unpacked directory (for testing) |
| `dist` | `electron-builder` | Produce distributable installer |

### `apps/electron/tsconfig.json` (Target)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
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
    "declaration": false,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "paths": {
      "@shared/*": ["../../packages/shared/src/*"],
      "@shared": ["../../packages/shared/src"],
      "@platform/*": ["../../packages/platform/src/*"],
      "@platform": ["../../packages/platform/src"],
      "@renderer/*": ["../../packages/renderer/src/*"],
      "@renderer": ["../../packages/renderer/src"]
    }
  },
  "include": ["src"],
  "references": [
    { "path": "../../packages/shared" },
    { "path": "../../packages/renderer" },
    { "path": "../../packages/platform" }
  ]
}
```

**Key decisions:**

- **`"lib": ["ES2022"]`** — No DOM types. `main.ts` and `preload.ts` run in Node.js, not the browser. DOM is available in the renderer process but that runs inside Chromium with its own global scope — the TypeScript config for this package only covers main/preload source files, not the renderer web page.
- **`"declaration": false`** — Apps do not need to emit type declarations (they are consumers, not libraries). This differs from `packages/*` which have `"declaration": true` for downstream type resolution.
- **`"paths"`** — Maps `@shared`, `@platform`, and `@renderer` to their respective source directories. Uses `../../` because `apps/electron/tsconfig.json` is two levels below the workspace root. These aliases allow clean imports like `import { CategoryRegistry } from '@shared/application/category/CategoryRegistry'`.
- **`"references"`** — Declares project references to shared, renderer, and platform. Enables TypeScript to understand the workspace dependency graph for incremental builds and `composite: true` projects. Paths are relative from `apps/electron/tsconfig.json`.
- **`"composite": true`** — Required for TypeScript project references to function. Generates `tsconfig.tsbuildinfo` (already gitignored by root `.gitignore`).
- **All other options** match `packages/shared/tsconfig.json` baseline (Rule 11.5, Agent Rules).
- **No `"jsx"`** — `main.ts` and `preload.ts` contain no JSX. Renderer JSX is handled by `@vitejs/plugin-react` in Vite config, not by the tsconfig of this package.

### `apps/electron/vite.config.ts` (Target)

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: "src/main.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            sourcemap: true,
          },
        },
      },
      {
        entry: "src/preload.ts",
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: "dist-electron",
            sourcemap: true,
          },
        },
      },
    ]),
  ],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
```

**Key decisions:**

- **`react()`** plugin handles JSX for the renderer HTML page (served by Vite dev server or built to `dist/`).
- **`electron()`** plugin compiles `main.ts` and `preload.ts` as Electron background processes. Output goes to `dist-electron/` (separate from renderer `dist/`).
- **Main entry** (`src/main.ts`): Compiled as Electron main process. The `onstart` callback is omitted — `vite-plugin-electron@1.x` auto-starts Electron after main compilation in dev mode.
- **Preload entry** (`src/preload.ts`): The `onstart(args) { args.reload() }` callback tells Electron to reload the renderer when preload changes — standard HMR pattern for preload scripts.
- **`sourcemap: true`** on both main and preload — enables debugging in VS Code / Chrome DevTools for the main process.
- **`outDir: "dist"`** for the renderer build — matches capacitor app convention. `dist-electron/` for main/preload — kept separate to avoid Electron process files being served as web assets.

### `apps/electron/electron-builder.yml` (Target)

```yaml
appId: com.collectio.app
productName: Collectio
copyright: Copyright © 2026

directories:
  output: release
  buildResources: build

files:
  - dist/**/*
  - dist-electron/**/*
  - package.json

win:
  target:
    - target: nsis
      arch:
        - x64
  icon: build/icon.ico

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
```

**Key decisions:**

- **`appId: com.collectio.app`** — Matches the capacitor app's `appId` in `apps/capacitor/capacitor.config.ts`. Consistent identity across platforms.
- **`productName: Collectio`** — Uses the placeholder name from constitution OD-03. Updated when product name is finalized.
- **`directories.output: release`** — Installer output goes to `release/` (not `dist/` — avoids conflict with Vite build output).
- **`files`** — Includes both `dist/` (renderer web assets) and `dist-electron/` (compiled main/preload). The `package.json` is included because electron-builder reads it for app metadata.
- **`win.target: nsis`** — NSIS installer for Windows. Standard, no-signing-required approach for V1.
- **`win.arch: x64`** — Windows 10+ target. 32-bit (ia32) is out of scope per NFR-COMPAT-02.
- **`nsis.oneClick: false`** — User sees the install wizard (choose directory, see license). More appropriate for a desktop app than silent one-click install.
- **No code signing** — Signing is deferred to E-17 (Release Preparation). The unsigned installer will trigger SmartScreen warnings — acceptable for V1 development.
- **No auto-update** — Deferred to E-17. `electron-builder` supports `electron-updater`; config is additive without breaking existing settings.

### `apps/electron/index.html` (Target)

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Collectio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer.ts"></script>
  </body>
</html>
```

**Key decisions:**

- **No `viewport-fit=cover`** — This is a desktop app (Electron), not a mobile WebView. The viewport meta is simplified.
- **`<script type="module" src="/src/renderer.ts">`** — Entry point for the React renderer. In dev, Vite serves and transforms this. In production build, Vite bundles it.
- **`<div id="root">`** — Standard React mount point. Same as capacitor app's `index.html`.

### `apps/electron/src/main.ts` (Target)

```typescript
import { app, BrowserWindow } from "electron";
import { join } from "node:path";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, "../dist-electron/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
    title: "Collectio",
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  if (process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173");
  } else {
    mainWindow.loadFile(join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("ready", createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
```

**Key decisions:**

- **`contextIsolation: true`** — Mandatory for security. Isolates the preload script's context from the renderer's web context. All communication between main and renderer goes through the context bridge (stubbed in `preload.ts`, wired in E-04).
- **`nodeIntegration: false`** — Renderer (React UI) does NOT have access to Node.js APIs. This is a security boundary per Electron best practices.
- **`sandbox: false`** — Sandbox is disabled because the preload script needs `contextBridge` API access. Can be reconsidered in a security audit (future).
- **`show: false` + `ready-to-show`** — Prevents visual flash. Window is created hidden, then shown once the renderer content is ready. This avoids a white flash on startup.
- **Dev vs. production loading** — In dev, loads from Vite dev server (`http://localhost:5173`). In production, loads from built `dist/index.html`. The `VITE_DEV_SERVER_URL` env var is automatically set by `vite-plugin-electron@1.x` in dev mode.
- **`window-all-closed` quits the app** — Standard Electron behavior for single-window apps. On macOS this is typically `app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); })` but macOS is not a V1 target (constitution Section 6.3).
- **`activate` re-creates window** — Standard Electron pattern. On Windows, `activate` fires when the user clicks the app icon in the taskbar with no windows open.
- **Window dimensions** — 1200×800 default, 800×600 minimum. Comfortable for the table view UI described in constitution Section 18.2. Adjustable in E-15.

### `apps/electron/src/preload.ts` (Target)

```typescript
import { contextBridge } from "electron";

// Platform API surface — populated by E-04 (Platform Services)
// Exposes typed, secure bridge between main process Node.js APIs and renderer React UI
// Example future shape:
//   contextBridge.exposeInMainWorld('collectioAPI', {
//     sqlite: { ... },
//     crypto: { ... },
//     auth: { ... },
//     storage: { ... },
//   });

export {};
```

**Key decisions:**

- **Empty preload at scaffolding** — No APIs exposed yet. The `contextBridge` import exists to verify the import resolves and compiles. The `export {}` marks the file as a module.
- **Future API surface** — E-04 (Platform Services) will expose Electron-specific provider implementations through `contextBridge.exposeInMainWorld()`. The renderer will access them via a typed global object (e.g., `window.collectioAPI`).
- **No `ipcRenderer` import yet** — IPC channels are defined when the first provider is wired. This stub avoids premature commitment to an IPC protocol.
- **No `preload` path in `electron-builder.yml`** — electron-builder reads the preload path from the `webPreferences.preload` in `main.ts`, not from a static config.

### `apps/electron/src/renderer.ts` (Target)

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <div>Collectio</div>
    </StrictMode>,
  );
} else {
  throw new Error("Root element #root not found in the DOM");
}
```

**Key decisions:**

- **Minimal React mount** — Renders a simple `<div>Collectio</div>` as a placeholder. The full app shell, routing, and sidebar are wired in E-15 (UI Shell) by importing from `@collectio/renderer`.
- **`StrictMode`** — Wraps the app in React Strict Mode for development warnings. No functional impact in production.
- **`createRoot` API** — Uses React 18's `createRoot` (not legacy `ReactDOM.render`). Matches the capacitor app's `main.tsx`.
- **Null check on `#root`** — Throws a clear error if the DOM element is missing, rather than a cryptic `createRoot` null reference error. This is a defensive pattern that makes debugging startup failures easier.
- **Does NOT import `@collectio/renderer` yet** — At scaffolding stage, `@collectio/renderer` only has `export {}`. The renderer entry renders its own placeholder. When E-15 adds the app shell, this file will import the shell component from `@collectio/renderer`.

## 5. Files to Modify

| File | Action | Reason |
|------|--------|--------|
| `pnpm-lock.yaml` | Auto-updated by `pnpm install` | 10 new packages added; `electron`, `vite`, `typescript` may be deduplicated |
| Root `package.json` | **No change** | Scripts `dev:electron` and `build:electron` already reference `@collectio/electron-app` — they start working automatically after T-01.5 installs |

**Indirect effects on existing packages (no manual edits — pnpm resolves automatically):**

- `packages/platform/` has `electron@30.5.1` — after install, pnpm deduplicates to the same version. No conflict.
- `packages/renderer/` has `@types/react@18.3.31` and `@types/react-dom@18.3.7` — the electron app also declares these at the same versions. pnpm deduplicates.
- `node_modules/` gains `@types/node@20.19.43` — available for all packages (shared, renderer, platform already have `skipLibCheck: true` so no impact).

## 6. Interfaces

No runtime interfaces are produced by this task. The electron app is a consumer of interfaces defined in `@collectio/shared` and implemented in `@collectio/platform`.

Future tasks wire these interfaces into the electron app:
- `AuthProvider` → `ElectronAuthProvider` (from `@collectio/platform/src/electron/`)
- `CryptoProvider` → `NodeCryptoProvider` (from `@collectio/platform/src/electron/`)
- `SecureStorageProvider` → `ElectronStorageProvider` (from `@collectio/platform/src/electron/`)
- `DatabaseConnection` → `BetterSqlite3Connection` (from `@collectio/platform/src/electron/`)
- `CloudStorageProvider` → `GoogleDriveProvider` (from `@collectio/platform/src/shared/`)

The dependency injection container that binds these will be created in E-04.

## 7. State Changes

| Before | After |
|--------|-------|
| `apps/electron/` does not exist | `apps/electron/package.json`, `tsconfig.json`, `vite.config.ts`, `electron-builder.yml`, `index.html`, `src/main.ts`, `src/preload.ts`, `src/renderer.ts` exist |
| `@collectio/electron-app` not in workspace | `@collectio/electron-app` recognized by pnpm |
| Root script `pnpm dev:electron` fails ("package not found") | `pnpm dev:electron` launches Vite dev server + opens Electron window |
| `vite-plugin-electron` not installed | `vite-plugin-electron@1.0.4` installed at root `node_modules/` |
| `electron-builder` not installed | `electron-builder@26.15.5` installed at root `node_modules/` |
| `@types/node` not installed | `@types/node@20.19.43` installed at root `node_modules/` |
| No `electron-builder.yml` | Windows NSIS build config present |
| `node_modules/` has ~250 packages | `node_modules/` gains ~30 electron-builder transitive packages (approximately) |
| All existing scripts (`pnpm build:capacitor`, `pnpm typecheck`, `pnpm lint`) work unchanged | Same — no regression |

## 8. Database Changes

None. This is an app entry point scaffold with no database interaction. The electron app consumes the database layer from `@collectio/shared` and `@collectio/platform`, which manage their own SQLite connections.

## 9. Error Handling

| Failure scenario | Behavior |
|-----------------|----------|
| `pnpm install` fails because `electron` binary download fails | Retry. Electron is ~180MB download. If persistent network issue, set `ELECTRON_MIRROR` env var. Document in the error output. |
| `pnpm install` fails with peer dependency conflict on `vite-plugin-electron` + `vite-plugin-electron-renderer` | `vite-plugin-electron-renderer` is NOT listed as a dependency. If pnpm auto-installs it and creates a conflict, add `vite-plugin-electron-renderer` to `pnpm.onlyBuiltDependencies` or configure pnpm to suppress the peer dep warning. |
| `tsc --noEmit` fails in `apps/electron/` | Check that `@types/node` is installed; verify path aliases point to existing files; verify `references` paths are correct. |
| `vite-plugin-electron` fails to compile `main.ts` | Check that `electron` is importable from `node_modules/`; verify Vite config's `entry` paths exist; check that `moduleResolution: "bundler"` is set. |
| `pnpm dev:electron` launches Electron but window is blank/white | Vite dev server may not be ready when Electron loads the page. Add a small delay or retry logic. This is a known Electron + Vite timing issue. `vite-plugin-electron@1.x` typically handles this automatically — if not, add `mainWindow.loadURL()` in the `ViteDevServer`'s `listen` callback. |
| `pnpm dev:electron` fails with "electron: command not found" | Verify `electron@30.5.1` is in `apps/electron/dependencies` (not devDependencies). Verify `node_modules/.bin/electron` exists. |
| `pnpm dev:electron` on a machine without a display | Electron will fail to create a window. Expected — dev workflow requires a graphical environment. |
| `tsc --noEmit` fails with "Cannot find module '@collectio/renderer'" | Verify `@collectio/renderer` is a dependency with `workspace:*` protocol; verify the renderer package `name` field matches; run `pnpm install`. |
| `tsc --noEmit` fails with "Composite projects may not disable declaration emit" | `"declaration": false` and `"composite": true` conflict in TypeScript 5.x. Either set `"declaration": true` or remove `"composite": true`. Since this is an app (not a library), prefer removing `"composite": true` and `"references"`. |
| `electron-builder.yml` has invalid YAML syntax | `electron-builder` will fail to parse the config at build time. Validate YAML syntax with a linter. |
| `tsconfig.tsbuildinfo` appears in `git status` | The `.gitignore` already has `*.tsbuildinfo` — verify it matches. If not, add to `.gitignore`. |
| Electron window opens but shows 404 or connection refused | Vite dev server is not running on the expected port. Verify port 5173 is not in use. The `vite-plugin-electron` plugin should auto-start the dev server — if it doesn't, the `VITE_DEV_SERVER_URL` env var won't be set. |
| `path aliases` in tsconfig don't resolve at runtime (in Vite) | TypeScript path aliases only work for `tsc`. Vite needs corresponding `resolve.alias` in `vite.config.ts`. This must be added — see the Vite config spec above (no aliases needed there because the renderer entry doesn't import from `@shared`/`@platform` at scaffolding stage). When those imports are added in E-04, Vite aliases must be configured. |

## 10. Logging Requirements

None. The task produces configuration files and a minimal Electron shell. At scaffolding stage, no application-level logging is needed.

**Informational output from dev launch:**
- Vite dev server URL (e.g., `http://localhost:5173`)
- Electron main process startup confirmation
- These are produced by Vite and Electron automatically, not by application code

## 11. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-1 | `tsc --noEmit` passes in `apps/electron/` with zero errors | Run `npx tsc --noEmit` in `apps/electron/` — exit 0 |
| AC-2 | `main.ts` imports `electron` and compiles | `import { app, BrowserWindow } from 'electron'` must resolve without TypeScript errors |
| AC-3 | `preload.ts` imports `contextBridge` and compiles | `import { contextBridge } from 'electron'` must resolve |
| AC-4 | `renderer.ts` imports React and ReactDOM and compiles | `import { StrictMode } from 'react'` and `import { createRoot } from 'react-dom/client'` must resolve |
| AC-5 | Import from `@collectio/renderer` resolves (TypeScript) | `import {} from '@collectio/renderer'` must resolve without errors |
| AC-6 | Import from `@collectio/platform` resolves (TypeScript) | `import {} from '@collectio/platform'` must resolve without errors |
| AC-7 | Path alias `@shared/` resolves | `import {} from '@shared/index'` must resolve to `packages/shared/src/index.ts` |
| AC-8 | `pnpm install` at root succeeds | Run `pnpm install` — exit 0, no peer dependency errors |
| AC-9 | Package resolves as `@collectio/electron-app` in monorepo | Run `pnpm list --recursive --depth 0` — must show `@collectio/electron-app` |
| AC-10 | All dependencies pinned to exact versions (no `^` or `~`) | Inspect `apps/electron/package.json` — all version strings must be bare numbers |
| AC-11 | `pnpm dev:electron` launches an Electron window | Run from root — an Electron window must appear on screen |
| AC-12 | Electron window displays content (not blank/error) | Window must show "Collectio" text or the Vite dev server page — not an error page or blank white |
| AC-13 | Electron window can be closed normally | Click the window's close button — the process must exit cleanly (no lingering processes) |
| AC-14 | Existing `pnpm build:capacitor` still works | Run from root — capacitor app build must succeed (no regression) |
| AC-15 | Existing `pnpm typecheck` still passes | Run from root — all packages typecheck must succeed (4 packages + 2 apps) |
| AC-16 | `electron-builder.yml` is valid YAML | Parse the file with a YAML validator — no syntax errors |
| AC-17 | `vite.config.ts` exports a valid config | Run `npx vite --config apps/electron/vite.config.ts --help` — must not error |
| AC-18 | `.gitignore` covers `dist-electron/` and `release/` | Verify `dist-electron` and `release` are in `.gitignore` or `dist`/`build` patterns already cover them |
| AC-19 | No JSX in main.ts or preload.ts | Inspect files — no JSX syntax. `tsc --noEmit` would catch this. |
| AC-20 | No `vite-plugin-electron-renderer` in package.json | Inspect dependencies and devDependencies — must not be present |

## 12. Test Cases

| # | Test | Steps | Expected |
|---|------|-------|----------|
| TC-1 | Package creation and install | 1. Create the 8 files<br>2. Run `pnpm install` | Exit 0; no peer dep errors |
| TC-2 | TypeScript compilation | `cd apps/electron && npx tsc --noEmit` | Exit 0; no errors |
| TC-3 | `main.ts` electron imports | `npx tsc --noEmit` after writing `main.ts` | Exit 0; `app`, `BrowserWindow`, `join` resolve |
| TC-4 | `preload.ts` contextBridge import | `npx tsc --noEmit` after writing `preload.ts` | Exit 0; `contextBridge` resolves |
| TC-5 | `renderer.ts` React imports | `npx tsc --noEmit` after writing `renderer.ts` | Exit 0; `StrictMode`, `createRoot` resolve |
| TC-6 | Workspace dep resolution — renderer | `node -e "require.resolve('@collectio/renderer')"` in `apps/electron/` | Must resolve to `packages/renderer/src/index.ts` |
| TC-7 | Workspace dep resolution — platform | `node -e "require.resolve('@collectio/platform')"` in `apps/electron/` | Must resolve to `packages/platform/src/index.ts` |
| TC-8 | Path alias — @shared | Add `import {} from '@shared/index';` to `src/main.ts`; run `npx tsc --noEmit` | Exit 0 |
| TC-9 | Path alias — @renderer | Add `import {} from '@renderer/index';` to `src/renderer.ts`; run `npx tsc --noEmit` | Exit 0 |
| TC-10 | Path alias — @platform | Add `import {} from '@platform/index';` to `src/main.ts`; run `npx tsc --noEmit` | Exit 0 |
| TC-11 | Vite dev launch | Run `pnpm dev:electron` from root | Electron window appears; no crash on startup |
| TC-12 | Window displays content | After TC-11, inspect the Electron window | Content visible — "Collectio" text or React-rendered page; not blank white |
| TC-13 | Window close clean | Click window close button after TC-11 | Process exits cleanly; `echo $?` (or equivalent) shows exit 0 |
| TC-14 | Capacitor app not broken | `pnpm build:capacitor` from root | Exit 0 |
| TC-15 | All packages typecheck | `pnpm typecheck` from root | Exit 0 |
| TC-16 | Package name recognition | `pnpm list --recursive --depth 0` | Output includes `@collectio/electron-app@0.0.0` |
| TC-17 | No version ranges | Inspect `apps/electron/package.json` — grep for `"^` or `"~` | No matches in version strings |
| TC-18 | tsconfig.json consistency | Diff `compilerOptions` between `packages/shared/tsconfig.json` and `apps/electron/tsconfig.json` | All shared options present (except `lib`, `paths`, `references`, `declaration`, `composite` which are intentionally different) |
| TC-19 | `electron-builder.yml` YAML validity | Parse with `node -e "require('js-yaml').load(require('fs').readFileSync('apps/electron/electron-builder.yml','utf8'))"` | No parse error |
| TC-20 | `vite.config.ts` exports valid config | Run `npx vite --config apps/electron/vite.config.ts` — process starts then Ctrl+C to stop | No config parse error on startup |
| TC-21 | Clean temp test modifications | Revert temporary import changes from TC-8, TC-9, TC-10 | `git diff` in `apps/electron/` shows only intended files |
| TC-22 | `dist-electron/` and `release/` in .gitignore | Inspect `.gitignore` | `dist` pattern covers `dist-electron/`; `release/` is not explicitly listed — add if missing (or verify `build` pattern in capacitor section doesn't unintentionally include it) |

## Architecture Decisions

### AD-T05-01: `vite-plugin-electron@1.0.4` (Latest Stable v1)

**Decision:** Use `vite-plugin-electron@1.0.4` — the latest stable v1 release — not the `1.0.0-beta.x` prereleases.

**Reason:** v1.0.4 is the latest stable release of `vite-plugin-electron`. The beta series (1.0.0-beta.1 through beta.15) are prereleases. v0.x (0.29.1 latest) is the previous major. v1 has a simplified API where the `electron()` plugin accepts an array of entry configs — cleaner than v0's separate `electron()` and `preload()` calls.

### AD-T05-02: `electron@30.5.1` (Matching Platform Package)

**Decision:** Pin `electron@30.5.1` — the same version as `packages/platform/package.json`.

**Reason:** The platform package already installed `electron@30.5.1` during T-01.4 for type resolution in Electron-specific providers. Using the same version ensures type compatibility and deduplication. The architecture spec (`01_ARCHITECTURE.md`) targets "Electron 30+". v30.5.1 is the latest v30 patch.

### AD-T05-03: React Plugin in Electron Vite Config

**Decision:** Include `@vitejs/plugin-react@4.3.4` in `apps/electron/vite.config.ts` and as a devDependency.

**Reason:** The Vite dev server for Electron serves the renderer HTML page. This page contains React JSX (via `src/renderer.ts` and future imports from `@collectio/renderer`). The React plugin is required for JSX transformation. The capacitor app uses the same plugin — the version is pinned to the latest 4.3.x for consistency.

### AD-T05-04: `"type": "module"` in Package.json with CJS Output

**Decision:** Set `"type": "module"` in `apps/electron/package.json` even though Electron main process expects CommonJS.

**Reason:** `vite-plugin-electron` compiles TypeScript source (ES module syntax) to CommonJS output for the Electron main process. It handles the module system conversion internally. The `"type": "module"` setting affects how Node.js interprets `.js` files in the package — but since we're using `.ts` source files and Vite compiles them to `.js` with CommonJS wrapper, this setting has no impact on the compiled output. It does, however, enable Vite and `tsc` to correctly interpret the source as ESM, matching all other workspace packages.

**Consequence:** The `"type": "module"` is correct for the source code and has no effect on the compiled Electron main process. This is the standard pattern for `vite-plugin-electron` projects.

### AD-T05-05: `contextIsolation: true` + `nodeIntegration: false` (Mandatory)

**Decision:** Set `contextIsolation: true` and `nodeIntegration: false` in `BrowserWindow` webPreferences.

**Reason:** These are the Electron security defaults since Electron 12 and are considered mandatory for any production Electron app. `contextIsolation` ensures the preload script's `window` object is separate from the renderer's `window`, preventing prototype pollution attacks. `nodeIntegration: false` prevents the renderer from accessing Node.js APIs directly. All main-to-renderer communication goes through the context bridge (wired in E-04).

### AD-T05-06: No `vite-plugin-electron-renderer` at Scaffolding

**Decision:** Exclude `vite-plugin-electron-renderer` (peer dependency of `vite-plugin-electron`) from the initial scaffold.

**Reason:** `vite-plugin-electron-renderer` provides Node.js API polyfills (`__dirname`, `require`, `fs`, `path`) in the renderer (web) context. At scaffolding stage, the renderer is a pure React web app — it should NOT have access to Node.js APIs. Adding it now would:
- Enable `require()` in the renderer — a security anti-pattern
- Mask the need for proper context bridge API design
- Contradict the security architecture

This dependency will be added in E-04 only if a specific provider implementation requires it (unlikely — the architecture uses context bridge + DI, not direct Node.js imports from the renderer).

### AD-T05-07: `"declaration": false` for App Packages

**Decision:** Set `"declaration": false` in `apps/electron/tsconfig.json`, diverging from `packages/*` which use `"declaration": true`.

**Reason:** Apps are leaf consumers — no other package imports from them. Emitting declaration files for an app adds unnecessary build artifacts with no consumer. The `packages/*` packages are libraries and must emit declarations for downstream type resolution.

**Conflict with `composite: true`:** TypeScript 5.x reports "Composite projects may not disable declaration emit" when both `"declaration": false` and `"composite": true` are set. If this error occurs during implementation, remove `"composite": true` and `"references"` from the tsconfig. The app does not need project references — it's a consumer, not a dependency. This is noted as an implementation-time decision.

### AD-T05-08: `node:` Protocol for Built-in Module Imports

**Decision:** Use `node:` protocol prefix for Node.js built-in module imports (e.g., `import { join } from 'node:path'`).

**Reason:** The `node:` prefix explicitly marks the import as a Node.js built-in, distinguishing it from npm packages. This is the recommended Node.js style since Node 16 and is supported by both TypeScript (`@types/node@20`) and Vite's bundler module resolution. It prevents accidental shadowing of built-ins by npm packages (e.g., a malicious `path` package on npm).

## Implementation Order

1. Create `apps/electron/` directory and `apps/electron/src/` subdirectory
2. Write `apps/electron/package.json` with all dependencies
3. Write `apps/electron/tsconfig.json`
4. Write `apps/electron/vite.config.ts`
5. Write `apps/electron/electron-builder.yml`
6. Write `apps/electron/index.html`
7. Write `apps/electron/src/main.ts`
8. Write `apps/electron/src/preload.ts`
9. Write `apps/electron/src/renderer.ts`
10. Run `pnpm install` at root — verify exit 0 (expect ~180MB electron download if not already cached from T-01.4)
11. Run `npx tsc --noEmit` in `apps/electron/` — verify exit 0
12. **If AC-17 "composite + declaration: false" error:** Remove `"composite": true` and `"references"` from tsconfig; retest
13. Run `pnpm build:capacitor` to verify no regression
14. Run `pnpm typecheck` from root to verify all packages pass
15. Run `pnpm dev:electron` to launch Electron window
16. Verify window shows "Collectio" content
17. Close window, verify process exits cleanly
18. Run `pnpm list --recursive --depth 0` to verify workspace recognition
19. Verify `.gitignore` covers `dist-electron/` and `release/` directories (add entries if missing)

## Traceability

| Source Document | Section | Requirement |
|----------------|---------|-------------|
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.5 | 6 files produced: package.json, tsconfig.json, main.ts, preload.ts, electron-builder.yml, vite.config.ts |
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.5 AC-1 | `pnpm dev:electron` launches Electron window |
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.5 AC-2 | Window loads content from packages/renderer |
| `05_FOLDER_STRUCTURE.md` | Section 1 | `apps/electron/` directory layout: `main.ts`, `preload.ts`, `electron-builder.yml` |
| `05_FOLDER_STRUCTURE.md` | Section 2 | Package-to-layer mapping: app entry points import from renderer and platform |
| `05_FOLDER_STRUCTURE.md` | Section 4 | Import aliases: app packages may use all three aliases |
| `01_ARCHITECTURE.md` | Section 1 | Electron 30+ target, BrowserWindow renderer |
| `01_ARCHITECTURE.md` | Section 2 | Technology stack: Electron 30+, Vite |
| `01_ARCHITECTURE.md` | Section 3 | Layer dependencies: apps depend on renderer + platform |
| `01_ARCHITECTURE.md` | Appendix B | Interface contracts implemented by platform package, consumed by electron app |
| `PROJECT_CONSTITUTION.md` | Section 11 | Architecture diagram — Electron platform implementation layer |
| `PROJECT_CONSTITUTION.md` | Section 12 | Build and tooling: electron-builder, Vite |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-04 | `node-linker=hoisted` required |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-07 | `@types/react-dom` and `@types/react` have independent versions |
| `07_AGENT_RULES.md` | Rule 11.1 | Strict mode mandatory |
| `07_AGENT_RULES.md` | Rule 11.4 | Verify `@types/*` versions against npm registry |
| `07_AGENT_RULES.md` | Rule 11.5 | Workspace tsconfig.json consistency |
| `07_AGENT_RULES.md` | Rule 13.1 | Platform-specific code isolated behind interfaces |
| `07_AGENT_RULES.md` | Rule 13.4 | Renderer must never import platform-specific code |
| `07_AGENT_RULES.md` | Section 1 | Approved packages — electron@30.5.1 (listed under renderer? platform? Actually not listed — this spec adds it) |
| `08_SPIKE_RETROSPECTIVE.md` | Lesson 3 | Capacitor build system uses relative `node_modules/` paths — not relevant to Electron but part of monorepo |
| `08_SPIKE_RETROSPECTIVE.md` | Lesson 5 | Version pinning prevents peer dep conflicts |
