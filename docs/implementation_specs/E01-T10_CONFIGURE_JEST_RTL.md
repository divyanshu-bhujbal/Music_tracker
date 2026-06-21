# E01 T10 — Configure Jest + React Testing Library: Implementation Specification

## 1. Goal

Install Jest, ts-jest, React Testing Library, and jest-dom as per-package devDependencies. Create Jest configurations for `packages/shared` (Node environment, `ts-jest` preset) and `packages/renderer` (jsdom environment, `@testing-library/jest-dom` matchers, `moduleNameMapper` for `@shared`/`@platform` path aliases). Replace the placeholder `test` scripts in both packages with real `jest --coverage` commands. Add a sample test in each package to verify the test pipeline works end-to-end. Configure coverage thresholds (80% shared, 70% renderer) enforced by CI. This task establishes the test infrastructure that every future epic (E-02 through E-17) will use.

**Architecture decision:** Use `ts-jest` default preset (transpiles TypeScript to CommonJS for Jest execution) rather than the ESM preset. All workspace packages use `"type": "module"`, but ts-jest's CJS output avoids the `--experimental-vm-modules` Node flag requirement and has better ecosystem stability with `moduleNameMapper`, `setupFilesAfterSetup`, and coverage collectors.

## 2. Scope

| In scope | Detail |
|----------|--------|
| `packages/shared/package.json` | Add `jest`, `ts-jest`, `@types/jest` devDeps; replace `test` with `jest --coverage` |
| `packages/shared/jest.config.ts` | Jest config: `ts-jest` preset, Node environment, coverage threshold 80%, collect from `src/**/*.ts` |
| `packages/shared/src/__tests__/index.test.ts` | Sample test: imports `@collectio/shared` barrel, verifies module loads |
| `packages/renderer/package.json` | Add `jest`, `ts-jest`, `@types/jest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jest-environment-jsdom` devDeps; replace `test` with `jest --coverage` |
| `packages/renderer/jest.config.ts` | Jest config: `ts-jest` preset, jsdom environment, `moduleNameMapper` for `@shared`/`@platform` + CSS/assets, `setupFilesAfterSetup` pointing to test setup, coverage threshold 70%, collect from `src/**/*.{ts,tsx}` |
| `packages/renderer/src/test-setup.ts` | Imports `@testing-library/jest-dom` to register DOM matchers (`toBeInTheDocument`, etc.) |
| `packages/renderer/src/__tests__/App.test.tsx` | Sample RTL test: renders `App` component, asserts heading is present |
| `packages/renderer/src/__mocks__/fileMock.ts` | Stub for non-JS imports (CSS, images) — exports empty string |
| `.gitignore` | Add `coverage/` |

## 3. Out of Scope

| Out of scope | Handled by |
|-------------|-----------|
| Jest config for `packages/platform/` | Platform adapters are tested in E-04 via integration tests against real platform services. Platform keeps placeholder `test` script. |
| Jest config for `apps/electron/` | Electron is tested via Playwright E2E (E-16). Electron keeps placeholder `test` script. |
| Jest config for `apps/capacitor/` | Capacitor is tested via Playwright E2E (E-16). Capacitor keeps placeholder `test` script. |
| `jest.config.js` at repository root | Not needed — each package has a self-contained `jest.config.ts`. Root-level base config is unnecessary when only 2 of 5 packages use Jest. |
| Snapshot testing setup | Deferred — not needed at scaffold stage. Can add in E-07/E-08 when UI components exist. |
| MSW (Mock Service Worker) or API mocking | Deferred — no API calls at scaffold stage. Google Drive mocking is E-09 concern. |
| `@testing-library/react-hooks` | Not needed — hooks are tested via RTL component tests (render a component that uses the hook). |
| `jest-watch-typeahead` or watch plugins | Optional developer convenience — not required for task completion. |
| `jest-styled-components` or MUI-specific matchers | E-15 (UI Shell) — deferred until MUI theme and styled components exist. |
| Jest runner in VSCode (Jest extension settings) | Optional convenience — not required for task completion. |
| CI test step modification | T-01.9 CI pipeline already runs `pnpm test`. When shared/renderer `test` scripts change from echo to `jest`, CI picks them up automatically with zero workflow changes. |

## 4. Files to Create

### 4.1 `packages/shared/jest.config.ts`

- **Purpose:** Jest configuration for the shared TypeScript package. Defines the test environment, TypeScript transformer, coverage collection, and coverage thresholds.
- **Responsibility:** Run tests for `packages/shared/src/` using Node environment. Transform TypeScript via `ts-jest`. Collect coverage from all `src/**/*.ts` files. Enforce 80% coverage across all metrics.
- **Public API:** Consumed by `jest` CLI when invoked from `packages/shared/` directory.

