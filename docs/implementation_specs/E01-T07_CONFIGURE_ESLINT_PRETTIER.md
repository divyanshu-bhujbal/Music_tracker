# E01 T07 — Configure Shared ESLint and Prettier: Implementation Specification

## 1. Goal

Install ESLint 9.x, Prettier 3.x, and their TypeScript/React integration plugins as shared development tooling at the monorepo root. Create root-level configuration files consumed by all 5 workspace packages. Replace each package's placeholder `lint` script with a real `eslint` command. Establish an enforceable code style baseline before any application code is written.

**Architecture decision:** Use ESLint 9.x flat config (`eslint.config.mjs`) instead of the legacy `.eslintrc.js` format referenced in the epic spec. ESLint 9.x deprecated `.eslintrc` — the flat config format is the current standard and all required plugins (typescript-eslint, eslint-plugin-react, eslint-config-prettier) fully support it. ESLint 9.39.4 is the latest stable.

## 2. Scope

| In scope | Detail |
|----------|--------|
| Root `package.json` | Add `devDependencies`: `eslint`, `typescript-eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-config-prettier`, `prettier` |
| `eslint.config.mjs` (root) | ESLint 9 flat config — TypeScript parser, strict rules, React/React-Hooks plugins, Prettier integration |
| `.prettierrc` (root) | Prettier config — single quotes, trailing commas, 100 print width, 2-space indent |
| `.prettierignore` (root) | Exclude build artifacts, generated code, lockfile |
| `.eslintignore` (root) | Exclude same + formal exclusion matching ESLint config ignores |
| Per-package `lint` scripts | Replace no-op with `eslint` command scoped to each package's source directory |
| `.gitignore` | Add `.eslintcache` if not already covered |

## 3. Out of Scope

| Out of scope | Handled by |
|-------------|-----------|
| Husky pre-commit hooks (lint-staged) | Deferred — not in E-01 tasks |
| VSCode workspace settings for format-on-save | Optional convenience — not required for task completion |
| ESLint plugin rules that depend on application code structure | Future tasks update rules as code patterns emerge |
| CI lint integration | T-01.9 (CI Pipeline) — already has `pnpm lint` step |
| Auto-fixing existing code with `--fix` | Out of scope at scaffolding — code is minimal and already clean |
| `eslint-plugin-prettier` (run Prettier as ESLint rule) | Not used — `eslint-config-prettier` (turns off conflicting rules) is the recommended approach |
| `eslint-plugin-import` or import ordering rules | Deferred — can be added later without breaking existing config |
| `.editorconfig` | Not in epic spec |

## 4. Files to Create

### 4.1 `eslint.config.mjs` (root)

- **Purpose:** Shared ESLint 9 flat configuration for all workspace packages.
- **Responsibility:** Define parser, plugins, rules, and file ignores. Must enforce TypeScript strict mode patterns (no `any`, no unused vars, no console), React best practices (JSX, hooks rules), and disable rules conflicting with Prettier.
- **Public API:** Consumed by `eslint` CLI when run from any workspace package directory. ESLint 9 resolves the config by walking up the directory tree from the linted file.

**Config structure (flat config format):**

```
1. Global ignores block
   - node_modules/, dist/, dist-electron/, release/, build/
   - android/, .gradle/
   - *.tsbuildinfo
   - pnpm-lock.yaml

2. TypeScript base config (all .ts and .tsx files)
   - Parser: @typescript-eslint/parser
   - Plugin: @typescript-eslint
   - Rules:
     - no-explicit-any: error
     - no-unused-vars: off (use TS version)
     - @typescript-eslint/no-unused-vars: error
     - no-console: warn
     - prefer-const: error
     - no-var: error

3. React override (only .tsx files)
   - Plugin: react
   - Plugin: react-hooks
   - Settings: react.version = "detect"
   - Rules:
     - react/jsx-uses-react: off (React 17+ JSX transform)
     - react/react-in-jsx-scope: off (React 17+ JSX transform)
     - react-hooks/rules-of-hooks: error
     - react-hooks/exhaustive-deps: warn

4. Prettier integration (last, overrides all)
   - Uses eslint-config-prettier
   - Disables all ESLint formatting rules that conflict with Prettier
```

**Key decisions:**

