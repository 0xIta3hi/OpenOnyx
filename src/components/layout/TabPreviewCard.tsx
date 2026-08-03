/**
 * TabPreviewCard — Rich floating hover preview for titlebar tabs
 *
 * Renders a scaled-down miniature of the actual note content including:
 * - Formatted markdown (headings, bold, italic, lists, code, blockquotes)
 * - Embedded image thumbnails
 * - YouTube embed placeholders
 * - Canvas/document structure
 *
 * Center-aligned below the hovered tab via a React portal.
 */
import React, { useEffect, useState, useRef, useMemo } from "react";
import ReactDOM from "react-dom";
import { getAPI } from "../../utils/api";

/* ── Constants ─────────────────────────────────────── */
const CARD_WIDTH = 240;
const CARD_CONTENT_HEIGHT = 260;
const HOVER_DELAY_MS = 180;
const SCALE_FACTOR = 0.55; // scale-down for miniature effect

/* ── Types ─────────────────────────────────────────── */
interface TabPreviewCardProps {
  tabName: string;
  tabPath: string;
  targetRect: DOMRect | null;
  visible: boolean;
}

/* ── Markdown-to-HTML mini renderer ────────────────── */

function stripFrontmatter(md: string): string {
  return md.replace(/^---[\s\S]*?---\s*/m, "").trim();
}

/** Extract YouTube video ID from common embed/link patterns */
function extractYouTubeId(url: string): string | null {
  const m =
    url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/) ||
    url.match(/!\[.*?\]\(.*?youtube.*?([a-zA-Z0-9_-]{11}).*?\)/);
  return m ? m[1] : null;
}

/** Convert a subset of markdown to safe inline HTML for preview rendering */
function markdownToPreviewHTML(raw: string): string {
  const md = stripFrontmatter(raw);
  const lines = md.split("\n");
  const htmlParts: string[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code fences
    if (line.trimStart().startsWith("```")) {
      if (inCodeBlock) {
        htmlParts.push(
          `<pre class="tp-code"><code>${escapeHtml(codeBlockLines.join("\n"))}</code></pre>`
        );
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        if (inList) { htmlParts.push("</ul>"); inList = false; }
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      const level = Math.min(headingMatch[1].length, 6);
      htmlParts.push(`<div class="tp-h${level}">${inlineFormat(headingMatch[2])}</div>`);
      continue;
    }

    // Blockquotes
    if (trimmed.startsWith("> ")) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      htmlParts.push(`<div class="tp-blockquote">${inlineFormat(trimmed.slice(2))}</div>`);
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      htmlParts.push('<div class="tp-hr"></div>');
      continue;
    }

    // Images — render as actual thumbnails
    const imgMatch = trimmed.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    if (imgMatch) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      const alt = escapeHtml(imgMatch[1]);
      const src = imgMatch[2];
      const ytId = extractYouTubeId(src);
      if (ytId) {
        htmlParts.push(
          `<div class="tp-yt-thumb"><img src="https://img.youtube.com/vi/${ytId}/mqdefault.jpg" alt="${alt}" class="tp-img" /><div class="tp-yt-play">▶</div></div>`
        );
      } else {
        htmlParts.push(
          `<div class="tp-img-wrap"><img src="${escapeHtml(src)}" alt="${alt}" class="tp-img" /></div>`
        );
      }
      continue;
    }

    // Wikilink embeds ![[filename]]
    const wikiEmbedMatch = trimmed.match(/^!\[\[([^\]]+)\]\]$/);
    if (wikiEmbedMatch) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      const fname = escapeHtml(wikiEmbedMatch[1]);
      const isImg = /\.(png|jpg|jpeg|gif|svg|webp|bmp)$/i.test(fname);
      if (isImg) {
        htmlParts.push(`<div class="tp-img-wrap"><div class="tp-embed-placeholder">🖼 ${fname}</div></div>`);
      } else {
        htmlParts.push(`<div class="tp-embed-placeholder">📄 ${fname}</div>`);
      }
      continue;
    }

    // Unordered list items
    const ulMatch = trimmed.match(/^[-*+]\s+(.+)/);
    if (ulMatch) {
      if (!inList) { htmlParts.push('<ul class="tp-ul">'); inList = true; }
      htmlParts.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list items
    const olMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (olMatch) {
      if (!inList) { htmlParts.push('<ul class="tp-ul">'); inList = true; }
      htmlParts.push(`<li>${inlineFormat(olMatch[1])}</li>`);
      continue;
    }

    // Checkbox items
    const cbMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.+)/);
    if (cbMatch) {
      if (!inList) { htmlParts.push('<ul class="tp-ul">'); inList = true; }
      const checked = cbMatch[1] !== " ";
      htmlParts.push(
        `<li><span class="tp-cb">${checked ? "☑" : "☐"}</span> ${inlineFormat(cbMatch[2])}</li>`
      );
      continue;
    }

    // Regular paragraph
    if (inList) { htmlParts.push("</ul>"); inList = false; }
    htmlParts.push(`<div class="tp-p">${inlineFormat(trimmed)}</div>`);
  }

  if (inList) htmlParts.push("</ul>");
  if (inCodeBlock) {
    htmlParts.push(`<pre class="tp-code"><code>${escapeHtml(codeBlockLines.join("\n"))}</code></pre>`);
  }

  return htmlParts.join("");
}

