import React from 'react';
import ReactDOM from 'react-dom/client';

// Self-hosted fonts (bundled at build time) so the app renders correctly
// offline and makes good on its "no network calls" promise. Weights here
// mirror the set previously pulled from Google Fonts.
import '@fontsource/geist-sans/300.css';
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';

import App from './App';
import { CleaningMode } from './components/CleaningMode';
import { Language } from './utils/translations';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Electron's cleaning window loads this page with ?cleaning=1 (see electron/main.js).
// Unlocking is handled over IPC there, so onUnlock has nothing left to do.
const params = new URLSearchParams(window.location.search);

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {params.has('cleaning') ? (
      <CleaningMode
        onUnlock={() => {}}
        tips={params.get('tips') ?? ''}
        lang={(params.get('lang') ?? 'en') as Language}
        theme={params.get('theme') === 'light' ? 'light' : 'dark'}
      />
    ) : (
      <App />
    )}
  </React.StrictMode>
);