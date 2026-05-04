# FN Key Blocking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block macOS Fn-mapped keys (brightness, volume, Mission Control, Spotlight, Launchpad, dictation, media) while in CleanMode's Cleaning Mode by adding a session-level CGEventTap with Accessibility-permission gating.

**Architecture:** A bundled N-API native module owns the CGEventTap. Main process gates entry to cleaning mode on Accessibility permission. Renderer pre-flights via a new `enterCleaningMode()` IPC and shows a banner + permission modal. Existing kiosk + globalShortcut + window-listener layers stay as defense in depth.

**Tech Stack:** Electron 30, Node-API (raw napi, no node-addon-api), Objective-C++, Carbon/AppKit/ApplicationServices, prebuildify + node-gyp-build, electron-builder, @electron/notarize.

**Spec:** `docs/superpowers/specs/2026-05-04-fn-key-blocking-design.md`

**Note on testing:** The codebase has no test framework. Native macOS event-tap behavior cannot be unit-tested without real macOS + permission grants. This plan uses three verification flavors instead of unit tests:
- **Build verification** — does it compile / link / pass tsc?
- **Smoke check** — `node -e` one-liner exercising a single function
- **Dev-mode manual** — `npm run electron:dev` + observe behavior
- **Final manual test campaign** — Section 6 of the spec, run on a release candidate

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `electron/native/eventtap/binding.gyp` | node-gyp build config (frameworks, ARC, deployment target) |
| `electron/native/eventtap/package.json` | Local module manifest, declares `main: index.js` |
| `electron/native/eventtap/eventtap.mm` | Objective-C++ — CGEventTap + 4 N-API exports |
| `electron/native/eventtap/index.js` | JS wrapper, platform short-circuit, loader via node-gyp-build |
| `electron/native/eventtap/prebuilds/` | Prebuildify output, gitignored except for release tags |
| `components/AccessibilityModal.tsx` | Permission-denied modal with [Open Settings] / [Try Again] |
| `build/entitlements.mac.plist` | Hardened-runtime entitlements |
| `scripts/notarize.js` | `afterSign` hook that calls `@electron/notarize` |
| `BUILD.md` | Developer-facing build/sign/notarize documentation |
| `.gitignore` | (initial creation) — node_modules, dist, prebuilds artifacts, .env |

### Modified files

| Path | Change |
|---|---|
| `package.json` | New scripts (native:build, postinstall), new devDeps, build block (entitlements, per-arch DMGs, files glob, afterSign) |
| `electron/main.js` | Replace `set-cleaning-mode` IPC with four new channels; integrate tap.start/stop |
| `electron/preload.js` | Replace `setCleaningMode` with four new methods |
| `types/window.d.ts` | Update `Window.electron` shape |
| `components/Home.tsx` | Add accessibility state + banner + modal mount; replace Start button onClick with `handleStart` |
| `components/CleaningMode.tsx` | Remove mount-time `setCleaningMode(true)`; rename unlock paths to `exitCleaningMode()` |
| `utils/translations.ts` | 7 new keys × 7 languages |

### Files explicitly NOT changing

- `App.tsx` (entry/exit pattern unchanged at App level)
- `index.html`, `index.tsx`
- `vite.config.ts`
- `utils/changelog.ts`
- `components/AboutModal.tsx` (no changes for FN-key spec; the AI catalog spec touches it later)
- `components/Toaster.tsx`

---

## Phase 0 — Repo baseline

### Task 0: Initialize git repository

The plan calls for frequent commits but the repo isn't a git repo yet. Initialize and capture the current state as the baseline.

