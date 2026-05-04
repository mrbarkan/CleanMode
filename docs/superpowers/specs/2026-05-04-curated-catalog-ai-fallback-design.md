# CleanMode — Curated Catalog with Apple Intelligence Fallback

**Date:** 2026-05-04
**Status:** Design approved. Implementation planning to follow.
**Scope:** macOS only. Apple Silicon + macOS 26+ required for AI fallback; catalog works on all macOS.
**Relationship to other specs:** Independent of [`2026-05-04-fn-key-blocking-design.md`](./2026-05-04-fn-key-blocking-design.md). Either may ship first.

## Problem

The current "Smart Cleaning Guide" calls Google's Gemini API at runtime for every query. Five problems with this approach:

1. **Privacy** — user device queries leave the machine.
2. **API key handling** — the app needs an `API_KEY` env var; cost and key rotation become operational concerns.
3. **Reliability** — the app breaks when the API changes or the user is offline.
4. **Trust** — LLM output is unconstrained; cleaning advice for sensitive surfaces (nano-texture glass, Alcantara) needs to be verifiable.
5. **Apple-native polish** — the product would be more credible on macOS using Apple's own on-device intelligence.

## Solution overview

Replace the runtime cloud LLM with two layers, both on-device:

1. **Curated catalog** — bundled JSON file containing ~25 hand-authored entries covering current Apple devices, each citing an apple.com support URL. Handles the common case at zero runtime cost.
2. **Apple Intelligence fallback** — for catalog misses, an opt-in path that calls Apple's `FoundationModels` framework via a tiny bundled Swift helper. Uses `@Generable` typed output and refusal-first prompting. Same UI shape as catalog answers.
3. **Universal fallback** — when neither catalog nor AI produces a confident answer, generic safe cleaning steps with a "General guidance" badge.

The shipping app contains zero cloud calls, zero API keys, and no `@google/genai` dependency. Catalog growth happens out-of-band: a build-time review script ingests opt-in local query logs and drafts new catalog entries for human review.

## Architecture

```
data/
├── cleaning-catalog.json         # ~25 Apple devices, hand-authored, citable
└── universal-fallback.json       # generic safe steps, all 7 languages

utils/
├── catalogMatch.ts               # fuzzy matcher: query → entry | null
└── lookupGuide.ts                # orchestrator: catalog → AI → fallback

electron/
├── main.js                       # IPC for the intelligence helper
├── preload.js                    # exposes intelligence + settings APIs
└── intelligence/
    ├── index.js                  # JS wrapper, spawns helper, JSON over stdio
    └── helper/                   # Swift package
        ├── Package.swift
        ├── Sources/IntelligenceHelper/main.swift
        └── prebuilds/IntelligenceHelper      # signed arm64 binary

components/
├── Home.tsx                      # Gemini code REMOVED; uses lookupGuide()
├── AboutModal.tsx                # adds AI fallback toggle + diagnostics toggle
└── SourceBadge.tsx               # NEW — "Verified" / "AI-suggested" / "General"

scripts/
├── seed-catalog.ts               # build-time: AI-drafts catalog entries for review
├── translate-catalog.ts          # build-time: machine-translates English → 6 langs
├── review-ai-queries.ts          # build-time: ingests local query logs, drafts new entries
└── build-helper.sh               # builds + signs IntelligenceHelper

build/
└── helper-entitlements.plist     # NEW — minimal entitlements for the helper
```

### Roles

