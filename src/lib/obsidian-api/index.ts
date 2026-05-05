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
