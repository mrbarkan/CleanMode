import React from 'react';
import { X, Coffee, Mail, Moon, Sun, History } from 'lucide-react';
import { Theme } from '../App';
import { changelog, appVersion } from '../utils/changelog';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, theme, setTheme }) => {
  if (!isOpen) return null;

  const isDark = theme === 'dark';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
        onClick={onClose}
      />
      <div className={`relative w-full max-w-md border rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto no-scrollbar flex flex-col ${
        isDark ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'
      }`}>
        <div className="flex items-center justify-between mb-1">
             <h2 className="text-xl font-bold">CleanMode</h2>
             <button 
                onClick={onClose}
                className={`transition-colors ${isDark ? 'text-neutral-500 hover:text-white' : 'text-neutral-400 hover:text-neutral-900'}`}
             >
                <X className="w-5 h-5" />
             </button>
        </div>
       
        <p className={`text-sm mb-6 ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>v{appVersion} • Developed by MrBarkan</p>

        {/* Theme Toggle Section */}
        <div className={`mb-6 p-4 rounded-xl border flex items-center justify-between ${isDark ? 'bg-neutral-950 border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
            <div className="flex flex-col">
                <span className="font-medium text-sm">Appearance</span>
                <span className={`text-xs ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>
                    {isDark ? 'Dark Mode (Best for dust)' : 'Light Mode (Best for smudges)'}
                </span>
            </div>
            <div className={`flex items-center gap-1 p-1 rounded-full border ${isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'}`}>
                <button 
                    onClick={() => setTheme('light')}
                    className={`p-2 rounded-full transition-all ${theme === 'light' ? 'bg-amber-100 text-amber-600 shadow-sm' : 'text-neutral-400 hover:text-neutral-500'}`}
                >
                    <Sun className="w-4 h-4" />
                </button>
                <button 
                    onClick={() => setTheme('dark')}
                    className={`p-2 rounded-full transition-all ${theme === 'dark' ? 'bg-neutral-800 text-blue-400 shadow-sm' : 'text-neutral-400 hover:text-neutral-500'}`}
                >
                    <Moon className="w-4 h-4" />
                </button>
            </div>
        </div>

        <div className="space-y-3 mb-8">
          <a 
            href="mailto:dbarkan@gmail.com"
            className={`flex items-center gap-3 p-3 rounded-xl transition-colors group border ${
                isDark 
                ? 'bg-neutral-800/50 border-transparent hover:bg-neutral-800' 
                : 'bg-neutral-50 border-neutral-100 hover:border-blue-200 hover:bg-blue-50/50'
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="font-medium text-sm">Contact Me</div>
              <div className={`text-xs ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>dbarkan@gmail.com</div>
            </div>
          </a>

          <a 
            href="https://paypal.me/dbarkan" 
            target="_blank" 
            rel="noopener noreferrer"
            className={`flex items-center gap-3 p-3 rounded-xl transition-colors group border ${
                isDark 
                ? 'bg-amber-500/10 border-transparent hover:bg-amber-500/20' 
                : 'bg-amber-50 border-amber-100 hover:bg-amber-100/50'
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <div className="font-medium text-sm">Buy me a coffee</div>
              <div className={`text-xs ${isDark ? 'text-amber-500/80' : 'text-amber-600/70'}`}>Support development</div>
            </div>
          </a>
        </div>
        
        {/* Changelog Section */}
        <div className="border-t pt-6 pb-2">
            <div className={`flex items-center gap-2 mb-4 text-xs font-bold uppercase tracking-wider ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                <History className="w-3 h-3" />
                Changelog
            </div>
            <div className="space-y-6">
                {changelog.map((entry) => (
                    <div key={entry.version} className="relative pl-4 border-l border-neutral-800">
                        <div className={`absolute -left-1.5 top-1 w-3 h-3 rounded-full border-2 ${
                            entry.version === appVersion 
                                ? 'bg-blue-500 border-blue-500' 
                                : isDark ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-neutral-300'
                        }`} />
                        <div className="flex items-baseline justify-between mb-1">
                            <span className={`text-sm font-semibold ${isDark ? 'text-neutral-200' : 'text-neutral-800'}`}>v{entry.version}</span>
                            <span className={`text-[10px] ${isDark ? 'text-neutral-600' : 'text-neutral-400'}`}>{entry.date}</span>
                        </div>
                        <ul className="space-y-1">
                            {entry.changes.map((change, i) => (
                                <li key={i} className={`text-xs ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                                    • {change}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </div>

        <div className={`mt-6 pt-6 border-t text-center text-xs ${isDark ? 'border-neutral-800 text-neutral-600' : 'border-neutral-200 text-neutral-400'}`}>
          Clean safely. Don't use water directly on devices.
        </div>
      </div>
    </div>
  );
};