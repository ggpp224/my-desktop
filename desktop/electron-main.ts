/* AI 生成 By Peng.Guo */
import 'dotenv/config';
import { app, BrowserWindow, Menu } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { startServer } from '../server/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 仅当显式 NODE_ENV=development 时走开发模式（连 5173）；否则一律用打包 UI，避免 npm run start 或安装版误连 5173 白屏
const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

function createWindow(apiPort: number): void {
  const preloadPath = path.join(__dirname, 'preload.js');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: isDev ? undefined : preloadPath,
    },
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, desc) => {
    console.error('Window load failed:', code, desc);
    mainWindow?.show();
  });
  // 右键菜单：检查 -> 打开 DevTools
  mainWindow.webContents.on('context-menu', (_event, _params) => {
    const ctxMenu = Menu.buildFromTemplate([
      { label: '检查', click: () => mainWindow?.webContents.openDevTools() },
    ]);
    ctxMenu.popup({ window: mainWindow! });
  });
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173').catch((err) => {
      console.error('loadURL failed:', err);
      mainWindow?.show();
    });
    // 默认不自动打开 DevTools，需要时可用快捷键或菜单手动打开
  } else {
    const indexHtml = path.join(app.getAppPath(), 'ui', 'dist', 'index.html');
    mainWindow.loadFile(indexHtml).catch((err) => {
      console.error('loadFile failed:', indexHtml, err);
      mainWindow?.show();
    });
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow?.webContents.send('api-port', apiPort);
    });
  }
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  const apiPort = isDev ? 3000 : await startServer();
  createWindow(apiPort);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(apiPort);
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
