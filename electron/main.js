const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
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

  // CRITICAL: Block inputs at the window level when in cleaning mode
  // This catches standard keys (F1, Letters, Esc) even if globalShortcut fails
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (isCleaningMode) {
      // Allow only the specific unlock combo if needed, but for now 
      // we rely on the renderer to detect the unlock combo via keyup/down 
      // before this preventsDefault? 
      // Actually, preventDefault here stops the Renderer from receiving it.
      // BUT we need the Renderer to detect the Cmd+Cmd+Cmd unlock sequence.
      // So we must allow "Meta" (Command) keys through.
      
      if (input.key === 'Meta' || input.code === 'MetaLeft' || input.code === 'MetaRight') {
        return; // Let Command keys reach the renderer for the unlock logic
      }
      
      event.preventDefault();
    }
  });
}

// Global Shortcuts to block system-level interruptions
const fKeys = Array.from({ length: 24 }, (_, i) => `F${i + 1}`);
const BLOCKED_KEYS = [
  ...fKeys,
  'Escape',
  'CommandOrControl+Q',
  'CommandOrControl+W',
  'CommandOrControl+H',
  'CommandOrControl+R',
  'CommandOrControl+Shift+I',
  'CommandOrControl+P', // Print
  'Alt+F4',
  'Alt+Tab',
  'VolumeUp', 
  'VolumeDown', 
  'VolumeMute', 
  'MediaNextTrack', 
  'MediaPreviousTrack', 
  'MediaStop', 
  'MediaPlayPause'
];

ipcMain.on('set-cleaning-mode', (event, isActive) => {
  if (!mainWindow) return;
  isCleaningMode = isActive;

  if (isActive) {
    // ENTER CLEANING MODE
    // 'simpleFullscreen' often works better on Mac for blocking OS UI than 'kiosk'
    if (process.platform === 'darwin') {
      mainWindow.setSimpleFullScreen(true);
    } else {
      mainWindow.setKiosk(true);
    }
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.focus();

    // Register Global Shortcuts (System Level)
    BLOCKED_KEYS.forEach(key => {
      try {
        globalShortcut.register(key, () => {
          // Do nothing (swallow event)
          return false;
        });
      } catch (e) {
        console.error(`Failed to register ${key}`, e);
      }
    });

  } else {
    // EXIT CLEANING MODE
    mainWindow.setAlwaysOnTop(false);
    if (process.platform === 'darwin') {
      mainWindow.setSimpleFullScreen(false);
    } else {
      mainWindow.setKiosk(false);
    }
    
    globalShortcut.unregisterAll();
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});