/** Inline formatting: bold, italic, code, wikilinks, links, strikethrough */
function inlineFormat(text: string): string {
  let s = escapeHtml(text);
  // Inline code
  s = s.replace(/`([^`]+)`/g, '<code class="tp-inline-code">$1</code>');
  // Bold + italic
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>");
  // Bold
  s = s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  // Italic
  s = s.replace(/\*(.+?)\*/g, "<i>$1</i>");
  // Strikethrough
  s = s.replace(/~~(.+?)~~/g, "<s>$1</s>");
  // Wikilinks [[page]]
  s = s.replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => {
    return `<span class="tp-wikilink">${alias || target}</span>`;
  });
  // Standard links [text](url)
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '<span class="tp-link">$1</span>');
  // Highlight ==text==
  s = s.replace(/==(.+?)==/g, '<mark class="tp-highlight">$1</mark>');
  return s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ── Component ─────────────────────────────────────── */

export const TabPreviewCard = React.memo(function TabPreviewCard({
  tabName,
  tabPath,
  targetRect,
  visible,
}: TabPreviewCardProps) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Fetch file content on hover
  useEffect(() => {
    if (!visible || !tabPath) {
      setContent("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    const api = getAPI();
    api
      .readFile(tabPath)
      .then((raw) => {
        if (cancelled) return;
        setContent(raw || "");
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setContent("");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible, tabPath]);

  // Render markdown to HTML
  const previewHTML = useMemo(() => {
    if (!content) return "";
    return markdownToPreviewHTML(content);
  }, [content]);

  if (!visible || !targetRect) return null;

  // Center-align below the tab
  let left = targetRect.left + targetRect.width / 2 - CARD_WIDTH / 2;
  const top = targetRect.bottom + 8;
  // Clamp to viewport edges
  left = Math.max(8, Math.min(left, window.innerWidth - CARD_WIDTH - 8));

  return ReactDOM.createPortal(
    <div
      className="tab-preview-portal"
      style={{
        position: "fixed",
        left,
        top,
        width: CARD_WIDTH,
        zIndex: 9999,
        pointerEvents: "none",
        animation: "tabPreviewFadeIn 120ms ease-out",
      }}
    >
      {/* ── Title badge ── */}
      <div className="tab-preview-title-badge">
        {tabName}
      </div>

      {/* ── Content preview card ── */}
      <div className="tab-preview-card">
        {loading ? (
          <div className="tab-preview-loading">
            <div className="tab-preview-skeleton" />
            <div className="tab-preview-skeleton" style={{ width: "72%" }} />
            <div className="tab-preview-skeleton" style={{ width: "55%" }} />
          </div>
        ) : previewHTML ? (
          <div className="tab-preview-content-scaler">
            <div
              ref={contentRef}
              className="tab-preview-content-inner"
              dangerouslySetInnerHTML={{ __html: previewHTML }}
            />
          </div>
        ) : (
          <div className="tab-preview-empty">Empty note</div>
        )}
      </div>
    </div>,
    document.body
  );
});

export { HOVER_DELAY_MS };
