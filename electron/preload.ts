/**
 * Preload Script - Bridge between Main and Renderer
 * 
 * Exposes a secure API to the renderer process via contextBridge.
 * All filesystem and system operations are proxied through IPC channels.
 */

import { contextBridge, ipcRenderer } from 'electron';

/** Type-safe API exposed to the renderer */
const electronAPI = {
  // ── Vault Operations ──────────────────────────────
  openVaultDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openDirectory'),
  
  setVaultPath: (vaultPath: string): Promise<boolean> =>
    ipcRenderer.invoke('vault:setPath', vaultPath),

  getVaultPath: (): Promise<string | null> =>
    ipcRenderer.invoke('vault:getPath'),

  // ── File Operations ───────────────────────────────
  listFiles: (dirPath?: string): Promise<any[]> =>
    ipcRenderer.invoke('fs:listFiles', dirPath),
  
  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:readFile', filePath),
  
  writeFile: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),
  
  createFile: (filePath: string, content?: string): Promise<void> =>
    ipcRenderer.invoke('fs:createFile', filePath, content),
  
  deleteFile: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('fs:deleteFile', filePath),
  
  renameFile: (oldPath: string, newPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:renameFile', oldPath, newPath),
  
  createDirectory: (dirPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:createDirectory', dirPath),
  
  deleteDirectory: (dirPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:deleteDirectory', dirPath),

  fileExists: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:fileExists', filePath),

  getFileTree: (): Promise<any> =>
    ipcRenderer.invoke('fs:getFileTree'),

  // ── Search Operations ─────────────────────────────
  search: (query: string): Promise<any[]> =>
    ipcRenderer.invoke('search:query', query),
  
  rebuildIndex: (): Promise<void> =>
    ipcRenderer.invoke('search:rebuildIndex'),

  // ── Graph Operations ──────────────────────────────
  getGraphData: (): Promise<any> =>
    ipcRenderer.invoke('graph:getData'),

  getBacklinks: (filePath: string): Promise<string[]> =>
    ipcRenderer.invoke('graph:getBacklinks', filePath),

  // ── Window Controls ───────────────────────────────
  minimizeWindow: (): void => ipcRenderer.send('window:minimize'),
  maximizeWindow: (): void => ipcRenderer.send('window:maximize'),
  closeWindow: (): void => ipcRenderer.send('window:close'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),

  // ── Menu Event Listeners ──────────────────────────
  onMenuEvent: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = [
      'menu:open-vault', 'menu:new-note', 'menu:save',
      'menu:toggle-graph', 'menu:command-palette', 'menu:toggle-sidebar',
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },

  removeMenuListener: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // ── Daily Note ────────────────────────────────────
  createDailyNote: (): Promise<string> =>
    ipcRenderer.invoke('notes:createDaily'),

  // ── Tags ──────────────────────────────────────────
  getAllTags: (): Promise<Record<string, string[]>> =>
    ipcRenderer.invoke('tags:getAll'),

  // ── Attachments/Images ────────────────────────────
  saveImage: (fileName: string, base64Data: string): Promise<string> =>
    ipcRenderer.invoke('attachments:saveImage', fileName, base64Data),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
