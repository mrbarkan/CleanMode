import React from 'react';

type DomeVariant = 'brass' | 'ink' | 'glass' | 'line' | 'marble' | 'sage';

interface ClocheDomeProps {
  size?: number;
  variant?: DomeVariant;
  dark?: boolean;
  withPlate?: boolean;
}

export const ClocheDome: React.FC<ClocheDomeProps> = ({
  size = 200,
  variant = 'brass',
  dark = false,
  withPlate = true,
}) => {
  const id = React.useId();
  const domePath = 'M28 152 C28 70, 172 70, 172 152 Z';

  let domeFill = '';
  let domeStroke = '';
  let domeHighlight = '';
  let plateFill = '';
  let plateStroke = '';
  let knobFill = '';
  let shadow = '';
  let ridgeColor = '';

  if (variant === 'brass') {
    domeFill = `url(#${id}-clay)`;
    domeStroke = '#6F222A';
    domeHighlight = '#E5C8B0';
    plateFill = `url(#${id}-plate)`;
    plateStroke = '#592C22';
    knobFill = '#592C22';
    shadow = 'rgba(89,44,34,0.22)';
    ridgeColor = '#6F222A';
  } else if (variant === 'ink') {
    domeFill = '#2A1210';
    domeStroke = '#2A1210';
    domeHighlight = 'rgba(255,255,255,0.06)';
    plateFill = '#2A1210';
    plateStroke = '#2A1210';
    knobFill = '#2A1210';
    shadow = 'rgba(0,0,0,0.18)';
    ridgeColor = '#ECE2CC';
  } else if (variant === 'glass') {
    domeFill = `url(#${id}-glass)`;
    domeStroke = 'rgba(236,226,204,0.35)';
    domeHighlight = 'rgba(255,255,255,0.55)';
    plateFill = '#1F0D0C';
    plateStroke = 'rgba(236,226,204,0.18)';
    knobFill = 'rgba(236,226,204,0.7)';
    shadow = 'rgba(0,0,0,0.5)';
    ridgeColor = '#D1B38F';
  } else if (variant === 'line') {
    domeFill = 'transparent';
    domeStroke = dark ? '#ECE2CC' : '#2A1210';
    domeHighlight = 'transparent';
    plateFill = 'transparent';
    plateStroke = dark ? '#ECE2CC' : '#2A1210';
    knobFill = dark ? '#ECE2CC' : '#2A1210';
    shadow = 'transparent';
    ridgeColor = 'transparent';
  } else if (variant === 'marble') {
    domeFill = `url(#${id}-marble)`;
    domeStroke = '#A89178';
    domeHighlight = '#FBF5E6';
    plateFill = '#2A1210';
    plateStroke = '#2A1210';
    knobFill = '#2A1210';
    shadow = 'rgba(89,44,34,0.18)';
    ridgeColor = '#7A5D49';
  } else if (variant === 'sage') {
    domeFill = `url(#${id}-sage)`;
    domeStroke = '#3C453D';
    domeHighlight = '#A3B0A4';
    plateFill = '#2A1210';
    plateStroke = '#2A1210';
    knobFill = '#2A1210';
    shadow = 'rgba(60,69,61,0.25)';
    ridgeColor = '#3C453D';
  }

  return (
    <svg viewBox="0 0 200 200" width={size} height={size} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`${id}-clay`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#D1B38F" />
          <stop offset="0.3" stopColor="#A66253" />
          <stop offset="0.65" stopColor="#6F222A" />
          <stop offset="1" stopColor="#2A1210" />
        </linearGradient>
        <linearGradient id={`${id}-plate`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8E3A38" />
          <stop offset="1" stopColor="#2A1210" />
        </linearGradient>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(236,226,204,0.5)" />
          <stop offset="0.5" stopColor="rgba(209,179,143,0.15)" />
          <stop offset="1" stopColor="rgba(209,179,143,0.3)" />
        </linearGradient>
        <linearGradient id={`${id}-marble`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FBF5E6" />
          <stop offset="0.5" stopColor="#E5D5B0" />
          <stop offset="1" stopColor="#C5AC85" />
        </linearGradient>
        <linearGradient id={`${id}-sage`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8F9A8E" />
          <stop offset="0.55" stopColor="#555F56" />
          <stop offset="1" stopColor="#3C453D" />
        </linearGradient>
        <radialGradient id={`${id}-shine`} cx="0.4" cy="0.25" r="0.5">
          <stop offset="0" stopColor="rgba(255,255,255,0.6)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      <ellipse cx="100" cy="158" rx="78" ry="6" fill={shadow} />

      {withPlate && (
        <rect x="22" y="148" width="156" height="10" rx="3" fill={plateFill} stroke={plateStroke} strokeWidth="1" />
      )}

      <path
        d={domePath}
        fill={domeFill}
        stroke={domeStroke}
        strokeWidth={variant === 'line' ? 4 : 1.5}
        strokeLinejoin="round"
      />

      {variant !== 'line' && variant !== 'glass' && ridgeColor !== 'transparent' && (
        <g opacity={variant === 'ink' ? 0.18 : 0.35}>
          <path d="M40 140 C40 134, 160 134, 160 140" fill="none" stroke={ridgeColor} strokeWidth="0.8" />
          <path d="M44 132 C44 126, 156 126, 156 132" fill="none" stroke={ridgeColor} strokeWidth="0.8" />
        </g>
      )}

      {variant !== 'line' && (
        <path
          d="M48 130 C 48 88, 110 80, 130 80"
          fill="none"
          stroke={domeHighlight}
          strokeWidth={variant === 'glass' ? 3 : 5}
          strokeLinecap="round"
          opacity={variant === 'glass' ? 0.6 : 0.5}
        />
      )}

      {variant === 'glass' && (
        <path d={domePath} fill={`url(#${id}-shine)`} opacity="0.8" />
      )}

      <line x1="100" y1="58" x2="100" y2="72" stroke={knobFill} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="100" cy="54" r="6.5" fill={knobFill} />
      {variant !== 'line' && variant !== 'ink' && (
        <circle cx="98" cy="52" r="2" fill="rgba(255,255,255,0.5)" />
      )}
    </svg>
  );
};
