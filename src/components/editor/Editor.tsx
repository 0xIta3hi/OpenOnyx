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
import { X, Lightbulb, BookOpen, Pen } from "lucide-react";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
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

interface SentenceAnchor {
  anchorPos: number;
  anchorLine: number;
  sentence: string;
}

const INLINE_PHRASE_STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "being", "this", "that", "these", "those", "it", "its", "they", "them",
  "their", "you", "your", "we", "our", "i", "me", "my", "as", "if", "then",
  "also", "very", "just", "really", "about", "into", "over", "after", "before",
]);

function findLastCompletedSentenceAnchor(
  doc: EditorState["doc"],
  cursorPos: number,
): SentenceAnchor | null {
  const beforeCursor = doc.sliceString(0, cursorPos);
  const endMatch = beforeCursor.match(/[.!?](?=[^.!?]*$)/);
  if (!endMatch || typeof endMatch.index !== "number") return null;

  const sentenceEnd = endMatch.index + 1;
  const beforeEnd = beforeCursor.slice(0, Math.max(0, endMatch.index));
  const previousEndMatch = beforeEnd.match(/[.!?](?=[^.!?]*$)/);
  const sentenceStart =
    previousEndMatch && typeof previousEndMatch.index === "number"
      ? previousEndMatch.index + 1
      : 0;

  const sentence = beforeCursor.slice(sentenceStart, sentenceEnd).trim();
  if (!sentence) return null;

  const anchorPos = Math.max(0, Math.min(doc.length, sentenceEnd));
  return {
    anchorPos,
    anchorLine: doc.lineAt(anchorPos).number,
    sentence,
  };
}

function isCursorAtSentenceOrLineEnd(
  doc: EditorState["doc"],
  cursorPos: number,
): boolean {
  const line = doc.lineAt(cursorPos);
  if (cursorPos === line.to) return true;

  const beforeCursor = doc.sliceString(0, cursorPos).trimEnd();
  return /[.!?]$/.test(beforeCursor);
}

function extractInlineTriggerPhrase(
  sentence: string,
  suggestion: EnrichedSuggestion,
): string {
  const words = sentence
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !INLINE_PHRASE_STOP_WORDS.has(word));

  if (words.length === 0) return "this idea";

  const preferred = new Set(
    [...suggestion.sharedConcepts, suggestion.title]
      .flatMap((value) =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/),
      )
      .filter((word) => word.length > 2 && !INLINE_PHRASE_STOP_WORDS.has(word)),
  );

  const startIndex = Math.max(
    0,
    words.findIndex((word) => preferred.has(word)),
  );

  const phraseWords = words.slice(startIndex, startIndex + 3);
  const phrase = phraseWords.join(" ").trim();
  return phrase || words[0] || "this idea";
}

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

function insertSectionSuggestionIntoDoc(
  view: EditorView,
  suggestion: EnrichedSuggestion,
  context: ActiveListSectionContext,
): void {
  const suggestionLine = `${context.listPrefix}[[${suggestion.title}]]`;

  const from = context.isPlaceholderLine
    ? context.replaceFrom
    : context.activeList.to;
  const to = context.isPlaceholderLine
    ? context.replaceTo
    : context.activeList.to;
  const insert = context.isPlaceholderLine
    ? suggestionLine
    : `\n${suggestionLine}`;

  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    scrollIntoView: true,
  });
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

class InlineContextSuggestionWidget extends WidgetType {
  constructor(
    private readonly suggestion: EnrichedSuggestion,
    private readonly triggerPhrase: string,
    private readonly confidence: "high" | "medium" | "low",
    private readonly onAccept: (path: string) => void,
  ) {
    super();
  }

  eq(other: InlineContextSuggestionWidget): boolean {
    return (
      this.suggestion.path === other.suggestion.path &&
      this.suggestion.similarity === other.suggestion.similarity &&
      this.triggerPhrase === other.triggerPhrase
    );
  }