**Files:**
- Create: `/Users/mrbarkan/Development/cleanmode/.gitignore` (only if missing — there's an existing 253-byte one; verify and append if needed)

- [ ] **Step 1: Verify current state and existing .gitignore**

```bash
cd /Users/mrbarkan/Development/cleanmode
git status 2>&1 | head -3      # expect: "fatal: not a git repository"
ls -la .gitignore               # expect: file exists, 253 bytes
cat .gitignore
```

Expected: `.gitignore` exists; `git status` confirms not a repo.

- [ ] **Step 2: Initialize git, add prebuilds and electron-builder output to .gitignore**

```bash
cd /Users/mrbarkan/Development/cleanmode
git init
```

Append the following lines to `.gitignore` if not already present (use Read first, then Edit to add missing entries — do not duplicate):

```
electron/native/eventtap/build/
electron/native/eventtap/prebuilds/
release/
*.dmg
*.zip
.env
```

- [ ] **Step 3: Stage current files and create baseline commit**

```bash
cd /Users/mrbarkan/Development/cleanmode
git add .gitignore App.tsx CLAUDE.md README.md components/ docs/ electron/main.js electron/preload.js index.html index.tsx metadata.json package.json package-lock.json tsconfig.json types/ utils/ vite.config.ts
git commit -m "Baseline before FN-key blocking implementation"
git status   # expect: clean working tree
```

Expected: One commit on default branch. Working tree clean. `node_modules/`, `dist/`, `.env.local` untracked or ignored.

---

## Phase 1 — Native event tap

### Task 1: Native module skeleton

Set up the directory and the two manifest files. No code yet — just the scaffolding that lets `npm install` and `node-gyp` see the module.

**Files:**
- Create: `electron/native/eventtap/package.json`
- Create: `electron/native/eventtap/binding.gyp`

- [ ] **Step 1: Write the local module package.json**

`electron/native/eventtap/package.json`:

```json
{
  "name": "cleanmode-eventtap",
  "version": "1.0.0",
  "private": true,
  "description": "macOS CGEventTap for CleanMode's Cleaning Mode",
  "main": "index.js",
  "os": ["darwin"],
  "scripts": {
    "build": "prebuildify --napi --strip --arch arm64+x64",
    "build-current-arch": "prebuildify --napi --strip"
  }
}
```

- [ ] **Step 2: Write binding.gyp**

`electron/native/eventtap/binding.gyp`:

```python
{
  "targets": [
    {
      "target_name": "eventtap",
      "sources": [ "eventtap.mm" ],
      "conditions": [
        [ 'OS=="mac"', {
          "xcode_settings": {
            "OTHER_CFLAGS": [ "-ObjC++", "-fobjc-arc" ],
            "MACOSX_DEPLOYMENT_TARGET": "11.0",
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17"
          },
          "link_settings": {
            "libraries": [
              "$(SDKROOT)/System/Library/Frameworks/AppKit.framework",
              "$(SDKROOT)/System/Library/Frameworks/ApplicationServices.framework",
              "$(SDKROOT)/System/Library/Frameworks/Carbon.framework"
            ]
          }
        } ]
      ]
    }
  ]
}
```

- [ ] **Step 3: Verify the directory structure**

```bash
cd /Users/mrbarkan/Development/cleanmode
ls electron/native/eventtap/
```

Expected: `binding.gyp` and `package.json` listed.

- [ ] **Step 4: Commit**

```bash
cd /Users/mrbarkan/Development/cleanmode
git add electron/native/eventtap/binding.gyp electron/native/eventtap/package.json
git commit -m "feat(native): add eventtap module scaffolding"
```

---

### Task 2: Add devDependencies and root scripts

Wire the new tooling into the root `package.json` so `npm install` pulls in `prebuildify` and friends, and `npm run native:build` works end-to-end.

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Read current package.json to confirm current devDeps and scripts**

```bash
cd /Users/mrbarkan/Development/cleanmode
cat package.json
```

Expected: existing scripts include `dev`, `build`, `type-check`, `preview`, `electron:dev`, `electron:build`. Existing devDeps include `electron`, `electron-builder`, `vite`.

- [ ] **Step 2: Add new scripts to package.json**

In `package.json`, in the `"scripts"` block, add three new entries (keep existing entries as-is):

```json
"native:build": "npm --prefix electron/native/eventtap run build",
"native:build-current": "npm --prefix electron/native/eventtap run build-current-arch",
"postinstall": "node-gyp-build || true"
```

The `postinstall` ends in `|| true` so non-Mac contributors can `npm install` without the native build erroring out the whole install. `node-gyp-build` looks for prebuilt binaries in any module that has them — it's harmless on Linux/Windows where this module's `os: ["darwin"]` excludes it from install.

- [ ] **Step 3: Add new devDependencies**

In `package.json` `"devDependencies"`, add:

```json
"@electron/notarize": "^2.5.0",
"@electron/rebuild": "^3.7.0",
"node-gyp": "^10.2.0",
"node-gyp-build": "^4.8.0",
"prebuildify": "^6.0.1"
```

- [ ] **Step 4: Install**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm install
```

Expected: install completes (postinstall may print "no prebuild found" but does not fail because of `|| true`). `node_modules/prebuildify`, `node_modules/node-gyp-build`, `node_modules/@electron/notarize` exist.

- [ ] **Step 5: Verify**

```bash
cd /Users/mrbarkan/Development/cleanmode
ls node_modules/.bin/ | grep -E "prebuildify|node-gyp-build" | sort
```

Expected: at minimum `node-gyp-build` and `prebuildify` listed.

- [ ] **Step 6: Commit**

```bash
cd /Users/mrbarkan/Development/cleanmode
git add package.json package-lock.json
git commit -m "feat: add native build deps and scripts"
```

---

### Task 3: Implement the CGEventTap (eventtap.mm)

Write the Objective-C++ source that creates the tap, swallows everything except Cmd, and exposes 4 N-API functions.

**Files:**
- Create: `electron/native/eventtap/eventtap.mm`

- [ ] **Step 1: Write eventtap.mm**

`electron/native/eventtap/eventtap.mm`:

```objc
// CleanMode native event tap.
// Public N-API surface: start, stop, isAccessibilityTrusted, promptAccessibility.
// Drops every key event except Cmd (left/right) so the renderer's unlock combo still works.

#include <node_api.h>
#import <AppKit/AppKit.h>
#import <Carbon/Carbon.h>
#include <ApplicationServices/ApplicationServices.h>

// NSSystemDefined event type, as raw integer.
// Defined in IOKit/hidsystem/IOLLEvent.h as NX_SYSDEFINED == 14.
// Hardcoding 14 here avoids pulling in IOKit just for the constant.
#define NX_SYSDEFINED_EVENT_TYPE 14

static CFMachPortRef     g_tap = NULL;
static CFRunLoopSourceRef g_runLoopSource = NULL;

static CGEventRef tapCallback(CGEventTapProxy proxy,
                              CGEventType type,
                              CGEventRef event,
                              void *userInfo) {
    // Re-enable on watchdog timeout. Mandatory: macOS auto-disables a slow tap after ~1s.
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        if (g_tap) CGEventTapEnable(g_tap, true);
        return event;
    }

    // Allow Cmd keys through so the renderer's triple-Cmd unlock combo works.
    if (type == kCGEventKeyDown || type == kCGEventKeyUp || type == kCGEventFlagsChanged) {
        CGKeyCode kc = (CGKeyCode)CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);
        if (kc == kVK_Command || kc == kVK_RightCommand) {
            return event;
        }
    }

    // Drop everything else: F-keys, brightness, volume, Mission Control,
    // Spotlight, dictation, media, etc.
    return NULL;
}

static napi_value StartTap(napi_env env, napi_callback_info info) {
    napi_value result;
    if (g_tap) {
        // Already running — idempotent.
        napi_get_boolean(env, true, &result);
        return result;
    }

    CGEventMask mask =
        CGEventMaskBit(kCGEventKeyDown) |
        CGEventMaskBit(kCGEventKeyUp)   |
        CGEventMaskBit(kCGEventFlagsChanged) |
        CGEventMaskBit(NX_SYSDEFINED_EVENT_TYPE);

    g_tap = CGEventTapCreate(kCGSessionEventTap,
                             kCGHeadInsertEventTap,
                             kCGEventTapOptionDefault,
                             mask,
                             tapCallback,
                             NULL);
    if (!g_tap) {
        napi_get_boolean(env, false, &result);
        return result;
    }

    g_runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, g_tap, 0);
    if (!g_runLoopSource) {
        CFRelease(g_tap);
        g_tap = NULL;
        napi_get_boolean(env, false, &result);
        return result;
    }
    CFRunLoopAddSource(CFRunLoopGetCurrent(), g_runLoopSource, kCFRunLoopCommonModes);
    CGEventTapEnable(g_tap, true);

    napi_get_boolean(env, true, &result);
    return result;
}

static napi_value StopTap(napi_env env, napi_callback_info info) {
    if (g_runLoopSource) {
        CFRunLoopRemoveSource(CFRunLoopGetCurrent(), g_runLoopSource, kCFRunLoopCommonModes);
        CFRelease(g_runLoopSource);
        g_runLoopSource = NULL;
    }
    if (g_tap) {
        CFMachPortInvalidate(g_tap);
        CFRelease(g_tap);
        g_tap = NULL;
    }
    napi_value result;
    napi_get_undefined(env, &result);
    return result;
}

static napi_value IsAccessibilityTrusted(napi_env env, napi_callback_info info) {
    bool trusted = AXIsProcessTrusted();
    napi_value result;
    napi_get_boolean(env, trusted, &result);
    return result;
}

static napi_value PromptAccessibility(napi_env env, napi_callback_info info) {
    NSDictionary *options = @{(__bridge id)kAXTrustedCheckOptionPrompt: @YES};
    bool trusted = AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);

    // Open System Settings → Privacy & Security → Accessibility (best-effort).
    NSURL *url = [NSURL URLWithString:
        @"x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"];
    if (url) {
        [[NSWorkspace sharedWorkspace] openURL:url];
    }

    napi_value result;
    napi_get_boolean(env, trusted, &result);
    return result;
}

NAPI_MODULE_INIT() {
    napi_property_descriptor descs[] = {
        { "start",                  NULL, StartTap,                NULL, NULL, NULL, napi_default, NULL },
        { "stop",                   NULL, StopTap,                 NULL, NULL, NULL, napi_default, NULL },
        { "isAccessibilityTrusted", NULL, IsAccessibilityTrusted,  NULL, NULL, NULL, napi_default, NULL },
        { "promptAccessibility",    NULL, PromptAccessibility,     NULL, NULL, NULL, napi_default, NULL },
    };
    napi_define_properties(env, exports, sizeof(descs) / sizeof(descs[0]), descs);
    return exports;
}
```

- [ ] **Step 2: Build native module for current architecture**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run native:build-current
```

