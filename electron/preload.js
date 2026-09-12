const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  enterCleaningMode:     (opts) => ipcRenderer.invoke('enter-cleaning-mode', opts),
  exitCleaningMode:      (keystrokes) => ipcRenderer.send('exit-cleaning-mode', keystrokes),
  // Main window: the cleaning window closed, with how many keystrokes it absorbed.
  onCleaningEnded: (cb) => {
    const listener = (_event, keystrokes) => cb(keystrokes);
    ipcRenderer.on('cleaning-ended', listener);
    return () => ipcRenderer.removeListener('cleaning-ended', listener);
  },
  checkPermissions:      () => ipcRenderer.invoke('check-permissions'),
  promptAccessibility:   () => ipcRenderer.invoke('prompt-accessibility'),
  promptInputMonitoring: () => ipcRenderer.invoke('prompt-input-monitoring'),
  // Input swallowed by the native tap (macOS): 'combo' = both Cmd keys went down,
  // 'key' = any other key press. Returns an unsubscribe function.
  onNativeInput: (cb) => {
    const listener = (_event, kind) => cb(kind);
    ipcRenderer.on('native-input', listener);
    return () => ipcRenderer.removeListener('native-input', listener);
  },
});