  toDOM(): HTMLElement {
    const root = document.createElement("div");
    root.className = "editor-virtual-inline-suggestion";
    root.setAttribute("contenteditable", "false");

    const ghostLink = document.createElement("button");
    ghostLink.type = "button";
    ghostLink.className =
      this.confidence === "low"
        ? "editor-virtual-inline-ghost-link editor-virtual-inline-ghost-link--low-confidence"
        : this.confidence === "medium"
          ? "editor-virtual-inline-ghost-link editor-virtual-inline-ghost-link--medium-confidence"
          : "editor-virtual-inline-ghost-link";
    ghostLink.textContent = `\u2192 expands on "${this.triggerPhrase}" \u2192 [[${this.suggestion.title}]]`;
    wireSuggestionAction(ghostLink, () => this.onAccept(this.suggestion.path));
    root.appendChild(ghostLink);

    return root;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class EndOfNoteSuggestionsWidget extends WidgetType {
  private readonly key: string;

  constructor(
    private readonly suggestions: EnrichedSuggestion[],
    private readonly nextStepSuggestions: EnrichedSuggestion[],
    private readonly onAccept: (path: string) => void,
  ) {
    super();
    this.key = [
      ...suggestions.map((suggestion) => `${suggestion.path}:${Math.round(suggestion.similarity * 100)}`),
      "::next::",
      ...nextStepSuggestions.map(
        (suggestion) => `${suggestion.path}:${Math.round(suggestion.similarity * 100)}`,
      ),
    ].join("|");
  }

  eq(other: EndOfNoteSuggestionsWidget): boolean {
    return this.key === other.key;
  }

  toDOM(): HTMLElement {
    const root = document.createElement("div");
    root.className = "editor-virtual-end-suggestions";
    root.setAttribute("contenteditable", "false");
    root.style.userSelect = "none";
    root.style.caretColor = "transparent";
    root.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });

    if (this.suggestions.length > 0) {
      const heading = document.createElement("div");
      heading.className = "editor-virtual-end-heading";
      heading.textContent = "You might also connect this to:";
      root.appendChild(heading);

      for (const suggestion of this.suggestions) {
        const line = document.createElement("div");
        line.className = "editor-virtual-end-line";

        const confidence = resolveSuggestionConfidence(suggestion.similarity);

        const noteButton = document.createElement("button");
        noteButton.type = "button";
        noteButton.className =
          confidence === "low"
            ? "editor-virtual-end-note editor-virtual-end-note--low-confidence"
            : confidence === "medium"
              ? "editor-virtual-end-note editor-virtual-end-note--medium-confidence"
              : "editor-virtual-end-note";
        noteButton.textContent = `[[${suggestion.title}]]`;
        wireSuggestionAction(noteButton, () => this.onAccept(suggestion.path));
        line.appendChild(noteButton);
        root.appendChild(line);
      }
    }

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

  ignoreEvent(): boolean {
    return true;
  }
}

class SectionListSuggestionsWidget extends WidgetType {
  private readonly key: string;

  constructor(
    private readonly suggestions: EnrichedSuggestion[],
    private readonly listPrefix: string,
    private readonly lowConfidencePaths: Set<string>,
    private readonly onAccept: (suggestion: EnrichedSuggestion) => void,
  ) {
    super();
    this.key = suggestions
      .map(
        (suggestion) =>
          `${suggestion.path}:${Math.round(suggestion.similarity * 100)}:${this.lowConfidencePaths.has(suggestion.path) ? "low" : "high"}`,
      )
      .join("|");
  }

  eq(other: SectionListSuggestionsWidget): boolean {
    return this.key === other.key && this.listPrefix === other.listPrefix;
  }

  toDOM(): HTMLElement {
    const root = document.createElement("div");
    root.className = "editor-virtual-section-suggestions";
    root.setAttribute("contenteditable", "false");
    root.style.caretColor = "transparent";
    root.style.userSelect = "none";
    root.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });

    for (const suggestion of this.suggestions) {
      const confidence = resolveSuggestionConfidence(
        suggestion.similarity,
        this.lowConfidencePaths.has(suggestion.path),
      );
      const itemButton = document.createElement("button");
      itemButton.type = "button";
      itemButton.className =
        confidence === "low"
          ? "editor-virtual-section-item editor-virtual-section-item--low-confidence"
          : confidence === "medium"
            ? "editor-virtual-section-item editor-virtual-section-item--medium-confidence"
            : "editor-virtual-section-item";
      itemButton.style.caretColor = "transparent";
      itemButton.style.userSelect = "none";
      itemButton.textContent = `${this.listPrefix}[[${suggestion.title}]]`;
      wireSuggestionAction(itemButton, () => this.onAccept(suggestion));
      root.appendChild(itemButton);
    }