Expected:
- Output ends with `info build Building tag --napi-version=N for arch=arm64` (or x64).
- New file at `electron/native/eventtap/prebuilds/darwin-arm64/electron-eventtap.napi.node` (or `darwin-x64/...` on Intel). Confirm with `find electron/native/eventtap/prebuilds -name '*.node'`.

If the build fails with `clang: error: unknown argument: '-fobjc-arc'`, ensure Xcode Command Line Tools are installed: `xcode-select --install`.

- [ ] **Step 3: Smoke-test the binary loads and exports the right surface**

```bash
cd /Users/mrbarkan/Development/cleanmode
node -e "const t = require('node-gyp-build')('./electron/native/eventtap'); console.log(Object.keys(t).sort());"
```

Expected stdout: `[ 'isAccessibilityTrusted', 'promptAccessibility', 'start', 'stop' ]`.

- [ ] **Step 4: Smoke-test isAccessibilityTrusted runs without crashing**

```bash
cd /Users/mrbarkan/Development/cleanmode
node -e "const t = require('node-gyp-build')('./electron/native/eventtap'); console.log('trusted:', t.isAccessibilityTrusted());"
```

Expected stdout: `trusted: false` (or `trusted: true` if you've previously granted Accessibility to your terminal). Either is fine — the key is no crash.

- [ ] **Step 5: Commit**

```bash
cd /Users/mrbarkan/Development/cleanmode
git add electron/native/eventtap/eventtap.mm
git commit -m "feat(native): implement CGEventTap with Cmd-passthrough"
```

---

### Task 4: JS wrapper with platform short-circuit

Add the `index.js` that loads the prebuilt binary on Darwin and returns no-op stubs elsewhere. This is what `electron/main.js` will require.

**Files:**
- Create: `electron/native/eventtap/index.js`

- [ ] **Step 1: Write the wrapper**

`electron/native/eventtap/index.js`:

```js
'use strict';

// Platform short-circuit: on non-Darwin (Windows/Linux dev machines), this module
// returns benign stubs so the rest of the app's lifecycle code runs unchanged.
if (process.platform !== 'darwin') {
  module.exports = {
    start: () => true,
    stop: () => {},
    isAccessibilityTrusted: () => true,
    promptAccessibility: () => true,
  };
  return;
}

// Darwin: load the prebuilt binary via node-gyp-build.
// node-gyp-build picks the right slice from prebuilds/<platform>-<arch>/.
const native = require('node-gyp-build')(__dirname);

module.exports = {
  start: native.start,
  stop: native.stop,
  isAccessibilityTrusted: native.isAccessibilityTrusted,
  promptAccessibility: native.promptAccessibility,
};
```

- [ ] **Step 2: Smoke-test the wrapper**

```bash
cd /Users/mrbarkan/Development/cleanmode
node -e "const tap = require('./electron/native/eventtap'); console.log('trusted:', tap.isAccessibilityTrusted());"
```

Expected: `trusted: false` (or `true`). No crash.

- [ ] **Step 3: Type-check root project still passes**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run type-check
```

Expected: exits 0 (no TS errors).

- [ ] **Step 4: Commit**

```bash
cd /Users/mrbarkan/Development/cleanmode
git add electron/native/eventtap/index.js
git commit -m "feat(native): add JS wrapper with platform short-circuit"
```

---

### Task 5: Universal prebuild (release artifact)

Build both arm64 and x64 slices so per-arch DMGs in Phase 4 have something to bundle. This requires the macOS x64 SDK component, which ships with any modern Xcode install.

**Files:**
- Modify: `electron/native/eventtap/prebuilds/` (build output)

- [ ] **Step 1: Run the universal prebuild**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run native:build
```

Expected: builds twice (once per arch). Final tree:

```
electron/native/eventtap/prebuilds/
├── darwin-arm64/
│   └── electron-eventtap.napi.node
└── darwin-x64/
    └── electron-eventtap.napi.node
```

Confirm with: `find electron/native/eventtap/prebuilds -type f -name '*.node'`.

- [ ] **Step 2: Verify the binary is a fat slice or has both arches present**

```bash
cd /Users/mrbarkan/Development/cleanmode
file electron/native/eventtap/prebuilds/darwin-arm64/*.node
file electron/native/eventtap/prebuilds/darwin-x64/*.node
```

Expected: arm64 file reports `Mach-O 64-bit bundle arm64`, x64 file reports `Mach-O 64-bit bundle x86_64`.

- [ ] **Step 3: No commit yet**

The prebuilds are gitignored per Task 0. They'll be regenerated by the release pipeline. Move on without committing.

---

## Phase 2 — IPC redesign

### Task 6: Update preload.js

Replace `setCleaningMode` with the four new channels.

**Files:**
- Modify: `electron/preload.js`

- [ ] **Step 1: Read existing preload.js**

```bash
cd /Users/mrbarkan/Development/cleanmode
cat electron/preload.js
```

Expected: 5-line file exposing `setCleaningMode`.

- [ ] **Step 2: Replace contents**

`electron/preload.js`:

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  enterCleaningMode:   () => ipcRenderer.invoke('enter-cleaning-mode'),
  exitCleaningMode:    () => ipcRenderer.send('exit-cleaning-mode'),
  checkAccessibility:  () => ipcRenderer.invoke('check-accessibility'),
  promptAccessibility: () => ipcRenderer.invoke('prompt-accessibility'),
});
```

- [ ] **Step 3: Commit**

```bash
cd /Users/mrbarkan/Development/cleanmode
git add electron/preload.js
git commit -m "feat(ipc): replace setCleaningMode with four-channel surface"
```

---

### Task 7: Update window.d.ts

Update the global `Window.electron` shape so TypeScript knows about the new methods.

**Files:**
- Modify: `types/window.d.ts`

- [ ] **Step 1: Read existing types/window.d.ts**

```bash
cd /Users/mrbarkan/Development/cleanmode
cat types/window.d.ts
```

- [ ] **Step 2: Replace contents**

`types/window.d.ts`:

```ts
export {};

export type EnterCleaningModeResult =
  | { ok: true }
  | { ok: false; error: 'accessibility-denied' | 'tap-failed' };

declare global {
  interface Window {
    electron?: {
      enterCleaningMode:   () => Promise<EnterCleaningModeResult>;
      exitCleaningMode:    () => void;
      checkAccessibility:  () => Promise<boolean>;
      promptAccessibility: () => Promise<boolean>;
    };
  }
}
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run type-check
```

Expected: exits 0. (Existing renderer code that calls `window.electron.setCleaningMode` will still type-check at this point because `electron` is optional and the call sites use optional chaining; we'll update them in Phase 3.)

If `tsc` complains about the existing `setCleaningMode` calls, that means the codebase calls it without optional chaining somewhere and the renamed surface broke it. Fix in Phase 3 — for now, skip ahead but note the call site.

- [ ] **Step 4: Commit**

```bash
cd /Users/mrbarkan/Development/cleanmode
git add types/window.d.ts
git commit -m "feat(types): update Window.electron for four-channel IPC"
```

---

### Task 8: Replace IPC handlers in main.js

Remove the old `set-cleaning-mode` handler. Add four new handlers. Wire `tap.start/stop` into `enter-cleaning-mode` and `exit-cleaning-mode`.

**Files:**
- Modify: `electron/main.js`

- [ ] **Step 1: Read current main.js**

Read `/Users/mrbarkan/Development/cleanmode/electron/main.js` end-to-end. Note: the existing code uses an `isCleaningMode` boolean and the existing `before-input-event` handler depends on it. Keep that pattern.

- [ ] **Step 2: Replace contents of electron/main.js**

```js
const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const tap = require('./native/eventtap');
const isDev = !app.isPackaged;