**Config structure:**

```
1. preset: "ts-jest" — TypeScript transformation without additional Babel config
2. testEnvironment: "node" — no DOM APIs needed
3. roots: ["<rootDir>/src"]
4. testMatch: ["**/__tests__/**/*.test.ts"]
5. collectCoverageFrom: ["src/**/*.ts"] — exclude declaration files (*.d.ts) implicitly
6. coverageThreshold:
   - global: branches 80%, functions 80%, lines 80%, statements 80%
7. coverageDirectory: "coverage"
8. coverageReporters: ["text", "text-summary", "lcov", "html"]
9. transform: {} — preset handles TypeScript transformation; no additional transforms
10. moduleFileExtensions: ["ts", "js", "json"]
```

**Key decisions:**

| Decision | Rationale |
|----------|-----------|
| **AD-T10-01:** `ts-jest` preset (CJS output, not ESM) | ts-jest transpiles TypeScript to CommonJS for Jest's runtime. Avoids `--experimental-vm-modules` flag requirement. Stable with `moduleNameMapper`, `setupFilesAfterSetup`, and coverage tools. The source uses `import`/`export` syntax but no `import.meta` — ts-jest handles this via the default transform. |
| **AD-T10-02:** `jest@30.4.2` + `ts-jest@29.4.11` | ts-jest 29.4.11 peer deps accept `jest@^29.0.0 || ^30.0.0` and `typescript@>=4.3 <7` (TypeScript 5.9.3 is within range). Jest 30 is the latest stable. |
| **AD-T10-03:** Coverage threshold 80% on shared | Epic specification. Shared package has zero domain code at scaffold — a sample test against the barrel export achieves 100% coverage trivially. Threshold is configured now and enforced by CI on every push. |
| **AD-T10-04:** `collectCoverageFrom: ["src/**/*.ts"]` | Excludes test files and declaration files. Matches the tsconfig `include: ["src"]` scope. |
| **AD-T10-05:** Coverage reporters: text + lcov + html | `text` and `text-summary` for CI log output. `lcov` for CI coverage tools (future coverage integration). `html` for local browsing. |
| **AD-T10-06:** `jest.config.ts` extension (not `.js`) | Consistent with the project's TypeScript-first approach. `ts-node` is not required — ts-jest loads the config file natively when it detects a `.ts` extension in the config path. |

### 4.2 `packages/shared/src/__tests__/index.test.ts`

- **Purpose:** Sample test verifying the shared package's barrel export resolves and the Jest + ts-jest pipeline works.
- **Responsibility:** Import from `@collectio/shared` and assert the module loads without throwing. Provides the minimum viable test to validate the entire test toolchain (jest, ts-jest, module resolution, coverage collection).
- **Public API:** None — test file, not exported from package barrel.

**Key decisions:**

| Decision | Rationale |
|----------|-----------|
| Import from `@collectio/shared` (workspace name) not relative path | Validates pnpm workspace resolution works in Jest. Relative imports would bypass the module resolution test. |
| `.test.ts` extension | Standard Jest convention. Matches `testMatch` pattern. Matches `05_FOLDER_STRUCTURE.md` naming convention: "Same name as source + `.test.ts`". |
| `__tests__/` directory inside `src/` | Co-located with source. Standard React ecosystem pattern. Keeps tests inside the package directory, simplifying per-package Jest configs. |
| Minimal assertion (module loads) | At scaffold stage, the barrel is `export {}`. The test verifies the import resolves without error — no properties to assert. If T-01.10 adds a version constant export, the test can assert its value. |

**Alternative test approach (if barrel remains empty):**
Export a constant in `index.ts` before writing the test (e.g., `export const SHARED_VERSION = '0.0.0'`), then assert `SHARED_VERSION` equals `'0.0.0'`. This gives the test a concrete assertion and ensures the export path works.

### 4.3 `packages/renderer/jest.config.ts`

- **Purpose:** Jest configuration for the React renderer package. Defines jsdom environment, TypeScript transformer, path alias resolution, CSS/asset mocking, test setup file, and coverage thresholds.
- **Responsibility:** Run React component tests for `packages/renderer/src/` using jsdom environment. Transform TypeScript + JSX via `ts-jest`. Resolve `@shared` and `@platform` imports via `moduleNameMapper`. Register RTL DOM matchers via `setupFilesAfterSetup`. Enforce 70% coverage.
- **Public API:** Consumed by `jest` CLI when invoked from `packages/renderer/` directory.