    return root;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

interface SuggestionContentPluginOptions {
  inlineSuggestion: EnrichedSuggestion | null;
  endSuggestions: EnrichedSuggestion[];
  nextStepSuggestions: EnrichedSuggestion[];
  sectionCandidates: EnrichedSuggestion[];
  showEndSuggestions: boolean;
  showSectionSuggestions: boolean;
  allowForcedSectionMinimum: boolean;
  isActivelyTyping: boolean;
  onInlineAccept: (path: string) => void;
  onEndAccept: (path: string) => void;
  onSectionAccept: (
    suggestion: EnrichedSuggestion,
    context: ActiveListSectionContext,
  ) => void;
  onSectionMinimumDeferred: () => void;
}

function suggestionContentPlugin(options: SuggestionContentPluginOptions) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      stableInline:
        | { path: string; anchorLine: number; similarity: number; until: number }
        | null = null;
      stableSection:
        | {
            contextKey: string;
            paths: string[];
            lowConfidencePaths: string[];
            topSignalScore: number;
            until: number;
          }
        | null = null;
      stableEnd: { paths: string[]; topSimilarity: number; until: number } | null = null;
      previousContextVector: Map<string, number> | null = null;
      intentShiftUntil = 0;

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
        const cursorPos = view.state.selection.main.head;
        const cursorLine = doc.lineAt(cursorPos).number;
        const now = Date.now();
        const sectionContext = detectActiveListSectionContext(doc, cursorPos);
        const contextSnapshot = buildIntentContextSnapshot(
          doc,
          cursorPos,
          sectionContext,
        );
        const currentContextVector = buildTokenFrequencyMap(contextSnapshot);
        let resetBiasForThisPass = now < this.intentShiftUntil;

        if (
          this.previousContextVector &&
          currentContextVector.size > 0
        ) {
          const contextSimilarity = cosineSimilarityFromTokenMaps(
            this.previousContextVector,
            currentContextVector,
          );
          if (contextSimilarity < INTENT_SHIFT_COSINE_THRESHOLD) {
            this.intentShiftUntil = now + INTENT_SHIFT_RESET_WINDOW_MS;
            resetBiasForThisPass = true;
            this.stableInline = null;
            this.stableSection = null;
            this.stableEnd = null;
          }
        }

        if (currentContextVector.size > 0) {
          this.previousContextVector = currentContextVector;
        }

        let inlineLayerActive = false;

        if (options.inlineSuggestion) {
          const sentenceAnchor = findLastCompletedSentenceAnchor(doc, cursorPos);
          const cursorAtSentenceOrLineEnd = isCursorAtSentenceOrLineEnd(
            doc,
            cursorPos,
          );

          let inlineSuggestion = options.inlineSuggestion;
          if (
            this.stableInline &&
            !resetBiasForThisPass &&
            this.stableInline.anchorLine === cursorLine &&
            now < this.stableInline.until
          ) {
            const stableCandidate = options.sectionCandidates.find(
              (candidate) => candidate.path === this.stableInline?.path,
            );
            if (
              stableCandidate &&
              inlineSuggestion.similarity <=
                this.stableInline.similarity +
                  SUGGESTION_SIGNIFICANT_IMPROVEMENT_DELTA
            ) {
              inlineSuggestion = stableCandidate;
            }
          }

          if (sentenceAnchor && cursorAtSentenceOrLineEnd) {
            const { anchorPos, anchorLine, sentence } = sentenceAnchor;
            const editingInlineLocation =
              options.isActivelyTyping && Math.abs(cursorLine - anchorLine) <= 1;
            const anchorVisibleInViewport =
              anchorPos >= view.viewport.from && anchorPos <= view.viewport.to;
            const cursorAlignedWithAnchor =
              cursorLine === anchorLine && cursorPos >= anchorPos;

            if (
              !editingInlineLocation &&
              anchorVisibleInViewport &&
              cursorAlignedWithAnchor
            ) {
              const triggerPhrase = extractInlineTriggerPhrase(
                sentence,
                inlineSuggestion,
              );

              if (
                !this.stableInline ||
                this.stableInline.path !== inlineSuggestion.path ||
                this.stableInline.anchorLine !== anchorLine ||
                now >= this.stableInline.until
              ) {
                this.stableInline = {
                  path: inlineSuggestion.path,
                  anchorLine,
                  similarity: inlineSuggestion.similarity,
                  until: now + SUGGESTION_STABILITY_WINDOW_MS,
                };
              }

              // Only one inline suggestion can appear per viewport.
              decorations.push(
                Decoration.widget({
                  widget: new InlineContextSuggestionWidget(
                    inlineSuggestion,
                    triggerPhrase,
                    resolveSuggestionConfidence(inlineSuggestion.similarity),
                    options.onInlineAccept,
                  ),
                  side: -1,
                }).range(anchorPos),
              );
              inlineLayerActive = true;
            }
          }
        }

