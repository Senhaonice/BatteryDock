const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('battery', {
  state: () => ipcRenderer.invoke('battery:get'),
  settings: patch => ipcRenderer.invoke('battery:settings', patch),
  refresh: () => ipcRenderer.invoke('battery:refresh'),
  hide: () => ipcRenderer.send('battery:hide'),
  resize: height => ipcRenderer.send('battery:resize', height),
  logs: () => ipcRenderer.invoke('battery:logs'),
  taskbar: () => ipcRenderer.invoke('battery:taskbar'),
  quit: () => ipcRenderer.send('battery:quit'),
  onState: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('battery:state', listener); return () => ipcRenderer.removeListener('battery:state', listener); },
  onView: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('battery:view', listener); return () => ipcRenderer.removeListener('battery:view', listener); }
});
