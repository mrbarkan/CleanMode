# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server on `http://localhost:5173` (`strictPort: true`, must be free).
- `npm run type-check` — `tsc` in `noEmit` mode using `tsconfig.json` (`strict`, `noUnusedLocals`, `noUnusedParameters`). There is no test suite or linter configured.
- `npm run build` — Vite production build into `dist/`.
- `npm run preview` — Serve the built `dist/` for a quick smoke test.
- `npm run electron:dev` — Runs Vite and Electron concurrently (`wait-on` blocks until 5173 is up, then launches `electron .`).
- `npm run electron:build` — Vite build followed by `electron-builder` (config in `package.json` `build` block; macOS targets `dmg` + `zip`, app id `com.cleanmode.app`).

## Architecture

CleanMode is a Vite + React 19 + TypeScript app that ships as **both** a browser app and an Electron desktop app from the same `dist/` build. The Electron entry is `electron/main.js` (set as `package.json` `main`); the web entry is `index.tsx` → `App.tsx`.

### Two top-level UI states
`App.tsx` owns a single `isLocked` boolean that swaps between two screens:
- `components/Home.tsx` — configuration UI: device-model input, Gemini-powered cleaning-tips lookup, language picker, theme toggle, About modal.
- `components/CleaningMode.tsx` — fullscreen "locked" overlay shown while the user wipes the device.

Theme (`'dark' | 'light'`) and last-used device model are persisted to `localStorage` (`cleanmode-theme`, `cleanmode-model`).

### Input-blocking is layered (this is the core of the product)
When entering cleaning mode, **three independent blocking layers** are activated. They are intentionally redundant — browsers cannot block all OS-level shortcuts, so the Electron layers exist to plug those gaps. When changing this code, preserve all three layers and remember they all need to be torn down on unlock.

1. **Electron main process** (`electron/main.js`):
   - `ipcMain.on('set-cleaning-mode')` toggles `isCleaningMode`.
   - On enter: `setSimpleFullScreen(true)` on macOS (better than `setKiosk` for hiding OS UI), `setKiosk(true)` elsewhere; `setAlwaysOnTop(true, 'screen-saver')`; registers `globalShortcut` swallowers for F1–F24, Esc, Cmd/Ctrl+Q/W/H/R/P, Cmd+Shift+I, Alt+F4/Tab, and media keys.
   - `webContents.on('before-input-event')` `preventDefault`s every key while locked **except** `Meta` keys — those must reach the renderer so the unlock combo can be detected.
2. **Renderer Keyboard Lock API** (`CleaningMode.tsx` → `navigator.keyboard.lock()`) — captures system keys in browsers that support it (Chromium-based).
3. **Renderer window listeners** — `keydown`/`keyup`/`mousedown`/`contextmenu` with `preventDefault` + `stopPropagation`.

### Unlock combo
Press **both** `MetaLeft` and `MetaRight` simultaneously, three times within 2s (`resetTimer` in `CleaningMode.tsx`). On the third combo, `handleUnlockSequence` fires which (a) sends `setCleaningMode(false)` over IPC to undo the Electron-side lock, then (b) calls `onUnlock` to flip `App` back to `Home`. There is also a hidden "Emergency Unlock" button in the bottom-right that appears on hover.

### Renderer ↔ main IPC
The only bridge is `electron/preload.js`, which exposes `window.electron.setCleaningMode(isActive)` via `contextBridge`. `types/window.d.ts` declares the global. `window.electron` is `undefined` in the pure-browser build — both screens must check for it before calling.

### Gemini integration
`Home.tsx` calls `@google/genai` with `model: 'gemini-3-flash-preview'` and the `googleSearch` tool to get grounded, manufacturer-specific cleaning instructions. It reads grounding sources from `response.candidates[0].groundingMetadata.groundingChunks` and renders them as citations.

**API key wiring (gotcha):** `vite.config.ts` does `'process.env.API_KEY': JSON.stringify(env.API_KEY)`, and `Home.tsx` reads `process.env.API_KEY`. The README says to set `GEMINI_API_KEY` in `.env.local`, but the code path actually requires the variable to be named **`API_KEY`** (or change the Vite `define`). If tips fail with "API Key missing", this name mismatch is the likely cause. Vite inlines this at build time, so changing `.env.local` requires a dev-server restart / rebuild.

### Styling
Tailwind is loaded via the **CDN script in `index.html`** — there is no PostCSS/Tailwind config in the repo. Don't add a `tailwind.config.js`-based pipeline without removing the CDN script first. The Inter font is also pulled from Google Fonts in `index.html`. `index.html` also declares `.drag-region` (`-webkit-app-region: drag`) used by `Home.tsx`'s top strip so the Electron window can be dragged from the chromeless title area.

### i18n
`utils/translations.ts` exports a `t` object keyed by `Language` (`en | es | fr | de | zh | ja | pt`). All user-facing strings should go through `t[lang]`. The Gemini prompt also injects the selected language name so responses come back localized.