**Config structure:**

```
1. preset: "ts-jest" — TypeScript + JSX transformation
2. testEnvironment: "jest-environment-jsdom" — DOM APIs for React component testing
3. roots: ["<rootDir>/src"]
4. testMatch: ["**/__tests__/**/*.test.{ts,tsx}"]
5. setupFilesAfterSetup: ["./src/test-setup.ts"] — registers RTL matchers before tests
6. moduleNameMapper:
   - "^@shared$": "<rootDir>/../shared/src" — tsconfig paths mirror
   - "^@shared/(.*)$": "<rootDir>/../shared/src/$1"
   - "^@platform$": "<rootDir>/../platform/src"
   - "^@platform/(.*)$": "<rootDir>/../platform/src/$1"
   - "\\.(css|less|scss|svg|png|jpg|gif)$": "<rootDir>/src/__mocks__/fileMock.ts" — stub non-JS imports
7. transform:
   - "^.+\\.tsx?$": "ts-jest" — explicit transform for .ts/.tsx
8. collectCoverageFrom: ["src/**/*.{ts,tsx}"]
   - exclude: ["src/**/*.d.ts", "src/main.tsx"] — declarations and dev entry not tested
9. coverageThreshold:
   - global: branches 70%, functions 70%, lines 70%, statements 70%
10. coverageDirectory: "coverage"
11. coverageReporters: ["text", "text-summary", "lcov", "html"]
12. moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"]
```

**Key decisions:**

| Decision | Rationale |
|----------|-----------|
| **AD-T10-07:** `moduleNameMapper` mirrors tsconfig `paths` exactly | tsconfig `paths` defines `@shared` → `../shared/src` and `@platform` → `../platform/src`. Jest cannot read tsconfig paths — `moduleNameMapper` is the Jest equivalent. Every tsconfig path must have a corresponding `moduleNameMapper` entry. Mismatch means imports pass type-check but fail test execution. |
| **AD-T10-08:** CSS/asset mock via `__mocks__/fileMock.ts` | React components may import CSS or images. Jest cannot parse these. The mock returns an empty string, satisfying the import without adding test noise. |
| **AD-T10-09:** Coverage threshold 70% on renderer | Epic specification. Lower than shared (80%) because React components have more rendering branches that are harder to cover exhaustively. |
| **AD-T10-10:** Explicit `transform` for `.tsx?$` | `ts-jest` preset provides a default transform, but explicit configuration ensures `.tsx` files are handled correctly. Avoids ambiguity with JSX in TypeScript files. |
| **AD-T10-11:** `jest-environment-jsdom@30.4.2` must match `jest@30.4.2` | Jest 30 decoupled jsdom to a separate package. Version must match jest major to avoid API incompatibilities. |
| **AD-T10-12:** Exclude `src/main.tsx` from coverage | `main.tsx` is the standalone dev entry point (`ReactDOM.createRoot`). It is not a component — it's a bootstrap script. Excluding it prevents it from artificially lowering coverage at scaffold stage. |

### 4.4 `packages/renderer/src/test-setup.ts`

- **Purpose:** Jest setup file executed before every test suite in the renderer package. Registers `@testing-library/jest-dom` DOM matchers globally.
- **Responsibility:** Import and execute `@testing-library/jest-dom` so matchers like `toBeInTheDocument()`, `toHaveTextContent()`, `toBeVisible()` are available in all test files without explicit imports.
- **Public API:** Consumed by Jest via `setupFilesAfterSetup` in `jest.config.ts`.

**Key decisions:**

| Decision | Rationale |
|----------|-----------|
| Single import: `@testing-library/jest-dom` | All DOM matchers come from one package. No need for additional setup at scaffold stage. |
| File named `test-setup.ts` | Matches epic spec: `packages/renderer/src/test-setup.ts`. Uses `.ts` (not `.tsx`) — no JSX in setup file. |
| Import as side-effect (`import '@testing-library/jest-dom'`) | The package mutates `expect` globally. Side-effect import is the standard pattern from RTL documentation. |

### 4.5 `packages/renderer/src/__mocks__/fileMock.ts`

- **Purpose:** Stub module for non-JavaScript file imports (CSS, images, fonts) that Jest cannot parse.
- **Responsibility:** Export a default empty string. When Jest encounters `import './styles.css'` or `import logo from './logo.svg'`, it resolves to this mock instead of trying to parse the actual file.
- **Public API:** Consumed by Jest via `moduleNameMapper` in `jest.config.ts`.

