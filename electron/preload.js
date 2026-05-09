const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  enterCleaningMode:     () => ipcRenderer.invoke('enter-cleaning-mode'),
  exitCleaningMode:      () => ipcRenderer.send('exit-cleaning-mode'),
  checkPermissions:      () => ipcRenderer.invoke('check-permissions'),
  promptAccessibility:   () => ipcRenderer.invoke('prompt-accessibility'),
  promptInputMonitoring: () => ipcRenderer.invoke('prompt-input-monitoring'),
});
