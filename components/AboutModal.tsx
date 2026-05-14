import React from 'react';
import { X, Coffee, Mail, Moon, Sun, ShieldCheck, Command } from 'lucide-react';
import { Theme } from '../App';
import { appVersion } from '../utils/changelog';
import { t, Language } from '../utils/translations';

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
  const text = t[lang];

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

        {/* Privacy Badge */}
        <div className={`mb-6 p-4 rounded-xl border flex gap-3 items-start
          ${isDark ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'}`}>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0
            ${isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold mb-0.5 ${isDark ? 'text-emerald-300' : 'text-emerald-800'}`}>
              {text.aboutPrivacyTitle}
            </p>
            <p className={`text-xs leading-relaxed ${isDark ? 'text-emerald-400/80' : 'text-emerald-700'}`}>
              {text.aboutPrivacyBody}
            </p>
          </div>
        </div>

        {/* Appearance Section */}
        <div className={`mb-6 p-4 rounded-xl border flex items-center justify-between ${isDark ? 'bg-neutral-950 border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
          <div className="flex flex-col">
            <span className="font-medium text-sm">{text.aboutAppearance}</span>
            <span className={`text-xs ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>
              {isDark ? text.aboutAppearanceDark : text.aboutAppearanceLight}
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

        {/* Keyboard Shortcuts Section */}
        <div className={`mb-6 p-4 rounded-xl border ${isDark ? 'bg-neutral-950 border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
          <div className={`flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
            <Command className="w-3 h-3" />
            {text.aboutShortcutsTitle}
          </div>
          <div className="space-y-3">
            <div>
              <p className={`text-sm font-medium ${isDark ? 'text-neutral-200' : 'text-neutral-800'}`}>
                {text.aboutShortcutUnlock}
              </p>
              <p className={`text-xs mt-0.5 leading-relaxed ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>
                {text.aboutShortcutUnlockDesc}
              </p>
            </div>
            <div>
              <p className={`text-sm font-medium ${isDark ? 'text-neutral-200' : 'text-neutral-800'}`}>
                {text.aboutShortcutEmergency}
              </p>
              <p className={`text-xs mt-0.5 leading-relaxed ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>
                {text.aboutShortcutEmergencyDesc}
              </p>
            </div>
          </div>
        </div>

        {/* Contact + Coffee */}
        <div className="space-y-3 mb-2">
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
              <div className="font-medium text-sm">{text.aboutContact}</div>
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
              <div className="font-medium text-sm">{text.aboutCoffee}</div>
              <div className={`text-xs ${isDark ? 'text-amber-500/80' : 'text-amber-600/70'}`}>{text.aboutCoffeeDesc}</div>
            </div>
          </a>
        </div>

        <div className={`mt-6 pt-6 border-t text-center text-xs ${isDark ? 'border-neutral-800 text-neutral-600' : 'border-neutral-200 text-neutral-400'}`}>
          {text.aboutFooter}
        </div>
      </div>
    </div>
  );
};
