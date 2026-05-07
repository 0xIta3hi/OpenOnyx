/**
 * Obsidian API Compatibility — Barrel Export
 *
 * This module is what plugins receive when they `require('obsidian')`.
 * It re-exports all public Obsidian API classes and functions.
 */

// ── DOM Extensions (must be first — patches HTMLElement.prototype) ──
import './dom-extensions';

// ── File System ─────────────────────────────────────
export { TAbstractFile, TFile, TFolder } from './files';
export type { FileStats } from './files';

// ── Core Components ─────────────────────────────────
export {
  Events,
  Component,
  Notice,
  Modal,
  Setting,
  SettingTab,
  PluginSettingTab,
  Menu,
  MenuItem,
  // UI Widgets
  ButtonComponent,
  TextComponent,
  TextAreaComponent,
  ToggleComponent,
  DropdownComponent,
  SliderComponent,
  SearchComponent,
  ExtraButtonComponent,
  ColorComponent,
  // Suggest Modals
  SuggestModal,
  FuzzySuggestModal,
  AbstractInputSuggest,
} from './components';
export type { EventRef } from './components';

// ── Plugin ──────────────────────────────────────────
export { Plugin } from './plugin';

// ── App ─────────────────────────────────────────────
export { OOApp as App } from './app';

// ── Vault ───────────────────────────────────────────
export { OOVault as Vault } from './vault';

// ── Workspace & Views ───────────────────────────────
export {
  OOWorkspace as Workspace,
  WorkspaceLeaf,
  View,
  ItemView,
  MarkdownView,
  FileView,
  EditableFileView,
  TextFileView,
} from './workspace';

// ── Metadata ────────────────────────────────────────
export { OOMetadataCache as MetadataCache } from './metadata';
export type { CachedMetadata } from './metadata';

// ── Utilities ───────────────────────────────────────
export {
  normalizePath,
  parseYaml,
  stringifyYaml,
  addIcon,
  removeIcon,
  setIcon,
  setTooltip,
  requestUrl,
  request,
  Platform,
  Scope,
  debounce,
  sanitizeHTMLToDom,
  htmlToMarkdown,
  prepareFuzzySearch,
  prepareSimpleSearch,
  renderMatches,
  renderResults,
  sortSearchResults,
  requireApiVersion,
  getLinkpath,
  stripHeading,
  stripHeadingForLink,
} from './utils';

// ── Type re-exports for compatibility ───────────────
export type { PluginManifest } from '../../types/plugin';

// ── Stubs for less-used APIs ────────────────────────
export class MarkdownRenderer {
  static async render(app: any, markdown: string, el: HTMLElement, sourcePath: string, component: any): Promise<void> {
    el.innerHTML = markdown
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }
  static renderMarkdown = MarkdownRenderer.render;
}

export class MarkdownPreviewView {
  static renderMarkdownToContainer(el: HTMLElement, markdown: string, sourcePath: string, component: any): void {
    MarkdownRenderer.render(null, markdown, el, sourcePath, component);
  }
}

import type { WorkspaceLeaf, View } from './workspace';
import { Component } from './components';
import { TFile } from './files';

// ── FileSystemAdapter (obsidian-git uses instanceof checks) ──
export class FileSystemAdapter {
  basePath: string;
  constructor() {
    this.basePath = (window as any).__oo_vault_path || '';
  }
  getBasePath(): string { return this.basePath; }
  getName(): string { return this.basePath.split('/').pop() || 'Vault'; }
  async read(path: string): Promise<string> { return ''; }
  async write(path: string, data: string): Promise<void> {}
  async exists(path: string): Promise<boolean> { return false; }
  async stat(path: string): Promise<any> { return null; }
  async list(path: string): Promise<{ files: string[]; folders: string[] }> { return { files: [], folders: [] }; }
  async mkdir(path: string): Promise<void> {}
  async remove(path: string): Promise<void> {}
  async rename(from: string, to: string): Promise<void> {}
  async append(path: string, data: string): Promise<void> {}
  async readBinary(path: string): Promise<ArrayBuffer> { return new ArrayBuffer(0); }
  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {}
  getResourcePath(path: string): string { return `app://local${this.basePath}/${path}`; }
  async trashLocal(path: string): Promise<void> {}
  async trashSystem(path: string): Promise<boolean> { return false; }
}

