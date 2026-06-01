/**
 * Editor - Main Markdown Editing Component
 *
 * Features:
 * - CodeMirror 6 for the editor with markdown syntax highlighting
 * - Live markdown preview using the `marked` library
 * - Split view showing both editor and preview
 * - Tab management for multiple open notes
 * - Wiki-link [[link]] support in both editor and preview
 * - Link autocomplete when typing [[
 */

import React, { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Lightbulb, BookOpen, Pen, RefreshCw, Sparkles } from "lucide-react";
import { Compartment, EditorState, Transaction, StateField } from "@codemirror/state";
import {
  EditorView,
  keymap,
  ViewUpdate,
  Decoration,
  DecorationSet,
  ViewPlugin,
  WidgetType,
  drawSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { search, highlightSelectionMatches } from "@codemirror/search";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Tab, ViewMode } from "../../types";
import { MarkdownPreview } from "./MarkdownPreview";
import { SearchReplace } from "./SearchReplace";
import { Menu, TFile } from "../../lib/obsidian-api";
import { getAPI } from "../../utils/api";
import {
  linkAutocomplete,
  linkAutocompleteTheme,
  setAvailableNotes,
} from "../../utils/linkAutocomplete";
import { headingFold, foldTheme } from "../../utils/headingFold";
import { resolveVaultImageSrc } from "../../utils/resolveImageSrc";
import { vimCompartment, toggleVimMode } from "../../editor/vimExtension";
import { type LinkType } from "../SuggestionBanner";
import type { EnrichedSuggestion } from "../../utils/suggestion-enrichment";
import type { CollabOperation, CursorPresence } from "../../utils/collabOperations";
import { extractOperations } from "../../utils/collabOperations";
import { remoteCursorsExtension, setCursorsEffect } from "../../utils/remoteCursorsPlugin";
import { authManager } from "../../lib/auth";
import { loadAIConfig, getBaseUrl, getProviderHeaders, parseProviderError } from "../../utils/ai-settings";

interface EditorProps {
  tabs: Tab[];
  availableNotes?: { name: string; path: string }[];
  activeTabId: string;
  content: string;
  viewMode: ViewMode;
  specialContent?: React.ReactNode;
  onAdjustFontSize: (
    delta: number,
    scope: "both" | "editor" | "preview",
  ) => void;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onContentChange: (content: string, isUserEdit?: boolean) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onLinkClick: (linkName: string, heading?: string) => void;
  onGetNoteContent?: (noteName: string) => string | null;
  onImagePaste?: (file: File) => Promise<string | null>;
  // Inline suggestions (from embedding similarity)
  suggestions?: EnrichedSuggestion[];
  nextStepSuggestions?: EnrichedSuggestion[];
  onAcceptSuggestion?: (path: string, linkType: LinkType) => void;
  onRejectSuggestion?: (path: string) => void;
  onOpenNote?: (path: string) => void;
  // Inline annotation
  annotation?: string | null;
  showInsight?: boolean;
  onToggleInsight?: (show: boolean) => void;
  theme?: string;
  // Collaboration: operation-based sync
  onCollabOperations?: (ops: CollabOperation[]) => void;
  onCursorChange?: (cursor: { from: number; to: number }) => void;
  remoteCursors?: CursorPresence[];
  /** The local client ID, used to tag extracted operations. */
  localClientId?: string;
  /** Called when the CodeMirror EditorView is created or destroyed. */
  onEditorViewReady?: (view: import("@codemirror/view").EditorView | null) => void;
  getViewState?: (path: string) => { scroll?: number; cursor?: number } | undefined;
  onViewStateChange?: (path: string, state: { scroll?: number; cursor?: number }) => void;
  readOnly?: boolean;
  onGenerateInsight?: () => void;
  isGeneratingInsight?: boolean;
}

/**
 * CodeMirror plugin to highlight [[wiki-links]] in the editor.
 * Creates decorations for text matching the [[...]] pattern.
 */
function wikiLinkPlugin(onLinkClick: (name: string) => void) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        const decorations: any[] = [];
        const doc = view.state.doc;

        for (let i = 1; i <= doc.lines; i++) {
          const line = doc.line(i);
          const regex = /\[\[([^\]]+)\]\]/g;
          let match;

          while ((match = regex.exec(line.text)) !== null) {
            const from = line.from + match.index;
            const to = from + match[0].length;

            decorations.push(
              Decoration.mark({
                class: "cm-wikilink",
                attributes: {
                  "data-link": match[1],
                  title: `Open: ${match[1]}`,
                },
              }).range(from, to),
            );
          }
        }

        return Decoration.set(decorations, true);
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        click: (e: MouseEvent, view: EditorView) => {
          const target = e.target as HTMLElement;
          if (
            target.classList.contains("cm-wikilink") ||
            target.closest(".cm-wikilink")
          ) {
            const linkEl = target.classList.contains("cm-wikilink")
              ? target
              : (target.closest(".cm-wikilink") as HTMLElement);
            const linkName = linkEl?.getAttribute("data-link");
            if (linkName && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              onLinkClick(linkName);
            }
          }
        },
      },
    },
  );
}

/**
 * CodeMirror plugin to highlight #tags in the editor.
 */
function tagPlugin() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        const decorations: any[] = [];
        const doc = view.state.doc;

        for (let i = 1; i <= doc.lines; i++) {
          const line = doc.line(i);
          const regex = /(?:^|\s)(#[a-zA-Z][a-zA-Z0-9_-]*)/g;
          let match;

          while ((match = regex.exec(line.text)) !== null) {
            const tagStart =
              line.from + match.index + (match[0].startsWith(" ") ? 1 : 0);
            const tagEnd = tagStart + match[1].length;

            decorations.push(
              Decoration.mark({ class: "cm-tag-mark" }).range(tagStart, tagEnd),
            );
          }
        }

        return Decoration.set(decorations, true);
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
}

type ImageCropMode = "contain" | "cover";

interface MarkdownImageMatch {
  from: number;
  to: number;
  alt: string;
  src: string;
  width?: number;
  crop: ImageCropMode;
  offsetX: number;
  offsetY: number;
}

const MARKDOWN_IMAGE_GLOBAL_REGEX =
  /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
const MARKDOWN_IMAGE_SINGLE_REGEX =
  /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/;

function parseImageMeta(title?: string): {
  width?: number;
  crop: ImageCropMode;
  offsetX: number;
  offsetY: number;
} {
  const raw = title || "";
  const widthMatch = raw.match(/(?:^|[\s,])w(?:idth)?=(\d{2,4})/i);
  const cropMatch = raw.match(/(?:^|[\s,])crop=(cover|contain)/i);
  const offsetXMatch = raw.match(/(?:^|[\s,])ox=(-?\d{1,4})/i);
  const offsetYMatch = raw.match(/(?:^|[\s,])oy=(-?\d{1,4})/i);

  const parsedWidth = widthMatch ? Number(widthMatch[1]) : undefined;
  const width = Number.isFinite(parsedWidth)
    ? Math.max(120, Math.min(1400, parsedWidth!))
    : undefined;
  const crop: ImageCropMode = (cropMatch?.[1] as ImageCropMode) || "contain";
  const offsetX = offsetXMatch
    ? Math.max(-1200, Math.min(1200, Number(offsetXMatch[1])))
    : 0;
  const offsetY = offsetYMatch
    ? Math.max(-1200, Math.min(1200, Number(offsetYMatch[1])))
    : 0;
  return { width, crop, offsetX, offsetY };
}

function parseMarkdownImage(
  markdown: string,
  from: number,
  to: number,
): MarkdownImageMatch | null {
  const match = markdown.match(MARKDOWN_IMAGE_SINGLE_REGEX);
  if (!match) return null;

  const [, alt, src, title] = match;
  const { width, crop, offsetX, offsetY } = parseImageMeta(title);
  return { from, to, alt, src, width, crop, offsetX, offsetY };
}

function buildMarkdownImage(
  alt: string,
  src: string,
  width?: number,
  crop: ImageCropMode = "contain",
  offsetX = 0,
  offsetY = 0,
): string {
  const attrs: string[] = [];
  if (width) attrs.push(`w=${Math.round(width)}`);
  if (crop === "cover") {
    attrs.push("crop=cover");
    if (offsetX !== 0) attrs.push(`ox=${Math.round(offsetX)}`);
    if (offsetY !== 0) attrs.push(`oy=${Math.round(offsetY)}`);
  }
  const title = attrs.join(" ");
  return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
}

function applyWidgetImageStyles(
  img: HTMLImageElement,
  image: MarkdownImageMatch,
): void {
  const width = image.width ?? 420;
  img.style.width = `${width}px`;
  img.style.maxWidth = "100%";
  if (image.crop === "cover") {
    img.style.objectFit = "cover";
    img.style.aspectRatio = "4 / 3";
    img.style.objectPosition = `calc(50% + ${Math.round(image.offsetX)}px) calc(50% + ${Math.round(image.offsetY)}px)`;
  } else {
    img.style.objectFit = "contain";
    img.style.aspectRatio = "auto";
    img.style.objectPosition = "center center";
  }
}

class MarkdownImageWidget extends WidgetType {
  constructor(private readonly image: MarkdownImageMatch) {
    super();
  }

  eq(other: MarkdownImageWidget): boolean {
    return (
      this.image.alt === other.image.alt &&
      this.image.src === other.image.src &&
      this.image.width === other.image.width &&
      this.image.crop === other.image.crop &&
      this.image.offsetX === other.image.offsetX &&
      this.image.offsetY === other.image.offsetY &&
      this.image.from === other.image.from &&
      this.image.to === other.image.to
    );
  }

  toDOM(): HTMLElement {
    const root = document.createElement("div");
    root.className = "cm-image-widget";
    root.setAttribute("contenteditable", "false");
    root.dataset.from = String(this.image.from);
    root.dataset.to = String(this.image.to);
    root.dataset.width = String(this.image.width ?? 420);
    root.dataset.crop = this.image.crop;
    root.dataset.ox = String(this.image.offsetX);
    root.dataset.oy = String(this.image.offsetY);
    root.dataset.alt = this.image.alt;
    root.dataset.src = this.image.src;

    const stage = document.createElement("div");
    stage.className = "cm-image-widget-stage";
    root.appendChild(stage);

    const img = document.createElement("img");
    img.className = "cm-image-widget-image";
    img.src = resolveVaultImageSrc(this.image.src);
    img.alt = this.image.alt || "Image";
    applyWidgetImageStyles(img, this.image);
    stage.appendChild(img);

    const imageToggle = document.createElement("button");
    imageToggle.className = "cm-image-widget-toggle";
    imageToggle.type = "button";
    imageToggle.dataset.action = "toggle-mode";
    imageToggle.title = "Switch between image and markdown text mode";
    imageToggle.textContent = "↻";
    stage.appendChild(imageToggle);

    const metaRow = document.createElement("div");
    metaRow.className = "cm-image-widget-meta";
    metaRow.style.width = `${this.image.width ?? 420}px`;
    metaRow.style.maxWidth = "100%";

    const widthLabel = document.createElement("span");
    widthLabel.className = "cm-image-widget-width";
    widthLabel.textContent = `${this.image.width ?? 420}px`;
    metaRow.appendChild(widthLabel);

    const deleteButton = document.createElement("button");
    deleteButton.className = "cm-image-widget-delete";
    deleteButton.type = "button";
    deleteButton.dataset.action = "delete-image";
    deleteButton.title = "Delete image";
    deleteButton.textContent = "Delete";
    metaRow.appendChild(deleteButton);

    root.appendChild(metaRow);

    const textWrap = document.createElement("div");
    textWrap.className = "cm-image-widget-text-wrap";
    const textEditor = document.createElement("textarea");
    textEditor.className = "cm-image-widget-text";
    textEditor.value = buildMarkdownImage(
      this.image.alt,
      this.image.src,
      this.image.width,
      this.image.crop,
      this.image.offsetX,
      this.image.offsetY,
    );
    textEditor.spellcheck = false;
    textWrap.appendChild(textEditor);

    const textToggle = document.createElement("button");
    textToggle.className = "cm-image-widget-toggle text-toggle";
    textToggle.type = "button";
    textToggle.dataset.action = "toggle-mode";
    textToggle.title = "Back to image mode";
    textToggle.textContent = "↻";
    textWrap.appendChild(textToggle);
    root.appendChild(textWrap);

    return root;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function imageWidgetPlugin(onOpenLightbox: (src: string, alt: string) => void) {
  let activeDragCleanup: (() => void) | null = null;

  const getMaxRenderableWidth = (view: EditorView) => {
    const content = view.dom.querySelector(".cm-content") as HTMLElement | null;
    const scroller = view.dom.querySelector(
      ".cm-scroller",
    ) as HTMLElement | null;
    const raw =
      (content?.getBoundingClientRect().width ||
        scroller?.getBoundingClientRect().width ||
        view.dom.getBoundingClientRect().width) - 24;
    const safe = Number.isFinite(raw) ? Math.floor(raw) : 1400;
    return Math.max(120, Math.min(1400, safe));
  };

  const clampWidth = (candidate: number, maxWidth: number) =>
    Math.max(120, Math.min(maxWidth, Math.round(candidate)));

  const cleanupDrag = () => {
    if (activeDragCleanup) {
      activeDragCleanup();
      activeDragCleanup = null;
    }
    document.body.style.cursor = "default";
  };

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      destroy() {
        cleanupDrag();
      }

      buildDecorations(view: EditorView): DecorationSet {
        const decorations: any[] = [];
        const doc = view.state.doc;

        for (let i = 1; i <= doc.lines; i++) {
          const line = doc.line(i);
          const regex = new RegExp(MARKDOWN_IMAGE_GLOBAL_REGEX.source, "g");
          let match: RegExpExecArray | null;

          while ((match = regex.exec(line.text)) !== null) {
            const from = line.from + match.index;
            const to = from + match[0].length;
            const parsed = parseMarkdownImage(match[0], from, to);
            if (!parsed) continue;

            decorations.push(
              Decoration.replace({
                widget: new MarkdownImageWidget(parsed),
              }).range(from, to),
            );
          }
        }

        return Decoration.set(decorations, true);
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        mousedown: (e: MouseEvent, view: EditorView) => {
          const target = e.target as HTMLElement;
          const textEditor = target.closest(
            ".cm-image-widget-text",
          ) as HTMLTextAreaElement | null;
          if (textEditor) {
            e.stopPropagation();
            return;
          }

          const widget = target.closest(
            ".cm-image-widget",
          ) as HTMLElement | null;
          if (!widget) return;

          e.preventDefault();
          e.stopPropagation();
          view.dom.blur();

          const from = Number(widget.dataset.from);
          const to = Number(widget.dataset.to);
          if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from)
            return;

          const current = view.state.doc.sliceString(from, to);
          const parsed = parseMarkdownImage(current, from, to);
          if (!parsed) return;

          const button = target.closest(
            "[data-action]",
          ) as HTMLButtonElement | null;
          if (button) {
            const action = button.dataset.action;
            if (action === "delete-image") {
              view.dispatch({
                changes: { from, to, insert: "" },
                selection: { anchor: from },
              });
              return;
            }
            if (action === "toggle-mode") {
              const editor = widget.querySelector(
                ".cm-image-widget-text",
              ) as HTMLTextAreaElement | null;
              const isTextMode = widget.classList.contains("text-mode");
              if (!isTextMode) {
                widget.classList.add("text-mode");
                if (editor) {
                  editor.value = current;
                  editor.focus();
                  editor.select();
                }
                return;
              }

              const nextRaw = (editor?.value || "").trim();
              const nextParsed = nextRaw
                ? parseMarkdownImage(nextRaw, from, to)
                : null;
              if (nextParsed) {
                view.dispatch({
                  changes: { from, to, insert: nextRaw },
                  selection: { anchor: from + nextRaw.length },
                });
                widget.classList.remove("text-mode");
              }
              return;
            }
            return;
          }

          if (widget.classList.contains("text-mode")) return;

          const imageEl = widget.querySelector(
            ".cm-image-widget-image",
          ) as HTMLImageElement | null;
          if (!imageEl) return;

          cleanupDrag();

          const stage = target.closest(
            ".cm-image-widget-stage",
          ) as HTMLElement | null;
          if (!stage) return;

          const rect = imageEl.getBoundingClientRect();
          const edgeThreshold = 10;
          const nearLeft = Math.abs(e.clientX - rect.left) <= edgeThreshold;
          const nearRight = Math.abs(rect.right - e.clientX) <= edgeThreshold;
          const isResizeFromEdge = nearLeft || nearRight;
          const isImageSurface = !!target.closest(".cm-image-widget-stage");

          const startX = e.clientX;
          const startY = e.clientY;
          const startWidth =
            (parsed.width ??
              Math.round(imageEl.getBoundingClientRect().width)) ||
            420;
          const startOx = parsed.offsetX;
          const startOy = parsed.offsetY;
          const maxWidth = getMaxRenderableWidth(view);
          const resizeDirection = nearLeft ? -1 : 1;
          let moved = false;

          const onMove = (event: MouseEvent) => {
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            if (!moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
              moved = true;
            }
            if (!moved) return;

            if (isResizeFromEdge) {
              const nextWidth = clampWidth(
                startWidth + resizeDirection * dx,
                maxWidth,
              );
              imageEl.style.width = `${nextWidth}px`;
              const widthBadge = widget.querySelector(
                ".cm-image-widget-width",
              ) as HTMLElement | null;
              if (widthBadge) widthBadge.textContent = `${nextWidth}px`;
              const metaRow = widget.querySelector(
                ".cm-image-widget-meta",
              ) as HTMLElement | null;
              if (metaRow) metaRow.style.width = `${nextWidth}px`;
              return;
            }

            const nextOx = Math.max(
              -1200,
              Math.min(1200, Math.round(startOx + dx)),
            );
            const nextOy = Math.max(
              -1200,
              Math.min(1200, Math.round(startOy + dy)),
            );
            imageEl.style.objectFit = "cover";
            imageEl.style.aspectRatio = "4 / 3";
            imageEl.style.objectPosition = `calc(50% + ${nextOx}px) calc(50% + ${nextOy}px)`;
          };

          const onUp = (event: MouseEvent) => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            document.body.style.cursor = "default";
            activeDragCleanup = null;

            if (!moved) {
              if (isImageSurface) {
                onOpenLightbox(parsed.src, parsed.alt || "Image");
              }
              return;
            }

            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            const nextWidth = isResizeFromEdge
              ? clampWidth(startWidth + resizeDirection * dx, maxWidth)
              : startWidth;
            const nextCrop = isResizeFromEdge ? parsed.crop : "cover";
            const nextOx = isResizeFromEdge
              ? parsed.offsetX
              : Math.max(-1200, Math.min(1200, Math.round(startOx + dx)));
            const nextOy = isResizeFromEdge
              ? parsed.offsetY
              : Math.max(-1200, Math.min(1200, Math.round(startOy + dy)));

            const replacement = buildMarkdownImage(
              parsed.alt,
              parsed.src,
              nextWidth,
              nextCrop,
              nextOx,
              nextOy,
            );
            view.dispatch({
              changes: { from, to, insert: replacement },
              selection: { anchor: from + replacement.length },
            });
          };

          activeDragCleanup = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };
          document.body.style.cursor = isResizeFromEdge ? "ew-resize" : "grab";
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        },

