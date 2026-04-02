/**
 * OpenObsidian - Electron Main Process
 * 
 * Handles window creation, IPC communication, and lifecycle management.
 * All filesystem operations are delegated to the fileSystem module and
 * exposed to the renderer via secure IPC channels.
 */

import { app, BrowserWindow, ipcMain, dialog, Menu, globalShortcut } from 'electron';
import * as path from 'path';
import { FileSystemManager } from './fileSystem';
import { SearchEngine } from './search';
import { registerIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;
let fsManager: FileSystemManager | null = null;
let searchEngine: SearchEngine | null = null;

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
      contextIsolation: true,
      nodeIntegration: false,
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

  // Debugging: Forward renderer console logs to main process console
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER] ${message} (at ${sourceId}:${line})`);
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