        if (
          !inlineLayerActive &&
          options.showSectionSuggestions &&
          options.sectionCandidates.length > 0
        ) {
          if (sectionContext) {
            let sectionPlan = buildSectionScopedSuggestions(
              sectionContext,
              options.sectionCandidates,
              "section-primary",
              options.allowForcedSectionMinimum,
              resetBiasForThisPass,
            );

            if (sectionPlan.deferredMinimum) {
              options.onSectionMinimumDeferred();
            }

            const sectionContextKey = `${sectionContext.heading.lineNumber}:${sectionContext.sectionStartLine}:${sectionContext.sectionEndLine}`;
            if (
              this.stableSection &&
              !resetBiasForThisPass &&
              this.stableSection.contextKey === sectionContextKey &&
              now < this.stableSection.until
            ) {
              const existingTitles = new Set(
                sectionContext.listItems
                  .map((item) => normalizeSuggestionText(item.content))
                  .filter(Boolean),
              );

              const stableSuggestions = this.stableSection.paths
                .map((path) =>
                  options.sectionCandidates.find((candidate) => candidate.path === path),
                )
                .filter((candidate): candidate is EnrichedSuggestion => Boolean(candidate))
                .filter((candidate) =>
                  !existingTitles.has(normalizeSuggestionText(candidate.title)),
                );

              if (stableSuggestions.length > 0) {
                const shouldKeepStableSuggestions =
                  sectionPlan.topSignalScore <=
                  this.stableSection.topSignalScore +
                    SUGGESTION_SIGNIFICANT_IMPROVEMENT_DELTA;

                if (shouldKeepStableSuggestions) {
                  sectionPlan = {
                    suggestions: stableSuggestions.slice(0, SECTION_DISPLAY_CAP),
                    lowConfidencePaths: new Set(this.stableSection.lowConfidencePaths),
                    deferredMinimum: false,
                    topSignalScore: this.stableSection.topSignalScore,
                  };
                }
              }
            }

            const sectionAnchorVisible =
              sectionContext.anchorPos >= view.viewport.from &&
              sectionContext.anchorPos <= view.viewport.to;
            const cursorWithinSection =
              cursorLine >= sectionContext.sectionStartLine &&
              cursorLine <= sectionContext.sectionEndLine;

            if (
              sectionPlan.suggestions.length > 0 &&
              sectionAnchorVisible &&
              cursorWithinSection
            ) {
              if (
                !this.stableSection ||
                this.stableSection.contextKey !== sectionContextKey ||
                now >= this.stableSection.until
              ) {
                this.stableSection = {
                  contextKey: sectionContextKey,
                  paths: sectionPlan.suggestions.map((suggestion) => suggestion.path),
                  lowConfidencePaths: [...sectionPlan.lowConfidencePaths],
                  topSignalScore: sectionPlan.topSignalScore,
                  until: now + SUGGESTION_STABILITY_WINDOW_MS,
                };
              }

              decorations.push(
                Decoration.widget({
                  widget: new SectionListSuggestionsWidget(
                    sectionPlan.suggestions,
                    sectionContext.listPrefix,
                    sectionPlan.lowConfidencePaths,
                    (suggestion) => options.onSectionAccept(suggestion, sectionContext),
                  ),
                  side: 1,
                }).range(sectionContext.anchorPos),
              );
            }
          }
        }

