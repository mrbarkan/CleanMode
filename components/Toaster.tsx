import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { T } from '../utils/clocheTokens';

interface ToasterProps {
  message: string;
  isVisible: boolean;
}

export const Toaster: React.FC<ToasterProps> = ({ message, isVisible }) => {
  return (
    <div
      style={{
        position: 'fixed', top: 24, left: '50%',
        transform: `translate(-50%, ${isVisible ? '0' : '-32px'})`,
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: 60,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 18px', borderRadius: 999,
        background: 'rgba(247,244,237,0.85)',
        border: `1px solid ${T.line}`,
        color: T.ink,
        fontFamily: T.sans, fontSize: 13, fontWeight: 500,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 18px 36px -16px rgba(0,0,0,0.25)',
      }}>
        <CheckCircle2 size={16} color={T.sage} />
        <span>{message}</span>
      </div>
    </div>
  );
};
