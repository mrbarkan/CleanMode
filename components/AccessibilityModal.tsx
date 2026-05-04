import React from 'react';
import { ShieldAlert, ExternalLink, RotateCcw, X } from 'lucide-react';
import { Theme } from '../App';
import { t, Language } from '../utils/translations';

interface AccessibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onTryAgain: () => void;
  theme: Theme;
  lang: Language;
}

export const AccessibilityModal: React.FC<AccessibilityModalProps> = ({
  isOpen,
  onClose,
  onOpenSettings,
  onTryAgain,
  theme,
  lang,
}) => {
  if (!isOpen) return null;

  const isDark = theme === 'dark';
  const text = t[lang];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md rounded-2xl border shadow-2xl p-6
          ${isDark ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center
              ${isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>
              <ShieldAlert className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-semibold">{text.accessibilityModalTitle}</h2>
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded-lg transition-colors
              ${isDark ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-neutral-100 text-neutral-500'}`}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className={`text-sm whitespace-pre-line leading-relaxed mb-6
          ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
          {text.accessibilityModalBody}
        </p>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onOpenSettings}
            className={`px-4 py-2 rounded-xl border text-sm font-medium flex items-center gap-2 transition-colors
              ${isDark
                ? 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700 text-white'
                : 'bg-white border-neutral-200 hover:bg-neutral-50 text-neutral-900'}`}
          >
            <ExternalLink className="w-4 h-4" />
            {text.accessibilityOpenSettings}
          </button>
          <button
            onClick={onTryAgain}
            className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            {text.accessibilityTryAgain}
          </button>
        </div>
      </div>
    </div>
  );
};
