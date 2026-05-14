import type { Language } from './translations';

export type Localized = Record<Language, string>;

export type DeviceCategory = 'laptop' | 'desktop' | 'peripheral';

export type CleaningEntry = {
  id: string;
  displayName: string;
  aliases: string[];
  category?: DeviceCategory;
  surfaces: {
    keyboardTrackpad: Partial<Localized>;
    screenShell: Partial<Localized>;
  };
  sensitivities: Partial<Localized>[];
  sourceUrl?: string;
  source: 'catalog' | 'ai' | 'fallback';
};

export type CatalogFile = {
  version: number;
  updatedAt: string;
  entries: CleaningEntry[];
};

export function localized(field: Partial<Localized>, lang: Language): string {
  return field[lang] ?? field.en ?? '';
}