- **`cleaning-catalog.json`** — canonical, citable source of truth. ~25 Apple devices, each with localized cleaning steps, sensitivities list, and `sourceUrl` pointing to apple.com.
- **`catalogMatch.ts`** — fuzzy matching with normalized strings + alias expansion + Levenshtein distance. Returns the best match above a confidence threshold or `null`.
- **`lookupGuide.ts`** — single entry point used by `Home.tsx`. Tries catalog first; on miss, calls the AI helper if available + enabled; on miss, returns universal fallback. Always returns a `CleaningEntry` with a `source` discriminator.
- **Swift helper** — bundled binary in `Contents/Resources/`. Reads JSON request from stdin, writes JSON response to stdout, exits. Uses `LanguageModelSession` with a `@Generable` schema. Always available to refuse via `recognized: false`.
- **`intelligence/index.js`** — spawns and manages the helper per-query. Exposes `isAvailable()` and `generate(query, lang)`. Caches availability check for 1 hour.
- **`AboutModal`** — gains two toggles (AI fallback, diagnostics) and an availability status block.
- **`SourceBadge`** — three-variant pill component shown in the results header.

### What gets removed from the codebase

- `@google/genai` from `package.json` dependencies.
- `process.env.API_KEY` define from `vite.config.ts`.
- `generateTips`, the `sources` state, and the API-key check from `Home.tsx`.
- `.env.local` and the README API-key instructions.

### Key invariant: identical UI shape across all three sources

Catalog, AI, and fallback all render with the same layout, typography, and section structure. The only visual difference is the `SourceBadge` pill and the presence/absence of the "View Apple's official cleaning guide" link. This is the central design move: the AI feels like an extension of the catalog, not a separate feature.

## Catalog

### Schema

```ts
// utils/cleaningGuide.ts
export type Language = 'en' | 'es' | 'fr' | 'de' | 'zh' | 'ja' | 'pt';
type Localized = Record<Language, string>;

export type CleaningEntry = {
  id: string;                     // 'macbook-pro-14-m4' — kebab-case slug
  displayName: string;            // 'MacBook Pro 14" (M4, 2024)' — language-neutral
  aliases: string[];              // matching cheat sheet, lowercase
  surfaces: {
    keyboardTrackpad: Localized;
    screenShell: Localized;
  };
  sensitivities: Localized[];     // short labels, e.g. nano-texture glass
  sourceUrl?: string;             // apple.com/support/...; absent on AI/fallback
  source: 'catalog' | 'ai' | 'fallback';
};
```

`source` is set by `lookupGuide`, never by the catalog file itself. `sourceUrl` is structurally optional so AI/fallback don't have to fake one.

**`Localized` partial-fill convention.** Catalog entries and the universal fallback have all seven language keys populated. AI-sourced entries are populated only for the *requested* language (e.g., `{ja: "..."}` only). The renderer always reads `entry.surfaces.keyboardTrackpad[lang]` — this is safe by construction because the language passed to `lookupGuide` is the same language the renderer is currently displaying. This convention preserves the "identical UI shape" invariant without forcing the helper to translate into all seven languages.

### Catalog file format

```json
{
  "version": 1,
  "updatedAt": "2026-05-04",
  "entries": [
    { "id": "macbook-pro-14-m4", "displayName": "MacBook Pro 14\" (M4, 2024)", ... }
  ]
}
```

`version` and `updatedAt` are for human auditability and to preserve a future remote-update path (out of scope for v1).

### Coverage at launch

~25 entries: every current and recent-generation Apple device.

- MacBook Pro 14" / 16" — M3 and M4 generations
- MacBook Air 13" / 15" — M2 and M3 generations
- iMac 24" — M-series
- Mac mini — M2 / M4
- Mac Studio — M2 Ultra / M4 Max
- Magic Keyboard — with/without Touch ID, with/without numeric keypad
- Magic Trackpad
- Magic Mouse
- Studio Display
- Pro Display XDR

Each `keyboardTrackpad` and `screenShell` block caps at ~400 chars — long enough to be useful, short enough to read on the lock-screen overlay.

### Content sourcing

Two-stage build-time tooling, both run by you locally during authoring (never in the shipping app):

1. **`scripts/seed-catalog.ts`** — calls Gemini with `googleSearch` grounding to draft entries from manufacturer support pages. Output is a working file (e.g. `data/_catalog-draft.json`); does not modify `cleaning-catalog.json` directly.
2. **Human review** — every draft entry is reviewed by hand. Verify the apple.com URL, fix anything wrong, then commit to `cleaning-catalog.json`.

