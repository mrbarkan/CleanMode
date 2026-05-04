const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  setCleaningMode: (isActive) => ipcRenderer.send('set-cleaning-mode', isActive),
});