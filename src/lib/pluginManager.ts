/**
 * Plugin Manager — Secure Runtime
 *
 * Production-ready plugin lifecycle manager with:
 * - Blob URL execution (CSP-safe — no eval/new Function)
 * - Permission system with approval persistence
 * - Crash isolation with auto-disable
 * - Version compatibility checks
 * - Manifest caching & parallel loading
 */

import * as obsidianApi from './obsidian-api';
import { OOApp } from './obsidian-api/app';
import { Plugin } from './obsidian-api/plugin';
import * as cmState from '@codemirror/state';
import * as cmView from '@codemirror/view';
import type { IPlugin } from './obsidian-api/plugin';
import { injectPluginStyles, removePluginStyles, injectPluginBaseCss, getPluginScopeClass } from './pluginStyles';
import {
  safePluginCall,
  safePluginCallAsync,
  pluginErrorTracker,
  pluginLogStore,
  PluginLogger,
  isVersionCompatible,
} from './pluginDevTools';
import type {
  PluginManifest,
  PluginRegistration,
  PluginState,
  PluginCommand,
  PluginRibbonAction,
  PluginStatusBarItem,
  PluginSettingTabRegistration,
  EnabledPluginList,
  PluginPermission,
  PluginApprovals,
} from '../types/plugin';

import { getAPI } from '../utils/api';
const api = () => getAPI();

// ── Constants ────────────────────────────────────────

const APP_VERSION = '1.9.16';
const LOAD_TIMEOUT_MS = 8000;
const MAX_PARALLEL_LOADS = 3;

// Default permissions plugins get if manifest doesn't declare any
// (Obsidian compat: existing plugins don't have permissions in manifest)
const DEFAULT_PERMISSIONS: PluginPermission[] = ['filesystem', 'network', 'ui', 'editor'];

// ── Callbacks ────────────────────────────────────────

export interface PluginManagerCallbacks {
  onCommandsChanged: (commands: PluginCommand[]) => void;
  onRibbonChanged: (actions: PluginRibbonAction[]) => void;
  onStatusBarChanged: (items: PluginStatusBarItem[]) => void;
  onSettingTabsChanged: (tabs: PluginSettingTabRegistration[]) => void;
  onPluginsChanged: (plugins: PluginRegistration[]) => void;
  /** Called when a plugin needs permission approval */
  onPermissionRequired?: (
    manifest: PluginManifest,
    permissions: PluginPermission[],
  ) => Promise<boolean>;
}

// ── Plugin Manager ───────────────────────────────────

export class PluginManager {
  private _app: OOApp;
  private _plugins: Map<string, PluginRegistration> = new Map();
  private _commands: PluginCommand[] = [];
  private _ribbonActions: PluginRibbonAction[] = [];
  private _statusBarItems: PluginStatusBarItem[] = [];
  private _settingTabs: PluginSettingTabRegistration[] = [];
  private _callbacks: PluginManagerCallbacks;
  private _manifestCache: Map<string, PluginManifest> = new Map();
  private _scriptElements: Map<string, HTMLScriptElement> = new Map();
  private _loggers: Map<string, PluginLogger> = new Map();

  constructor(app: OOApp, callbacks: PluginManagerCallbacks) {
    this._app = app;
    this._callbacks = callbacks;
    this._setupGlobalHooks();
    injectPluginBaseCss();
  }

  // ── Global Hooks ──────────────────────────────────

