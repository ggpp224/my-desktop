/* AI 生成 By Peng.Guo */
const { contextBridge, ipcRenderer } = require('electron');

let apiPort = null;
ipcRenderer.on('api-port', (_, port) => {
  apiPort = port;
});

function toApiBase(port) {
  return 'http://127.0.0.1:' + port;
}

contextBridge.exposeInMainWorld('electronAPI', {
  getApiBase: () =>
    ipcRenderer.invoke('get-api-port').then((port) => {
      if (typeof port === 'number' && port > 0) {
        apiPort = port;
        return toApiBase(port);
      }
      if (apiPort !== null) return Promise.resolve(toApiBase(apiPort));
      return new Promise((resolve) => {
        ipcRenderer.once('api-port', (_, p) => resolve(toApiBase(p)));
      });
    }),
  onApiPortChanged: (handler) => {
    const listener = (_, port) => handler(toApiBase(port));
    ipcRenderer.on('api-port', listener);
    return () => ipcRenderer.removeListener('api-port', listener);
  },
  onApiChildExited: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('api-child-exited', listener);
    return () => ipcRenderer.removeListener('api-child-exited', listener);
  },
});
