import React from 'react';
import { Droplets, Keyboard, Sparkles, MoveHorizontal, Power, Ban } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Theme } from '../App';
import { Language } from '../utils/translations';
import { localized, type Localized } from '../utils/cleaningGuide';
import careTipsRaw from '../data/care-tips.json';
import { T } from '../utils/clocheTokens';

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
  const lineColor = isDark ? T.dLine : T.line;
  const inkColor = isDark ? T.dInk : T.ink;
  const muteColor = isDark ? T.dMute : T.mute;

  return (
    <section style={{ width: '100%' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 0,
        borderTop: `1px solid ${lineColor}`,
      }}>
        {tips.map((tip, i) => {
          const Icon = ICONS[tip.icon] ?? Sparkles;
          const useSage = i % 2 === 1;
          const fg = useSage ? T.sage : T.brass;
          const onRight = i % 2 === 1;
          return (
            <div
              key={tip.id}
              style={{
                padding: onRight ? '14px 0 14px 22px' : '14px 22px 14px 0',
                borderBottom: `1px solid ${lineColor}`,
                borderLeft: onRight ? `1px solid ${lineColor}` : 'none',
                display: 'flex', gap: 12,
              }}
            >
              <div style={{ color: fg, flexShrink: 0, marginTop: 2 }}>
                <Icon size={16} strokeWidth={1.6} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 13.5, fontWeight: 500,
                  color: inkColor, marginBottom: 3,
                }}>
                  {localized(tip.title, lang)}
                </div>
                <div style={{
                  fontSize: 12, lineHeight: 1.5, color: muteColor,
                }}>
                  {localized(tip.body, lang)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
