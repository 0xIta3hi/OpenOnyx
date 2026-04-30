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
    };

    // Make the app globally accessible for plugins
    (window as any).__oo_app = this;
  }

  /** Initialize the app — call after vault path is known */
  async initialize(): Promise<void> {
    await this.vault.refreshFiles();
    await this.metadataCache.buildCache(this.vault);
  }
}
