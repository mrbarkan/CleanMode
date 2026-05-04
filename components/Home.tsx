import React, { useState, useEffect } from 'react';
import { Shield, Sparkles, Command, Keyboard, Loader2, Laptop, Globe, Info, AlertTriangle, ExternalLink } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { t, Language, languages } from '../utils/translations';
import { Theme } from '../App';
import { appVersion } from '../utils/changelog';
import { AccessibilityModal } from './AccessibilityModal';

interface HomeProps {
  onLock: (tips?: string) => void;
  lang: Language;
  setLang: (l: Language) => void;
  onOpenAbout: () => void;
  theme: Theme;
}

export const Home: React.FC<HomeProps> = ({ onLock, lang, setLang, onOpenAbout, theme }) => {
  // Initialize deviceModel from localStorage
  const [deviceModel, setDeviceModel] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('cleanmode-model') || '';
    }
    return '';
  });

  const [isLoading, setIsLoading] = useState(false);
  const [tips, setTips] = useState<string>('');
  const [sources, setSources] = useState<Array<{uri: string, title: string}>>([]);
  const [error, setError] = useState('');
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [accessibilityAvailable, setAccessibilityAvailable] = useState<boolean | null>(null);
  const [isAccessibilityModalOpen, setIsAccessibilityModalOpen] = useState(false);

  const text = t[lang];
  const isDark = theme === 'dark';

  // Save deviceModel to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('cleanmode-model', deviceModel);
  }, [deviceModel]);

  // Check Accessibility permission once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (window.electron?.checkAccessibility) {
        try {
          const ok = await window.electron.checkAccessibility();
          if (!cancelled) setAccessibilityAvailable(ok);
        } catch {
          if (!cancelled) setAccessibilityAvailable(null);
        }
      } else {
        // Browser/non-Electron — banner not applicable.
        if (!cancelled) setAccessibilityAvailable(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleStart = async () => {
    const result = await window.electron?.enterCleaningMode?.() ?? { ok: true as const };
    if (result.ok) {
      onLock(tips);
      return;
    }
    if (result.error === 'accessibility-denied') {
      setIsAccessibilityModalOpen(true);
      return;
    }
    setError(text.fetchError);
  };

  const handleGrant = async () => {
    if (window.electron?.promptAccessibility) {
      const granted = await window.electron.promptAccessibility();
      setAccessibilityAvailable(granted);
    }
  };

  const handleTryAgain = async () => {
    const result = await window.electron?.enterCleaningMode?.() ?? { ok: true as const };
    if (result.ok) {
      setIsAccessibilityModalOpen(false);
      setAccessibilityAvailable(true);
      onLock(tips);
    }
  };

  const generateTips = async () => {
    if (!deviceModel.trim()) return;

    // Check if API Key is available
    if (!process.env.API_KEY || process.env.API_KEY.includes("undefined")) {
        setError("API Key missing. Please check your .env file and rebuild.");
        return;
    }
    
    setIsLoading(true);
    setError('');
    setTips('');
    setSources([]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const languageName = languages.find(l => l.code === lang)?.name || 'English';
      
      const prompt = `User Input: "${deviceModel}".
      Task: Provide specific, manufacturer-recommended cleaning instructions for this exact device using Google Search.
      
      Logic:
      1. Is the input clearly a laptop, computer, keyboard, mouse, or screen? 
      2. If NO: Return a polite refusal in ${languageName}.
      3. If YES: Provide instructions in ${languageName}. Structure:
         - **Keyboard, Trackpad, & Internal Surface**
         - **Screen & Outer Shell**
         
      Mention if the device has specific sensitivities (e.g. Nano-texture glass, Alcantara fabric).`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          systemInstruction: "You are a specialized electronics cleaning assistant.",
          tools: [{googleSearch: {}}],
        },
      });
      
      if (response.text) {
        setTips(response.text);
        
        // Extract Grounding Sources
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (chunks) {
            const foundSources = chunks
                .map((chunk: any) => chunk.web)
                .filter((web: any) => web && web.uri && web.title);
            setSources(foundSources);
        }
      }
    } catch (err) {
      console.error(err);
      setError(text.fetchError);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to render text with clickable links
  const renderContent = (content: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);
    return parts.map((part, index) => 
      part.match(urlRegex) ? (
        <a 
          key={index} 
          href={part} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-blue-500 hover:underline break-all"
        >
          {part}
        </a>
      ) : (
        part
      )
    );
  };

  return (
    <div className={`flex h-full w-full relative transition-colors duration-300 ${isDark ? 'bg-neutral-950' : 'bg-neutral-50'}`}>
      
      {/* DRAG REGION FOR ELECTRON */}
      <div className="absolute top-0 left-0 right-0 h-10 w-full drag-region z-50 pointer-events-none" />

      {/* 
        -------------------------------------------
        LEFT SIDEBAR: CONTROLS & NAVIGATION
        -------------------------------------------
      */}
      <div className={`flex-shrink-0 w-[320px] lg:w-[420px] h-full flex flex-col justify-between border-r z-10 transition-colors duration-300
        ${isDark ? 'bg-neutral-950 border-neutral-900' : 'bg-white border-neutral-200'}`}>
        
        {/* Top: Branding */}
        <div className="p-8 pb-0 pt-12">
            <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
                    <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className={`text-2xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                        {text.title}
                    </h1>
                    <p className={`text-xs ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                        v{appVersion}
                    </p>
                </div>
            </div>

            <div className="space-y-6">
                <p className={`text-sm leading-relaxed ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
                    {text.subtitle}
                </p>

                {/* Main Button */}
                <div className="relative group w-full">
                    {/* Shadow/Glow effect only in dark mode or if blue in light mode */}
                    <div className={`absolute -inset-1 rounded-xl blur opacity-30 group-hover:opacity-60 transition duration-500
                        ${isDark ? 'bg-gradient-to-r from-blue-600 to-indigo-600' : 'bg-blue-400'}`}></div>

                    <button
                        onClick={handleStart}
                        className={`relative w-full px-6 py-4 rounded-xl font-medium flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl border
                        ${isDark
                            ? 'bg-neutral-900 border-neutral-800 text-white hover:bg-neutral-800'
                            : 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20'}`}
                    >
                        <Shield className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-white'}`} />
                        <span>{text.startBtn}</span>
                    </button>
                </div>

                {accessibilityAvailable === false && (
                  <div className={`p-3 rounded-xl border flex gap-3 items-start
                    ${isDark ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
                    <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
                        {text.accessibilityBannerTitle}
                      </p>
                      <p className={`text-xs mt-0.5 ${isDark ? 'text-amber-400/80' : 'text-amber-700'}`}>
                        {text.accessibilityBannerBody}
                      </p>
                    </div>
                    <button
                      onClick={handleGrant}
                      className={`text-xs font-semibold px-2 py-1 rounded transition-colors
                        ${isDark ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300' : 'bg-amber-100 hover:bg-amber-200 text-amber-800'}`}
                    >
                      {text.accessibilityGrant}
                    </button>
                  </div>
                )}
            </div>
        </div>

        {/* Middle: Key Info (Stays fixed in sidebar) */}
        <div className="p-8 space-y-4">
             <div className={`p-4 rounded-xl border flex gap-4 items-start ${isDark ? 'bg-neutral-900/50 border-neutral-800' : 'bg-neutral-50 border-neutral-100'}`}>
                <Keyboard className={`w-5 h-5 mt-0.5 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`} />
                <div>
                    <h3 className={`text-xs font-semibold uppercase tracking-wide mb-1 ${isDark ? 'text-neutral-300' : 'text-neutral-900'}`}>{text.blockInput}</h3>
                    <p className={`text-xs leading-normal ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>{text.blockInputDesc}</p>
                </div>
             </div>
             <div className={`p-4 rounded-xl border flex gap-4 items-start ${isDark ? 'bg-neutral-900/50 border-neutral-800' : 'bg-neutral-50 border-neutral-100'}`}>
                <div className="flex gap-0.5 mt-0.5">
                    <Command className={`w-5 h-5 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`} />
                    <Command className={`w-5 h-5 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`} />
                </div>
                <div>
                    <h3 className={`text-xs font-semibold uppercase tracking-wide mb-1 ${isDark ? 'text-neutral-300' : 'text-neutral-900'}`}>{text.tripleCombo}</h3>
                    <p className={`text-xs leading-normal ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>{text.tripleComboDesc}</p>
                </div>
             </div>
        </div>

        {/* Bottom: Settings Footer */}
        <div className={`p-6 border-t flex items-center justify-between ${isDark ? 'border-neutral-900' : 'border-neutral-200'}`}>
             
             {/* Language Dropdown */}
            <div className="relative">
                <button 
                    onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-xs font-medium uppercase tracking-wider
                    ${isDark 
                        ? 'bg-neutral-900 border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-white' 
                        : 'bg-white border-neutral-200 hover:border-neutral-300 text-neutral-600 hover:text-neutral-900'}`}
                >
                    <Globe className="w-3 h-3" />
                    {lang}
                </button>
                
                {isLangMenuOpen && (
                    <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsLangMenuOpen(false)} />
                    <div className={`absolute bottom-full left-0 mb-2 w-48 border rounded-xl shadow-xl overflow-hidden z-50 flex flex-col py-1
                        ${isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'}`}>
                        {languages.map((l) => (
                            <button
                                key={l.code}
                                onClick={() => {
                                    setLang(l.code);
                                    setIsLangMenuOpen(false);
                                }}
                                className={`px-4 py-3 text-left text-sm transition-colors 
                                ${lang === l.code 
                                    ? 'text-blue-500 font-medium' 
                                    : isDark ? 'text-neutral-400 hover:bg-neutral-800' : 'text-neutral-600 hover:bg-neutral-50'}`}
                            >
                                {l.name}
                            </button>
                        ))}
                    </div>
                    </>
                )}
            </div>

            <button 
                onClick={onOpenAbout}
                className={`p-2 rounded-lg border transition-colors 
                ${isDark 
                    ? 'bg-neutral-900 border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-white' 
                    : 'bg-white border-neutral-200 hover:border-neutral-300 text-neutral-600 hover:text-neutral-900'}`}
            >
                <Info className="w-4 h-4" />
            </button>
        </div>
      </div>

      {/* 
        -------------------------------------------
        RIGHT CONTENT: CLEANING ASSISTANT
        -------------------------------------------
      */}
      <div className="flex-1 h-full relative overflow-hidden flex flex-col min-w-0">
         {/* Background pattern */}
         <div className={`absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_10%,transparent_100%)]`} />
         
         <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col items-center justify-start p-6 lg:p-12 pt-16">
            
            <div className="w-full max-w-2xl mt-8 lg:mt-16 space-y-8 relative z-10">
                
                <div className="text-center space-y-2">
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border
                        ${isDark ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-blue-50 border-blue-100 text-blue-600'}`}>
                        <Sparkles className="w-3 h-3" />
                        AI Powered Research
                    </div>
                    <h2 className={`text-3xl md:text-4xl font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                        {text.guideTitle}
                    </h2>
                    <p className={`text-sm ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                        Enter your device model to search for manufacturer-specific cleaning protocols.
                    </p>
                </div>

                {/* Input Area */}
                <div className={`flex gap-2 p-2 rounded-2xl border shadow-2xl shadow-blue-900/5 transition-all focus-within:ring-2 focus-within:ring-blue-500/20
                    ${isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'}`}>
                    <div className="flex-1 flex items-center px-4">
                        <Laptop className={`w-5 h-5 mr-3 ${isDark ? 'text-neutral-600' : 'text-neutral-400'}`} />
                        <input 
                            type="text" 
                            value={deviceModel}
                            onChange={(e) => setDeviceModel(e.target.value)}
                            placeholder={text.guidePlaceholder}
                            className={`w-full bg-transparent text-sm focus:outline-none 
                            ${isDark ? 'text-white placeholder-neutral-600' : 'text-neutral-900 placeholder-neutral-400'}`}
                            onKeyDown={(e) => e.key === 'Enter' && generateTips()}
                        />
                    </div>
                    <button 
                        onClick={generateTips}
                        disabled={isLoading || !deviceModel.trim()}
                        className={`px-6 py-3 rounded-xl transition-all flex items-center justify-center font-medium
                        ${isLoading || !deviceModel.trim() 
                            ? (isDark ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed' : 'bg-neutral-100 text-neutral-400 cursor-not-allowed')
                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'}`}
                    >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Search & Generate"}
                    </button>
                </div>

                {error && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        {error}
                    </div>
                )}
                
                {/* Results Area */}
                {tips ? (
                    <div className={`rounded-2xl p-8 border animate-in fade-in slide-in-from-bottom-4 shadow-xl mb-12
                        ${isDark ? 'bg-neutral-900/80 border-neutral-800 text-neutral-300' : 'bg-white/80 border-neutral-200 text-neutral-700'}`}>
                        <h4 className={`font-medium mb-6 text-sm uppercase tracking-wider flex items-center gap-2 pb-4 border-b
                            ${isDark ? 'text-blue-400 border-neutral-800' : 'text-blue-600 border-neutral-100'}`}>
                            <Laptop className="w-4 h-4" />
                            {text.tipsFor} {deviceModel}
                        </h4>
                        
                        {/* Render Main Text */}
                        <div className="prose prose-sm max-w-none mb-6">
                            <div className={`whitespace-pre-wrap leading-7 ${isDark ? 'text-neutral-300' : 'text-neutral-600'}`}>
                                {renderContent(tips)}
                            </div>
                        </div>

                        {/* Render Grounding Sources */}
                        {sources.length > 0 && (
                            <div className={`mt-8 pt-4 border-t ${isDark ? 'border-neutral-800' : 'border-neutral-100'}`}>
                                <h5 className={`text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                                    <Globe className="w-3 h-3" />
                                    Sources
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {sources.map((source, idx) => (
                                        <a 
                                            key={idx} 
                                            href={source.uri} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className={`flex items-center gap-2 text-xs p-2 rounded-lg transition-colors truncate
                                                ${isDark ? 'bg-neutral-800/50 hover:bg-neutral-800 text-blue-400' : 'bg-neutral-50 hover:bg-neutral-100 text-blue-600'}`}
                                        >
                                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                            <span className="truncate">{source.title}</span>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className={`border-2 border-dashed rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-4 min-h-[200px]
                        ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>
                         <div className={`p-4 rounded-full ${isDark ? 'bg-neutral-900' : 'bg-neutral-100'}`}>
                            <Sparkles className={`w-6 h-6 ${isDark ? 'text-neutral-700' : 'text-neutral-300'}`} />
                         </div>
                    </div>
                )}
            </div>
         </div>
      </div>

      <AccessibilityModal
        isOpen={isAccessibilityModalOpen}
        onClose={() => setIsAccessibilityModalOpen(false)}
        onOpenSettings={handleGrant}
        onTryAgain={handleTryAgain}
        theme={theme}
        lang={lang}
      />

    </div>
  );
};