/**
 * Obsidian API Compatibility — Views & Workspace
 */

import { Events, EventRef, Component } from './components';
import { TFile } from './files';

// ── WorkspaceLeaf ───────────────────────────────────
export class WorkspaceLeaf extends Events {
  parent: any = null;
  view: View;
  id: string;
  pinned: boolean = false;
  hoverPopover: any = null;

  constructor(id: string) {
    super();
    this.id = id;
    this.view = null as any;
  }

  async openFile(file: TFile, openState?: any): Promise<void> {
    // Delegate to app navigation
    (window as any).__oo_open_file?.(file.path);
  }

  async open(view: View): Promise<void> {
    this.view = view;
  }

  getViewState(): any { return { type: this.view?.getViewType?.() || '', state: {} }; }
  async setViewState(viewState: any, eState?: any): Promise<void> {
    // Create the view if a type is specified and we have a creator for it
    if (viewState?.type) {
      const workspace = (window as any).__oo_app?.workspace;
      if (workspace) {
        await workspace._createViewOnLeaf(this, viewState.type);
      }
    }
  }
  get isDeferred(): boolean { return false; }
  async loadIfDeferred(): Promise<void> { /* compat */ }
  getEphemeralState(): any { return {}; }
  setEphemeralState(state: any): void { /* compat */ }
  togglePinned(): void { /* compat */ }
  setPinned(pinned: boolean): void { /* compat */ }
  setGroupMember(other: WorkspaceLeaf): void { /* compat */ }
  setGroup(group: string): void { /* compat */ }
  detach(): void { /* compat */ }
  getIcon(): string { return this.view?.icon || 'file-text'; }
  getDisplayText(): string { return this.view?.getDisplayText?.() || ''; }
  onResize(): void { this.view?.onResize?.(); }
}

// ── View ────────────────────────────────────────────
export abstract class View extends Component {
  app: any;
  icon: string = 'file-text';
  navigation = true;
  leaf: WorkspaceLeaf;
  containerEl: HTMLElement;
  scope: any = null;

  constructor(leaf: WorkspaceLeaf) {
    super();
    this.leaf = leaf;
    this.app = (window as any).__oo_app;
    this.containerEl = document.createElement('div');
    this.containerEl.className = 'view-content oo-plugin-view';
  }

  async onOpen(): Promise<void> { /* override */ }
  async onClose(): Promise<void> { /* override */ }
  abstract getViewType(): string;
  getState(): Record<string, any> { return {}; }
  async setState(state: unknown, result: any): Promise<void> { /* override */ }
  getEphemeralState(): Record<string, any> { return {}; }
  setEphemeralState(state: unknown): void { /* override */ }
  getIcon(): string { return this.icon; }
  onResize(): void { /* override */ }
  abstract getDisplayText(): string;
  onPaneMenu(menu: any, source: string): void { /* override */ }
}

// ── ItemView ────────────────────────────────────────
export abstract class ItemView extends View {
  contentEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'view-content';
    this.containerEl.appendChild(this.contentEl);
  }

  addAction(icon: string, title: string, callback: (evt: MouseEvent) => any): HTMLElement {
    const btn = document.createElement('div');
    btn.className = 'view-action';
    btn.title = title;
    btn.setAttribute('data-icon', icon);
    btn.addEventListener('click', callback);
    return btn;
  }
}



export abstract class FileView extends View {
  file: TFile | null = null;
  allowNoFile = false;
  getDisplayText(): string { return this.file?.basename || ''; }
  canAcceptExtension(extension: string): boolean { return false; }
}

export abstract class EditableFileView extends FileView {}

export abstract class TextFileView extends EditableFileView {
  data = '';
  requestSave: () => void = () => {};
  abstract getViewData(): string;
  abstract setViewData(data: string, clear: boolean): void;
  abstract clear(): void;
}

// ── MarkdownView (stub) ─────────────────────────────
export class MarkdownView extends TextFileView {
  editor: any = null;
  getViewType(): string { return 'markdown'; }
  getMode(): string { return 'source'; }
  getViewData(): string { return this.data; }
  setViewData(data: string, clear: boolean): void { this.data = data; }
  clear(): void { this.data = ''; }
}

