import React from 'react';
import { Laptop, Monitor, Mouse } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Theme } from '../App';
import { t, Language } from '../utils/translations';
import type { CleaningEntry, CatalogFile, DeviceCategory } from '../utils/cleaningGuide';
import catalogRaw from '../data/cleaning-catalog.json';

const catalog = catalogRaw as CatalogFile;

interface DevicePickerProps {
  theme: Theme;
  lang: Language;
  onPick: (displayName: string) => void;
}

const CATEGORY_ORDER: DeviceCategory[] = ['laptop', 'desktop', 'peripheral'];

const CATEGORY_ICONS: Record<DeviceCategory, LucideIcon> = {
  laptop: Laptop,
  desktop: Monitor,
  peripheral: Mouse,
};

export const DevicePicker: React.FC<DevicePickerProps> = ({ theme, lang, onPick }) => {
  const isDark = theme === 'dark';
  const text = t[lang];

  const grouped: Record<DeviceCategory, CleaningEntry[]> = {
    laptop: [],
    desktop: [],
    peripheral: [],
  };
  for (const entry of catalog.entries) {
    if (entry.category) grouped[entry.category].push(entry);
  }

  const labelFor = (cat: DeviceCategory): string => {
    if (cat === 'laptop') return text.categoryLaptops;
    if (cat === 'desktop') return text.categoryDesktops;
    return text.categoryPeripherals;
  };

  return (
    <section className="w-full">
      <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3
        ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
        {text.browseHeading}
      </h3>
      <div className="space-y-4">
        {CATEGORY_ORDER.map((cat) => {
          const entries = grouped[cat];
          if (entries.length === 0) return null;
          const Icon = CATEGORY_ICONS[cat];
          return (
            <div key={cat}>
              <div className={`flex items-center gap-2 mb-2 text-xs font-medium
                ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
                <Icon className="w-3.5 h-3.5" />
                {labelFor(cat)}
              </div>
              <div className="flex flex-wrap gap-2">
                {entries.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => onPick(entry.displayName)}
                    className={`px-3 py-1.5 rounded-full border text-xs transition-colors
                      ${isDark
                        ? 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-700'
                        : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300'}`}
                  >
                    {entry.displayName}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