| Decision | Rationale |
|----------|-----------|
| `typescript-eslint` wrapper package | Provides `tseslint.config()` helper that gives typed flat config support. This is the recommended approach for TS + ESLint 9. |
| `@typescript-eslint/no-unused-vars` over core `no-unused-vars` | TypeScript-aware unused variable detection. Core rule must be disabled. |
| `react/jsx-uses-react` and `react/react-in-jsx-scope` both `off` | React 17+ automatic JSX transform eliminates need for `import React`. Already used in the codebase (`"jsx": "react-jsx"` in tsconfig). |
| `eslint-config-prettier` last | Must be the final config object to override any preceding formatting rules. |
| `react-hooks/exhaustive-deps: warn` | Missing deps is a common bug but auto-fixing is unsafe. Warn to surface, not error (blocks CI). |
| Flat config `.mjs` extension | Ensures Node.js treats the file as ES module. Required for `import` syntax. |

### 4.2 `.prettierrc` (root)

- **Purpose:** Shared Prettier formatting configuration.
- **Responsibility:** Enforce consistent code formatting across TypeScript, JSON, YAML, Markdown, and HTML files.
- **Public API:** Consumed by `prettier` CLI and editor integrations.

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true,
  "arrowParens": "always",
  "endOfLine": "lf",
  "bracketSpacing": true
}
```

| Option | Value | Rationale |
|--------|-------|-----------|
| `singleQuote` | `true` | Standard TypeScript convention |
| `trailingComma` | `"all"` | Cleaner diffs when adding lines |
| `printWidth` | `100` | Epic spec requirement |
| `tabWidth` | `2` | Epic spec requirement |
| `semi` | `true` | Explicit statement terminators |
| `arrowParens` | `"always"` | Consistent arrow function parens |
| `endOfLine` | `"lf"` | Unix line endings (Git handles CRLF on Windows) |
| `bracketSpacing` | `true` | `{ key: value }` not `{key: value}` |

### 4.3 `.prettierignore` (root)

- **Purpose:** Exclude files that should not be formatted.
- **Responsibility:** Prevent Prettier from modifying generated code, build artifacts, and lockfiles.

```
node_modules/
dist/
dist-electron/
release/
build/
android/
.gradle/
pnpm-lock.yaml
*.tsbuildinfo
```

### 4.4 `.eslintignore` (root)

- **Purpose:** Additional exclusion for ESLint beyond what the flat config `ignores` covers.
- **Responsibility:** Safety net for editor integrations that may read `.eslintignore` directly rather than parsing the flat config.

```
node_modules/
dist/
dist-electron/
release/
build/
android/
.gradle/
*.tsbuildinfo
```

## 5. Files to Modify

### 5.1 Root `package.json`

- **Purpose:** Declare shared ESLint and Prettier devDependencies at the monorepo root.
- **Responsibility:** Install a single copy of all lint/format tooling accessible to all 5 workspace packages via the hoisted `node_modules/`.
- **Public API:** `devDependencies` consumed by `pnpm install`. `scripts.lint` already delegates via `pnpm -r lint` — no change needed.

**Add to existing `devDependencies` (field does not currently exist):**

| Package | Version | Role |
|---------|---------|------|
| `eslint` | `9.39.4` | JavaScript/TypeScript linter |
| `typescript-eslint` | `8.61.1` | Flat config helper for TypeScript ESLint |
| `@typescript-eslint/parser` | `8.61.1` | TypeScript parser for ESLint |
| `@typescript-eslint/eslint-plugin` | `8.61.1` | TypeScript-specific ESLint rules |
| `eslint-plugin-react` | `7.37.5` | React-specific lint rules |
| `eslint-plugin-react-hooks` | `7.1.1` | React Hooks rules |
| `eslint-config-prettier` | `10.1.8` | Disables ESLint rules that conflict with Prettier |
| `prettier` | `3.8.4` | Opinionated code formatter |

**Version compatibility verified (all mutually compatible):**

| Package | Peer Dependencies | TS 5.9.3 | ESLint 9.x | React 18.3.1 |
|---------|-------------------|-----------|------------|--------------|
| `eslint@9.39.4` | `jiti: *` | n/a | n/a | n/a |
| `@typescript-eslint/parser@8.61.1` | `eslint ^8.57.0 \|\| ^9.0.0 \|\| ^10.0.0`, `typescript >=4.8.4 <6.1.0` | Yes | Yes | n/a |
| `@typescript-eslint/eslint-plugin@8.61.1` | same + `@typescript-eslint/parser ^8.61.1` | Yes | Yes | n/a |
| `eslint-plugin-react@7.37.5` | `eslint ^3..^8 \|\| ^9.7` | n/a | Yes (9.39 > 9.7) | n/a |
| `eslint-plugin-react-hooks@7.1.1` | `eslint ^3..^10` | n/a | Yes | n/a |
| `eslint-config-prettier@10.1.8` | `eslint >=7.0.0` | n/a | Yes | n/a |
| `prettier@3.8.4` | none | n/a | n/a | n/a |
| `typescript-eslint@8.61.1` | none (wrapper) | n/a | n/a | n/a |

### 5.2 Per-Package `lint` Scripts

Replace each package's `"lint": "echo 'lint not configured yet'"` with a real `eslint` command. The `eslint` binary resolves from root `node_modules/.bin/` via the hoisted layout.

| Package | Script |
|---------|--------|
| `packages/shared/package.json` | `"lint": "eslint 'src/**/*.ts'"` |
| `packages/renderer/package.json` | `"lint": "eslint 'src/**/*.{ts,tsx}'"` |
| `packages/platform/package.json` | `"lint": "eslint 'src/**/*.ts'"` |
| `apps/electron/package.json` | `"lint": "eslint 'src/**/*.ts'"` |
| `apps/capacitor/package.json` | `"lint": "eslint 'src/**/*.{ts,tsx}'"` |

**Glob rationale:**

| Package | Extensions | Reason |
|---------|-----------|--------|
| `shared` | `.ts` only | Pure TypeScript — zero React, zero JSX per Rule 13.2 |
| `renderer` | `.ts` + `.tsx` | React components per architecture Section 2 |
| `platform` | `.ts` only | Platform adapters — no JSX or DOM code |
| `electron` | `.ts` only | Main/preload are Node.js. `renderer.ts` has JSX, but the `.ts` extension is correct — ESLint parses JSX in `.ts` files natively through the TypeScript parser, unlike `tsc` which needs `"jsx": "react-jsx"`. |
| `capacitor` | `.ts` + `.tsx` | Renderer entry may have JSX |

### 5.3 `.gitignore` (root)

Add ESLint cache file (not currently gitignored):

```
# Lint cache
.eslintcache
```

## 6. Interfaces

No runtime interfaces. The "interface" is the contract between root config files and per-package `lint` scripts:
- Config files live at repository root
- Each package's `lint` script invokes `eslint` with a glob relative to that package's directory
- ESLint resolves `eslint.config.mjs` by walking up the directory tree from the linted file's location
- All packages share the same config — there is one code style for the entire monorepo

## 7. Data Flow

```
Developer invokes: pnpm lint
  -> Root package.json: pnpm -r lint
    -> For each package (in parallel):
      -> cd packages/shared    && eslint 'src/**/*.ts'
      -> cd packages/renderer  && eslint 'src/**/*.{ts,tsx}'
      -> cd packages/platform  && eslint 'src/**/*.ts'
      -> cd apps/electron      && eslint 'src/**/*.ts'
      -> cd apps/capacitor     && eslint 'src/**/*.{ts,tsx}'
    -> Each eslint invocation:
      -> Walks up from linted file to find root eslint.config.mjs
      -> Loads TypeScript parser from root node_modules/
      -> Loads plugins from root node_modules/
      -> Checks files against configured rules
      -> Exit 0 if clean; non-zero if violations