  private _setupGlobalHooks(): void {
    const win = window as any;

    win.__oo_register_command = (cmd: PluginCommand) => {
      // Deduplicate by command ID
      this._commands = this._commands.filter(c => c.id !== cmd.id);
      this._commands.push(cmd);
      this._callbacks.onCommandsChanged([...this._commands]);
    };

    win.__oo_unregister_command = (cmdId: string) => {
      this._commands = this._commands.filter(c => c.id !== cmdId);
      this._callbacks.onCommandsChanged([...this._commands]);
    };

    win.__oo_register_ribbon = (action: PluginRibbonAction) => {
      // Deduplicate by pluginId + title
      this._ribbonActions = this._ribbonActions.filter(a => !(a.pluginId === action.pluginId && a.title === action.title));
      this._ribbonActions.push(action);
      this._callbacks.onRibbonChanged([...this._ribbonActions]);
    };

    win.__oo_unregister_ribbon = (pluginId: string) => {
      this._ribbonActions = this._ribbonActions.filter(a => a.pluginId !== pluginId);
      this._callbacks.onRibbonChanged([...this._ribbonActions]);
    };

    win.__oo_register_statusbar = (pluginId: string, el: HTMLElement) => {
      // Deduplicate by pluginId
      this._statusBarItems = this._statusBarItems.filter(i => i.pluginId !== pluginId);
      this._statusBarItems.push({ pluginId, el });
      this._callbacks.onStatusBarChanged([...this._statusBarItems]);
    };

    win.__oo_unregister_statusbar = (pluginId: string) => {
      this._statusBarItems = this._statusBarItems.filter(i => i.pluginId !== pluginId);
      this._callbacks.onStatusBarChanged([...this._statusBarItems]);
    };

    win.__oo_register_setting_tab = (tab: PluginSettingTabRegistration) => {
      // Deduplicate by pluginId
      this._settingTabs = this._settingTabs.filter(t => t.pluginId !== tab.pluginId);
      this._settingTabs.push(tab);
      this._callbacks.onSettingTabsChanged([...this._settingTabs]);
    };

    win.__oo_unregister_setting_tab = (pluginId: string) => {
      this._settingTabs = this._settingTabs.filter(t => t.pluginId !== pluginId);
      this._callbacks.onSettingTabsChanged([...this._settingTabs]);
    };

    // Auto-disable hook from crash isolation
    win.__oo_auto_disable_plugin = (pluginId: string) => {
      console.warn(`[PluginManager] Auto-disabling ${pluginId} due to repeated errors`);
      this.disablePlugin(pluginId);
    };

    win.__oo_open_file = (path: string) => {
      // Connected by App.tsx
    };
  }

  // ── Discovery ─────────────────────────────────────

  async discoverPlugins(): Promise<PluginRegistration[]> {
    try {
      const pluginDirs = await api().dataList('plugins');
      const enabledList = await this._getEnabledList();
      const approvals = await this._getApprovals();
      const results: PluginRegistration[] = [];

      for (const dir of pluginDirs) {
        try {
          // Use cache if available
          let manifest = this._manifestCache.get(dir);

          if (!manifest) {
            const manifestJson = await api().dataRead(`plugins/${dir}/manifest.json`);
            if (!manifestJson) continue;
            manifest = JSON.parse(manifestJson) as PluginManifest;
            manifest.dir = `.openobsidian/plugins/${manifest.id}`;
            this._manifestCache.set(dir, manifest);
          }

          const state: PluginState = enabledList.includes(manifest.id) ? 'enabled' : 'disabled';
          const approval = approvals[manifest.id];

          const reg: PluginRegistration = {
            manifest,
            state,
            instance: null,
            approvedPermissions: approval?.permissions,
          };
          this._plugins.set(manifest.id, reg);
          results.push(reg);
        } catch (e) {
          console.warn(`[PluginManager] Failed to read plugin in ${dir}:`, e);
        }
      }

      this._callbacks.onPluginsChanged(this.getPluginList());
      return results;
    } catch (e) {
      console.warn('[PluginManager] Discovery failed:', e);
      return [];
    }
  }

  // ── Version Check ─────────────────────────────────

  private _checkVersion(manifest: PluginManifest): { compatible: boolean; message?: string } {
    if (!manifest.minAppVersion) return { compatible: true };
    if (isVersionCompatible(manifest.minAppVersion, APP_VERSION)) {
      return { compatible: true };
    }
    return {
      compatible: false,
      message: `Requires app v${manifest.minAppVersion}+ (current: v${APP_VERSION})`,
    };
  }

  // ── Permission System ─────────────────────────────

  private async _getApprovals(): Promise<PluginApprovals> {
    try {
      const data = await api().dataRead('plugin-permissions.json');
      return data ? JSON.parse(data) : {};
    } catch { return {}; }
  }

  private async _saveApprovals(approvals: PluginApprovals): Promise<void> {
    await api().dataWrite('plugin-permissions.json', JSON.stringify(approvals, null, 2));
  }

