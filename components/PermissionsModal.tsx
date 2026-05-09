import React from 'react';
import { ShieldAlert, ShieldCheck, ExternalLink, RotateCcw, X } from 'lucide-react';
import { Theme } from '../App';
import { t, Language } from '../utils/translations';
import { Permissions } from '../types/window';

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
  const text = t[lang];

  const PermissionRow: React.FC<{
    label: string;
    granted: boolean;
    onOpen: () => void;
  }> = ({ label, granted, onOpen }) => (
    <div className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border
      ${isDark ? 'border-neutral-800 bg-neutral-950' : 'border-neutral-200 bg-neutral-50'}`}>
      <div className="flex items-center gap-2 min-w-0">
        {granted ? (
          <ShieldCheck className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
        ) : (
          <ShieldAlert className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
        )}
        <span className={`text-sm truncate ${isDark ? 'text-neutral-200' : 'text-neutral-800'}`}>
          {label}
        </span>
      </div>
      {!granted && (
        <button
          onClick={onOpen}
          className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border transition-colors flex-shrink-0
            ${isDark
              ? 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700 text-white'
              : 'bg-white border-neutral-300 hover:bg-neutral-50 text-neutral-900'}`}
        >
          <ExternalLink className="w-3 h-3" />
          {text.permissionsOpen}
        </button>
      )}
    </div>
  );

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
            <h2 className="text-lg font-semibold">{text.permissionsModalTitle}</h2>
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

        <p className={`text-sm leading-relaxed mb-4
          ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
          {text.permissionsModalIntro}
        </p>

        <div className="space-y-2 mb-4">
          <PermissionRow
            label={text.permissionsAccessibility}
            granted={permissions.accessibility}
            onOpen={onOpenAccessibility}
          />
          <PermissionRow
            label={text.permissionsInputMonitoring}
            granted={permissions.inputMonitoring}
            onOpen={onOpenInputMonitoring}
          />
        </div>

        <p className={`text-xs mb-6 ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>
          {text.permissionsAfterGranting}
        </p>

        <div className="flex justify-end">
          <button
            onClick={onTryAgain}
            className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            {text.permissionsTryAgain}
          </button>
        </div>
      </div>
    </div>
  );
};
