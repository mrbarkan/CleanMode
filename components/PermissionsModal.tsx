import React from 'react';
import { AlertTriangle, Check, ExternalLink, X, ArrowRight } from 'lucide-react';
import { Theme } from '../App';
import { t, Language } from '../utils/translations';
import { Permissions } from '../types/window';
import { T } from '../utils/clocheTokens';

interface PermissionsModalProps {
  isOpen: boolean;
  permissions: Permissions;
  onClose: () => void;
  onOpenAccessibility: () => void;
  onOpenInputMonitoring: () => void;
  onTryAgain: () => void;
  theme: Theme;
  lang: Language;
}

export const PermissionsModal: React.FC<PermissionsModalProps> = ({
  isOpen,
  permissions,
  onClose,
  onOpenAccessibility,
  onOpenInputMonitoring,
  onTryAgain,
  theme,
  lang,
}) => {
  if (!isOpen) return null;

  const isDark = theme === 'dark';
  const c = (l: keyof typeof T, d: keyof typeof T): string => (isDark ? T[d] : T[l]) as string;
  const text = t[lang];

  const rows: { label: string; granted: boolean; onOpen: () => void }[] = [
    { label: text.permissionsAccessibility, granted: permissions.accessibility, onOpen: onOpenAccessibility },
    { label: text.permissionsInputMonitoring, granted: permissions.inputMonitoring, onOpen: onOpenInputMonitoring },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        background: 'rgba(20,16,12,0.40)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460,
          padding: 32, borderRadius: 26,
          background: c('parchment', 'dSurface'),
          border: `1px solid ${c('line', 'dLine')}`,
          boxShadow: '0 40px 80px -20px rgba(0,0,0,0.4)',
          fontFamily: T.sans, color: c('ink', 'dInk'),
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12, marginBottom: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: T.champagne, color: T.brass,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <AlertTriangle size={18} />
            </div>
            <div style={{
              fontFamily: T.serif, fontSize: 26, lineHeight: 1.1,
              fontWeight: 400, letterSpacing: '-0.015em',
              color: c('ink', 'dInk'),
            }}>
              {text.permissionsModalTitle}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'transparent',
              border: `1px solid ${c('line', 'dLine')}`,
              color: c('mute', 'dMute'),
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <X size={12} />
          </button>
        </div>

        <p style={{
          fontSize: 13.5, lineHeight: 1.55,
          color: c('mute', 'dMute'),
          marginTop: 14, marginBottom: 22,
        }}>
          {text.permissionsModalIntro}
        </p>

        {rows.map((row, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', borderRadius: 14,
            background: c('paper', 'dRaised'),
            border: `1px solid ${c('line', 'dLine')}`,
            marginBottom: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 999,
                background: row.granted ? T.emerald + '22' : T.champagne,
                color: row.granted ? T.emerald : T.brassDeep,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {row.granted ? <Check size={13} /> : <AlertTriangle size={13} />}
              </div>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{row.label}</span>
            </div>
            {row.granted ? (
              <span style={{ fontSize: 12, color: T.emerald, fontWeight: 500 }}>Granted</span>
            ) : (
              <button
                onClick={row.onOpen}
                style={{
                  padding: '7px 12px', borderRadius: 10,
                  background: 'transparent',
                  border: `1px solid ${c('line', 'dLine')}`,
                  color: c('ink', 'dInk'),
                  fontFamily: T.sans, fontSize: 12, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <ExternalLink size={12} /> {text.permissionsOpen}
              </button>
            )}
          </div>
        ))}

        <div style={{
          fontSize: 12, color: c('mute', 'dMute'),
          marginTop: 16, lineHeight: 1.55,
        }}>
          {text.permissionsAfterGranting}
        </div>

        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px', borderRadius: 12,
              background: 'transparent',
              border: `1px solid ${c('line', 'dLine')}`,
              color: c('mute', 'dMute'),
              fontFamily: T.sans, fontSize: 13, cursor: 'pointer',
            }}
          >
            Not now
          </button>
          <button
            onClick={onTryAgain}
            style={{
              padding: '10px 18px', borderRadius: 12,
              background: T.brass, color: T.parchment,
              border: 'none', fontFamily: T.sans, fontSize: 13, fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
              boxShadow: `0 8px 18px -6px ${T.brass}99`,
            }}
          >
            {text.permissionsTryAgain} <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
