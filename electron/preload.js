const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  enterCleaningMode:   () => ipcRenderer.invoke('enter-cleaning-mode'),
  exitCleaningMode:    () => ipcRenderer.send('exit-cleaning-mode'),
  checkAccessibility:  () => ipcRenderer.invoke('check-accessibility'),
  promptAccessibility: () => ipcRenderer.invoke('prompt-accessibility'),
});