**Key decisions:**

| Decision | Rationale |
|----------|-----------|
| Export default empty string | CSS imports in React components are usually side-effect imports (no value used). Default export covers both default and named import patterns. |
| `__mocks__/` directory | Standard Jest convention. Automatically resolved for manual mocks. Also serves as a location for future manual mocks of packages (e.g., `@mui/material`). |

### 4.6 `packages/renderer/src/__tests__/App.test.tsx`

- **Purpose:** Sample React Testing Library test verifying the renderer's test pipeline works end-to-end. Renders the `App` component from T-01.8 and asserts the heading is present.
- **Responsibility:** Use RTL's `render` and `screen` to render `<App />`, query for the "Collectio" heading, and assert it is in the document. Validates: jsdom environment, ts-jest JSX transform, path alias resolution (if App imports from `@shared`), and RTL matchers from test-setup.
- **Public API:** None — test file.

**Key decisions:**

| Decision | Rationale |
|----------|-----------|
| `.test.tsx` extension | Test file contains JSX (`<App />`) — `.tsx` is required per Rule 11.6. |
| Import `App` from relative path (`../App`) | The App component is in the same package. Self-referencing via `@collectio/renderer` creates circular workspace dependency warnings. |
| Single test: "renders heading" | Minimal, verifiable, fast. No complex assertions — just validates the pipeline works. |
| Use `screen.getByText('Collectio')` | RTL's recommended query. `getByText` finds the `<h1>Collectio</h1>` element. Throws if not found — test fails. |

**Note:** If T-01.8 (Vite for Renderer) has not been completed and `App.tsx` does not exist yet, the test file must be created but the test will fail until `App.tsx` is created. T-01.10 and T-01.8 are both in-progress — sequencing within the implementation phase should ensure T-01.8 is done first.

## 5. Files to Modify

### 5.1 `packages/shared/package.json`

- **Purpose:** Add test tooling dependencies and replace the placeholder `test` script.
- **Responsibility:** Declare exact-pinned Jest and ts-jest devDependencies. Provide a real `test` script that runs Jest with coverage.

**Changes:**

| Field | Before | After |
|-------|--------|-------|
| `scripts.test` | `"echo 'tests not configured yet'"` | `"jest --coverage"` |

**Add to `devDependencies`:**

| Package | Version | Role |
|---------|---------|------|
| `jest` | `30.4.2` | Test runner and assertion library |
| `ts-jest` | `29.4.11` | TypeScript transformer for Jest |
| `@types/jest` | `30.0.0` | Jest type definitions (globals: `describe`, `it`, `expect`) |

### 5.2 `packages/renderer/package.json`

- **Purpose:** Add React Testing Library tooling dependencies and replace the placeholder `test` script.
- **Responsibility:** Declare exact-pinned test devDependencies. Provide a real `test` script.

**Changes:**

| Field | Before | After |
|-------|--------|-------|
| `scripts.test` | `"echo 'tests not configured yet'"` | `"jest --coverage"` |

**Add to `devDependencies`:**

| Package | Version | Role |
|---------|---------|------|
| `jest` | `30.4.2` | Test runner and assertion library |
| `ts-jest` | `29.4.11` | TypeScript + JSX transformer for Jest |
| `@types/jest` | `30.0.0` | Jest type definitions |
| `@testing-library/react` | `16.3.2` | React component renderer and query utilities |
| `@testing-library/jest-dom` | `6.9.1` | DOM assertion matchers (`toBeInTheDocument`, etc.) |
| `@testing-library/user-event` | `14.6.1` | Simulated user interactions (click, type, keyboard) |
| `jest-environment-jsdom` | `30.4.2` | jsdom DOM environment for renderer tests |

**Version compatibility verified:**

| Package | Peer Dependencies | Compatible with React 18.3.1? | Compatible with Jest 30.4.2? |
|---------|-------------------|------|------|
| `jest@30.4.2` | None | N/A | Yes (self) |
| `ts-jest@29.4.11` | `jest: ^29.0.0 || ^30.0.0`, `typescript: >=4.3 <7` | N/A | Yes |
| `@types/jest@30.0.0` | None | N/A | Yes (matches major) |
| `@testing-library/react@16.3.2` | `react: ^18.0.0 || ^19.0.0`, `react-dom: ^18.0.0 || ^19.0.0` | Yes | N/A |
| `@testing-library/jest-dom@6.9.1` | `@jest/globals: >= 28`, `@types/jest: >= 28`, `jest: >= 28`, `vitest: >= 0.32` | N/A | Yes |
| `@testing-library/user-event@14.6.1` | `@testing-library/dom: >=7.21.4` | N/A | N/A |
| `jest-environment-jsdom@30.4.2` | None (matches jest version) | N/A | Yes (same version) |