Formatting flow:
  npx prettier --check .
    -> Prettier finds root .prettierrc
    -> Reads .prettierignore
    -> Checks all non-ignored files for format compliance
    -> Exit 0 if formatted; non-zero if violations
```

## 8. State Changes

| Before | After |
|--------|-------|
| No ESLint or Prettier packages installed anywhere | 8 packages installed at root `node_modules/` |
| Root `package.json` has no `devDependencies` field | Root has 8 `devDependencies` |
| No `eslint.config.mjs` | Flat config exists with TypeScript + React + Prettier rules |
| No `.prettierrc` | Prettier config exists |
| No `.prettierignore` | Build artifacts and lockfile excluded |
| No `.eslintignore` | Same exclusions |
| All 5 packages have no-op `lint: echo ...` | All 5 have real `eslint` commands |
| `pnpm lint` exits 0 but does nothing | `pnpm lint` runs real lint checks on all 5 packages |
| `.gitignore` missing `.eslintcache` | `.eslintcache` added |

## 9. Database Changes

None. Pure tooling configuration task.

## 10. Error Handling

| Failure scenario | Behavior |
|-----------------|----------|
| `pnpm install` fails — version not found | Verify each version against npm registry. Use `npm view <package> versions --json` to confirm exact version exists. |
| `pnpm install` fails — peer dependency conflict | Check compatibility matrix above. If a plugin has moved to a new major, pin to latest compatible. |
| `pnpm lint` fails — ESLint can't find config | Verify `eslint.config.mjs` is at repository root. ESLint 9 walks up directories. |
| `pnpm lint` fails — parser not found | Verify `@typescript-eslint/parser@8.61.1` in root `devDependencies`. |
| `pnpm lint` fails on existing code | Existing code is minimal (barrel exports + scaffold). Fix any violations — the rules are working as intended. |
| `pnpm lint` fails on `dist/` files | Verify the `ignores` block in `eslint.config.mjs` covers `dist/`. |
| Prettier formats `pnpm-lock.yaml` | Verify `pnpm-lock.yaml` is in `.prettierignore`. |
| ESLint 9 flat config parse error | Verify `.mjs` extension. Verify `import` syntax (not `require`). |
| ESLint deprecation warning about `.eslintrc` | Should never occur — no `.eslintrc.*` files are created. |

## 11. Logging Requirements

None. ESLint and Prettier produce standard CLI output:
- ESLint: file paths with line/column numbers for violations, or no output if clean
- Prettier: list of unformatted files (with `--check`) or formatting status (with `--write`)

## 12. Security Requirements

| Requirement | How satisfied |
|-------------|---------------|
| No secrets in config | Config files contain only rule settings and plugin references — no tokens or credentials |
| Lint cache not committed | `.eslintcache` added to `.gitignore` |
| No dynamic plugin loading | All plugins are exact-version-pinned npm packages, no `latest` or range specifiers |
| Config is static and auditable | `eslint.config.mjs` is a declarative file with no file system traversal or env branching |

## 13. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-1 | `pnpm install` succeeds with new devDependencies | Run `pnpm install` — exit 0, no peer dep warnings |
| AC-2 | `pnpm lint` from root runs across all 5 packages | Run `pnpm lint` — must execute lint in all 5 packages |
| AC-3 | `pnpm lint` exits 0 on clean code | Existing barrel exports must pass with zero errors |
| AC-4 | Intentional lint error causes non-zero exit | Temporarily add `const x: any = 1` — `pnpm lint` must fail |
| AC-5 | `npx prettier --check` passes on all source files | Run on `**/*.{ts,tsx,json,yml,md,html}` — exit 0 |
| AC-6 | All 5 packages have real `lint` scripts | Inspect each `package.json` — must not contain `echo` |
| AC-7 | ESLint config is valid | Run `npx eslint --print-config packages/shared/src/index.ts` — must output config |
| AC-8 | All version pins are exact | Inspect root `devDependencies` — no `^` or `~` |
| AC-9 | No peer dep warnings on install | `pnpm install` output must not contain "unmet peer" |
| AC-10 | `pnpm typecheck` still passes | Run from root — no regression |
| AC-11 | ESLint does not lint build artifacts | Run `pnpm build:capacitor` then `pnpm lint` — must not scan `dist/` |
| AC-12 | `.eslintcache` is gitignored | Verify `.gitignore` contains `.eslintcache` |

## 14. Test Cases

| # | Test | Steps | Expected |
|---|------|-------|----------|
| TC-1 | Install dependencies | 1. Add devDeps to root `package.json`<br>2. Create 4 config files<br>3. Run `pnpm install` | Exit 0; no peer dep errors |
| TC-2 | Lint shared | `cd packages/shared && npx eslint 'src/**/*.ts'` | Exit 0; no violations |
| TC-3 | Lint renderer | `cd packages/renderer && npx eslint 'src/**/*.{ts,tsx}'` | Exit 0; no violations |
| TC-4 | Lint platform | `cd packages/platform && npx eslint 'src/**/*.ts'` | Exit 0; no violations |
| TC-5 | Lint electron app | `cd apps/electron && npx eslint 'src/**/*.ts'` | Exit 0; no violations |
| TC-6 | Lint capacitor app | `cd apps/capacitor && npx eslint 'src/**/*.{ts,tsx}'` | Exit 0; no violations |
| TC-7 | Recursive lint | `pnpm lint` from root | Exit 0; all 5 packages pass |
| TC-8 | ESLint catches explicit any | Add `const x: any = 1` to `packages/shared/src/index.ts`; run `pnpm lint` | Exit non-zero; error for `no-explicit-any` |
| TC-9 | ESLint catches unused vars | Add `const unused = 1` without usage; run `pnpm lint` | Exit non-zero; error for `no-unused-vars` |
| TC-10 | ESLint warns on console | Add `console.log('test')`; run `pnpm lint` | Warning (not error) for `no-console` |
| TC-11 | Prettier check passes | `npx prettier --check 'packages/**/*.ts' 'apps/**/*.ts'` | Exit 0 |
| TC-12 | Prettier catches formatting | Add extra indentation to a file; run `npx prettier --check` | Exit non-zero |
| TC-13 | Prettier formats correctly | Run `npx prettier --write` on a malformed file | File matches `.prettierrc` |
| TC-14 | ESLint ignores dist | `pnpm build:capacitor` then `pnpm lint` | Exit 0; no violations from `dist/` |
| TC-15 | No typecheck regression | `pnpm typecheck` from root | Exit 0 |
| TC-16 | ESLint config resolves | `npx eslint --print-config packages/shared/src/index.ts` | Outputs full resolved config |
| TC-17 | No placeholder text | `pnpm lint 2>&1 | grep "not configured"` | No matches |
| TC-18 | Clean up violations | Remove TC-8/TC-9/TC-10 test modifications | All files clean |

