const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('__ELECTRON__', {
  isElectron: true,
});
