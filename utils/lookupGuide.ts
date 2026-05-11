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

  return { ...fallback, displayName: query.trim() || fallback.displayName, source: 'fallback' };
}
