// Cloche design tokens — Linen + Claret edition.
// Palette: 2A1210 · 6F222A · 555F56 · 592C22 · A66253 · D1B38F

export const T = {
  // Light (off-white)
  bone:      '#F1EEE8',
  paper:     '#F7F4ED',
  parchment: '#FAF8F2',
  line:      '#DAD4C8',
  lineSoft:  '#E6E0D4',
  ink:       '#2A1210',
  inkSoft:   '#592C22',
  mute:      '#6E625A',
  muteSoft:  '#A39A8E',

  // Primary accent: claret
  brass:     '#6F222A',
  brassDeep: '#58181F',
  brassSoft: '#D1B38F',
  champagne: '#EEDFDE',

  // Secondary accent: sage
  sage:      '#555F56',
  sageDeep:  '#3C453D',
  sageSoft:  '#D7DED6',
  clay:      '#A66253',

  // Functional
  emerald:   '#555F56',
  amber:     '#A66253',
  claret:    '#6F222A',

  // Dark (espresso)
  dBg:       '#1F0D0C',
  dSurface:  '#2A1210',
  dRaised:   '#3A1B17',
  dLine:     '#4A2A22',
  dInk:      '#ECE2CC',
  dMute:     '#A89178',
  dBrass:    '#D1B38F',

  // Type
  serif: '"Instrument Serif", "Cormorant Garamond", Georgia, serif',
  sans:  '"Geist", -apple-system, BlinkMacSystemFont, "SF Pro", "Helvetica Neue", sans-serif',
  mono:  '"Geist Mono", "JetBrains Mono", ui-monospace, monospace',
};

export type ToneKey = keyof typeof T;

export const tone = (dark: boolean, lightKey: ToneKey, darkKey: ToneKey): string =>
  T[dark ? darkKey : lightKey];