// ── OOWorkspace ─────────────────────────────────────
export class OOWorkspace extends Events {
  private _activeLeaf: WorkspaceLeaf | null = null;
  get activeLeaf(): WorkspaceLeaf {
    if (!this._activeLeaf) {
      this._activeLeaf = new WorkspaceLeaf('default-active');
      this._activeLeaf.view = new MarkdownView(this._activeLeaf);
      this._leaves.set(this._activeLeaf.id, this._activeLeaf);
    }
    return this._activeLeaf;
  }
  set activeLeaf(leaf: WorkspaceLeaf | null) {
    this._activeLeaf = leaf;
  }

  activeEditor: any = null;
  containerEl: HTMLElement;
  layoutReady = false;
  leftSplit: any = {};
  rightSplit: any = {};
  leftRibbon: any = {};
  rightRibbon: any = {};
  rootSplit: any = {};
  requestSaveLayout: any = () => {};

  private _leaves: Map<string, WorkspaceLeaf> = new Map();
  private _viewCreators: Map<string, (leaf: WorkspaceLeaf) => View> = new Map();
  private _layoutReadyCallbacks: Array<() => any> = [];
  private _leafCounter = 0;
  /** Active plugin views (viewType → leaf) — exposed for the React UI to render */
  private _activePluginViews: Map<string, WorkspaceLeaf> = new Map();

  constructor() {
    super();
    this.containerEl = document.body;
    // Mark layout as ready after a tick
    setTimeout(() => {
      this.layoutReady = true;
      for (const cb of this._layoutReadyCallbacks) {
        try { cb(); } catch (e) { console.error('[Plugin] layoutReady callback error:', e); }
      }
      this._layoutReadyCallbacks = [];
    }, 100);
  }

  registerViewCreator(type: string, creator: (leaf: WorkspaceLeaf) => View): void {
    this._viewCreators.set(type, creator);
  }

  onLayoutReady(callback: () => any): void {
    if (this.layoutReady) { callback(); return; }
    this._layoutReadyCallbacks.push(callback);
  }

  getUnpinnedLeaf(viewType?: string): WorkspaceLeaf {
    if (this.activeLeaf && !this.activeLeaf.pinned) return this.activeLeaf;
    return this.getLeaf(true);
  }

  getLeaf(newLeaf?: any, direction?: any): WorkspaceLeaf {
    if (!newLeaf && this.activeLeaf) return this.activeLeaf;
    const leaf = new WorkspaceLeaf(`leaf-${++this._leafCounter}`);
    this._leaves.set(leaf.id, leaf);
    return leaf;
  }

  getActiveViewOfType<T>(type: any): T | null {
    // Check if the active view is an instance of the given type
    if (this.activeLeaf?.view && this.activeLeaf.view instanceof type) {
      return this.activeLeaf.view as T;
    }
    return null;
  }

  getActiveFile(): TFile | null {
    const path = (window as any).__oo_active_file;
    if (!path) return null;
    const app = (window as any).__oo_app;
    return app?.vault?.getFileByPath(path) || null;
  }

  getLeavesOfType(viewType: string): WorkspaceLeaf[] {
    return Array.from(this._leaves.values()).filter(l => l.view?.getViewType?.() === viewType);
  }

  detachLeavesOfType(viewType: string): void {
    for (const leaf of this.getLeavesOfType(viewType)) {
      if (leaf.view) {
        try { leaf.view.onClose?.(); } catch { /* */ }
      }
      this._leaves.delete(leaf.id);
      this._activePluginViews.delete(viewType);
    }
    this.trigger('plugin-views-changed');
  }

  iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => any): void {
    for (const leaf of this._leaves.values()) callback(leaf);
  }

  iterateRootLeaves(callback: (leaf: WorkspaceLeaf) => any): void {
    this.iterateAllLeaves(callback);
  }

  async revealLeaf(leaf: WorkspaceLeaf): Promise<void> {
    // If the leaf already has a view, just make it active
    if (leaf.view) {
      this._activePluginViews.set(leaf.view.getViewType(), leaf);
      this.trigger('plugin-views-changed');
      return;
    }
  }

  setActiveLeaf(leaf: WorkspaceLeaf, params?: any): void {
    this.activeLeaf = leaf;
    this.trigger('active-leaf-change', leaf);
  }

  getLeafById(id: string): WorkspaceLeaf | null {
    return this._leaves.get(id) || null;
  }

  getGroupLeaves(group: string): WorkspaceLeaf[] { return []; }
  getMostRecentLeaf(): WorkspaceLeaf | null { return this.activeLeaf; }
  
  getLeftLeaf(split: boolean): WorkspaceLeaf | null {
    return this._createSideLeaf();
  }
  
  getRightLeaf(split: boolean): WorkspaceLeaf | null {
    return this._createSideLeaf();
  }

  async ensureSideLeaf(type: string, side: string, options?: any): Promise<WorkspaceLeaf> {
    // Check if we already have a leaf with this view type
    const existing = this.getLeavesOfType(type);
    if (existing.length > 0) return existing[0];
    
    // Create leaf + view
    const leaf = this._createSideLeaf();
    await this._createViewOnLeaf(leaf, type);
    return leaf;
  }

  /** Create a leaf and view, and make it active in the sidebar */
  private _createSideLeaf(): WorkspaceLeaf {
    const leaf = new WorkspaceLeaf(`leaf-${++this._leafCounter}`);
    this._leaves.set(leaf.id, leaf);
    return leaf;
  }

  /** Instantiate a view on a leaf using a registered creator */
  async _createViewOnLeaf(leaf: WorkspaceLeaf, viewType: string): Promise<boolean> {
    const creator = this._viewCreators.get(viewType);
    if (!creator) {
      console.warn(`[Workspace] No view creator for type: ${viewType}`);
      return false;
    }
    
    try {
      const view = creator(leaf);
      leaf.view = view;
      await view.onOpen?.();
      this._activePluginViews.set(viewType, leaf);
      this.trigger('plugin-views-changed');
      console.log(`[Workspace] Created view: ${viewType} → ${view.getDisplayText()}`);
      return true;
    } catch (e) {
      console.error(`[Workspace] Failed to create view ${viewType}:`, e);
      return false;
    }
  }

  /** Get all active plugin views — used by React UI to render the sidebar */
  getActivePluginViews(): Array<{ viewType: string; leaf: WorkspaceLeaf; displayText: string; icon: string; containerEl: HTMLElement }> {
    const views: Array<{ viewType: string; leaf: WorkspaceLeaf; displayText: string; icon: string; containerEl: HTMLElement }> = [];
    for (const [viewType, leaf] of this._activePluginViews) {
      if (leaf.view) {
        views.push({
          viewType,
          leaf,
          displayText: leaf.view.getDisplayText?.() || viewType,
          icon: leaf.view.getIcon?.() || 'file-text',
          containerEl: leaf.view.containerEl,
        });
      }
    }
    return views;
  }

  /** Initialize all registered views that should auto-open */
  async initializeViews(): Promise<void> {
    // Some plugins (like Calendar) call ensureSideLeaf/revealLeaf during load.
    // Those views are already tracked. This method is called after all plugins load
    // to trigger the UI update.
    this.trigger('plugin-views-changed');
  }

  async openLinkText(linktext: string, sourcePath: string, newLeaf?: any): Promise<void> {
    (window as any).__oo_open_file?.(linktext);
  }
  createLeafBySplit(leaf: WorkspaceLeaf): WorkspaceLeaf { return this.getLeaf(true); }
  createLeafInParent(parent: any, index: number): WorkspaceLeaf { return this.getLeaf(true); }
  getLastOpenFiles(): string[] { return []; }
  updateOptions(): void { /* compat */ }
  handleLinkContextMenu(menu: any, linktext: string, sourcePath: string): boolean { return false; }
  async changeLayout(workspace: any): Promise<void> { /* compat */ }
  getLayout(): Record<string, any> { return {}; }
}