The current Gemini integration in `Home.tsx` is repurposed as the seed script's content engine, then deleted from the runtime. After launch, you re-run the seeder when new Apple products release.

### Translation

`scripts/translate-catalog.ts` translates each `Localized` field from English to the other six languages. Strict prompt: *"Translate the following cleaning instructions from English to {language}. Preserve every step, every product name, and every numeric measurement. Return only the translated text."* Output reviewed for obvious failure modes (missing line breaks, mistranslated product names) and committed.

Same pragmatic posture as the FN-key spec: machine translation acceptable for v1.

### Matching

`catalogMatch.ts`:

1. Normalize the query: lowercase, strip punctuation, collapse whitespace.
2. Compute Levenshtein-similarity score against `displayName` and every `alias` in every entry.
3. Track the best score per entry; return the highest-scoring entry if `score ≥ 0.7`, where `score = 1 - (levenshtein(a, b) / max(len(a), len(b)))`.
4. **Ambiguity rule:** if two entries are within 0.05 of each other above threshold, return `null` (ambiguous → AI/fallback).

The 0.7 threshold is tuned to catch typos but reject genuinely different devices ("ThinkPad X1" should not match any catalog entry).

## Apple Intelligence helper

### Swift package

```
electron/intelligence/helper/
├── Package.swift
└── Sources/IntelligenceHelper/main.swift   # ~120 LOC
```

`Package.swift`: `swift-tools-version: 6.0`, `platforms: [.macOS(.v26)]`, executable target `IntelligenceHelper`. Build product: signed binary, ~2 MB.

### `main.swift` — full source intent

```swift
import Foundation
import FoundationModels

@Generable
struct CleaningEntry {
  @Guide(description: "Whether you have specific manufacturer-recommended cleaning guidance for this exact Apple device. Set to false rather than guessing.")
  let recognized: Bool

  @Guide(description: "The display name of the device, e.g. 'MacBook Pro 14\" (M3, 2023)'. Empty if recognized is false.")
  let displayName: String

  @Guide(description: "Steps for cleaning the keyboard, trackpad, and internal surfaces. 4–8 short bullet steps. Empty if recognized is false.")
  let keyboardTrackpadInstructions: String

  @Guide(description: "Steps for cleaning the screen and outer shell. 4–8 short bullet steps. Empty if recognized is false.")
  let screenShellInstructions: String

  @Guide(description: "Specific material sensitivities for this device, e.g. 'nano-texture glass', 'alcantara'. Empty array if none or if recognized is false.")
  let sensitivities: [String]
}

struct Request: Decodable { let query: String; let language: String }
struct Response: Encodable { let ok: Bool; let entry: CleaningEntry?; let error: String? }

// Read request, check availability, run session, write response.
// On unavailable or error: ok=false, error="unavailable:..." or "model-error:...".
// On success: ok=true, entry=result.content.
// Always exits 0 (errors surface in JSON, not exit code).
```

The instructions string passed to `LanguageModelSession`:

> You are a specialized Apple device cleaning assistant. Given a user's device description, return manufacturer-aligned cleaning steps in language code `{language}`. If you do not have specific guidance for the exact device, set `recognized` to false. Never guess. Never invent product features. Never reference URLs.

The Swift helper never decides whether to use its own answer — it produces typed output and exits. The JS wrapper decides.

**Field-name mapping.** Swift fields `keyboardTrackpadInstructions` and `screenShellInstructions` are flat strings for the requested language. The JS wrapper translates these to the `CleaningEntry` shape: `entry.surfaces.keyboardTrackpad = {[lang]: helperResponse.keyboardTrackpadInstructions}` (per the partial-fill convention above). The Swift `sensitivities: [String]` array becomes `[Localized]` in the same way: `[{[lang]: s} for s in helperResponse.sensitivities]`.