  private async _checkPermissions(manifest: PluginManifest): Promise<boolean> {
    const requestedPermissions = manifest.permissions || DEFAULT_PERMISSIONS;
    const approvals = await this._getApprovals();
    const existing = approvals[manifest.id];

    // Check if already approved for this version
    if (existing && existing.version === manifest.version) {
      const allApproved = requestedPermissions.every(p => existing.permissions.includes(p));
      if (allApproved) return true;
    }

    // Need approval — ask via callback
    if (this._callbacks.onPermissionRequired) {
      const approved = await this._callbacks.onPermissionRequired(manifest, requestedPermissions);
      if (approved) {
        approvals[manifest.id] = {
          permissions: requestedPermissions,
          approvedAt: Date.now(),
          version: manifest.version,
        };
        await this._saveApprovals(approvals);

        // Update registration
        const reg = this._plugins.get(manifest.id);
        if (reg) reg.approvedPermissions = requestedPermissions;

        return true;
      }
      return false;
    }

    // No callback set — auto-approve (dev mode / first run)
    approvals[manifest.id] = {
      permissions: requestedPermissions,
      approvedAt: Date.now(),
      version: manifest.version,
    };
    await this._saveApprovals(approvals);
    return true;
  }

  private _buildRequireShim(manifest: PluginManifest, permissions: PluginPermission[]): (id: string) => any {
    return (id: string): any => {
      if (id === 'obsidian') {
        // Return a permission-filtered API surface
        return this._buildGuardedApi(manifest.id, permissions);
      }
      
      // Provide built-in frontend modules
      if (id === '@codemirror/state') return cmState;
      if (id === '@codemirror/view') return cmView;
      
      // Fallback to real node modules or electron modules if nodeIntegration is enabled
      if (typeof (window as any).require !== 'undefined') {
        try {
          return (window as any).require(id);
        } catch (e) {
          // Ignore and fall through to warning
        }
      }
      
      console.warn(`[Plugin:${manifest.id}] Unsupported require('${id}')`);
      return {};
    };
  }

  /** Build a permission-guarded obsidian API object */
  private _buildGuardedApi(pluginId: string, permissions: PluginPermission[]): any {
    const fullApi = { ...obsidianApi };

    // If network permission is missing, block requestUrl
    if (!permissions.includes('network')) {
      fullApi.requestUrl = (() => {
        throw new Error(`[Plugin:${pluginId}] Network access denied — 'network' permission not granted`);
      }) as any;
      fullApi.request = fullApi.requestUrl;
    }

    return fullApi;
  }

  // ── Loading (Blob URL Execution) ──────────────────

  async loadPlugin(pluginId: string): Promise<boolean> {
    const reg = this._plugins.get(pluginId);
    if (!reg) { console.error(`[PluginManager] Plugin not found: ${pluginId}`); return false; }
    if (reg.instance) { console.warn(`[PluginManager] Plugin already loaded: ${pluginId}`); return true; }

    const startTime = performance.now();
    reg.state = 'loading';
    this._callbacks.onPluginsChanged(this.getPluginList());

    try {
      const manifest = reg.manifest;

      // ── Vault check (don't load plugins if no vault is active, except maybe internal ones)
      const vaultPath = await api().getVaultPath();
      if (!vaultPath) {
        throw new Error(`Cannot load plugin ${pluginId}: No vault path set. Plugins must be loaded within a vault context.`);
      }

      // ── Version check
      const compat = this._checkVersion(manifest);
      if (!compat.compatible) {
        throw new Error(compat.message || 'Incompatible version');
      }

      // ── Permission check
      const permitted = await this._checkPermissions(manifest);
      if (!permitted) {
        reg.state = 'disabled';
        this._callbacks.onPluginsChanged(this.getPluginList());
        return false;
      }

      // ── Read main.js
      const mainJs = await api().dataRead(`plugins/${pluginId}/main.js`);
      if (!mainJs) throw new Error(`No main.js found for plugin ${pluginId}`);

      // ── Read and inject scoped styles.css
      const stylesCss = await api().dataRead(`plugins/${pluginId}/styles.css`);
      if (stylesCss) injectPluginStyles(pluginId, stylesCss);

      // ── Create per-plugin logger
      const logger = new PluginLogger(pluginId);
      this._loggers.set(pluginId, logger);

      // ── Ensure plugin data directory exists (some plugins write files there immediately)
      await api().createDirectory(`plugins/${pluginId}`).catch(() => {});

      // ── Execute via Blob URL (CSP-safe)
      const permissions = manifest.permissions || DEFAULT_PERMISSIONS;
      const instance = await this._executePluginBlob(mainJs, manifest, permissions);

      reg.instance = instance;
      reg.state = 'enabled';
      reg.error = undefined;
      reg.loadTimeMs = Math.round(performance.now() - startTime);

      // ── Call onload with crash isolation
      const loadResult = safePluginCall(pluginId, () => instance.load(), 'onload');
      if (loadResult.shouldDisable) {
        throw new Error(`Plugin crashed during onload: ${loadResult.error}`);
      }

      console.log(`[PluginManager] Loaded: ${manifest.name} v${manifest.version} (${reg.loadTimeMs}ms)`);
      this._callbacks.onPluginsChanged(this.getPluginList());
      return true;
    } catch (e: any) {
      console.error(`[PluginManager] Failed to load ${pluginId}:`, e);
      pluginErrorTracker.record(pluginId, e, 'loadPlugin');
      reg.state = 'errored';
      reg.error = e.message || 'Unknown error';
      reg.errorCount = (reg.errorCount || 0) + 1;
      reg.lastErrorAt = Date.now();
      reg.loadTimeMs = Math.round(performance.now() - startTime);
      this._callbacks.onPluginsChanged(this.getPluginList());
      return false;
    }
  }

