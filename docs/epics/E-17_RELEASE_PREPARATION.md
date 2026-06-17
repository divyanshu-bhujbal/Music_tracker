# E-17: Release Preparation

**Phase:** 4 | **Type:** Release | **Depends On:** E-16 | **Blocks:** (none)

---

## Overview

**Purpose:** Build and sign distributable packages for both platforms. Prepare store listings and user documentation.

**Platform impact:** REVISED. Electron uses `electron-builder` instead of MSBuild/Visual Studio. Capacitor uses standard Android signing + Play Store instead of React Native's Gradle signing.

---

## Tooling Mapping Table

| Original (Option A) | Revised (Option D) | Notes |
|---------------------|-------------------|-------|
| `./gradlew assembleRelease` (RN Android) | `npx cap sync && ./gradlew assembleRelease` (Capacitor Android) | Capacitor generates Gradle project; same signing process |
| MSBuild / Visual Studio (Windows) | `electron-builder` | Cross-platform build tool; produces `.exe` / `.msi` |
| React Native signing config | Android keystore (same) + Electron code signing certificate | Android: same keystore. Windows: new code signing cert. |
| Play Store listing | Play Store listing | Unchanged — same listing content |
| No Windows store (out of scope) | Optional: Microsoft Store or direct download | Direct download is default for V1 |

---

## Tasks

### T-17.1 — Configure Electron Builder

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.5 |
| **Blocks** | T-17.5, T-17.7 |

**Files produced:**
- `apps/electron/electron-builder.yml` (updated with release config)

**Requirements:**
- Target: Windows NSIS installer (`.exe`)
- App ID: `com.collectio.app`
- Product name: "Collectio" (placeholder)
- Icon set: `.ico` for Windows
- Include: Vite build output, Node.js native addons (better-sqlite3, argon2)
- Auto-update: not in V1
- Code signing: self-signed acceptable; documentation for obtaining code signing certificate

**Acceptance criteria:**
1. `pnpm build:electron` produces a runnable `.exe`
2. Installer installs to `Program Files`
3. App launches after install
4. Built-in app uninstall works

---

### T-17.2 — Configure Android Signing

| Property | Detail |
|----------|--------|
| **Depends on** | T-01.6 |
| **Blocks** | T-17.5, T-17.6 |

**Files produced:**
- `apps/capacitor/android/app/release-keystore.properties` (keystore config)
- Release keystore (stored securely, not in repo)

**Requirements:**
- Generate release keystore via `keytool`
- Configure `build.gradle` for release signing
- Build produces signed APK/AAB
- Capacitor `sync` ensures web assets are bundled

**Acceptance criteria:**
1. `./gradlew assembleRelease` produces signed AAB
2. AAB installs on Android device
3. App launches and displays web content correctly

---

### T-17.3 — Write User-Facing README

| Property | Detail |
|----------|--------|
| **Depends on** | ALL EPICS |
| **Blocks** | T-17.8 |

**Files produced:**
- `README.md` (root)

**Requirements:**
- Covers: what the app does, initial setup steps, credential restore procedure, Google account limitations, backup and recovery procedures
- Known limitations: no password recovery, no iOS, Electron bundle size, Windows-only desktop
- Clear, non-technical language; step-by-step setup instructions with screenshots (placeholder)

**Acceptance criteria:** Unchanged from original.

---

### T-17.4 — Implement Initial Setup Disclosure Warning

| Property | Detail |
|----------|--------|
| **Depends on** | T-10.8 |
| **Blocks** | M3 gate |

**Files produced:**
- Updated `SetupScreen.tsx` in `packages/renderer/src/screens/`

**Requirements:**
- Before user can proceed past password entry: displays non-dismissable warning:
  "Your master password encrypts your cloud backup. If you forget it, your cloud backup cannot be recovered. There is no password reset. Make sure you remember your password or store it in a password manager."
- User must explicitly acknowledge (checkbox + button) before proceeding

**Acceptance criteria:** Unchanged from original.

---

### T-17.5 — Version Bump and Changelog

| Property | Detail |
|----------|--------|
| **Depends on** | T-17.1, T-17.2 |
| **Blocks** | T-17.6, T-17.7 |

**Files produced:**
- Updated `package.json` files (version: 1.0.0)
- `CHANGELOG.md`

**Requirements:**
- Version 1.0.0 across all package.json files
- Changelog: all features, known limitations, platform support

**Acceptance criteria:** Unchanged from original.

---

### T-17.6 — Build Release APK/AAB

| Property | Detail |
|----------|--------|
| **Depends on** | T-17.2, T-17.5 |
| **Blocks** | T-17.8 |

**Files produced:**
- `apps/capacitor/android/app/build/outputs/bundle/release/app-release.aab`

**Requirements:**
- Release AAB built and signed
- Smoke-tested on at least 2 physical Android devices

**Acceptance criteria:** Unchanged from original.

---

### T-17.7 — Build Electron Installer

| Property | Detail |
|----------|--------|
| **Depends on** | T-17.1, T-17.5 |
| **Blocks** | T-17.8 |

**Files produced:**
- `apps/electron/dist/Collectio Setup 1.0.0.exe`

**Requirements:**
- Release installer built
- Smoke-tested on at least 1 Windows machine (not dev machine)

**Acceptance criteria:** Unchanged from original.

---

### T-17.8 — Distribution Preparation

| Property | Detail |
|----------|--------|
| **Depends on** | T-17.3, T-17.6, T-17.7 |
| **Blocks** | (none — final task) |

**Requirements:**
- Play Store listing content: title, description, screenshots, privacy policy
- Windows distribution: direct download (website/GitHub Releases)
- User can obtain and install the app on both platforms

**Acceptance criteria:** Unchanged from original.
