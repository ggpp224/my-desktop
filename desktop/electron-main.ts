/* AI 生成 By Peng.Guo */
import 'dotenv/config';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { generateMdPdfBesideSource } from './md-pdf-generator.js';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { releaseApiPort } from '../server/port-utils.js';
import { stripApiPortFromProcessEnv } from '../server/sanitize-shell-env.js';
import {
  setApiChildExitedListener,
  setApiRestartListener,
  startManagedApiServer,
  stopManagedApiServer,
} from './api-server-manager.js';
import { openExternalUrlPreferChrome } from './open-external-chrome.js';
import { config } from '../config/default.js';

/** cjet dev / webpack-dev-server 会读 process.env.PORT，勿让 API 端口污染 Electron 与内嵌 PTY */
stripApiPortFromProcessEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 仅当显式 NODE_ENV=development 时走开发模式（连 5173）；否则一律用打包 UI
const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';
app.setName('AI Dev Control Center');

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-accelerated-2d-canvas');

let mainWindow: BrowserWindow | null = null;
let apiPort = config.server.port;
let isStoppingApi = false;

/** 渲染进程随时同步获取端口，避免 api-port 事件早于 preload 订阅导致 getApiBase 永久挂起 */
ipcMain.handle('get-api-port', () => apiPort);

/** MD → PDF：选择本地 .md 文件 */
ipcMain.handle('pick-md-file', async () => {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
  const dialogOptions = {
    title: '选择 Markdown 文件',
    properties: ['openFile'] as Array<'openFile'>,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
  };
  const result =
    win != null ? await dialog.showOpenDialog(win, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true as const };
  }
  return { canceled: false as const, filePath: result.filePaths[0] };
});

/** MD → PDF：在同目录生成 GitLab 风格 PDF */
ipcMain.handle('generate-md-pdf', async (_event, mdFilePath: unknown) => {
  const path = typeof mdFilePath === 'string' ? mdFilePath.trim() : '';
  if (!path) return { success: false, error: '缺少文件路径' };
  return generateMdPdfBesideSource(path);
});

function getProjectRoot(): string {
  return app.getAppPath();
}

function resolveAppIconPath(): string | null {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'build', 'icon.png'),
        path.join(process.resourcesPath, 'icon.png'),
      ]
    : [path.join(getProjectRoot(), 'build', 'icon.png')];

  for (const iconPath of candidates) {
    if (iconPath && existsSync(iconPath)) {
      return iconPath;
    }
  }
  return null;
}

function notifyRendererApiPort(win: BrowserWindow | null, port: number): void {
  if (!win || win.isDestroyed()) return;
  const send = () => {
    if (!win.isDestroyed()) win.webContents.send('api-port', port);
  };
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

function createWindow(): void {
  const preloadPath = path.join(__dirname, 'preload.js');
  const appIconPath = resolveAppIconPath() ?? undefined;
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    icon: appIconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
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

  mainWindow.webContents.on('context-menu', (_event, _params) => {
    const ctxMenu = Menu.buildFromTemplate([
      { label: '检查', click: () => mainWindow?.webContents.openDevTools() },
    ]);
    ctxMenu.popup({ window: mainWindow! });
  });
  if (isDev) {
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const tag = level >= 2 ? 'error' : 'log';
      console[tag](`[renderer] ${message} (${sourceId}:${line})`);
    });
    mainWindow.loadURL('http://localhost:5173').catch((err) => {
      console.error('loadURL failed:', err);
      mainWindow?.show();
    });
  } else {
    const indexHtml = path.join(getProjectRoot(), 'ui', 'dist', 'index.html');
    mainWindow.loadFile(indexHtml).catch((err) => {
      console.error('loadFile failed:', indexHtml, err);
      mainWindow?.show();
    });
  }
  notifyRendererApiPort(mainWindow, apiPort);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  const appIconPath = resolveAppIconPath();
  if (process.platform === 'darwin' && appIconPath) {
    app.dock.setIcon(appIconPath);
  }

  setApiRestartListener((port) => {
    apiPort = port;
    notifyRendererApiPort(mainWindow, port);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('api-restarted');
    }
  });

  setApiChildExitedListener(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('api-child-exited');
    }
  });

  try {
    apiPort = await startManagedApiServer(getProjectRoot(), isDev);
  } catch (err) {
    console.error('startManagedApiServer failed:', err);
  }

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/** 关终端 / Cmd+Q 时清理有上限，避免 preventDefault 后卡死导致 Terminal 假死 */
const QUIT_CLEANUP_TIMEOUT_MS = 2500;

app.on('before-quit', (event) => {
  if (isStoppingApi) return;
  event.preventDefault();
  isStoppingApi = true;
  const forceExit = setTimeout(() => {
    console.error(`[electron] quit cleanup timed out after ${QUIT_CLEANUP_TIMEOUT_MS}ms, force exit`);
    app.exit(0);
  }, QUIT_CLEANUP_TIMEOUT_MS);
  void stopManagedApiServer(apiPort, { stopBroker: true })
    .then(() => releaseApiPort(apiPort))
    .catch((err) => {
      console.error('[electron] quit cleanup failed:', err);
    })
    .finally(() => {
      clearTimeout(forceExit);
      app.exit(0);
    });
});

app.on('window-all-closed', () => {
  app.quit();
});
