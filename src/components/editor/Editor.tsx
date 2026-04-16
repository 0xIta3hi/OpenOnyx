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

import React, { useEffect, useRef, useCallback, useState } from "react";
import { EditorState } from "@codemirror/state";
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
import {
  linkAutocomplete,
  linkAutocompleteTheme,
  setAvailableNotes,
} from "../../utils/linkAutocomplete";
import { headingFold, foldTheme } from "../../utils/headingFold";

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
  onContentChange: (content: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onLinkClick: (linkName: string, heading?: string) => void;
  onGetNoteContent?: (noteName: string) => string | null;
  onImagePaste?: (file: File) => Promise<string | null>; // Returns image src/path to insert
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
    img.src = this.image.src;
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
}: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const contentRef = useRef(content);
  const wheelRemainderRef = useRef(0);

  const [editorWidth, setEditorWidth] = useState(50); // percentage
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [imageLightbox, setImageLightbox] = useState<{
    src: string;
    alt: string;
  } | null>(null);
  const isSpecialTab = !!specialContent;

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
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onContentChange(update.state.doc.toString());
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

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [activeTabId, isSpecialTab]); // Re-create when tab changes

  // Update content when it changes externally (tab switch)
  useEffect(() => {
    if (isSpecialTab) return;
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
    return () => {
      document.removeEventListener(
        "editor:open-search",
        handleOpenSearch as EventListener,
      );
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSpecialTab]);

  return (
    <>
      {/* Tab Bar */}
      <div className={`editor-tab-bar ${!isSpecialTab ? "with-controls" : ""}`}>
        <div className="editor-tab-scroll">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`editor-tab ${tab.id === activeTabId ? "active" : ""}`}
              onClick={() => onTabSelect(tab.id)}
            >
              <div className="tab-inner">
                {tab.isModified && (
                  <span
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "8px",
                      flexShrink: 0,
                    }}
                  >
                    ●
                  </span>
                )}
                <span className="tab-title">{tab.name}</span>
                <button
                  className="close-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabClose(tab.id);
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        {!isSpecialTab && (
          <div className="editor-tab-controls">
            <div className="view-mode-toggle">
              <button
                className={`view-mode-btn ${viewMode === "editor" ? "active" : ""}`}
                onClick={() => onViewModeChange("editor")}
              >
                Edit
              </button>
              <button
                className={`view-mode-btn ${viewMode === "split" ? "active" : ""}`}
                onClick={() => onViewModeChange("split")}
              >
                Split
              </button>
              <button
                className={`view-mode-btn ${viewMode === "preview" ? "active" : ""}`}
                onClick={() => onViewModeChange("preview")}
              >
                Read
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Editor & Preview Container */}
      <div
        className="editor-container"
        ref={containerRef}
        style={{
          display: "flex",
          flexDirection: "row",
          height: "100%",
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