        mousemove: (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          const widget = target.closest(
            ".cm-image-widget",
          ) as HTMLElement | null;
          if (!widget || widget.classList.contains("text-mode")) return;
          const imageEl = widget.querySelector(
            ".cm-image-widget-image",
          ) as HTMLImageElement | null;
          if (!imageEl) return;
          const rect = imageEl.getBoundingClientRect();
          const edgeThreshold = 10;
          const nearLeft = Math.abs(e.clientX - rect.left) <= edgeThreshold;
          const nearRight = Math.abs(rect.right - e.clientX) <= edgeThreshold;
          imageEl.style.cursor = nearLeft || nearRight ? "ew-resize" : "grab";
        },

        mouseleave: (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          const imageEl = target
            .closest(".cm-image-widget")
            ?.querySelector(
              ".cm-image-widget-image",
            ) as HTMLImageElement | null;
          if (imageEl) imageEl.style.cursor = "grab";
        },

        click: (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          if (
            target.closest(".cm-image-widget") &&
            !target.closest(".cm-image-widget-text")
          ) {
            e.preventDefault();
            e.stopPropagation();
          }
        },
      },
    },
  );
}

const markdownHighlightStyle = HighlightStyle.define([
  {
    tag: [
      t.heading1,
      t.heading2,
      t.heading3,
      t.heading4,
      t.heading5,
      t.heading6,
      t.heading,
    ],
    color: "var(--editor-heading)",
    fontWeight: "700",
  },
  {
    tag: [t.processingInstruction, t.contentSeparator],
    color: "var(--editor-heading-marker)",
    fontWeight: "600",
  },
  { tag: [t.comment, t.quote, t.meta], color: "var(--editor-muted-token)" },
  {
    tag: [t.keyword, t.operator, t.punctuation],
    color: "var(--editor-heading-marker)",
  },
  {
    tag: [t.atom, t.bool, t.number, t.string, t.regexp],
    color: "var(--editor-code)",
  },
  {
    tag: [t.link, t.url],
    color: "var(--editor-link)",
    textDecoration: "underline",
  },
  { tag: [t.strong], color: "var(--editor-emphasis)", fontWeight: "700" },
  { tag: [t.emphasis], color: "var(--editor-emphasis)", fontStyle: "italic" },
  {
    tag: [t.strikethrough],
    color: "var(--editor-muted-token)",
    textDecoration: "line-through",
  },
  {
    tag: [t.monospace],
    color: "var(--editor-code)",
    fontFamily: "var(--font-mono)",
  },
  { tag: [t.name, t.propertyName, t.labelName], color: "var(--text-primary)" },
  {
    tag: [t.invalid],
    color: "var(--danger)",
    textDecoration: "wavy underline",
  },
]);

/**
 * Live Preview plugin — hides heading `#` markers on non-active lines
 * and applies heading font sizes for a rich editing experience.
 */
function headingLivePreviewPlugin() {
  const headingRegex = /^(#{1,6})\s/;

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged
        ) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        const decorations: any[] = [];
        const doc = view.state.doc;
        const selection = view.state.selection;

        // Get the set of lines that have a cursor
        const activeLinesSet = new Set<number>();
        for (const range of selection.ranges) {
          const startLine = doc.lineAt(range.from).number;
          const endLine = doc.lineAt(range.to).number;
          for (let l = startLine; l <= endLine; l++) {
            activeLinesSet.add(l);
          }
        }

        for (let i = 1; i <= doc.lines; i++) {
          const line = doc.line(i);
          const match = headingRegex.exec(line.text);
          if (!match) continue;

          const level = match[1].length;
          const isActive = activeLinesSet.has(i);

          if (!isActive) {
            // Hide the `# ` prefix on non-active heading lines
            const markerEnd = line.from + match[0].length;
            decorations.push(
              Decoration.replace({
                widget: new (class extends WidgetType {
                  toDOM() {
                    const span = document.createElement("span");
                    span.className = "cm-heading-hidden-mark";
                    return span;
                  }
                })(),
              }).range(line.from, markerEnd),
            );
          }

          // Apply heading font size as a line decoration
          const sizes = ["1.6em", "1.4em", "1.2em", "1.1em", "1.05em", "1em"];
          const fontSize = sizes[level - 1] || "1em";
          decorations.push(
            Decoration.line({
              attributes: {
                style: `font-size: ${fontSize}; line-height: 1.4`,
                class: `cm-heading-${level}`,
              },
            }).range(line.from),
          );
        }

        return Decoration.set(decorations, true);
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
}

const INLINE_PHRASE_STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "being", "this", "that", "these", "those", "it", "its", "they", "them",
  "their", "you", "your", "we", "our", "i", "me", "my", "as", "if", "then",
  "also", "very", "just", "really", "about", "into", "over", "after", "before",
]);

interface ParsedListLine {
  lineNumber: number;
  from: number;
  to: number;
  indent: string;
  marker: string;
  hasChecklist: boolean;
  content: string;
}

interface SectionHeading {
  lineNumber: number;
  level: number;
  title: string;
}

interface ActiveListSectionContext {
  heading: SectionHeading;
  sectionStartLine: number;
  sectionEndLine: number;
  sectionContent: string;
  listItems: ParsedListLine[];
  activeList: ParsedListLine;
  listPrefix: string;
  anchorPos: number;
  anchorLine: number;
  replaceFrom: number;
  replaceTo: number;
  isPlaceholderLine: boolean;
}

const SECTION_HEADING_REGEX = /^(#{2,6})\s+(.+?)\s*$/;
const SECTION_LIST_ITEM_REGEX = /^(\s*)([-*+]\s+)(\[[ xX]\]\s+)?(.+?)\s*$/;
const SECTION_LIST_PLACEHOLDER_REGEX = /^(\s*)([-*+]\s+)(\[[ xX]\]\s*)?$/;
const SECTION_STOP_WORDS = new Set([
  ...INLINE_PHRASE_STOP_WORDS,
  "todo",
  "tasks",
  "notes",
  "items",
  "list",
  "section",
]);

const SECTION_GENERATION_SIMILARITY_FLOOR = 0.18;
const SECTION_PRIMARY_RELEVANCE_THRESHOLD = 0.5;
const SECTION_DISPLAY_CAP = 2;
const SECTION_FORCED_MINIMUM_RELEVANCE_FLOOR = 0.34;
const SECTION_SEMANTIC_DUPLICATE_OVERLAP = 0.72;
const SUGGESTION_STABILITY_WINDOW_MS = 2600;
const SUGGESTION_SIGNIFICANT_IMPROVEMENT_DELTA = 0.12;
const INTENT_SHIFT_COSINE_THRESHOLD = 0.5;
const INTENT_SHIFT_RESET_WINDOW_MS = 1800;
const SECTION_EXPLORATION_BOOST_WEIGHT = 0.15;
const CONFIDENCE_HIGH_SIMILARITY = 0.72;
const CONFIDENCE_MEDIUM_SIMILARITY = 0.56;
const SECTION_SUGGESTION_DEBUG =
  typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);

const SECTION_INTENT_FALLBACK_RULES: Array<{ pattern: RegExp; keywords: string[] }> = [
  {
    pattern: /\b(learn|study|reading|research|explore|practice|skills?)\b/i,
    keywords: [
      "learn",
      "learning",
      "guide",
      "basics",
      "fundamentals",
      "concept",
      "course",
      "practice",
      "tutorial",
      "skill",
      "skills",
    ],
  },
  {
    pattern: /\b(project|build|roadmap|planning|milestone|deliver)\b/i,
    keywords: ["project", "planning", "roadmap", "implementation", "architecture", "workflow"],
  },
  {
    pattern: /\b(career|work|job|interview)\b/i,
    keywords: ["career", "interview", "resume", "networking", "skills", "development"],
  },
  {
    pattern: /\b(finance|money|invest|budget)\b/i,
    keywords: ["finance", "budget", "investment", "savings", "tax", "planning"],
  },
  {
    pattern: /\b(health|fitness|wellness)\b/i,
    keywords: ["health", "fitness", "exercise", "sleep", "nutrition", "wellness"],
  },
];

interface SectionSuggestionPlan {
  suggestions: EnrichedSuggestion[];
  lowConfidencePaths: Set<string>;
  deferredMinimum: boolean;
  topSignalScore: number;
}

function normalizeSuggestionText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSectionText(value: string): string[] {
  return normalizeSuggestionText(value)
    .split(" ")
    .filter((token) => token.length > 2 && !SECTION_STOP_WORDS.has(token));
}

function tokenOverlapScore(source: string[], target: string[]): number {
  if (source.length === 0 || target.length === 0) return 0;
  const targetSet = new Set(target);
  const overlap = source.filter((token) => targetSet.has(token)).length;
  return overlap / Math.max(1, Math.min(source.length, target.length));
}

function buildRecencyWeightedTokenMap(items: ParsedListLine[]): Map<string, number> {
  const weights = new Map<string, number>();
  items.forEach((item, index) => {
    const decay = Math.max(0.5, 1 - index * 0.22);
    const tokens = tokenizeSectionText(item.content);
    for (const token of tokens) {
      const current = weights.get(token) || 0;
      if (decay > current) {
        weights.set(token, decay);
      }
    }
  });
  return weights;
}

function weightedTokenOverlapScore(
  weightedSourceTokens: Map<string, number>,
  targetTokens: string[],
): number {
  if (weightedSourceTokens.size === 0 || targetTokens.length === 0) return 0;
  const uniqueTarget = new Set(targetTokens);
  let overlap = 0;
  uniqueTarget.forEach((token) => {
    overlap += weightedSourceTokens.get(token) || 0;
  });
  return overlap / Math.max(1, Math.min(weightedSourceTokens.size, uniqueTarget.size));
}

function buildTokenFrequencyMap(value: string): Map<string, number> {
  const map = new Map<string, number>();
  const tokens = tokenizeSectionText(value);
  for (const token of tokens) {
    map.set(token, (map.get(token) || 0) + 1);
  }
  return map;
}

function cosineSimilarityFromTokenMaps(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  if (a.size === 0 || b.size === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [, value] of a) {
    normA += value * value;
  }
  for (const [, value] of b) {
    normB += value * value;
  }
  if (normA === 0 || normB === 0) return 0;

  for (const [token, value] of a) {
    const other = b.get(token);
    if (!other) continue;
    dot += value * other;
  }

  return dot / Math.sqrt(normA * normB);
}