### JS wrapper API

```js
intelligence.isAvailable();      // -> Promise<{available: boolean, reason?: string}>
intelligence.generate(query, lang); // -> Promise<{recognized: boolean, entry?: CleaningEntry}>
intelligence.dispose();           // -> void; called on app quit
```

`isAvailable()` checks:
1. `process.platform === 'darwin'` and macOS version `≥ 26.0`. If not: `{available: false, reason: 'platform-unsupported'}`.
2. Spawns helper with `--probe`; helper checks `SystemLanguageModel.default.availability`. Result cached for 1 hour in `localStorage` (`cleanmode-ai-availability-cache`).

`generate(query, lang)`:
1. Spawn fresh `IntelligenceHelper` subprocess.
2. Write `{query, language}` JSON to stdin, close stdin.
3. Read stdout to EOF. 10-second timeout (kills helper if exceeded).
4. Parse JSON. Returns `{recognized: true, entry}` if `ok && entry.recognized`; otherwise `{recognized: false}`.

### Per-query process model (no daemon)

A daemon would amortize Swift startup cost (~200ms) but introduces lifecycle bugs (zombies on Electron crash, IPC protocol versioning, harder to debug). The catalog handles the common case; AI is rare; per-query startup is invisible in a 2–5s response budget. **Per-query keeps the contract trivial.**

### Bundling & signing

`scripts/build-helper.sh`:

```bash
cd electron/intelligence/helper
swift build -c release --arch arm64
mkdir -p prebuilds
cp .build/arm64-apple-macosx/release/IntelligenceHelper prebuilds/
codesign --force --options runtime \
  --entitlements ../../../build/helper-entitlements.plist \
  --sign "$DEV_ID_APPLICATION" prebuilds/IntelligenceHelper
```

Run before `npm run electron:build`. The binary lives at `electron/intelligence/helper/prebuilds/IntelligenceHelper` and is bundled by the existing `files: ["electron/**/*"]` glob.

`build/helper-entitlements.plist`:

```xml
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict>
</plist>
```

The helper inherits notarization from the parent .app — `electron-builder` notarizes the whole bundle including nested binaries.

### Arm64 only

`FoundationModels` is Apple Silicon only. The Swift binary is arm64; the JS wrapper short-circuits `isAvailable()` to false on x64 Macs *before* attempting to spawn. Catalog still works fine on Intel — only the AI fallback is unavailable.

### Failure-mode handling

| Situation | Behavior |
|---|---|
| Intel Mac | `isAvailable() → false`. AboutModal: "Not available on this Mac. Requires Apple Silicon." Toggle disabled. |
| macOS < 26 | Same as above with version messaging. |
| Apple Intelligence not enabled | Helper returns `error: "unavailable:notReady"`. AboutModal: "Apple Intelligence not enabled" with deep-link to the Apple Intelligence pane in System Settings (exact URL scheme to be confirmed at implementation time — current best guess is `x-apple.systempreferences:com.apple.preference.intelligence`). |
| Model still downloading | Helper returns `error: "unavailable:downloading"`. AboutModal: "Apple Intelligence is downloading. Try again later." |
| Helper crash / 10s timeout | Treated as catalog miss → universal fallback. Logged to local diagnostics file (if opted-in). |
| Invalid JSON from helper | Same as crash path. |
| `recognized: false` | Treated as clean miss → universal fallback. **Not a failure.** |

User-facing rule: **the AI fallback either gives a confident answer or is invisible.** Errors never surface as red banners; they degrade to fallback.

## Renderer UI

### `Home.tsx` changes

The current `generateTips` function (existing lines 39–96) is deleted. Replaced with a thin `handleSearch`:

```tsx
const handleSearch = async () => {
  if (!deviceModel.trim()) return;
  setIsLoading(true);
  setError('');
  try {
    const guide = await lookupGuide(deviceModel, lang);
    setEntry(guide);
  } catch (e) {
    console.error(e);
    setError(text.fetchError);   // genuinely unexpected only
  } finally {
    setIsLoading(false);
  }
};
```

