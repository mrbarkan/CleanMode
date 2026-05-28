<div align="center">

# CleanMode

**Wipe down your Mac without it fighting back.**

CleanMode safely blocks your keyboard, trackpad, and system shortcuts while you clean — no accidental typing, brightness changes, Mission Control, or Spotlight. 100% on-device: no network calls, no API keys, no tracking.

[![Download](https://img.shields.io/github/v/release/mrbarkan/CleanMode?label=Download&style=for-the-badge)](https://github.com/mrbarkan/CleanMode/releases/latest)
&nbsp;
![Platform](https://img.shields.io/badge/macOS-10.12%2B-black?style=for-the-badge&logo=apple)
&nbsp;
![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)

</div>

---

## Download

Grab the latest build from the [**Releases page**](https://github.com/mrbarkan/CleanMode/releases/latest), or download directly:

| Your Mac | Download |
| --- | --- |
| **Apple Silicon** (M1/M2/M3/M4) | [CleanMode-1.0.0-arm64.dmg](https://github.com/mrbarkan/CleanMode/releases/download/v1.0.0/CleanMode-1.0.0-arm64.dmg) |
| **Intel** | [CleanMode-1.0.0.dmg](https://github.com/mrbarkan/CleanMode/releases/download/v1.0.0/CleanMode-1.0.0.dmg) |

> Not sure which one? Click  → **About This Mac**. "Apple M-series" means Apple Silicon; "Intel" means the Intel download.

## Install

1. Open the DMG and drag **CleanMode** into your **Applications** folder.
2. Launch it. The app is signed with a Developer ID and notarized by Apple, so it opens with **no Gatekeeper warning**.
3. On first use, macOS will ask for **Accessibility** and **Input Monitoring** permissions. These are required to absorb keyboard and trackpad input — CleanMode can't do its job without them.

## How to use

1. Click **Start Cleaning Mode**.
2. Wipe away — every keypress, click, and system shortcut is absorbed. Nothing reaches your apps.
3. **To unlock:** press **both ⌘ Command keys** at the same time, three times.

## Features

- **Catches what the browser can't.** A native macOS event tap absorbs OS-level shortcuts (brightness, Mission Control, Spotlight, media keys) that web apps simply cannot block.
- **Deliberate unlock.** A two-handed key combo means you'll never exit by accident mid-wipe.
- **Truly offline.** No network calls, no accounts, no API keys, no telemetry. Everything runs on your machine.
- **Themes.** Light (Linen) and dark (Cherry).
- **7 languages.** English, Spanish, French, German, Chinese, Japanese, and Portuguese.

## Requirements

- macOS 10.12 or later
- Apple Silicon or Intel

---

## For developers

CleanMode is a Vite + React + TypeScript app packaged with Electron.

```bash
npm install
npm run native:build-current   # build the native event-tap module for your arch
npm run electron:dev           # run the app
```

`data/cleaning-catalog.json` is a hand-authored catalog of Apple device cleaning instructions in 7 languages — edit the JSON directly and rebuild to change it.

For producing signed and notarized release artifacts, see [BUILD.md](BUILD.md).

## License

[MIT](LICENSE) © 2026 David Barkan
