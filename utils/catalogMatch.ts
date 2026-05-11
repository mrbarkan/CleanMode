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
    return null;
  }
  return scored[0].entry;
}
