import React from 'react';
import { Droplets, Keyboard, Sparkles, MoveHorizontal, Power, Ban } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Theme } from '../App';
import { t, Language } from '../utils/translations';
import { localized, type Localized } from '../utils/cleaningGuide';
import careTipsRaw from '../data/care-tips.json';

type CareTip = {
  id: string;
  icon: string;
  title: Partial<Localized>;
  body: Partial<Localized>;
};

const tips = (careTipsRaw as { tips: CareTip[] }).tips;

const ICONS: Record<string, LucideIcon> = {
  Droplets,
  Keyboard,
  Sparkles,
  MoveHorizontal,
  Power,
  Ban,
};

interface CareTipsProps {
  theme: Theme;
  lang: Language;
}

export const CareTips: React.FC<CareTipsProps> = ({ theme, lang }) => {
  const isDark = theme === 'dark';
  const text = t[lang];

  return (
    <section className="w-full">
      <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3
        ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
        {text.careTipsHeading}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {tips.map((tip) => {
          const Icon = ICONS[tip.icon] ?? Sparkles;
          return (
            <div
              key={tip.id}
              className={`flex gap-3 p-3 rounded-xl border
                ${isDark ? 'bg-neutral-900/40 border-neutral-800' : 'bg-white/60 border-neutral-200'}`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                ${isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium leading-tight ${isDark ? 'text-neutral-200' : 'text-neutral-900'}`}>
                  {localized(tip.title, lang)}
                </p>
                <p className={`text-xs mt-1 leading-relaxed ${isDark ? 'text-neutral-500' : 'text-neutral-600'}`}>
                  {localized(tip.body, lang)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
