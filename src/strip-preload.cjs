const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('batteryStrip', {
  state: () => ipcRenderer.invoke('battery:get'),
  open: () => ipcRenderer.send('battery:open'),
  menu: () => ipcRenderer.send('battery:menu'),
  onState: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('battery:state', listener);
    return () => ipcRenderer.removeListener('battery:state', listener);
  }
});
