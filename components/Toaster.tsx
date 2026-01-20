import React from 'react';
import { CheckCircle2 } from 'lucide-react';

interface ToasterProps {
  message: string;
  isVisible: boolean;
}

export const Toaster: React.FC<ToasterProps> = ({ message, isVisible }) => {
  return (
    <div
      className={`fixed top-8 left-1/2 -translate-x-1/2 z-[60] transition-all duration-500 transform ${
        isVisible ? 'translate-y-0 opacity-100' : '-translate-y-8 opacity-0 pointer-events-none'
      }`}
    >
      <div className="bg-white/10 backdrop-blur-md border border-white/10 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-green-400" />
        <span className="font-medium">{message}</span>
      </div>
    </div>
  );
};