function buildIntentContextSnapshot(
  doc: EditorState["doc"],
  cursorPos: number,
  sectionContext: ActiveListSectionContext | null,
): string {
  if (sectionContext) {
    const recentItems = sectionContext.listItems
      .filter((item) => item.lineNumber <= sectionContext.anchorLine)
      .sort((a, b) => b.lineNumber - a.lineNumber)
      .slice(0, 4)
      .map((item) => item.content)
      .join(" ");

    return [
      sectionContext.heading.title,
      recentItems,
      sectionContext.activeList.content,
      sectionContext.sectionContent,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const cursorLine = doc.lineAt(cursorPos).number;
  const startLine = Math.max(1, cursorLine - 2);
  const endLine = Math.min(doc.lines, cursorLine + 2);
  const lines: string[] = [];
  for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
    lines.push(doc.line(lineNumber).text);
  }
  return lines.join("\n");
}

function resolveSuggestionConfidence(
  similarity: number,
  forceLowConfidence = false,
): "high" | "medium" | "low" {
  if (forceLowConfidence) return "low";
  if (similarity >= CONFIDENCE_HIGH_SIMILARITY) return "high";
  if (similarity >= CONFIDENCE_MEDIUM_SIMILARITY) return "medium";
  return "low";
}

function extractSectionIntentFallbackKeywords(headingTitle: string): string[] {
  const matched = SECTION_INTENT_FALLBACK_RULES.filter((rule) =>
    rule.pattern.test(headingTitle),
  );
  if (matched.length === 0) return [];
  return [...new Set(matched.flatMap((rule) => rule.keywords))];
}

function keywordOverlapScore(candidateTokens: string[], keywords: string[]): number {
  if (candidateTokens.length === 0 || keywords.length === 0) return 0;
  const keywordSet = new Set(keywords);
  const overlap = candidateTokens.filter((token) => keywordSet.has(token)).length;
  return overlap / Math.max(1, Math.min(candidateTokens.length, keywords.length));
}

function normalizedTextOverlap(a: string, b: string): number {
  const tokensA = tokenizeSectionText(a);
  const tokensB = tokenizeSectionText(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  setA.forEach((token) => {
    if (setB.has(token)) intersection += 1;
  });
  return intersection / Math.max(1, Math.min(setA.size, setB.size));
}

function looksLikeMinorVariation(a: string, b: string): boolean {
  const normalizedA = normalizeSuggestionText(a);
  const normalizedB = normalizeSuggestionText(b);
  if (!normalizedA || !normalizedB) return false;
  if (normalizedA === normalizedB) return true;

  if (
    Math.min(normalizedA.length, normalizedB.length) >= 6 &&
    (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA))
  ) {
    return true;
  }

  return normalizedTextOverlap(normalizedA, normalizedB) >= SECTION_SEMANTIC_DUPLICATE_OVERLAP;
}

function parseListLine(
  lineText: string,
  lineNumber: number,
  from: number,
  to: number,
): ParsedListLine | null {
  const match = lineText.match(SECTION_LIST_ITEM_REGEX);
  if (!match) return null;

  return {
    lineNumber,
    from,
    to,
    indent: match[1] || "",
    marker: match[2] || "- ",
    hasChecklist: Boolean(match[3]),
    content: (match[4] || "").trim(),
  };
}

function findNearestHeading(
  doc: EditorState["doc"],
  cursorLineNumber: number,
): SectionHeading | null {
  for (let lineNumber = cursorLineNumber; lineNumber >= 1; lineNumber--) {
    const line = doc.line(lineNumber);
    const match = line.text.match(SECTION_HEADING_REGEX);
    if (!match) continue;

    return {
      lineNumber,
      level: match[1].length,
      title: (match[2] || "").trim(),
    };
  }

  return null;
}

function findSectionEndLine(
  doc: EditorState["doc"],
  headingLineNumber: number,
  headingLevel: number,
): number {
  for (let lineNumber = headingLineNumber + 1; lineNumber <= doc.lines; lineNumber++) {
    const line = doc.line(lineNumber);
    const match = line.text.match(SECTION_HEADING_REGEX);
    if (!match) continue;

    const level = match[1].length;
    if (level <= headingLevel) {
      return lineNumber - 1;
    }
  }

  return doc.lines;
}

function detectActiveListSectionContext(
  doc: EditorState["doc"],
  cursorPos: number,
): ActiveListSectionContext | null {
  const cursorLine = doc.lineAt(cursorPos);
  const cursorLineNumber = cursorLine.number;

  const heading = findNearestHeading(doc, cursorLineNumber);
  if (!heading) return null;

  const sectionStartLine = heading.lineNumber + 1;
  const sectionEndLine = findSectionEndLine(doc, heading.lineNumber, heading.level);
  if (sectionStartLine > sectionEndLine) return null;
  if (cursorLineNumber < sectionStartLine || cursorLineNumber > sectionEndLine) return null;

  const sectionLines: string[] = [];
  const listItems: ParsedListLine[] = [];

  for (let lineNumber = sectionStartLine; lineNumber <= sectionEndLine; lineNumber++) {
    const line = doc.line(lineNumber);
    sectionLines.push(line.text);
    const parsed = parseListLine(line.text, lineNumber, line.from, line.to);
    if (parsed) listItems.push(parsed);
  }

  if (listItems.length === 0) return null;

  let activeList = parseListLine(
    cursorLine.text,
    cursorLineNumber,
    cursorLine.from,
    cursorLine.to,
  );
  let listPrefix = "";
  let isPlaceholderLine = false;
  let replaceFrom = cursorLine.to;
  let replaceTo = cursorLine.to;

  if (activeList) {
    listPrefix = `${activeList.indent}${activeList.marker}${activeList.hasChecklist ? "[ ] " : ""}`;
  } else {
    const placeholder = cursorLine.text.match(SECTION_LIST_PLACEHOLDER_REGEX);

    if (placeholder) {
      const hasNearbyList = listItems.some(
        (item) => Math.abs(item.lineNumber - cursorLineNumber) <= 2,
      );
      if (!hasNearbyList) return null;

      activeList = {
        lineNumber: cursorLineNumber,
        from: cursorLine.from,
        to: cursorLine.to,
        indent: placeholder[1] || "",
        marker: placeholder[2] || "- ",
        hasChecklist: Boolean(placeholder[3]),
        content: "",
      };
      listPrefix = `${activeList.indent}${activeList.marker}${activeList.hasChecklist ? "[ ] " : ""}`;
      isPlaceholderLine = true;
      replaceFrom = cursorLine.from;
      replaceTo = cursorLine.to;
    } else if (cursorLine.text.trim() === "") {
      const previousLineNumber = cursorLineNumber - 1;
      if (previousLineNumber < sectionStartLine) return null;

      const previousLine = doc.line(previousLineNumber);
      const previousList = parseListLine(
        previousLine.text,
        previousLineNumber,
        previousLine.from,
        previousLine.to,
      );
      if (!previousList || cursorLineNumber - previousList.lineNumber > 1) return null;

      activeList = previousList;
      listPrefix = `${previousList.indent}${previousList.marker}${previousList.hasChecklist ? "[ ] " : ""}`;
      isPlaceholderLine = true;
      replaceFrom = cursorLine.from;
      replaceTo = cursorLine.to;
    } else {
      return null;
    }
  }

  if (!activeList) return null;

  return {
    heading,
    sectionStartLine,
    sectionEndLine,
    sectionContent: sectionLines.join("\n"),
    listItems,
    activeList,
    listPrefix,
    anchorPos: isPlaceholderLine ? replaceTo : activeList.to,
    anchorLine: isPlaceholderLine ? cursorLineNumber : activeList.lineNumber,
    replaceFrom,
    replaceTo,
    isPlaceholderLine,
  };
}

function buildSectionScopedSuggestions(
  context: ActiveListSectionContext,
  candidates: EnrichedSuggestion[],
  debugSource = "section-primary",
  allowForcedMinimum = false,
  resetBias = false,
): SectionSuggestionPlan {
  if (candidates.length === 0) {
    return {
      suggestions: [],
      lowConfidencePaths: new Set(),
      deferredMinimum: false,
      topSignalScore: 0,
    };
  }

  const recentListItems = [...context.listItems]
    .filter((item) => item.lineNumber <= context.anchorLine)
    .sort((a, b) => b.lineNumber - a.lineNumber)
    .slice(0, 3);
  const recentTokenWeights = buildRecencyWeightedTokenMap(recentListItems);

  const sectionIntentTokens = tokenizeSectionText(context.heading.title);
  const sectionContextTokens = tokenizeSectionText(context.sectionContent);
  const fallbackIntentKeywords = extractSectionIntentFallbackKeywords(
    context.heading.title,
  );

  const existingItems = new Set(
    context.listItems
      .map((item) => normalizeSuggestionText(item.content))
      .filter(Boolean),
  );

  const generationCandidates = candidates
    .filter((candidate, index, source) =>
      source.findIndex((item) => item.path === candidate.path) === index,
    )
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 30);

  const afterSimilarityFilter = generationCandidates.filter(
    (candidate) => candidate.similarity >= SECTION_GENERATION_SIMILARITY_FLOOR,
  );

  const withSectionSignals = afterSimilarityFilter
    .map((candidate) => {
      const candidateTokens = tokenizeSectionText(
        `${candidate.title} ${candidate.sharedConcepts.join(" ")}`,
      );
      const recentListOverlap = weightedTokenOverlapScore(
        recentTokenWeights,
        candidateTokens,
      );
      const intentOverlap = tokenOverlapScore(sectionIntentTokens, candidateTokens);
      const contextOverlap = tokenOverlapScore(sectionContextTokens, candidateTokens);
      const keywordOverlap = keywordOverlapScore(
        candidateTokens,
        fallbackIntentKeywords,
      );
      const hasSectionSignal =
        recentListOverlap > 0 || intentOverlap > 0 || contextOverlap > 0 || keywordOverlap > 0;

      const recencyRelevanceWeight = resetBias ? 0.06 : 0.2;
      const contextRelevanceWeight = resetBias ? 0.15 : 0.11;
      const intentRelevanceWeight = resetBias ? 0.11 : 0.08;
      const keywordRelevanceWeight = resetBias ? 0.07 : 0.05;

      const relevance =
        candidate.similarity +
        recentListOverlap * recencyRelevanceWeight +
        contextOverlap * contextRelevanceWeight +
        intentOverlap * intentRelevanceWeight +
        keywordOverlap * keywordRelevanceWeight;

      const fallbackRelevance = resetBias
        ? contextOverlap * 0.38 +
          intentOverlap * 0.28 +
          keywordOverlap * 0.2 +
          candidate.similarity * 0.14
        : recentListOverlap * 0.52 +
          contextOverlap * 0.24 +
          intentOverlap * 0.12 +
          keywordOverlap * 0.08 +
          candidate.similarity * 0.04;

      // Fallback exploration should only nudge rank order, never dominate strong matches.
      const explorationBoost = Math.max(0, 1 - recentListOverlap) * SECTION_EXPLORATION_BOOST_WEIGHT;

      return {
        candidate,
        relevance,
        fallbackRelevance,
        explorationBoost,
        recentListOverlap,
        intentOverlap,
        contextOverlap,
        keywordOverlap,
        hasSectionSignal,
      };
    })
    .filter((entry) => entry.hasSectionSignal);

  const existingItemTexts = context.listItems
    .map((item) => item.content)
    .filter(Boolean);

  const seenTitles: string[] = [];
  const afterDedup = withSectionSignals.filter((entry) => {
    const normalizedTitle = normalizeSuggestionText(entry.candidate.title);
    if (!normalizedTitle) return false;
    if (existingItems.has(normalizedTitle)) return false;
    if (existingItemTexts.some((itemText) => looksLikeMinorVariation(entry.candidate.title, itemText))) {
      return false;
    }
    if (seenTitles.some((seen) => looksLikeMinorVariation(seen, entry.candidate.title))) {
      return false;
    }
    seenTitles.push(entry.candidate.title);
    return true;
  });

  const primary = afterDedup
    .filter((entry) => entry.relevance >= SECTION_PRIMARY_RELEVANCE_THRESHOLD)
    .sort((a, b) => b.relevance - a.relevance);

  const lowConfidencePaths = new Set<string>();
  let finalEntries = primary.slice(0, SECTION_DISPLAY_CAP);

  // Fallback mode: keep intent/category relevance but allow lower confidence.
  if (finalEntries.length === 0) {
    const fallbackRanked = afterDedup
      .sort((a, b) => {
        if (!resetBias) {
          if (b.recentListOverlap !== a.recentListOverlap) {
            return b.recentListOverlap - a.recentListOverlap;
          }
          if (b.contextOverlap !== a.contextOverlap) {
            return b.contextOverlap - a.contextOverlap;
          }
          if (b.intentOverlap !== a.intentOverlap) {
            return b.intentOverlap - a.intentOverlap;
          }
          if (b.keywordOverlap !== a.keywordOverlap) {
            return b.keywordOverlap - a.keywordOverlap;
          }
        }
        const boostA = a.fallbackRelevance + a.explorationBoost * 0.35;
        const boostB = b.fallbackRelevance + b.explorationBoost * 0.35;
        if (boostB !== boostA) return boostB - boostA;
        if (b.relevance !== a.relevance) return b.relevance - a.relevance;
        return b.candidate.similarity - a.candidate.similarity;
      })
      .slice(0, SECTION_DISPLAY_CAP);

    if (fallbackRanked.length > 0) {
      finalEntries = fallbackRanked;
      fallbackRanked.forEach((entry) => lowConfidencePaths.add(entry.candidate.path));
    }
  }

  let deferredMinimum = false;

  // Minimum guarantee: only force after a retry interaction and quality floor pass.
  if (finalEntries.length === 0) {
    const forcedCandidate = afterDedup
      .sort(
        (a, b) =>
          b.fallbackRelevance + b.explorationBoost * 0.35 -
          (a.fallbackRelevance + a.explorationBoost * 0.35),
      )[0];

    if (
      forcedCandidate &&
      forcedCandidate.fallbackRelevance >= SECTION_FORCED_MINIMUM_RELEVANCE_FLOOR
    ) {
      if (allowForcedMinimum) {
        const forced = forcedCandidate.candidate;
        finalEntries = [
          {
            candidate: forced,
            relevance: forced.similarity,
            fallbackRelevance: forcedCandidate.fallbackRelevance,
            explorationBoost: forcedCandidate.explorationBoost,
            recentListOverlap: forcedCandidate.recentListOverlap,
            intentOverlap: forcedCandidate.intentOverlap,
            contextOverlap: forcedCandidate.contextOverlap,
            keywordOverlap: forcedCandidate.keywordOverlap,
            hasSectionSignal: forcedCandidate.hasSectionSignal,
          },
        ];
        lowConfidencePaths.add(forced.path);
      } else {
        deferredMinimum = true;
      }
    } else if (afterDedup.length > 0) {
      deferredMinimum = true;
    }
  }

  const suggestions = finalEntries
    .slice(0, SECTION_DISPLAY_CAP)
    .map((entry) => entry.candidate);
  const topSignalScore = finalEntries[0]
    ? Math.max(
      finalEntries[0].relevance,
      finalEntries[0].fallbackRelevance + finalEntries[0].explorationBoost * 0.35,
    )
    : 0;

  if (SECTION_SUGGESTION_DEBUG) {
    console.debug("[section-suggestions]", {
      source: debugSource,
      heading: context.heading.title,
      totalCandidates: generationCandidates.length,
      afterSimilarityFilter: afterSimilarityFilter.length,
      afterSectionFilter: withSectionSignals.length,
      afterDeduplication: afterDedup.length,
      finalDisplayed: suggestions.length,
      usedFallback: primary.length === 0 && suggestions.length > 0,
      forcedMinimum:
        allowForcedMinimum &&
        primary.length === 0 &&
        suggestions.length > 0 &&
        lowConfidencePaths.size > 0,
      deferredMinimum,
      allowForcedMinimum,
      resetBias,
    });
  }

  return { suggestions, lowConfidencePaths, deferredMinimum, topSignalScore };
}