### 5.3 `.gitignore`

- **Purpose:** Exclude generated coverage reports from version control.
- **Responsibility:** Add `coverage/` entry so Jest's `coverage/` output directories in each package are not committed.

**Change:**

Add after existing entries (before `# Docs`):
```
# Test coverage
coverage/
```

## 6. Interfaces

No runtime interfaces. The test infrastructure contract is:

| Contract element | Specification |
|-----------------|---------------|
| `test` script in shared/renderer | Must run `jest --coverage` and exit non-zero on failure |
| Jest config for shared | `ts-jest` preset, Node environment, coverage threshold 80% |
| Jest config for renderer | `ts-jest` preset, jsdom environment, coverage threshold 70%, `moduleNameMapper` for `@shared`/`@platform` |
| `moduleNameMapper` patterns | Must exactly mirror `tsconfig.json` `paths`. Changing a tsconfig path WITHOUT updating Jest's `moduleNameMapper` is a contract violation. |
| Coverage report format | `text` + `text-summary` (CI log), `lcov` (CI tooling), `html` (local) |
| Test file location | `src/__tests__/*.test.{ts,tsx}` — co-located with source |
| Placeholder scripts | `platform`, `electron`, `capacitor` keep `"test": "echo 'tests not configured yet'"` — `pnpm -r test` must still exit 0 |

## 7. Data Flow

```
Developer invokes: pnpm test
  → Root package.json: pnpm -r test
    → packages/shared:
      → jest --coverage
        → Reads jest.config.ts from packages/shared/
        → ts-jest transforms src/__tests__/index.test.ts (TS → CJS)
        → Runs test in Node environment
        → Collects coverage from src/**/*.ts
        → Enforces 80% threshold
        → Outputs coverage/ (text-summary to console, lcov + html to disk)
        → Exit 0 on pass; non-zero on failure or threshold not met

    → packages/renderer:
      → jest --coverage
        → Reads jest.config.ts from packages/renderer/
        → Runs test-setup.ts (imports @testing-library/jest-dom)
        → moduleNameMapper resolves @shared → ../shared/src, @platform → ../platform/src
        → ts-jest transforms src/__tests__/App.test.tsx (TSX → CJS)
        → Runs test in jsdom environment
        → Collects coverage from src/**/*.{ts,tsx} (excluding main.tsx, *.d.ts)
        → Enforces 70% threshold
        → Outputs coverage/ (same format)
        → Exit 0 on pass; non-zero on failure

    → packages/platform:
      → echo 'tests not configured yet'  → exit 0

    → apps/electron:
      → echo 'tests not configured yet'  → exit 0

    → apps/capacitor:
      → echo 'tests not configured yet'  → exit 0

CI (post T-01.9):
  GitHub Actions → pnpm test
    → Same flow as above
    → Any non-zero exit → CI fails (red)
    → All exit 0 → CI passes (green)
    → Coverage text-summary visible in CI log
```

## 8. State Changes

| Before | After |
|--------|-------|
| Zero test packages installed | 7 test packages installed across shared + renderer |
| `packages/shared/package.json` has 1 devDep | Has 4 devDeps (add jest, ts-jest, @types/jest) |
| `packages/renderer/package.json` has 6 devDeps | Has 13 devDeps (add 7 test packages) |
| All 5 `test` scripts are `echo` placeholders | shared + renderer run `jest --coverage`; platform/electron/capacitor remain `echo` |
| No `jest.config.*` files | 2 config files: `packages/shared/jest.config.ts`, `packages/renderer/jest.config.ts` |
| No test files anywhere | 2 test files: `index.test.ts`, `App.test.tsx` |
| No test setup file | `test-setup.ts` in renderer |
| No `__mocks__/` directory | `__mocks__/fileMock.ts` in renderer |
| `pnpm test` always exits 0 (echo) | `pnpm test` runs real Jest suites; fails on coverage or assertion failure |
| `coverage/` not gitignored | `coverage/` in `.gitignore` |

## 9. Database Changes

None. Pure test infrastructure configuration task.

## 10. Error Handling

