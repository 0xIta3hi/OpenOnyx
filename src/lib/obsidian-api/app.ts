/**
 * Obsidian API Compatibility — App
 * The root App object that plugins receive.
 */

import { OOVault } from './vault';
import { OOWorkspace } from './workspace';
import { OOMetadataCache } from './metadata';
import { Scope } from './utils';

export class OOApp {
  vault: OOVault;
  workspace: OOWorkspace;
  metadataCache: OOMetadataCache;
  scope: Scope;
  keymap: any = {};
  fileManager: any;
  lastEvent: Event | null = null;

  /** Plugin registry — stub for community plugins that query other plugins */
  plugins: any;
  /** Internal (core) plugins — stub for Calendar's daily-notes integration */
  internalPlugins: any;
  /** App setting — stores things like daily note folder */
  setting: any;

  constructor() {
    this.vault = new OOVault();
    this.workspace = new OOWorkspace();
    this.metadataCache = new OOMetadataCache();
    this.scope = new Scope();

    this.fileManager = {
      getNewFileParent: (sourcePath: string) => this.vault.getRoot(),
      renameFile: async (file: any, newPath: string) => this.vault.rename(file, newPath),
      generateMarkdownLink: (file: any, sourcePath: string, subpath?: string, alias?: string) => {
        const display = alias || file.basename;
        return `[[${file.basename}${subpath ? '#' + subpath : ''}|${display}]]`;
      },
      promptForFileDeletion: async (file: any) => {
        if (confirm(`Are you sure you want to delete ${file.path}?`)) {
          return this.vault.delete(file);
        }
      },
    };

    // Stub for community plugin registry
    this.plugins = {
      enabledPlugins: new Set<string>(),
      plugins: {} as Record<string, any>,
      manifests: {} as Record<string, any>,
      getPlugin: (id: string) => this.plugins.plugins[id] || null,
      isEnabled: (id: string) => this.plugins.enabledPlugins.has(id),
    };

    // Stub for core/internal plugins (daily-notes, etc.)
    this.internalPlugins = {
      plugins: {} as Record<string, any>,
      getPluginById: (id: string) => {
        // Return a stub for daily-notes that provides default settings
        if (id === 'daily-notes') {
          return {
            enabled: true,
            instance: {
              options: {
                folder: '',
                format: 'YYYY-MM-DD',
                template: '',
              },
            },
          };
        }
        return {
          enabled: false,
          instance: { options: {} },
        };
      },
      getEnabledPluginById: (id: string) => {
        const plugin = this.internalPlugins.getPluginById(id);
        return plugin?.enabled ? plugin : null;
      },
    };

    // App-level settings stub
    this.setting = {
      activeTab: null,
      open: () => {},
      close: () => {},
      openTabById: (id: string) => {},
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
