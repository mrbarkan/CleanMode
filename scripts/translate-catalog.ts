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