| Failure scenario | Behavior |
|-----------------|----------|
| `pnpm install` fails — package version not found | Verify each version against npm registry. Use `npm view <pkg> version` to confirm. |
| `pnpm install` fails — peer dependency conflict | Verify compatibility matrix above. All packages are mutually compatible. |
| `pnpm test` fails — Jest can't find config | `jest.config.ts` is auto-detected by Jest when in the package root. Verify file name is correct. |
| `pnpm test` fails — ts-jest can't transform file | ts-jest uses the package's `tsconfig.json`. Verify `tsconfig.json` is valid and `"include": ["src"]` covers test files. |
| `pnpm test` fails — `Cannot find module '@shared'` | `moduleNameMapper` regex patterns are wrong or don't match tsconfig `paths`. Must use `^@shared$` and `^@shared/(.*)$` patterns. |
| `pnpm test` fails — `Cannot find module '@platform'` | Same as above for `@platform`. |
| `pnpm test` fails — jsdom not found | `jest-environment-jsdom` must be in `devDependencies`. Jest 30+ requires explicit jsdom package. |
| `pnpm test` fails — `TextEncoder is not defined` in jsdom | jsdom may need polyfills for certain Web APIs. The sample test uses `getByText` which doesn't need `TextEncoder`. If MUI components need it, add to `test-setup.ts`. |
| `pnpm test` fails — coverage below threshold | At scaffold with minimal code, a single test achieves 100% coverage. If threshold is too aggressive for a given package, raise the issue but don't lower the threshold without epic-level discussion. |
| Sample test fails — `App` not found | T-01.8 must be completed first. `App.tsx` must exist in `packages/renderer/src/`. |
| `jest --coverage` produces no output | `collectCoverageFrom` path patterns may not match `src/` structure. Verify `roots` and `collectCoverageFrom` are correct. |
| `jest.config.ts` parse error (TypeScript syntax) | Jest loads `.ts` config files via `ts-node` (built into `ts-jest`). If ts-node fails, use `jest.config.js` as fallback. |

## 11. Logging Requirements

Jest provides comprehensive built-in output:
- **Pass:** Green checkmarks per test suite, test count, suite count, execution time
- **Fail:** Red error with expected vs received, source file path, line number, and diff
- **Coverage:** `text-summary` table showing per-file and global coverage percentages. CI log captures this.
- **Coverage files:** `coverage/lcov-report/index.html` for local browsing; `coverage/lcov.info` for CI tools

No additional logging configuration is needed.

## 12. Security Requirements

| Requirement | How satisfied |
|-------------|---------------|
| No secrets in test config | Jest configs contain only transform, environment, and mapping settings — no tokens or credentials |
| No secrets in test files | Sample tests assert DOM presence and module loading — no API keys, passwords, or user data |
| `coverage/` not committed | Added to `.gitignore` |
| Test dependencies are exact-pinned | All 7 test packages pinned to exact versions — no `^` or `~` |
| No test-only secrets or environment variables | Tests run against local source code only — no external services |
| `__mocks__/` contains no production code | Only stub modules (`fileMock.ts`) — no secrets or real implementations |

## 13. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-1 | `pnpm install` succeeds with all test devDeps | Run `pnpm install` — exit 0, no peer dep warnings |
| AC-2 | `pnpm --filter @collectio/shared test` runs Jest and exits 0 | Run command — Jest runs sample test, passes, coverage reported |
| AC-3 | `pnpm --filter @collectio/renderer test` runs Jest and exits 0 | Run command — Jest runs App test with RTL, passes, coverage reported |
| AC-4 | `pnpm test` from root runs shared + renderer + 3 placeholders, exits 0 | Run `pnpm test` — all 5 packages exit 0 |
| AC-5 | Coverage reports generated for shared | `packages/shared/coverage/` exists with `index.html`, `lcov.info`, `coverage-final.json` |
| AC-6 | Coverage reports generated for renderer | `packages/renderer/coverage/` exists with same structure |
| AC-7 | Sample test in shared passes | Jest output shows "index.test.ts" with 1+ passing test |
| AC-8 | Sample test in renderer passes | Jest output shows "App.test.tsx" with 1+ passing test |
| AC-9 | `@shared` path alias resolves in renderer tests | If `App.tsx` imports from `@shared`, the test resolves without "Cannot find module" |
| AC-10 | `@platform` path alias resolves in renderer tests | If any renderer file imports from `@platform`, the test resolves correctly |
| AC-11 | jsdom environment works in renderer tests | Test renders React component without "document is not defined" error |
| AC-12 | RTL matchers work in renderer tests | `expect(heading).toBeInTheDocument()` assertion passes |
| AC-13 | Coverage threshold enforced — below 80% in shared fails | Temporarily remove coverage from a file, run test — non-zero exit |
| AC-14 | Coverage threshold enforced — below 70% in renderer fails | Same test — non-zero exit |
| AC-15 | `coverage/` is gitignored | `git status` does not show `coverage/` directories |
| AC-16 | `pnpm typecheck` still passes (no regression) | Run from root — all 5 packages pass |
| AC-17 | `pnpm lint` still passes (no regression) | Run from root — test files pass ESLint rules |
| AC-18 | All test package versions are exact pins | Inspect `devDependencies` — no `^` or `~` |
| AC-19 | `@testing-library/react@16.3.2` works with `react@18.3.1` | Peer dep range includes `^18.0.0` — no install warning |

