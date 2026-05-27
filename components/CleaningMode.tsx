import React, { useEffect, useState, useRef, useCallback } from 'react';
import { t, Language } from '../utils/translations';
import { Theme } from '../App';
import { T } from '../utils/clocheTokens';
import { ClocheDome } from './ClocheDome';

interface CleaningModeProps {
  onUnlock: () => void;
  tips?: string;
  lang: Language;
  theme: Theme;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
}

export const CleaningMode: React.FC<CleaningModeProps> = ({ onUnlock, tips, lang, theme }) => {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [unlockStep, setUnlockStep] = useState(0);
  const [now, setNow] = useState(0);

  const rippleIdCounter = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const pressedKeys = useRef<Set<string>>(new Set());
  const comboActive = useRef(false);
  const resetTimer = useRef<number | null>(null);

  const text = t[lang];
  const isDark = theme === 'dark';
  const c = (l: keyof typeof T, d: keyof typeof T): string => (isDark ? T[d] : T[l]) as string;
  const accent = isDark ? T.dBrass : T.brass; // artichoke in dark, claret in light

  const handleUnlockSequence = useCallback(() => {
    if (window.electron) {
      window.electron.exitCleaningMode();
    }
    onUnlock();
  }, [onUnlock]);

  const addRipple = useCallback((x: number, y: number, isKey = false) => {
    const id = rippleIdCounter.current++;
    const size = isKey ? 100 + Math.random() * 80 : 70 + Math.random() * 60;
    setRipples((prev) => [...prev, { id, x, y, size }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 1100);
  }, []);

  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(
      () => setNow(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const lockKeyboard = async () => {
      try {
        // @ts-ignore
        if (navigator.keyboard && navigator.keyboard.lock) {
          // @ts-ignore
          await navigator.keyboard.lock();
        }
      } catch (err) {
        console.warn('Keyboard lock failed or not supported:', err);
      }
    };
    lockKeyboard();

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      pressedKeys.current.add(e.code);

      const isLeftCmd = pressedKeys.current.has('MetaLeft');
      const isRightCmd = pressedKeys.current.has('MetaRight');

      if (isLeftCmd && isRightCmd) {
        if (!comboActive.current) {
          comboActive.current = true;
          setUnlockStep(prev => {
            const next = prev + 1;
            if (next >= 3) {
              setTimeout(handleUnlockSequence, 250);
              return 3;
            }
            return next;
          });
          if (resetTimer.current) clearTimeout(resetTimer.current);
          resetTimer.current = window.setTimeout(() => setUnlockStep(0), 2200);
        }
      }

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = rect.width / 2 + (Math.random() * 400 - 200);
        const y = rect.height / 2 + (Math.random() * 200 - 100);
        addRipple(x, y, true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      pressedKeys.current.delete(e.code);
      if (!pressedKeys.current.has('MetaLeft') || !pressedKeys.current.has('MetaRight')) {
        comboActive.current = false;
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      addRipple(e.clientX - rect.left, e.clientY - rect.top);
    };

    const blockContext = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('contextmenu', blockContext);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('contextmenu', blockContext);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      // @ts-ignore
      if (navigator.keyboard && navigator.keyboard.unlock) {
        // @ts-ignore
        navigator.keyboard.unlock();
      }
    };
  }, [addRipple, handleUnlockSequence]);

  const mm = String(Math.floor(now / 60)).padStart(2, '0');
  const ss = String(now % 60).padStart(2, '0');

  const tipLines = (tips ?? '').split('\n').filter(Boolean).slice(0, 5);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        overflow: 'hidden', cursor: 'none',
        fontFamily: T.sans,
        background: isDark
          ? `radial-gradient(circle at 50% 42%, ${T.dFadeHi} 0%, ${T.dFadeMid} 55%, ${T.dFadeLo} 100%)`
          : T.bone,
        color: c('ink', 'dInk'),
        userSelect: 'none',
      }}
    >
      {/* paper grain */}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.06, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
        <filter id="cloche-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} />
          <feColorMatrix values="0 0 0 0 0.8  0 0 0 0 0.7  0 0 0 0 0.5  0 0 0 0.6 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#cloche-grain)" />
      </svg>

      {/* top status pill — kept clear of the MacBook Pro notch */}
      <div style={{
        position: 'absolute', top: 52, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '7px 14px', borderRadius: 999,
        background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.6)',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : T.line}`,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        fontSize: 12, color: c('mute', 'dMute'),
        zIndex: 20,
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: 999,
          background: accent, boxShadow: `0 0 10px ${accent}`,
          animation: 'cloche-pulse 1.8s ease-in-out infinite',
        }} />
        <span style={{ color: c('ink', 'dInk'), fontWeight: 500 }}>
          {text.cleaningModeActive}
        </span>
        <span style={{ width: 1, height: 11, background: isDark ? T.dLine : T.line }} />
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{mm}:{ss}</span>
      </div>

      {/* tips card */}
      {tipLines.length > 0 && (
        <aside style={{
          position: 'absolute', top: 74, left: 28, width: 300,
          padding: 20, borderRadius: 14,
          background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.55)',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : T.line}`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          zIndex: 20,
        }}>
          <div style={{ fontSize: 11.5, color: c('mute', 'dMute'), marginBottom: 6 }}>
            {text.guideTitle}
          </div>
          <div style={{
            fontSize: 15, lineHeight: 1.3, fontWeight: 500,
            color: c('ink', 'dInk'), marginBottom: 14,
          }}>
            {text.wipeScreen}
          </div>
          <ul style={{
            listStyle: 'none', margin: 0, padding: 0,
            display: 'flex', flexDirection: 'column', gap: 7,
            fontSize: 12, lineHeight: 1.5, color: c('mute', 'dMute'),
          }}>
            {tipLines.map((line, i) => (
              <li key={i} style={{ display: 'flex', gap: 10 }}>
                <span style={{ color: c('muteSoft', 'dMute'), flexShrink: 0, minWidth: 14 }}>
                  {i + 1}.
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </aside>
      )}

      {/* center stage */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        zIndex: 10, pointerEvents: 'none',
      }}>
        <div style={{
          position: 'absolute', top: -50, left: '50%', transform: 'translateX(-50%)',
          width: 460, height: 460, borderRadius: '50%',
          background: isDark
            ? 'radial-gradient(circle, rgba(244,238,232,0.08) 0%, rgba(244,238,232,0) 65%)'
            : 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 65%)',
          pointerEvents: 'none',
        }} />

        <div style={{
          position: 'relative',
          transition: 'transform 0.6s ease',
          transform: unlockStep === 3 ? 'translateY(-24px)' : 'translateY(0)',
        }}>
          <ClocheDome size={260} variant={isDark ? 'marble' : 'brass'} />
        </div>

        <div style={{
          marginTop: 36, padding: '11px 18px', borderRadius: 999,
          background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.65)',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : T.line}`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span style={{ fontSize: 12.5, color: c('mute', 'dMute') }}>
            {text.pressBoth} <KbdInline dark={isDark}>{'⌘'}</KbdInline>{' '}
            <KbdInline dark={isDark}>{'⌘'}</KbdInline> {text.unlockInst}
          </span>

          <div style={{ display: 'flex', gap: 5 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: i < unlockStep ? 18 : 5,
                height: 5, borderRadius: 999,
                background: i < unlockStep ? accent : (isDark ? T.dLine : T.line),
                boxShadow: i < unlockStep ? `0 0 8px ${accent}` : 'none',
                transition: 'all 0.25s',
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* emergency unlock */}
      <button
        onClick={handleUnlockSequence}
        style={{
          position: 'absolute', bottom: 18, right: 18,
          padding: '6px 12px', borderRadius: 999,
          background: 'transparent',
          border: `1px solid ${isDark ? T.dLine : T.line}`,
          color: c('muteSoft', 'dMute'),
          fontSize: 11, cursor: 'pointer',
          opacity: 0.4, transition: 'opacity 0.25s',
          fontFamily: T.sans,
          zIndex: 30,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.4')}
      >
        {text.emergencyUnlock}
      </button>

      {/* ripples */}
      {ripples.map((r) => (
        <div
          key={r.id}
          style={{
            position: 'absolute',
            left: r.x, top: r.y,
            width: r.size, height: r.size,
            marginLeft: -r.size / 2, marginTop: -r.size / 2,
            borderRadius: '50%',
            pointerEvents: 'none',
            border: `1px solid ${accent}`,
            background: `radial-gradient(circle, ${accent}22 0%, transparent 60%)`,
            animation: 'cloche-ripple 1s ease-out forwards',
          }}
        />
      ))}

      <style>{`
        @keyframes cloche-ripple {
          0%   { transform: scale(0.4); opacity: 1; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes cloche-pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};

const KbdInline: React.FC<{ children: React.ReactNode; dark: boolean }> = ({ children, dark }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 20, height: 20, padding: '0 5px', borderRadius: 5,
    background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.9)',
    border: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : T.line}`,
    fontFamily: T.sans, fontSize: 11.5,
    color: dark ? T.dInk : T.ink,
    verticalAlign: 'middle',
  }}>
    {children}
  </span>
);
