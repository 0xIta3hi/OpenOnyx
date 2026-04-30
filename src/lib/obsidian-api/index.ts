/**
 * Obsidian API Compatibility — Barrel Export
 *
 * This module is what plugins receive when they `require('obsidian')`.
 * It re-exports all public Obsidian API classes and functions.
 */

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

export abstract class EditorSuggest<T> extends Component {
  constructor(app: any) { super(); }
  abstract onTrigger(cursor: EditorPosition, editor: any, file: TFile | null): any;
  abstract getSuggestions(context: any): T[] | Promise<T[]>;
  abstract renderSuggestion(value: T, el: HTMLElement): void;
  abstract selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void;
}

// Moment.js stub — many plugins use moment
export const moment = (window as any).moment || (() => {
  const m = (input?: any) => {
    const d = input ? new Date(input) : new Date();
    return {
      format: (fmt?: string) => {
        if (!fmt) return d.toISOString();
        return fmt
          .replace('YYYY', String(d.getFullYear()))
          .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
          .replace('DD', String(d.getDate()).padStart(2, '0'))
          .replace('HH', String(d.getHours()).padStart(2, '0'))
          .replace('mm', String(d.getMinutes()).padStart(2, '0'))
          .replace('ss', String(d.getSeconds()).padStart(2, '0'));
      },
      toDate: () => d,
      valueOf: () => d.getTime(),
      isValid: () => !isNaN(d.getTime()),
      startOf: () => m(d),
      endOf: () => m(d),
      add: () => m(d),
      subtract: () => m(d),
      diff: (other: any) => d.getTime() - new Date(other).getTime(),
      isBefore: (other: any) => d.getTime() < new Date(other).getTime(),
      isAfter: (other: any) => d.getTime() > new Date(other).getTime(),
      isSame: (other: any) => d.getTime() === new Date(other).getTime(),
    };
  };
  m.now = () => Date.now();
  return m;
})();
