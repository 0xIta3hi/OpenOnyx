/**
 * Obsidian API Compatibility — Barrel Export
 *
 * This module is what plugins receive when they `require('obsidian')`.
 * It re-exports all public Obsidian API classes and functions.
 */

// ── DOM Extensions (must be first — patches HTMLElement.prototype) ──
import './dom-extensions';
import { setIcon } from './utils';

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

// MarkdownRenderChild — very commonly extended by rendering plugins (Dataview, etc.)
export class MarkdownRenderChild extends Component {
  containerEl: HTMLElement;
  constructor(containerEl: HTMLElement) {
    super();
    this.containerEl = containerEl;
  }
}

export class MarkdownRenderer extends MarkdownRenderChild {
  app: any;
  hoverPopover: any = null;
  get file(): any { return null; }
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

export class MarkdownPreviewRenderer {
  static registerPostProcessor(postProcessor: any, sortOrder?: number): void {}
  static unregisterPostProcessor(postProcessor: any): void {}
}

import type { WorkspaceLeaf, View } from './workspace';
import { Component, Events, Modal } from './components';
import { TFile, TFolder, TAbstractFile } from './files';

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

// ── apiVersion ──────────────────────────────────────
export let apiVersion: string = '1.9.16';

// ── livePreviewState ──
import { ViewPlugin } from '@codemirror/view';
export const livePreviewState: any = ViewPlugin.define(() => ({ decorations: undefined, destroy() {} }));

// ── FileManager (proper class, not inline stub) ──
export class FileManager {
  private _app: any;
  constructor() { this._app = (window as any).__oo_app; }
  getNewFileParent(sourcePath: string, newFilePath?: string): TFolder {
    return this._app?.vault?.getRoot() || new TFolder('/');
  }
  async renameFile(file: TAbstractFile, newPath: string): Promise<void> {
    await this._app?.vault?.rename(file, newPath);
  }
  async promptForDeletion(file: TAbstractFile): Promise<boolean> {
    return confirm(`Delete ${file.path}?`);
  }
  async trashFile(file: TAbstractFile): Promise<void> {
    await this._app?.vault?.trash(file, false);
  }
  generateMarkdownLink(file: TFile, sourcePath: string, subpath?: string, alias?: string): string {
    const display = alias || file.basename;
    return `[[${file.basename}${subpath || ''}|${display}]]`;
  }
  async processFrontMatter(file: TFile, fn: (frontmatter: any) => void, options?: any): Promise<void> {
    const content = await this._app?.vault?.read(file);
    if (!content) return;
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const fm = fmMatch ? parseYaml(fmMatch[1]) : {};
    fn(fm);
    const newFm = stringifyYaml(fm);
    const newContent = fmMatch
      ? content.replace(/^---\n[\s\S]*?\n---/, `---\n${newFm}\n---`)
      : `---\n${newFm}\n---\n${content}`;
    await this._app?.vault?.modify(file, newContent);
  }
  async getAvailablePathForAttachment(filename: string, sourcePath?: string): Promise<string> {
    return filename;
  }
}

import { parseYaml, stringifyYaml } from './utils';

// ── Missing utility functions (from official API) ──

export function getAllTags(cache: any): string[] | null {
  if (!cache) return null;
  const tags: string[] = [];
  if (cache.tags) for (const t of cache.tags) tags.push(t.tag);
  if (cache.frontmatter) {
    const fmTags = parseFrontMatterTags(cache.frontmatter);
    if (fmTags) tags.push(...fmTags);
  }
  return tags.length > 0 ? tags : null;
}

export function parseLinktext(linktext: string): { path: string; subpath: string } {
  const hashIdx = linktext.indexOf('#');
  if (hashIdx < 0) return { path: linktext, subpath: '' };
  return { path: linktext.substring(0, hashIdx), subpath: linktext.substring(hashIdx) };
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function arrayBufferToHex(data: ArrayBuffer): string {
  return Array.from(new Uint8Array(data)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  return bytes.buffer;
}

export async function getBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer();
}

export function getFrontMatterInfo(content: string): { exists: boolean; from: number; to: number; frontmatter: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { exists: false, from: 0, to: 0, frontmatter: '' };
  return { exists: true, from: 0, to: match[0].length, frontmatter: match[1] };
}

export function getIcon(iconId: string): SVGSVGElement | null {
  const el = document.createElement('div');
  setIcon(el, iconId);
  return el.querySelector('svg') || null;
}

export function getIconIds(): string[] {
  return [];
}

export function resolveSubpath(cache: any, subpath: string): any {
  if (!cache || !subpath) return null;
  if (subpath.startsWith('#^')) {
    const blockId = subpath.substring(2);
    const block = cache.blocks?.[blockId];
    return block ? { type: 'block', block, start: block.position?.start, end: block.position?.end } : null;
  }
  if (subpath.startsWith('#')) {
    const heading = subpath.substring(1);
    const h = cache.headings?.find((h: any) => h.heading === heading);
    return h ? { type: 'heading', current: h, start: h.position?.start } : null;
  }
  return null;
}

export function iterateCacheRefs(cache: any, cb: (ref: any) => void): void {
  if (!cache) return;
  if (cache.links) cache.links.forEach(cb);
  if (cache.embeds) cache.embeds.forEach(cb);
  if (cache.frontmatterLinks) cache.frontmatterLinks.forEach(cb);
}

export function iterateRefs(refs: any[], cb: (ref: any) => void): void {
  if (refs) refs.forEach(cb);
}

export function displayTooltip(el: HTMLElement, text: string, options?: any): void {
  el.title = text;
}

// Math/rendering stubs -- safe no-ops
export async function loadMathJax(): Promise<void> {}
export async function loadMermaid(): Promise<void> {}
export async function loadPdfJs(): Promise<any> { return {}; }
export async function loadPrism(): Promise<void> {}
export function renderMath(source: string, display: boolean): HTMLElement {
  const el = document.createElement('span');
  el.textContent = source;
  el.className = display ? 'math math-block' : 'math math-inline';
  return el;
}
export async function finishRenderMath(): Promise<void> {}

export function getLanguage(): string {
  return navigator.language || 'en';
}

export function parsePropertyId(propertyId: string): any {
  return { name: propertyId, type: 'text' };
}

// ── Workspace hierarchy stubs ──
// These classes form the workspace DOM tree. Plugins do instanceof checks.

export class WorkspaceItem extends Events {
  parent: any = null;
  getRoot(): WorkspaceItem { return (window as any).__oo_app?.workspace?.rootSplit || this; }
  getContainer(): any { return this.getRoot(); }
}

export class WorkspaceParent extends WorkspaceItem {}

export class WorkspaceSplit extends WorkspaceParent {
  parent: WorkspaceParent = null as any;
}

export class WorkspaceContainer extends WorkspaceSplit {
  win: Window = window;
  doc: Document = document;
}

export class WorkspaceRoot extends WorkspaceContainer {
  win = window;
  doc = document;
}

export class WorkspaceTabs extends WorkspaceParent {
  parent: WorkspaceSplit = null as any;
}

export class WorkspaceSidedock extends WorkspaceSplit {
  collapsed: boolean = false;
  toggle(): void { this.collapsed = !this.collapsed; }
  collapse(): void { this.collapsed = true; }
  expand(): void { this.collapsed = false; }
}

export class WorkspaceFloating extends WorkspaceParent {
  parent: WorkspaceParent = null as any;
}

export class WorkspaceWindow extends WorkspaceContainer {
  win = window;
  doc = document;
}

export class WorkspaceMobileDrawer extends WorkspaceParent {
  parent: WorkspaceParent = null as any;
  collapsed: boolean = false;
  expand(): void { this.collapsed = false; }
  collapse(): void { this.collapsed = true; }
  toggle(): void { this.collapsed = !this.collapsed; }
}

export class WorkspaceRibbon {}

// ── Base component classes ──
export class BaseComponent {
  disabled: boolean = false;
  then(cb: (component: any) => any): this { cb(this); return this; }
  setDisabled(disabled: boolean): this { this.disabled = disabled; return this; }
}

export class ValueComponent<T> extends BaseComponent {
  getValue(): T { return undefined as any; }
  setValue(value: T): this { return this; }
}

export class AbstractTextComponent<T extends HTMLInputElement | HTMLTextAreaElement> extends ValueComponent<string> {
  inputEl: T;
  constructor(inputEl: T) { super(); this.inputEl = inputEl; }
  getValue(): string { return this.inputEl.value; }
  setValue(value: string): this { this.inputEl.value = value; return this; }
  setPlaceholder(placeholder: string): this { this.inputEl.placeholder = placeholder; return this; }
  onChanged(): void {}
  onChange(callback: (value: string) => any): this { return this; }
  setDisabled(disabled: boolean): this { this.inputEl.disabled = disabled; return this; }
}

// ── Additional component stubs ──
export class ProgressBarComponent extends BaseComponent {
  progressBar: HTMLProgressElement;
  constructor(containerEl: HTMLElement) {
    super();
    this.progressBar = containerEl.createEl('progress') as unknown as HTMLProgressElement;
  }
  getValue(): number { return this.progressBar.value; }
  setValue(value: number): this { this.progressBar.value = value; return this; }
}

export class MenuSeparator {
  separatorEl: HTMLElement;
  constructor() { this.separatorEl = document.createElement('div'); this.separatorEl.className = 'menu-separator'; }
}

export class SecretComponent extends BaseComponent {
  inputEl: HTMLInputElement;
  constructor(containerEl: HTMLElement) {
    super();
    this.inputEl = containerEl.createEl('input', { type: 'password' }) as unknown as HTMLInputElement;
  }
  getValue(): string { return this.inputEl.value; }
  setValue(value: string): this { this.inputEl.value = value; return this; }
  setPlaceholder(placeholder: string): this { this.inputEl.placeholder = placeholder; return this; }
  onChange(callback: (value: string) => any): this { return this; }
}

export class SettingGroup {
  settingEl: HTMLElement;
  constructor(containerEl: HTMLElement) {
    this.settingEl = containerEl.createEl('div', { cls: 'setting-group' }) as unknown as HTMLElement;
  }
}

export class SettingPage {
  containerEl: HTMLElement;
  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl.createEl('div', { cls: 'setting-page' }) as unknown as HTMLElement;
  }
}

export class RenderContext {}
export class SecretStorage {
  async getSecret(key: string): Promise<string | null> { return null; }
  async setSecret(key: string, value: string): Promise<void> {}
  async deleteSecret(key: string): Promise<void> {}
}
export class Tasks {}
export class MarkdownEditView {}
export class CapacitorAdapter {}

// ── PopoverState enum ──
export enum PopoverState {
  Showing = 0,
  Shown = 1,
  Hiding = 2,
  Hidden = 3,
}

// ── Additional types ──
export type UserEvent = MouseEvent | KeyboardEvent | TouchEvent | PointerEvent;
export type HexString = string;
export type Side = 'left' | 'right';
export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';
export type MarkdownViewModeType = 'source' | 'preview';
export type Constructor<T> = new (...args: any[]) => T;

export interface Command {
  id: string;
  name: string;
  icon?: IconName;
  mobileOnly?: boolean;
  callback?: () => any;
  checkCallback?: (checking: boolean) => boolean | void;
  editorCallback?: (editor: Editor, ctx: MarkdownFileInfo) => any;
  editorCheckCallback?: (checking: boolean, editor: Editor, ctx: MarkdownFileInfo) => boolean | void;
  hotkeys?: any[];
}

export interface Hotkey {
  modifiers: Modifier[];
  key: string;
}

export interface OpenViewState {
  state?: any;
  eState?: any;
  active?: boolean;
}

export interface ViewState {
  type: string;
  state?: any;
  active?: boolean;
  pinned?: boolean;
  group?: WorkspaceLeaf;
}

export interface ViewStateResult {}

export interface DataWriteOptions {
  ctime?: number;
  mtime?: number;
}

export interface DataAdapter {
  getName(): string;
  getBasePath(): string;
  read(normalizedPath: string): Promise<string>;
  write(normalizedPath: string, data: string, options?: DataWriteOptions): Promise<void>;
  exists(normalizedPath: string): Promise<boolean>;
}

export interface Pos { start: Loc; end: Loc; }
export interface Loc { line: number; col: number; offset: number; }

export interface SearchResult { score: number; matches: any[]; }
export interface SearchResultContainer { match: SearchResult; }
export type SearchMatches = [number, number][];
export type SearchMatchPart = [number, number];

// -- Cache-related interfaces --
export interface CacheItem { position: Pos; }
export interface HeadingCache extends CacheItem { heading: string; level: number; }
export interface TagCache extends CacheItem { tag: string; }
export interface LinkCache extends CacheItem { link: string; original: string; displayText?: string; }
export interface EmbedCache extends CacheItem { link: string; original: string; displayText?: string; }
export interface SectionCache extends CacheItem { type: string; id?: string; }
export interface ListItemCache extends CacheItem { parent: number; task?: string; }
export interface FrontMatterCache { [key: string]: any; position: Pos; }
export interface FrontmatterLinkCache { key: string; link: string; original: string; displayText?: string; }
export interface BlockCache extends CacheItem { id: string; }
export interface FootnoteCache extends CacheItem { id: string; }
export interface FootnoteRefCache extends CacheItem { id: string; }
export interface ReferenceCache extends CacheItem { link: string; original: string; displayText?: string; }
export interface ReferenceLinkCache extends CacheItem { reference: string; link: string; original: string; }
export interface FrontMatterInfo { exists: boolean; from: number; to: number; frontmatter: string; }

// -- Subpath results --
export interface HeadingSubpathResult { type: 'heading'; current: HeadingCache; next?: HeadingCache; }
export interface BlockSubpathResult { type: 'block'; block: BlockCache; list?: ListItemCache; }
export interface FootnoteSubpathResult { type: 'footnote'; footnote: FootnoteCache; }
export type SubpathResult = HeadingSubpathResult | BlockSubpathResult | FootnoteSubpathResult;

// -- Editor-related interfaces --
export interface EditorChange { from: EditorPosition; to?: EditorPosition; text: string; }
export interface EditorScrollInfo { top: number; left: number; height: number; width: number; clientHeight: number; clientWidth: number; }
export interface EditorSelection { anchor: EditorPosition; head: EditorPosition; }
export interface EditorSelectionOrCaret { anchor: EditorPosition; head?: EditorPosition; }
export interface EditorRangeOrCaret { from: EditorPosition; to?: EditorPosition; }
export interface EditorTransaction { changes?: EditorChange[]; selections?: EditorSelectionOrCaret[]; selection?: EditorSelectionOrCaret; }
export interface EditorSuggestContext { start: EditorPosition; end: EditorPosition; query: string; editor: Editor; file: TFile; }
export interface EditorSuggestTriggerInfo { start: EditorPosition; end: EditorPosition; query: string; }
export type EditorCommandName = string;

// -- Misc interfaces --
export interface FuzzyMatch<T> { item: T; match: SearchResult; }
export interface Instruction { command: string; purpose: string; }
export interface ISuggestOwner<T> { renderSuggestion(value: T, el: HTMLElement): void; selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void; }
export interface HoverParent { hoverPopover: HoverPopover | null; }
export interface HoverLinkSource { display: string; defaultMod?: boolean; }
export interface CloseableComponent { close(): void; }
export interface Reference { link: string; original: string; }
export interface Point { x: number; y: number; }
export interface RGB { r: number; g: number; b: number; }
export interface HSL { h: number; s: number; l: number; }
export interface Stat { type: 'file' | 'folder'; ctime: number; mtime: number; size: number; }
export interface ListedFiles { files: string[]; folders: string[]; }
export interface MenuPositionDef { x: number; y: number; width?: number; overlap?: boolean; }
export interface WorkspaceWindowInitData { x?: number; y?: number; size?: { width: number; height: number; }; }

// -- Request interfaces --
export interface RequestUrlParam { url: string; method?: string; headers?: Record<string, string>; body?: string | ArrayBuffer; contentType?: string; throw?: boolean; }
export interface RequestUrlResponse { status: number; headers: Record<string, string>; arrayBuffer: ArrayBuffer; json: any; text: string; }
export interface RequestUrlResponsePromise extends Promise<RequestUrlResponse> { arrayBuffer: Promise<ArrayBuffer>; json: Promise<any>; text: Promise<string>; }

// -- Keymap interfaces --
export interface KeymapContext { key: string; modifiers: string | null; vkey: string; }
export interface KeymapInfo { modifiers: string | null; key: string | null; }
export interface KeymapEventHandler extends KeymapInfo { scope: any; }
export type KeymapEventListener = (evt: KeyboardEvent, ctx: KeymapContext) => boolean | void;

// -- Markdown interfaces --
export type MarkdownPostProcessor = (el: HTMLElement, ctx: MarkdownPostProcessorContext) => Promise<any> | void;
export interface MarkdownPostProcessorContext { docId: string; sourcePath: string; frontmatter: any | null | undefined; addChild(child: MarkdownRenderChild): void; getSectionInfo(el: HTMLElement): MarkdownSectionInformation | null; }
export interface MarkdownSectionInformation { text: string; lineStart: number; lineEnd: number; }
export interface MarkdownSubView { getScroll(): number; applyScroll(scroll: number): void; get(): string; set(data: string, clear: boolean): void; }
export interface MarkdownPreviewEvents {}

// -- Setting definition interfaces --
export interface SettingControlBase { id?: string; }
export interface SettingTextControl extends SettingControlBase { type: 'text'; default?: string; placeholder?: string; }
export interface SettingToggleControl extends SettingControlBase { type: 'toggle'; default?: boolean; }
export interface SettingDropdownControl extends SettingControlBase { type: 'dropdown'; default?: string; options: Record<string, string>; }
export interface SettingSliderControl extends SettingControlBase { type: 'slider'; default?: number; min?: number; max?: number; step?: number; }
export interface SettingColorControl extends SettingControlBase { type: 'color'; default?: string; }
export type SettingControl = SettingTextControl | SettingToggleControl | SettingDropdownControl | SettingSliderControl | SettingColorControl;
export interface SettingControlBinding { value: any; onChange: (value: any) => any; }

export interface SettingDefinitionBase { id?: string; name?: string; description?: string; }
export interface SettingDefinitionControl extends SettingDefinitionBase { type: 'control'; control: SettingControl; }
export interface SettingDefinitionAction extends SettingDefinitionBase { type: 'action'; action: () => any; }
export interface SettingDefinitionElement extends SettingDefinitionBase { type: 'element'; element: (containerEl: HTMLElement) => any; }
export interface SettingDefinitionRender extends SettingDefinitionBase { type: 'render'; render: (containerEl: HTMLElement) => any; }
export interface SettingDefinitionEmpty extends SettingDefinitionBase { type: 'empty'; }
export interface SettingDefinitionGroup extends SettingDefinitionBase { type: 'group'; }
export interface SettingDefinitionPage extends SettingDefinitionBase { type: 'page'; }
export type SettingDefinitionItem = SettingDefinitionControl | SettingDefinitionAction | SettingDefinitionElement | SettingDefinitionRender | SettingDefinitionEmpty;
export type SettingDefinition = SettingDefinitionItem | SettingDefinitionGroup | SettingDefinitionPage;
export type SettingGroupItem = SettingDefinition;

export interface TooltipOptions { placement?: TooltipPlacement; delay?: number; }
export type ObsidianProtocolHandler = (params: ObsidianProtocolData) => any;
export interface LivePreviewStateType { mousedown: boolean; }

// Stubs for CLI-related types (not commonly used by plugins)
export interface CliFlag { name: string; description: string; type?: string; default?: any; }
export interface CliData { flags: CliFlag[]; }
export type CliFlags = Record<string, any>;
export type CliHandler = (flags: CliFlags) => any;

// QueryController stub
export class QueryController { abort(): void {} }

// ── ConfirmModal ────────────────────────────────────
// Convenience modal with OK/Cancel that some plugins import
export function ConfirmModal(this: any, app: any, title: string, message: string, cb: (confirmed: boolean) => void) {
  Modal.call(this, app);
  const self = this;
  this._title = title;
  this._message = message;
  this._cb = cb;
  
  this.onOpen = function() {
    self.titleEl.textContent = title;
    self.contentEl.textContent = message;
    const btnContainer = document.createElement('div');
    btnContainer.className = 'modal-button-container';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'oo-plugin-btn';
    cancelBtn.addEventListener('click', () => { cb(false); self.close(); });
    
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Confirm';
    confirmBtn.className = 'oo-plugin-btn mod-cta';
    confirmBtn.addEventListener('click', () => { cb(true); self.close(); });
    
    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(confirmBtn);
    self.contentEl.appendChild(btnContainer);
  };
}
ConfirmModal.prototype = Object.create((Modal as any).prototype);
ConfirmModal.prototype.constructor = ConfirmModal;

// ── Additional utility ──────────────────────────────
export function hexStringToArrayBuffer(hexString: string): ArrayBuffer {
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

// ── Bases API Stubs (v1.10+) ────────────────────────
// Minimal stubs to prevent import errors. Most plugins
// do not use these, but having them avoids undefined errors.

export class BasesView extends Component {
  controller: QueryController;
  containerEl: HTMLElement;
  constructor(controller: QueryController, containerEl: HTMLElement) {
    super();
    this.controller = controller;
    this.containerEl = containerEl;
  }
}

export class BasesEntry {
  _file: any = null;
  _values: Map<string, any> = new Map();
  getFile(): any { return this._file; }
  getValue(_id: string): any { return undefined; }
  setValue(_id: string, _value: any): void {}
}

export class BasesEntryGroup {
  entries: BasesEntry[] = [];
  value: any = null;
}

export class BasesQueryResult {
  entries: BasesEntry[] = [];
  groups: BasesEntryGroup[] = [];
  properties: any[] = [];
}

export class BasesViewConfig {
  id: string = '';
  name: string = '';
  icon: string = '';
}

// ── Value types for Bases formula system ────────────
class PrimitiveValue<T> {
  value: T;
  constructor(value: T) { this.value = value; }
  toString(): string { return String(this.value); }
}

export class BooleanValue extends PrimitiveValue<boolean> {}
export class NumberValue extends PrimitiveValue<number> {}
export class StringValue extends PrimitiveValue<string> {}
export class DateValue extends PrimitiveValue<Date> {}

export interface FormulaContext {
  getValue(id: string): any;
}

