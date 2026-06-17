/**
 * Obsidian API Compatibility — App
 * The root App object that plugins receive.
 */

import { OOVault } from './vault';
import { OOWorkspace } from './workspace';
import { OOMetadataCache } from './metadata';
import { normalizePath, parseYaml, Scope, stringifyYaml } from './utils';

export class OOApp {
  vault: OOVault;
  workspace: OOWorkspace;
  metadataCache: OOMetadataCache;
  scope: Scope;
  customCss: any;
  containerEl: HTMLElement = document.body;
  keymap: any = {};
  fileManager: any;
  lastEvent: Event | null = null;
  renderContext: any = {};
  metadataTypeManager: any = {
    getAllProperties: () => ({}),
    getAssignedType: (_property: string) => null,
    setType: async (_property: string, _type: string) => {},
  };
  secretStorage: any = {
    getSecret: async (key: string) => null,
    setSecret: async (key: string, value: string) => {},
    deleteSecret: async (key: string) => {},
  };

  /** Plugin registry — stub for community plugins that query other plugins */
  plugins: any;
  /** Internal (core) plugins — stub for Calendar's daily-notes integration */
  internalPlugins: any;
  /** App setting — stores things like daily note folder */
  setting: any;

  // ── Storage API ───────────────────────────────────
  loadLocalStorage(key: string): any {
    try {
      const data = localStorage.getItem(`oo_plugin_${key}`);
      return data ? JSON.parse(data) : null;
    } catch { return null; }
  }
  
  saveLocalStorage(key: string, value: any): void {
    try {
      localStorage.setItem(`oo_plugin_${key}`, JSON.stringify(value));
    } catch { /* ignore */ }
  }

  isDarkMode(): boolean {
    return document.body.classList.contains('theme-dark') ||
      window.matchMedia?.('(prefers-color-scheme: dark)')?.matches || false;
  }

  async openWithDefaultApp(path: string): Promise<void> {
    try {
      const electron = (window as any).require?.('electron');
      const basePath = this.vault.adapter.getBasePath();
      await electron?.shell?.openPath?.(`${basePath}/${normalizePath(path)}`);
    } catch (error) {
      console.warn('[App] Failed to open path with default application:', error);
    }
  }

