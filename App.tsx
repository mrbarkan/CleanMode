import React, { useState, useCallback, useEffect } from 'react';
import { Home } from './components/Home';
import { CleaningMode } from './components/CleaningMode';
import { Toaster } from './components/Toaster';
import { AboutModal } from './components/AboutModal';
import { Language } from './utils/translations';
import { T } from './utils/clocheTokens';

export type Theme = 'dark' | 'light';

const App: React.FC = () => {
  const [isLocked, setIsLocked] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [cleaningTips, setCleaningTips] = useState<string>('');
  const [language, setLanguage] = useState<Language>('en');
  
  // Initialize theme from localStorage
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cleanmode-theme');
      return (saved === 'dark' || saved === 'light') ? saved : 'dark';
    }
    return 'dark';
  });
  
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  // Save theme to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('cleanmode-theme', theme);
  }, [theme]);

  const handleLock = (tips?: string) => {
    if (tips) {
      setCleaningTips(tips);
    }
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch((err) => {
        console.warn("Fullscreen denied", err);
      });
    }
    setIsLocked(true);
  };

  const handleUnlock = useCallback(() => {
    setIsLocked(false);
    setShowToast(true);
    if (document.exitFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch((err) => console.warn(err));
    }
    setTimeout(() => setShowToast(false), 3000);
  }, []);

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
        background: theme === 'dark' ? T.dBg : T.bone,
        color: theme === 'dark' ? T.dInk : T.ink,
        fontFamily: T.sans,
        transition: 'background-color 0.3s, color 0.3s',
      }}
    >
      {isLocked ? (
        <CleaningMode 
          onUnlock={handleUnlock} 
          tips={cleaningTips} 
          lang={language}
          theme={theme}
        />
      ) : (
        <Home 
          onLock={handleLock} 
          lang={language} 
          setLang={setLanguage}
          onOpenAbout={() => setIsAboutOpen(true)}
          theme={theme}
        />
      )}
      
      <Toaster message="Device Unlocked" isVisible={showToast} />
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
        theme={theme}
        setTheme={setTheme}
        lang={language}
      />
    </div>
  );
};

export default App;