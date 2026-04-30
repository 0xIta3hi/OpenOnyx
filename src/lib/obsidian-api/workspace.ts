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
  async setViewState(viewState: any, eState?: any): Promise<void> { /* compat */ }
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

  protected async onOpen(): Promise<void> { /* override */ }
  protected async onClose(): Promise<void> { /* override */ }
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

// ── MarkdownView (stub) ─────────────────────────────
export class MarkdownView extends ItemView {
  editor: any = null;
  file: TFile | null = null;
  data = '';

  getViewType(): string { return 'markdown'; }
  getDisplayText(): string { return this.file?.basename || 'Untitled'; }
  getMode(): string { return 'source'; }
}

// ── EditableFileView / TextFileView (stubs) ─────────
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

// ── OOWorkspace ─────────────────────────────────────
export class OOWorkspace extends Events {
  activeLeaf: WorkspaceLeaf | null = null;
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
      this._leaves.delete(leaf.id);
    }
  }

  iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => any): void {
    for (const leaf of this._leaves.values()) callback(leaf);
  }

  iterateRootLeaves(callback: (leaf: WorkspaceLeaf) => any): void {
    this.iterateAllLeaves(callback);
  }

  async revealLeaf(leaf: WorkspaceLeaf): Promise<void> { /* compat */ }
  setActiveLeaf(leaf: WorkspaceLeaf, params?: any): void {
    this.activeLeaf = leaf;
    this.trigger('active-leaf-change', leaf);
  }

  getLeafById(id: string): WorkspaceLeaf | null {
    return this._leaves.get(id) || null;
  }

  getGroupLeaves(group: string): WorkspaceLeaf[] { return []; }
  getMostRecentLeaf(): WorkspaceLeaf | null { return this.activeLeaf; }
  getLeftLeaf(split: boolean): WorkspaceLeaf | null { return this.getLeaf(true); }
  getRightLeaf(split: boolean): WorkspaceLeaf | null { return this.getLeaf(true); }
  async ensureSideLeaf(type: string, side: string, options?: any): Promise<WorkspaceLeaf> { return this.getLeaf(true); }
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
