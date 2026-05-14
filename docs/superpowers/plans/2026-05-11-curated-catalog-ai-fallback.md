# Curated Catalog + Apple Intelligence Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the runtime Gemini cleaning-tips feature with a closed-boundary, on-device alternative: a curated catalog of ~25 Apple devices plus an optional Apple Intelligence fallback for unknown devices. After this work, the shipping app contains zero cloud calls and zero API keys; Gemini becomes a build-time authoring tool only.

**Architecture:** `Home.tsx` calls `lookupGuide(query, lang)` which tries the catalog first (fuzzy match), then optionally the AI helper (Apple Intelligence via a bundled Swift binary), then a universal generic fallback. All three sources return the same `CleaningEntry` shape and render identically except for a `SourceBadge` pill.

**Tech Stack:** React 19, TypeScript, Vite, Electron 30, Swift 6 (`FoundationModels` framework on macOS 26+ — Apple Silicon only), Node 22, Gemini SDK (build-time only).

**Spec:** `docs/superpowers/specs/2026-05-04-curated-catalog-ai-fallback-design.md`

**Sequencing constraint from the spec:**
> Build `seed-catalog.ts` first by lifting the Gemini call out of `Home.tsx` into a script. Then strip the runtime Gemini code from `Home.tsx`. This avoids losing the working Gemini integration before the catalog is seeded.

**Phases that can run on any macOS (Phases 1–4):**
1. Foundation types + utilities
2. Catalog content + translation tooling
3. Renderer rewrite (Gemini removed)
4. First dev-mode smoke test (catalog + universal fallback work, no AI)

**Phases that require macOS 26 + Apple Silicon to compile and test (Phases 5–7):**
5. Swift helper for Apple Intelligence
6. AI wiring (IPC + JS wrapper + UI toggles)
7. Final test campaign including AI path

Phase 5+ tasks are marked **DEFERRED until macOS 26** in their headings. The plan structure ensures Phases 1–4 produce a shippable v1.0 of the catalog feature even if the AI helper is added later.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `utils/cleaningGuide.ts` | `CleaningEntry`, `Permissions`-style types for the lookup result |
| `utils/catalogMatch.ts` | Fuzzy matcher: query → entry \| null |
| `utils/lookupGuide.ts` | Orchestrator: catalog → AI → fallback |
| `data/cleaning-catalog.json` | Curated Apple-device catalog |
| `data/universal-fallback.json` | Generic safe cleaning steps, all 7 languages |
| `data/catalog-seeds.json` | Device IDs the seed script knows how to expand |
| `components/SourceBadge.tsx` | "Verified" / "AI-suggested" / "General guidance" pill |
| `scripts/seed-catalog.ts` | Build-time: Gemini-drafts entries for review |
| `scripts/translate-catalog.ts` | Build-time: machine-translates English entries to 6 langs |
| `scripts/review-ai-queries.ts` | Build-time: ingests diagnostic log, drafts catalog additions |
| `electron/intelligence/index.js` | JS wrapper around the Swift helper |
| `electron/intelligence/helper/Package.swift` | Swift package manifest |
| `electron/intelligence/helper/Sources/IntelligenceHelper/main.swift` | Swift helper source |
| `electron/intelligence/helper/prebuilds/IntelligenceHelper` | Signed helper binary (gitignored) |
| `scripts/build-helper.sh` | Builds + signs the Swift helper |
| `build/helper-entitlements.plist` | Helper's minimal entitlements |

### Modified files

| Path | Change |
|---|---|
| `components/Home.tsx` | Remove `generateTips`, `sources`, `tips` (string) state. Use `lookupGuide`. Render `SourceBadge`. |
| `components/AboutModal.tsx` | Add AI fallback toggle + diagnostics toggle + Apple Intelligence status block |
| `utils/translations.ts` | Add 12 new i18n keys × 7 languages |
| `electron/main.js` | Add 3 IPC channels for intelligence helper |
| `electron/preload.js` | Expose `intelligence` API |
| `types/window.d.ts` | Add `intelligence` shape under `Window.electron` |
| `package.json` | Remove `@google/genai` from runtime deps (lifted to devDeps); add `dotenv` for scripts; new files glob; new scripts |
| `vite.config.ts` | Remove `process.env.API_KEY` define |
| `.env.local` | Removed (no longer needed at runtime) |
| `README.md` | Update — remove API key instructions |
| `.gitignore` | Add `electron/intelligence/helper/.build/`, `data/_catalog-draft.json` |

### Files NOT changing

- `App.tsx` (passes `tips: string` to `CleaningMode`; we derive it from the `CleaningEntry`)
- `index.html`, `index.tsx`, `tsconfig.json`
- `components/CleaningMode.tsx`, `components/Toaster.tsx`, `components/PermissionsModal.tsx`
- `electron/native/eventtap/*`
- `electron/preload.js` (keeps the existing FN-key surface intact; only adds the intelligence channel)
- `utils/changelog.ts` (separate bump for the release)
- `BUILD.md` (separate update when notarization happens)

---

## Phase 1 — Foundation types and utilities

### Task 1: `CleaningEntry` types + Language re-export

**Files:**
- Create: `utils/cleaningGuide.ts`

- [ ] **Step 1: Write the types file**

`utils/cleaningGuide.ts`:

```ts
import type { Language } from './translations';

export type Localized = Record<Language, string>;

export type CleaningEntry = {
  id: string;                     // 'macbook-pro-14-m4' — kebab-case slug
  displayName: string;            // 'MacBook Pro 14" (M4, 2024)' — language-neutral
  aliases: string[];              // lowercase, normalized matching cheat sheet
  surfaces: {
    keyboardTrackpad: Partial<Localized>;
    screenShell: Partial<Localized>;
  };
  sensitivities: Partial<Localized>[];
  sourceUrl?: string;             // apple.com/support/...; absent on AI/fallback
  source: 'catalog' | 'ai' | 'fallback';
};

export type CatalogFile = {
  version: number;
  updatedAt: string;
  entries: CleaningEntry[];
};

// Helper: render a single language's text from a CleaningEntry, falling back
// to English when the requested language wasn't authored for this entry
// (AI entries only populate the requested language).
export function localized(field: Partial<Localized>, lang: Language): string {
  return field[lang] ?? field.en ?? '';
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run type-check
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add utils/cleaningGuide.ts
git commit -m "feat(catalog): add CleaningEntry types"
```

---

### Task 2: Universal fallback content

**Files:**
- Create: `data/universal-fallback.json`

- [ ] **Step 1: Create the data directory and fallback file**

```bash
cd /Users/mrbarkan/Development/cleanmode
mkdir -p data
```

`data/universal-fallback.json`:

```json
{
  "id": "universal-fallback",
  "displayName": "General guidance",
  "aliases": [],
  "surfaces": {
    "keyboardTrackpad": {
      "en": "• Power off the device and disconnect from power\n• Use a soft, lint-free cloth lightly dampened with water\n• Wipe surfaces gently — never spray liquid directly on the device\n• For stubborn marks, dampen the cloth (not the device) with 70% isopropyl alcohol\n• Allow to air-dry completely before reconnecting power\n• Do not use bleach, ammonia-based cleaners, or abrasive materials",
      "es": "• Apaga el dispositivo y desconéctalo de la corriente\n• Usa un paño suave y sin pelusas ligeramente humedecido con agua\n• Limpia las superficies suavemente — nunca rocíes líquido directamente sobre el dispositivo\n• Para manchas difíciles, humedece el paño (no el dispositivo) con alcohol isopropílico al 70%\n• Deja secar al aire completamente antes de reconectar\n• No uses lejía, limpiadores con amoníaco ni materiales abrasivos",
      "fr": "• Éteignez l'appareil et débranchez-le\n• Utilisez un chiffon doux non pelucheux légèrement humidifié à l'eau\n• Essuyez les surfaces délicatement — ne vaporisez jamais de liquide directement sur l'appareil\n• Pour les taches tenaces, humidifiez le chiffon (pas l'appareil) avec de l'alcool isopropylique à 70%\n• Laissez sécher à l'air avant de rebrancher\n• N'utilisez pas d'eau de Javel, de nettoyants à base d'ammoniaque ni de matériaux abrasifs",
      "de": "• Gerät ausschalten und vom Strom trennen\n• Weiches, fusselfreies Tuch leicht mit Wasser anfeuchten\n• Oberflächen sanft abwischen — niemals Flüssigkeit direkt auf das Gerät sprühen\n• Bei hartnäckigen Flecken Tuch (nicht das Gerät) mit 70% Isopropylalkohol anfeuchten\n• Vor dem erneuten Anschließen vollständig an der Luft trocknen lassen\n• Keine Bleichmittel, ammoniakhaltige Reiniger oder scheuernde Materialien verwenden",
      "zh": "• 关闭设备并断开电源\n• 使用稍微沾水的柔软无绒布\n• 轻轻擦拭表面 — 切勿直接向设备喷洒液体\n• 对于顽固污渍,用 70% 异丙醇沾湿布(而非设备)\n• 重新连接前让其完全风干\n• 请勿使用漂白剂、氨基清洁剂或研磨材料",
      "ja": "• デバイスの電源を切り、電源を外す\n• 水で軽く湿らせた柔らかい糸くずの出ない布を使用\n• 表面を優しく拭く — デバイスに直接液体を吹き付けないでください\n• 頑固な汚れには、デバイスではなく布に70%イソプロピルアルコールを含ませる\n• 再接続する前に完全に空気乾燥させる\n• 漂白剤、アンモニア系クリーナー、研磨剤は使用しないでください",
      "pt": "• Desligue o dispositivo e desconecte da energia\n• Use um pano macio e sem fiapos levemente umedecido com água\n• Limpe as superfícies com cuidado — nunca pulverize líquido diretamente no dispositivo\n• Para marcas difíceis, umedeça o pano (não o dispositivo) com álcool isopropílico 70%\n• Deixe secar ao ar completamente antes de reconectar\n• Não use alvejante, produtos com amônia ou materiais abrasivos"
    },
    "screenShell": {
      "en": "• Use a microfiber cloth slightly dampened with water\n• Wipe in straight strokes — avoid circular motions and pressure\n• For shells and outer surfaces, the same cloth works\n• For stubborn marks on glass, dampen the cloth with 70% isopropyl alcohol — never directly on the device\n• Avoid getting moisture in any openings",
      "es": "• Usa un paño de microfibra ligeramente humedecido con agua\n• Limpia con movimientos rectos — evita movimientos circulares y la presión\n• El mismo paño sirve para carcasas y superficies exteriores\n• Para marcas difíciles en cristal, humedece el paño con alcohol isopropílico al 70% — nunca directamente sobre el dispositivo\n• Evita que entre humedad en cualquier abertura",
      "fr": "• Utilisez un chiffon en microfibre légèrement humidifié à l'eau\n• Essuyez en mouvements droits — évitez les mouvements circulaires et la pression\n• Le même chiffon convient pour les coques et surfaces extérieures\n• Pour les taches tenaces sur le verre, humidifiez le chiffon avec de l'alcool isopropylique à 70% — jamais directement sur l'appareil\n• Évitez de mettre de l'humidité dans les ouvertures",
      "de": "• Mikrofasertuch leicht mit Wasser anfeuchten\n• In geraden Strichen wischen — kreisende Bewegungen und Druck vermeiden\n• Dasselbe Tuch eignet sich für Gehäuse und Außenflächen\n• Bei hartnäckigen Flecken auf Glas Tuch mit 70% Isopropylalkohol anfeuchten — niemals direkt auf das Gerät\n• Keine Feuchtigkeit in Öffnungen eindringen lassen",
      "zh": "• 使用稍微沾水的超细纤维布\n• 沿直线擦拭 — 避免圆形动作和压力\n• 同一块布适用于外壳和外表面\n• 对于玻璃上的顽固污渍,用 70% 异丙醇沾湿布 — 切勿直接接触设备\n• 避免水分进入任何开口",
      "ja": "• 水で軽く湿らせたマイクロファイバークロスを使用\n• 直線的に拭く — 円形の動きや圧力は避ける\n• ケースや外側の表面にも同じ布が使えます\n• ガラスの頑固な汚れには、デバイスではなく布に70%イソプロピルアルコールを含ませる\n• 開口部に水分が入らないように注意",
      "pt": "• Use um pano de microfibra levemente umedecido com água\n• Limpe com movimentos retos — evite movimentos circulares e pressão\n• O mesmo pano serve para carcaças e superfícies externas\n• Para marcas difíceis no vidro, umedeça o pano com álcool isopropílico 70% — nunca diretamente no dispositivo\n• Evite que a umidade entre em qualquer abertura"
    }
  },
  "sensitivities": [],
  "source": "fallback"
}
```

- [ ] **Step 2: Validate JSON**

```bash
cd /Users/mrbarkan/Development/cleanmode
node -e "JSON.parse(require('fs').readFileSync('data/universal-fallback.json'))" && echo "JSON valid"
```

Expected: `JSON valid`.

- [ ] **Step 3: Commit**

