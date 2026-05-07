/**
 * OpenObsidian - Electron Main Process
 * 
 * Handles window creation, IPC communication, and lifecycle management.
 * All filesystem operations are delegated to the fileSystem module and
 * exposed to the renderer via secure IPC channels.
 */

import { app, BrowserWindow, ipcMain, dialog, Menu, globalShortcut, shell, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { FileSystemManager } from './fileSystem';
import { SearchEngine } from './search';
import { registerIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;
let fsManager: FileSystemManager | null = null;
let searchEngine: SearchEngine | null = null;

const isDevMode = !app.isPackaged;

function addDisableFeatures(features: string[]): void {
  const existing = app.commandLine.getSwitchValue('disable-features');
  const merged = new Set([
    ...existing.split(',').map((item) => item.trim()).filter(Boolean),
    ...features,
  ]);
  app.commandLine.appendSwitch('disable-features', [...merged].join(','));
}

function configureLinuxFontConfig(): void {
  if (process.platform !== 'linux') return;
  if (process.env.FONTCONFIG_PATH && process.env.FONTCONFIG_FILE) return;

  const candidates = [
    { path: '/etc/fonts', file: '/etc/fonts/fonts.conf' },
    { path: '/usr/share/defaults/fonts', file: '/usr/share/defaults/fonts/fonts.conf' },
    { path: '/usr/local/etc/fonts', file: '/usr/local/etc/fonts/fonts.conf' },
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate.file)) continue;
    if (!process.env.FONTCONFIG_PATH) process.env.FONTCONFIG_PATH = candidate.path;
    if (!process.env.FONTCONFIG_FILE) process.env.FONTCONFIG_FILE = candidate.file;
    break;
  }
}

function configureChromiumRuntime(): void {
  configureLinuxFontConfig();

  if (!isDevMode) return;
  if (process.env.OPENOBSIDIAN_VERBOSE_CHROMIUM_LOGS === '1') return;

  // Suppress noisy Chromium diagnostics that are non-actionable in local dev.
  app.commandLine.appendSwitch('disable-logging');
  app.commandLine.appendSwitch('log-level', '3');
  app.commandLine.appendSwitch('no-first-run');
  app.commandLine.appendSwitch('no-default-browser-check');
  app.commandLine.appendSwitch('disable-component-update');
  app.commandLine.appendSwitch('disable-background-networking');
  app.commandLine.appendSwitch('disable-domain-reliability');
  app.commandLine.appendSwitch('disable-client-side-phishing-detection');
  app.commandLine.appendSwitch('metrics-recording-only');

  addDisableFeatures([
    'MediaRouter',
    'OptimizationHints',
    'AutofillServerCommunication',
    'SegmentationPlatform',
  ]);
}

configureChromiumRuntime();

function isExternalHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isAppRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Check if it's a redirect back to our app with auth tokens
    return (
      (parsed.hostname === 'localhost' && parsed.port === '5173') ||
      (parsed.hostname === '127.0.0.1' && parsed.port === '5173')
    );
  } catch {
    return false;
  }
}

function shouldForwardRendererLog(message: string): boolean {
  const suppressedMessages = [
    '[vite] server connection lost. Polling for restart...',
  ];
  return !suppressedMessages.some((entry) => message.includes(entry));
}

/** Create the main application window */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'OpenObsidian',
    backgroundColor: '#0f0f14',
    titleBarStyle: 'hiddenInset',
    frame: process.platform === 'darwin' ? true : false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false,
    },
  });

  // In development, load from Vite dev server
  if (process.env.NODE_ENV !== 'production' && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (process.env.NODE_ENV !== 'production') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Strip OAuth tokens from URL hash after load
  mainWindow.webContents.on('did-finish-load', () => {
    const current = mainWindow?.webContents.getURL() || '';
    if (current.includes('#access_token=')) {
      const clean = current.split('#')[0];
      void mainWindow?.webContents.loadURL(clean);
    }
  });

  // Debugging: Forward renderer console logs to main process console
  mainWindow.webContents.on('console-message', (details) => {
    const { message, sourceId, lineNumber } = details;
    if (!shouldForwardRendererLog(message)) return;
    console.log(`[RENDERER] ${message} (at ${sourceId}:${lineNumber})`);
  });

  // OAuth redirect handling: if redirect goes back to our app with auth tokens, handle it
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!mainWindow) return;

    // If redirect is back to our app, let it happen (it contains auth tokens)
    if (isAppRedirectUrl(navigationUrl)) {
      return;
    }

    if (!isExternalHttpUrl(navigationUrl)) return;

    let isSameOrigin = false;
    try {
      const currentUrl = mainWindow.webContents.getURL();
      isSameOrigin = new URL(navigationUrl).origin === new URL(currentUrl).origin;
    } catch {
      isSameOrigin = false;
    }

    if (isSameOrigin) return;
    event.preventDefault();
    void shell.openExternal(navigationUrl);
  });

  // // Open DevTools by default for debugging
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/** Build the application menu */
function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Vault',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open-vault'),
        },
        { type: 'separator' },
        {
          label: 'New Note',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-note'),
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:save'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Graph View',
          accelerator: 'CmdOrCtrl+G',
          click: () => mainWindow?.webContents.send('menu:toggle-graph'),
        },
        {
          label: 'Command Palette',
          accelerator: 'CmdOrCtrl+P',
          click: () => mainWindow?.webContents.send('menu:command-palette'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow?.webContents.send('menu:toggle-sidebar'),
        },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { role: 'reload' },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'vault', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } }
]);

app.whenReady().then(() => {
  fsManager = new FileSystemManager();
  searchEngine = new SearchEngine();

  // Register all IPC handlers for renderer communication
  registerIpcHandlers(ipcMain, fsManager, searchEngine, () => mainWindow);

  // Handle vault directory selection dialog
  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Vault Directory',
    });
    return result.canceled ? null : result.filePaths[0];
  });

  buildMenu();
  createWindow();

  protocol.handle('vault', async (request) => {
    if (!fsManager) return new Response('No vault', { status: 404 });
    const vaultPath = fsManager.getVaultPath();
    if (!vaultPath) return new Response('No vault', { status: 404 });

    const urlPath = decodeURIComponent(request.url.replace(/^vault:\/\/(?:local\/)?/, ''));
    if (!urlPath) return new Response('Bad request', { status: 400 });

    const fullPath = path.join(vaultPath, urlPath);

    // 1. Try exact path match
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      return net.fetch('file://' + fullPath);
    }

    // 2. Obsidian-style fallback: search for filename anywhere in vault
    const fileName = path.basename(urlPath);
    const searchVaultForFile = (dir: string, targetName: string): string | null => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const entryPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            const found = searchVaultForFile(entryPath, targetName);
            if (found) return found;
          } else if (entry.name === targetName) {
            return entryPath;
          }
        }
      } catch {
        // ignore errors
      }
      return null;
    };

    const foundPath = searchVaultForFile(vaultPath, fileName);
    if (foundPath) {
      return net.fetch('file://' + foundPath);
    }

    return new Response('Not found', { status: 404 });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up on exit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