## 15. Definition of Done

1. Root `package.json` has 8 ESLint/Prettier `devDependencies` with exact version pins
2. `eslint.config.mjs` exists at root with TypeScript parser, strict rules, React plugin, Prettier integration
3. `.prettierrc` exists at root with specified formatting options
4. `.prettierignore` excludes build artifacts and lockfile
5. `.eslintignore` excludes build artifacts and generated code
6. All 5 packages have real `lint` scripts (not `echo` placeholders)
7. `pnpm install` succeeds with zero warnings
8. `pnpm lint` runs across all 5 packages and exits 0
9. Intentional violation (explicit `any`, unused var) causes non-zero exit
10. `npx prettier --check` passes on all source files
11. `pnpm typecheck` still passes (no regression)
12. `.gitignore` contains `.eslintcache`
13. No `^` or `~` in any ESLint/Prettier version strings

## 16. Implementation Order

1. Verify all 8 package versions exist on npm (`npm view <pkg> version`)
2. Add `devDependencies` to root `package.json`
3. Create `eslint.config.mjs` at repository root
4. Create `.prettierrc` at repository root
5. Create `.prettierignore` at repository root
6. Create `.eslintignore` at repository root
7. Run `pnpm install` — verify exit 0
8. Update `lint` scripts in all 5 workspace `package.json` files
9. Add `.eslintcache` to `.gitignore`
10. Run `pnpm lint` — verify all 5 packages pass
11. Run `npx prettier --check` — verify all files pass
12. Run intentional violation tests (TC-8, TC-9) — verify lint catches errors, then revert
13. Run `pnpm typecheck` — verify no regression

## 17. Traceability

| Source Document | Section | Requirement |
|----------------|---------|-------------|
| `E-01_PROJECT_INFRASTRUCTURE.md` | T-01.7 | 4 files produced, parser `@typescript-eslint/parser`, plugins `@typescript-eslint` + `react` + `react-hooks`, strict rules, Prettier single quotes/trailing commas/100 width/2 spaces |
| `PROJECT_CONSTITUTION.md` | Section 12 | "ESLint + @typescript-eslint" / "Prettier" / "Enforced on commit" |
| `01_ARCHITECTURE.md` | Section 2 | "ESLint + @typescript-eslint — Strict rules" / "Prettier — Enforced on commit" |
| `07_AGENT_RULES.md` | Section 1 | Exact pinned versions |
| `07_AGENT_RULES.md` | Rule 11.1 | Strict TypeScript mode |
| `07_AGENT_RULES.md` | Rule 11.4 | Verify versions against npm registry |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-04 | `node-linker=hoisted` enables root bin resolution |
| `06_IMPLEMENTATION_DECISIONS.md` | AD-09 | Electron app renderer.ts has JSX in `.ts` file — ESLint parser handles this natively |