## 14. Test Cases

| # | Test | Steps | Expected |
|---|------|-------|----------|
| TC-1 | Install shared test deps | 1. Add `jest`, `ts-jest`, `@types/jest` to shared `devDependencies`<br>2. Create `jest.config.ts`<br>3. Run `pnpm install` | Exit 0; no peer warnings |
| TC-2 | Install renderer test deps | 1. Add 7 test packages to renderer `devDependencies`<br>2. Create `jest.config.ts`, `test-setup.ts`, `fileMock.ts`<br>3. Run `pnpm install` | Exit 0; no peer warnings |
| TC-3 | Shared sample test passes | `cd packages/shared && pnpm test` | Jest runs; 1 test passes; coverage 100% (barrel only) |
| TC-4 | Renderer sample test passes | `cd packages/renderer && pnpm test` | Jest runs; 1 test passes; "Collectio" heading found |
| TC-5 | Root test runs all packages | `pnpm test` from root | 5 packages: shared + renderer run Jest; platform/electron/capacitor echo; all exit 0 |
| TC-6 | Coverage text summary in shared output | `cd packages/shared && pnpm test` | Console shows "Coverage summary" with file list and percentages |
| TC-7 | Coverage HTML generated for shared | After TC-6, open `packages/shared/coverage/index.html` | Browser shows coverage report |
| TC-8 | Coverage HTML generated for renderer | After TC-4, open `packages/renderer/coverage/index.html` | Browser shows coverage report |
| TC-9 | Test failure causes non-zero exit | 1. In `index.test.ts`, add `expect(false).toBe(true)`<br>2. Run `pnpm test` | Jest fails; non-zero exit |
| TC-10 | Coverage below threshold fails (shared) | 1. Set threshold to 100% in shared jest.config<br>2. Run test | Jest fails with "Jest: coverage threshold not met" |
| TC-11 | jsdom environment works | Verify `App.test.tsx` renders component without errors | No "document is not defined" or "window is not defined" |
| TC-12 | `@shared` path alias resolves | 1. Add `import { } from '@shared'` to `App.tsx`<br>2. Run renderer test | No "Cannot find module @shared" error |
| TC-13 | CSS import mock works | 1. Add `import './styles.css'` to `App.tsx`<br>2. Run renderer test | No "Unexpected token" error; test passes |
| TC-14 | `coverage/` is gitignored | After running tests: `git status` | Does not list `coverage/` directories |
| TC-15 | Typecheck passes after test files added | `pnpm typecheck` from root | All 5 packages pass |
| TC-16 | Lint passes on test files | `pnpm lint` from root | Test files pass ESLint rules |
| TC-17 | Jest configs are valid TypeScript | `npx tsc --noEmit packages/shared/jest.config.ts` and `packages/renderer/jest.config.ts` | No type errors |
| TC-18 | Verify all versions via npm | `npm view jest version`, `npm view ts-jest version`, etc. | Outputs match pinned versions |
| TC-19 | `pnpm -r test` works (electron has test script) | Verify `apps/electron/package.json` has `"test"` script (from T-01.9) | If not, `pnpm -r test` will fail — T-01.9 must add it |
| TC-20 | Clean up test modifications after TC-9, TC-10 | Revert threshold change and failing assertion | All tests pass; threshold restored to 80%/70% |

## 15. Definition of Done

