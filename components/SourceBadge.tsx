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