```bash
git add data/universal-fallback.json
git commit -m "feat(catalog): add universal fallback content (7 langs)"
```

---

### Task 3: Catalog matcher

**Files:**
- Create: `utils/catalogMatch.ts`

- [ ] **Step 1: Write the matcher**

`utils/catalogMatch.ts`:

```ts
import type { CleaningEntry } from './cleaningGuide';

const MATCH_THRESHOLD = 0.7;
const AMBIGUITY_DELTA = 0.05;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const v0 = new Array(b.length + 1);
  const v1 = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

export type MatchResult = {
  entry: CleaningEntry;
  score: number;
};

export function bestMatch(query: string, entries: CleaningEntry[]): CleaningEntry | null {
  const q = normalize(query);
  if (!q) return null;

  const scored: MatchResult[] = entries.map(entry => {
    const candidates = [entry.displayName, ...entry.aliases].map(normalize);
    const score = Math.max(...candidates.map(c => similarity(q, c)));
    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0 || scored[0].score < MATCH_THRESHOLD) return null;
  if (scored.length >= 2 && scored[0].score - scored[1].score < AMBIGUITY_DELTA) {
    return null;  // ambiguous → caller routes to AI/fallback
  }
  return scored[0].entry;
}
```

- [ ] **Step 2: Smoke-test the matcher**

```bash
cd /Users/mrbarkan/Development/cleanmode
node --experimental-strip-types -e "
import { bestMatch } from './utils/catalogMatch.ts';
const entries = [
  { id: 'mbp14', displayName: 'MacBook Pro 14\"', aliases: ['mbp 14', 'macbook pro 14'], surfaces: { keyboardTrackpad: {}, screenShell: {} }, sensitivities: [], source: 'catalog' },
  { id: 'mba13', displayName: 'MacBook Air 13\"', aliases: ['mba 13', 'air 13'], surfaces: { keyboardTrackpad: {}, screenShell: {} }, sensitivities: [], source: 'catalog' },
];
console.log('exact:', bestMatch('MacBook Pro 14', entries)?.id);
console.log('typo:', bestMatch('macbok pro 14', entries)?.id);
console.log('alias:', bestMatch('mbp 14', entries)?.id);
console.log('unknown:', bestMatch('thinkpad x1', entries)?.id ?? 'null');
console.log('ambiguous:', bestMatch('macbook 13', entries)?.id ?? 'null');
"
```

Expected output (or similar — the ambiguous result depends on exact scores):
```
exact: mbp14
typo: mbp14
alias: mbp14
unknown: null
```

If your Node version doesn't support `--experimental-strip-types`, skip this smoke test and rely on the type-check + manual testing later. The matcher logic is straightforward.

- [ ] **Step 3: Type-check**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run type-check
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add utils/catalogMatch.ts
git commit -m "feat(catalog): add fuzzy matcher with Levenshtein + ambiguity rule"
```

---

### Task 4: `lookupGuide` orchestrator (catalog + fallback only)

The AI path will be wired in later (Task 21). For now, `lookupGuide` only knows about catalog and universal fallback.

**Files:**
- Create: `utils/lookupGuide.ts`

- [ ] **Step 1: Write the orchestrator**

`utils/lookupGuide.ts`:

```ts
import type { CleaningEntry, CatalogFile } from './cleaningGuide';
import type { Language } from './translations';
import { bestMatch } from './catalogMatch';
import catalogRaw from '../data/cleaning-catalog.json';
import fallbackRaw from '../data/universal-fallback.json';

const catalog = catalogRaw as CatalogFile;
const fallback = fallbackRaw as CleaningEntry;

export async function lookupGuide(query: string, _lang: Language): Promise<CleaningEntry> {
  const match = bestMatch(query, catalog.entries);
  if (match) return { ...match, source: 'catalog' };

  // AI path will be inserted here in Task 21.

  return { ...fallback, displayName: query.trim() || fallback.displayName, source: 'fallback' };
}
```

The function is `async` from the start because the AI path will need `await`. Returning the universal fallback uses the user's query as the displayed name so the result still reads as "Tips for `<their query>`".

Note: `_lang` parameter is unused for now (catalog and fallback are pre-localized at render time). It exists so the signature is stable for Task 21 when we add the AI call.

- [ ] **Step 2: Stub the catalog so the import succeeds**

`data/cleaning-catalog.json` doesn't exist yet (Task 7 creates it). Create an empty stub so the type-check passes:

```bash
cd /Users/mrbarkan/Development/cleanmode
cat > data/cleaning-catalog.json <<'EOF'
{
  "version": 1,
  "updatedAt": "2026-05-11",
  "entries": []
}
EOF
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run type-check
```

Expected: exits 0. If JSON import errors complain about types, ensure `resolveJsonModule: true` is in `tsconfig.json` (it already is).

- [ ] **Step 4: Commit**

```bash
git add utils/lookupGuide.ts data/cleaning-catalog.json
git commit -m "feat(catalog): add lookupGuide orchestrator (catalog + fallback only)"
```

---

## Phase 2 — Catalog content and tooling

### Task 5: Seed-catalog script (Gemini lifted from `Home.tsx`)

This script lifts the existing Gemini integration in `Home.tsx` (`generateTips`) into a build-time tool. The user runs it locally when they want to draft new catalog entries.

**Files:**
- Create: `scripts/seed-catalog.ts`
- Create: `data/catalog-seeds.json`
- Modify: `package.json` (add `dotenv` to devDependencies, add `seed:catalog` script)
- Modify: `.gitignore` (add `data/_catalog-draft.json`)

- [ ] **Step 1: Move `@google/genai` from `dependencies` to `devDependencies`**

In `/Users/mrbarkan/Development/cleanmode/package.json`:

Find this block in `"dependencies"`:
```json
"@google/genai": "^1.37.0",
```

Move it into `"devDependencies"` (keep all other deps in their current locations). Also add `dotenv`:

```json
"devDependencies": {
    "@electron/notarize": "^2.5.0",
    "@google/genai": "^1.37.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.2.3",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^4.2.1",
    "concurrently": "^8.2.2",
    "dotenv": "^16.4.5",
    "electron": "^30.0.1",
    ...
}
```

(`@types/node` may already be transitively available; install explicitly so the script's `process.env` and `fs` imports type-check cleanly.)

In `"scripts"`, add:

```json
"seed:catalog": "tsx scripts/seed-catalog.ts",
"translate:catalog": "tsx scripts/translate-catalog.ts",
"review:ai-queries": "tsx scripts/review-ai-queries.ts"
```

Add `tsx` to devDependencies (TypeScript runner for scripts):

```json
"tsx": "^4.16.0"
```

- [ ] **Step 2: Add `data/_catalog-draft.json` to .gitignore**

Append to `/Users/mrbarkan/Development/cleanmode/.gitignore`:

```
data/_catalog-draft.json
```

- [ ] **Step 3: Install the new deps**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm install
```

Expected: install completes. The native module postinstall warning (if any) is harmless.

- [ ] **Step 4: Write the seed list**

`data/catalog-seeds.json`:

```json
{
  "devices": [
    "MacBook Pro 14\" (M4, 2024)",
    "MacBook Pro 16\" (M4 Pro, 2024)",
    "MacBook Air 13\" (M3, 2024)",
    "MacBook Air 15\" (M3, 2024)",
    "iMac 24\" (M4, 2024)",
    "Mac mini (M4, 2024)",
    "Mac Studio (M4 Max, 2025)",
    "Magic Keyboard with Touch ID and Numeric Keypad",
    "Magic Keyboard with Touch ID",
    "Magic Keyboard (no Touch ID)",
    "Magic Trackpad",
    "Magic Mouse",
    "Studio Display",
    "Pro Display XDR"
  ]
}
```

These are the 14 devices we'll seed initially. The plan separately includes hand-written entries for 5 representative devices in Task 7; the seed script exists for ongoing expansion / regeneration after Apple ships new hardware.

- [ ] **Step 5: Write the seed script**

`scripts/seed-catalog.ts`:

```ts
#!/usr/bin/env -S npx tsx

// scripts/seed-catalog.ts — build-time tool. NOT bundled into the shipping app.
// Drafts cleaning catalog entries from a list of Apple device names using Gemini
// with googleSearch grounding. Writes to data/_catalog-draft.json for human review.

import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Set API_KEY (or GEMINI_API_KEY) in .env.local before running.');
  process.exit(1);
}

const seedsPath = resolve(process.cwd(), 'data/catalog-seeds.json');
const draftPath = resolve(process.cwd(), 'data/_catalog-draft.json');
const seeds = JSON.parse(readFileSync(seedsPath, 'utf-8')) as { devices: string[] };

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function draftEntry(ai: GoogleGenAI, deviceName: string) {
  const prompt = `Device: "${deviceName}"
Task: Produce CleanMode catalog content for this specific Apple device.

Output STRICTLY in this format (no preamble, no markdown headers, just two labeled sections):

KEYBOARD_TRACKPAD:
[4-8 short bullet steps for safely cleaning keyboard, trackpad, and internal surfaces of THIS device. Use bullets starting with •. ~400 chars total.]

SCREEN_SHELL:
[4-8 short bullet steps for screen and outer shell of THIS device. ~400 chars total.]

SENSITIVITIES:
[Comma-separated list of materials/coatings that need special care on THIS specific device (e.g. "nano-texture glass", "alcantara"). Empty string if none.]

SOURCE_URL:
[A single apple.com URL with manufacturer cleaning guidance for this device, or "" if none.]`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      systemInstruction: 'You are a specialized electronics cleaning assistant. Be accurate and concise. Only include manufacturer-documented guidance.',
      tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text || '';
  const kbMatch = /KEYBOARD_TRACKPAD:\s*([\s\S]*?)(?:SCREEN_SHELL:|$)/.exec(text);
  const scMatch = /SCREEN_SHELL:\s*([\s\S]*?)(?:SENSITIVITIES:|$)/.exec(text);
  const seMatch = /SENSITIVITIES:\s*([\s\S]*?)(?:SOURCE_URL:|$)/.exec(text);
  const urMatch = /SOURCE_URL:\s*(\S.*?)(?:\n|$)/.exec(text);

  return {
    id: slugify(deviceName),
    displayName: deviceName,
    aliases: [],
    surfaces: {
      keyboardTrackpad: { en: kbMatch?.[1]?.trim() || '' },
      screenShell:      { en: scMatch?.[1]?.trim() || '' },
    },
    sensitivities: (seMatch?.[1] || '')
      .split(',').map(s => s.trim()).filter(Boolean)
      .map(s => ({ en: s })),
    sourceUrl: urMatch?.[1]?.trim() || undefined,
    source: 'catalog' as const,
  };
}

async function main() {
  const ai = new GoogleGenAI({ apiKey });
  const drafts = [];

  for (const device of seeds.devices) {
    console.log(`Drafting: ${device}`);
    try {
      const entry = await draftEntry(ai, device);
      drafts.push(entry);
    } catch (err) {
      console.error(`  failed: ${(err as Error).message}`);
    }
  }

  writeFileSync(draftPath, JSON.stringify({ entries: drafts }, null, 2));
  console.log(`\nWrote ${drafts.length} draft entries to ${draftPath}`);
  console.log('REVIEW each entry, then merge approved ones into data/cleaning-catalog.json.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 6: Smoke-test that the script's import path resolves (don't run it yet)**

```bash
cd /Users/mrbarkan/Development/cleanmode
npx tsx -e "console.log('tsx ok')"
```

Expected: prints `tsx ok`. No need to actually run the seed script — it's documentation for the user to run when they want to expand the catalog. Initial entries come from Task 7 directly.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json scripts/seed-catalog.ts data/catalog-seeds.json .gitignore
git commit -m "feat(catalog): add build-time seed script (Gemini lifted from runtime)"
```

---

### Task 6: Translation script

This script reads `data/cleaning-catalog.json`, finds entries with only English content, and produces translated versions for the other 6 languages. Output replaces the catalog file in place.

**Files:**
- Create: `scripts/translate-catalog.ts`

- [ ] **Step 1: Write the script**

`scripts/translate-catalog.ts`:

```ts
#!/usr/bin/env -S npx tsx

// scripts/translate-catalog.ts — fills in missing language translations for
// entries in data/cleaning-catalog.json using Gemini. In-place update.

import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Set API_KEY (or GEMINI_API_KEY) in .env.local before running.');
  process.exit(1);
}

const catalogPath = resolve(process.cwd(), 'data/cleaning-catalog.json');
const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));

const TARGET_LANGS: Array<{ code: string; name: string }> = [
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'zh', name: 'Chinese (Simplified)' },
  { code: 'ja', name: 'Japanese' },
  { code: 'pt', name: 'Portuguese' },
];

async function translate(ai: GoogleGenAI, english: string, targetLang: string): Promise<string> {
  if (!english.trim()) return '';
  const prompt = `Translate the following cleaning instructions from English to ${targetLang}.
Preserve every step, every product name (keep "Apple", "iMac", "MacBook Pro", etc. in English), every numeric measurement, and the bullet structure (lines starting with •).
Return ONLY the translated text. No preamble. No explanations.