1. `packages/shared/package.json` has `jest@30.4.2`, `ts-jest@29.4.11`, `@types/jest@30.0.0` in `devDependencies` (exact pins)
2. `packages/shared/package.json` `test` script is `"jest --coverage"` (not echo)
3. `packages/shared/jest.config.ts` exists with `ts-jest` preset, Node environment, coverage threshold 80%
4. `packages/shared/src/__tests__/index.test.ts` exists with a passing test
5. `packages/renderer/package.json` has all 7 test packages in `devDependencies` (exact pins)
6. `packages/renderer/package.json` `test` script is `"jest --coverage"` (not echo)
7. `packages/renderer/jest.config.ts` exists with `ts-jest` preset, jsdom environment, `moduleNameMapper` for `@shared`/`@platform` + assets, `setupFilesAfterSetup`, coverage threshold 70%
8. `packages/renderer/src/test-setup.ts` exists importing `@testing-library/jest-dom`
9. `packages/renderer/src/__mocks__/fileMock.ts` exists with empty string export
10. `packages/renderer/src/__tests__/App.test.tsx` exists with a passing RTL test
11. `coverage/` is in `.gitignore`
12. `pnpm install` succeeds with zero warnings
13. `pnpm test` runs across all 5 packages and exits 0
14. Coverage reports generated in `packages/shared/coverage/` and `packages/renderer/coverage/`
15. Sample tests pass: shared barrel import, renderer "Collectio" heading
16. `pnpm typecheck` passes (no regression)
17. `pnpm lint` passes (no regression)
18. All version strings are exact pins (no `^` or `~`)

## 16. Implementation Order

1. Verify all 7 test package versions exist on npm (`npm view <pkg> version` for each)
2. Verify version compatibility: `npm view @testing-library/react@16.3.2 peerDependencies` confirms react@^18 supported
3. Add `coverage/` to `.gitignore`
4. Create `packages/shared/jest.config.ts`
5. Create `packages/shared/src/__tests__/index.test.ts`
6. Update `packages/shared/package.json`: add devDeps, update test script
7. Create `packages/renderer/jest.config.ts`
8. Create `packages/renderer/src/test-setup.ts`
9. Create `packages/renderer/src/__mocks__/fileMock.ts`
10. Create `packages/renderer/src/__tests__/App.test.tsx`
11. Update `packages/renderer/package.json`: add devDeps, update test script
12. Run `pnpm install` — verify exit 0, no warnings
13. Run `pnpm --filter @collectio/shared test` — verify sample test passes, coverage reported
14. Run `pnpm --filter @collectio/renderer test` — verify sample test passes, coverage reported
15. Run `pnpm test` from root — verify all 5 packages exit 0
16. Run `pnpm typecheck` from root — verify no regression
17. Run `pnpm lint` from root — verify no regression
18. Run TC-9 (intentional test failure) — verify Jest exits non-zero, then revert
19. Run TC-10 (coverage threshold failure) — verify Jest reports "threshold not met", then revert
20. Verify `coverage/` directories are gitignored: `git status`

## 17. Traceability

| Source Document | Section | Requirement |
|----------------|---------|-------------|
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.10 | `jest.config.js` (root base), `packages/shared/jest.config.ts`, `packages/renderer/jest.config.ts`, `test-setup.ts` |
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.10 Requirements | ts-jest preset for shared, jsdom + RTL for renderer, path aliases, coverage thresholds 80%/70% |
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.10 AC-1 | `pnpm test` runs all tests across all packages |
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.10 AC-2 | Sample test in shared and renderer passes |
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.10 AC-3 | Coverage reports generated |
| `PROJECT_CONSTITUTION.md` | Section 12 | "Testing: Jest + React Testing Library (web)" |
| `01_ARCHITECTURE.md` | Section 2 | "Testing: Jest + React Testing Library (web)" in build and tooling table |
| `05_FOLDER_STRUCTURE.md` | Section 1 | `__tests__/` directory with `shared/`, `renderer/`, `platform/` |
| `05_FOLDER_STRUCTURE.md` | Section 5 | Test file naming: "Same name as source + `.test.ts`" |
| `07_AGENT_RULES.md` | Rule 11.1 | Strict mode mandatory — ts-jest uses package tsconfig with `strict: true` |
| `07_AGENT_RULES.md` | Rule 11.4 | Verify versions against npm registry before pinning |
| `07_AGENT_RULES.md` | Rule 11.6 | `.tsx` extension for files containing JSX — `App.test.tsx` |
| `07_AGENT_RULES.md` | Rule 13.2 | Domain layer pure TypeScript — shared tests use Node environment, no React/DOM |
| `07_AGENT_RULES.md` | Rule 13.4 | Renderer never imports platform-specific code — `@platform` maps to interface layer |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-01 | `DatabaseConnection` interface is async — future tests use async/await |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-12 | `.tsx` extension required for files containing JSX |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-04 | `node-linker=hoisted` — test deps resolve from root `node_modules/` |
| `06_IMPLEMENTATION_DECISIONS.md` | Section 9 | Version compatibility matrix: jest, ts-jest, typescript |
| `08_SPIKE_RETROSPECTIVE.md` | Lesson 5 | Pin all versions to exact numbers |
