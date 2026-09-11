const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  enterCleaningMode:     () => ipcRenderer.invoke('enter-cleaning-mode'),
  exitCleaningMode:      () => ipcRenderer.send('exit-cleaning-mode'),
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
