# CleanMode — Fn Key Blocking & Launch-Readiness

**Date:** 2026-05-04
**Status:** Design approved. Implementation planning to follow.
**Scope:** macOS only. Direct distribution (signed + notarized DMG/zip).

## Problem

In Cleaning Mode, the Mac function keys still trigger their system actions (brightness, volume, Mission Control, Spotlight, Launchpad, dictation, media). This blocks launch.

Existing blocking layers — Electron `globalShortcut`, `webContents.on('before-input-event')`, and the renderer's `navigator.keyboard.lock()` plus window-level `keydown` listeners — cannot intercept these events. On macOS, F-keys with the default keyboard preference produce IOKit / `NSSystemDefined` events that are dispatched below the keyboard event path Electron sees. There is no `globalShortcut` accelerator name for brightness, Mission Control, Spotlight, Launchpad, or dictation.

## Solution overview

Add a native macOS event tap (`CGEventTap` at `kCGSessionEventTap`, active mode) that intercepts both standard keyboard events and `NSSystemDefined` events and drops everything except the Cmd (Meta) keys. The tap requires Accessibility permission, which the user grants in System Settings → Privacy & Security → Accessibility.

The existing blocking layers remain in place as defense in depth.

## Architecture

```
electron/
├── main.js                # gains permission gate + tap lifecycle
├── preload.js             # gains 4 new IPC channels
└── native/
    └── eventtap/
        ├── binding.gyp    # node-gyp config (arm64 + x64, AppKit/ApplicationServices/Carbon)
        ├── eventtap.mm    # Objective-C++ — CGEventTap implementation
        ├── package.json   # local module manifest, declares prebuildify
        ├── prebuilds/     # checked-in prebuilt binaries (arm64 + x64)
        └── index.js       # JS wrapper, no-ops on non-Darwin

components/
├── Home.tsx               # gains permission banner + Start handler change
└── AccessibilityModal.tsx # new — denied-permission modal

scripts/
└── notarize.js            # afterSign hook for @electron/notarize

build/
└── entitlements.mac.plist # new — hardened-runtime entitlements
```

### Roles

- **`eventtap.mm`** — owns the CGEventTap and run-loop source. Listens to `kCGEventKeyDown | kCGEventKeyUp | kCGEventFlagsChanged | NSEventMaskSystemDefined` (event type 14). Returns `NULL` for everything except Meta keys. Re-enables tap on `kCGEventTapDisabledByTimeout` / `…ByUserInput`. Exposes 4 N-API functions: `start`, `stop`, `isAccessibilityTrusted`, `promptAccessibility`.
- **`main.js`** — gates entry to cleaning mode on Accessibility permission. Drives tap lifecycle alongside existing kiosk + globalShortcut layers.
- **`preload.js`** — exposes `enterCleaningMode`, `exitCleaningMode`, `checkAccessibility`, `promptAccessibility`.
- **`Home.tsx`** — pre-flights permission via `enterCleaningMode()` before flipping `isLocked`. Shows passive permission banner when Accessibility is not granted. Shows `AccessibilityModal` on denied entry.
- **`CleaningMode.tsx`** — mount-time `setCleaningMode(true)` removed; entry now happens in `Home`'s pre-flight. Unlock paths call `exitCleaningMode()`.

### Key invariant

The tap drops every key event **except** `kVK_Command` (0x37) and `kVK_RightCommand` (0x36) keydown / keyup / flagsChanged. Meta-passthrough preserves the renderer's existing triple-Cmd unlock combo without changing renderer logic.

## Native module

### Public JS API

```js
const tap = require('./native/eventtap');

tap.isAccessibilityTrusted();   // bool, no prompt
tap.promptAccessibility();       // bool, triggers OS dialog + opens Settings pane
tap.start();                     // bool (success). Creates tap. Idempotent.
tap.stop();                      // void. Destroys tap. Idempotent.
```

The wrapper short-circuits on non-Darwin platforms: `isAccessibilityTrusted` and `start` return `true`, `stop` is a no-op. This keeps `npm run electron:dev` working on Linux/Windows dev machines (the kiosk + globalShortcut path runs unchanged there).

### Tap creation