// ── Keymap (obsidian-git uses Keymap.isModifier) ──
export class Keymap {
  static isModifier(evt: KeyboardEvent, modifier: string): boolean {
    switch (modifier) {
      case 'Mod': return evt.ctrlKey || evt.metaKey;
      case 'Ctrl': return evt.ctrlKey;
      case 'Meta': return evt.metaKey;
      case 'Shift': return evt.shiftKey;
      case 'Alt': return evt.altKey;
      default: return false;
    }
  }
  static isModEvent(evt?: MouseEvent | KeyboardEvent | null): boolean | 'tab' {
    if (!evt) return false;
    if ((evt as KeyboardEvent).ctrlKey || (evt as KeyboardEvent).metaKey) return 'tab';
    return false;
  }
}

// ── PopoverSuggest (base for AbstractInputSuggest in some plugin patterns) ──
function _PopoverSuggest(this: any, app: any, scope?: any) {
  this.app = app || (window as any).__oo_app;
  this.scope = scope || null;
}
_PopoverSuggest.prototype.open = function() {};
_PopoverSuggest.prototype.close = function() {};
_PopoverSuggest.prototype.renderSuggestion = function(value: any, el: HTMLElement) {};
_PopoverSuggest.prototype.selectSuggestion = function(value: any, evt: any) {};
export const PopoverSuggest = _PopoverSuggest as any;

// ── parseFrontMatterTags (calendar-beta uses this) ──
export function parseFrontMatterTags(frontmatter: any): string[] | null {
  if (!frontmatter) return null;
  const tags = frontmatter.tags || frontmatter.tag;
  if (!tags) return null;
  if (Array.isArray(tags)) return tags.map((t: string) => t.startsWith('#') ? t : `#${t}`);
  if (typeof tags === 'string') return tags.split(/[,\s]+/).filter(Boolean).map((t: string) => t.startsWith('#') ? t : `#${t}`);
  return null;
}

// ── parseFrontMatterAliases ──
export function parseFrontMatterAliases(frontmatter: any): string[] | null {
  if (!frontmatter) return null;
  const aliases = frontmatter.aliases || frontmatter.alias;
  if (!aliases) return null;
  if (Array.isArray(aliases)) return aliases;
  if (typeof aliases === 'string') return aliases.split(/[,\s]+/).filter(Boolean);
  return null;
}

// ── parseFrontMatterStringArray ──
export function parseFrontMatterStringArray(frontmatter: any, key: string): string[] | null {
  if (!frontmatter || !frontmatter[key]) return null;
  const val = frontmatter[key];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') return val.split(/[,\s]+/).filter(Boolean);
  return null;
}

// ── parseFrontMatterEntry ──
export function parseFrontMatterEntry(frontmatter: any, key: string): any {
  if (!frontmatter) return null;
  return frontmatter[key] ?? null;
}

export type ViewCreator = (leaf: WorkspaceLeaf) => View;
export type PaneType = 'tab' | 'split' | 'window';
export type SplitDirection = 'vertical' | 'horizontal';
export type IconName = string;
export type Modifier = 'Mod' | 'Ctrl' | 'Meta' | 'Shift' | 'Alt';

// ── Editor stub ─────────────────────────────────────
export interface EditorPosition { line: number; ch: number; }
export interface EditorRange { from: EditorPosition; to: EditorPosition; }

// CM6 StateField stubs — plugins like obsidian-git import these
import { StateField } from '@codemirror/state';
export const editorInfoField: any = StateField.define({
  create: () => ({ file: null, editor: null }),
  update: (value: any) => value,
});
export const editorEditorField: any = StateField.define({
  create: () => null,
  update: (value: any) => value,
});
export const editorViewField: any = editorInfoField;
export const editorLivePreviewField: any = StateField.define({
  create: () => false,
  update: (value: any) => value,
});

// EditorSuggest — ES5 function constructor for plugin compatibility
function _EditorSuggest(this: any, app: any) {
  Component.call(this);
  this.app = app || (window as any).__oo_app;
  this.context = null;
  this.limit = 100;
}
_EditorSuggest.prototype = Object.create(Component.prototype);
_EditorSuggest.prototype.constructor = _EditorSuggest;
_EditorSuggest.prototype.onTrigger = function(cursor: any, editor: any, file: any) { return null; };
_EditorSuggest.prototype.getSuggestions = function(context: any) { return []; };
_EditorSuggest.prototype.renderSuggestion = function(value: any, el: HTMLElement) {};
_EditorSuggest.prototype.selectSuggestion = function(value: any, evt: any) {};
_EditorSuggest.prototype.close = function() {};

