import React, { useState, useEffect, useRef } from 'react';
import {
  Globe, Info, Shield, AlertTriangle, ArrowLeft,
  Lock, Command, ExternalLink, Loader2,
  Laptop, Monitor, Mouse,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { t, Language, languages } from '../utils/translations';
import { Theme } from '../App';
import { appVersion } from '../utils/changelog';
import { PermissionsModal } from './PermissionsModal';
import { CareTips } from './CareTips';
import { lookupGuide } from '../utils/lookupGuide';
import { localized, type CleaningEntry, type CatalogFile, type DeviceCategory } from '../utils/cleaningGuide';
import catalogRaw from '../data/cleaning-catalog.json';
import type { Permissions } from '../types/window';
import { T } from '../utils/clocheTokens';
import { ClocheDome } from './ClocheDome';

interface HomeProps {
  onLock: (tips?: string) => void;
  lang: Language;
  setLang: (l: Language) => void;
  onOpenAbout: () => void;
  theme: Theme;
}

const catalog = catalogRaw as CatalogFile;
const CATEGORY_ORDER: DeviceCategory[] = ['laptop', 'desktop', 'peripheral'];
const CATEGORY_ICONS: Record<DeviceCategory, LucideIcon> = {
  laptop: Laptop,
  desktop: Monitor,
  peripheral: Mouse,
};

export const Home: React.FC<HomeProps> = ({ onLock, lang, setLang, onOpenAbout, theme }) => {
  const isDark = theme === 'dark';
  const c = (l: keyof typeof T, d: keyof typeof T): string => (isDark ? T[d] : T[l]) as string;
  const text = t[lang];

  const [deviceModel, setDeviceModel] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('cleanmode-model') || '';
    }
    return '';
  });

  const [isLoading, setIsLoading] = useState(false);
  const [entry, setEntry] = useState<CleaningEntry | null>(null);
  const [error, setError] = useState('');
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rightPanelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [entry]);

  useEffect(() => {
    localStorage.setItem('cleanmode-model', deviceModel);
  }, [deviceModel]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (window.electron?.checkPermissions) {
        try {
          const p = await window.electron.checkPermissions();
          if (!cancelled) setPermissions(p);
        } catch {
          if (!cancelled) setPermissions(null);
        }
      } else {
        if (!cancelled) setPermissions({ accessibility: true, inputMonitoring: true });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const allPermissionsGranted = permissions !== null
    && permissions.accessibility
    && permissions.inputMonitoring;

  const entryAsTips = (): string => {
    if (!entry) return '';
    const kb = localized(entry.surfaces.keyboardTrackpad, lang);
    const sc = localized(entry.surfaces.screenShell, lang);
    return `${kb}\n\n${sc}`;
  };

  const handleStart = async () => {
    const result = await window.electron?.enterCleaningMode?.() ?? { ok: true as const };
    if (result.ok) {
      onLock(entryAsTips());
      return;
    }
    if (result.error === 'permissions-denied') {
      setPermissions(result.permissions);
      setIsPermissionsModalOpen(true);
      return;
    }
    setError(text.fetchError);
  };

  const handleOpenAccessibility = async () => {
    if (window.electron?.promptAccessibility) {
      await window.electron.promptAccessibility();
    }
    if (window.electron?.checkPermissions) {
      setPermissions(await window.electron.checkPermissions());
    }
  };

  const handleOpenInputMonitoring = async () => {
    if (window.electron?.promptInputMonitoring) {
      await window.electron.promptInputMonitoring();
    }
    if (window.electron?.checkPermissions) {
      setPermissions(await window.electron.checkPermissions());
    }
  };

  const handleTryAgain = async () => {
    const result = await window.electron?.enterCleaningMode?.() ?? { ok: true as const };
    if (result.ok) {
      setIsPermissionsModalOpen(false);
      setPermissions({ accessibility: true, inputMonitoring: true });
      onLock(entryAsTips());
    } else if (result.error === 'permissions-denied') {
      setPermissions(result.permissions);
    }
  };

  const handlePickDevice = async (displayName: string) => {
    setDeviceModel(displayName);
    setIsLoading(true);
    setError('');
    setEntry(null);
    try {
      const guide = await lookupGuide(displayName, lang);
      setEntry(guide);
    } catch (err) {
      console.error(err);
      setError(text.fetchError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearResult = () => {
    setEntry(null);
    setDeviceModel('');
    setError('');
  };

  const langLabel = languages.find(l => l.code === lang)?.name ?? lang.toUpperCase();

  const grouped: Record<DeviceCategory, CleaningEntry[]> = {
    laptop: [], desktop: [], peripheral: [],
  };
  for (const e of catalog.entries) {
    if (e.category) grouped[e.category].push(e);
  }
  const categoryLabel = (cat: DeviceCategory): string => {
    if (cat === 'laptop') return text.categoryLaptops;
    if (cat === 'desktop') return text.categoryDesktops;
    return text.categoryPeripherals;
  };

  return (
    <div style={{
      width: '100%', height: '100%',
      background: c('bone', 'dBg'),
      fontFamily: T.sans, color: c('ink', 'dInk'),
      display: 'flex', overflow: 'hidden', position: 'relative',
    }}>
      {/* Drag region for Electron */}
      <div className="drag-region" style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 28,
        zIndex: 50, pointerEvents: 'none',
      }} />

      {/* ─── LEFT SIDEBAR ─── */}
      <aside style={{
        width: 360, flexShrink: 0, height: '100%',
        display: 'flex', flexDirection: 'column',
        borderRight: `1px solid ${c('line', 'dLine')}`,
        background: c('parchment', 'dSurface'),
      }}>
        <div style={{ padding: '44px 36px 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <h1 style={{
              fontFamily: T.serif, fontSize: 40, lineHeight: 1, margin: 0,
              fontWeight: 400, letterSpacing: '-0.025em', color: c('ink', 'dInk'),
            }}>
              Cloche
            </h1>
            <span style={{ fontSize: 12, color: c('muteSoft', 'dMute') }}>
              {appVersion}
            </span>
          </div>
        </div>

        <div style={{ padding: '28px 36px 0', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 24px' }}>
            <ClocheDome size={150} variant={isDark ? 'marble' : 'brass'} />
          </div>

          <p style={{
            fontSize: 13.5, lineHeight: 1.55, color: c('mute', 'dMute'),
            margin: '0 0 20px', textAlign: 'center',
          }}>
            {text.subtitle}
          </p>

          <button onClick={handleStart} style={{
            width: '100%', padding: '15px 22px',
            background: isDark ? T.dBrass : T.brass,
            color: isDark ? T.dBg : T.parchment,
            border: 'none', borderRadius: 12,
            fontFamily: T.sans, fontSize: 14, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            cursor: 'pointer',
            boxShadow: `0 8px 22px -10px ${isDark ? T.dBrass : T.brass}88`,
            transition: 'opacity 0.15s',
          }}>
            <Lock size={15} strokeWidth={1.7} />
            <span>{text.startBtn}</span>
          </button>

          {permissions !== null && !allPermissionsGranted && (
            <div style={{
              marginTop: 14, padding: '11px 14px', borderRadius: 12,
              background: c('champagne', 'dRaised'),
              border: `1px solid ${T.brass}33`,
              display: 'flex', gap: 11, alignItems: 'flex-start',
            }}>
              <AlertTriangle size={15} color={T.brass} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: T.brassDeep, lineHeight: 1.4 }}>
                  {text.permissionsBannerTitle}
                </div>
                <div style={{ fontSize: 11.5, color: T.brassDeep, opacity: 0.8, marginTop: 2 }}>
                  {text.permissionsBannerBody}
                </div>
              </div>
              <button
                onClick={() => setIsPermissionsModalOpen(true)}
                style={{
                  padding: '4px 9px', borderRadius: 6,
                  background: T.brass, color: T.parchment, border: 'none',
                  fontSize: 11, fontWeight: 500, cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                {text.permissionsGrant}
              </button>
            </div>
          )}

          <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column' }}>
            {[
              { icon: <Keyboardish c={c('muteSoft', 'dMute')} />, body: text.blockInputDesc },
              { icon: <Command size={14} color={c('muteSoft', 'dMute')} />, body: text.tripleComboDesc },
            ].map((row, i) => (
              <div key={i} style={{
                display: 'flex', gap: 14, padding: '13px 2px',
                borderTop: i === 0 ? `1px solid ${c('line', 'dLine')}` : 'none',
                borderBottom: `1px solid ${c('line', 'dLine')}`,
              }}>
                <div style={{ flexShrink: 0, marginTop: 1 }}>{row.icon}</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.55, color: c('mute', 'dMute') }}>
                  {row.body}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px', borderTop: `1px solid ${c('line', 'dLine')}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          position: 'relative',
        }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setIsLangMenuOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 8,
                background: 'transparent', border: `1px solid ${c('line', 'dLine')}`,
                fontSize: 11.5, color: c('mute', 'dMute'), cursor: 'pointer',
                fontFamily: T.sans,
              }}
            >
              <Globe size={12} />
              {langLabel}
            </button>

            {isLangMenuOpen && (
              <>
                <div
                  onClick={() => setIsLangMenuOpen(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                />
                <div style={{
                  position: 'absolute', bottom: '100%', left: 0, marginBottom: 6,
                  minWidth: 170, borderRadius: 10, overflow: 'hidden',
                  background: c('parchment', 'dSurface'),
                  border: `1px solid ${c('line', 'dLine')}`,
                  boxShadow: '0 18px 36px -12px rgba(0,0,0,0.25)',
                  zIndex: 50, padding: 4,
                }}>
                  {languages.map((l) => {
                    const active = lang === l.code;
                    return (
                      <button
                        key={l.code}
                        onClick={() => { setLang(l.code); setIsLangMenuOpen(false); }}
                        style={{
                          width: '100%', textAlign: 'left',
                          padding: '8px 12px', borderRadius: 6,
                          background: active ? (isDark ? T.dRaised : T.bone) : 'transparent',
                          color: active ? (isDark ? T.dInk : T.brass) : c('ink', 'dInk'),
                          border: 'none', cursor: 'pointer',
                          fontFamily: T.sans, fontSize: 12.5,
                          fontWeight: active ? 500 : 400,
                        }}
                      >
                        {l.name}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <FooterIconButton dark={isDark} ariaLabel="Privacy">
              <Shield size={13} />
            </FooterIconButton>
            <FooterIconButton dark={isDark} onClick={onOpenAbout} ariaLabel={text.about}>
              <Info size={13} />
            </FooterIconButton>
          </div>
        </div>
      </aside>

      {/* ─── RIGHT PANE ─── */}
      <main ref={rightPanelRef} style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        <div style={{ padding: '40px 56px 36px', maxWidth: 880 }}>
          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <Loader2 size={22} color={T.brass} style={{ animation: 'cloche-spin 1s linear infinite' }} />
              <style>{`@keyframes cloche-spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }`}</style>
            </div>
          )}

          {error && !isLoading && (
            <div style={{
              padding: '12px 16px', borderRadius: 12, marginBottom: 24,
              background: c('champagne', 'dRaised'),
              border: `1px solid ${T.brass}33`,
              color: T.brassDeep, fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          {!entry && !isLoading && (
            <>
              <section style={{ marginBottom: 28 }}>
                <SectionHead
                  dark={isDark}
                  title={text.careTipsHeading}
                />
                <CareTips theme={theme} lang={lang} />
              </section>

              <section>
                <SectionHead
                  dark={isDark}
                  title={text.browseHeading}
                  hint={text.guideSubtitle}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 2 }}>
                  {CATEGORY_ORDER.map((cat) => {
                    const entries = grouped[cat];
                    if (entries.length === 0) return null;
                    const Icon = CATEGORY_ICONS[cat];
                    return (
                      <div key={cat}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                          fontSize: 12, color: c('mute', 'dMute'),
                        }}>
                          <Icon size={13} />
                          {categoryLabel(cat)}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {entries.map((e) => (
                            <Chip
                              key={e.id}
                              label={e.displayName}
                              dark={isDark}
                              onClick={() => handlePickDevice(e.displayName)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {entry && !isLoading && (
            <GuideView
              entry={entry}
              deviceModel={deviceModel}
              lang={lang}
              dark={isDark}
              onBack={handleClearResult}
            />
          )}
        </div>
      </main>

      <PermissionsModal
        isOpen={isPermissionsModalOpen}
        permissions={permissions ?? { accessibility: false, inputMonitoring: false }}
        onClose={() => setIsPermissionsModalOpen(false)}
        onOpenAccessibility={handleOpenAccessibility}
        onOpenInputMonitoring={handleOpenInputMonitoring}
        onTryAgain={handleTryAgain}
        theme={theme}
        lang={lang}
      />
    </div>
  );
};

// — local helpers —

const Keyboardish: React.FC<{ c: string }> = ({ c }) => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="7" width="18" height="11" rx="2" />
    <path d="M7 11h.01M11 11h.01M15 11h.01M7 15h10" />
  </svg>
);

const Chip: React.FC<{ label: string; dark: boolean; onClick: () => void; active?: boolean }> = ({ label, dark, onClick, active }) => (
  <button
    onClick={onClick}
    style={{
      padding: '7px 13px', borderRadius: 999, cursor: 'pointer',
      fontFamily: T.sans, fontSize: 12.5,
      color: active ? (dark ? T.dBg : T.parchment) : (dark ? T.dInk : T.ink),
      background: active ? (dark ? T.dBrass : T.ink) : (dark ? T.dSurface : T.paper),
      border: `1px solid ${active ? 'transparent' : (dark ? T.dLine : T.line)}`,
      transition: 'all 0.15s',
    }}
  >
    {label}
  </button>
);

const SectionHead: React.FC<{ title: string; hint?: string; dark: boolean }> = ({ title, hint, dark }) => (
  <div style={{ marginBottom: 12 }}>
    <h2 style={{
      fontFamily: T.serif, fontSize: 24, lineHeight: 1.1, margin: 0,
      fontWeight: 400, letterSpacing: '-0.015em',
      color: dark ? T.dInk : T.ink,
    }}>
      {title}
    </h2>
    {hint && (
      <div style={{ fontSize: 12.5, color: dark ? T.dMute : T.mute, marginTop: 4 }}>
        {hint}
      </div>
    )}
  </div>
);

const FooterIconButton: React.FC<{
  dark: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}> = ({ dark, children, onClick, ariaLabel }) => (
  <button
    onClick={onClick}
    aria-label={ariaLabel}
    style={{
      width: 30, height: 30, borderRadius: 8,
      background: 'transparent',
      border: `1px solid ${dark ? T.dLine : T.line}`,
      color: dark ? T.dMute : T.muteSoft,
      cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
  >
    {children}
  </button>
);

interface GuideViewProps {
  entry: CleaningEntry;
  deviceModel: string;
  lang: Language;
  dark: boolean;
  onBack: () => void;
}

const GuideView: React.FC<GuideViewProps> = ({ entry, deviceModel, lang, dark, onBack }) => {
  const c = (l: keyof typeof T, d: keyof typeof T): string => (dark ? T[d] : T[l]) as string;
  const text = t[lang];
  const title = entry.source === 'fallback' ? deviceModel : entry.displayName;

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 10px 5px 6px', borderRadius: 6,
          background: 'transparent', border: 'none',
          color: c('mute', 'dMute'),
          fontFamily: T.sans, fontSize: 12.5,
          cursor: 'pointer', marginBottom: 18, marginLeft: -6,
        }}
      >
        <ArrowLeft size={14} /> {text.backToHome}
      </button>

      <h2 style={{
        fontFamily: T.serif, fontSize: 36, lineHeight: 1, margin: 0,
        fontWeight: 400, color: c('ink', 'dInk'), letterSpacing: '-0.02em',
      }}>
        {title}
      </h2>
      <div style={{ fontSize: 13, color: c('mute', 'dMute'), marginTop: 6 }}>
        {entry.source === 'catalog' ? 'From Apple Support' : text.tipsGenericNotice}
      </div>

      <Surface
        heading={text.tipsFor}
        body={localized(entry.surfaces.keyboardTrackpad, lang)}
        dark={dark}
      />
      <Surface
        heading={text.guideTitle}
        body={localized(entry.surfaces.screenShell, lang)}
        dark={dark}
      />

      {entry.sensitivities.length > 0 && (
        <div style={{
          marginTop: 28, padding: '13px 16px',
          background: c('champagne', 'dRaised'),
          borderRadius: 10,
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <div style={{ color: T.brass, flexShrink: 0, marginTop: 2 }}>
            <AlertTriangle size={14} />
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: T.brassDeep }}>
            {entry.sensitivities.map(s => localized(s, lang)).join(' • ')}
          </div>
        </div>
      )}

      {entry.source === 'catalog' && entry.sourceUrl && (
        <div style={{ marginTop: 22 }}>
          <a
            href={entry.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 12.5, color: T.brass, textDecoration: 'none',
              fontFamily: T.sans,
            }}
          >
            <ExternalLink size={13} /> {text.tipsViewSource}
          </a>
        </div>
      )}
    </div>
  );
};

const Surface: React.FC<{ heading: string; body: string; dark: boolean }> = ({ heading, body, dark }) => {
  const c = (l: keyof typeof T, d: keyof typeof T): string => (dark ? T[d] : T[l]) as string;
  if (!body) return null;
  return (
    <div style={{ marginTop: 36 }}>
      <h3 style={{
        fontSize: 14, fontWeight: 500, color: c('ink', 'dInk'),
        margin: 0, marginBottom: 12, letterSpacing: '-0.005em',
      }}>
        {heading}
      </h3>
      <div style={{
        borderTop: `1px solid ${c('line', 'dLine')}`,
        borderBottom: `1px solid ${c('line', 'dLine')}`,
        padding: '14px 0',
        fontSize: 13.5, lineHeight: 1.6,
        color: c('inkSoft', 'dInk'),
        whiteSpace: 'pre-wrap',
      }}>
        {body}
      </div>
    </div>
  );
};