```objc
CGEventMask mask =
    CGEventMaskBit(kCGEventKeyDown)        |
    CGEventMaskBit(kCGEventKeyUp)          |
    CGEventMaskBit(kCGEventFlagsChanged)   |
    CGEventMaskBit(NX_SYSDEFINED);   // event type 14

CFMachPortRef tap = CGEventTapCreate(
    kCGSessionEventTap,            // not HID — session level is correct for a user-facing app
    kCGHeadInsertEventTap,
    kCGEventTapOptionDefault,      // ACTIVE — return NULL to drop
    mask,
    callback,
    NULL
);
```

`kCGSessionEventTap` (not `kCGHIDEventTap`) is intentional. HID-level requires root and adds no capability we need; session-level is what Accessibility permission unlocks for normal apps and sees everything we want to suppress.

### Callback drop logic

```objc
CGEventRef callback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *_) {
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        CGEventTapEnable(g_tap, true);
        return event;
    }
    if (type == kCGEventKeyDown || type == kCGEventKeyUp || type == kCGEventFlagsChanged) {
        CGKeyCode kc = (CGKeyCode)CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);
        if (kc == kVK_Command || kc == kVK_RightCommand) return event;
    }
    return NULL;   // drop F-keys, brightness, volume, Mission Control, Spotlight, etc.
}
```

The watchdog re-enable on `…DisabledByTimeout` is mandatory: macOS auto-disables a tap whose callback exceeds ~1s. Without re-enabling, the tap silently dies the first time the callback stalls.

### Lifecycle

`start()` creates the tap, attaches it to the run loop (`CFRunLoopAddSource`), enables it. `stop()` invalidates the run-loop source and releases the port. `app.on('will-quit')` is a safety net rather than the primary disposal path. Permission is checked before `start()` returns success; if `CGEventTapCreate` returns `NULL` (Accessibility revoked between check and start), `start()` returns `false`.

## IPC protocol

### `preload.js`

```js
contextBridge.exposeInMainWorld('electron', {
  enterCleaningMode:   () => ipcRenderer.invoke('enter-cleaning-mode'),
  exitCleaningMode:    () => ipcRenderer.send('exit-cleaning-mode'),
  checkAccessibility:  () => ipcRenderer.invoke('check-accessibility'),
  promptAccessibility: () => ipcRenderer.invoke('prompt-accessibility'),
});
```

### `main.js` handlers

```js
ipcMain.handle('enter-cleaning-mode', async () => {
  if (!tap.isAccessibilityTrusted()) {
    tap.promptAccessibility();
    return { ok: false, error: 'accessibility-denied' };
  }
  if (!tap.start()) return { ok: false, error: 'tap-failed' };

  isCleaningMode = true;
  if (process.platform === 'darwin') mainWindow.setSimpleFullScreen(true);
  else mainWindow.setKiosk(true);
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.focus();
  BLOCKED_KEYS.forEach(k => globalShortcut.register(k, () => false));
  return { ok: true };
});

ipcMain.on('exit-cleaning-mode', () => {
  isCleaningMode = false;
  tap.stop();
  globalShortcut.unregisterAll();
  mainWindow.setAlwaysOnTop(false);
  if (process.platform === 'darwin') mainWindow.setSimpleFullScreen(false);
  else mainWindow.setKiosk(false);
});

ipcMain.handle('check-accessibility',  () => tap.isAccessibilityTrusted());
ipcMain.handle('prompt-accessibility', () => tap.promptAccessibility());
```

The existing `'set-cleaning-mode'` channel is removed.

## Renderer UI

### Permission banner

Rendered in `Home.tsx` directly under the Start button when `await checkAccessibility()` returned `false`. Amber/warning styling, reusing existing `bg-*-500/10 border-*-500/20` patterns.

> ⚠ Mac function keys won't be blocked. CleanMode needs Accessibility permission. **[Grant]**

`[Grant]` calls `promptAccessibility()`. Banner persists for the app session; clears on next launch or after a successful entry into cleaning mode.

### `AccessibilityModal`

New component modeled on `AboutModal`. Shown when `enterCleaningMode()` returns `{ ok: false, error: 'accessibility-denied' }`. Copy:

> **Accessibility Permission Required**
>
> CleanMode needs Accessibility permission to block Mac brightness, volume, Mission Control, and Spotlight keys while you clean.
>
> 1. Open System Settings → Privacy & Security → Accessibility
> 2. Enable CleanMode in the list
> 3. Click Try Again below
>
> **[Open Settings]**   **[Try Again]**

`[Open Settings]` → `promptAccessibility()`. `[Try Again]` → re-invokes `enterCleaningMode()`; on success, modal closes and we transition to `<CleaningMode>`.

### Start-button handler (replaces `Home.tsx` line 161 `onClick`)

```tsx
const handleStart = async () => {
  const result = await window.electron?.enterCleaningMode?.() ?? { ok: true };
  if (result.ok) {
    onLock(tips);
  } else if (result.error === 'accessibility-denied') {
    setIsAccessibilityModalOpen(true);
  } else {
    setError(text.fetchError);   // tap-failed → existing red banner
  }
};
```

The `?? { ok: true }` keeps the browser fallback working: when `window.electron` is undefined (web build), Start enters cleaning mode using only renderer-side blocking, as it does today.

### `CleaningMode.tsx` changes

- Mount-time `window.electron.setCleaningMode(true)` call **deleted**.
- Unlock and emergency-unlock paths call `window.electron.exitCleaningMode()`.

### i18n

Seven new keys added to `utils/translations.ts`:

```ts
accessibilityBannerTitle, accessibilityBannerBody, accessibilityGrant,
accessibilityModalTitle,  accessibilityModalBody,  accessibilityOpenSettings,
accessibilityTryAgain
```

All seven languages get the seven new keys before launch (49 short strings — machine translation is acceptable for v1; the existing translations were not professionally reviewed either). The current `t[lang]` lookup pattern in `utils/translations.ts` has no fallback layer, so missing keys would render as `undefined`; the implementation must either add a small `translate(lang, key)` helper that falls back to English, or ensure no key is missing per language. The latter is simpler.

## Build, packaging, code-signing

### Native build

`prebuildify` produces arm64 + x64 prebuilt binaries committed to `electron/native/eventtap/prebuilds/`. The runtime loader uses `node-gyp-build` to pick the right slice. `prebuildify --napi` builds against the Node-API ABI, which is stable across Electron versions — no `@electron/rebuild` step needed at install time.

New scripts in `package.json`:

```json
"native:build": "cd electron/native/eventtap && prebuildify --napi --strip --arch arm64+x64",
"postinstall":  "cd electron/native/eventtap && node-gyp-build || true"
```

`postinstall`'s trailing `|| true` is intentional — non-Mac contributors should be able to `npm install` without the native build erroring out.

### Entitlements

New file `build/entitlements.mac.plist`:

```xml
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
  <key>com.apple.security.device.input-monitoring</key><true/>
</dict>
</plist>
```

The first three are standard for Electron apps under Hardened Runtime. `device.input-monitoring` is documentation that future-proofs against macOS tightening rules around event taps. **There is no entitlement for Accessibility** — that's a runtime user grant.

### `package.json` `build` block

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
    "entitlements":        "build/entitlements.mac.plist",
    "entitlementsInherit": "build/entitlements.mac.plist",
    "notarize": false
  },
  "directories": { "buildResources": "build" },
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

Per-arch DMGs (not a universal binary) — universal doubles the download for users who only need one slice.

### Notarization

`scripts/notarize.js` uses `@electron/notarize` and reads `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` from the environment. These go in a local `.env` ignored by git. Required prerequisites on the signing machine:

- Apple Developer account
- "Developer ID Application" certificate in the login keychain
- App-specific password from appleid.apple.com (not the Apple ID password)

A `BUILD.md` documenting these prerequisites is part of the implementation work.

### New devDependencies

`@electron/notarize`, `prebuildify`, `node-gyp-build`, `node-gyp`, `node-addon-api`.

### Dev-mode caveat

In `npm run electron:dev`, the app runs as plain `Electron.app`. Accessibility permission is granted to "Electron" in System Settings, separate from the eventual signed CleanMode app. Devs grant it once for Electron, and again for CleanMode after first installing the notarized build.