        if (options.showEndSuggestions && options.endSuggestions.length > 0) {
          const nearEndStartLine = Math.max(1, doc.lines - 2);
          const editingEndLocation =
            options.isActivelyTyping && cursorLine >= nearEndStartLine;

          if (!editingEndLocation) {
            let endSuggestions = options.endSuggestions;
            if (this.stableEnd && now < this.stableEnd.until) {
              const topIncomingSimilarity = endSuggestions[0]?.similarity ?? 0;
              const shouldKeepStableSuggestions =
                !resetBiasForThisPass &&
                topIncomingSimilarity <=
                this.stableEnd.topSimilarity +
                  SUGGESTION_SIGNIFICANT_IMPROVEMENT_DELTA;

              if (shouldKeepStableSuggestions) {
                const stableSuggestions = this.stableEnd.paths
                  .map((path) =>
                    options.endSuggestions.find((suggestion) => suggestion.path === path),
                  )
                  .filter((suggestion): suggestion is EnrichedSuggestion => Boolean(suggestion));
                if (stableSuggestions.length > 0) {
                  endSuggestions = stableSuggestions;
                }
              }
            }

            if (
              !this.stableEnd ||
              now >= this.stableEnd.until
            ) {
              this.stableEnd = {
                paths: endSuggestions.map((suggestion) => suggestion.path),
                topSimilarity: endSuggestions[0]?.similarity ?? 0,
                until: now + SUGGESTION_STABILITY_WINDOW_MS,
              };
            }

            decorations.push(
              Decoration.widget({
                widget: new EndOfNoteSuggestionsWidget(
                  endSuggestions,
                  options.nextStepSuggestions,
                  options.onEndAccept,
                ),
                side: 1,
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
              ),
              side: 1,
            }).range(doc.length),
          );
        }

        if (decorations.length === 0) return Decoration.none;