function wireSuggestionAction(
  button: HTMLButtonElement,
  callback: () => void,
): void {
  button.tabIndex = -1;
  button.setAttribute("contenteditable", "false");
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    callback();
  });
}



class EndOfNoteSuggestionsWidget extends WidgetType {
  private readonly key: string;

  constructor(
    private readonly suggestions: EnrichedSuggestion[],
    private readonly nextStepSuggestions: EnrichedSuggestion[],
    private readonly onAccept: (path: string) => void,
    private readonly isClosing: boolean = false,
  ) {
    super();
    this.key = nextStepSuggestions.map(
      (suggestion) => `${suggestion.path}:${Math.round(suggestion.similarity * 100)}`,
    ).join("|") + (isClosing ? ":closing" : "");
  }

  eq(other: EndOfNoteSuggestionsWidget): boolean {
    return this.key === other.key;
  }

  toDOM(): HTMLElement {
    const root = document.createElement("div");
    root.className = "editor-virtual-end-suggestions" + (this.isClosing ? " editor-virtual-end-suggestions--closing" : "");
    root.setAttribute("contenteditable", "false");
    root.style.userSelect = "none";
    root.style.caretColor = "transparent";
    root.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });

    if (this.nextStepSuggestions.length > 0) {
      const heading = document.createElement("div");
      heading.className = "editor-virtual-end-heading editor-virtual-end-heading--next-step";
      heading.textContent = "You may be moving toward...";
      root.appendChild(heading);

      for (const suggestion of this.nextStepSuggestions) {
        const line = document.createElement("div");
        line.className = "editor-virtual-end-line";

        const noteButton = document.createElement("button");
        noteButton.type = "button";
        noteButton.className = "editor-virtual-end-note editor-virtual-end-note--next-step";
        noteButton.textContent = `-> [[${suggestion.title}]]`;
        wireSuggestionAction(noteButton, () => this.onAccept(suggestion.path));
        line.appendChild(noteButton);
        root.appendChild(line);
      }
    }

    return root;
  }

  updateDOM(dom: HTMLElement): boolean {
    const expectedClass = "editor-virtual-end-suggestions" + (this.isClosing ? " editor-virtual-end-suggestions--closing" : "");
    if (dom.className !== expectedClass) {
      dom.className = expectedClass;
    }

    // Smoothly update children in place to prevent animation re-triggers
    dom.innerHTML = "";

    if (this.nextStepSuggestions.length > 0) {
      const heading = document.createElement("div");
      heading.className = "editor-virtual-end-heading editor-virtual-end-heading--next-step";
      heading.textContent = "You may be moving toward...";
      dom.appendChild(heading);

      for (const suggestion of this.nextStepSuggestions) {
        const line = document.createElement("div");
        line.className = "editor-virtual-end-line";

        const noteButton = document.createElement("button");
        noteButton.type = "button";
        noteButton.className = "editor-virtual-end-note editor-virtual-end-note--next-step";
        noteButton.textContent = `-> [[${suggestion.title}]]`;
        wireSuggestionAction(noteButton, () => this.onAccept(suggestion.path));
        line.appendChild(noteButton);
        dom.appendChild(line);
      }
    }

    return true;
  }

  ignoreEvent(): boolean {
    return true;
  }
}



interface SuggestionContentStateFieldOptions {
  endSuggestions: EnrichedSuggestion[];
  nextStepSuggestions: EnrichedSuggestion[];
  showEndSuggestions: boolean;
  isActivelyTyping: boolean;
  isClosing?: boolean;
  onEndAccept: (path: string) => void;
  getStableEnd: () => { paths: string[]; topSimilarity: number; until: number } | null;
  setStableEnd: (val: { paths: string[]; topSimilarity: number; until: number } | null) => void;
  getPreviousContextVector: () => Map<string, number> | null;
  setPreviousContextVector: (val: Map<string, number> | null) => void;
  getIntentShiftUntil: () => number;
  setIntentShiftUntil: (val: number) => void;
}

function buildSuggestionsDecorations(
  state: EditorState,
  options: SuggestionContentStateFieldOptions,
): DecorationSet {
  const decorations: any[] = [];
  const doc = state.doc;
  const cursorPos = state.selection.main.head;
  const cursorLine = doc.lineAt(cursorPos).number;
  const now = Date.now();
  const sectionContext = detectActiveListSectionContext(doc, cursorPos);
  const contextSnapshot = buildIntentContextSnapshot(
    doc,
    cursorPos,
    sectionContext,
  );
  const currentContextVector = buildTokenFrequencyMap(contextSnapshot);
  
  const intentShiftUntil = options.getIntentShiftUntil();
  let resetBiasForThisPass = now < intentShiftUntil;

  const previousContextVector = options.getPreviousContextVector();
  if (previousContextVector && currentContextVector.size > 0) {
    const contextSimilarity = cosineSimilarityFromTokenMaps(
      previousContextVector,
      currentContextVector,
    );
    if (contextSimilarity < INTENT_SHIFT_COSINE_THRESHOLD) {
      const nextIntentShiftUntil = now + INTENT_SHIFT_RESET_WINDOW_MS;
      options.setIntentShiftUntil(nextIntentShiftUntil);
      resetBiasForThisPass = true;
      options.setStableEnd(null);
    }
  }

  if (currentContextVector.size > 0) {
    options.setPreviousContextVector(currentContextVector);
  }

  if (options.showEndSuggestions && options.endSuggestions.length > 0) {
    const nearEndStartLine = Math.max(1, doc.lines - 2);
    const editingEndLocation =
      options.isActivelyTyping && cursorLine >= nearEndStartLine;

    if (!editingEndLocation) {
      let endSuggestions = options.endSuggestions;
      const stableEnd = options.getStableEnd();
      if (stableEnd && now < stableEnd.until) {
        const topIncomingSimilarity = endSuggestions[0]?.similarity ?? 0;
        const shouldKeepStableSuggestions =
          !resetBiasForThisPass &&
          topIncomingSimilarity <=
          stableEnd.topSimilarity +
            SUGGESTION_SIGNIFICANT_IMPROVEMENT_DELTA;

        if (shouldKeepStableSuggestions) {
          const stableSuggestions = stableEnd.paths
            .map((path) =>
              options.endSuggestions.find((suggestion) => suggestion.path === path),
            )
            .filter((suggestion): suggestion is EnrichedSuggestion => Boolean(suggestion));
          if (stableSuggestions.length > 0) {
            endSuggestions = stableSuggestions;
          }
        }
      }

      const currentStableEnd = options.getStableEnd();
      if (!currentStableEnd || now >= currentStableEnd.until) {
        options.setStableEnd({
          paths: endSuggestions.map((suggestion) => suggestion.path),
          topSimilarity: endSuggestions[0]?.similarity ?? 0,
          until: now + SUGGESTION_STABILITY_WINDOW_MS,
        });
      }

      decorations.push(
        Decoration.widget({
          widget: new EndOfNoteSuggestionsWidget(
            endSuggestions,
            options.nextStepSuggestions,
            options.onEndAccept,
            options.isClosing || false,
          ),
          side: 1,
          block: true,
        }).range(doc.length),
      );
    }
  }

  if (
    options.showEndSuggestions &&
    options.endSuggestions.length === 0 &&
    options.nextStepSuggestions.length > 0
  ) {
    decorations.push(
      Decoration.widget({
        widget: new EndOfNoteSuggestionsWidget(
          [],
          options.nextStepSuggestions,
          options.onEndAccept,
          options.isClosing || false,
        ),
        side: 1,
        block: true,
      }).range(doc.length),
    );
  }

  if (decorations.length === 0) return Decoration.none;
  return Decoration.set(decorations, true);
}

function suggestionContentStateField(options: SuggestionContentStateFieldOptions) {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildSuggestionsDecorations(state, options);
    },
    update(decorations, tr) {
      if (tr.docChanged || tr.selection) {
        return buildSuggestionsDecorations(tr.state, options);
      }
      return decorations.map(tr.changes);
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}
function cleanInlineAIResponse(text: string): string {
  if (!text) return "";
  let cleaned = text.trim();

  // Strip leading/trailing markdown code block markers if the model wrapped the response
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    if (firstNewline !== -1) {
      cleaned = cleaned.substring(firstNewline + 1);
    } else {
      cleaned = cleaned.substring(3);
    }
    
    // Strip trailing code block marker if present
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
  }

  // Strip leading and trailing quotes if the model wrapped the response in quotes
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.substring(1, cleaned.length - 1);
  } else if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
    cleaned = cleaned.substring(1, cleaned.length - 1);
  }

  return cleaned.trim();
}