## Defense-in-depth

The CGEventTap is the new primary blocking mechanism. The existing layers are preserved as fallbacks:

1. Electron `globalShortcut` for F1–F24, Esc, Cmd combos, media keys.
2. `webContents.on('before-input-event')` blocking everything except Meta.
3. Renderer `navigator.keyboard.lock()`.
4. Renderer window listeners (`keydown`/`keyup`/`mousedown`/`contextmenu` with `preventDefault`).

If Accessibility is revoked mid-session, the tap dies silently but layers 1–4 keep basic blocking working until the user does the unlock combo. Detecting mid-session revocation and showing a warning is a v1.1 polish.

## Test plan

Manual verification on at least one Apple Silicon Mac and one Intel Mac per release candidate. No automated tests — every test would require a real Mac with real permission grants.

### A. Permission flow

1. Fresh install, no prior grant. Click Start → modal appears. Click [Open Settings] → System Settings opens to Accessibility, CleanMode is in the list, toggle off. Toggle on. Click [Try Again] → enters cleaning mode.
2. App launch with prior grant. No banner. Click Start → enters directly.
3. App launch with prior grant revoked. Banner appears. Click Start → modal.
4. Banner [Grant] from a clean install opens System Settings to the right pane.

### B. Key blocking — the bug fix

In cleaning mode on a Mac with default keyboard settings, each of these does nothing:

- F1 / F2 (brightness)
- F3 (Mission Control)
- F4 (Spotlight or Launchpad)
- F5 (dictation / keyboard backlight)
- F7 / F8 / F9 (media controls)
- F10 / F11 / F12 (volume)
- Fn alone
- Cmd+Tab, Cmd+Q, Cmd+W, Cmd+H, Cmd+Space, Cmd+Shift+3, Cmd+Shift+4
- Esc (does not exit fullscreen)
- Power button short-press will likely still sleep — documented limitation.

Ripple animation fires on every keypress and click.

### C. Unlock

1. Triple-Cmd combo unlocks. UI returns to Home. Fullscreen exits. AlwaysOnTop releases.
2. Single Cmd+letter does not accidentally fire the combo.
3. 2s window resets correctly between presses.
4. Emergency unlock button (bottom-right, hover) unlocks immediately.

### D. Tap watchdog

1. Enter cleaning mode, idle 30s, press F1 — still blocked.
2. Activity Monitor shows near-zero CPU when idle.

### E. Build / packaging

1. `npm run electron:build` produces arm64 and x64 DMGs. Each opens cleanly on the matching architecture.
2. Gatekeeper: drag .app to /Applications, launch — no "unidentified developer" dialog.
3. `xcrun stapler validate "CleanMode.app"` returns success.
4. `codesign -dv --verbose=4 "CleanMode.app"` shows `Developer ID Application` authority and `device.input-monitoring` in the entitlements.

### F. Regression — existing features

1. Gemini cleaning-tips lookup still works (with `API_KEY` set).
2. Theme toggle persists across launches.
3. Device-model input persists across launches.
4. All seven languages render without missing strings.
5. About modal opens and closes.

### G. Browser fallback (smoke)

`npm run dev` and open in a browser. Click Start → enters cleaning mode using only renderer-side blocking. Fn keys won't be blocked here (intended). Unlock combo still works.

### Launch criterion

A release candidate is shippable when **A through F** all pass on at least one Apple Silicon and one Intel Mac.

## Out of scope

- Mid-session Accessibility revocation detection and user warning (v1.1 polish).
- Mac App Store distribution — incompatible with `CGEventTap`.
- Windows / Linux native event blocking — those builds run with the existing layers only.
- Universal (fat) binary — shipping per-arch DMGs instead.
- Automated tests for native blocking.

## Existing API-key gotcha (independent of this work)

Worth noting because it will surface during launch testing: `vite.config.ts` defines `process.env.API_KEY` (not `GEMINI_API_KEY`). The README tells users to set `GEMINI_API_KEY`. For Gemini lookups to work in the released build, the env var name in `.env.local` must be `API_KEY`, or the README and vite.config need to be reconciled. Recommend fixing as part of this launch sweep.
