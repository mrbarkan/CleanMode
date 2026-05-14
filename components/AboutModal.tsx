import React from 'react';
import { X, Coffee, Mail, Moon, Sun, Shield, Command } from 'lucide-react';
import { Theme } from '../App';
import { appVersion } from '../utils/changelog';
import { t, Language } from '../utils/translations';
import { T } from '../utils/clocheTokens';
import { ClocheDome } from './ClocheDome';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  lang: Language;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, theme, setTheme, lang }) => {
  if (!isOpen) return null;

  const isDark = theme === 'dark';
  const c = (l: keyof typeof T, d: keyof typeof T): string => (isDark ? T[d] : T[l]) as string;
  const text = t[lang];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
      background: 'rgba(20,16,12,0.40)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460,
          padding: 32, borderRadius: 26,
          background: c('parchment', 'dSurface'),
          border: `1px solid ${c('line', 'dLine')}`,
          boxShadow: '0 40px 80px -20px rgba(0,0,0,0.4)',
          fontFamily: T.sans, color: c('ink', 'dInk'),
          position: 'relative',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{ position: 'absolute', top: 20, right: 20 }}>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 30, height: 30, borderRadius: 999,
              background: 'transparent',
              border: `1px solid ${c('line', 'dLine')}`,
              color: c('mute', 'dMute'),
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={13} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
          <ClocheDome size={48} variant={isDark ? 'marble' : 'brass'} withPlate={false} />
          <div>
            <div style={{
              fontFamily: T.serif, fontSize: 30, lineHeight: 1,
              fontWeight: 400, letterSpacing: '-0.02em',
            }}>
              Cloche
            </div>
            <div style={{ fontSize: 12, color: c('mute', 'dMute'), marginTop: 4 }}>
              {`v${appVersion} · by MRBRKN`}
            </div>
          </div>
        </div>

        {/* Privacy */}
        <div style={{
          marginTop: 22, padding: '14px 16px',
          borderRadius: 14,
          background: c('champagne', 'dRaised'),
          border: `1px solid ${T.brass}33`,
          display: 'flex', gap: 14, alignItems: 'center',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 999,
            background: isDark ? T.dBrass : T.brass,
            color: isDark ? T.dBg : T.parchment,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Shield size={15} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 13.5, fontWeight: 500,
              color: isDark ? T.dInk : T.brassDeep,
            }}>
              {text.aboutPrivacyTitle}
            </div>
            <div style={{
              fontSize: 12.5, marginTop: 3,
              color: isDark ? T.dMute : T.brassDeep,
              opacity: isDark ? 1 : 0.8,
            }}>
              {text.aboutPrivacyBody}
            </div>
          </div>
        </div>

        {/* Appearance */}
        <div style={{
          marginTop: 14, padding: '14px 16px', borderRadius: 14,
          background: c('paper', 'dRaised'),
          border: `1px solid ${c('line', 'dLine')}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>
              {text.aboutAppearance}
            </div>
            <div style={{ fontSize: 12.5, color: c('mute', 'dMute'), marginTop: 3 }}>
              {isDark ? text.aboutAppearanceDark : text.aboutAppearanceLight}
            </div>
          </div>
          <div style={{
            display: 'flex', padding: 3, gap: 2,
            background: c('bone', 'dBg'), borderRadius: 999,
            border: `1px solid ${c('line', 'dLine')}`,
          }}>
            <button
              onClick={() => setTheme('light')}
              style={{
                padding: '6px 10px', borderRadius: 999, border: 'none',
                background: isDark ? 'transparent' : T.ink,
                color: isDark ? c('mute', 'dMute') : T.parchment,
                fontFamily: T.sans, fontSize: 11, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Sun size={12} /> Linen
            </button>
            <button
              onClick={() => setTheme('dark')}
              style={{
                padding: '6px 10px', borderRadius: 999, border: 'none',
                background: isDark ? T.dBrass : 'transparent',
                color: isDark ? T.dBg : c('mute', 'dMute'),
                fontFamily: T.sans, fontSize: 11, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Moon size={12} /> Espresso
            </button>
          </div>
        </div>

        {/* Shortcuts */}
        <div style={{
          marginTop: 14, padding: 16, borderRadius: 14,
          background: c('paper', 'dRaised'),
          border: `1px solid ${c('line', 'dLine')}`,
        }}>
          <div style={{
            fontSize: 13.5, fontWeight: 500, marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Command size={13} /> {text.aboutShortcutsTitle}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ShortcutRow
              keys={['⌘', '⌘', '×3']}
              label={text.aboutShortcutUnlock}
              sub={text.aboutShortcutUnlockDesc}
              dark={isDark}
            />
            <ShortcutRow
              keys={['↘', 'hover']}
              label={text.aboutShortcutEmergency}
              sub={text.aboutShortcutEmergencyDesc}
              dark={isDark}
            />
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
          <FooterAction
            icon={<Mail size={14} />}
            title={text.aboutContact}
            sub="dbarkan@gmail.com"
            href="mailto:dbarkan@gmail.com"
            dark={isDark}
          />
          <FooterAction
            icon={<Coffee size={14} />}
            title={text.aboutCoffee}
            sub={text.aboutCoffeeDesc}
            href="https://paypal.me/dbarkan"
            external
            highlight
            dark={isDark}
          />
        </div>
      </div>
    </div>
  );
};

const ShortcutRow: React.FC<{
  keys: string[];
  label: string;
  sub: string;
  dark: boolean;
}> = ({ keys, label, sub, dark }) => {
  const c = (l: keyof typeof T, d: keyof typeof T): string => (dark ? T[d] : T[l]) as string;
  const kbd: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 22, height: 22, padding: '0 6px', borderRadius: 6,
    background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.9)',
    border: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : T.line}`,
    fontFamily: T.sans, fontSize: 11.5,
    color: dark ? T.dInk : T.ink,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0, paddingTop: 1 }}>
        {keys.map((k, i) => (
          <span key={i} style={kbd}>{k}</span>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 12, color: c('mute', 'dMute'), marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  );
};

const FooterAction: React.FC<{
  icon: React.ReactNode;
  title: string;
  sub: string;
  href: string;
  external?: boolean;
  highlight?: boolean;
  dark: boolean;
}> = ({ icon, title, sub, href, external, highlight, dark }) => {
  const c = (l: keyof typeof T, d: keyof typeof T): string => (dark ? T[d] : T[l]) as string;
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      style={{
        flex: 1, padding: '12px 14px', borderRadius: 12,
        background: highlight ? (dark ? T.dRaised : T.champagne) : c('paper', 'dRaised'),
        border: `1px solid ${highlight ? T.brass + '33' : c('line', 'dLine')}`,
        display: 'flex', alignItems: 'center', gap: 12,
        textDecoration: 'none',
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 10,
        background: highlight ? (dark ? T.dBrass : T.brass) : c('bone', 'dBg'),
        color: highlight ? (dark ? T.dBg : T.parchment) : (dark ? T.dBrass : T.brassDeep),
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, fontWeight: 500,
          color: highlight ? (dark ? T.dInk : T.brassDeep) : c('ink', 'dInk'),
        }}>
          {title}
        </div>
        <div style={{
          fontSize: 11, marginTop: 2,
          color: highlight ? (dark ? T.dMute : T.brassDeep + 'B0') : c('mute', 'dMute'),
        }}>
          {sub}
        </div>
      </div>
    </a>
  );
};
