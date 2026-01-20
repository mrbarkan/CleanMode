import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Lock, Command, Unlock, Sparkles } from 'lucide-react';
import { t, Language } from '../utils/translations';
import { Theme } from '../App';

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
  const rippleIdCounter = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const text = t[lang];
  const isDark = theme === 'dark';

  // Unlock Logic State
  const [unlockStep, setUnlockStep] = useState(0); // 0, 1, 2, 3
  const pressedKeys = useRef<Set<string>>(new Set());
  const comboActive = useRef(false);
  const resetTimer = useRef<number | null>(null);

  // Add a ripple effect at coordinates
  const addRipple = useCallback((x: number, y: number, isKey = false) => {
    const id = rippleIdCounter.current++;
    const size = isKey ? 100 + Math.random() * 50 : 50 + Math.random() * 50;
    
    setRipples((prev) => [...prev, { id, x, y, size }]);

    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 800);
  }, []);

  useEffect(() => {
    // Attempt to lock all keys using the Keyboard Lock API (Chrome/Edge only)
    // This allows capturing keys like Escape, F1-F12, etc. that are normally reserved.
    const lockKeyboard = async () => {
      try {
        // @ts-ignore
        if (navigator.keyboard && navigator.keyboard.lock) {
          // @ts-ignore
          await navigator.keyboard.lock(); 
          console.log("Keyboard locked (System keys captured)");
        }
      } catch (err) {
        console.warn("Keyboard lock failed or not supported:", err);
      }
    };

    lockKeyboard();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow F11 to toggle fullscreen (browser native), block everything else including Escape
      if (e.key !== 'F11') { 
          e.preventDefault();
          e.stopPropagation();
      }

      pressedKeys.current.add(e.code);

      const isLeftCmd = pressedKeys.current.has('MetaLeft');
      const isRightCmd = pressedKeys.current.has('MetaRight');

      if (isLeftCmd && isRightCmd) {
          if (!comboActive.current) {
              comboActive.current = true;
              
              setUnlockStep(prev => {
                  const next = prev + 1;
                  if (next >= 3) {
                      setTimeout(onUnlock, 150);
                      return 3;
                  }
                  return next;
              });

              if (resetTimer.current) clearTimeout(resetTimer.current);
              resetTimer.current = window.setTimeout(() => {
                  setUnlockStep(0);
              }, 2000); 
          }
      }

      if (containerRef.current) {
         const width = containerRef.current.clientWidth;
         const height = containerRef.current.clientHeight;
         const x = (width / 2) + (Math.random() * 400 - 200);
         const y = (height / 2) + (Math.random() * 200 - 100);
         addRipple(x, y, true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key !== 'F11') e.preventDefault();
        pressedKeys.current.delete(e.code);
        if (!pressedKeys.current.has('MetaLeft') || !pressedKeys.current.has('MetaRight')) {
            comboActive.current = false;
        }
    };

    const handleMouseDown = (e: MouseEvent) => {
        e.preventDefault();
        addRipple(e.clientX, e.clientY);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('contextmenu', (e) => e.preventDefault());
      if (resetTimer.current) clearTimeout(resetTimer.current);
      
      // Unlock keyboard
      // @ts-ignore
      if (navigator.keyboard && navigator.keyboard.unlock) {
        // @ts-ignore
        navigator.keyboard.unlock();
      }
    };
  }, [addRipple, onUnlock]);

  return (
    <div 
        ref={containerRef}
        className={`fixed inset-0 z-50 cursor-none flex flex-col items-center justify-center select-none overflow-hidden transition-colors duration-500
        ${isDark ? 'bg-black text-white' : 'bg-white text-neutral-900'}`}
    >
      {/* Instruction Overlay - Subtle */}
      <div className="absolute top-12 left-0 right-0 text-center pointer-events-none opacity-50 z-20">
        <div className={`flex items-center justify-center gap-2 mb-2 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
            <Lock className="w-4 h-4" />
            <span className="text-sm font-medium tracking-widest uppercase">{text.cleaningModeActive}</span>
        </div>
      </div>

      {/* Tips Overlay - Visible if tips exist */}
      {tips && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 w-full max-w-md px-6 pointer-events-none z-20 opacity-90">
            <div className={`backdrop-blur-md border rounded-2xl p-6 shadow-2xl max-h-[40vh] overflow-hidden
                ${isDark ? 'bg-neutral-900/80 border-white/10' : 'bg-white/80 border-neutral-200 shadow-neutral-200/50'}`}>
                <div className="flex items-center gap-2 mb-3 text-blue-500">
                    <Sparkles className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">{text.guideTitle}</span>
                </div>
                <div className={`text-sm whitespace-pre-wrap leading-relaxed line-clamp-[10] ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                    {tips}
                </div>
            </div>
        </div>
      )}

      {/* Central Unlock Indicator */}
      <div className="pointer-events-none flex flex-col items-center gap-8 z-10 mt-32">
        
        {/* Animated Lock Icon & Progress Steps */}
        <div className="flex flex-col items-center gap-6">
             <div className={`w-24 h-24 rounded-3xl flex items-center justify-center transition-all duration-300 
                ${isDark 
                    ? (unlockStep === 3 ? 'bg-neutral-800' : 'bg-neutral-900')
                    : (unlockStep === 3 ? 'bg-neutral-100' : 'bg-neutral-50')
                }`}>
                {unlockStep === 3 ? (
                    <Unlock className="w-10 h-10 text-green-500 animate-pulse" />
                ) : (
                    <Lock className={`w-10 h-10 transition-colors duration-300 ${unlockStep > 0 ? 'text-blue-500' : (isDark ? 'text-neutral-600' : 'text-neutral-300')}`} />
                )}
             </div>
             
             {/* 3 Steps Indicator */}
             <div className="flex gap-3">
                {[0, 1, 2].map((i) => (
                    <div 
                        key={i}
                        className={`h-2 rounded-full transition-all duration-300 ${
                            i < unlockStep 
                                ? 'w-8 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' 
                                : `w-2 ${isDark ? 'bg-neutral-800' : 'bg-neutral-200'}`
                        }`}
                    />
                ))}
             </div>
        </div>

        <div className="space-y-1 text-center opacity-40 transition-opacity duration-500 hover:opacity-100">
            <p className={`text-2xl font-semibold ${isDark ? 'text-neutral-300' : 'text-neutral-900'}`}>{text.wipeScreen}</p>
            <div className={`flex flex-col items-center justify-center gap-2 text-sm mt-2 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                <div className="flex items-center gap-2">
                    <span>{text.pressBoth}</span>
                    <kbd className={`px-2 py-1 rounded border flex items-center gap-1
                        ${isDark ? 'bg-neutral-800 border-neutral-700 text-neutral-300' : 'bg-white border-neutral-300 text-neutral-600'}`}>
                        <Command className="w-3 h-3" /> Cmd
                    </kbd>
                    <span>{text.keys}</span>
                </div>
                <span>{text.unlockInst}</span>
            </div>
             <p className={`text-[10px] mt-4 max-w-xs mx-auto ${isDark ? 'text-neutral-600' : 'text-neutral-400'}`}>
                Note: Hardwired keys (Power, Touch ID, some media controls) cannot be blocked by browsers.
            </p>
        </div>
      </div>

      {/* Ripples Layer */}
      {ripples.map((ripple) => (
        <div
          key={ripple.id}
          className={`absolute rounded-full pointer-events-none animate-ripple border
            ${isDark ? 'border-white/20 bg-white/5' : 'border-neutral-900/10 bg-neutral-900/5'}`}
          style={{
            left: ripple.x,
            top: ripple.y,
            width: ripple.size,
            height: ripple.size,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}

      <style>{`
        @keyframes ripple {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
        }
        .animate-ripple {
            animation: ripple 0.8s ease-out forwards;
        }
      `}</style>
      
      {/* Emergency Unlock */}
      <div className="absolute bottom-8 right-8 opacity-0 hover:opacity-100 transition-opacity duration-1000 z-50 pointer-events-auto">
          <button 
            onClick={onUnlock}
            className={`text-xs cursor-pointer ${isDark ? 'text-neutral-700 hover:text-neutral-400' : 'text-neutral-300 hover:text-neutral-500'}`}
          >
            {text.emergencyUnlock}
          </button>
      </div>
    </div>
  );
};