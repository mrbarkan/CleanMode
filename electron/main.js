const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const tap = require('./native/eventtap');
const isDev = !app.isPackaged;

let mainWindow;
let isCleaningMode = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../dist/icon.png')
  });

  const startUrl = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Existing defense-in-depth layer: window-level key blocking.
  // Allows Meta keys through so renderer can detect unlock combo.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (isCleaningMode) {
      if (input.key === 'Meta' || input.code === 'MetaLeft' || input.code === 'MetaRight') {
        return;
      }
      event.preventDefault();
    }
  });
}

const fKeys = Array.from({ length: 24 }, (_, i) => `F${i + 1}`);
const BLOCKED_KEYS = [
  ...fKeys,
  'Escape',
  'CommandOrControl+Q',
  'CommandOrControl+W',
  'CommandOrControl+H',
  'CommandOrControl+R',
  'CommandOrControl+Shift+I',
  'CommandOrControl+P',
  'Alt+F4',
  'Alt+Tab',
  'VolumeUp', 'VolumeDown', 'VolumeMute',
  'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop', 'MediaPlayPause'
];

ipcMain.handle('enter-cleaning-mode', async () => {
  if (!mainWindow) return { ok: false, error: 'tap-failed' };

  // Permission gate.
  if (!tap.isAccessibilityTrusted()) {
    tap.promptAccessibility();
    return { ok: false, error: 'accessibility-denied' };
  }

  // Native tap (the primary blocker for Fn-mapped events).
  if (!tap.start()) {
    return { ok: false, error: 'tap-failed' };
  }

  // Existing kiosk + globalShortcut layers (defense in depth).
  isCleaningMode = true;
  if (process.platform === 'darwin') {
    mainWindow.setSimpleFullScreen(true);
  } else {
    mainWindow.setKiosk(true);
  }
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.focus();

  BLOCKED_KEYS.forEach(key => {
    try {
      globalShortcut.register(key, () => false);
    } catch (e) {
      console.error(`Failed to register ${key}`, e);
    }
  });

  return { ok: true };
});

ipcMain.on('exit-cleaning-mode', () => {
  if (!mainWindow) return;
  isCleaningMode = false;

  tap.stop();
  globalShortcut.unregisterAll();

  mainWindow.setAlwaysOnTop(false);
  if (process.platform === 'darwin') {
    mainWindow.setSimpleFullScreen(false);
  } else {
    mainWindow.setKiosk(false);
  }
});

ipcMain.handle('check-accessibility',  () => tap.isAccessibilityTrusted());
ipcMain.handle('prompt-accessibility', () => tap.promptAccessibility());

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  tap.stop();   // safety net
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
