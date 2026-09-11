const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  enterCleaningMode:     () => ipcRenderer.invoke('enter-cleaning-mode'),
  exitCleaningMode:      () => ipcRenderer.send('exit-cleaning-mode'),
  checkPermissions:      () => ipcRenderer.invoke('check-permissions'),
  promptAccessibility:   () => ipcRenderer.invoke('prompt-accessibility'),
  promptInputMonitoring: () => ipcRenderer.invoke('prompt-input-monitoring'),
  // Native tap saw both Cmd keys go down (macOS). Returns an unsubscribe function.
  onUnlockCombo: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('unlock-combo', listener);
    return () => ipcRenderer.removeListener('unlock-combo', listener);
  },
});