English:
${english}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
  });

  return (response.text || '').trim();
}

async function fillEntry(ai: GoogleGenAI, entry: any) {
  for (const lang of TARGET_LANGS) {
    if (!entry.surfaces.keyboardTrackpad[lang.code]) {
      console.log(`  ${entry.id} → ${lang.code} (keyboardTrackpad)`);
      entry.surfaces.keyboardTrackpad[lang.code] = await translate(
        ai, entry.surfaces.keyboardTrackpad.en || '', lang.name);
    }
    if (!entry.surfaces.screenShell[lang.code]) {
      console.log(`  ${entry.id} → ${lang.code} (screenShell)`);
      entry.surfaces.screenShell[lang.code] = await translate(
        ai, entry.surfaces.screenShell.en || '', lang.name);
    }
    for (const s of entry.sensitivities) {
      if (!s[lang.code] && s.en) {
        s[lang.code] = await translate(ai, s.en, lang.name);
      }
    }
  }
}

async function main() {
  const ai = new GoogleGenAI({ apiKey });
  for (const entry of catalog.entries) {
    console.log(`Translating: ${entry.id}`);
    await fillEntry(ai, entry);
  }
  catalog.updatedAt = new Date().toISOString().slice(0, 10);
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
  console.log(`\nDone. ${catalogPath} updated.`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run type-check
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/translate-catalog.ts
git commit -m "feat(catalog): add translation script for 6 non-English languages"
```

---

### Task 7: Initial English catalog content (5 representative entries)

Write 5 hand-authored entries directly. These cover the most common Apple device categories and exercise every code path (sensitivities, source URLs, aliases). Other devices fall through to AI or universal fallback for v1; the user can expand with the seed script.

**Files:**
- Modify: `data/cleaning-catalog.json`

- [ ] **Step 1: Replace the stub catalog with 5 entries**

Overwrite `/Users/mrbarkan/Development/cleanmode/data/cleaning-catalog.json` with:

```json
{
  "version": 1,
  "updatedAt": "2026-05-11",
  "entries": [
    {
      "id": "macbook-pro-14-m4",
      "displayName": "MacBook Pro 14\" (M4, 2024)",
      "aliases": [
        "mbp 14 m4",
        "mbp14 m4",
        "macbook pro 14 m4",
        "macbook pro 14 inch m4",
        "macbook pro m4 14",
        "mbp 14 2024"
      ],
      "surfaces": {
        "keyboardTrackpad": {
          "en": "• Shut down the MacBook Pro and unplug all cables\n• Use a soft, lint-free cloth — slightly damp with water only\n• Wipe the keyboard, palm rest, and trackpad in straight strokes\n• For stubborn marks, dampen the cloth with 70% isopropyl alcohol — never spray liquid directly\n• Do not let moisture enter any opening, including between keys\n• Allow to air-dry fully before reconnecting power"
        },
        "screenShell": {
          "en": "• Use a polishing cloth or clean microfiber, slightly damp with water\n• Wipe screen in straight strokes — never use household glass cleaners, ammonia, or abrasives\n• For the aluminum shell, same cloth — water only, then a dry cloth to finish\n• If the device has nano-texture glass, use ONLY the Apple polishing cloth that shipped with it — water only, never alcohol\n• Avoid getting moisture in vents or the speaker grille"
        }
      },
      "sensitivities": [
        { "en": "nano-texture glass option — Apple polishing cloth + water only" }
      ],
      "sourceUrl": "https://support.apple.com/en-us/102213",
      "source": "catalog"
    },
    {
      "id": "macbook-air-m3",
      "displayName": "MacBook Air 13\" (M3, 2024)",
      "aliases": [
        "mba 13 m3",
        "mba13 m3",
        "macbook air 13 m3",
        "macbook air m3",
        "macbook air 2024"
      ],
      "surfaces": {
        "keyboardTrackpad": {
          "en": "• Shut down the MacBook Air and unplug the power adapter\n• Use a soft, lint-free cloth lightly dampened with water\n• Wipe the keyboard and trackpad in straight strokes\n• For stubborn marks, dampen the cloth with 70% isopropyl alcohol — never directly on the device\n• Do not let liquid enter between the keys or any opening\n• Let surfaces air-dry completely before powering on"
        },
        "screenShell": {
          "en": "• Use a soft microfiber cloth, very lightly dampened with water\n• Wipe the Liquid Retina display in straight strokes\n• Never use ammonia-based or abrasive cleaners\n• The aluminum shell can be wiped with the same damp cloth, finished with a dry cloth\n• Keep liquid away from the camera, speakers, and ports"
        }
      },
      "sensitivities": [],
      "sourceUrl": "https://support.apple.com/en-us/102213",
      "source": "catalog"
    },
    {
      "id": "imac-24-m4",
      "displayName": "iMac 24\" (M4, 2024)",
      "aliases": [
        "imac 24",
        "imac m4",
        "imac 24 m4",
        "imac 2024",
        "all in one"
      ],
      "surfaces": {
        "keyboardTrackpad": {
          "en": "• Unplug the Magic Keyboard or Magic Trackpad if wired; otherwise just turn them off\n• Wipe with a soft, lint-free cloth slightly damp with water\n• For stubborn marks, dampen the cloth with 70% isopropyl alcohol\n• Never spray liquid directly on the peripheral\n• Allow to air-dry before turning back on"
        },
        "screenShell": {
          "en": "• Power off the iMac and unplug it\n• Use a polishing cloth or clean microfiber, slightly damp with water\n• Wipe in straight strokes — never use ammonia, bleach, or abrasive cleaners\n• If the iMac has nano-texture glass, use ONLY the Apple polishing cloth that shipped with it, with water only\n• The chin / back can be wiped with the same damp cloth, finished dry"
        }
      },
      "sensitivities": [
        { "en": "nano-texture glass option — Apple polishing cloth + water only" }
      ],
      "sourceUrl": "https://support.apple.com/en-us/102213",
      "source": "catalog"
    },
    {
      "id": "magic-keyboard-touch-id",
      "displayName": "Magic Keyboard with Touch ID",
      "aliases": [
        "magic keyboard touch id",
        "magic keyboard with touch id",
        "apple keyboard touch id",
        "magic keyboard"
      ],
      "surfaces": {
        "keyboardTrackpad": {
          "en": "• Disconnect or turn off the keyboard\n• Wipe the keys with a soft, lint-free cloth slightly damp with water\n• For stubborn marks, dampen the cloth with 70% isopropyl alcohol — never directly on the keys\n• Use a dry cloth on the Touch ID sensor — avoid moisture on the sensor surface\n• Allow to dry completely before reconnecting"
        },
        "screenShell": {
          "en": "• The aluminum body can be wiped with the same lightly damp cloth used on the keys\n• Avoid liquid near the Touch ID sensor or USB-C port\n• Finish with a dry cloth"
        }
      },
      "sensitivities": [
        { "en": "Touch ID sensor — keep moisture and alcohol off the sensor surface" }
      ],
      "sourceUrl": "https://support.apple.com/en-us/102213",
      "source": "catalog"
    },
    {
      "id": "magic-trackpad",
      "displayName": "Magic Trackpad",
      "aliases": [
        "magic trackpad",
        "apple trackpad",
        "trackpad"
      ],
      "surfaces": {
        "keyboardTrackpad": {
          "en": "• Disconnect or turn off the trackpad\n• Wipe the glass surface with a soft, lint-free cloth slightly damp with water\n• For stubborn marks, dampen the cloth with 70% isopropyl alcohol — never spray directly\n• Avoid getting liquid into the USB-C port or seams\n• Allow to dry completely before reconnecting"
        },
        "screenShell": {
          "en": "• The aluminum underside can be wiped with the same lightly damp cloth\n• Finish with a dry cloth"
        }
      },
      "sensitivities": [],
      "sourceUrl": "https://support.apple.com/en-us/102213",
      "source": "catalog"
    }
  ]
}
```

- [ ] **Step 2: Validate JSON**

```bash
cd /Users/mrbarkan/Development/cleanmode
node -e "const c = require('./data/cleaning-catalog.json'); console.log('entries:', c.entries.length); for (const e of c.entries) console.log(' -', e.id, '|', e.displayName);"
```

Expected:
```
entries: 5
 - macbook-pro-14-m4 | MacBook Pro 14" (M4, 2024)
 - macbook-air-m3 | MacBook Air 13" (M3, 2024)
 - imac-24-m4 | iMac 24" (M4, 2024)
 - magic-keyboard-touch-id | Magic Keyboard with Touch ID
 - magic-trackpad | Magic Trackpad
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run type-check
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add data/cleaning-catalog.json
git commit -m "feat(catalog): add 5 initial English entries (Apple devices)"
```

---

### Task 8: Fill in non-English translations

The user runs `npm run translate:catalog` once to fan out the 5 English entries into all 7 languages. This requires their existing `API_KEY` in `.env.local`.

**Files:**
- Modify: `data/cleaning-catalog.json` (in place by the script)

- [ ] **Step 1: Confirm `.env.local` has an API key**

```bash
cd /Users/mrbarkan/Development/cleanmode
ls -la .env.local 2>&1
cat .env.local 2>&1 | head -3
```

Expected: file exists. Contents should have a line like `API_KEY=...` or `GEMINI_API_KEY=...`. (Either name works — the script accepts both.) If the key is `PLACEHOLDER_API_KEY` from the original repo, the user must replace it with a real Gemini key. If neither key works, the user can hand-translate the entries instead (10 strings × 6 languages = 60 strings).

- [ ] **Step 2: Run the translation script**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run translate:catalog
```

Expected output (over 1–2 minutes):
```
Translating: macbook-pro-14-m4
  macbook-pro-14-m4 → es (keyboardTrackpad)
  macbook-pro-14-m4 → es (screenShell)
  ...
Done. /Users/mrbarkan/Development/cleanmode/data/cleaning-catalog.json updated.
```

If the script fails (rate limit, API issues), retry. It's idempotent — already-translated fields are skipped on re-runs.

- [ ] **Step 3: Spot-check translations**

```bash
cd /Users/mrbarkan/Development/cleanmode
node -e "const c = require('./data/cleaning-catalog.json'); console.log('First entry languages:'); console.log(Object.keys(c.entries[0].surfaces.keyboardTrackpad).sort());"
```

Expected:
```
[ 'de', 'en', 'es', 'fr', 'ja', 'pt', 'zh' ]
```

Then open `data/cleaning-catalog.json` in your editor, look at the Japanese / Chinese versions of `entries[0].surfaces.keyboardTrackpad`. They should be coherent translations — no English bleed-through, bullet structure preserved.

If you spot obvious problems (e.g., wrong product name, missing bullets), either:
- Edit by hand in the JSON file
- Or delete the bad translation and re-run `npm run translate:catalog` (it'll regenerate just the missing ones)

- [ ] **Step 4: Commit**

```bash
git add data/cleaning-catalog.json
git commit -m "feat(catalog): translate 5 entries to 6 non-English languages"
```

---

## Phase 3 — Renderer rewrite

### Task 9: New i18n keys for the renderer

**Files:**
- Modify: `utils/translations.ts`

The new UI strings: source badges, the AI section in AboutModal, diagnostics toggle copy, status messages. Per the spec's i18n section, all 7 languages get the same keys (machine-translated, light human review).

- [ ] **Step 1: Add 12 new keys per language**

For each of the 7 language blocks in `utils/translations.ts`, add the following keys before the closing `}`. Use Edit to insert into each block. Here are the English values; below are the values for the other languages.

**English (`en`):**
```ts
badgeVerified: "Verified",
badgeAi: "AI-suggested",
badgeFallback: "General guidance",
tipsViewSource: "View Apple's official cleaning guide",
aiSectionTitle: "Apple Intelligence",
aiToggleLabel: "Use Apple Intelligence for unknown devices",
aiToggleDescription: "When you search for a device that isn't in our verified catalog, Apple Intelligence will generate cleaning steps on-device. Nothing leaves your Mac.",
aiStatusAvailable: "● Available",
aiStatusUnavailablePlatform: "● Not available on this Mac. Requires Apple Silicon and macOS 26 or later.",
aiStatusNotEnabled: "● Apple Intelligence not enabled in System Settings",
aiStatusDownloading: "● Apple Intelligence is downloading. Try again later.",
aiEnableInSettings: "Enable in System Settings",
```

**Spanish (`es`):**
```ts
badgeVerified: "Verificado",
badgeAi: "Sugerido por IA",
badgeFallback: "Orientación general",
tipsViewSource: "Ver la guía oficial de limpieza de Apple",
aiSectionTitle: "Apple Intelligence",
aiToggleLabel: "Usar Apple Intelligence para dispositivos desconocidos",
aiToggleDescription: "Cuando busques un dispositivo que no esté en nuestro catálogo verificado, Apple Intelligence generará pasos de limpieza en tu dispositivo. Nada sale de tu Mac.",
aiStatusAvailable: "● Disponible",
aiStatusUnavailablePlatform: "● No disponible en este Mac. Requiere Apple Silicon y macOS 26 o posterior.",
aiStatusNotEnabled: "● Apple Intelligence no está activado en Configuración del Sistema",
aiStatusDownloading: "● Apple Intelligence se está descargando. Inténtalo más tarde.",
aiEnableInSettings: "Activar en Configuración del Sistema",
```

**French (`fr`):**
```ts
badgeVerified: "Vérifié",
badgeAi: "Suggéré par IA",
badgeFallback: "Conseils généraux",
tipsViewSource: "Voir le guide de nettoyage officiel d'Apple",
aiSectionTitle: "Apple Intelligence",
aiToggleLabel: "Utiliser Apple Intelligence pour les appareils inconnus",
aiToggleDescription: "Quand vous cherchez un appareil non répertorié, Apple Intelligence génère les étapes de nettoyage sur votre Mac. Rien ne quitte votre appareil.",
aiStatusAvailable: "● Disponible",
aiStatusUnavailablePlatform: "● Indisponible sur ce Mac. Nécessite Apple Silicon et macOS 26 ou ultérieur.",
aiStatusNotEnabled: "● Apple Intelligence n'est pas activé dans les Réglages",
aiStatusDownloading: "● Apple Intelligence est en cours de téléchargement. Réessayez plus tard.",
aiEnableInSettings: "Activer dans les Réglages Système",
```

**German (`de`):**
```ts
badgeVerified: "Verifiziert",
badgeAi: "KI-Vorschlag",
badgeFallback: "Allgemeiner Hinweis",
tipsViewSource: "Apples offizielle Reinigungsanleitung ansehen",
aiSectionTitle: "Apple Intelligence",
aiToggleLabel: "Apple Intelligence für unbekannte Geräte verwenden",
aiToggleDescription: "Bei Suche nach einem nicht katalogisierten Gerät erzeugt Apple Intelligence die Reinigungsschritte auf dem Mac. Nichts verlässt das Gerät.",
aiStatusAvailable: "● Verfügbar",
aiStatusUnavailablePlatform: "● Auf diesem Mac nicht verfügbar. Erfordert Apple Silicon und macOS 26 oder neuer.",
aiStatusNotEnabled: "● Apple Intelligence in den Systemeinstellungen nicht aktiviert",
aiStatusDownloading: "● Apple Intelligence wird geladen. Bitte später erneut versuchen.",
aiEnableInSettings: "In den Systemeinstellungen aktivieren",
```

**Chinese (`zh`):**
```ts
badgeVerified: "已验证",
badgeAi: "AI 建议",
badgeFallback: "通用指南",
tipsViewSource: "查看 Apple 官方清洁指南",
aiSectionTitle: "Apple Intelligence",
aiToggleLabel: "对未知设备使用 Apple Intelligence",
aiToggleDescription: "当你搜索的设备不在已验证目录中时,Apple Intelligence 会在你的设备上生成清洁步骤。任何信息都不会离开你的 Mac。",
aiStatusAvailable: "● 可用",
aiStatusUnavailablePlatform: "● 此 Mac 不可用。需要 Apple Silicon 和 macOS 26 或更高版本。",
aiStatusNotEnabled: "● 系统设置中未启用 Apple Intelligence",
aiStatusDownloading: "● Apple Intelligence 正在下载,请稍后重试。",
aiEnableInSettings: "在系统设置中启用",
```

**Japanese (`ja`):**
```ts
badgeVerified: "認証済み",
badgeAi: "AIによる提案",
badgeFallback: "一般的な案内",
tipsViewSource: "Apple公式の清掃ガイドを表示",
aiSectionTitle: "Apple Intelligence",
aiToggleLabel: "不明なデバイスにApple Intelligenceを使用",
aiToggleDescription: "検証済みカタログにないデバイスを検索すると、Apple Intelligenceがあなたのデバイス上で清掃手順を生成します。Macの外には何も送信されません。",
aiStatusAvailable: "● 利用可能",
aiStatusUnavailablePlatform: "● このMacでは利用できません。Apple SiliconとmacOS 26以降が必要です。",
aiStatusNotEnabled: "● Apple Intelligenceがシステム設定で有効になっていません",
aiStatusDownloading: "● Apple Intelligenceをダウンロード中です。後でお試しください。",
aiEnableInSettings: "システム設定で有効にする",
```

**Portuguese (`pt`):**
```ts
badgeVerified: "Verificado",
badgeAi: "Sugerido por IA",
badgeFallback: "Orientação geral",
tipsViewSource: "Ver o guia oficial de limpeza da Apple",
aiSectionTitle: "Apple Intelligence",
aiToggleLabel: "Usar Apple Intelligence para dispositivos desconhecidos",
aiToggleDescription: "Quando você pesquisar um dispositivo que não esteja no nosso catálogo verificado, o Apple Intelligence gerará passos de limpeza no seu dispositivo. Nada sai do seu Mac.",
aiStatusAvailable: "● Disponível",
aiStatusUnavailablePlatform: "● Indisponível neste Mac. Requer Apple Silicon e macOS 26 ou posterior.",
aiStatusNotEnabled: "● Apple Intelligence não ativado nas Definições do Sistema",
aiStatusDownloading: "● Apple Intelligence está sendo baixado. Tente novamente mais tarde.",
aiEnableInSettings: "Ativar nas Definições do Sistema",
```

Add each block immediately before the closing `}` of its respective language object in `utils/translations.ts`. Take care not to break existing keys.

- [ ] **Step 2: Also update the input placeholder and remove "Lenovo" reference**

In each language block, find the `guidePlaceholder` key and update it (since the catalog is Apple-only now):

- `en`: `"e.g. MacBook Pro M4, iMac 24\", Magic Keyboard..."`
- `es`: `"ej. MacBook Pro M4, iMac 24\", Magic Keyboard..."`
- `fr`: `"ex. MacBook Pro M4, iMac 24\", Magic Keyboard..."`
- `de`: `"z.B. MacBook Pro M4, iMac 24\", Magic Keyboard..."`
- `zh`: `"例如:MacBook Pro M4、iMac 24\"、Magic Keyboard..."`
- `ja`: `"例: MacBook Pro M4、iMac 24\"、Magic Keyboard..."`
- `pt`: `"ex. MacBook Pro M4, iMac 24\", Magic Keyboard..."`

- [ ] **Step 3: Type-check**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run type-check
```

Expected: exits 0. The inferred type of `t[lang]` will fail if any block is missing a key.

- [ ] **Step 4: Commit**

```bash
git add utils/translations.ts
git commit -m "feat(i18n): add badge, AI section, status strings + update placeholder"
```

---

### Task 10: `SourceBadge` component

**Files:**
- Create: `components/SourceBadge.tsx`

- [ ] **Step 1: Write the component**

`components/SourceBadge.tsx`:

```tsx
import React from 'react';
import { ShieldCheck, Sparkles, Info } from 'lucide-react';
import { Theme } from '../App';
import { t, Language } from '../utils/translations';
import type { CleaningEntry } from '../utils/cleaningGuide';

interface SourceBadgeProps {
  source: CleaningEntry['source'];
  theme: Theme;
  lang: Language;
}

export const SourceBadge: React.FC<SourceBadgeProps> = ({ source, theme, lang }) => {
  const isDark = theme === 'dark';
  const text = t[lang];

  const config = {
    catalog: {
      icon: ShieldCheck,
      label: text.badgeVerified,
      classes: isDark
        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
        : 'bg-emerald-50 border-emerald-200 text-emerald-700',
    },
    ai: {
      icon: Sparkles,
      label: text.badgeAi,
      classes: isDark
        ? 'bg-blue-500/10 border-blue-500/20 text-blue-300'
        : 'bg-blue-50 border-blue-200 text-blue-700',
    },
    fallback: {
      icon: Info,
      label: text.badgeFallback,
      classes: isDark
        ? 'bg-neutral-500/10 border-neutral-500/20 text-neutral-300'
        : 'bg-neutral-100 border-neutral-200 text-neutral-700',
    },
  }[source];

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${config.classes}`}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
};
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run type-check
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add components/SourceBadge.tsx
git commit -m "feat(ui): add SourceBadge component (verified/ai/fallback variants)"
```

---

### Task 11: Rewrite `Home.tsx` — remove Gemini, use `lookupGuide`

This is the largest task in the plan. The Gemini integration is replaced wholesale.

**Files:**
- Modify: `components/Home.tsx`

- [ ] **Step 1: Read the current Home.tsx** so the edits make sense

```bash
cd /Users/mrbarkan/Development/cleanmode
wc -l components/Home.tsx
```

Expected: around 425 lines. You'll be modifying several distinct regions.

- [ ] **Step 2: Update imports**

In `components/Home.tsx`, find the import block at the top. Replace it:

**Replace this:**
```tsx
import React, { useState, useEffect } from 'react';
import { Shield, Sparkles, Command, Keyboard, Loader2, Laptop, Globe, Info, AlertTriangle, ExternalLink } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { t, Language, languages } from '../utils/translations';
import { Theme } from '../App';
import { appVersion } from '../utils/changelog';
import { PermissionsModal } from './PermissionsModal';
import type { Permissions } from '../types/window';
```

**With this:**
```tsx
import React, { useState, useEffect } from 'react';
import { Shield, Sparkles, Command, Keyboard, Loader2, Laptop, Globe, Info, AlertTriangle, ExternalLink } from 'lucide-react';
import { t, Language, languages } from '../utils/translations';
import { Theme } from '../App';
import { appVersion } from '../utils/changelog';
import { PermissionsModal } from './PermissionsModal';
import { SourceBadge } from './SourceBadge';
import { lookupGuide } from '../utils/lookupGuide';
import { localized, type CleaningEntry } from '../utils/cleaningGuide';
import type { Permissions } from '../types/window';
```

- [ ] **Step 3: Replace state declarations**

Find the state declarations near the top of the component body:

**Replace this:**
```tsx
  const [isLoading, setIsLoading] = useState(false);
  const [tips, setTips] = useState<string>('');
  const [sources, setSources] = useState<Array<{uri: string, title: string}>>([]);
  const [error, setError] = useState('');
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
```

**With this:**
```tsx
  const [isLoading, setIsLoading] = useState(false);
  const [entry, setEntry] = useState<CleaningEntry | null>(null);
  const [error, setError] = useState('');
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
```

- [ ] **Step 4: Replace `generateTips` with `handleSearch`**

Find the entire `generateTips` function (about 60 lines, starting with `const generateTips = async () => {` and ending with the matching `};`). Delete it. In its place, insert:

```tsx
  const handleSearch = async () => {
    if (!deviceModel.trim()) return;
    setIsLoading(true);
    setError('');
    setEntry(null);
    try {
      const guide = await lookupGuide(deviceModel, lang);
      setEntry(guide);
    } catch (err) {
      console.error(err);
      setError(text.fetchError);
    } finally {
      setIsLoading(false);
    }
  };

  // Render the entry's text for the current language as a single string we can
  // also pass to the lock screen overlay.
  const entryAsTips = (): string => {
    if (!entry) return '';
    const kb = localized(entry.surfaces.keyboardTrackpad, lang);
    const sc = localized(entry.surfaces.screenShell, lang);
    return `${kb}\n\n${sc}`;
  };
```

- [ ] **Step 5: Update the Start button to pass `entryAsTips()` instead of `tips`**

Find the `handleStart` function (the one that calls `onLock(tips)`). Update both calls:

**Find:**
```tsx
  const handleStart = async () => {
    const result = await window.electron?.enterCleaningMode?.() ?? { ok: true as const };
    if (result.ok) {
      onLock(tips);
      return;
    }
```

**Replace with:**
```tsx
  const handleStart = async () => {
    const result = await window.electron?.enterCleaningMode?.() ?? { ok: true as const };
    if (result.ok) {
      onLock(entryAsTips());
      return;
    }
```

And find `handleTryAgain`:

**Find:**
```tsx
  const handleTryAgain = async () => {
    const result = await window.electron?.enterCleaningMode?.() ?? { ok: true as const };
    if (result.ok) {
      setIsPermissionsModalOpen(false);
      setPermissions({ accessibility: true, inputMonitoring: true });
      onLock(tips);
    }
```

**Replace with:**
```tsx
  const handleTryAgain = async () => {
    const result = await window.electron?.enterCleaningMode?.() ?? { ok: true as const };
    if (result.ok) {
      setIsPermissionsModalOpen(false);
      setPermissions({ accessibility: true, inputMonitoring: true });
      onLock(entryAsTips());
    }
```

- [ ] **Step 6: Update the search button's `onClick`**

Find the search button (the one that says "Search & Generate", with the `onClick={generateTips}` handler). Update:

**Find:**
```tsx
                    <button 
                        onClick={generateTips}
                        disabled={isLoading || !deviceModel.trim()}
```

**Replace with:**
```tsx
                    <button
                        onClick={handleSearch}
                        disabled={isLoading || !deviceModel.trim()}
```

Also find the input's `onKeyDown`:

**Find:**
```tsx
                            onKeyDown={(e) => e.key === 'Enter' && generateTips()}
```

**Replace with:**
```tsx
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
```

- [ ] **Step 7: Replace the results panel rendering**

Find the section that renders results (it starts with `{tips ? (` and goes through the closing of the alternate empty state). Replace the entire conditional block with:

**Find:**
```tsx
                {tips ? (
                    <div className={`rounded-2xl p-8 border animate-in fade-in slide-in-from-bottom-4 shadow-xl mb-12
                        ${isDark ? 'bg-neutral-900/80 border-neutral-800 text-neutral-300' : 'bg-white/80 border-neutral-200 text-neutral-700'}`}>
                        <h4 className={`font-medium mb-6 text-sm uppercase tracking-wider flex items-center gap-2 pb-4 border-b
                            ${isDark ? 'text-blue-400 border-neutral-800' : 'text-blue-600 border-neutral-100'}`}>
                            <Laptop className="w-4 h-4" />
                            {text.tipsFor} {deviceModel}
                        </h4>
                        
                        {/* Render Main Text */}
                        <div className="prose prose-sm max-w-none mb-6">
                            <div className={`whitespace-pre-wrap leading-7 ${isDark ? 'text-neutral-300' : 'text-neutral-600'}`}>
                                {renderContent(tips)}
                            </div>
                        </div>

                        {/* Render Grounding Sources */}
                        {sources.length > 0 && (
                            <div className={`mt-8 pt-4 border-t ${isDark ? 'border-neutral-800' : 'border-neutral-100'}`}>
                                <h5 className={`text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                                    <Globe className="w-3 h-3" />
                                    Sources
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {sources.map((source, idx) => (
                                        <a 
                                            key={idx} 
                                            href={source.uri} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className={`flex items-center gap-2 text-xs p-2 rounded-lg transition-colors truncate
                                                ${isDark ? 'bg-neutral-800/50 hover:bg-neutral-800 text-blue-400' : 'bg-neutral-50 hover:bg-neutral-100 text-blue-600'}`}
                                        >
                                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                            <span className="truncate">{source.title}</span>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className={`border-2 border-dashed rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-4 min-h-[200px]
                        ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>
                         <div className={`p-4 rounded-full ${isDark ? 'bg-neutral-900' : 'bg-neutral-100'}`}>
                            <Sparkles className={`w-6 h-6 ${isDark ? 'text-neutral-700' : 'text-neutral-300'}`} />
                         </div>
                    </div>
                )}
```

**Replace with:**
```tsx
                {entry ? (
                    <div className={`rounded-2xl p-8 border animate-in fade-in slide-in-from-bottom-4 shadow-xl mb-12
                        ${isDark ? 'bg-neutral-900/80 border-neutral-800 text-neutral-300' : 'bg-white/80 border-neutral-200 text-neutral-700'}`}>
                        <div className={`flex items-center justify-between gap-3 mb-6 pb-4 border-b
                            ${isDark ? 'border-neutral-800' : 'border-neutral-100'}`}>
                            <h4 className={`font-medium text-sm uppercase tracking-wider flex items-center gap-2
                                ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                                <Laptop className="w-4 h-4" />
                                {text.tipsFor} {entry.source === 'fallback' ? deviceModel : entry.displayName}
                            </h4>
                            <SourceBadge source={entry.source} theme={theme} lang={lang} />
                        </div>

                        <div className="prose prose-sm max-w-none space-y-6">
                            <div className={`whitespace-pre-wrap leading-7 ${isDark ? 'text-neutral-300' : 'text-neutral-600'}`}>
                                {localized(entry.surfaces.keyboardTrackpad, lang)}
                            </div>
                            <div className={`whitespace-pre-wrap leading-7 ${isDark ? 'text-neutral-300' : 'text-neutral-600'}`}>
                                {localized(entry.surfaces.screenShell, lang)}
                            </div>
                        </div>

                        {entry.sensitivities.length > 0 && (
                            <div className={`mt-6 pt-4 border-t ${isDark ? 'border-neutral-800' : 'border-neutral-100'}`}>
                                <p className={`text-xs font-medium uppercase tracking-wider mb-2 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                                    ⚠ {entry.sensitivities.map(s => localized(s, lang)).join(' • ')}
                                </p>
                            </div>
                        )}

                        {entry.source === 'catalog' && entry.sourceUrl && (
                            <div className={`mt-6 pt-4 border-t ${isDark ? 'border-neutral-800' : 'border-neutral-100'}`}>
                                <a
                                    href={entry.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`inline-flex items-center gap-2 text-xs ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                                >
                                    <ExternalLink className="w-3 h-3" />
                                    {text.tipsViewSource}
                                </a>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className={`border-2 border-dashed rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-4 min-h-[200px]
                        ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>
                         <div className={`p-4 rounded-full ${isDark ? 'bg-neutral-900' : 'bg-neutral-100'}`}>
                            <Sparkles className={`w-6 h-6 ${isDark ? 'text-neutral-700' : 'text-neutral-300'}`} />
                         </div>
                    </div>
                )}
```

- [ ] **Step 8: Delete the `renderContent` helper**

It was only used by the old Gemini path. Find and delete:

```tsx
  // Helper to render text with clickable links
  const renderContent = (content: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);
    return parts.map((part, index) => 
      part.match(urlRegex) ? (
        <a 
          key={index} 
          href={part} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-blue-500 hover:underline break-all"
        >
          {part}
        </a>
      ) : (
        part
      )
    );
  };
```

- [ ] **Step 9: Type-check**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run type-check
```

Expected: exits 0. If you see `'Globe' is declared but its value is never read` or `'ExternalLink' is declared but its value is never read`, you can leave them (they may still be used elsewhere) or remove from imports. Run `grep` on the file to confirm:

```bash
grep -E "Globe|ExternalLink" components/Home.tsx
```

If `Globe` only appears in the import line, remove it. `ExternalLink` is used in the new code, so it stays. `Loader2` should also still be used (spinner).

- [ ] **Step 10: Commit**

```bash
git add components/Home.tsx
git commit -m "feat(catalog): rewrite Home.tsx to use lookupGuide instead of Gemini"
```

---

### Task 12: Remove `@google/genai`, vite config, .env.local from runtime

The seed/translate scripts still need `@google/genai`, but it's now in `devDependencies` (Task 5 moved it). This task removes the runtime plumbing.

**Files:**
- Modify: `vite.config.ts`
- Modify: `README.md`
- Delete: `.env.local` (optional, since `*.local` is gitignored — keep if user wants for scripts)

- [ ] **Step 1: Remove the `process.env.API_KEY` define from vite.config.ts**

In `/Users/mrbarkan/Development/cleanmode/vite.config.ts`, find and delete the `define` block:

```ts
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
```

You can also remove the now-unused `loadEnv` and `mode`/`env` plumbing. Final `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
```

- [ ] **Step 2: Update README.md**

Replace the README content (currently has API key instructions). Use Edit:

**Find:**
```markdown
## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
```

**Replace with:**
```markdown
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

1. Set `API_KEY=<your-gemini-key>` in a local `.env.local` (gitignored)
2. Add device names to `data/catalog-seeds.json`
3. Run `npm run seed:catalog` — drafts go to `data/_catalog-draft.json` for review
4. Run `npm run translate:catalog` to fill in non-English languages

Neither script is invoked at runtime. The shipping app contains no API keys.
```

- [ ] **Step 3: Verify no runtime references to `process.env.API_KEY` remain**

```bash
cd /Users/mrbarkan/Development/cleanmode
grep -rn "process.env.API_KEY\|GoogleGenAI" components/ utils/ electron/ App.tsx index.tsx 2>&1 | grep -v scripts/
```

Expected: zero matches. (Any matches in `scripts/` are fine — those are build-time tools.)

- [ ] **Step 4: Verify `@google/genai` is no longer in `dependencies`**

```bash
cd /Users/mrbarkan/Development/cleanmode
node -e "const p = require('./package.json'); console.log('runtime deps:'); for (const k of Object.keys(p.dependencies)) console.log(' -', k); console.log('devDeps include @google/genai:', '@google/genai' in p.devDependencies);"
```

Expected: `@google/genai` NOT in the runtime list. Should appear in devDeps.

- [ ] **Step 5: Run the app build to confirm everything links**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run build
```

Expected: Vite builds cleanly. Bundle should NOT contain `@google/genai` — verify:

```bash
grep -r "GoogleGenAI" dist/ 2>&1 | head -3
```

Expected: zero matches.

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts README.md
git commit -m "refactor: remove @google/genai from runtime; document catalog tooling"
```

---

### Task 13: Dev-mode smoke test #1 — catalog + fallback (no AI yet)

Run the app and verify the new catalog-driven UI works end-to-end. This is a manual user task.

- [ ] **Step 1: Run the dev session**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run electron:dev
```

- [ ] **Step 2: Verify catalog hits**

Search for each of these in the device input. Each should return a result with a green "Verified" badge and a "View Apple's official cleaning guide" link:

- "MacBook Pro 14"
- "mbp 14 m4" (alias)
- "macbok pro 14" (typo)
- "iMac 24"
- "Magic Keyboard"
- "Magic Trackpad"

- [ ] **Step 3: Verify catalog miss → universal fallback**

Search for "Lenovo ThinkPad X1" — should return a result with a grey "General guidance" badge and NO source URL. The displayed name should be your query.

- [ ] **Step 4: Verify ambiguity rule**

Search for "macbook" alone — should return universal fallback (matcher rejects ambiguous matches).

- [ ] **Step 5: Verify language switching**

Switch language to Japanese (or any non-English). Search "MacBook Pro 14" again. The cleaning steps should render in Japanese.

- [ ] **Step 6: Verify Start Cleaning Mode still works**

After getting a result, click Start Cleaning Mode. The lock screen overlay should show the cleaning steps from the entry. Unlock with triple-Cmd.

- [ ] **Step 7: Verify no network activity**

Optional: open Network tab in DevTools (View → Developer → Developer Tools). Search a few times. No outbound requests should fire (the catalog is local). If you see anything, the rewrite missed a Gemini call site.

- [ ] **Step 8: No commit (manual smoke)**

If everything passed, Phase 3 is complete. The app is functional with catalog + fallback, just no AI yet. You could ship at this point if you wanted. If anything failed, revisit the previous tasks.

---

## Phase 4 — Swift helper for Apple Intelligence (DEFERRED until macOS 26)

> **Heads up:** Phases 4–6 require **macOS 26 (Tahoe) + Apple Silicon** to compile and test. If your current Mac is on macOS 15 (Sequoia) or earlier, the Swift `FoundationModels` import will fail and the helper binary cannot be built. You can skip Phases 4–6 entirely for now — the catalog + fallback flow ships and works without them. Catalog misses just fall through to the universal fallback. Return to Phase 4 when you have macOS 26 access.

### Task 14: Swift package scaffolding

**Files:**
- Create: `electron/intelligence/helper/Package.swift`
- Modify: `.gitignore` (add `electron/intelligence/helper/.build/`)

- [ ] **Step 1: Create the directory and Package.swift**

```bash
cd /Users/mrbarkan/Development/cleanmode
mkdir -p electron/intelligence/helper/Sources/IntelligenceHelper
mkdir -p electron/intelligence/helper/prebuilds
```

`electron/intelligence/helper/Package.swift`:

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "IntelligenceHelper",
  platforms: [.macOS(.v26)],
  targets: [
    .executableTarget(
      name: "IntelligenceHelper",
      path: "Sources/IntelligenceHelper"
    )
  ]
)
```

- [ ] **Step 2: Add build artifacts to .gitignore**

Append to `/Users/mrbarkan/Development/cleanmode/.gitignore`:

```
electron/intelligence/helper/.build/
electron/intelligence/helper/prebuilds/
```

- [ ] **Step 3: Commit**

```bash
cd /Users/mrbarkan/Development/cleanmode
git add electron/intelligence/helper/Package.swift .gitignore
git commit -m "feat(ai): add Swift package manifest for IntelligenceHelper"
```

---

### Task 15: Helper `main.swift`

**Files:**
- Create: `electron/intelligence/helper/Sources/IntelligenceHelper/main.swift`

- [ ] **Step 1: Write the source**

`electron/intelligence/helper/Sources/IntelligenceHelper/main.swift`:

```swift
import Foundation
import FoundationModels

@Generable
struct CleaningEntry: Codable {
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

struct Request: Decodable {
  let query: String
  let language: String
}

struct Response: Encodable {
  let ok: Bool
  let entry: CleaningEntry?
  let error: String?
}

func emit(_ resp: Response) {
  if let data = try? JSONEncoder().encode(resp) {
    FileHandle.standardOutput.write(data)
  }
}

// Probe mode: report availability without running a query.
if CommandLine.arguments.contains("--probe") {
  let availability = SystemLanguageModel.default.availability
  if case .available = availability {
    emit(Response(ok: true, entry: nil, error: nil))
  } else {
    emit(Response(ok: false, entry: nil, error: "unavailable:\(String(describing: availability))"))
  }
  exit(0)
}

let stdinData = FileHandle.standardInput.availableData
guard let req = try? JSONDecoder().decode(Request.self, from: stdinData) else {
  emit(Response(ok: false, entry: nil, error: "invalid-request"))
  exit(0)
}

let availability = SystemLanguageModel.default.availability
guard case .available = availability else {
  emit(Response(ok: false, entry: nil, error: "unavailable:\(String(describing: availability))"))
  exit(0)
}

let session = LanguageModelSession(instructions: """
You are a specialized Apple device cleaning assistant. Given a user's device \
description, return manufacturer-aligned cleaning steps in language code \
\(req.language). If you do not have specific guidance for the exact device, \
set `recognized` to false. Never guess. Never invent product features. \
Never reference URLs.
""")

do {
  let result = try await session.respond(to: req.query, generating: CleaningEntry.self)
  emit(Response(ok: true, entry: result.content, error: nil))
} catch {
  emit(Response(ok: false, entry: nil, error: "model-error:\(error.localizedDescription)"))
}
```

- [ ] **Step 2: Test the build (REQUIRES macOS 26 + Swift 6 toolchain)**

```bash
cd /Users/mrbarkan/Development/cleanmode/electron/intelligence/helper
swift build -c release --arch arm64
```

Expected: builds successfully, producing `.build/arm64-apple-macosx/release/IntelligenceHelper`.

**If build fails with `FoundationModels` not found**: you're on macOS < 26 or Swift toolchain doesn't include the framework. **Stop here, mark this task as deferred, return when macOS 26 is available.**

- [ ] **Step 3: Smoke-test the probe mode**

```bash
cd /Users/mrbarkan/Development/cleanmode/electron/intelligence/helper
./.build/arm64-apple-macosx/release/IntelligenceHelper --probe
```

Expected: prints a JSON line like `{"ok":true,"entry":null,"error":null}` if Apple Intelligence is enabled on your machine, or `{"ok":false,"entry":null,"error":"unavailable:..."}` if it isn't.

- [ ] **Step 4: Smoke-test a real query**

```bash
cd /Users/mrbarkan/Development/cleanmode/electron/intelligence/helper
echo '{"query":"MacBook Pro 14 M3 2023","language":"en"}' | ./.build/arm64-apple-macosx/release/IntelligenceHelper
```

Expected: a JSON response with `ok: true, entry: { recognized: true, ... }`. Will take 2–5 seconds.

If Apple Intelligence isn't enabled in System Settings on your test Mac, the response will be an `unavailable:notReady` error. Enable Apple Intelligence in System Settings → Apple Intelligence & Siri, then retry.

- [ ] **Step 5: Commit**

```bash
cd /Users/mrbarkan/Development/cleanmode
git add electron/intelligence/helper/Sources/IntelligenceHelper/main.swift
git commit -m "feat(ai): IntelligenceHelper main.swift (Generable schema + refusal-first prompt)"
```

---

### Task 16: Helper build + sign script

**Files:**
- Create: `scripts/build-helper.sh`
- Create: `build/helper-entitlements.plist`

- [ ] **Step 1: Write the entitlements**

`build/helper-entitlements.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>
```

- [ ] **Step 2: Validate plist**

```bash
cd /Users/mrbarkan/Development/cleanmode
plutil -lint build/helper-entitlements.plist
```

Expected: `build/helper-entitlements.plist: OK`.

- [ ] **Step 3: Write the build script**

`scripts/build-helper.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# scripts/build-helper.sh — builds and (optionally) signs the IntelligenceHelper binary.
# Run from repo root: ./scripts/build-helper.sh

cd electron/intelligence/helper
swift build -c release --arch arm64

mkdir -p prebuilds
cp .build/arm64-apple-macosx/release/IntelligenceHelper prebuilds/

cd ../../..

if [[ -n "${CSC_NAME:-}" ]]; then
  echo "[helper] Signing with $CSC_NAME"
  codesign --force --options runtime \
    --entitlements build/helper-entitlements.plist \
    --sign "$CSC_NAME" \
    electron/intelligence/helper/prebuilds/IntelligenceHelper
else
  echo "[helper] Ad-hoc signing (no CSC_NAME set)"
  codesign --force --options runtime \
    --entitlements build/helper-entitlements.plist \
    --sign - \
    electron/intelligence/helper/prebuilds/IntelligenceHelper
fi

echo "[helper] Built: $(file electron/intelligence/helper/prebuilds/IntelligenceHelper)"
```

- [ ] **Step 4: Make executable and add to package.json**

```bash
cd /Users/mrbarkan/Development/cleanmode
chmod +x scripts/build-helper.sh
```

In `package.json` `"scripts"`, add:

```json
"helper:build": "bash scripts/build-helper.sh"
```

- [ ] **Step 5: Run the build script (REQUIRES macOS 26)**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run helper:build
```

Expected: builds, ad-hoc signs, and reports the file location. Final binary at `electron/intelligence/helper/prebuilds/IntelligenceHelper`.

- [ ] **Step 6: Commit**

```bash
git add build/helper-entitlements.plist scripts/build-helper.sh package.json
git commit -m "feat(ai): add helper build + sign script with entitlements"
```

---

## Phase 5 — AI wiring (IPC + UI)

These tasks can be implemented even on macOS < 26 — the JS wrapper short-circuits when the binary isn't found, so the renderer just shows "not available" status. The full AI path only activates when the helper exists.

### Task 17: JS wrapper for the helper

**Files:**
- Create: `electron/intelligence/index.js`

- [ ] **Step 1: Write the wrapper**

`electron/intelligence/index.js`:

```js
'use strict';

const { spawn } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');
const os = require('os');

// Path to the helper binary inside the .app bundle (or dev tree).
const helperPath = path.join(__dirname, 'helper', 'prebuilds', 'IntelligenceHelper');

const HELPER_TIMEOUT_MS = 10_000;

// Returns true if the host is plausibly capable of running the helper.
// Strict version check happens later via the helper's --probe call.
function platformSupported() {
  if (process.platform !== 'darwin') return false;
  if (process.arch !== 'arm64') return false;
  // os.release() returns Darwin version. Darwin 25 == macOS 26 (Tahoe).
  // Earlier Darwin versions can't run FoundationModels.
  const darwinMajor = parseInt(os.release().split('.')[0], 10);
  if (Number.isNaN(darwinMajor) || darwinMajor < 25) return false;
  return true;
}

function helperPresent() {
  return existsSync(helperPath);
}

function runHelper(args, stdinData) {
  return new Promise((resolve, reject) => {
    const child = spawn(helperPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('helper-timeout'));
    }, HELPER_TIMEOUT_MS);

    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(out);
        resolve(parsed);
      } catch (e) {
        reject(new Error(`invalid-json: stdout=${out.slice(0, 200)} stderr=${err.slice(0, 200)}`));
      }
    });

    if (stdinData) {
      child.stdin.write(stdinData);
    }
    child.stdin.end();
  });
}

async function isAvailable() {
  if (!platformSupported()) return { available: false, reason: 'platform-unsupported' };
  if (!helperPresent())     return { available: false, reason: 'helper-missing' };
  try {
    const result = await runHelper(['--probe'], '');
    if (result.ok) return { available: true };
    return { available: false, reason: result.error || 'unknown' };
  } catch (err) {
    return { available: false, reason: err.message };
  }
}

async function generate(query, language) {
  if (!helperPresent()) return { recognized: false };
  try {
    const result = await runHelper([], JSON.stringify({ query, language }));
    if (result.ok && result.entry && result.entry.recognized) {
      return { recognized: true, entry: result.entry };
    }
    return { recognized: false };
  } catch (err) {
    console.error('[intelligence] generate failed:', err.message);
    return { recognized: false };
  }
}

module.exports = { isAvailable, generate, platformSupported };
```

- [ ] **Step 2: Smoke-test the wrapper (any macOS — short-circuits on incompatible)**

```bash
cd /Users/mrbarkan/Development/cleanmode
node -e "(async () => { const i = require('./electron/intelligence'); console.log(await i.isAvailable()); })()"
```

Expected:
- On macOS < 26 OR Intel: `{ available: false, reason: 'platform-unsupported' }`
- On macOS 26 ARM but helper not built: `{ available: false, reason: 'helper-missing' }`
- On macOS 26 ARM with helper built + AI enabled: `{ available: true }`
- On macOS 26 ARM with helper built but AI not enabled: `{ available: false, reason: 'unavailable:notReady' }` (or similar)

Any of these is a successful test — the wrapper is correctly diagnosing the environment.

- [ ] **Step 3: Commit**

```bash
git add electron/intelligence/index.js
git commit -m "feat(ai): JS wrapper for IntelligenceHelper with graceful degradation"
```

---

### Task 18: IPC additions (main.js, preload.js, window.d.ts)

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `types/window.d.ts`

- [ ] **Step 1: Add intelligence IPC handlers to main.js**

In `electron/main.js`, add this require near the top (alongside the other requires):

```js
const intelligence = require('./intelligence');
```

Then, somewhere after the existing `ipcMain.handle('prompt-input-monitoring', ...)` lines and before `app.whenReady()`, add:

```js
ipcMain.handle('intelligence-availability', async () => {
  return await intelligence.isAvailable();
});

ipcMain.handle('intelligence-generate', async (_evt, query, language) => {
  return await intelligence.generate(query, language);
});

ipcMain.handle('open-intelligence-settings', () => {
  const { shell } = require('electron');
  // System Settings → Apple Intelligence & Siri. The exact URL is best-effort;
  // if it doesn't open the right pane on a given macOS build, the user can
  // navigate manually.
  shell.openExternal('x-apple.systempreferences:com.apple.preference.intelligence');
});
```

- [ ] **Step 2: Expose the intelligence API in preload.js**

In `electron/preload.js`, extend the `contextBridge.exposeInMainWorld('electron', ...)` object:

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  enterCleaningMode:     () => ipcRenderer.invoke('enter-cleaning-mode'),
  exitCleaningMode:      () => ipcRenderer.send('exit-cleaning-mode'),
  checkPermissions:      () => ipcRenderer.invoke('check-permissions'),
  promptAccessibility:   () => ipcRenderer.invoke('prompt-accessibility'),
  promptInputMonitoring: () => ipcRenderer.invoke('prompt-input-monitoring'),
  intelligenceAvailability: () => ipcRenderer.invoke('intelligence-availability'),
  intelligenceGenerate:     (query, language) => ipcRenderer.invoke('intelligence-generate', query, language),
  openIntelligenceSettings: () => ipcRenderer.invoke('open-intelligence-settings'),
});
```

- [ ] **Step 3: Update window.d.ts**

`types/window.d.ts`:

```ts
export {};

export type Permissions = {
  accessibility: boolean;
  inputMonitoring: boolean;
};

export type EnterCleaningModeResult =
  | { ok: true }
  | { ok: false; error: 'permissions-denied'; permissions: Permissions }
  | { ok: false; error: 'tap-failed' };

export type IntelligenceAvailability =
  | { available: true }
  | { available: false; reason: string };

export type IntelligenceEntry = {
  recognized: boolean;
  displayName: string;
  keyboardTrackpadInstructions: string;
  screenShellInstructions: string;
  sensitivities: string[];
};

export type IntelligenceResult =
  | { recognized: true; entry: IntelligenceEntry }
  | { recognized: false };

declare global {
  interface Window {
    electron?: {
      enterCleaningMode:        () => Promise<EnterCleaningModeResult>;
      exitCleaningMode:         () => void;
      checkPermissions:         () => Promise<Permissions>;
      promptAccessibility:      () => Promise<boolean>;
      promptInputMonitoring:    () => Promise<boolean>;
      intelligenceAvailability: () => Promise<IntelligenceAvailability>;
      intelligenceGenerate:     (query: string, language: string) => Promise<IntelligenceResult>;
      openIntelligenceSettings: () => Promise<void>;
    };
  }
}
```

- [ ] **Step 4: Type-check**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run type-check
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add electron/main.js electron/preload.js types/window.d.ts
git commit -m "feat(ai): IPC for intelligence availability, generate, open-settings"
```

---

### Task 19: Wire AI into `lookupGuide`

**Files:**
- Modify: `utils/lookupGuide.ts`

- [ ] **Step 1: Update lookupGuide to try AI between catalog and fallback**

Replace the contents of `utils/lookupGuide.ts`:

```ts
import type { CleaningEntry, CatalogFile, Localized } from './cleaningGuide';
import type { Language } from './translations';
import { bestMatch } from './catalogMatch';
import catalogRaw from '../data/cleaning-catalog.json';
import fallbackRaw from '../data/universal-fallback.json';

const catalog = catalogRaw as CatalogFile;
const fallback = fallbackRaw as CleaningEntry;

const AI_FALLBACK_KEY = 'cleanmode-ai-fallback';

function aiFallbackEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const v = localStorage.getItem(AI_FALLBACK_KEY);
  return v === null ? true : v === 'true';
}

export async function lookupGuide(query: string, lang: Language): Promise<CleaningEntry> {
  const match = bestMatch(query, catalog.entries);
  if (match) return { ...match, source: 'catalog' };

  if (aiFallbackEnabled() && window.electron?.intelligenceGenerate) {
    try {
      const result = await window.electron.intelligenceGenerate(query, lang);
      if (result.recognized && result.entry) {
        const aiEntry: CleaningEntry = {
          id: 'ai:' + query.toLowerCase().replace(/\s+/g, '-'),
          displayName: result.entry.displayName || query,
          aliases: [],
          surfaces: {
            keyboardTrackpad: { [lang]: result.entry.keyboardTrackpadInstructions } as Partial<Localized>,
            screenShell:      { [lang]: result.entry.screenShellInstructions } as Partial<Localized>,
          },
          sensitivities: result.entry.sensitivities.map(s => ({ [lang]: s } as Partial<Localized>)),
          source: 'ai',
        };
        logAiQuery(query, lang, true);
        return aiEntry;
      }
      logAiQuery(query, lang, false);
    } catch (err) {
      console.error('[lookupGuide] AI fallback error:', err);
    }
  }

  return { ...fallback, displayName: query.trim() || fallback.displayName, source: 'fallback' };
}

const DIAG_KEY = 'cleanmode-diagnostics-enabled';
function diagnosticsEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(DIAG_KEY) === 'true';
}

function logAiQuery(query: string, lang: Language, recognized: boolean) {
  if (!diagnosticsEnabled()) return;
  // The renderer can't write files directly. We'd need to pipe through main.js.
  // For now, log to console — Task 22 wires the file writer.
  console.log('[diagnostics]', { ts: new Date().toISOString(), query, lang, recognized });
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run type-check
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add utils/lookupGuide.ts
git commit -m "feat(ai): wire AI fallback into lookupGuide between catalog and universal"
```

---

### Task 20: AboutModal — AI fallback toggle + diagnostics toggle + status

**Files:**
- Modify: `components/AboutModal.tsx`

- [ ] **Step 1: Read the current AboutModal to understand its structure**

```bash
cd /Users/mrbarkan/Development/cleanmode
wc -l components/AboutModal.tsx
```

Note the existing structure (likely shows version, changelog, theme toggle). We'll add a new section between existing content and the close button.

- [ ] **Step 2: Add intelligence availability state + toggles**

In `components/AboutModal.tsx`:

Add imports if not present:
```tsx
import { useState, useEffect } from 'react';
import { Sparkles, FileText } from 'lucide-react';
import type { IntelligenceAvailability } from '../types/window';
```

(If `useState`/`useEffect` are already imported from `react`, just add what's missing.)

Inside the component body, add state:

```tsx
const [aiAvailability, setAiAvailability] = useState<IntelligenceAvailability | null>(null);
const [aiEnabled, setAiEnabled] = useState<boolean>(() => {
  if (typeof window === 'undefined') return true;
  const v = localStorage.getItem('cleanmode-ai-fallback');
  return v === null ? true : v === 'true';
});
const [diagEnabled, setDiagEnabled] = useState<boolean>(() => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('cleanmode-diagnostics-enabled') === 'true';
});

useEffect(() => {
  if (!isOpen) return;
  (async () => {
    const result = await window.electron?.intelligenceAvailability?.() ?? { available: false, reason: 'platform-unsupported' };
    setAiAvailability(result);
  })();
}, [isOpen]);

useEffect(() => {
  localStorage.setItem('cleanmode-ai-fallback', aiEnabled ? 'true' : 'false');
}, [aiEnabled]);

useEffect(() => {
  localStorage.setItem('cleanmode-diagnostics-enabled', diagEnabled ? 'true' : 'false');
}, [diagEnabled]);

const aiStatusText = (): string => {
  if (!aiAvailability) return '';
  if (aiAvailability.available) return text.aiStatusAvailable;
  if (aiAvailability.reason === 'platform-unsupported') return text.aiStatusUnavailablePlatform;
  if (aiAvailability.reason === 'helper-missing')        return text.aiStatusUnavailablePlatform;
  if (aiAvailability.reason.includes('notReady'))        return text.aiStatusNotEnabled;
  if (aiAvailability.reason.includes('downloading'))     return text.aiStatusDownloading;
  return text.aiStatusUnavailablePlatform;
};

const aiToggleDisabled = !(aiAvailability?.available);
```

(`text` and `lang` and `theme`/`isDark` should already be set up in the existing component. If not, mirror the pattern from PermissionsModal.)

- [ ] **Step 3: Insert the Apple Intelligence section + Diagnostics section before the close button**

Find a sensible place in the JSX (between the existing version/changelog area and the close button). Insert:

```tsx
<div className={`mt-6 pt-6 border-t ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>
  <h3 className={`flex items-center gap-2 text-sm font-semibold mb-3 ${isDark ? 'text-white' : 'text-neutral-900'}`}>
    <Sparkles className="w-4 h-4 text-blue-500" />
    {text.aiSectionTitle}
  </h3>

  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer
    ${aiToggleDisabled
      ? (isDark ? 'border-neutral-800 bg-neutral-900/30 opacity-50 cursor-not-allowed' : 'border-neutral-200 bg-neutral-50 opacity-50 cursor-not-allowed')
      : (isDark ? 'border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800/50' : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100')}`}>
    <input
      type="checkbox"
      checked={aiEnabled && !aiToggleDisabled}
      disabled={aiToggleDisabled}
      onChange={(e) => setAiEnabled(e.target.checked)}
      className="mt-0.5 accent-blue-500"
    />
    <div className="flex-1 min-w-0">
      <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-900'}`}>
        {text.aiToggleLabel}
      </p>
      <p className={`text-xs mt-1 ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>
        {aiStatusText()}
      </p>
      {aiAvailability && !aiAvailability.available && aiAvailability.reason.includes('notReady') && (
        <button
          onClick={(e) => { e.preventDefault(); window.electron?.openIntelligenceSettings?.(); }}
          className={`mt-2 text-xs underline ${isDark ? 'text-blue-400' : 'text-blue-600'}`}
        >
          {text.aiEnableInSettings}
        </button>
      )}
      <p className={`text-xs mt-2 leading-relaxed ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
        {text.aiToggleDescription}
      </p>
    </div>
  </label>

  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer mt-3
    ${isDark ? 'border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800/50' : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100'}`}>
    <input
      type="checkbox"
      checked={diagEnabled}
      onChange={(e) => setDiagEnabled(e.target.checked)}
      className="mt-0.5 accent-blue-500"
    />
    <div className="flex-1 min-w-0">
      <p className={`text-sm font-medium flex items-center gap-2 ${isDark ? 'text-white' : 'text-neutral-900'}`}>
        <FileText className="w-3 h-3" />
        Help improve CleanMode
      </p>
      <p className={`text-xs mt-1 leading-relaxed ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
        Locally log device queries we couldn't answer from the catalog. Nothing is uploaded.
      </p>
    </div>
  </label>
</div>
```

Note: the "Help improve CleanMode" copy is left in English for simplicity — it can be i18n'd in a v1.1 polish pass. The AI section copy IS i18n'd because it's user-facing on first launch.

- [ ] **Step 4: Type-check**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run type-check
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add components/AboutModal.tsx
git commit -m "feat(ai): AboutModal — AI fallback toggle, diagnostics toggle, status"
```

---

## Phase 6 — Diagnostic logging + maintenance tooling

### Task 21: Diagnostic log file writer

The renderer can't write to the user's Application Support folder directly (sandbox). Move the log writer into main.js and expose via IPC.

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `types/window.d.ts`
- Modify: `utils/lookupGuide.ts`

- [ ] **Step 1: Add the log writer to main.js**

In `electron/main.js`, near the top with other requires:

```js
const fs = require('fs');
```

Then add this IPC handler (anywhere near the other handlers):

```js
const DIAG_DIR = path.join(app.getPath('userData'), 'diagnostics');
const DIAG_FILE = path.join(DIAG_DIR, 'ai-queries.jsonl');
const DIAG_MAX_BYTES = 10 * 1024 * 1024;  // 10MB

function rotateIfNeeded() {
  try {
    const stat = fs.statSync(DIAG_FILE);
    if (stat.size <= DIAG_MAX_BYTES) return;
    const lines = fs.readFileSync(DIAG_FILE, 'utf-8').split('\n').filter(Boolean);
    const kept = lines.slice(Math.floor(lines.length / 2));
    fs.writeFileSync(DIAG_FILE, kept.join('\n') + '\n');
  } catch {
    // Either file doesn't exist or stat failed — fine.
  }
}

ipcMain.handle('diagnostic-log', (_evt, entry) => {
  try {
    if (!fs.existsSync(DIAG_DIR)) fs.mkdirSync(DIAG_DIR, { recursive: true });
    rotateIfNeeded();
    fs.appendFileSync(DIAG_FILE, JSON.stringify(entry) + '\n');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('diagnostic-log-path', () => DIAG_FILE);

ipcMain.handle('diagnostic-log-clear', () => {
  try {
    if (fs.existsSync(DIAG_FILE)) fs.writeFileSync(DIAG_FILE, '');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('diagnostic-log-open', () => {
  const { shell } = require('electron');
  shell.openPath(DIAG_FILE);
});
```

- [ ] **Step 2: Expose in preload.js**

Add to the `contextBridge.exposeInMainWorld` object in `electron/preload.js`:

```js
  diagnosticLog:      (entry) => ipcRenderer.invoke('diagnostic-log', entry),
  diagnosticLogPath:  () => ipcRenderer.invoke('diagnostic-log-path'),
  diagnosticLogClear: () => ipcRenderer.invoke('diagnostic-log-clear'),
  diagnosticLogOpen:  () => ipcRenderer.invoke('diagnostic-log-open'),
```

- [ ] **Step 3: Update window.d.ts**

In `types/window.d.ts`, extend the `Window.electron` interface with:

```ts
  diagnosticLog:      (entry: { ts: string; query: string; lang: string; recognized: boolean; durationMs: number }) => Promise<{ ok: boolean }>;
  diagnosticLogPath:  () => Promise<string>;
  diagnosticLogClear: () => Promise<{ ok: boolean }>;
  diagnosticLogOpen:  () => Promise<void>;
```

- [ ] **Step 4: Update lookupGuide to call the real log writer**

In `utils/lookupGuide.ts`, replace the placeholder `logAiQuery` with:

```ts
function logAiQuery(query: string, lang: Language, recognized: boolean, durationMs: number) {
  if (!diagnosticsEnabled()) return;
  window.electron?.diagnosticLog?.({
    ts: new Date().toISOString(),
    query,
    lang,
    recognized,
    durationMs,
  });
}
```

And update the call sites in `lookupGuide` to measure and pass `durationMs`:

Find the existing AI block:
```ts
  if (aiFallbackEnabled() && window.electron?.intelligenceGenerate) {
    try {
      const result = await window.electron.intelligenceGenerate(query, lang);
      if (result.recognized && result.entry) {
```

Replace with:
```ts
  if (aiFallbackEnabled() && window.electron?.intelligenceGenerate) {
    const t0 = Date.now();
    try {
      const result = await window.electron.intelligenceGenerate(query, lang);
      const durationMs = Date.now() - t0;
      if (result.recognized && result.entry) {
```

And similarly update the `logAiQuery` call sites to pass `durationMs`. Concretely the two call sites become:
```ts
        logAiQuery(query, lang, true, durationMs);
```
and
```ts
      logAiQuery(query, lang, false, durationMs);
```

- [ ] **Step 5: Update AboutModal to wire [View log] / [Clear log]**

In `components/AboutModal.tsx`, replace the placeholder diagnostics section with one that has working buttons. Find the diagnostics `<label>` block and add buttons inside it (before the closing `</div>`):

```tsx
      {diagEnabled && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={(e) => { e.preventDefault(); window.electron?.diagnosticLogOpen?.(); }}
            className={`text-xs px-2 py-1 rounded border
              ${isDark ? 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700 text-white' : 'bg-white border-neutral-300 hover:bg-neutral-50 text-neutral-900'}`}
          >
            View log
          </button>
          <button
            onClick={(e) => { e.preventDefault(); window.electron?.diagnosticLogClear?.(); }}
            className={`text-xs px-2 py-1 rounded border
              ${isDark ? 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700 text-white' : 'bg-white border-neutral-300 hover:bg-neutral-50 text-neutral-900'}`}
          >
            Clear log
          </button>
        </div>
      )}
```

- [ ] **Step 6: Type-check**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run type-check
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add electron/main.js electron/preload.js types/window.d.ts utils/lookupGuide.ts components/AboutModal.tsx
git commit -m "feat(ai): diagnostic log writer with rotation + view/clear UI"
```

---

### Task 22: `review-ai-queries.ts` script

Build-time tool that ingests a `ai-queries.jsonl` file and prints the top missed devices for catalog expansion.

**Files:**
- Create: `scripts/review-ai-queries.ts`

- [ ] **Step 1: Write the script**

`scripts/review-ai-queries.ts`:

```ts
#!/usr/bin/env -S npx tsx

// scripts/review-ai-queries.ts — analyze the diagnostic log and surface
// candidates for catalog expansion. Build-time tool. Never in the shipping app.
//
// Usage: npm run review:ai-queries path/to/ai-queries.jsonl

import { readFileSync } from 'fs';
import { resolve } from 'path';

const logPath = process.argv[2];
if (!logPath) {
  console.error('Usage: npm run review:ai-queries -- <path-to-ai-queries.jsonl>');
  process.exit(1);
}

type LogEntry = { ts: string; query: string; lang: string; recognized: boolean; durationMs: number };

const lines = readFileSync(resolve(logPath), 'utf-8').split('\n').filter(Boolean);
const entries: LogEntry[] = lines.map(line => JSON.parse(line));

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const buckets = new Map<string, { count: number; recognizedCount: number; lastSeen: string; samples: string[] }>();
for (const e of entries) {
  const key = normalize(e.query);
  const b = buckets.get(key) ?? { count: 0, recognizedCount: 0, lastSeen: '', samples: [] };
  b.count++;
  if (e.recognized) b.recognizedCount++;
  if (e.ts > b.lastSeen) b.lastSeen = e.ts;
  if (b.samples.length < 3 && !b.samples.includes(e.query)) b.samples.push(e.query);
  buckets.set(key, b);
}

const ranked = Array.from(buckets.entries())
  .map(([key, b]) => ({ key, ...b, recogRate: b.recognizedCount / b.count }))
  .sort((a, b) => b.count - a.count);

console.log('\n=== Top missed devices (not recognized by AI) ===\n');
for (const r of ranked.filter(r => r.recogRate < 0.5).slice(0, 20)) {
  console.log(`  ${r.count.toString().padStart(3)}× | ${r.samples[0]} (recog ${(r.recogRate * 100).toFixed(0)}%, last ${r.lastSeen.slice(0, 10)})`);
}

console.log('\n=== Top recognized devices (consider promoting to catalog) ===\n');
for (const r of ranked.filter(r => r.recogRate >= 0.5).slice(0, 20)) {
  console.log(`  ${r.count.toString().padStart(3)}× | ${r.samples[0]} (recog ${(r.recogRate * 100).toFixed(0)}%, last ${r.lastSeen.slice(0, 10)})`);
}

const avgDuration = entries.reduce((s, e) => s + e.durationMs, 0) / entries.length;
console.log(`\nTotal: ${entries.length} queries, avg ${avgDuration.toFixed(0)}ms`);
```

- [ ] **Step 2: Smoke-test**

Create a small fake log to verify the script runs:

```bash
cd /Users/mrbarkan/Development/cleanmode
cat > /tmp/test-ai-queries.jsonl << 'EOF'
{"ts":"2026-05-09T10:00:00Z","query":"ThinkPad X1","lang":"en","recognized":false,"durationMs":2800}
{"ts":"2026-05-09T11:00:00Z","query":"thinkpad x1 carbon","lang":"en","recognized":false,"durationMs":2700}
{"ts":"2026-05-09T12:00:00Z","query":"MacBook Pro 13 2017","lang":"en","recognized":true,"durationMs":3100}
EOF
npx tsx scripts/review-ai-queries.ts /tmp/test-ai-queries.jsonl
```

Expected: prints two sections (missed vs. recognized) with counts. The ThinkPad queries collapse into one bucket if normalization works correctly (they don't — the trailing "carbon" makes them different. That's fine, they'd show as separate rows.)

- [ ] **Step 3: Commit**

```bash
git add scripts/review-ai-queries.ts
git commit -m "feat(catalog): add review-ai-queries.ts for catalog expansion workflow"
```

---

## Phase 7 — Build pipeline + final testing

### Task 23: Bundle helper in electron-builder

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update `files` glob to include the helper binary**

In `package.json` `"build"` → `"files"`, add the intelligence helper path:

**Current:**
```json
"files": [
  "dist/**/*",
  "electron/**/*",
  "package.json",
  "!electron/native/eventtap/build/**",
  "electron/native/eventtap/prebuilds/**"
]
```

**Replace with:**
```json
"files": [
  "dist/**/*",
  "electron/**/*",
  "package.json",
  "!electron/native/eventtap/build/**",
  "electron/native/eventtap/prebuilds/**",
  "!electron/intelligence/helper/Sources/**",
  "!electron/intelligence/helper/Package.swift",
  "!electron/intelligence/helper/.build/**",
  "electron/intelligence/helper/prebuilds/**"
]
```

The negative globs exclude the Swift source and SwiftPM scratch directory from the bundle; the positive glob includes the built binary.

- [ ] **Step 2: Add `data/` to the files glob**

The catalog and universal fallback JSON files need to ship. They're imported by `lookupGuide.ts` but Vite inlines them into the bundle — so they actually don't need to be in `files`. But to make the build behavior obvious to future readers and to support a future "external catalog override" feature, add:

```json
"data/**/*"
```

…between the `package.json` line and the first `!` line. The final list:

```json
"files": [
  "dist/**/*",
  "electron/**/*",
  "package.json",
  "data/**/*",
  "!electron/native/eventtap/build/**",
  "electron/native/eventtap/prebuilds/**",
  "!electron/intelligence/helper/Sources/**",
  "!electron/intelligence/helper/Package.swift",
  "!electron/intelligence/helper/.build/**",
  "electron/intelligence/helper/prebuilds/**"
]
```

- [ ] **Step 3: Validate JSON**

```bash
cd /Users/mrbarkan/Development/cleanmode
node -e "JSON.parse(require('fs').readFileSync('package.json'))" && echo "valid"
```

Expected: `valid`.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat(build): bundle intelligence helper binary in electron-builder"
```

---

### Task 24: Dev-mode smoke test #2 — full pipeline including AI

This task assumes the Swift helper was built in Task 16. If you skipped Phases 4+ because you're on macOS < 26, skip this task too and rely on Task 13 as your validation.

- [ ] **Step 1: Run the dev session**

```bash
cd /Users/mrbarkan/Development/cleanmode
npm run helper:build  # if not already built
npm run electron:dev
```

- [ ] **Step 2: Open About modal and verify Apple Intelligence section**

Click the (i) icon in the bottom-left to open the About modal. You should see:

- "Apple Intelligence" heading
- "Use Apple Intelligence for unknown devices" toggle — **enabled** if you're on macOS 26 ARM with AI enabled, **disabled** otherwise with appropriate status text
- "Help improve CleanMode" toggle (diagnostics, default OFF)

- [ ] **Step 3: Catalog hit still works**

Search "MacBook Pro 14" → green Verified badge, source URL link. ✅

- [ ] **Step 4: AI hit for a non-catalog device**

(Apple Silicon + macOS 26 + AI enabled + AI toggle ON):

Search "MacBook Pro 13 2017" (or any Apple device not in our 5-entry catalog). Should take 2–5 seconds, then show a result with **blue "AI-suggested" badge** and no source URL.

If the result is a grey "General guidance" badge instead, the AI returned `recognized: false` or the helper failed. Open the AboutModal — the AI section should still show "Available". If not, check terminal output for stderr from the helper.

- [ ] **Step 5: AI refusal**

Search "my coffee mug". Should return grey "General guidance" badge (AI refused → fallback). The model's instruction explicitly tells it to set `recognized: false` for non-electronics.

- [ ] **Step 6: AI off**

In AboutModal, toggle Apple Intelligence OFF. Search "MacBook Pro 13 2017" again. Should now return grey "General guidance" badge immediately (no AI call).

- [ ] **Step 7: Diagnostics**

Toggle diagnostics ON. Search a few non-catalog devices. Click [View log] in the diagnostics row. Your editor should open `ai-queries.jsonl` with one line per query.

- [ ] **Step 8: Language fidelity**

Switch to Japanese. Search "MacBook Pro 13 2017" again (with AI on). The AI-generated response should be in Japanese.

- [ ] **Step 9: No commit (manual smoke)**

If everything passed, the full feature is working end-to-end.

---

### Task 25: Final test campaign per spec test plan

Run through the test sections from the spec (A–H). This is the most comprehensive test pass.

- [ ] **A. Catalog matching** — all subitems pass per Task 13's checklist.

- [ ] **B. AI fallback** (Apple Silicon + macOS 26+ only):
  - [ ] B.1 — Recognized non-catalog device returns AI-suggested badge.
  - [ ] B.2 — Unknown device → universal fallback.
  - [ ] B.3 — Non-electronics query → universal fallback (refusal-first).
  - [ ] B.4 — Helper crash: temporarily rename the helper binary, search for a non-catalog device → falls through to fallback without showing a red error.
    ```bash
    mv electron/intelligence/helper/prebuilds/IntelligenceHelper electron/intelligence/helper/prebuilds/IntelligenceHelper.bak
    # Test, then:
    mv electron/intelligence/helper/prebuilds/IntelligenceHelper.bak electron/intelligence/helper/prebuilds/IntelligenceHelper
    ```
  - [ ] B.5 — Two queries in a row both succeed.
  - [ ] B.6 — Language fidelity (Japanese → Japanese response).

- [ ] **C. Apple Intelligence availability** — toggle states reflect the actual environment correctly. Try with AI disabled in System Settings to see the "not enabled" status.

- [ ] **D. Source attribution** — Verified / AI-suggested / General guidance badges all render correctly with appropriate styling and source URL only for catalog.

- [ ] **E. Settings & persistence** — toggle AI off, restart app, toggle is still off. Same for diagnostics. View log and Clear log work.

- [ ] **F. Privacy verification (the closed boundary)** — this is the most important. Run Activity Monitor → CPU → search for "CleanMode", inspect "Network" tab. Or use Little Snitch if you have it. Then in CleanMode:
  - [ ] F.1 — App launch → no outbound connections.
  - [ ] F.2 — Catalog hit → none.
  - [ ] F.3 — AI fallback hit → **none** (Apple Intelligence is on-device).
  - [ ] F.4 — About modal opens → none.
  - [ ] F.5 — Verify no Gemini code in production build:
    ```bash
    cd /Users/mrbarkan/Development/cleanmode
    npm run build
    grep -r "googleapis\|@google/genai\|GoogleGenAI\|process.env.API_KEY" dist/ 2>&1
    ```
    Expected: **zero matches**.

- [ ] **G. Build pipeline** — `npm run electron:build` (without notarize env vars) produces a working .app:
  ```bash
  unset APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID
  npm run helper:build
  npm run electron:build
  ```
  Then:
  - [ ] G.1 — Both DMGs produced.
  - [ ] G.2 — `find /Volumes/CleanMode*/CleanMode.app -name IntelligenceHelper` finds the helper.
  - [ ] G.3 — `find /Volumes/CleanMode*/CleanMode.app -name 'cleaning-catalog.json'` finds the catalog (or finds it bundled inside app.asar).
  - [ ] G.4 — Drag to /Applications, right-click → Open → Open. App launches.

- [ ] **H. Regression — FN-key spec + existing features**:
  - [ ] H.1 — CGEventTap still works (cleaning mode still blocks F-keys).
  - [ ] H.2 — Theme persists across launches.
  - [ ] H.3 — Device-model persists across launches.
  - [ ] H.4 — All 7 languages render without missing strings.
  - [ ] H.5 — About modal opens and closes.
  - [ ] H.6 — Browser fallback (`npm run dev` in browser): catalog works; AI `intelligenceAvailability` returns false; fallback works for unknown devices.

- [ ] **Launch criterion:** Sections A, B (or A only if Phases 4+ deferred), C, D, E, F, H all pass on at least one Apple Silicon Mac.

- [ ] **Tag the release** (only after all of the above pass):
  ```bash
  cd /Users/mrbarkan/Development/cleanmode
  git tag -a v1.1.0-catalog -m "Catalog + AI fallback (Apple Intelligence on macOS 26+)"
  ```

---

## Done

After all tasks, CleanMode contains:

- A 5-entry curated Apple-device catalog with Apple-official source links.
- An on-device Apple Intelligence fallback that gracefully degrades.
- A universal safe-cleaning fallback for unknown devices.
- Zero cloud calls. Zero API keys. No `@google/genai` in the shipping bundle.
- Build-time tooling (`seed:catalog`, `translate:catalog`, `review:ai-queries`) for ongoing maintenance.

**Catalog expansion path** (not part of this plan, but enabled by it):
1. Add new device names to `data/catalog-seeds.json`.
2. `npm run seed:catalog` → review drafts in `data/_catalog-draft.json`.
3. Merge approved entries into `data/cleaning-catalog.json`.
4. `npm run translate:catalog` to fill non-English languages.
5. Commit + bump catalog `version` + ship a new app release.

**Deferred until macOS 26 access:**
- Phases 4–6 (Swift helper + AI wiring) — the catalog + fallback already ships and works without them. The JS wrapper short-circuits cleanly when the helper isn't present.

**Deferred until Apple Developer notarization** (carried over from FN-key plan T19):
- Production-grade signed + notarized release artifacts.