let mainWindow;
let isCleaningMode = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../dist/icon.png')
  });

  const startUrl = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Existing defense-in-depth layer: window-level key blocking.
  // Allows Meta keys through so renderer can detect unlock combo.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (isCleaningMode) {
      if (input.key === 'Meta' || input.code === 'MetaLeft' || input.code === 'MetaRight') {
        return;
      }
      event.preventDefault();
    }
  });
}

const fKeys = Array.from({ length: 24 }, (_, i) => `F${i + 1}`);
const BLOCKED_KEYS = [
  ...fKeys,
  'Escape',
  'CommandOrControl+Q',
  'CommandOrControl+W',
  'CommandOrControl+H',
  'CommandOrControl+R',
  'CommandOrControl+Shift+I',
  'CommandOrControl+P',
  'Alt+F4',
  'Alt+Tab',
  'VolumeUp', 'VolumeDown', 'VolumeMute',
  'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop', 'MediaPlayPause'
];

ipcMain.handle('enter-cleaning-mode', async () => {
  if (!mainWindow) return { ok: false, error: 'tap-failed' };

  // Permission gate.
  if (!tap.isAccessibilityTrusted()) {
    tap.promptAccessibility();
    return { ok: false, error: 'accessibility-denied' };
  }

  // Native tap (the primary blocker for Fn-mapped events).
  if (!tap.start()) {
    return { ok: false, error: 'tap-failed' };
  }

  // Existing kiosk + globalShortcut layers (defense in depth).
  isCleaningMode = true;
  if (process.platform === 'darwin') {
    mainWindow.setSimpleFullScreen(true);
  } else {
    mainWindow.setKiosk(true);
  }
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.focus();

  BLOCKED_KEYS.forEach(key => {
    try {
      globalShortcut.register(key, () => false);
    } catch (e) {
      console.error(`Failed to register ${key}`, e);
    }
  });

  return { ok: true };
});

ipcMain.on('exit-cleaning-mode', () => {
  if (!mainWindow) return;
  isCleaningMode = false;

  tap.stop();
  globalShortcut.unregisterAll();

  mainWindow.setAlwaysOnTop(false);
  if (process.platform === 'darwin') {
    mainWindow.setSimpleFullScreen(false);
  } else {
    mainWindow.setKiosk(false);
  }
});

ipcMain.handle('check-accessibility',  () => tap.isAccessibilityTrusted());
ipcMain.handle('prompt-accessibility', () => tap.promptAccessibility());

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  tap.stop();   // safety net
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 3: Verify compile (Electron requires no compile step but type-check should pass)**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run type-check
```

Expected: exits 0. (Renderer-side calls to `window.electron.setCleaningMode` may now error — fix immediately in Phase 3 below if so.)

- [ ] **Step 4: Commit**

```bash
cd /Users/mrbarkan/Development/cleanmode
git add electron/main.js
git commit -m "feat(ipc): replace set-cleaning-mode with four-channel handlers + tap lifecycle"
```

---

## Phase 3 — Renderer wiring

### Task 9: Add new i18n keys to translations.ts

Add seven new keys to all seven languages. Machine translation is acceptable — sources of truth are the English strings.

**Files:**
- Modify: `utils/translations.ts`

- [ ] **Step 1: Read current translations.ts**

Read `/Users/mrbarkan/Development/cleanmode/utils/translations.ts`. Each language is a flat key→string object.

- [ ] **Step 2: Add seven keys per language**

For each of `en`, `es`, `fr`, `de`, `zh`, `ja`, `pt`, add the following keys to the language's object (use Edit; do not duplicate existing keys):

**English (`en`):**
```ts
accessibilityBannerTitle: "Mac function keys won't be blocked.",
accessibilityBannerBody: "CleanMode needs Accessibility permission.",
accessibilityGrant: "Grant",
accessibilityModalTitle: "Accessibility Permission Required",
accessibilityModalBody: "CleanMode needs Accessibility permission to block Mac brightness, volume, Mission Control, and Spotlight keys while you clean.\n\n1. Open System Settings → Privacy & Security → Accessibility\n2. Enable CleanMode in the list\n3. Click Try Again below",
accessibilityOpenSettings: "Open Settings",
accessibilityTryAgain: "Try Again",
```

**Spanish (`es`):**
```ts
accessibilityBannerTitle: "Las teclas de función de Mac no se bloquearán.",
accessibilityBannerBody: "CleanMode necesita permiso de Accesibilidad.",
accessibilityGrant: "Conceder",
accessibilityModalTitle: "Se requiere permiso de Accesibilidad",
accessibilityModalBody: "CleanMode necesita permiso de Accesibilidad para bloquear las teclas de brillo, volumen, Mission Control y Spotlight de Mac mientras limpias.\n\n1. Abre Configuración del Sistema → Privacidad y Seguridad → Accesibilidad\n2. Activa CleanMode en la lista\n3. Haz clic en Reintentar abajo",
accessibilityOpenSettings: "Abrir Configuración",
accessibilityTryAgain: "Reintentar",
```

**French (`fr`):**
```ts
accessibilityBannerTitle: "Les touches de fonction Mac ne seront pas bloquées.",
accessibilityBannerBody: "CleanMode a besoin de l'autorisation d'Accessibilité.",
accessibilityGrant: "Accorder",
accessibilityModalTitle: "Autorisation d'Accessibilité requise",
accessibilityModalBody: "CleanMode a besoin de l'autorisation d'Accessibilité pour bloquer les touches de luminosité, volume, Mission Control et Spotlight pendant le nettoyage.\n\n1. Ouvrez Réglages Système → Confidentialité et sécurité → Accessibilité\n2. Activez CleanMode dans la liste\n3. Cliquez sur Réessayer ci-dessous",
accessibilityOpenSettings: "Ouvrir les Réglages",
accessibilityTryAgain: "Réessayer",
```

**German (`de`):**
```ts
accessibilityBannerTitle: "Mac-Funktionstasten werden nicht blockiert.",
accessibilityBannerBody: "CleanMode benötigt die Bedienungshilfen-Berechtigung.",
accessibilityGrant: "Erlauben",
accessibilityModalTitle: "Bedienungshilfen-Berechtigung erforderlich",
accessibilityModalBody: "CleanMode benötigt die Bedienungshilfen-Berechtigung, um Mac-Tasten für Helligkeit, Lautstärke, Mission Control und Spotlight während der Reinigung zu blockieren.\n\n1. Öffnen Sie Systemeinstellungen → Datenschutz & Sicherheit → Bedienungshilfen\n2. Aktivieren Sie CleanMode in der Liste\n3. Klicken Sie unten auf Erneut versuchen",
accessibilityOpenSettings: "Einstellungen öffnen",
accessibilityTryAgain: "Erneut versuchen",
```

**Chinese (`zh`):**
```ts
accessibilityBannerTitle: "Mac 功能键不会被阻止。",
accessibilityBannerBody: "CleanMode 需要辅助功能权限。",
accessibilityGrant: "授予",
accessibilityModalTitle: "需要辅助功能权限",
accessibilityModalBody: "CleanMode 需要辅助功能权限,以便在清洁时阻止 Mac 的亮度、音量、调度中心和聚焦键。\n\n1. 打开系统设置 → 隐私与安全性 → 辅助功能\n2. 在列表中启用 CleanMode\n3. 点击下方的重试",
accessibilityOpenSettings: "打开设置",
accessibilityTryAgain: "重试",
```

**Japanese (`ja`):**
```ts
accessibilityBannerTitle: "Macのファンクションキーはブロックされません。",
accessibilityBannerBody: "CleanModeにはアクセシビリティの許可が必要です。",
accessibilityGrant: "許可する",
accessibilityModalTitle: "アクセシビリティの許可が必要です",
accessibilityModalBody: "CleanModeは清掃中にMacの輝度、音量、Mission Control、Spotlightキーをブロックするためにアクセシビリティの許可が必要です。\n\n1. システム設定 → プライバシーとセキュリティ → アクセシビリティを開く\n2. リストでCleanModeを有効にする\n3. 下の「再試行」をクリック",
accessibilityOpenSettings: "設定を開く",
accessibilityTryAgain: "再試行",
```

**Portuguese (`pt`):**
```ts
accessibilityBannerTitle: "As teclas de função do Mac não serão bloqueadas.",
accessibilityBannerBody: "O CleanMode precisa de permissão de Acessibilidade.",
accessibilityGrant: "Conceder",
accessibilityModalTitle: "Permissão de Acessibilidade necessária",
accessibilityModalBody: "O CleanMode precisa de permissão de Acessibilidade para bloquear as teclas de brilho, volume, Mission Control e Spotlight do Mac durante a limpeza.\n\n1. Abra Definições do Sistema → Privacidade e Segurança → Acessibilidade\n2. Ative o CleanMode na lista\n3. Clique em Tentar Novamente abaixo",
accessibilityOpenSettings: "Abrir Definições",
accessibilityTryAgain: "Tentar Novamente",
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run type-check
```

Expected: exits 0. If a per-language object is missing a key, tsc will surface it because the inferred type of `t` is the union of all language shapes. Fix any missing keys.

- [ ] **Step 4: Commit**

```bash
cd /Users/mrbarkan/Development/cleanmode
git add utils/translations.ts
git commit -m "feat(i18n): add accessibility banner and modal strings (7 langs)"
```

---

### Task 10: Create AccessibilityModal component

New modal component, modeled on existing `AboutModal.tsx`. Two buttons: [Open Settings] and [Try Again].

**Files:**
- Create: `components/AccessibilityModal.tsx`

- [ ] **Step 1: Read AboutModal.tsx for the styling pattern**

```bash
cd /Users/mrbarkan/Development/cleanmode
cat components/AboutModal.tsx
```

Note the overlay pattern (fixed inset-0, backdrop blur), border + rounded-2xl card, theme-aware classes.

- [ ] **Step 2: Write AccessibilityModal.tsx**

`components/AccessibilityModal.tsx`:

```tsx
import React from 'react';
import { ShieldAlert, ExternalLink, RotateCcw, X } from 'lucide-react';
import { Theme } from '../App';
import { t, Language } from '../utils/translations';

