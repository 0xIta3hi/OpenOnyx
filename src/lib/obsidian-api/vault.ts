/**
 * Obsidian API Compatibility — Vault
 * Wraps OpenObsidian's file system operations to match Obsidian's Vault API.
 */

import { Events, EventRef } from './components';
import { TAbstractFile, TFile, TFolder } from './files';
import { normalizePath } from './utils';

const api = () => (window as any).electronAPI;

export class OOVault extends Events {
  adapter: any;
  configDir = '.openobsidian';
  config: Record<string, any> = {
    useMarkdownLinks: false,
    newLinkFormat: 'shortest',
    showUnsupportedFiles: true,
  };
  private _path: string = '';

  private _files: Map<string, TAbstractFile> = new Map();
  private _root: TFolder = new TFolder('/');
  private _config: Record<string, any> = {};

  constructor() {
    super();
    this._root.vault = this;
    this._files.set('/', this._root);
    
    // Initialize adapter with stubs and real implementations where possible
    this.adapter = {
      getBasePath: () => this._path || (window as any).__oo_vault_path || '',
      getName: () => this.getName(),
      fs: {
        exists: (path: string, cb: any) => { cb(true); },
        stat: (path: string, cb: any) => { cb(null, { isDirectory: () => false }); },
        readFile: (path: string, enc: any, cb: any) => { cb(null, ''); },
        writeFile: (path: string, data: any, enc: any, cb: any) => { cb(null); },
      },
      // Essential DataAdapter methods
      read: async (path: string) => {
        const file = this.getAbstractFileByPath(path);
        if (file instanceof TFile) return await this.read(file);
        throw new Error('Not a file');
      },
      write: async (path: string, data: string) => {
        return await this.adapter.writeFile(path, data);
      },
      exists: async (path: string) => {
        return !!this.getAbstractFileByPath(path);
      },
      stat: async (path: string) => {
        const file = this.getAbstractFileByPath(path);
        if (!file) return null;
        if (file instanceof TFile) {
          return {
            type: 'file',
            ctime: file.stat.ctime,
            mtime: file.stat.mtime,
            size: file.stat.size
          };
        }
        return {
          type: 'folder',
          ctime: Date.now(),
          mtime: Date.now(),
          size: 0
        };
      },
      getResourcePath: (path: string) => {
        const base = this.adapter.getBasePath();
        return `app://local${base}/${path}`;
      },
      list: async (path: string) => {
        const folder = this.getAbstractFileByPath(path);
        if (folder instanceof TFolder) {
          return {
            files: folder.children.filter(f => f instanceof TFile).map(f => f.path),
            folders: folder.children.filter(f => f instanceof TFolder).map(f => f.path)
          };
        }
        return { files: [], folders: [] };
      },
      trashLocal: async () => {},
      trashSystem: async () => {},
      mkdir: async (path: string) => {
        await api().createDirectory(path);
        await this.refreshFiles();
      },
      append: async (path: string, data: string) => {
        try {
          const existing = await api().readFile(path);
          await api().writeFile(path, (existing || '') + data);
        } catch {
          await api().writeFile(path, data);
        }
      },
      readFile: async (path: string, encoding?: string) => {
        return await api().readFile(path) || '';
      },
      readBinary: async (path: string) => {
        const bytes = await api().readBinary(path);
        return new Uint8Array(bytes).buffer;
      },
      writeFile: async (path: string, data: string) => {
        await api().writeFile(path, data);
      },
      writeBinary: async (path: string, data: ArrayBuffer | Uint8Array) => {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        await api().writeBinary(path, bytes);
      },
      remove: async (path: string) => {
        await api().deleteFile(path);
      },
      rename: async (oldPath: string, newPath: string) => {
        await api().renameFile(oldPath, newPath);
      },
      copy: async (oldPath: string, newPath: string) => {
        const bytes = await api().readBinary(oldPath);
        await api().writeBinary(newPath, new Uint8Array(bytes));
      },
      rmdir: async (path: string, recursive = false) => {
        await api().deleteDirectory(path);
        await this.refreshFiles();
      },
      getFilePath: (path: string) => `${this.adapter.getBasePath()}/${normalizePath(path)}`,
      getFullPath: (path: string) => `${this.adapter.getBasePath()}/${normalizePath(path)}`,
      getRealPath: (path: string) => `${this.adapter.getBasePath()}/${normalizePath(path)}`,
      getFullRealPath: (path: string) => `${this.adapter.getBasePath()}/${normalizePath(path)}`,
    };

    // Try to recover path from global if available immediately
    this._path = (window as any).__oo_vault_path || '';
  }