  /**
   * Execute plugin code via Blob URL + <script> tag.
   *
   * This bypasses CSP `script-src 'self'` restrictions because:
   * - Blob URLs created by the page are treated as same-origin
   * - Unlike `new Function()` / `eval()`, script tag loading is not blocked by CSP
   *
   * The plugin code is wrapped in an IIFE that receives require/module/exports
   * from pre-set global variables, then cleaned up immediately after execution.
   */
  private _executePluginBlob(mainJs: string, manifest: PluginManifest, permissions: PluginPermission[]): Promise<IPlugin> {
    return new Promise((resolve, reject) => {
      // Generate safe global key from plugin ID
      const safeId = manifest.id.replace(/[^a-zA-Z0-9_]/g, '_');
      const globalKey = `__oo_plugin_${safeId}_${Date.now()}`;

      // Set up module/exports on a temp global
      const moduleExports: any = {};
      const moduleObj = { exports: moduleExports };
      const requireShim = this._buildRequireShim(manifest, permissions);

      (window as any)[globalKey] = {
        require: requireShim,
        module: moduleObj,
        exports: moduleExports,
        app: this._app,
        moment: (window as any).moment,
      };

      // Wrap the plugin code
      const wrappedCode = `
(function(){
  var __ctx = window["${globalKey}"];
  var require = __ctx.require;
  var module = __ctx.module;
  var exports = __ctx.exports;
  // Ensure critical globals are available inside the blob
  window.app = window.app || __ctx.app;
  window.moment = window.moment || __ctx.moment;
  ${mainJs}
})();
window["${globalKey}"].__done = true;
`;
      const blob = new Blob([wrappedCode], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);

      const script = document.createElement('script');
      script.src = blobUrl;
      script.setAttribute('data-plugin-id', manifest.id);

      // Timeout guard
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Plugin ${manifest.id} timed out during load (${LOAD_TIMEOUT_MS}ms)`));
      }, LOAD_TIMEOUT_MS);

      const cleanup = () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(blobUrl);
        script.remove();
        // Clean up the global — keep module reference for extraction
      };

      script.onload = () => {
        cleanup();

        try {
          const ctx = (window as any)[globalKey];
          delete (window as any)[globalKey];

          if (!ctx || !ctx.__done) {
            reject(new Error(`Plugin ${manifest.id} script did not execute`));
            return;
          }

          // Extract the plugin class
          const PluginClass = ctx.module.exports.default || ctx.module.exports;
          if (typeof PluginClass !== 'function') {
            reject(new Error(`Plugin ${manifest.id} does not export a class`));
            return;
          }

          // Instantiate
          const instance = new PluginClass(this._app, manifest);
          resolve(instance);
        } catch (e: any) {
          reject(new Error(`Plugin ${manifest.id} instantiation error: ${e.message}`));
        }
      };

      script.onerror = (event) => {
        cleanup();
        delete (window as any)[globalKey];
        reject(new Error(`Plugin ${manifest.id} script failed to load`));
      };

      // Store reference for cleanup
      this._scriptElements.set(manifest.id, script);

      // Execute
      document.head.appendChild(script);
    });
  }

  // ── Unloading ─────────────────────────────────────

  async unloadPlugin(pluginId: string): Promise<void> {
    const reg = this._plugins.get(pluginId);
    if (!reg?.instance) return;

    // Crash-safe unload
    safePluginCall(pluginId, () => reg.instance.unload(), 'onunload');

    removePluginStyles(pluginId);
    pluginLogStore.clearPlugin(pluginId);

    // Remove script element if still around
    const script = this._scriptElements.get(pluginId);
    if (script) {
      script.remove();
      this._scriptElements.delete(pluginId);
    }

    this._loggers.delete(pluginId);

    reg.instance = null;
    reg.state = 'disabled';
    reg.error = undefined;

    this._callbacks.onPluginsChanged(this.getPluginList());
  }

  // ── Enable/Disable ────────────────────────────────

  async enablePlugin(pluginId: string): Promise<boolean> {
    const success = await this.loadPlugin(pluginId);
    if (success) await this._addToEnabledList(pluginId);
    return success;
  }

  async disablePlugin(pluginId: string): Promise<void> {
    await this.unloadPlugin(pluginId);
    await this._removeFromEnabledList(pluginId);
  }

  // ── Load All Enabled (Parallel) ───────────────────

  async loadEnabledPlugins(): Promise<void> {
    const enabledList = await this._getEnabledList();
    const toLoad = enabledList.filter(id => this._plugins.has(id));

    // Parallel loading with concurrency limit
    const chunks: string[][] = [];
    for (let i = 0; i < toLoad.length; i += MAX_PARALLEL_LOADS) {
      chunks.push(toLoad.slice(i, i + MAX_PARALLEL_LOADS));
    }

    for (const chunk of chunks) {
      await Promise.allSettled(chunk.map(id => this.loadPlugin(id)));
    }
  }

  // ── Install from Github Repo (Marketplace) ────────

  async installFromGithubRepo(repo: string, expectedPluginId: string): Promise<boolean> {
    console.log(`[PluginManager] Installing from Github: ${repo} → ${expectedPluginId}`);
    
    // 1. Fetch latest release from GitHub API
    console.log(`[PluginManager] Step 1: Fetching release info...`);
    let releaseText: string;
    try {
      releaseText = await api().dataFetch(`https://api.github.com/repos/${repo}/releases/latest`);
    } catch (e: any) {
      console.error(`[PluginManager] Step 1 FAILED:`, e);
      throw new Error(`Failed to fetch release info for ${repo}: ${e.message}`);
    }
    
    let releaseData: any;
    try {
      releaseData = JSON.parse(releaseText);
    } catch (e: any) {
      console.error(`[PluginManager] Release JSON parse failed. Raw text:`, releaseText?.slice(0, 200));
      throw new Error(`Invalid release data from GitHub for ${repo}`);
    }

    // Check for GitHub API errors (rate limit, not found, etc.)
    if (releaseData.message) {
      throw new Error(`GitHub API error for ${repo}: ${releaseData.message}`);
    }

    const assets = releaseData.assets;
    if (!assets || !Array.isArray(assets)) {
      throw new Error(`No release assets found for ${repo}. The plugin may not have any releases.`);
    }
    
    // 2. Find required files
    const manifestAsset = assets.find((a: any) => a.name === 'manifest.json');
    const mainAsset = assets.find((a: any) => a.name === 'main.js');
    const stylesAsset = assets.find((a: any) => a.name === 'styles.css');
    
    if (!manifestAsset || !mainAsset) {
      const available = assets.map((a: any) => a.name).join(', ');
      throw new Error(`Release is missing required files. Found: [${available}]. Need: manifest.json, main.js`);
    }
    
    // 3. Download files
    console.log(`[PluginManager] Step 2: Downloading files...`);
    console.log(`[PluginManager]   manifest.json: ${manifestAsset.browser_download_url}`);
    console.log(`[PluginManager]   main.js: ${mainAsset.browser_download_url}`);
    if (stylesAsset) console.log(`[PluginManager]   styles.css: ${stylesAsset.browser_download_url}`);

    let manifestText: string, mainText: string, stylesText: string | null;
    try {
      [manifestText, mainText, stylesText] = await Promise.all([
        api().dataFetch(manifestAsset.browser_download_url),
        api().dataFetch(mainAsset.browser_download_url),
        stylesAsset ? api().dataFetch(stylesAsset.browser_download_url) : Promise.resolve(null)
      ]);
    } catch (e: any) {
      console.error(`[PluginManager] Step 2 FAILED:`, e);
      throw new Error(`Failed to download plugin files: ${e.message}`);
    }
    
    // 4. Validate manifest
    let manifest: PluginManifest;
    try {
      manifest = JSON.parse(manifestText) as PluginManifest;
    } catch (e: any) {
      throw new Error(`Downloaded manifest.json is invalid JSON`);
    }

    if (manifest.id !== expectedPluginId) {
      console.warn(`[PluginManager] Warning: Manifest ID (${manifest.id}) does not match expected ID (${expectedPluginId})`);
    }
    
    // 5. Save to disk
    console.log(`[PluginManager] Step 3: Saving to disk...`);
    const pluginDir = `plugins/${manifest.id || expectedPluginId}`;
    try {
      await api().dataWrite(`${pluginDir}/manifest.json`, manifestText);
      await api().dataWrite(`${pluginDir}/main.js`, mainText);
      if (stylesText) {
        await api().dataWrite(`${pluginDir}/styles.css`, stylesText);
      }
    } catch (e: any) {
      console.error(`[PluginManager] Step 3 FAILED:`, e);
      throw new Error(`Failed to save plugin files to disk: ${e.message}`);
    }
    
    console.log(`[PluginManager] ✓ Files saved for ${manifest.name} v${manifest.version}`);
    
    // 6. Refresh plugin registry and auto-enable
    await this.discoverPlugins();
    
    // 7. Auto-enable (load + persist)
    const pluginId = manifest.id || expectedPluginId;
    console.log(`[PluginManager] Step 4: Auto-enabling ${pluginId}...`);
    try {
      const loadSuccess = await this.enablePlugin(pluginId);
      if (!loadSuccess) {
        // Plugin was installed but failed to load — still count as installed
        console.warn(`[PluginManager] Plugin installed but failed to load. It can be enabled manually.`);
      } else {
        console.log(`[PluginManager] ✓ Plugin ${manifest.name} installed and enabled`);
      }
    } catch (e: any) {
      console.warn(`[PluginManager] Plugin installed but errored during enable:`, e.message);
      // Don't throw — install succeeded, load is a separate concern
    }

    return true;
  }

  // ── Enabled list persistence ──────────────────────

  private async _getEnabledList(): Promise<EnabledPluginList> {
    try {
      const data = await api().dataRead('community-plugins.json');
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  }

  private async _saveEnabledList(list: EnabledPluginList): Promise<void> {
    await api().dataWrite('community-plugins.json', JSON.stringify(list, null, 2));
  }

  private async _addToEnabledList(pluginId: string): Promise<void> {
    const list = await this._getEnabledList();
    if (!list.includes(pluginId)) {
      list.push(pluginId);
      await this._saveEnabledList(list);
    }
  }

  private async _removeFromEnabledList(pluginId: string): Promise<void> {
    const list = await this._getEnabledList();
    await this._saveEnabledList(list.filter(id => id !== pluginId));
  }

  // ── Hot Reload (Dev Mode) ─────────────────────────

  async reloadPlugin(pluginId: string): Promise<boolean> {
    // Invalidate cache
    this._manifestCache.delete(pluginId);
    pluginErrorTracker.clearPlugin(pluginId);

    await this.unloadPlugin(pluginId);

    // Re-read manifest
    try {
      const manifestJson = await api().dataRead(`plugins/${pluginId}/manifest.json`);
      if (manifestJson) {
        const manifest = JSON.parse(manifestJson) as PluginManifest;
        manifest.dir = `.openobsidian/plugins/${manifest.id}`;
        this._manifestCache.set(pluginId, manifest);
        const reg = this._plugins.get(pluginId);
        if (reg) reg.manifest = manifest;
      }
    } catch (e) {
      console.warn(`[PluginManager] Failed to re-read manifest for ${pluginId}:`, e);
    }

    return this.loadPlugin(pluginId);
  }

  // ── Accessors ─────────────────────────────────────

  getPluginList(): PluginRegistration[] {
    return Array.from(this._plugins.values());
  }

  getPlugin(pluginId: string): PluginRegistration | undefined {
    return this._plugins.get(pluginId);
  }

  getCommands(): PluginCommand[] { return [...this._commands]; }
  getRibbonActions(): PluginRibbonAction[] { return [...this._ribbonActions]; }
  getStatusBarItems(): PluginStatusBarItem[] { return [...this._statusBarItems]; }
  getSettingTabs(): PluginSettingTabRegistration[] { return [...this._settingTabs]; }

  getPluginLogger(pluginId: string): PluginLogger | undefined {
    return this._loggers.get(pluginId);
  }

  /** Destroy the plugin manager and unload all plugins */
  async destroy(): Promise<void> {
    for (const [pluginId] of this._plugins) {
      await this.unloadPlugin(pluginId);
    }
    this._plugins.clear();
    this._commands = [];
    this._ribbonActions = [];
    this._statusBarItems = [];
    this._settingTabs = [];
    this._manifestCache.clear();
    this._scriptElements.clear();
    this._loggers.clear();
  }
}
