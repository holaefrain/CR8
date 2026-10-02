// Sandboxed preload: the only bridge between pages and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cr8Desktop', {
  openExternal: url => ipcRenderer.send('cr8:open-external', String(url)),
  // Main asks the page to save pending collection changes before quitting.
  onFlushRequest: fn => {
    ipcRenderer.on('cr8:flush', async () => {
      try { await fn(); } finally { ipcRenderer.send('cr8:flush-done'); }
    });
  },
  onUpdateReady: fn => ipcRenderer.on('cr8:update-ready', () => fn()),
  restartToUpdate: () => ipcRenderer.send('cr8:restart-to-update'),
});
