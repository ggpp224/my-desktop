/* AI 生成 By Peng.Guo */
import 'dotenv/config';
import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { openExternalUrlPreferChrome } from './open-external-chrome.js';
import { startServer } from '../server/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 仅当显式 NODE_ENV=development 时走开发模式（连 5173）；否则一律用打包 UI，避免 npm run start 或安装版误连 5173 白屏
const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

// AI 生成 By Peng.Guo
// 在可用设备上尽量启用 GPU 与 WebGL 相关能力（仍受驱动与系统策略限制）。
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-accelerated-2d-canvas');

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

  const isAppNavigationUrl = (navigationUrl: string): boolean => {
    try {
      const u = new URL(navigationUrl);
      if (u.protocol === 'file:') return true;
      if (u.protocol === 'http:' && u.hostname === 'localhost') {
        const port = u.port || '80';
        if (port === '5173' || port === String(apiPort)) return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl.startsWith('http://') || navigationUrl.startsWith('https://')) {
      if (!isAppNavigationUrl(navigationUrl)) {
        event.preventDefault();
        openExternalUrlPreferChrome(navigationUrl);
      }
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      openExternalUrlPreferChrome(url);
      return { action: 'deny' };
    }
    if (url.startsWith('mailto:')) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'deny' };
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