  getName(): string {
    // Extract vault name from path
    try {
      const vp = this._path || (window as any).__oo_vault_path || '';
      return vp.split('/').pop() || vp.split('\\').pop() || 'Vault';
    } catch { return 'Vault'; }
  }

  getConfig(key: string): any {
    if (key in this._config) return this._config[key];
    if (key in this.config) return this.config[key];
    try {
      const stored = localStorage.getItem(`oo_vault_config_${key}`);
      return stored === null ? undefined : JSON.parse(stored);
    } catch {
      return undefined;
    }
  }

  setConfig(key: string, value: any): void {
    this._config[key] = value;
    this.config[key] = value;
    try { localStorage.setItem(`oo_vault_config_${key}`, JSON.stringify(value)); } catch { /* ignore */ }
  }

  // ── File Tree Management ──────────────────────────

  /** Rebuild internal file tree from the real filesystem */
  async refreshFiles(): Promise<void> {
    const vaultPath = await api().getVaultPath();
    if (vaultPath) {
      this._path = vaultPath;
      (window as any).__oo_vault_path = vaultPath;
    }

    this._files.clear();
    this._root = new TFolder('/');
    this._root.vault = this;
    this._files.set('/', this._root);
    
    if (!this._path) {
      console.warn('[OOVault] Refresh failed: No vault path set');
      return;
    }

    try {
      const tree = await api().getFileTree();
      this._buildTree(tree, this._root);
    } catch (e) {
      console.warn('[OOVault] Failed to refresh files:', e);
    }
  }

  private _buildTree(entries: any[], parent: TFolder): void {
    for (const entry of entries) {
      if (entry.isDirectory) {
        const folder = new TFolder(entry.path);
        folder.vault = this;
        folder.parent = parent;
        parent.children.push(folder);
        this._files.set(entry.path, folder);
        if (entry.children) this._buildTree(entry.children, folder);
      } else {
        const file = new TFile(entry.path, {
          mtime: entry.modifiedAt,
          size: entry.size,
          ctime: entry.modifiedAt,
        });
        file.vault = this;
        file.parent = parent;
        parent.children.push(file);
        this._files.set(entry.path, file);
      }
    }
  }

  // ── File Access ───────────────────────────────────

  getRoot(): TFolder { return this._root; }

  getAbstractFileByPath(path: string): TAbstractFile | null {
    return this._files.get(normalizePath(path)) || null;
  }

  getAbstractFileByPathInsensitive(path: string): TAbstractFile | null {
    const normalized = normalizePath(path).toLowerCase();
    for (const [candidate, file] of this._files) {
      if (candidate.toLowerCase() === normalized) return file;
    }
    return null;
  }

  getFileByPath(path: string): TFile | null {
    const f = this._files.get(normalizePath(path));
    return f instanceof TFile ? f : null;
  }

  getFolderByPath(path: string): TFolder | null {
    const f = this._files.get(normalizePath(path));
    return f instanceof TFolder ? f : null;
  }

  getAllLoadedFiles(): TAbstractFile[] {
    return Array.from(this._files.values());
  }

  getMarkdownFiles(): TFile[] {
    return this.getFiles().filter(f => f.extension === 'md');
  }

  getFiles(): TFile[] {
    return Array.from(this._files.values()).filter((f): f is TFile => f instanceof TFile);
  }

  getAllFolders(includeRoot?: boolean): TFolder[] {
    const folders = Array.from(this._files.values()).filter((f): f is TFolder => f instanceof TFolder);
    if (includeRoot) folders.unshift(this._root);
    return folders;
  }

  getAvailablePath(path: string, extension?: string): string {
    const requested = extension
      ? `${normalizePath(path).replace(/\.[^/.]+$/, '')}.${extension.replace(/^\./, '')}`
      : normalizePath(path);
    if (!this.getAbstractFileByPathInsensitive(requested)) return requested;
    const dot = requested.lastIndexOf('.');
    const slash = requested.lastIndexOf('/');
    const hasExtension = dot > slash;
    const base = hasExtension ? requested.slice(0, dot) : requested;
    const suffix = hasExtension ? requested.slice(dot) : '';
    let index = 1;
    while (this.getAbstractFileByPathInsensitive(`${base} ${index}${suffix}`)) index++;
    return `${base} ${index}${suffix}`;
  }

  getAvailablePathForAttachments(filename: string, sourcePath = ''): string {
    const attachmentFolder = this.getConfig('attachmentFolderPath');
    const sourceFolder = sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/')) : '';
    const folder = attachmentFolder === './'
      ? sourceFolder
      : typeof attachmentFolder === 'string' && attachmentFolder.length > 0
        ? attachmentFolder
        : '';
    return this.getAvailablePath(folder ? `${folder}/${filename}` : filename);
  }

