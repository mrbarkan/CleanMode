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