State changes:
- `tips: string` → `entry: CleaningEntry | null`
- `sources: Array<...>` → **deleted**
- `error` retained for unexpected failures (e.g., catalog file unreadable).

`onLock(tips)` keeps working — derive a single string from `entry` for the lock-screen overlay; no changes needed in `App.tsx` or `CleaningMode.tsx`.

### Results panel

Same layout as today (existing lines 310–350). Header gains a `SourceBadge`. The "View Apple's official cleaning guide" link renders at the bottom only when `entry.source === 'catalog' && entry.sourceUrl`.

### `SourceBadge.tsx`

Three small pills, each with icon + label. Tooltip on hover.

| `source` | Icon (lucide) | Label | Tooltip |
|---|---|---|---|
| `'catalog'` | `ShieldCheck` | Verified | Sourced from Apple's official cleaning guide |
| `'ai'` | `Sparkles` | AI-suggested | Generated on-device by Apple Intelligence |
| `'fallback'` | `Info` | General guidance | We don't have specific guidance for this device |

Color: green for catalog, blue (matches existing accent) for AI, neutral grey for fallback. Both dark and light themes follow existing `bg-*-500/10 border-*-500/20` patterns.

### Universal fallback content

Lives in `data/universal-fallback.json`. Same `CleaningEntry` shape, all 7 languages. Generic safe content that won't damage any Apple surface — power-off, soft lint-free cloth, water (or 70% IPA on cloth, never on device), straight strokes, air-dry.

### `AboutModal.tsx` additions

New section between version/changelog and the close button:

```
─── Apple Intelligence ─────────────────────────────────

[ ✓ ] Use Apple Intelligence for unknown devices
      Status: ● Available

      When you search for a device that's not in our verified
      catalog, Apple Intelligence will generate cleaning steps
      on-device. Nothing leaves your Mac.

[   ] Help improve CleanMode
      Locally log device queries we couldn't answer from the
      catalog. Nothing is uploaded — you can view or clear this
      log below.

      [ View log ]   [ Clear log ]
```

Status text varies based on `intelligence.isAvailable()` result (see Failure-mode handling table). When status is "Apple Intelligence not enabled," an *Enable in System Settings* button appears below status.

### Loading state

Existing `Loader2` spinner on the search button keeps working. Catalog hits resolve in < 5ms; AI hits in 2–5s. No streaming, no progress indicator.

### Error state

The existing red banner (lines 302–306) remains for genuinely unexpected failures. AI errors and helper crashes never reach this banner.

## Settings, telemetry, feedback loop

### Local diagnostic log

When AI fallback runs **and** `cleanmode-diagnostics-enabled` is true, JS wrapper appends one JSONL line to:

```
~/Library/Application Support/CleanMode/diagnostics/ai-queries.jsonl
```

Each line:

```json
{"ts":"2026-05-04T14:22:11Z","query":"thinkpad x1 carbon gen 11","lang":"en","recognized":false,"durationMs":2840}
```

**No device identifiers, no IPs, no machine info, no answer text.** Just the inputs that inform "what should I add to the catalog next." Auto-rotates at 10 MB (drops oldest 50%). User can view (opens in default text editor) or clear via AboutModal.

### Opt-in posture

The diagnostics toggle defaults **OFF**. Even though nothing leaves the machine, opt-in is the right posture for a closed-boundary product. The AI fallback toggle defaults **ON when available** because it's an in-session capability, not a data collection.

### Catalog growth workflow — `scripts/review-ai-queries.ts`

Build-time only, never in the shipping app.

