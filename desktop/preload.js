/* AI 生成 By Peng.Guo */
const { contextBridge, ipcRenderer } = require('electron');

let apiPort = null;
ipcRenderer.on('api-port', (_, port) => {
  apiPort = port;
});

contextBridge.exposeInMainWorld('electronAPI', {
  getApiBase: () =>
    apiPort !== null
      ? Promise.resolve('http://localhost:' + apiPort)
      : new Promise((resolve) => {
          ipcRenderer.once('api-port', (_, port) => resolve('http://localhost:' + port));
        }),
});