  constructor() {
    this.vault = new OOVault();
    this.workspace = new OOWorkspace();
    this.metadataCache = new OOMetadataCache();
    this.scope = new Scope();
    const thisApp = this;
    const enabledSnippets = new Set<string>(
      this.loadLocalStorage('enabled-css-snippets') || [],
    );
    this.customCss = {
      snippets: [] as string[],
      enabledSnippets,
      theme: '',
      themes: {} as Record<string, any>,
      async requestLoadSnippets() {
        const listing = await thisApp.vault.adapter.list('.obsidian/snippets').catch(() => ({
          files: [],
          folders: [],
        }));
        this.snippets = listing.files
          .filter((path: string) => path.toLowerCase().endsWith('.css'))
          .map((path: string) => path.split('/').pop()!.replace(/\.css$/i, ''))
          .sort();
        return this.snippets;
      },
      async setCssEnabledStatus(snippet: string, enabled: boolean) {
        if (enabled) enabledSnippets.add(snippet);
        else enabledSnippets.delete(snippet);
        thisApp.saveLocalStorage('enabled-css-snippets', Array.from(enabledSnippets));
      },
      async loadSnippet(snippet: string) {
        enabledSnippets.add(snippet);
      },
      unloadSnippet(snippet: string) {
        enabledSnippets.delete(snippet);
      },
    };
    void this.customCss.requestLoadSnippets();

    this.fileManager = {
      getNewFileParent: (sourcePath: string, newFilePath?: string) => {
        const requested = normalizePath(newFilePath || sourcePath || '');
        const parentPath = requested.includes('/') ? requested.slice(0, requested.lastIndexOf('/')) : '/';
        return this.vault.getFolderByPath(parentPath) || this.vault.getRoot();
      },
      renameFile: async (file: any, newPath: string) => this.vault.rename(file, newPath),
      generateMarkdownLink: (file: any, sourcePath: string, subpath?: string, alias?: string) => {
        const display = alias || file.basename;
        const suffix = subpath ? (subpath.startsWith('#') ? subpath : `#${subpath}`) : '';
        return alias ? `[[${file.path}${suffix}|${display}]]` : `[[${file.path}${suffix}]]`;
      },
      processFrontMatter: async (file: any, fn: (frontmatter: any) => void) => {
        const content = await this.vault.read(file);
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        const frontmatter = match ? parseYaml(match[1]) : {};
        fn(frontmatter);
        const serialized = stringifyYaml(frontmatter);
        const next = match
          ? content.replace(/^---\r?\n[\s\S]*?\r?\n---/, `---\n${serialized}\n---`)
          : `---\n${serialized}\n---\n${content}`;
        await this.vault.modify(file, next);
      },
      getAvailablePathForAttachment: async (filename: string) => {
        return this.vault.getAvailablePathForAttachments(filename);
      },
      createNewMarkdownFile: async (parent: any, filename: string, content = '') => {
        const folder = parent?.path && parent.path !== '/' ? `${parent.path}/` : '';
        const requested = filename.toLowerCase().endsWith('.md') ? filename : `${filename}.md`;
        return this.vault.create(this.vault.getAvailablePath(`${folder}${requested}`), content);
      },
      createNewMarkdownFileFromLinktext: async (linktext: string, sourcePath: string, content = '') => {
        const requested = linktext.toLowerCase().endsWith('.md') ? linktext : `${linktext}.md`;
        const parent = this.fileManager.getNewFileParent(sourcePath, requested);
        return this.fileManager.createNewMarkdownFile(parent, requested.split('/').pop(), content);
      },
      createNewFile: async (parent: any, filename: string, content = '') => {
        const folder = parent?.path && parent.path !== '/' ? `${parent.path}/` : '';
        return this.vault.create(this.vault.getAvailablePath(`${folder}${filename}`), content);
      },
      createNewFolder: async (parent: any, folderName: string) => {
        const folder = parent?.path && parent.path !== '/' ? `${parent.path}/` : '';
        const path = this.vault.getAvailablePath(`${folder}${folderName}`);
        await this.vault.createFolder(path);
        return this.vault.getFolderByPath(path);
      },
      insertIntoFile: async (file: any, content: string) => {
        await this.vault.append(file, content);
      },
      getAllLinkResolutions: () => ({ ...this.metadataCache.resolvedLinks }),
      promptForDeletion: async (file: any) => {
        if (!confirm(`Are you sure you want to delete ${file.path}?`)) return false;
        await this.vault.delete(file);
        return true;
      },
      trashFile: async (file: any) => this.vault.trash(file, false),
      promptForFileDeletion: async (file: any) => {
        if (confirm(`Are you sure you want to delete ${file.path}?`)) {
          return this.vault.delete(file);
        }
      },
      promptForFileRename: async (file: any, newPath?: string) => {
        const requested = newPath || prompt(`Rename ${file.path} to:`, file.path);
        if (!requested || requested === file.path) return false;
        await this.vault.rename(file, requested);
        return true;
      },
      promptForFolderDeletion: async (folder: any) => {
        if (!confirm(`Are you sure you want to delete ${folder.path}?`)) return false;
        await this.vault.delete(folder);
        return true;
      },
      canCreateFileWithExt: (_extension: string) => true,
    };

    // Stub for community plugin registry
    this.plugins = {
      enabledPlugins: new Set<string>(),
      plugins: {} as Record<string, any>,
      manifests: {} as Record<string, any>,
      getPlugin: (id: string) => this.plugins.plugins[id] || null,
      isEnabled: (id: string) => this.plugins.enabledPlugins.has(id),
      getPluginFolder: (manifest: any) => manifest?.dir || `.openobsidian/plugins/${manifest?.id || ''}`,
      loadManifest: async (id: string) => this.plugins.manifests[id] || null,
      loadManifests: async () => this.plugins.manifests,
      loadPlugin: async (_id: string) => false,
      unloadPlugin: async (_id: string) => {},
      enablePlugin: async (_id: string) => false,
      enablePluginAndSave: async (_id: string) => false,
      disablePlugin: async (_id: string) => {},
      disablePluginAndSave: async (_id: string) => {},
    };

    // Stub for core/internal plugins (daily-notes, etc.)
    this.internalPlugins = {
      plugins: {
        'daily-notes': { instance: { options: {} }, enabled: true },
        'templates': { instance: { options: {} }, enabled: true },
        'command-palette': { instance: { options: {} }, enabled: true },
      } as Record<string, any>,
      getPluginById: (id: string) => {
        const p = this.internalPlugins.plugins[id];
        if (p) return p;
        return { enabled: false, instance: { options: {} } };
      },
      getEnabledPluginById: (id: string) => {
        const p = this.internalPlugins.plugins[id];
        return p?.enabled ? p : null;
      },
    };

    // App-level settings stub
    this.setting = {
      activeTab: null,
      open: () => {},
      close: () => {},
      openTabById: (id: string) => {},
    };

    const commands: Record<string, any> = {};
    (this as any).commands = {
      commands,
      addCommand: (cmd: any) => {
        if (cmd?.id) commands[cmd.id] = cmd;
        return cmd;
      },
      removeCommand: (id: string) => {
        delete commands[id];
      },
      listCommands: () => Object.values(commands),
      findCommand: (id: string) => commands[id] || null,
      executeCommand: (cmd: any) => {
        if (!cmd) return false;
        const activeEditor = this.workspace.activeEditor;
        if (cmd.editorCheckCallback && activeEditor?.editor) {
          if (!cmd.editorCheckCallback(true, activeEditor.editor, activeEditor)) return false;
          cmd.editorCheckCallback(false, activeEditor.editor, activeEditor);
          return true;
        }
        if (cmd.checkCallback) {
          if (!cmd.checkCallback(true)) return false;
          cmd.checkCallback(false);
          return true;
        }
        if (cmd.editorCallback && activeEditor?.editor) {
          cmd.editorCallback(activeEditor.editor, activeEditor);
          return true;
        }
        if (cmd.callback) {
          cmd.callback();
          return true;
        }
        return false;
      },
      executeCommandById: (id: string) => (this as any).commands.executeCommand(commands[id]),
    };

    // Embed registry stub (used by Kanban plugin to extract MarkdownEditor constructor)
    class MockGrandparent {}
    class MockParent extends MockGrandparent {}
    class MockEditMode extends MockParent {}

    (this as any).embedRegistry = {
      embedByExtension: {
        md: (ctx: any, file: any, subpath: string) => {
          return {
            load: () => {},
            unload: () => {},
            showEditor: () => {},
            editable: false,
            editMode: new MockEditMode()
          };
        }
      }
    };

    // Make the app globally accessible for plugins
    (window as any).__oo_app = this;
    (window as any).app = this;
  }

  /** Initialize the app — call after vault path is known */
  async initialize(): Promise<void> {
    await this.vault.refreshFiles();
    await this.metadataCache.buildCache(this.vault);
  }
}