        return Decoration.set(decorations, true);
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
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
}: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const viewRef = useRef<EditorView | null>(null);
  const contentRef = useRef(content);
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
  const sectionEnterAcceptRef = useRef<(view: EditorView) => boolean>(() => false);

  const [editorWidth, setEditorWidth] = useState(50); // percentage
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [editorMountTick, setEditorMountTick] = useState(0);
  const [isActivelyTyping, setIsActivelyTyping] = useState(false);
  const [isSuggestionIdle, setIsSuggestionIdle] = useState(false);
  const [isSectionPauseReady, setIsSectionPauseReady] = useState(false);
  const [hasSectionEnterTrigger, setHasSectionEnterTrigger] = useState(false);
  const [, setSectionRetryPending] = useState(false);
  const [allowForcedSectionMinimum, setAllowForcedSectionMinimum] = useState(false);
  const [hasFlowTrigger, setHasFlowTrigger] = useState(false);
  const [isNearNoteEnd, setIsNearNoteEnd] = useState(false);
  const [dismissedInlinePaths, setDismissedInlinePaths] = useState<Set<string>>(
    new Set(),
  );
  const [imageLightbox, setImageLightbox] = useState<{
    src: string;
    alt: string;
  } | null>(null);
  const isSpecialTab = !!specialContent;

  const readVimModeSetting = useCallback((): boolean => {
    try {
      const saved = localStorage.getItem("notework-settings");
      if (!saved) return false;
      const parsed = JSON.parse(saved) as { vimMode?: boolean };
      return !!parsed.vimMode;
    } catch {
      return false;
    }
  }, []);

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
  const nextStepEndSuggestions = useMemo(
    () =>
      activeNextStepSuggestions
        .filter((suggestion) => suggestion.similarity >= 0.35)
        .slice(0, 3),
    [activeNextStepSuggestions],
  );
  const sectionSuggestionCandidates = useMemo(
    () => activeSuggestions.slice(0, 24),
    [activeSuggestions],
  );

  const showEndSuggestionContent =
    !isSpecialTab &&
    (activeSuggestions.length > 0 || nextStepEndSuggestions.length > 0) &&
    !isActivelyTyping &&
    (isSuggestionIdle || isNearNoteEnd || hasFlowTrigger);

  const showSectionSuggestionContent =
    !isSpecialTab &&
    sectionSuggestionCandidates.length > 0 &&
    ((isSectionPauseReady && !isActivelyTyping) || hasSectionEnterTrigger);

  const highConfidenceInlineSuggestion = useMemo(() => {
    if (!(isSuggestionIdle || hasFlowTrigger) || isSpecialTab || isActivelyTyping) {
      return null;
    }
    return (
      activeSuggestions.find(
        (suggestion) =>
          suggestion.similarity >= 0.82 &&
          !dismissedInlinePaths.has(suggestion.path),
      ) || null
    );
  }, [
    activeSuggestions,
    dismissedInlinePaths,
    hasFlowTrigger,
    isActivelyTyping,
    isSuggestionIdle,
    isSpecialTab,
  ]);

  const handleInlineContextAccept = useCallback(
    (path: string) => {
      setDismissedInlinePaths((prev) => {
        const next = new Set(prev);
        next.add(path);
        return next;
      });
      onAcceptSuggestion?.(path, "related");
    },
    [onAcceptSuggestion],
  );

  const handleSectionSuggestionAccept = useCallback(
    (suggestion: EnrichedSuggestion, context: ActiveListSectionContext) => {
      const view = viewRef.current;
      if (!view) return;
      insertSectionSuggestionIntoDoc(view, suggestion, context);
      setSectionRetryPending(false);
      setAllowForcedSectionMinimum(false);
    },
    [],
  );

  const markSectionMinimumDeferred = useCallback(() => {
    setSectionRetryPending(true);
    setAllowForcedSectionMinimum(false);
  }, []);

  const tryAcceptSectionSuggestionOnEnter = useCallback(
    (view: EditorView): boolean => {
      if (highConfidenceInlineSuggestion) return false;
      if (!showSectionSuggestionContent) return false;

      const context = detectActiveListSectionContext(
        view.state.doc,
        view.state.selection.main.head,
      );
      if (!context) return false;

      let sectionPlan = buildSectionScopedSuggestions(
        context,
        sectionSuggestionCandidates,
        "section-enter-primary",
        allowForcedSectionMinimum,
      );

      if (sectionPlan.deferredMinimum) {
        markSectionMinimumDeferred();
      }
      if (sectionPlan.suggestions.length === 0) return false;

      insertSectionSuggestionIntoDoc(view, sectionPlan.suggestions[0], context);
      setSectionRetryPending(false);
      setAllowForcedSectionMinimum(false);
      return true;
    },
    [
      allowForcedSectionMinimum,
      highConfidenceInlineSuggestion,
      markSectionMinimumDeferred,
      sectionSuggestionCandidates,
      showSectionSuggestionContent,
    ],
  );

  sectionEnterAcceptRef.current = tryAcceptSectionSuggestionOnEnter;

  const markActiveTyping = useCallback(() => {
    setIsActivelyTyping(true);
    if (typingPauseTimerRef.current) {
      window.clearTimeout(typingPauseTimerRef.current);
    }
    typingPauseTimerRef.current = window.setTimeout(() => {
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
    setDismissedInlinePaths(new Set());
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
    };
  }, []);

  useEffect(() => {
    if (isSpecialTab) {
      setIsNearNoteEnd(false);
      return;
    }

    const handleScroll = () => updateEndSuggestionProximity();
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
    const state = EditorState.create({
      doc: content,
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
          suggestionContentPlugin({
            inlineSuggestion: highConfidenceInlineSuggestion,
            endSuggestions: endOfNoteSuggestions,
            nextStepSuggestions: nextStepEndSuggestions,
            sectionCandidates: sectionSuggestionCandidates,
            showEndSuggestions: showEndSuggestionContent,
            showSectionSuggestions: showSectionSuggestionContent,
            allowForcedSectionMinimum,
            isActivelyTyping,
            onInlineAccept: handleInlineContextAccept,
            onEndAccept: (path) => onAcceptSuggestion?.(path, "related"),
            onSectionAccept: handleSectionSuggestionAccept,
            onSectionMinimumDeferred: markSectionMinimumDeferred,
          }),
        ),
        EditorView.domEventHandlers({
          keydown: (event, view) => {
            if (event.key !== "Enter") return false;
            if (!sectionEnterAcceptRef.current(view)) return false;
            event.preventDefault();
            return true;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const isUserEdit = update.transactions.some(
              (tr) =>
                tr.isUserEvent("input") ||
                tr.isUserEvent("delete") ||
                tr.isUserEvent("paste") ||
                tr.isUserEvent("move"),
            );
            onContentChange(update.state.doc.toString(), isUserEdit);
            if (isUserEdit) {
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
        }),
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
          },
          ".cm-dropCursor": {
            borderLeft: "2px solid var(--editor-caret)",
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
    toggleVimMode(view, readVimModeSetting());
    setEditorMountTick((tick) => tick + 1);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [activeTabId, isSpecialTab]); // Re-create when tab changes

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
        suggestionContentPlugin({
          inlineSuggestion: highConfidenceInlineSuggestion,
          endSuggestions: endOfNoteSuggestions,
          nextStepSuggestions: nextStepEndSuggestions,
          sectionCandidates: sectionSuggestionCandidates,
          showEndSuggestions: showEndSuggestionContent,
          showSectionSuggestions: showSectionSuggestionContent,
          allowForcedSectionMinimum,
          isActivelyTyping,
          onInlineAccept: handleInlineContextAccept,
          onEndAccept: (path) => onAcceptSuggestion?.(path, "related"),
          onSectionAccept: handleSectionSuggestionAccept,
          onSectionMinimumDeferred: markSectionMinimumDeferred,
        }),
      ),
    });
  }, [
    allowForcedSectionMinimum,
    didPressEnter,
    endOfNoteSuggestions,
    nextStepEndSuggestions,
    handleInlineContextAccept,
    handleSectionSuggestionAccept,
    highConfidenceInlineSuggestion,
    isActivelyTyping,
    isSpecialTab,
    markSectionMinimumDeferred,
    markSectionEnterTrigger,
    markSectionPauseReady,
    onAcceptSuggestion,
    sectionSuggestionCandidates,
    showSectionSuggestionContent,
    showEndSuggestionContent,
  ]);

  // Update content when it changes externally (tab switch or remote broadcast)
  useEffect(() => {
    if (isSpecialTab) return;
    if (viewRef.current) {
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
          annotations: Transaction.userEvent.of('setContent'),
        });
      }
    }
  }, [content, isSpecialTab]);

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

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const app = (window as any).__oo_app;
    if (!app) return;

    const menu = new Menu();

    const selection = viewRef.current?.state.sliceDoc(
      viewRef.current.state.selection.main.from,
      viewRef.current.state.selection.main.to
    ) || '';
    const searchTitle = selection 
      ? `Search for "${selection.length > 20 ? selection.substring(0, 20) + '...' : selection}"`
      : 'Search for selection';

    menu.addItem((item: any) => item.setTitle('Add link').setIcon('link').onClick(() => {}));
    menu.addItem((item: any) => item.setTitle('Add external link').setIcon('external-link').onClick(() => {}));
    menu.addSeparator();
    menu.addItem((item: any) => item.setTitle(searchTitle).setIcon('search').onClick(() => {}));
    menu.addItem((item: any) => item.setTitle('Extract current selection...').setIcon('scissors').onClick(() => {}));
    menu.addSeparator();
    
    // Native Obsidian submenus represented directly for now
    menu.addItem((item: any) => item.setTitle('Format').setIcon('type').onClick(() => {}));
    menu.addItem((item: any) => item.setTitle('Paragraph').setIcon('align-left').onClick(() => {}));
    menu.addItem((item: any) => item.setTitle('Insert').setIcon('plus-circle').onClick(() => {}));
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

  return (
    <>


      {/* Inline annotation content */}
      {annotation && isInsightVisible && (
        <div className="editor-annotation readable-insight">
          <div className="editor-annotation-header">
            <span className="editor-annotation-title">
              <Lightbulb size={14} style={{ marginRight: 6 }} />
              Note Insight
            </span>
            <button className="editor-annotation-close" onClick={() => toggleInsight(false)} title="Close Insight">
              <X size={14} />
            </button>
          </div>
          <div className="editor-annotation-text">{annotation}</div>
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
                display:
                  viewMode === "preview" || viewMode === "split"
                    ? "block"
                    : "none",
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
              />
            </div>
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