1. Reads a `ai-queries.jsonl` file (your own log, or a contributor's submission).
2. Aggregates by normalized device identity.
3. Filters out queries that already match catalog entries above 0.6 (matcher-tuning signals — add as aliases to the existing entry, not new entries).
4. Sorts by frequency × recency.
5. For top N missing devices: calls `seed-catalog.ts` to draft entries; opens each draft in editor for review; commits approved entries to `cleaning-catalog.json`.

This script is what makes the architecture compelling: **the catalog is intentionally incomplete at launch; here's the system that keeps it honest.**

### Settings persistence — full list

| `localStorage` key | Type | Default | Purpose |
|---|---|---|---|
| `cleanmode-theme` | `'dark'\|'light'` | `'dark'` | existing |
| `cleanmode-model` | string | `''` | existing — last queried device |
| `cleanmode-language` | `Language` | derived from `navigator.language` | NEW — persists language choice |
| `cleanmode-ai-fallback` | bool | `true` if available | AI on/off |
| `cleanmode-diagnostics-enabled` | bool | `false` | opt-in logging |
| `cleanmode-ai-availability-cache` | `{value, expiresAt}` | unset | 1h TTL on availability probe |

### Rejected: remote telemetry, remote catalog updates

- **No remote upload of query log** — undermines the closed-boundary story. The diagnostic log is a self-improvement tool, not a data-collection tool.
- **No auto-update catalog from remote URL** — would open a network connection from the shipping app. If you want fast catalog updates, ship apps more often.
- **No in-app "suggest this device" button** — the diagnostic log captures this for free with zero clicks.

## Test plan

Manual checklist on each release candidate. Run on at least one Apple Silicon Mac with macOS 26+ (full coverage) and one Intel Mac or older macOS Mac (degraded-path coverage).

### A. Catalog matching

1. Exact hit → Verified badge, source URL link works.
2. Alias hit (e.g., "mbp 14 m4") → resolves correctly.
3. Typo within threshold (e.g., "macbok pro 14") → still resolves.
4. Below threshold (e.g., "thinkpad x1 carbon") → no catalog match.
5. Ambiguous (e.g., "macbook" alone) → does NOT pick arbitrary entry.
6. Empty input → search button disabled.
7. Each language renders the matched entry's localized content.

### B. AI fallback (Apple Silicon + macOS 26+)

1. Recognized non-catalogued device → AI returns `recognized: true`, AI-suggested badge.
2. Unknown device → helper returns `recognized: false` → universal fallback.
3. Refusal-first verification: non-electronics query (e.g., "my coffee mug") → fallback, not invented instructions.
4. Helper crash (corrupt the binary) → graceful fallthrough, no red banner.
5. 10s timeout enforcement (verify wrapper logic).
6. Two queries in a row → both succeed with separate processes.
7. Language fidelity: search in Japanese for an uncatalogued device → response in Japanese.

### C. Apple Intelligence availability

1. Apple Silicon + macOS 26 + AI enabled → "● Available", toggle on, fallback works.
2. Apple Silicon + macOS 26 + AI disabled in System Settings → "Apple Intelligence not enabled", *Enable* button deep-links correctly.
3. Apple Silicon + macOS 26 + model downloading → "downloading. Try again later."
4. Apple Silicon + macOS < 26 → "Not available on this Mac. Requires macOS 26 or later."
5. Intel Mac → "Not available on this Mac. Requires Apple Silicon." Catalog still works.
6. Toggle off in any state → AI never invoked, misses go directly to fallback.

### D. Source attribution

1. Catalog answer → green Verified badge, tooltip, source URL link visible.
2. AI answer → blue AI-suggested badge, on-device tooltip, no source link.
3. Fallback → neutral General guidance badge, "we don't have specific guidance" tooltip, no source link.
4. Badge persists across language change (re-renders content but same source).

### E. Settings & persistence

1. AI fallback toggle persists across restart.
2. Diagnostics toggle persists; verify writes only happen when ON.
3. View log opens file in default editor.
4. Clear log truncates (verify `wc -l` returns 0).
5. Log auto-rotates at 10 MB.
6. Language persists across restart.

### F. Privacy verification — the closed boundary

**Use Little Snitch / `lsof -p <pid>` / equivalent to verify zero network connections.**

1. App launch → no outbound connections from CleanMode or child processes.
2. Catalog hit → none.
3. AI fallback hit → **none** (Apple Intelligence runs on-device).
4. About modal opens → none.
5. `grep -r "googleapis\|@google/genai\|process.env.API_KEY" .` against built `app.asar` → zero matches.
6. `.env.local` is ignored or absent in the build output.

### G. Build pipeline

1. `scripts/build-helper.sh` produces signed `IntelligenceHelper`. `codesign -dv` confirms `Developer ID Application` authority.
2. `npm run electron:build` bundles helper into `CleanMode.app/Contents/.../IntelligenceHelper`.
3. `xcrun stapler validate` passes for both .app and helper.
4. Catalog file is bundled and current.
5. `seed-catalog.ts` runs locally with Gemini key in env; writes to working file only, not catalog.
6. `translate-catalog.ts` runs locally; produces 6 language outputs from English source.
7. `review-ai-queries.ts` runs locally; ingests sample log, drafts new entries.

### H. Regression — FN-key spec & existing features

1. CGEventTap from FN-key spec still works; AI fallback toggle has no effect on key blocking.
2. Existing `localStorage` keys preserved across version upgrade.
3. Version/changelog area still renders.
4. Theme toggle still works.
5. All seven languages render existing UI strings (new keys are additive).
6. Browser fallback (`npm run dev` in browser): catalog works; AI `isAvailable()` returns false; universal fallback works for unknown devices.

### Launch criterion

Shippable when **A–F** all pass on at least one Apple Silicon Mac with macOS 26+, with **F (privacy)** verified using a network monitor. **G** is build-pipeline correctness; **H** is regression coverage. Test on Intel/older macOS if available, but Apple Silicon + macOS 26 is the primary target.

### Not tested

- Apple Intelligence response quality. Mitigated by `recognized: false` and the universal fallback.
- Performance benchmarks beyond "feels acceptable" (catalog < 5ms, AI 2–5s).
- Localization quality. Machine translations get a once-over only.

## Out of scope

- Multi-backend AI choice (Gemini / Ollama / etc. as user-selectable). Apple Intelligence only.
- In-app model download UI.
- Streaming responses.
- Remote catalog updates.
- Remote query-log uploads.
- In-app "suggest this device" button.
- Mac App Store distribution (CGEventTap from the FN-key spec is incompatible with MAS — the AI catalog work alone could ship to MAS, but the apps move together).

## Cross-cutting notes

### API-key gotcha (independent of this work)

The existing `vite.config.ts` defines `process.env.API_KEY` while the README tells users to set `GEMINI_API_KEY`. After this spec is implemented, the gotcha disappears entirely — both the define and the env var are removed. Worth noting: any pre-launch testing that involves the *current* Gemini code must use `API_KEY` (not `GEMINI_API_KEY`) in `.env.local`.

### Authoring loop preserves the Gemini code path *temporarily*

The current `Home.tsx` Gemini integration is the seed for `scripts/seed-catalog.ts`. The implementation plan should:

1. Build `seed-catalog.ts` first by lifting the Gemini call out of `Home.tsx` into a script.
2. Run the script to populate `cleaning-catalog.json`.
3. Then strip the runtime Gemini code from `Home.tsx`.

This avoids losing the working Gemini integration before the catalog is seeded.

### Shipping order with the FN-key spec

The two specs are independent. Either may ship first. Recommended order:

1. **FN-key spec first** — it fixes a real bug; the app is launch-blocked on it.
2. **Catalog + AI spec second** — feature improvement; the app is functional without it (current Gemini code keeps working).

If both ship in the same release: the runtime Gemini code is removed and the catalog is fully seeded before that release; otherwise the FN-key release ships with current Gemini behavior intact.