interface AccessibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onTryAgain: () => void;
  theme: Theme;
  lang: Language;
}

export const AccessibilityModal: React.FC<AccessibilityModalProps> = ({
  isOpen,
  onClose,
  onOpenSettings,
  onTryAgain,
  theme,
  lang,
}) => {
  if (!isOpen) return null;

  const isDark = theme === 'dark';
  const text = t[lang];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md rounded-2xl border shadow-2xl p-6
          ${isDark ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center
              ${isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>
              <ShieldAlert className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-semibold">{text.accessibilityModalTitle}</h2>
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded-lg transition-colors
              ${isDark ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-neutral-100 text-neutral-500'}`}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className={`text-sm whitespace-pre-line leading-relaxed mb-6
          ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
          {text.accessibilityModalBody}
        </p>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onOpenSettings}
            className={`px-4 py-2 rounded-xl border text-sm font-medium flex items-center gap-2 transition-colors
              ${isDark
                ? 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700 text-white'
                : 'bg-white border-neutral-200 hover:bg-neutral-50 text-neutral-900'}`}
          >
            <ExternalLink className="w-4 h-4" />
            {text.accessibilityOpenSettings}
          </button>
          <button
            onClick={onTryAgain}
            className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            {text.accessibilityTryAgain}
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run type-check
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/mrbarkan/Development/cleanmode
git add components/AccessibilityModal.tsx
git commit -m "feat(ui): add AccessibilityModal component"
```

---

### Task 11: Wire Home.tsx — handleStart, banner, modal mount

Replace the Start button's `onClick` with an async `handleStart`. Add the accessibility banner under the Start button. Mount `AccessibilityModal`.

**Files:**
- Modify: `components/Home.tsx`

- [ ] **Step 1: Read current Home.tsx and locate the relevant lines**

```bash
cd /Users/mrbarkan/Development/cleanmode
cat -n components/Home.tsx | head -25
```

Note the current imports (lucide icons, GoogleGenAI, translations, Theme, appVersion). The Start button onClick is around line 161 per the spec.

- [ ] **Step 2: Update imports — add `AlertTriangle` (if not already), `ShieldAlert`**

In the `lucide-react` import line near top of file, ensure these are imported (they may already be there): `AlertTriangle`. Add: `ShieldAlert`.

Add a new import below the existing component imports:

```tsx
import { AccessibilityModal } from './AccessibilityModal';
```

- [ ] **Step 3: Add state and effect at the top of the `Home` component body**

Inside the component body (after the existing `useState` declarations for `deviceModel`, `isLoading`, `tips`, `sources`, `error`, `isLangMenuOpen`), add:

```tsx
const [accessibilityAvailable, setAccessibilityAvailable] = useState<boolean | null>(null);
const [isAccessibilityModalOpen, setIsAccessibilityModalOpen] = useState(false);

useEffect(() => {
  let cancelled = false;
  (async () => {
    if (window.electron?.checkAccessibility) {
      try {
        const ok = await window.electron.checkAccessibility();
        if (!cancelled) setAccessibilityAvailable(ok);
      } catch {
        if (!cancelled) setAccessibilityAvailable(null);
      }
    } else {
      // Browser/non-Electron — banner not applicable.
      if (!cancelled) setAccessibilityAvailable(true);
    }
  })();
  return () => { cancelled = true; };
}, []);
```

- [ ] **Step 4: Add handleStart function**

Below `generateTips`, add:

```tsx
const handleStart = async () => {
  const result = await window.electron?.enterCleaningMode?.() ?? { ok: true as const };
  if (result.ok) {
    onLock(tips);
    return;
  }
  if (result.error === 'accessibility-denied') {
    setIsAccessibilityModalOpen(true);
    return;
  }
  // tap-failed or other unexpected error — surface in existing red error banner.
  setError(text.fetchError);
};

const handleGrant = async () => {
  if (window.electron?.promptAccessibility) {
    const granted = await window.electron.promptAccessibility();
    setAccessibilityAvailable(granted);
  }
};

const handleTryAgain = async () => {
  const result = await window.electron?.enterCleaningMode?.() ?? { ok: true as const };
  if (result.ok) {
    setIsAccessibilityModalOpen(false);
    setAccessibilityAvailable(true);
    onLock(tips);
  }
  // Stay open if still denied; user is expected to grant in System Settings.
};
```

- [ ] **Step 5: Replace the Start button's onClick**

Find the Start button (currently `onClick={() => onLock(tips)}` per the spec). Change it to:

```tsx
onClick={handleStart}
```

- [ ] **Step 6: Add accessibility banner**

Add the banner *immediately after* the Start button's enclosing `<div className="relative group w-full">` block (still inside the same container that holds the Start button). Insert:

```tsx
{accessibilityAvailable === false && (
  <div className={`mt-4 p-3 rounded-xl border flex gap-3 items-start
    ${isDark ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
    <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
    <div className="flex-1 min-w-0">
      <p className={`text-xs font-medium ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
        {text.accessibilityBannerTitle}
      </p>
      <p className={`text-xs mt-0.5 ${isDark ? 'text-amber-400/80' : 'text-amber-700'}`}>
        {text.accessibilityBannerBody}
      </p>
    </div>
    <button
      onClick={handleGrant}
      className={`text-xs font-semibold px-2 py-1 rounded transition-colors
        ${isDark ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300' : 'bg-amber-100 hover:bg-amber-200 text-amber-800'}`}
    >
      {text.accessibilityGrant}
    </button>
  </div>
)}
```

- [ ] **Step 7: Mount AccessibilityModal**

Just before the final `</div>` that closes the top-level Home container (the one returned by the component), add:

```tsx
<AccessibilityModal
  isOpen={isAccessibilityModalOpen}
  onClose={() => setIsAccessibilityModalOpen(false)}
  onOpenSettings={handleGrant}
  onTryAgain={handleTryAgain}
  theme={theme}
  lang={lang}
/>
```

- [ ] **Step 8: Type-check**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run type-check
```

Expected: exits 0.

- [ ] **Step 9: Commit**

```bash
cd /Users/mrbarkan/Development/cleanmode
git add components/Home.tsx
git commit -m "feat(ui): pre-flight accessibility in Home + banner + modal mount"
```

---

### Task 12: Update CleaningMode.tsx — remove mount-time setCleaningMode, rename unlock paths

**Files:**
- Modify: `components/CleaningMode.tsx`

- [ ] **Step 1: Read CleaningMode.tsx**

```bash
cd /Users/mrbarkan/Development/cleanmode
cat -n components/CleaningMode.tsx
```

Find the call to `window.electron.setCleaningMode(true)` inside the `useEffect` (around the start of the effect, per the spec — line ~57) and the call to `window.electron.setCleaningMode(false)` inside `handleUnlockSequence` (around line ~37).

- [ ] **Step 2: Remove the mount-time `setCleaningMode(true)` call**

Delete this block at the top of the `useEffect`:

```tsx
// 1. Trigger Native Electron Kiosk Mode (if available)
if (window.electron) {
    window.electron.setCleaningMode(true);
}
```

The browser-fallback Keyboard Lock API call (`navigator.keyboard.lock()`) and everything below it stays.

- [ ] **Step 3: Replace `setCleaningMode(false)` calls with `exitCleaningMode()`**

In `handleUnlockSequence`:

```tsx
const handleUnlockSequence = useCallback(() => {
  if (window.electron) {
    window.electron.exitCleaningMode();
  }
  onUnlock();
}, [onUnlock]);
```

In the `useEffect` cleanup function, replace:

```tsx
// Cleanup: Ensure Electron Kiosk is off if component unmounts unexpectedly
if (window.electron) {
  window.electron.setCleaningMode(false);
}
```

with:

```tsx
// Cleanup: Ensure Electron Kiosk is off if component unmounts unexpectedly
if (window.electron) {
  window.electron.exitCleaningMode();
}
```

- [ ] **Step 4: Type-check**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run type-check
```

Expected: exits 0. No remaining references to `setCleaningMode` anywhere.

- [ ] **Step 5: grep for stragglers**

```bash
cd /Users/mrbarkan/Development/cleanmode
grep -rn "setCleaningMode" --include="*.ts" --include="*.tsx" --include="*.js" .
```

Expected: zero matches (or only inside `dist/` which is build output and gitignored).

- [ ] **Step 6: Commit**

```bash
cd /Users/mrbarkan/Development/cleanmode
git add components/CleaningMode.tsx
git commit -m "feat(ui): remove mount-time setCleaningMode, use exitCleaningMode on unlock"
```

---

### Task 13: Dev-mode smoke test (entire happy path)

Run the app in dev mode and exercise the full permission flow to verify the wiring works end-to-end before moving to packaging.

**Files:** none modified (manual verification only)

- [ ] **Step 1: Start dev**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run electron:dev
```

Expected: Electron window opens to the CleanMode UI. No console errors.

- [ ] **Step 2: First-launch — Accessibility not yet granted**

In System Settings → Privacy & Security → Accessibility, confirm "Electron" is NOT in the list (or if present, toggle it OFF).

In the app's left sidebar, look for the amber accessibility banner under the Start button.

Expected: banner visible with `[Grant]` button.

- [ ] **Step 3: Click Start → modal appears**

Click "Start Cleaning Mode".

Expected:
- macOS shows the system Accessibility prompt for "Electron".
- System Settings opens to Privacy & Security → Accessibility.
- The CleanMode in-app modal appears with [Open Settings] and [Try Again] buttons.
- The cleaning mode UI does NOT appear (preflight kept us on Home).

- [ ] **Step 4: Grant in Settings, then Try Again**

In System Settings, toggle Electron ON in Accessibility. Return to the app, click [Try Again].

Expected: modal closes, app enters fullscreen cleaning mode (lock icon, ripple animation on key/click).

- [ ] **Step 5: Verify Fn-key blocking — the actual bug fix**

Press F1 (brightness down), F3 (Mission Control), F4 (Spotlight/Launchpad), F11 (volume down), F12 (volume up). Each should do **nothing** — no brightness change, no Mission Control, no Spotlight, no volume change.

Press Cmd+Tab. Expected: nothing.
Press Cmd+Space. Expected: nothing.
Press Esc. Expected: nothing (does not exit fullscreen).

- [ ] **Step 6: Unlock combo**

Press both Cmd keys simultaneously, three times within 2 seconds.

Expected: Lock icon turns to Unlock + green pulse, the app exits cleaning mode and returns to Home. Fullscreen exits. The banner is now gone (Accessibility is granted).

- [ ] **Step 7: Re-enter cleaning mode — happy path with prior grant**

Click "Start Cleaning Mode" again.

Expected: enters cleaning mode immediately. No modal, no prompt.

- [ ] **Step 8: Exit and quit**

Unlock with the combo. Quit Electron (Cmd+Q from the menu, NOT from inside cleaning mode).

- [ ] **Step 9: No commit (manual smoke only)**

If anything failed at Steps 2–7, revisit the previous tasks and fix before continuing. If everything passed, the renderer + main + native plumbing is end-to-end correct.

---

## Phase 4 — Build pipeline

### Task 14: Create entitlements file

Hardened-runtime needs an entitlements file. Without one, signing succeeds but apps with V8 (Electron) fail at runtime.

**Files:**
- Create: `build/entitlements.mac.plist`

- [ ] **Step 1: Create build directory if missing**

```bash
cd /Users/mrbarkan/Development/cleanmode
mkdir -p build
ls build/
```

Expected: directory exists. May contain `icon.icns` already.

- [ ] **Step 2: Write the entitlements plist**

`build/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
  <key>com.apple.security.device.input-monitoring</key>
  <true/>
</dict>
</plist>
```

- [ ] **Step 3: Validate plist syntax**

```bash
cd /Users/mrbarkan/Development/cleanmode
plutil -lint build/entitlements.mac.plist
```

Expected: `build/entitlements.mac.plist: OK`.

- [ ] **Step 4: Commit**

```bash
cd /Users/mrbarkan/Development/cleanmode
git add build/entitlements.mac.plist
git commit -m "feat(build): add hardened-runtime entitlements"
```

---

### Task 15: Update package.json `build` block

Add entitlements wiring, per-arch DMG/zip targets, file globs for prebuilds, and the `afterSign` hook.

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Read current build block**

```bash
cd /Users/mrbarkan/Development/cleanmode
cat package.json | grep -A 30 '"build":'
```

- [ ] **Step 2: Replace the entire `"build"` block in package.json**

Replace the existing `"build": { ... }` with:

```jsonc
"build": {
  "appId": "com.cleanmode.app",
  "productName": "CleanMode",
  "afterSign": "scripts/notarize.js",
  "mac": {
    "category": "public.app-category.utilities",
    "target": [
      { "target": "dmg", "arch": ["arm64", "x64"] },
      { "target": "zip", "arch": ["arm64", "x64"] }
    ],
    "icon": "build/icon.icns",
    "hardenedRuntime": true,
    "gatekeeperAssess": false,
    "entitlements": "build/entitlements.mac.plist",
    "entitlementsInherit": "build/entitlements.mac.plist",
    "notarize": false
  },
  "directories": {
    "buildResources": "build"
  },
  "files": [
    "dist/**/*",
    "electron/**/*",
    "package.json",
    "!electron/native/eventtap/build/**",
    "electron/native/eventtap/prebuilds/**"
  ],
  "extends": null
}
```

`notarize: false` is intentional — `electron-builder`'s built-in notarize is older; we use `@electron/notarize` directly via the `afterSign` hook for control.

- [ ] **Step 3: Verify JSON is valid**

```bash
cd /Users/mrbarkan/Development/cleanmode
node -e "JSON.parse(require('fs').readFileSync('package.json'))" && echo "valid"
```

Expected: `valid`.

- [ ] **Step 4: Commit**

```bash
cd /Users/mrbarkan/Development/cleanmode
git add package.json
git commit -m "feat(build): per-arch DMGs, entitlements, afterSign hook"
```

---

### Task 16: Create scripts/notarize.js

The `afterSign` hook called by `electron-builder` after the .app is signed. Submits the bundle to Apple for notarization and waits for the result.

**Files:**
- Create: `scripts/notarize.js`

- [ ] **Step 1: Create scripts directory**

```bash
cd /Users/mrbarkan/Development/cleanmode
mkdir -p scripts
```

- [ ] **Step 2: Write the notarize hook**

`scripts/notarize.js`:

```js
const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.warn(
      '[notarize] Skipping notarization: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, ' +
      'or APPLE_TEAM_ID not set in environment.'
    );
    return;
  }

  console.log(`[notarize] Submitting ${appPath} for notarization (team ${teamId})…`);
  await notarize({
    tool: 'notarytool',
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });
  console.log('[notarize] Done.');
};
```

- [ ] **Step 3: Test the hook does not throw on import**

```bash
cd /Users/mrbarkan/Development/cleanmode
node -e "require('./scripts/notarize.js'); console.log('ok')"
```

Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
cd /Users/mrbarkan/Development/cleanmode
git add scripts/notarize.js
git commit -m "feat(build): add @electron/notarize afterSign hook"
```

---

### Task 17: Create BUILD.md

Document the prerequisites and the release flow so this is reproducible by anyone with the right Apple credentials.

**Files:**
- Create: `BUILD.md`

- [ ] **Step 1: Write BUILD.md**

`BUILD.md`:

```markdown
# CleanMode — Build, Sign, Notarize

This doc covers producing a signed + notarized release artifact (DMG + zip, per-arch).

## One-time prerequisites

1. **Apple Developer account.** $99/yr at developer.apple.com.
2. **Developer ID Application certificate** in your login keychain.
   - In Xcode → Settings → Accounts, select your team → "Manage Certificates" → "+ → Developer ID Application".
3. **App-specific password.** Generate one at appleid.apple.com → Sign-In and Security → App-Specific Passwords. **This is not your Apple ID password.**
4. **Xcode Command Line Tools** for the native build: `xcode-select --install`.

## One-time per-machine setup

```bash
git clone <this repo>
cd cleanmode
npm install
```

## Local dev

```bash
npm run electron:dev
```

If you change `electron/native/eventtap/eventtap.mm`, rebuild the native module:

```bash
npm run native:build-current
```

(Use `npm run native:build` to rebuild for both arm64 and x64; only needed before a release build.)

## Release build

Set the signing environment variables (typically in `~/.zshrc` or your shell profile, NOT committed):

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="ABCD123456"
export CSC_NAME="Developer ID Application: Your Name (ABCD123456)"
```

Then build:

```bash
# 1. Build native module for both arm64 and x64
npm run native:build

# 2. Build renderer
npm run build

# 3. Package, sign, and notarize
npm run electron:build
```

The release artifacts land in `release/` (or `dist/` depending on electron-builder's default — check the output).

## Verifying a release artifact

```bash
# Open and drag .app into /Applications, then:
codesign -dv --verbose=4 "/Applications/CleanMode.app"
# expect: Authority=Developer ID Application: <your name>
# expect: entitlements include device.input-monitoring

xcrun stapler validate "/Applications/CleanMode.app"
# expect: "The validate action worked!"
```

## What to do if notarization fails

`@electron/notarize` will print Apple's failure log. Common causes:
- Hardened runtime missing entitlement → fix `build/entitlements.mac.plist`.
- Unsigned nested binary (helper/framework) → check `electron-builder` logs for "skipping signing".
- App-specific password expired → regenerate at appleid.apple.com.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/mrbarkan/Development/cleanmode
git add BUILD.md
git commit -m "docs: add BUILD.md for sign and notarize flow"
```

---

### Task 18: Production build smoke test (no notarization)

Verify `npm run electron:build` produces both arm64 and x64 artifacts and that the .app launches before notarization is attempted.

**Files:** none modified (manual verification only)

- [ ] **Step 1: Build without notarize env vars**

Unset the notarize env vars to skip notarization (the hook will print "Skipping" and return):

```bash
cd /Users/mrbarkan/Development/cleanmode
unset APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID
npm run native:build
npm run electron:build
```

Expected: build completes without errors. `release/` (or `dist/`) contains:

```
CleanMode-1.0.0-arm64.dmg
CleanMode-1.0.0-arm64-mac.zip
CleanMode-1.0.0.dmg               (or x64-suffixed)
CleanMode-1.0.0-mac.zip
```

Two architectures × two formats. Confirm with `find . -maxdepth 3 -name 'CleanMode*.dmg' -o -name 'CleanMode*.zip'`.

- [ ] **Step 2: Confirm prebuilds were bundled**

```bash
cd /Users/mrbarkan/Development/cleanmode
# Mount the arm64 DMG, then:
find /Volumes/CleanMode*/CleanMode.app -name '*.node' 2>/dev/null
```

Expected: at least one `.node` file path inside `Contents/Resources/app.asar.unpacked` (or similar). If none, the `files` glob in `package.json` isn't picking up `prebuilds/`. Re-check Task 15.

- [ ] **Step 3: Launch the .app from /Applications (the path matters for Accessibility persistence)**

```bash
# Drag the CleanMode.app from the mounted DMG into /Applications, then:
open /Applications/CleanMode.app
```

If launching from /Applications shows a Gatekeeper warning, that's expected for an unsigned/un-notarized build — proceed for this smoke. Click "Open" if prompted.

Expected: app launches, Home screen visible, banner shows under Start button (Accessibility not granted to this fresh CleanMode.app yet — it's a different identity than dev-mode Electron).

- [ ] **Step 4: Smoke-grant Accessibility, enter cleaning mode, verify Fn keys block, unlock**

Same as Phase 3 dev smoke (Steps 2–7 of Task 13), but for the production app.

- [ ] **Step 5: Quit, eject DMGs, no commit**

If everything works, the build pipeline is correct. Notarization is the final piece — covered in Task 19.

---

### Task 19: Notarized release build

End-to-end: signed, notarized, stapled. This is the artifact users install.

**Files:** none modified (release operation)

- [ ] **Step 1: Set env vars**

```bash
export APPLE_ID="<your apple id>"
export APPLE_APP_SPECIFIC_PASSWORD="<your app-specific password>"
export APPLE_TEAM_ID="<your team id>"
export CSC_NAME="Developer ID Application: <your name> (<team id>)"
```

- [ ] **Step 2: Run release build**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run native:build
npm run electron:build
```

Expected: build runs, signing happens, then `[notarize] Submitting … for notarization (team …)` appears, followed by `[notarize] Done.` (this can take 1–5 minutes per arch). Final artifacts in `release/` (or wherever `electron-builder` configured).

If notarization fails, copy the error from the log and follow BUILD.md's "What to do if notarization fails" section.

- [ ] **Step 3: Verify signing**

```bash
cd /Users/mrbarkan/Development/cleanmode
# Mount one of the DMGs, then:
codesign -dv --verbose=4 "/Volumes/CleanMode*/CleanMode.app" 2>&1 | grep -E "Authority|entitlements"
```

Expected: at least one line mentioning `Developer ID Application: <your name>`. Entitlements section visible.

- [ ] **Step 4: Verify notarization staple**

```bash
cd /Users/mrbarkan/Development/cleanmode
xcrun stapler validate "/Volumes/CleanMode*/CleanMode.app"
```

Expected: `The validate action worked!`.

- [ ] **Step 5: Verify Gatekeeper acceptance**

Drag the .app from the DMG into `/Applications`. Launch from `/Applications`.

Expected: no "unidentified developer" Gatekeeper warning. App launches cleanly.

- [ ] **Step 6: No commit (release artifacts are not committed)**

---

## Phase 5 — Final manual test campaign

### Task 20: Run spec test plan A–F on the notarized build

Per the spec's test plan, sections A through F are launch-blocking. Run each on the notarized .app installed from `/Applications`.

**Files:** none modified

- [ ] **Step 1: A. Permission flow (4 cases from spec)**

  - [ ] A.1 — Fresh install, no prior grant → modal appears → [Open Settings] → grant → [Try Again] → enters cleaning mode.
  - [ ] A.2 — App launch with prior grant → no banner → click Start → enters directly.
  - [ ] A.3 — App launch with prior grant revoked (toggle CleanMode off in Accessibility, re-launch app) → banner appears → click Start → modal.
  - [ ] A.4 — Banner [Grant] from a clean install → System Settings opens to the right pane.

- [ ] **Step 2: B. Key blocking — the actual bug fix**

For each, verify the key does **nothing** while in cleaning mode (no system action triggers):

  - [ ] B.1 — F1 / F2 (brightness)
  - [ ] B.2 — F3 (Mission Control)
  - [ ] B.3 — F4 (Spotlight or Launchpad)
  - [ ] B.4 — F5 (dictation / keyboard backlight)
  - [ ] B.5 — F7 / F8 / F9 (media)
  - [ ] B.6 — F10 / F11 / F12 (volume)
  - [ ] B.7 — Fn alone
  - [ ] B.8 — Cmd+Tab, Cmd+Q, Cmd+W, Cmd+H, Cmd+Space, Cmd+Shift+3, Cmd+Shift+4
  - [ ] B.9 — Esc (does not exit fullscreen)
  - [ ] B.10 — Ripple animation fires on every keypress and click.

  Note: power button short-press will likely still sleep the Mac. This is documented as a known limitation in the spec.

- [ ] **Step 3: C. Unlock**

  - [ ] C.1 — Triple-Cmd combo unlocks. UI returns to Home. Fullscreen exits.
  - [ ] C.2 — Single Cmd+letter does not accidentally trigger combo.
  - [ ] C.3 — 2s window resets correctly between presses.
  - [ ] C.4 — Emergency unlock button (bottom-right, hover) unlocks immediately.

- [ ] **Step 4: D. Tap watchdog**

  - [ ] D.1 — Enter cleaning mode, idle 30s, then press F1 — still blocked.
  - [ ] D.2 — Activity Monitor: CleanMode shows near-zero CPU when idle.

- [ ] **Step 5: E. Build packaging — already verified in Task 19**

  - [ ] E.1–E.4 — already covered. Re-run only if you skipped Task 19 verification.

- [ ] **Step 6: F. Regression — existing features**

  - [ ] F.1 — Gemini cleaning-tips lookup works (with `API_KEY` set in `.env.local`; **note: variable name is `API_KEY`, not `GEMINI_API_KEY`** — see spec's "API-key gotcha" note).
  - [ ] F.2 — Theme toggle persists across launches.
  - [ ] F.3 — Device-model input persists across launches.
  - [ ] F.4 — All seven languages render without missing strings (cycle through each in the language picker).
  - [ ] F.5 — About modal opens, closes.

- [ ] **Step 7: G. Browser fallback (smoke, optional)**

  - [ ] G.1 — `npm run dev`, open in browser, click Start. UI enters cleaning mode (renderer-only blocking). Fn keys NOT blocked here (intended). Unlock combo still works.

- [ ] **Step 8: Launch decision**

If A–F all passed, the FN-key blocking work is shippable. Tag the release:

```bash
cd /Users/mrbarkan/Development/cleanmode
git tag -a v1.0.0-fn-blocking -m "FN-key blocking complete"
```

If anything in A–F failed, file a bug, fix, rebuild from Task 19, retest only the failing sections.

---

## Done

The FN-key blocking spec is fully implemented. The launch-blocking bug is fixed; the app produces signed + notarized DMGs that block all macOS Fn-mapped events while in Cleaning Mode.

Next: write the implementation plan for `2026-05-04-curated-catalog-ai-fallback-design.md`. That work is independent and can ship in a later release.
