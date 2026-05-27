# CleanMode

A macOS app that safely blocks keyboard, trackpad, and system shortcuts while you wipe down your Mac — without triggering brightness, Mission Control, Spotlight, or accidental typing.

## Run Locally

**Prerequisites:**  Node.js, macOS

1. Install dependencies:
   `npm install`
2. Build the native event-tap module:
   `npm run native:build-current`
3. Run the app:
   `npm run electron:dev`

## Cleaning catalog

`data/cleaning-catalog.json` is a hand-authored catalog of Apple device cleaning instructions in 7 languages. To add or update entries, edit the JSON directly and rebuild. The app makes no network calls and uses no API keys.
