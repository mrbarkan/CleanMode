const { app, BrowserWindow, Menu, ipcMain, globalShortcut, shell, screen } = require('electron');
const path = require('path');
const tap = require('./native/eventtap');
const isDev = !app.isPackaged;

// Sparkle feed, one per arch (scripts/appcast.sh). `latest` resolves to the newest
// non-prerelease GitHub release, so no separate hosting is needed.
const FEED_URL = `https://github.com/mrbarkan/CleanMode/releases/latest/download/appcast-${process.arch}.xml`;

// Set app name early so menus, Dock label, and "Hide / Quit" all say CleanMode.
app.setName('CleanMode');

// Single-instance lock: a second launch would spawn a competing fullscreen
// blocker that fights the first for global shortcuts and always-on-top z-order.
// Refuse the second instance and surface the existing window instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const startUrl = isDev
  ? 'http://localhost:5173'
  : `file://${path.join(__dirname, '../dist/index.html')}`;

const webPreferences = {
  nodeIntegration: false,
  contextIsolation: true,
  preload: path.join(__dirname, 'preload.js'),
};

let mainWindow;
let cleaningWindow;
let isCleaningMode = false;

function buildAppMenu(hasUpdater) {
  const template = [
    {
      label: 'CleanMode',
      submenu: [
        { role: 'about', label: 'About CleanMode' },
        ...(hasUpdater ? [{ label: 'Check for Updates…', click: () => tap.checkForUpdates() }] : []),
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: 'Hide CleanMode' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit CleanMode' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Apple Cleaning Guide (apple.com)',
          click: () => shell.openExternal('https://support.apple.com/en-us/102213'),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'CleanMode',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1B0710', // matches index.html — no white flash on launch
    show: false,
    webPreferences,
    icon: path.join(__dirname, '../dist/icon.png')
  });

  mainWindow.loadURL(startUrl);

  // Show only once the first paint is ready, so the user never sees a blank/white window.
  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
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

ipcMain.handle('enter-cleaning-mode', async (_event, { tips = '', lang = 'en', theme = 'dark' } = {}) => {
  if (!mainWindow) return { ok: false, error: 'tap-failed' };
  if (cleaningWindow) return { ok: true };

  // Permission gate: Accessibility lets the tap be created; Input Monitoring lets
  // events actually flow through it. Both are required.
  const permissions = {
    accessibility:   tap.isAccessibilityTrusted(),
    inputMonitoring: tap.isInputMonitoringTrusted(),
  };
  if (!permissions.accessibility || !permissions.inputMonitoring) {
    if (!permissions.accessibility)        tap.promptAccessibility();
    else if (!permissions.inputMonitoring) tap.promptInputMonitoring();
    return { ok: false, error: 'permissions-denied', permissions };
  }

  // Native tap (the primary blocker). It swallows Cmd too and reports the unlock
  // combo here, so macOS's double-Cmd shortcuts (Siri/Dictation) can't fire. It also
  // confines the pointer to this window's display (no hot corners, no other screens).
  const display = screen.getDisplayMatching(mainWindow.getBounds()).bounds;
  if (!tap.start((kind) => cleaningWindow?.webContents.send('native-input', kind), display)) {
    return { ok: false, error: 'tap-failed' };
  }

  // Cleaning gets its own window covering the display, created here and destroyed on exit,
  // so the main window is never resized. It loads the same renderer with ?cleaning=1.
  isCleaningMode = true;
  cleaningWindow = new BrowserWindow({
    ...display,
    frame: false,
    show: false,
    backgroundColor: '#1B0710',
    webPreferences,
  });

  // Existing defense-in-depth layers: window-level key blocking, kiosk, globalShortcut.
  // Meta keys pass so the renderer can detect the unlock combo where the native tap isn't
  // running (non-macOS). On macOS the tap drops Cmd before it gets here.
  cleaningWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Meta' || input.code === 'MetaLeft' || input.code === 'MetaRight') return;
    event.preventDefault();
  });
  if (process.platform === 'darwin') {
    // Already sized to the display while hidden, so there is no visible zoom animation.
    cleaningWindow.setSimpleFullScreen(true);
  } else {
    cleaningWindow.setKiosk(true);
  }
  cleaningWindow.setAlwaysOnTop(true, 'screen-saver');
  cleaningWindow.once('ready-to-show', () => {
    cleaningWindow?.show();
    cleaningWindow?.focus();
  });
  // Safety net: if the window goes away any other way (crash, quit), still release the lock.
  cleaningWindow.on('closed', () => exitCleaningMode());
  cleaningWindow.loadURL(`${startUrl}?${new URLSearchParams({ cleaning: '1', tips, lang, theme })}`);

  BLOCKED_KEYS.forEach(key => {
    try {
      globalShortcut.register(key, () => false);
    } catch (e) {
      console.error(`Failed to register ${key}`, e);
    }
  });

  return { ok: true };
});

function exitCleaningMode(keystrokes = 0) {
  if (!isCleaningMode) return;
  isCleaningMode = false;

  tap.stop();
  globalShortcut.unregisterAll();

  const win = cleaningWindow;
  cleaningWindow = null;
  if (win && !win.isDestroyed()) {
    win.hide();
    // Simple fullscreen auto-hides the Dock and menu bar app-wide; undo it before destroying.
    if (process.platform === 'darwin') win.setSimpleFullScreen(false);
    win.destroy();
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('cleaning-ended', keystrokes);
  }
}

ipcMain.on('exit-cleaning-mode', (_event, keystrokes) => exitCleaningMode(keystrokes));

ipcMain.handle('check-permissions', () => ({
  accessibility:   tap.isAccessibilityTrusted(),
  inputMonitoring: tap.isInputMonitoringTrusted(),
}));
ipcMain.handle('prompt-accessibility',    () => tap.promptAccessibility());
ipcMain.handle('prompt-input-monitoring', () => tap.promptInputMonitoring());

app.whenReady().then(() => {
  // Native About panel shown by the macOS standard "About CleanMode" menu item.
  // The in-app Info button still opens the React modal; this panel is for users
  // who go through the menu bar.
  app.setAboutPanelOptions({
    applicationName: 'CleanMode',
    applicationVersion: app.getVersion(),
    copyright: `© ${new Date().getFullYear()} MrBarkan`,
    credits: '100% on-device. No API keys, no tracking — only an optional update check.',
  });

  // Sparkle only exists in packaged builds (embedded by scripts/embed-sparkle.js).
  buildAppMenu(app.isPackaged && tap.startUpdater(FEED_URL));
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// A second launch attempt hits the lock and quits; focus the live window here.
app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  tap.stop();   // safety net
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