  exists(path: string, sensitive = true): boolean {
    return sensitive
      ? Boolean(this.getAbstractFileByPath(path))
      : Boolean(this.getAbstractFileByPathInsensitive(path));
  }

  iterateFiles(callback: (file: TFile) => any): void {
    for (const file of this.getFiles()) callback(file);
  }

  static recurseChildren(root: TFolder, cb: (file: TAbstractFile) => any): void {
    for (const child of root.children) {
      cb(child);
      if (child instanceof TFolder) OOVault.recurseChildren(child, cb);
    }
  }

  // ── File Operations ───────────────────────────────

  async create(path: string, data: string): Promise<TFile> {
    const np = normalizePath(path);
    await api().createFile(np, data);
    const file = new TFile(np);
    file.vault = this;
    this._files.set(np, file);
    await (window as any).__oo_app?.metadataCache?.updateFileCache?.(file);
    this.trigger('create', file);
    return file;
  }

  async createBinary(path: string, data: ArrayBuffer): Promise<TFile> {
    const np = normalizePath(path);
    await api().writeBinary(np, new Uint8Array(data));
    const file = new TFile(np);
    file.vault = this;
    this._files.set(np, file);
    this.trigger('create', file);
    return file;
  }

  async createFolder(path: string): Promise<void> {
    await api().createDirectory(normalizePath(path));
    const folder = new TFolder(normalizePath(path));
    folder.vault = this;
    this._files.set(normalizePath(path), folder);
  }

  async read(file: TFile): Promise<string> {
    return api().readFile(file.path);
  }

  async cachedRead(file: TFile): Promise<string> {
    return this.read(file);
  }

  async readBinary(file: TFile): Promise<ArrayBuffer> {
    const bytes = await api().readBinary(file.path);
    return new Uint8Array(bytes).buffer;
  }

  getResourcePath(file: TFile): string {
    return `app://local/${file.path}`;
  }

  async modify(file: TFile, data: string): Promise<void> {
    await api().writeFile(file.path, data);
    file.stat.mtime = Date.now();
    await (window as any).__oo_app?.metadataCache?.updateFileCache?.(file);
    this.trigger('modify', file);
  }

  async modifyBinary(file: TFile, data: ArrayBuffer): Promise<void> {
    await api().writeBinary(file.path, new Uint8Array(data));
    file.stat.mtime = Date.now();
    this.trigger('modify', file);
  }

  async appendBinary(file: TFile, data: ArrayBuffer): Promise<void> {
    const current = new Uint8Array(await this.readBinary(file));
    const addition = new Uint8Array(data);
    const combined = new Uint8Array(current.length + addition.length);
    combined.set(current);
    combined.set(addition, current.length);
    await this.modifyBinary(file, combined.buffer);
  }

  async append(file: TFile, data: string): Promise<void> {
    const content = await this.read(file);
    await this.modify(file, content + data);
  }

  async process(file: TFile, fn: (data: string) => string): Promise<string> {
    const data = await this.read(file);
    const result = fn(data);
    await this.modify(file, result);
    return result;
  }

  async delete(file: TAbstractFile, force?: boolean): Promise<void> {
    if (file instanceof TFile) {
      await api().deleteFile(file.path);
    } else {
      await api().deleteDirectory(file.path);
    }
    this._files.delete(file.path);
    (window as any).__oo_app?.metadataCache?.deletePath?.(file.path);
    this.trigger('delete', file);
  }

  async trash(file: TAbstractFile, system: boolean): Promise<void> {
    return this.delete(file);
  }

  async rename(file: TAbstractFile, newPath: string): Promise<void> {
    const oldPath = file.path;
    const np = normalizePath(newPath);
    await api().renameFile(oldPath, np);
    this._files.delete(oldPath);
    file.path = np;
    file.name = np.split('/').pop() || np;
    if (file instanceof TFile) {
      const dotIdx = file.name.lastIndexOf('.');
      file.basename = dotIdx > 0 ? file.name.substring(0, dotIdx) : file.name;
      file.extension = dotIdx > 0 ? file.name.substring(dotIdx + 1) : '';
    }
    this._files.set(np, file);
    const metadataCache = (window as any).__oo_app?.metadataCache;
    metadataCache?.deletePath?.(oldPath);
    if (file instanceof TFile) await metadataCache?.updateFileCache?.(file);
    this.trigger('rename', file, oldPath);
  }

  async copy(file: TAbstractFile, newPath: string): Promise<TFile> {
    if (file instanceof TFile) {
      const data = await this.read(file);
      return this.create(newPath, data);
    }
    throw new Error('Cannot copy folders');
  }

  getLastOpenFiles(): string[] { return []; }
}