export const EditorSuggest = _EditorSuggest as any;

// ── Editor stub (used by Templater, Dataview, etc.) ──
export class Editor {
  cm: any = null;
  getDoc(): any { return this; }
  getValue(): string { return ''; }
  setValue(content: string): void {}
  getLine(line: number): string { return ''; }
  setLine(line: number, text: string): void {}
  lineCount(): number { return 0; }
  lastLine(): number { return 0; }
  getSelection(): string { return ''; }
  replaceSelection(replacement: string, origin?: string): void {}
  replaceRange(replacement: string, from: any, to?: any, origin?: string): void {}
  getCursor(string?: string): { line: number; ch: number } { return { line: 0, ch: 0 }; }
  setCursor(pos: { line: number; ch: number }): void {}
  somethingSelected(): boolean { return false; }
  getRange(from: any, to: any): string { return ''; }
  undo(): void {}
  redo(): void {}
  exec(command: string): void {}
  transaction(fn: () => void): void { fn(); }
  wordAt(pos: any): { from: any; to: any } | null { return null; }
  posToOffset(pos: any): number { return 0; }
  offsetToPos(offset: number): { line: number; ch: number } { return { line: 0, ch: 0 }; }
  focus(): void {}
  blur(): void {}
  hasFocus(): boolean { return false; }
  getScrollInfo(): { top: number; left: number } { return { top: 0, left: 0 }; }
  scrollTo(x?: number | null, y?: number | null): void {}
  scrollIntoView(range: any, margin?: number): void {}
}

// ── HoverPopover stub ──
export class HoverPopover {
  state: number = 0; // 0=Hidden, 1=Shown
  hoverEl: HTMLElement;
  constructor(parent: any, targetEl: HTMLElement | null) {
    this.hoverEl = document.createElement('div');
    this.hoverEl.className = 'hover-popover';
  }
  hide(): void { this.state = 0; }
  show(): void { this.state = 1; }
}

// ── MomentFormatComponent stub ──
export class MomentFormatComponent {
  sampleEl: HTMLElement;
  inputEl: HTMLInputElement;
  constructor(containerEl: HTMLElement) {
    this.inputEl = document.createElement('input');
    this.sampleEl = document.createElement('span');
    containerEl.appendChild(this.inputEl);
    containerEl.appendChild(this.sampleEl);
  }
  setDefaultFormat(format: string): this { return this; }
  setValue(value: string): this { this.inputEl.value = value; return this; }
  getValue(): string { return this.inputEl.value; }
  onChange(callback: (value: string) => any): this { return this; }
}

// ── Debouncer type ──
export type Debouncer<T extends unknown[]> = {
  (...args: T): void;
  cancel(): void;
};

// ── Additional type stubs commonly imported ──
export interface ObsidianProtocolData {
  action: string;
  [key: string]: string;
}

export interface MarkdownFileInfo {
  editor?: Editor;
  file?: TFile | null;
}

// Moment.js — real library, required by many plugins (Calendar, etc.)
import momentLib from 'moment';

// Set on window so plugins that use `window.moment` directly work
if (!(window as any).moment) {
  (window as any).moment = momentLib;
}

// Fix for Calendar plugin crash: it reads moment.localeData()._week which can be undefined in some bundler setups
if (!(window as any)._bundledLocaleWeekSpec) {
  (window as any)._bundledLocaleWeekSpec = (momentLib.localeData() as any)._week || { dow: 0, doy: 6 };
}

// Fix for Calendar plugin bug: it tries to find lowercase "sunday" in capitalized moment.weekdays()
// resulting in dow = -1. This breaks moment math and causes "reading 'isSame'" crashes in Svelte views.
const origUpdateLocale = momentLib.updateLocale;
(momentLib as any).updateLocale = function(name: string, config: any) {
  if (config?.week?.dow === -1) {
    config.week.dow = 0;
  }
  return origUpdateLocale.apply(this, arguments as any);
};

export const moment = momentLib;