async function executeInlineAIOperation(
  text: string,
  operation: "rewrite" | "expand" | "simplify" | "explain" | "custom",
  customInstruction?: string,
  fullNoteContent?: string,
  noteTitle?: string
): Promise<string> {
  const config = loadAIConfig();
  if (!config) {
    throw new Error("No API key configured. Please add one in AI Settings.");
  }

  let prompt = "";
  if (operation === "rewrite") {
    prompt = `You are a professional writing assistant. Rewrite the exact text provided below to make it more polished, clear, and professional, while keeping the meaning identical.
The original text is in Markdown format. You MUST preserve the exact markdown formatting, headings, bold/italic markup, bullet points, lists, task list checkboxes (e.g., - [ ], - [x]), blockquotes, tables, links, and indentation of the original text.
Do NOT omit any list syntax or surrounding structure. If the original text starts with a bullet point or checklist, the rewritten text MUST start with the exact same prefix.
Return ONLY the rewritten markdown text. Do not add any introductory or concluding text, do not wrap the response in quotation marks, and do not use any emojis.

Original text to rewrite:
${text}`;
  } else if (operation === "expand") {
    prompt = `You are a professional writing assistant. Expand the exact text provided below by adding useful detail and depth, while maintaining the original tone and intent.
The original text is in Markdown format. You MUST preserve the exact markdown formatting, headings, bold/italic markup, bullet points, lists, task list checkboxes (e.g., - [ ], - [x]), blockquotes, tables, links, and indentation of the original text.
Do NOT omit any list syntax or surrounding structure. If the original text starts with a bullet point or checklist, the expanded text MUST start with the exact same prefix.
Return ONLY the expanded markdown text. Do not add any introductory or concluding text, do not wrap the response in quotation marks, and do not use any emojis.

Original text to expand:
${text}`;
  } else if (operation === "simplify") {
    prompt = `You are a professional writing assistant. Simplify the exact text provided below to make it extremely clear, simple, and direct, while keeping the core meaning identical.
The original text is in Markdown format. You MUST preserve the exact markdown formatting, headings, bold/italic markup, bullet points, lists, task list checkboxes (e.g., - [ ], - [x]), blockquotes, tables, links, and indentation of the original text.
Do NOT omit any list syntax or surrounding structure. If the original text starts with a bullet point or checklist, the simplified text MUST start with the exact same prefix.
Return ONLY the simplified markdown text. Do not add any introductory or concluding text, do not wrap the response in quotation marks, and do not use any emojis.

Original text to simplify:
${text}`;
  } else if (operation === "explain") {
    prompt = `You are a professional writing assistant. Explain the key concept, meaning, and context of the following highlighted text in a clear, concise paragraph. Return ONLY the explanation paragraph, with no introduction, surrounding quotes, or emojis:\n\n"${text}"`;
  } else if (operation === "custom") {
    prompt = `You are an intelligent, precise AI writing assistant inside a local-first markdown editor. 
You have been asked to perform the following instruction on the SELECTED TEXT: "${customInstruction}".

To help you perform this task accurately and in a highly context-aware manner, here is the context of the ACTIVE NOTE:
Note Title: ${noteTitle || "Untitled"}
Full Note Content:
"""
${fullNoteContent || text}
"""

Here is the SPECIFIC SELECTED TEXT you must modify:
"""
${text}
"""

INSTRUCTIONS:
1. Apply the instruction ("${customInstruction}") to the SELECTED TEXT appropriately.
2. Use the FULL NOTE CONTENT and Title as context to intelligently fill in details, resolve references, or deduce relevant information. For example, if asked to fill in review sections or lists, pull relevant events, tasks, and accomplishments from the rest of the note. Do not literally insert the raw instruction text into the blank spaces; instead, fill them with meaningful, contextual content.
3. You MUST preserve the exact markdown formatting, headings, bold/italic markup, bullet points, lists, task list checkboxes (e.g., - [ ], - [x]), blockquotes, tables, links, and indentation of the original selected text as much as possible.
4. Return ONLY the modified version of the SELECTED TEXT. Do not add any introductory or concluding text, do not wrap the response in quotation marks, and do not use any emojis.`;
  }

  const baseUrl = getBaseUrl(config);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: getProviderHeaders(config),
    body: JSON.stringify({
      model: config.modelId,
      max_tokens: 4096,
      temperature: 0.3,
      messages: [
        { role: "system", content: "You are a precise writing assistant inside a local-first markdown editor. You respond strictly with the requested text in the exact same format (preserving list styles, indentation, headings, and markdown markup). Do not use emojis, no intro, no wrap, no filler." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(await parseProviderError(response));
  }

  const data = await response.json();
  const result = data.choices?.[0]?.message?.content?.trim();
  if (!result) {
    throw new Error("Empty response from AI.");
  }
  return cleanInlineAIResponse(result);
}

export function Editor({
  tabs,
  activeTabId,
  content,
  viewMode,
  availableNotes,
  specialContent,
  onAdjustFontSize,
  onTabSelect,
  onTabClose,
  onContentChange,
  onViewModeChange,
  onLinkClick,
  onGetNoteContent,
  onImagePaste,
  suggestions,
  nextStepSuggestions,
  onAcceptSuggestion,
  onRejectSuggestion,
  onOpenNote,
  annotation,
  showInsight,
  onToggleInsight,
  theme,
  onCollabOperations,
  onCursorChange,
  remoteCursors,
  localClientId,
  onEditorViewReady,
  getViewState,
  onViewStateChange,
  readOnly = false,
  onGenerateInsight,
  isGeneratingInsight = false,
}: EditorProps) {
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activePath = activeTab?.path;

  const onViewStateChangeRef = useRef(onViewStateChange);
  useEffect(() => {
    onViewStateChangeRef.current = onViewStateChange;
  }, [onViewStateChange]);

  const getViewStateRef = useRef(getViewState);
  useEffect(() => {
    getViewStateRef.current = getViewState;
  }, [getViewState]);

  const activePathRef = useRef(activePath);
  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);

  const editorRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const viewRef = useRef<EditorView | null>(null);
  const contentRef = useRef(content);

  // Tracks the timestamp of the last local (user) edit. Used by the content
  // sync effect to avoid replacing the CM document with stale debounced
  // content while the user is actively typing.
  const lastLocalEditTsRef = useRef<number>(0);
  const [internalShowInsight, setInternalShowInsight] = useState(false);
  const isInsightVisible = showInsight !== undefined ? showInsight : internalShowInsight;
  const toggleInsight = (val: boolean) => {
    if (onToggleInsight) onToggleInsight(val);
    setInternalShowInsight(val);
  };
  const wheelRemainderRef = useRef(0);
  const suggestionContentCompartmentRef = useRef(new Compartment());
  const typingPauseTimerRef = useRef<number | null>(null);
  const flowTriggerDelayTimerRef = useRef<number | null>(null);
  const flowTriggerWindowTimerRef = useRef<number | null>(null);
  const sectionPauseTimerRef = useRef<number | null>(null);
  const sectionEnterTriggerTimerRef = useRef<number | null>(null);


  // Refs for collaboration callbacks -- avoids stale closures in the CodeMirror
  // update listener which is created once per tab and never re-created when
  // the collab space becomes active asynchronously.
  const onContentChangeRef = useRef(onContentChange);
  const onCollabOperationsRef = useRef(onCollabOperations);
  const onCursorChangeRef = useRef(onCursorChange);
  const localClientIdRef = useRef(localClientId);

  // Keep callback refs in sync on every render
  useEffect(() => {
    onContentChangeRef.current = onContentChange;
    onCollabOperationsRef.current = onCollabOperations;
    onCursorChangeRef.current = onCursorChange;
    localClientIdRef.current = localClientId;
  });

  const [editorWidth, setEditorWidth] = useState(50); // percentage
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [editorMountTick, setEditorMountTick] = useState(0);
  // isActivelyTyping is stored as a ref to avoid re-rendering the entire
  // Editor component on every single keystroke. We only promote to state
  // when the value *changes* (true->false or false->true) so that derived
  // UI (suggestion visibility) updates correctly without per-keystroke renders.
  const isActivelyTypingRef = useRef(false);
  const [isActivelyTyping, setIsActivelyTyping] = useState(false);
  const [isSuggestionIdle, setIsSuggestionIdle] = useState(false);
  const [isSectionPauseReady, setIsSectionPauseReady] = useState(false);
  const [hasSectionEnterTrigger, setHasSectionEnterTrigger] = useState(false);
  const [, setSectionRetryPending] = useState(false);
  const [allowForcedSectionMinimum, setAllowForcedSectionMinimum] = useState(false);
  const [hasFlowTrigger, setHasFlowTrigger] = useState(false);
  const [isNearNoteEnd, setIsNearNoteEnd] = useState(false);

  // Smoothly animated suggestions closing states
  const [renderedNextStepSuggestions, setRenderedNextStepSuggestions] = useState<EnrichedSuggestion[]>([]);
  const [renderedShowEndSuggestions, setRenderedShowEndSuggestions] = useState(false);
  const [isClosingSuggestions, setIsClosingSuggestions] = useState(false);
  const closingTimeoutRef = useRef<number | null>(null);

  // Persistent refs for stable suggestions and context shifts
  const stableEndRef = useRef<{ paths: string[]; topSimilarity: number; until: number } | null>(null);
  const previousContextVectorRef = useRef<Map<string, number> | null>(null);
  const intentShiftUntilRef = useRef<number>(0);

  const [imageLightbox, setImageLightbox] = useState<{
    src: string;
    alt: string;
  } | null>(null);

  const isSpecialTab = !!specialContent;

  const readVimModeSetting = useCallback((): boolean => {
    try {
      const saved = localStorage.getItem("openobsidian-settings");
      if (!saved) return false;
      const parsed = JSON.parse(saved) as { vimMode?: boolean };
      return !!parsed.vimMode;
    } catch {
      return false;
    }
  }, []);

  const [selectionRange, setSelectionRange] = useState<{ rect: DOMRect; text: string; from: number; to: number } | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explanationCoords, setExplanationCoords] = useState<{ x: number; y: number } | null>(null);
  const [isInlineQuerying, setIsInlineQuerying] = useState(false);
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [customPromptText, setCustomPromptText] = useState("");
  const [isInputFocused, setIsInputFocused] = useState(false);

  const handleSelectionChange = useCallback(() => {
    if (isSpecialTab) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      if (isInputFocused) return;
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.closest(".inline-ai-toolbar") || activeEl.classList.contains("inline-ai-prompt-input"))) {
        return;
      }
      // Only call setState if we actually have a value to clear -- avoids
      // re-rendering on every keystroke when there's no text selection.
      setSelectionRange((prev) => prev === null ? prev : null);
      return;
    }

    try {
      const range = sel.getRangeAt(0);
      const isInsideEditor = editorRef.current?.contains(range.commonAncestorContainer) || previewRef.current?.contains(range.commonAncestorContainer);
      if (!isInsideEditor) {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.closest(".inline-ai-toolbar") || activeEl.classList.contains("inline-ai-prompt-input"))) {
          return;
        }
        setSelectionRange(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      const view = viewRef.current;

      let from = 0;
      let to = 0;

      if (view) {
        if (editorRef.current?.contains(range.commonAncestorContainer)) {
          const cmFrom = view.state.selection.main.from;
          const cmTo = view.state.selection.main.to;
          if (cmFrom !== cmTo) {
            from = cmFrom;
            to = cmTo;
          } else {
            try {
              from = view.posAtDOM(range.startContainer, range.startOffset);
              to = view.posAtDOM(range.endContainer, range.endOffset);
            } catch (e) {
              from = cmFrom;
              to = cmTo;
            }
          }

          // Safe fallback: if we got collapsed boundaries but the selection is not empty, find it via substring index
          const selectedText = sel.toString().trim();
          if (from === to && selectedText) {
            const docString = view.state.doc.toString();
            const index = docString.indexOf(selectedText);
            if (index !== -1) {
              from = index;
              to = index + selectedText.length;
            }
          }
        } else if (previewRef.current?.contains(range.commonAncestorContainer)) {
          const selectedText = sel.toString().trim();
          const docString = view.state.doc.toString();
          const index = docString.indexOf(selectedText);
          if (index !== -1) {
            from = index;
            to = index + selectedText.length;
          } else {
            from = view.state.selection.main.from;
            to = view.state.selection.main.to;
          }
        }
      }

      setSelectionRange({
        rect,
        text: sel.toString(),
        from,
        to
      });
    } catch (e) {
      // Ignore transient selection range errors
    }
  }, [isSpecialTab, isInputFocused]);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [handleSelectionChange]);

  const handleInlineAction = async (
    operation: "rewrite" | "expand" | "simplify" | "explain" | "custom",
    customInstruction?: string
  ) => {
    if (!selectionRange) return;
    const { text } = selectionRange;
    
    setIsInlineQuerying(true);
    setExplanation(null);
    setExplanationCoords(null);

    try {
      const activeTab = tabs.find((t) => t.id === activeTabId);
      const noteTitle = activeTab?.name || activeTab?.path?.split("/").pop()?.replace(".md", "") || "";
      const result = await executeInlineAIOperation(
        text,
        operation,
        customInstruction,
        content || "",
        noteTitle
      );
      if (operation === "explain") {
        setExplanation(result);
        setExplanationCoords({
          x: selectionRange.rect.left + window.scrollX,
          y: selectionRange.rect.bottom + window.scrollY + 8
        });
      } else {
        const view = viewRef.current;
        if (view) {
          view.dispatch({
            changes: { from: selectionRange.from, to: selectionRange.to, insert: result },
            selection: { anchor: selectionRange.from + result.length }
          });
        } else {
          // If in preview or fallback mode, copy rewritten text to clipboard
          await navigator.clipboard.writeText(result);
          alert("Rewritten text copied to clipboard (editor view not focused).");
        }
        window.getSelection()?.removeAllRanges();
        setSelectionRange(null);
        setShowPromptInput(false);
        setCustomPromptText("");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Inline AI operation failed.");
    } finally {
      setIsInlineQuerying(false);
    }
  };

  const activeSuggestions = useMemo(() => suggestions || [], [suggestions]);
  const activeNextStepSuggestions = useMemo(
    () => nextStepSuggestions || [],
    [nextStepSuggestions],
  );
  const endOfNoteSuggestions = useMemo(() => {
    const broaderPool = activeSuggestions
      .filter((suggestion) => suggestion.group === "broader")
      .sort((a, b) => b.similarity - a.similarity);
    const primary = broaderPool
      .filter((suggestion) => suggestion.similarity >= 0.4)
      .slice(0, 3);
    if (primary.length > 0) return primary;
    return broaderPool.slice(0, Math.min(1, broaderPool.length));
  }, [activeSuggestions]);
  const nextStepEndSuggestions = useMemo(() => {
    const docText = content || "";
    return activeNextStepSuggestions
      .filter((suggestion) => {
        const titleEscaped = suggestion.title.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
        const regex = new RegExp(`\\[\\[${titleEscaped}(\\|[^\\]]+)?\\]\\]`, "i");
        return !regex.test(docText);
      })
      .filter((suggestion) => suggestion.similarity >= 0.35)
      .slice(0, 3);
  }, [activeNextStepSuggestions, content]);
  const showEndSuggestionContent =
    !isSpecialTab &&
    (activeSuggestions.length > 0 || nextStepEndSuggestions.length > 0) &&
    !isActivelyTyping &&
    (isSuggestionIdle || isNearNoteEnd || hasFlowTrigger);

  const markActiveTyping = useCallback(() => {
    // Update the ref synchronously (no render) on every keystroke.
    // Only promote to state when the value actually *transitions*.
    if (!isActivelyTypingRef.current) {
      isActivelyTypingRef.current = true;
      setIsActivelyTyping(true);
    }
    if (typingPauseTimerRef.current) {
      window.clearTimeout(typingPauseTimerRef.current);
    }
    typingPauseTimerRef.current = window.setTimeout(() => {
      isActivelyTypingRef.current = false;
      setIsActivelyTyping(false);
      typingPauseTimerRef.current = null;
    }, 750);
  }, []);

  const markFlowTrigger = useCallback(() => {
    setHasFlowTrigger(false);
    if (flowTriggerDelayTimerRef.current) {
      window.clearTimeout(flowTriggerDelayTimerRef.current);
      flowTriggerDelayTimerRef.current = null;
    }
    if (flowTriggerWindowTimerRef.current) {
      window.clearTimeout(flowTriggerWindowTimerRef.current);
      flowTriggerWindowTimerRef.current = null;
    }

    flowTriggerDelayTimerRef.current = window.setTimeout(() => {
      setHasFlowTrigger(true);
      flowTriggerDelayTimerRef.current = null;

      flowTriggerWindowTimerRef.current = window.setTimeout(() => {
        setHasFlowTrigger(false);
        flowTriggerWindowTimerRef.current = null;
      }, 1600);
    }, 190);
  }, []);

  const markSectionPauseReady = useCallback(() => {
    setIsSectionPauseReady(false);
    if (sectionPauseTimerRef.current) {
      window.clearTimeout(sectionPauseTimerRef.current);
      sectionPauseTimerRef.current = null;
    }

    sectionPauseTimerRef.current = window.setTimeout(() => {
      setIsSectionPauseReady(true);
      sectionPauseTimerRef.current = null;
    }, 380);
  }, []);

  const markSectionEnterTrigger = useCallback(() => {
    setHasSectionEnterTrigger(true);
    if (sectionEnterTriggerTimerRef.current) {
      window.clearTimeout(sectionEnterTriggerTimerRef.current);
    }
    sectionEnterTriggerTimerRef.current = window.setTimeout(() => {
      setHasSectionEnterTrigger(false);
      sectionEnterTriggerTimerRef.current = null;
    }, 900);
  }, []);

  const didCompleteSentenceOrParagraph = useCallback((update: ViewUpdate): boolean => {
    let triggered = false;
    update.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
      const text = inserted.toString();
      if (text.includes(".") || text.includes("!") || text.includes("?") || text.includes("\n")) {
        triggered = true;
      }
    });
    return triggered;
  }, []);

  const didPressEnter = useCallback((update: ViewUpdate): boolean => {
    let pressedEnter = false;
    update.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
      if (inserted.toString().includes("\n")) {
        pressedEnter = true;
      }
    });
    return pressedEnter;
  }, []);

  const isNearScrollEnd = useCallback((element: HTMLElement | null): boolean => {
    if (!element) return false;
    const remaining = element.scrollHeight - (element.scrollTop + element.clientHeight);
    return remaining <= 220;
  }, []);

  const updateEndSuggestionProximity = useCallback(() => {
    if (isSpecialTab) {
      setIsNearNoteEnd(false);
      return;
    }

    const editorVisible = viewMode === "editor" || viewMode === "split";
    const previewVisible = viewMode === "preview" || viewMode === "split";
    const editorScroller = editorVisible
      ? ((viewRef.current?.scrollDOM as HTMLElement | null) || null)
      : null;
    const previewScroller = previewVisible ? previewRef.current : null;

    setIsNearNoteEnd(
      isNearScrollEnd(editorScroller) || isNearScrollEnd(previewScroller),
    );
  }, [isNearScrollEnd, isSpecialTab, viewMode]);

  useEffect(() => {
    if (isSpecialTab || activeSuggestions.length === 0) {
      setIsSuggestionIdle(false);
      return;
    }

    setIsSuggestionIdle(false);
    const timer = window.setTimeout(() => {
      setIsSuggestionIdle(true);
    }, 600);

    return () => window.clearTimeout(timer);
  }, [activeSuggestions.length, activeTabId, content, isSpecialTab]);

  useEffect(() => {
    setHasFlowTrigger(false);
    setIsSectionPauseReady(false);
    setHasSectionEnterTrigger(false);
    setSectionRetryPending(false);
    setAllowForcedSectionMinimum(false);
    if (flowTriggerDelayTimerRef.current) {
      window.clearTimeout(flowTriggerDelayTimerRef.current);
      flowTriggerDelayTimerRef.current = null;
    }
    if (flowTriggerWindowTimerRef.current) {
      window.clearTimeout(flowTriggerWindowTimerRef.current);
      flowTriggerWindowTimerRef.current = null;
    }
    if (sectionPauseTimerRef.current) {
      window.clearTimeout(sectionPauseTimerRef.current);
      sectionPauseTimerRef.current = null;
    }
    if (sectionEnterTriggerTimerRef.current) {
      window.clearTimeout(sectionEnterTriggerTimerRef.current);
      sectionEnterTriggerTimerRef.current = null;
    }
  }, [activeTabId]);

  // Keep track of previous nextStepEndSuggestions and showEndSuggestionContent to animate closing smoothly
  useEffect(() => {
    const targetShow = showEndSuggestionContent;
    const targetSuggestions = nextStepEndSuggestions;

    // Case 1: We want to show suggestions (both show flag is true AND we have suggestions)
    if (targetShow && targetSuggestions.length > 0) {
      if (closingTimeoutRef.current) {
        window.clearTimeout(closingTimeoutRef.current);
        closingTimeoutRef.current = null;
      }
      setIsClosingSuggestions(false);
      setRenderedNextStepSuggestions(targetSuggestions);
      setRenderedShowEndSuggestions(true);
    }
    // Case 2: We are currently showing suggestions, but we should now hide them
    else if (renderedShowEndSuggestions && !isClosingSuggestions) {
      setIsClosingSuggestions(true);
      
      if (closingTimeoutRef.current) {
        window.clearTimeout(closingTimeoutRef.current);
      }
      
      closingTimeoutRef.current = window.setTimeout(() => {
        setIsClosingSuggestions(false);
        setRenderedShowEndSuggestions(false);
        setRenderedNextStepSuggestions([]);
        closingTimeoutRef.current = null;
      }, 350); // 350ms matching the CSS collapse animation duration
    }
  }, [showEndSuggestionContent, nextStepEndSuggestions, renderedShowEndSuggestions, isClosingSuggestions]);

  // Immediately clear closing state and hide suggestions when switching tabs
  useEffect(() => {
    if (closingTimeoutRef.current) {
      window.clearTimeout(closingTimeoutRef.current);
      closingTimeoutRef.current = null;
    }
    setIsClosingSuggestions(false);
    setRenderedShowEndSuggestions(false);
    setRenderedNextStepSuggestions([]);

    // Clear stable suggestion refs
    stableEndRef.current = null;
    previousContextVectorRef.current = null;
    intentShiftUntilRef.current = 0;
  }, [activeTabId]);

  useEffect(() => {
    return () => {
      if (typingPauseTimerRef.current) {
        window.clearTimeout(typingPauseTimerRef.current);
      }
      if (flowTriggerDelayTimerRef.current) {
        window.clearTimeout(flowTriggerDelayTimerRef.current);
      }
      if (flowTriggerWindowTimerRef.current) {
        window.clearTimeout(flowTriggerWindowTimerRef.current);
      }
      if (sectionPauseTimerRef.current) {
        window.clearTimeout(sectionPauseTimerRef.current);
      }
      if (sectionEnterTriggerTimerRef.current) {
        window.clearTimeout(sectionEnterTriggerTimerRef.current);
      }
      if (closingTimeoutRef.current) {
        window.clearTimeout(closingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isSpecialTab) {
      setIsNearNoteEnd(false);
      return;
    }

    const handleScroll = () => {
      updateEndSuggestionProximity();
      if (activePathRef.current && viewRef.current) {
        onViewStateChangeRef.current?.(activePathRef.current, {
          scroll: viewRef.current.scrollDOM.scrollTop,
        });
      }
    };
    const editorScroller = viewRef.current?.scrollDOM as HTMLElement | null;
    const previewScroller = previewRef.current;

    editorScroller?.addEventListener("scroll", handleScroll, { passive: true });
    previewScroller?.addEventListener("scroll", handleScroll, { passive: true });

    const rafId = window.requestAnimationFrame(updateEndSuggestionProximity);

    return () => {
      window.cancelAnimationFrame(rafId);
      editorScroller?.removeEventListener("scroll", handleScroll);
      previewScroller?.removeEventListener("scroll", handleScroll);
    };
  }, [
    activeTabId,
    editorMountTick,
    isSpecialTab,
    updateEndSuggestionProximity,
    viewMode,
  ]);

  useEffect(() => {
    if (isSpecialTab) return;
    const rafId = window.requestAnimationFrame(updateEndSuggestionProximity);
    return () => window.cancelAnimationFrame(rafId);
  }, [content, isSpecialTab, updateEndSuggestionProximity]);

  const handleOpenImageLightbox = useCallback((src: string, alt: string) => {
    setImageLightbox({ src, alt });
  }, []);

  // Update available notes for autocomplete
  useEffect(() => {
    if (availableNotes) {
      setAvailableNotes(availableNotes);
    }
  }, [availableNotes]);

  // Handle checkbox toggle in preview - updates the source markdown
  const handleCheckboxToggle = useCallback(
    (checkboxIndex: number, checked: boolean) => {
      const lines = content.split("\n");
      let currentCheckbox = 0;

      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^(\s*[-*+]\s+)\[([ xX])\]/);
        if (match) {
          if (currentCheckbox === checkboxIndex) {
            // Toggle the checkbox
            lines[i] = lines[i].replace(
              /^(\s*[-*+]\s+)\[([ xX])\]/,
              `$1[${checked ? "x" : " "}]`,
            );
            onContentChange(lines.join("\n"));
            return;
          }
          currentCheckbox++;
        }
      }
    },
    [content, onContentChange],
  );

  const handleEndOfNoteAccept = useCallback(
    (path: string) => {
      const view = viewRef.current;
      if (!view) return;

      // Refocus editor to avoid browser scrolling to top due to widget DOM destruction focus loss
      view.focus();

      const targetName = path.split("/").pop()?.replace(/\.md$/, "") || path;
      const linkText = `[[${targetName}]]`;
      const currentDoc = view.state.doc.toString();
      const separator = currentDoc.endsWith("\n") ? "\n" : "\n\n";
      const insert = separator + linkText + "\n";

      view.dispatch({
        changes: { from: view.state.doc.length, to: view.state.doc.length, insert },
        selection: { anchor: view.state.doc.length + insert.length },
        scrollIntoView: true,
      });

      onAcceptSuggestion?.(path, "related");
    },
    [onAcceptSuggestion],
  );

  // Resizer logic
  const handleDrag = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
    if (newWidth > 15 && newWidth < 85) setEditorWidth(newWidth);
  }, []);

  const stopDrag = useCallback(() => {
    document.removeEventListener("mousemove", handleDrag);
    document.removeEventListener("mouseup", stopDrag);
    document.body.style.cursor = "default";
  }, [handleDrag]);

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      document.addEventListener("mousemove", handleDrag);
      document.addEventListener("mouseup", stopDrag);
      document.body.style.cursor = "ew-resize";
    },
    [handleDrag, stopDrag],
  );

  // Ctrl/Cmd + wheel to zoom editor/preview text size
  const handleZoomWheel = useCallback(
    (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;

      const targetNode = e.target as Node | null;
      const targetElement =
        targetNode instanceof HTMLElement ? targetNode : null;
      if (isSpecialTab) {
        const isCanvasNoteBody = !!targetElement?.closest(".cv-embedded-md");
        if (!isCanvasNoteBody) return;
      }

      e.preventDefault();
      e.stopPropagation();

      let scope: "both" | "editor" | "preview" = "both";
      if (isSpecialTab) {
        scope = "preview";
      } else if (e.shiftKey) {
        if (targetNode && editorRef.current?.contains(targetNode)) {
          scope = "editor";
        } else if (targetNode && previewRef.current?.contains(targetNode)) {
          scope = "preview";
        } else {
          return;
        }
      }

      wheelRemainderRef.current += e.deltaY;
      const threshold = 80;
      const steps = Math.trunc(Math.abs(wheelRemainderRef.current) / threshold);
      if (steps === 0) return;

      const direction = wheelRemainderRef.current < 0 ? 1 : -1;
      onAdjustFontSize(direction * steps, scope);
      wheelRemainderRef.current -=
        Math.sign(wheelRemainderRef.current) * steps * threshold;
    },
    [onAdjustFontSize, isSpecialTab],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("wheel", handleZoomWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleZoomWheel);
  }, [handleZoomWheel]);

  // Handle image paste from clipboard
  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      if (!onImagePaste || !viewRef.current) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const imagePath = await onImagePaste(file);
            if (imagePath) {
              // Insert markdown image syntax at cursor
              const view = viewRef.current;
              const pos = view.state.selection.main.head;
              const imageMarkdown = `![${file.name}](${imagePath})`;
              view.dispatch({
                changes: { from: pos, insert: imageMarkdown },
                selection: { anchor: pos + imageMarkdown.length },
              });
            }
          }
          break;
        }
      }
    },
    [onImagePaste],
  );

  // Handle image drop
  const handleDrop = useCallback(
    async (e: DragEvent) => {
      if (!onImagePaste || !viewRef.current) return;

      const files = e.dataTransfer?.files;
      if (!files) return;

      for (const file of files) {
        if (file.type.startsWith("image/")) {
          e.preventDefault();
          const imagePath = await onImagePaste(file);
          if (imagePath) {
            const view = viewRef.current;
            const pos = view.state.selection.main.head;
            const imageMarkdown = `![${file.name}](${imagePath})`;
            view.dispatch({
              changes: { from: pos, insert: imageMarkdown },
              selection: { anchor: pos + imageMarkdown.length },
            });
          }
          break;
        }
      }
    },
    [onImagePaste],
  );

  // Add paste/drop listeners to editor
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.addEventListener("paste", handlePaste as any);
    editor.addEventListener("drop", handleDrop as any);
    editor.addEventListener("dragover", (e) => e.preventDefault());

    return () => {
      editor.removeEventListener("paste", handlePaste as any);
      editor.removeEventListener("drop", handleDrop as any);
    };
  }, [handlePaste, handleDrop]);

  // Keep contentRef in sync
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // Initialize/update CodeMirror
  useEffect(() => {
    if (isSpecialTab) {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
      return;
    }
    if (!editorRef.current) return;

    // If view already exists, just update content
    if (viewRef.current) {
      const currentDoc = viewRef.current.state.doc.toString();
      if (currentDoc !== content) {
        viewRef.current.dispatch({
          changes: {
            from: 0,
            to: currentDoc.length,
            insert: content,
          },
        });
      }
      return;
    }

    // Create new editor view
    const cachedState = activePathRef.current ? getViewStateRef.current?.(activePathRef.current) : undefined;
    const initialCursor = cachedState?.cursor ?? 0;
    const initialScroll = cachedState?.scroll ?? 0;

    const state = EditorState.create({
      doc: content,
      selection: { anchor: Math.min(initialCursor, content.length) },
      extensions: [
        history(),
        drawSelection(),
        search(),
        highlightSelectionMatches(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        markdown(),
        EditorView.lineWrapping,
        syntaxHighlighting(markdownHighlightStyle),
        linkAutocomplete(),
        linkAutocompleteTheme,
        headingFold(),
        foldTheme,
        wikiLinkPlugin(onLinkClick),
        tagPlugin(),
        imageWidgetPlugin(handleOpenImageLightbox),
        headingLivePreviewPlugin(),
        vimCompartment.of([]),
        suggestionContentCompartmentRef.current.of(
          suggestionContentStateField({
            endSuggestions: endOfNoteSuggestions,
            nextStepSuggestions: renderedNextStepSuggestions,
            showEndSuggestions: renderedShowEndSuggestions,
            isActivelyTyping,
            isClosing: isClosingSuggestions,
            onEndAccept: handleEndOfNoteAccept,
            getStableEnd: () => stableEndRef.current,
            setStableEnd: (val) => { stableEndRef.current = val; },
            getPreviousContextVector: () => previousContextVectorRef.current,
            setPreviousContextVector: (val) => { previousContextVectorRef.current = val; },
            getIntentShiftUntil: () => intentShiftUntilRef.current,
            setIntentShiftUntil: (val) => { intentShiftUntilRef.current = val; },
          }),
        ),
        EditorView.updateListener.of((update) => {
          if (update.selectionSet && activePathRef.current) {
            onViewStateChangeRef.current?.(activePathRef.current, {
              cursor: update.state.selection.main.head,
            });
          }
          if (update.docChanged) {
            // A change is a "user edit" if it changed the doc AND is not
            // explicitly marked as remote (from collaboration) or a
            // programmatic content-sync ('setContent').  This catches
            // raw view.dispatch() calls from paste, drop, image insert,
            // and AI suggestions that lack userEvent annotations.
            const isRemoteOrSync = update.transactions.some(
              (tr) =>
                tr.annotation(Transaction.remote) ||
                tr.isUserEvent("setContent"),
            );
            const isUserEdit = !isRemoteOrSync;
            // Read from refs to avoid stale closures -- the CM view is
            // created once per tab and these callbacks change when the
            // collab space becomes active asynchronously.
            onContentChangeRef.current(update.state.doc.toString(), isUserEdit);
            if (isUserEdit) {
              // Record that a local edit just happened, so the content-sync
              // effect knows not to overwrite the CM doc with stale content.
              lastLocalEditTsRef.current = Date.now();

              // Extract granular operations for collaboration broadcast
              const collabOps = onCollabOperationsRef.current;
              const cid = localClientIdRef.current;
              if (collabOps && cid) {
                const allOps = extractOperations(update.changes, cid, authManager.getUserId() || undefined);
                if (allOps.length > 0) {
                  collabOps(allOps);
                }
              }

              markActiveTyping();
              markSectionPauseReady();
              setSectionRetryPending((pending) => {
                if (pending) {
                  setAllowForcedSectionMinimum(true);
                  return false;
                }
                setAllowForcedSectionMinimum(false);
                return pending;
              });
              const pressedEnter = didPressEnter(update);
              if (didCompleteSentenceOrParagraph(update)) {
                markFlowTrigger();
              }
              if (pressedEnter) {
                markSectionEnterTrigger();
              } else {
                setHasSectionEnterTrigger(false);
              }
            }
          }
          // Cursor/selection change detection for presence broadcast.
          // Only broadcast when the selection change was NOT caused by a remote
          // transaction -- otherwise we bounce cursor positions back to peers,
          // creating feedback loops.
          const cursorCb = onCursorChangeRef.current;
          if (update.selectionSet && cursorCb && !update.transactions.some(tr => tr.annotation(Transaction.remote))) {
            const sel = update.state.selection.main;
            cursorCb({ from: sel.from, to: sel.to });
          }
        }),
        // Remote collaborator cursor decorations
        remoteCursorsExtension(),
        EditorView.editable.of(!readOnly),
        EditorView.theme({
          "&": {
            height: "100%",
            fontSize: "var(--editor-pane-font-size)",
            color: "var(--text-primary)",
            backgroundColor: "transparent",
            caretColor: "var(--editor-caret)",
          },
          ".cm-scroller": {
            overflowY: "auto",
            overflowX: "hidden",
            fontFamily: "var(--font-family)",
            lineHeight: "var(--editor-line-height)",
          },
          ".cm-content": {
            padding: "20px 40px",
            maxWidth: "850px",
            margin: "0 auto",
            caretColor: "var(--editor-caret)",
          },
          ".cm-line": {
            padding: "0 2px",
            borderRadius: "4px",
          },
          ".cm-cursorLayer .cm-cursor": {
            borderLeft: "2px solid var(--editor-caret)",
            maxHeight: "1.2em !important",
            animation: "smooth-cursor-blink 1s ease-in-out infinite !important",
            transition: "left 0.08s cubic-bezier(0.2, 0.8, 0.2, 1), top 0.08s cubic-bezier(0.2, 0.8, 0.2, 1), height 0.08s cubic-bezier(0.2, 0.8, 0.2, 1) !important",
          },
          ".cm-cursor": {
            maxHeight: "1.2em !important",
            animation: "smooth-cursor-blink 1s ease-in-out infinite !important",
            transition: "left 0.08s cubic-bezier(0.2, 0.8, 0.2, 1), top 0.08s cubic-bezier(0.2, 0.8, 0.2, 1), height 0.08s cubic-bezier(0.2, 0.8, 0.2, 1) !important",
          },
          ".cm-dropCursor": {
            borderLeft: "2px solid var(--editor-caret)",
            maxHeight: "1.2em !important",
          },
          ".cm-fatCursor": {
            backgroundColor: "var(--editor-caret)",
          },
          ".cm-activeLine": {
            backgroundColor: "var(--editor-active-line)",
          },
          ".cm-focused .cm-activeLine": {
            boxShadow: "inset 0 0 0 1px var(--editor-active-line-border)",
          },
          ".cm-selectionBackground": {
            backgroundColor: "var(--editor-selection)",
          },
          ".cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
            {
              backgroundColor: "var(--editor-selection-focused)",
            },
          ".cm-gutters": {
            backgroundColor: "transparent",
            border: "none",
          },
          ".cm-wikilink": {
            color: "var(--editor-link)",
            textDecoration: "none",
            cursor: "pointer",
            transition: "color 0.2s",
            borderBottom: "1px dotted transparent",
          },
          ".cm-wikilink:hover": {
            color: "var(--editor-link-hover)",
            borderBottomColor: "var(--editor-link-hover)",
          },
          ".cm-tag-mark": {
            color: "var(--editor-tag)",
            backgroundColor: "var(--editor-tag-bg)",
            fontWeight: "600",
            borderRadius: "999px",
            padding: "0 5px",
          },
          ".cm-searchMatch": {
            backgroundColor: "var(--editor-search-match)",
            borderBottom: "1px solid var(--editor-search-match-border)",
          },
          ".cm-searchMatch-selected": {
            backgroundColor: "var(--editor-search-active)",
            border: "1px solid var(--editor-search-active-border)",
            borderRadius: "1px",
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;
    if (initialScroll > 0) {
      setTimeout(() => {
        if (view.scrollDOM) {
          view.scrollDOM.scrollTop = initialScroll;
        }
      }, 0);
    }
    toggleVimMode(view, readVimModeSetting());
    onEditorViewReady?.(view);
    setEditorMountTick((tick) => tick + 1);

    // Broadcast initial cursor position so remote users see our cursor
    // immediately without waiting for a manual selection change.
    const cursorCb = onCursorChangeRef.current;
    if (cursorCb) {
      const sel = view.state.selection.main;
      cursorCb({ from: sel.from, to: sel.to });
    }

    return () => {
      view.destroy();
      viewRef.current = null;
      onEditorViewReady?.(null);
    };
  }, [activeTabId, isSpecialTab, readOnly]); // Re-create when tab changes or read-only mode flips

  useEffect(() => {
    if (isSpecialTab) return;

    const applyVimSetting = (enabled: boolean) => {
      if (!viewRef.current) return;
      toggleVimMode(viewRef.current, enabled);
    };

    applyVimSetting(readVimModeSetting());

    const handleVimSettingChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ enabled?: boolean }>;
      applyVimSetting(!!customEvent.detail?.enabled);
    };

    window.addEventListener(
      "oo:vim-setting-change",
      handleVimSettingChange as EventListener,
    );

    return () => {
      window.removeEventListener(
        "oo:vim-setting-change",
        handleVimSettingChange as EventListener,
      );
    };
  }, [isSpecialTab, readVimModeSetting]);

  useEffect(() => {
    if (isSpecialTab || !viewRef.current) return;

    viewRef.current.dispatch({
      effects: suggestionContentCompartmentRef.current.reconfigure(
        suggestionContentStateField({
          endSuggestions: endOfNoteSuggestions,
          nextStepSuggestions: renderedNextStepSuggestions,
          showEndSuggestions: renderedShowEndSuggestions,
          isActivelyTyping,
          isClosing: isClosingSuggestions,
          onEndAccept: handleEndOfNoteAccept,
          getStableEnd: () => stableEndRef.current,
          setStableEnd: (val) => { stableEndRef.current = val; },
          getPreviousContextVector: () => previousContextVectorRef.current,
          setPreviousContextVector: (val) => { previousContextVectorRef.current = val; },
          getIntentShiftUntil: () => intentShiftUntilRef.current,
          setIntentShiftUntil: (val) => { intentShiftUntilRef.current = val; },
        }),
      ),
    });
  }, [
    didPressEnter,
    endOfNoteSuggestions,
    renderedNextStepSuggestions,
    renderedShowEndSuggestions,
    isClosingSuggestions,
    handleEndOfNoteAccept,
    isActivelyTyping,
    isSpecialTab,
  ]);

  // Update content when it changes externally (tab switch or remote broadcast).
  // CRITICAL: We must NOT replace the CM doc if the change originated from a
  // local user edit.  The debounced `content` prop always lags behind the
  // real CM document by up to 250ms. Without this guard the effect would
  // overwrite the document with stale content, erasing characters the user
  // typed since the last debounce flush (the "auto-backspace" bug).
  useEffect(() => {
    if (isSpecialTab) return;
    if (!viewRef.current) return;

    // If the user edited locally very recently, the content prop is stale.
    // Skip the full-doc replace to avoid clobbering ongoing typing.
    const msSinceLocalEdit = Date.now() - lastLocalEditTsRef.current;
    if (msSinceLocalEdit < 500) return;

    const currentDoc = viewRef.current.state.doc.toString();
    if (currentDoc !== content) {
      const newContent = content || "";
      // Preserve cursor position: clamp to new document length
      const oldSel = viewRef.current.state.selection;
      const maxPos = newContent.length;
      const clampedAnchor = Math.min(oldSel.main.anchor, maxPos);
      const clampedHead = Math.min(oldSel.main.head, maxPos);

      viewRef.current.dispatch({
         changes: { from: 0, to: currentDoc.length, insert: newContent },
         selection: { anchor: clampedAnchor, head: clampedHead },
         annotations: Transaction.remote.of(true),
       });
    }
  }, [content, isSpecialTab]);

  // Push remote cursor presence data into CodeMirror state
  useEffect(() => {
    if (!viewRef.current || !remoteCursors) return;
    viewRef.current.dispatch({
      effects: setCursorsEffect.of(remoteCursors),
    });
  }, [remoteCursors]);

  // Handle custom search event from Ribbon or App
  useEffect(() => {
    if (isSpecialTab) return;
    const handleOpenSearch = () => {
      setIsSearchOpen(true);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "h") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    document.addEventListener(
      "editor:open-search",
      handleOpenSearch as EventListener,
    );
    document.addEventListener("keydown", handleKeyDown);

    const handleGotoLine = (e: any) => {
      const line = e.detail;
      const view = viewRef.current;
      if (view && typeof line === "number") {
        try {
          const safeLine = Math.max(1, Math.min(line, view.state.doc.lines));
          const linePos = view.state.doc.line(safeLine);
          view.dispatch({
            selection: { anchor: linePos.from, head: linePos.from },
            scrollIntoView: true,
          });
          view.focus();
        } catch (err) {
          console.error("Error scrolling to line:", err);
        }
      }
    };

    document.addEventListener(
      "editor:goto-line",
      handleGotoLine as EventListener,
    );

    return () => {
      document.removeEventListener(
        "editor:open-search",
        handleOpenSearch as EventListener,
      );
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener(
        "editor:goto-line",
        handleGotoLine as EventListener,
      );
    };
  }, [isSpecialTab]);

  useEffect(() => {
    if (isSpecialTab || !activeTabId) return;

    const handleHighlightText = (e: Event) => {
      const customEvent = e as CustomEvent<{ path: string; text: string }>;
      const { path, text } = customEvent.detail;
      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (activeTab && activeTab.path === path && viewRef.current && text) {
        const docString = viewRef.current.state.doc.toString();
        const index = docString.indexOf(text);
        if (index !== -1) {
          viewRef.current.dispatch({
            selection: { anchor: index, head: index + text.length },
            scrollIntoView: true,
          });
          viewRef.current.focus();
        } else {
          const indexLower = docString.toLowerCase().indexOf(text.toLowerCase());
          if (indexLower !== -1) {
            viewRef.current.dispatch({
              selection: { anchor: indexLower, head: indexLower + text.length },
              scrollIntoView: true,
            });
            viewRef.current.focus();
          }
        }
      }
    };

    document.addEventListener("editor:highlight-text", handleHighlightText as EventListener);
    return () => {
      document.removeEventListener("editor:highlight-text", handleHighlightText as EventListener);
    };
  }, [activeTabId, tabs, isSpecialTab]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const app = (window as any).__oo_app;
    if (!app) return;

    const getSettings = () => {
      try {
        const saved = localStorage.getItem("openobsidian-settings");
        if (saved) return JSON.parse(saved);
      } catch (err) {}
      return null;
    };

    const toggleInlineFormat = (prefix: string, suffix: string = prefix) => {
      const view = viewRef.current;
      if (!view) return;
      const state = view.state;
      const main = state.selection.main;
      const selectedText = state.sliceDoc(main.from, main.to);
      const isWrapped = selectedText.startsWith(prefix) && selectedText.endsWith(suffix);
      
      let newText = '';
      let newAnchor = main.from;
      let newHead = main.to;
      
      if (isWrapped) {
        newText = selectedText.slice(prefix.length, selectedText.length - suffix.length);
        newAnchor = main.from;
        newHead = main.to - prefix.length - suffix.length;
      } else {
        newText = prefix + selectedText + suffix;
        newAnchor = main.from + prefix.length;
        newHead = main.to + prefix.length;
      }
      
      view.dispatch({
        changes: { from: main.from, to: main.to, insert: newText },
        selection: { anchor: isWrapped ? main.from : newAnchor, head: isWrapped ? newHead : newHead }
      });
      view.focus();
    };

    const toggleBlockFormat = (blockPrefix: string) => {
      const view = viewRef.current;
      if (!view) return;
      const state = view.state;
      const main = state.selection.main;
      const line = state.doc.lineAt(main.from);
      const lineText = line.text;
      const hasPrefix = lineText.startsWith(blockPrefix);
      
      let newText = '';
      if (hasPrefix) {
        newText = lineText.slice(blockPrefix.length);
      } else {
        newText = blockPrefix + lineText;
      }
      
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: newText },
        selection: { anchor: Math.max(line.from, main.from + (hasPrefix ? -blockPrefix.length : blockPrefix.length)) }
      });
      view.focus();
    };

    const insertContent = (content: string, cursorOffset: number = 0) => {
      const view = viewRef.current;
      if (!view) return;
      const main = view.state.selection.main;
      
      view.dispatch({
        changes: { from: main.from, to: main.to, insert: content },
        selection: { anchor: main.from + cursorOffset }
      });
      view.focus();
    };

    const addLink = async () => {
      const view = viewRef.current;
      if (!view) return;
      const settings = getSettings();
      const useWikiLinks = settings ? settings.useWikiLinks !== false : true;
      const main = view.state.selection.main;
      const selectedText = view.state.sliceDoc(main.from, main.to);
      
      let clipboardText = '';
      try {
        clipboardText = await navigator.clipboard.readText();
      } catch (err) {}
      
      const isUrl = /^(https?:\/\/|www\.)\S+$/i.test(clipboardText.trim());
      
      let insertText = '';
      let newAnchor = main.from;
      if (isUrl) {
        insertText = `[${selectedText}](${clipboardText.trim()})`;
        newAnchor = main.from + insertText.length;
      } else if (useWikiLinks) {
        insertText = `[[${selectedText}]]`;
        newAnchor = main.from + insertText.length;
      } else {
        insertText = `[${selectedText}]()`;
        newAnchor = main.from + selectedText.length + 3;
      }
      
      view.dispatch({
        changes: { from: main.from, to: main.to, insert: insertText },
        selection: { anchor: newAnchor }
      });
      view.focus();
    };

    const addExternalLink = async () => {
      const view = viewRef.current;
      if (!view) return;
      const main = view.state.selection.main;
      const selectedText = view.state.sliceDoc(main.from, main.to);
      
      let clipboardText = '';
      try {
        clipboardText = await navigator.clipboard.readText();
      } catch (err) {}
      
      const isUrl = /^(https?:\/\/|www\.)\S+$/i.test(clipboardText.trim());
      
      let insertText = '';
      let newAnchor = main.from;
      if (isUrl) {
        insertText = `[${selectedText}](${clipboardText.trim()})`;
        newAnchor = main.from + insertText.length;
      } else {
        insertText = `[${selectedText}]()`;
        newAnchor = main.from + selectedText.length + 3;
      }
      
      view.dispatch({
        changes: { from: main.from, to: main.to, insert: insertText },
        selection: { anchor: newAnchor }
      });
      view.focus();
    };

    const searchSelection = () => {
      if (!selection) return;
      const event = new CustomEvent('oo:global-search', {
        detail: {
          query: selection,
          mode: 'search'
        }
      });
      window.dispatchEvent(event);
    };

    const extractSelection = () => {
      const view = viewRef.current;
      if (!view || !selection) return;
      
      const event = new CustomEvent('oo:show-prompt', {
        detail: {
          title: 'Extract Selection to Note',
          message: 'Enter a name for the new note:',
          defaultValue: '',
          onConfirm: async (fileName: string) => {
            if (!fileName || !fileName.trim()) return;
            const cleanName = fileName.trim();
            const notePath = cleanName.endsWith('.md') ? cleanName : `${cleanName}.md`;
            
            try {
              await getAPI().createFile(notePath, selection);
              
              window.dispatchEvent(new CustomEvent('oo:refresh-file-tree'));
              
              const main = view.state.selection.main;
              const linkText = `[[${cleanName}]]`;
              view.dispatch({
                changes: { from: main.from, to: main.to, insert: linkText },
                selection: { anchor: main.from + linkText.length }
              });
              view.focus();
            } catch (err) {
              console.error('Failed to extract selection:', err);
            }
          }
        }
      });
      window.dispatchEvent(event);
    };

    const menu = new Menu();

    const selection = viewRef.current?.state.sliceDoc(
      viewRef.current.state.selection.main.from,
      viewRef.current.state.selection.main.to
    ) || '';
    const searchTitle = selection 
      ? `Search for "${selection.length > 20 ? selection.substring(0, 20) + '...' : selection}"`
      : 'Search for selection';

    menu.addItem((item: any) => item.setTitle('Add link').setIcon('link').onClick(() => { void addLink(); }));
    menu.addItem((item: any) => item.setTitle('Add external link').setIcon('external-link').onClick(() => { void addExternalLink(); }));
    menu.addSeparator();
    menu.addItem((item: any) => item.setTitle(searchTitle).setIcon('search').onClick(() => { searchSelection(); }));
    menu.addItem((item: any) => item.setTitle('Extract current selection...').setIcon('scissors').onClick(() => { extractSelection(); }));
    menu.addSeparator();
    
    // Submenus for Format, Paragraph, Insert
    let formatItem: any;
    menu.addItem((item: any) => {
      item.setTitle('Format').setIcon('type');
      formatItem = item;
    });
    const formatSubmenu = formatItem.setSubmenu();
    formatSubmenu.addItem((subItem: any) => subItem.setTitle('Bold').setIcon('bold').onClick(() => toggleInlineFormat('**')));
    formatSubmenu.addItem((subItem: any) => subItem.setTitle('Italic').setIcon('italic').onClick(() => toggleInlineFormat('*')));
    formatSubmenu.addItem((subItem: any) => subItem.setTitle('Strikethrough').setIcon('strikethrough').onClick(() => toggleInlineFormat('~~')));
    formatSubmenu.addItem((subItem: any) => subItem.setTitle('Code').setIcon('code').onClick(() => toggleInlineFormat('`')));
    formatSubmenu.addItem((subItem: any) => subItem.setTitle('Highlighter').setIcon('pen-tool').onClick(() => toggleInlineFormat('==')));

    let paragraphItem: any;
    menu.addItem((item: any) => {
      item.setTitle('Paragraph').setIcon('align-left');
      paragraphItem = item;
    });
    const paragraphSubmenu = paragraphItem.setSubmenu();
    paragraphSubmenu.addItem((subItem: any) => subItem.setTitle('Heading 1').setIcon('heading').onClick(() => toggleBlockFormat('# ')));
    paragraphSubmenu.addItem((subItem: any) => subItem.setTitle('Heading 2').setIcon('heading').onClick(() => toggleBlockFormat('## ')));
    paragraphSubmenu.addItem((subItem: any) => subItem.setTitle('Heading 3').setIcon('heading').onClick(() => toggleBlockFormat('### ')));
    paragraphSubmenu.addItem((subItem: any) => subItem.setTitle('Heading 4').setIcon('heading').onClick(() => toggleBlockFormat('#### ')));
    paragraphSubmenu.addSeparator();
    paragraphSubmenu.addItem((subItem: any) => subItem.setTitle('Bullet list').setIcon('list').onClick(() => toggleBlockFormat('- ')));
    paragraphSubmenu.addItem((subItem: any) => subItem.setTitle('Numbered list').setIcon('list-ordered').onClick(() => toggleBlockFormat('1. ')));
    paragraphSubmenu.addItem((subItem: any) => subItem.setTitle('Todo list').setIcon('check-square').onClick(() => toggleBlockFormat('- [ ] ')));
    paragraphSubmenu.addSeparator();
    paragraphSubmenu.addItem((subItem: any) => subItem.setTitle('Blockquote').setIcon('quote').onClick(() => toggleBlockFormat('> ')));

    let insertItem: any;
    menu.addItem((item: any) => {
      item.setTitle('Insert').setIcon('plus-circle');
      insertItem = item;
    });
    const insertSubmenu = insertItem.setSubmenu();
    insertSubmenu.addItem((subItem: any) => subItem.setTitle('Callout').setIcon('info').onClick(() => insertContent('> [!NOTE]\n> ', 10)));
    insertSubmenu.addItem((subItem: any) => subItem.setTitle('Code block').setIcon('terminal').onClick(() => insertContent('\n```\n\n```\n', 5)));
    insertSubmenu.addItem((subItem: any) => subItem.setTitle('Table').setIcon('table').onClick(() => insertContent('\n| Header | Header |\n| --- | --- |\n| Cell | Cell |\n', 3)));
    insertSubmenu.addItem((subItem: any) => subItem.setTitle('Math block').setIcon('percent').onClick(() => insertContent('\n$$\n\n$$\n', 4)));
    insertSubmenu.addItem((subItem: any) => subItem.setTitle('Horizontal rule').setIcon('minus').onClick(() => insertContent('\n---\n', 5)));
    insertSubmenu.addItem((subItem: any) => {
      subItem.setTitle('Date / Time').setIcon('clock').onClick(() => {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 16).replace('T', ' '); // YYYY-MM-DD HH:mm
        insertContent(dateStr, dateStr.length);
      });
    });

    menu.addSeparator();
    
    menu.addItem((item: any) => item.setTitle('Cut').setIcon('scissors').onClick(() => { document.execCommand('cut'); }));
    menu.addItem((item: any) => item.setTitle('Copy').setIcon('copy').onClick(() => { document.execCommand('copy'); }));
    menu.addItem((item: any) => item.setTitle('Paste').setIcon('clipboard').onClick(async () => {
       try {
         const text = await navigator.clipboard.readText();
         if (viewRef.current) {
           const main = viewRef.current.state.selection.main;
           viewRef.current.dispatch({ changes: { from: main.from, to: main.to, insert: text }, selection: { anchor: main.from + text.length } });
         }
       } catch (err) {}
    }));
    menu.addItem((item: any) => item.setTitle('Paste as plain text').setIcon('clipboard-type').onClick(async () => {
       try {
         const text = await navigator.clipboard.readText();
         if (viewRef.current) {
           const main = viewRef.current.state.selection.main;
           viewRef.current.dispatch({ changes: { from: main.from, to: main.to, insert: text }, selection: { anchor: main.from + text.length } });
         }
       } catch (err) {}
    }));
    menu.addSeparator();
    menu.addItem((item: any) => item.setTitle('Select all').setIcon('check-square').onClick(() => {
       if (viewRef.current) {
         viewRef.current.dispatch({ selection: { anchor: 0, head: viewRef.current.state.doc.length }});
       }
     }));
 
     // Sync real editor state to the API mock before triggering event
     const activeLeaf = app.workspace.activeLeaf;
     if (activeLeaf && viewRef.current) {
       // Ensure this leaf is considered the active one during the event trigger
       if (activeLeaf.view) {
         const view = activeLeaf.view;
         const cmView = viewRef.current;
         const state = cmView.state;
         
         // Sync the file info
         const activeTab = tabs.find(t => t.id === activeTabId);
         if (activeTab) {
           activeLeaf.view.file = new TFile(activeTab.path);
         }
 
         // Initialize editor mocks if needed
         const editor = view.editor || {};
         view.editor = editor;
         
         // Update the mock methods with real data from CodeMirror 6
         editor.getValue = () => state.doc.toString();
         editor.getSelection = () => state.sliceDoc(state.selection.main.from, state.selection.main.to);
         editor.somethingSelected = () => !state.selection.main.empty;
         editor.getCursor = () => {
           const pos = state.selection.main.head;
           const line = state.doc.lineAt(pos);
           return { line: line.number - 1, ch: pos - line.from };
         };
         editor.replaceSelection = (text: string) => {
           const main = state.selection.main;
           cmView.dispatch({
             changes: { from: main.from, to: main.to, insert: text },
             selection: { anchor: main.from + text.length }
           });
         };
         
         // Add more standard Obsidian editor methods for compatibility
         editor.getLine = (n: number) => state.doc.line(n + 1).text;
         editor.lineCount = () => state.doc.lines;
         editor.getDoc = () => editor;
         editor.cm = editor;
         
         // Ensure sourceMode shim is present as expected by many plugins
         view.sourceMode = view.sourceMode || {};
         view.sourceMode.cmEditor = editor;
 
         console.log(`[Editor] Triggering editor-menu for ${activeTab?.path}. Selection: "${editor.getSelection()}"`);
         app.workspace.trigger('editor-menu', menu, editor, view);
       }
     }
 
     menu.showAtMouseEvent(e.nativeEvent);
   }, [activeTabId, tabs]);

  const getClampedToolbarCoords = () => {
    if (!selectionRange) return { top: 0, left: 0 };
    const toolbarHeight = showPromptInput ? 84 : 40;
    const toolbarWidth = 400;
    
    const y = selectionRange.rect.top < (showPromptInput ? 110 : 70)
      ? selectionRange.rect.bottom + 8
      : selectionRange.rect.top - (showPromptInput ? 92 : 46);
      
    const minY = 50;
    const maxY = Math.max(minY, window.innerHeight - toolbarHeight - 40);
    const clampedY = Math.max(minY, Math.min(maxY, y));
    
    const x = selectionRange.rect.left + (selectionRange.rect.width / 2) - (toolbarWidth / 2);
    const minX = 10;
    const maxX = Math.max(minX, window.innerWidth - toolbarWidth - 10);
    const clampedX = Math.max(minX, Math.min(maxX, x));
    
    return {
      top: clampedY + window.scrollY,
      left: clampedX + window.scrollX
    };
  };

  const getClampedLoadingCoords = () => {
    if (!selectionRange) return { top: 0, left: 0 };
    const toolbarHeight = 40;
    const toolbarWidth = 200;
    
    const y = selectionRange.rect.top < 70
      ? selectionRange.rect.bottom + 8
      : selectionRange.rect.top - 46;
      
    const minY = 50;
    const maxY = Math.max(minY, window.innerHeight - toolbarHeight - 40);
    const clampedY = Math.max(minY, Math.min(maxY, y));
    
    const x = selectionRange.rect.left + (selectionRange.rect.width / 2) - (toolbarWidth / 2);
    const minX = 10;
    const maxX = Math.max(minX, window.innerWidth - toolbarWidth - 10);
    const clampedX = Math.max(minX, Math.min(maxX, x));
    
    return {
      top: clampedY + window.scrollY,
      left: clampedX + window.scrollX
    };
  };

  return (
    <>
      {selectionRange && !isInlineQuerying && !explanation && createPortal(
        <div
          className="inline-ai-toolbar"
          style={{
            position: "absolute",
            ...getClampedToolbarCoords(),
            zIndex: 5000,
          }}
          onMouseDown={(e) => {
            const target = e.target as HTMLElement;
            if (
              target.tagName === "INPUT" ||
              target.tagName === "TEXTAREA" ||
              target.classList.contains("inline-ai-prompt-input") ||
              target.closest(".inline-ai-prompt-input") ||
              target.classList.contains("inline-ai-prompt-submit") ||
              target.closest(".inline-ai-prompt-submit")
            ) {
              return;
            }
            e.preventDefault();
          }}
        >
          <div className={`inline-ai-buttons-row${showPromptInput ? " has-prompt-row" : ""}`}>
            <button className="inline-ai-btn" onClick={() => handleInlineAction("rewrite")}>
              Rewrite
            </button>
            <button className="inline-ai-btn" onClick={() => handleInlineAction("expand")}>
              Expand
            </button>
            <button className="inline-ai-btn" onClick={() => handleInlineAction("simplify")}>
              Simplify
            </button>
            <button className="inline-ai-btn" onClick={() => handleInlineAction("explain")}>
              Explain
            </button>
            <button
              className={`inline-ai-btn${showPromptInput ? " active" : ""}`}
              onClick={() => setShowPromptInput(!showPromptInput)}
            >
              Prompt
            </button>
          </div>
          {showPromptInput && (
            <div className="inline-ai-prompt-row">
              <input
                type="text"
                className="inline-ai-prompt-input"
                placeholder="Tell AI exactly what to do..."
                value={customPromptText}
                onChange={(e) => setCustomPromptText(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customPromptText.trim()) {
                    handleInlineAction("custom", customPromptText);
                  } else if (e.key === "Escape") {
                    window.getSelection()?.removeAllRanges();
                    setSelectionRange(null);
                    setShowPromptInput(false);
                    setCustomPromptText("");
                  }
                }}
                autoFocus
              />
              <button
                className="inline-ai-prompt-submit"
                onClick={() => handleInlineAction("custom", customPromptText)}
                disabled={!customPromptText.trim()}
              >
                Submit
              </button>
            </div>
          )}
        </div>,
        document.body
      )}

      {isInlineQuerying && selectionRange && !explanation && createPortal(
        <div
          className="inline-ai-toolbar loading"
          style={{
            position: "absolute",
            ...getClampedLoadingCoords(),
            zIndex: 5000,
          }}
        >
          <div className="flat-spinner" style={{ marginRight: 8, display: "inline-block" }} />
          <span>Processing selection...</span>
        </div>,
        document.body
      )}

      {explanation && explanationCoords && createPortal(
        <div
          className="inline-ai-explanation-popover"
          style={{
            position: "absolute",
            top: explanationCoords.y,
            left: Math.max(10, explanationCoords.x - 150),
            zIndex: 5000,
          }}
        >
          <div className="explanation-popover-header">
            <span>Explanation</span>
            <button className="explanation-popover-close" onClick={() => setExplanation(null)}>
              <X size={12} />
            </button>
          </div>
          <div className="explanation-popover-body">
            {explanation}
          </div>
        </div>,
        document.body
      )}

      {/* Inline annotation content */}
      {isInsightVisible && (
        <div className="editor-annotation readable-insight">
          <div className="editor-annotation-header">
            <span className="editor-annotation-title">
              <Lightbulb size={14} style={{ marginRight: 6 }} />
              Note Insight
            </span>
            <div className="editor-annotation-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {annotation && !isGeneratingInsight && (
                <button
                  className="editor-annotation-refresh"
                  onClick={onGenerateInsight}
                  title="Regenerate Insight"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted, #888)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px',
                    borderRadius: '4px',
                  }}
                  onMouseOver={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
                  }}
                  onMouseOut={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'none';
                    (e.currentTarget as HTMLElement).style.color = 'var(--text-muted, #888)';
                  }}
                >
                  <RefreshCw size={14} />
                </button>
              )}
              <button className="editor-annotation-close" onClick={() => toggleInsight(false)} title="Close Insight">
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="editor-annotation-text">
            {isGeneratingInsight ? (
              <span style={{ color: 'var(--text-muted)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RefreshCw size={14} className="spin-animation" /> Generating insight...
              </span>
            ) : annotation ? (
              annotation
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No insight generated yet for this note.</span>
                <button
                  onClick={onGenerateInsight}
                  style={{
                    background: 'var(--accent-color, #3b82f6)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 500,
                  }}
                >
                  <Sparkles size={12} /> Generate Insight
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Editor & Preview Container */}
      <div
        className="editor-container"
        ref={containerRef}
        style={{
          display: "flex",
          flexDirection: "row",
          flex: 1,
          minHeight: 0,
          position: "relative",
        }}
      >
        {isSpecialTab ? (
          <div
            style={{
              flex: 1,
              height: "100%",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {specialContent}
          </div>
        ) : (
          <>
            {/* VS Code-style Search/Replace Panel */}
            <SearchReplace
              getView={() => viewRef.current}
              isOpen={isSearchOpen}
              onClose={() => setIsSearchOpen(false)}
            />

            <div
              ref={editorRef}
              onContextMenu={handleContextMenu}
              style={{
                flex: viewMode === "split" ? `0 0 ${editorWidth}%` : 1,
                height: "100%",
                overflow: "auto",
                display:
                  viewMode === "editor" || viewMode === "split"
                    ? "block"
                    : "none",
                backgroundColor: "var(--bg-primary)",
              }}
            />

            {viewMode === "split" && (
              <div className="resizer" onMouseDown={startDrag} />
            )}

            {(viewMode === "preview" || viewMode === "split") && (
              <div
                ref={previewRef}
                onContextMenu={handleContextMenu}
                style={{
                  flex:
                    viewMode === "split"
                      ? `0 0 calc(${100 - editorWidth}% - 4px)`
                      : 1,
                  overflow: "auto",
                  height: "100%",
                  backgroundColor: "var(--bg-primary)",
                }}
              >
                <MarkdownPreview
                  content={content}
                  onLinkClick={onLinkClick}
                  onCheckboxToggle={handleCheckboxToggle}
                  onEmbed={onGetNoteContent}
                  onGetLinkPreview={onGetNoteContent}
                  onImageClick={handleOpenImageLightbox}
                  theme={theme}
                  onContentChange={onContentChange}
                />
              </div>
            )}
          </>
        )}
      </div>

      {imageLightbox && (
        <div
          className="editor-image-lightbox-backdrop"
          onClick={() => setImageLightbox(null)}
        >
          <div
            className="editor-image-lightbox-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="editor-image-lightbox-close"
              onClick={() => setImageLightbox(null)}
              aria-label="Close image preview"
            >
              ×
            </button>
            <img
              src={imageLightbox.src}
              alt={imageLightbox.alt || "Image preview"}
              className="editor-image-lightbox-image"
            />
          </div>
        </div>
      )}
    </>
  );
}
