<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

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

## Optional: maintaining the cleaning catalog

The catalog at `data/cleaning-catalog.json` is hand-authored. To draft new entries with AI assistance:

1. Set `API_KEY=<your-gemini-key>` in a local `.env.local` (gitignored).
2. Add device names to `data/catalog-seeds.json`.
3. Run `npm run seed:catalog` — drafts go to `data/_catalog-draft.json` for review.
4. Run `npm run translate:catalog` to fill in non-English languages.

Neither script is invoked at runtime. The shipping app contains no API keys and makes no network calls.
