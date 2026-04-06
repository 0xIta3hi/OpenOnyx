/**
 * IPC Handler Registration
 * 
 * Centralizes all IPC channel registrations for clean separation.
 * Each handler validates inputs and delegates to the appropriate manager.
 */

import { IpcMain, BrowserWindow } from 'electron';
import { FileSystemManager } from './fileSystem';
import { SearchEngine } from './search';

export function registerIpcHandlers(
  ipcMain: IpcMain,
  fsManager: FileSystemManager,
  searchEngine: SearchEngine,
  getMainWindow: () => BrowserWindow | null
): void {

  // ── Vault Operations ──────────────────────────────
  ipcMain.handle('vault:setPath', async (_event, vaultPath: string) => {
    const success = fsManager.setVaultPath(vaultPath);
    if (success) {
      // Rebuild search index when vault changes
      await searchEngine.buildIndex(fsManager);
    }
    return success;
  });

  ipcMain.handle('vault:getPath', () => {
    return fsManager.getVaultPath();
  });

  // ── File Operations ───────────────────────────────
  ipcMain.handle('fs:listFiles', async (_event, dirPath?: string) => {
    return fsManager.listFiles(dirPath || '');
  });

  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    return fsManager.readFile(filePath);
  });

  ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
    await fsManager.writeFile(filePath, content);
    // Update search index in background (don't await to avoid blocking)
    searchEngine.buildIndex(fsManager).catch(console.error);
  });

  ipcMain.handle('fs:createFile', async (_event, filePath: string, content?: string) => {
    await fsManager.createFile(filePath, content || '');
  });

  ipcMain.handle('fs:deleteFile', async (_event, filePath: string) => {
    await fsManager.deleteFile(filePath);
    searchEngine.buildIndex(fsManager).catch(console.error);
  });

  ipcMain.handle('fs:renameFile', async (_event, oldPath: string, newPath: string) => {
    await fsManager.renameFile(oldPath, newPath);
    searchEngine.buildIndex(fsManager).catch(console.error);
  });

  ipcMain.handle('fs:createDirectory', async (_event, dirPath: string) => {
    await fsManager.createDirectory(dirPath);
  });

  ipcMain.handle('fs:deleteDirectory', async (_event, dirPath: string) => {
    await fsManager.deleteDirectory(dirPath);
    searchEngine.buildIndex(fsManager).catch(console.error);
  });

  ipcMain.handle('fs:fileExists', async (_event, filePath: string) => {
    return fsManager.fileExists(filePath);
  });

  ipcMain.handle('fs:getFileTree', async () => {
    return fsManager.getFileTree();
  });

  // ── Search Operations ─────────────────────────────
  ipcMain.handle('search:query', async (_event, query: string) => {
    return searchEngine.search(query);
  });

  ipcMain.handle('search:rebuildIndex', async () => {
    await searchEngine.buildIndex(fsManager);
  });

  // ── Graph Operations ──────────────────────────────
  ipcMain.handle('graph:getData', async () => {
    return fsManager.buildGraph();
  });

  ipcMain.handle('graph:getBacklinks', async (_event, filePath: string) => {
    return fsManager.getBacklinks(filePath);
  });

  // ── Tags ──────────────────────────────────────────
  ipcMain.handle('tags:getAll', async () => {
    return fsManager.getAllTags();
  });

  // ── Daily Notes ───────────────────────────────────
  ipcMain.handle('notes:createDaily', async () => {
    return fsManager.createDailyNote();
  });

  // ── Window Controls ───────────────────────────────
  ipcMain.on('window:minimize', () => {
    getMainWindow()?.minimize();
  });

  ipcMain.on('window:maximize', () => {
    const win = getMainWindow();
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    getMainWindow()?.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return getMainWindow()?.isMaximized() || false;
  });

  // ── Attachments/Images ────────────────────────────
  ipcMain.handle('attachments:saveImage', async (_event, fileName: string, base64Data: string) => {
    return fsManager.saveImage(fileName, base64Data);
  });

  // ── Thought Model ─────────────────────────────────
  const THOUGHT_MODEL_URL = 'http://127.0.0.1:8765';

  const isConnRefused = (err: unknown): boolean => {
    return err instanceof Error && 'code' in err && (err as any).code === 'ECONNREFUSED';
  };

  interface APIError { detail?: string }

  ipcMain.handle('thoughtModel:build', async (_event, vaultPath: string, numClusters: number = 12) => {
    try {
      const response = await fetch(`${THOUGHT_MODEL_URL}/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vault_path: vaultPath, num_clusters: numClusters }),
      });
      if (!response.ok) {
        const errorData = await response.json() as APIError;
        throw new Error(errorData.detail || 'Build request failed');
      }
      return await response.json();
    } catch (err) {
      if (isConnRefused(err)) {
        throw new Error('Thought Model service not running. Please start it with: cd thought_model && python main.py');
      }
      throw err;
    }
  });

  ipcMain.handle('thoughtModel:status', async (_event, jobId: string) => {
    try {
      const response = await fetch(`${THOUGHT_MODEL_URL}/status?job_id=${encodeURIComponent(jobId)}`);
      if (!response.ok) {
        const errorData = await response.json() as APIError;
        throw new Error(errorData.detail || 'Status request failed');
      }
      return await response.json();
    } catch (err) {
      if (isConnRefused(err)) {
        throw new Error('Thought Model service not running');
      }
      throw err;
    }
  });

  ipcMain.handle('thoughtModel:themes', async (_event, jobId: string) => {
    try {
      const response = await fetch(`${THOUGHT_MODEL_URL}/themes?job_id=${encodeURIComponent(jobId)}`);
      if (!response.ok) {
        const errorData = await response.json() as APIError;
        throw new Error(errorData.detail || 'Themes request failed');
      }
      return await response.json();
    } catch (err) {
      if (isConnRefused(err)) {
        throw new Error('Thought Model service not running');
      }
      throw err;
    }
  });

  ipcMain.handle('thoughtModel:query', async (_event, jobId: string, query: string, topK: number = 10) => {
    try {
      const response = await fetch(`${THOUGHT_MODEL_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, query, top_k: topK }),
      });
      if (!response.ok) {
        const errorData = await response.json() as APIError;
        throw new Error(errorData.detail || 'Query request failed');
      }
      return await response.json();
    } catch (err) {
      if (isConnRefused(err)) {
        throw new Error('Thought Model service not running');
      }
      throw err;
    }
  });

  ipcMain.handle('thoughtModel:clear', async (_event, jobId: string) => {
    try {
      const response = await fetch(`${THOUGHT_MODEL_URL}/clear?job_id=${encodeURIComponent(jobId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json() as APIError;
        throw new Error(errorData.detail || 'Clear request failed');
      }
      return await response.json();
    } catch (err) {
      if (isConnRefused(err)) {
        throw new Error('Thought Model service not running');
      }
      throw err;
    }
  });

  ipcMain.handle('thoughtModel:health', async () => {
    try {
      const response = await fetch(`${THOUGHT_MODEL_URL}/health`);
      return response.ok;
    } catch {
      return false;
    }
  });
}
