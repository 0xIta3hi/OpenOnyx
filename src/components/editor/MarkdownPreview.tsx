/**
 * Markdown Preview
 *
 * Renders markdown content as styled HTML using the `marked` library.
 * Features:
 * - [[wiki-links]] and [[note|alias]] support
 * - [[note#heading]] header links
 * - #tags with click handling
 * - Clickable checkboxes that update source
 * - Obsidian-style callouts/admonitions
 * - ![[embed]] note embeds
 * - Link preview on hover
 * - DOMPurify XSS protection
 */

import React, {
  useMemo,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { marked } from "marked";
import markedKatex from "marked-katex-extension";
import DOMPurify from "dompurify";
import { resolveVaultImageSrc } from "../../utils/resolveImageSrc";

// Enable math formatting
marked.use(markedKatex({ throwOnError: false }));

// Intercept all markdown images (including reference links) to resolve local vault paths
marked.use({
  renderer: {
    image(token) {
      const { href, title, text } = token;
      const resolvedSrc = resolveVaultImageSrc(href);
      const safeSrc = String(resolvedSrc).replace(/"/g, "&quot;");
      const safeAlt = String(text).replace(/"/g, "&quot;");
      return `<img src="${safeSrc}" alt="${safeAlt}" ${title ? `title="${String(title).replace(/"/g, "&quot;")}"` : ""} />`;
    }
  }
});

// Callout type icons and colors
const CALLOUT_TYPES: Record<string, { icon: string; color: string }> = {
  note: { icon: "📝", color: "#448aff" },
  info: { icon: "ℹ️", color: "#448aff" },
  tip: { icon: "💡", color: "#00c853" },
  hint: { icon: "💡", color: "#00c853" },
  important: { icon: "🔥", color: "#ff5252" },
  warning: { icon: "⚠️", color: "#ff9100" },
  caution: { icon: "⚠️", color: "#ff9100" },
  danger: { icon: "🚨", color: "#ff5252" },
  error: { icon: "❌", color: "#ff5252" },
  bug: { icon: "🐛", color: "#ff5252" },
  example: { icon: "📋", color: "#7c4dff" },
  quote: { icon: "💬", color: "#9e9e9e" },
  cite: { icon: "💬", color: "#9e9e9e" },
  success: { icon: "✅", color: "#00c853" },
  check: { icon: "✅", color: "#00c853" },
  done: { icon: "✅", color: "#00c853" },
  question: { icon: "❓", color: "#448aff" },
  help: { icon: "❓", color: "#448aff" },
  faq: { icon: "❓", color: "#448aff" },
  abstract: { icon: "📄", color: "#00b8d4" },
  summary: { icon: "📄", color: "#00b8d4" },
  tldr: { icon: "📄", color: "#00b8d4" },
  todo: { icon: "☑️", color: "#448aff" },
  failure: { icon: "❌", color: "#ff5252" },
  fail: { icon: "❌", color: "#ff5252" },
  missing: { icon: "❌", color: "#ff5252" },
};

interface MarkdownPreviewProps {
  content: string;
  onLinkClick: (linkName: string, heading?: string) => void;
  onCheckboxToggle?: (lineIndex: number, checked: boolean) => void;
  onEmbed?: (noteName: string) => string | null;
  onGetLinkPreview?: (noteName: string) => string | null;
  onImageClick?: (src: string, alt: string) => void;
}

function parseImageRenderMeta(title?: string): {
  width?: number;
  crop: "contain" | "cover";
  offsetX: number;
  offsetY: number;
} {
  const raw = title || "";
  const widthMatch = raw.match(/(?:^|[\s,])w(?:idth)?=(\d{2,4})/i);
  const cropMatch = raw.match(/(?:^|[\s,])crop=(cover|contain)/i);
  const offsetXMatch = raw.match(/(?:^|[\s,])ox=(-?\d{1,4})/i);
  const offsetYMatch = raw.match(/(?:^|[\s,])oy=(-?\d{1,4})/i);
  const width = widthMatch
    ? Math.max(120, Math.min(1400, Number(widthMatch[1])))
    : undefined;
  const crop = (cropMatch?.[1] as "contain" | "cover") || "contain";
  const offsetX = offsetXMatch
    ? Math.max(-1200, Math.min(1200, Number(offsetXMatch[1])))
    : 0;
  const offsetY = offsetYMatch
    ? Math.max(-1200, Math.min(1200, Number(offsetYMatch[1])))
    : 0;
  return { width, crop, offsetX, offsetY };
}

export function MarkdownPreview({
  content,
  onLinkClick,
  onCheckboxToggle,
  onEmbed,
  onGetLinkPreview,
  onImageClick,
}: MarkdownPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [linkPreview, setLinkPreview] = useState<{
    noteName: string;
    content: string | null;
    position: { x: number; y: number };
  } | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Process callouts (Obsidian-style admonitions)
  const processCallouts = (text: string): string => {
    // Match > [!type] or > [!type]+ or > [!type]- with optional title
    const calloutRegex = /^(>\s*)\[!(\w+)\]([+-]?)(?:\s+(.*))?$/gm;

    return text.replace(
      calloutRegex,
      (match, prefix, type, foldState, title) => {
        const calloutType = type.toLowerCase();
        const config = CALLOUT_TYPES[calloutType] || CALLOUT_TYPES.note;
        const displayTitle =
          title || calloutType.charAt(0).toUpperCase() + calloutType.slice(1);
        const isFoldable = foldState === "+" || foldState === "-";
        const isCollapsed = foldState === "-";

        return `${prefix}<div class="callout callout-${calloutType}" data-callout="${calloutType}" data-foldable="${isFoldable}" data-collapsed="${isCollapsed}" style="--callout-color: ${config.color}">
> <div class="callout-title"><span class="callout-icon">${config.icon}</span><span class="callout-title-text">${displayTitle}</span>${isFoldable ? '<span class="callout-fold">▼</span>' : ""}</div>
> <div class="callout-content">`;
      },
    );
  };

  // Close callout blocks
  const closeCallouts = (html: string): string => {
    // Find callout divs and close their content sections
    return html
      .replace(
        /<div class="callout-content">\s*<\/p>/g,
        '<div class="callout-content">',
      )
      .replace(/<\/blockquote>/g, "</div></div></blockquote>");
  };

  // Configure marked for GFM (GitHub Flavored Markdown) support
  const renderedHtml = useMemo(() => {
    if (!content) return "";

    let processed = content;

    // Process embeds ![[note]] before other processing
    processed = processed.replace(
      /!\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g,
      (match, noteName, heading, displayText) => {
        const embedContent = onEmbed ? onEmbed(noteName) : null;
        if (embedContent) {
          return `<div class="embed-container" data-embed="${noteName}">
            <div class="embed-title">${noteName}${heading ? " › " + heading : ""}</div>
            <div class="embed-content">${embedContent}</div>
          </div>`;
        }
        return `<div class="embed-container embed-missing" data-embed="${noteName}">
          <span class="embed-icon">📄</span> ${displayText || noteName} (not found)
        </div>`;
      },
    );

    // Process wiki-links with alias and heading support: [[note|alias]] or [[note#heading]] or [[note#heading|alias]]
    processed = processed.replace(
      /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g,
      (match, noteName, heading, alias) => {
        const displayText =
          alias || (heading ? `${noteName} › ${heading}` : noteName);
        const dataHeading = heading ? ` data-heading="${heading}"` : "";
        return `<a class="wiki-link" data-link="${noteName}"${dataHeading} href="#">${displayText}</a>`;
      },
    );

    // Process tags
    processed = processed.replace(
      /(?:^|\s)(#[a-zA-Z][a-zA-Z0-9_/-]*)/gm,
      ' <span class="tag" data-tag="$1">$1</span>',
    );

    // Render markdown image metadata controls: ![alt](src "w=420 crop=cover")
    processed = processed.replace(
      /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
      (match, alt, src, title) => {
        const { width, crop, offsetX, offsetY } = parseImageRenderMeta(title);

        const styleParts: string[] = [];
        if (width) {
          styleParts.push(`max-width:${Math.round(width)}px`);
          styleParts.push("width:100%");
        }
        if (crop === "cover") {
          styleParts.push("aspect-ratio:4 / 3");
          styleParts.push("object-fit:cover");
          styleParts.push(
            `object-position:calc(50% + ${Math.round(offsetX)}px) calc(50% + ${Math.round(offsetY)}px)`,
          );
        }

        const safeAlt = String(alt).replace(/"/g, "&quot;");
        const resolvedSrc = resolveVaultImageSrc(String(src));
        const safeSrc = resolvedSrc.replace(/"/g, "&quot;");
        const styleAttr = styleParts.length
          ? ` style="${styleParts.join(";")}"`
          : "";
        return `<img src="${safeSrc}" alt="${safeAlt}"${styleAttr} />`;
      },
    );

    // Process callouts before markdown parsing
    processed = processCallouts(processed);

    // Add line numbers to checkboxes for toggle support
    let lineNum = 0;
    processed = processed.replace(
      /^(\s*[-*+]\s+)\[([ xX])\]/gm,
      (match, prefix, checked) => {
        const isChecked = checked.toLowerCase() === "x";
        const result = `${prefix}<input type="checkbox" class="task-checkbox" data-line="${lineNum}" ${isChecked ? "checked" : ""}>`;
        lineNum++;
        return result;
      },
    );

    // Parse markdown to HTML
    let html = marked.parse(processed, {
      gfm: true,
      breaks: true,
    }) as string;

    // Close callout blocks properly
    html = closeCallouts(html);

    // Smart Iframe Resolver: Automatically "upgrade" standard URLs to their embed versions
    html = html.replace(/<iframe\s+([^>]*src="([^"]+)"[^>]*)><\/iframe>/g, (match, attrs, src) => {
      let embedUrl = src;
      
      // YouTube: Convert watch links to clean embed player
      if (src.includes('youtube.com/watch')) {
        const videoIdMatch = src.match(/[?&]v=([^&]+)/);
        if (videoIdMatch) embedUrl = `https://www.youtube.com/embed/${videoIdMatch[1]}`;
      } else if (src.includes('youtu.be/')) {
        const videoIdMatch = src.match(/youtu\.be\/([^?&]+)/);
        if (videoIdMatch) embedUrl = `https://www.youtube.com/embed/${videoIdMatch[1]}`;
      }
      
      // Spotify: Convert track/album/playlist links to the official mini-player
      else if (src.includes('open.spotify.com/')) {
        if (!src.includes('/embed/')) {
          embedUrl = src.replace('open.spotify.com/', 'open.spotify.com/embed/');
        }
      }

      // If we changed the URL, update the attributes in the tag
      if (embedUrl !== src) {
        const newAttrs = attrs.replace(`src="${src}"`, `src="${embedUrl}"`);
        return `<iframe ${newAttrs}></iframe>`;
      }
      
      return match;
    });

    // Sanitize to prevent XSS, but allow our custom attributes and elements
    return DOMPurify.sanitize(html, {
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|vault):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      ADD_ATTR: [
        "data-link",
        "data-tag",
        "data-line",
        "data-heading",
        "data-embed",
        "data-callout",
        "data-foldable",
        "data-collapsed",
        "checked",
        "type",
        "style",
        "frameborder",
        "allow",
        "allowfullscreen",
        "scrolling",
        "width",
        "height",
        "sandbox",
        "src",
      ],
      ADD_TAGS: [
        "span",
        "input",
        "math",
        "semantics",
        "mrow",
        "mi",
        "mo",
        "mn",
        "msup",
        "mspace",
        "msqrt",
        "mfrac",
        "table",
        "tbody",
        "tr",
        "mtd",
        "mtr",
        "annotation",
        "iframe",
      ],
      ADD_DATA_URI_TAGS: ["img"],
    });
  }, [content, onEmbed]);

  // Handle clicks on wiki-links, tags, and checkboxes
  useEffect(() => {
    const container = previewRef.current;
    if (!container) return;

    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement;

      // Handle image click for fullscreen preview
      if (target.tagName === "IMG" && onImageClick) {
        const image = target as HTMLImageElement;
        if (image.src) {
          e.preventDefault();
          e.stopPropagation();
          onImageClick(image.src, image.alt || "Image");
          return;
        }
      }

      // Handle wiki-link clicks
      if (target.classList.contains("wiki-link")) {
        e.preventDefault();
        e.stopPropagation();
        const linkName = target.getAttribute("data-link");
        const heading = target.getAttribute("data-heading");
        if (linkName) {
          onLinkClick(linkName, heading || undefined);
        }
      }

      // Handle checkbox clicks
      if (target.classList.contains("task-checkbox")) {
        const lineIndex = parseInt(target.getAttribute("data-line") || "0", 10);
        const isChecked = (target as HTMLInputElement).checked;
        if (onCheckboxToggle) {
          onCheckboxToggle(lineIndex, isChecked);
        }
      }

      // Handle callout fold toggle
      if (
        target.classList.contains("callout-fold") ||
        target.classList.contains("callout-title")
      ) {
        const callout = target.closest(".callout");
        if (callout && callout.getAttribute("data-foldable") === "true") {
          const isCollapsed = callout.getAttribute("data-collapsed") === "true";
          callout.setAttribute(
            "data-collapsed",
            isCollapsed ? "false" : "true",
          );
        }
      }
    };

    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [onLinkClick, onCheckboxToggle, onImageClick]);

  // Handle link hover for preview
  useEffect(() => {
    const container = previewRef.current;
    if (!container || !onGetLinkPreview) return;

    const handleMouseEnter = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("wiki-link")) {
        const linkName = target.getAttribute("data-link");
        if (!linkName) return;

        // Clear any existing timeout
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
        }

        // Delay showing preview
        hoverTimeoutRef.current = setTimeout(() => {
          const previewContent = onGetLinkPreview(linkName);
          const rect = target.getBoundingClientRect();
          setLinkPreview({
            noteName: linkName,
            content: previewContent,
            position: { x: rect.left, y: rect.bottom + 5 },
          });
        }, 400); // 400ms delay before showing
      }
    };

    const handleMouseLeave = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("wiki-link")) {
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
        }
        // Small delay before hiding to allow moving to preview
        setTimeout(() => {
          setLinkPreview(null);
        }, 100);
      }
    };

    container.addEventListener("mouseover", handleMouseEnter);
    container.addEventListener("mouseout", handleMouseLeave);

    return () => {
      container.removeEventListener("mouseover", handleMouseEnter);
      container.removeEventListener("mouseout", handleMouseLeave);
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [onGetLinkPreview]);

  // Render preview content for link preview popup
  const renderPreviewContent = useCallback((content: string | null) => {
    if (!content) return '<p class="preview-empty">Note not found</p>';

    // Remove frontmatter
    let text = content.replace(/^---[\s\S]*?---\s*/m, "");

    // Truncate to ~500 chars for preview
    if (text.length > 500) {
      text = text.slice(0, 500) + "...";
    }

    // Render markdown
    const html = marked.parse(text, { async: false }) as string;
    return DOMPurify.sanitize(html);
  }, []);

  // Use a ref to track the last rendered HTML to avoid unnecessary DOM updates that reload iframes
  const lastHtmlRef = useRef<string>("");

  // Manually update the DOM only when the HTML content actually changes
  useEffect(() => {
    if (previewRef.current && lastHtmlRef.current !== renderedHtml) {
      previewRef.current.innerHTML = renderedHtml;
      lastHtmlRef.current = renderedHtml;
    }
  }, [renderedHtml]);

  return (
    <>
      <div
        ref={previewRef}
        className="markdown-preview"
      />

      {/* Link Preview Popup */}
      {linkPreview && (
        <div
          className="link-preview"
          style={{
            position: "fixed",
            left: linkPreview.position.x,
            top: linkPreview.position.y,
            zIndex: 10000,
          }}
          onMouseEnter={() => {
            // Keep preview open while hovering
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
            }
          }}
          onMouseLeave={() => setLinkPreview(null)}
        >
          <div className="link-preview-header">
            <span className="link-preview-title">{linkPreview.noteName}</span>
          </div>
          <div
            className="link-preview-content"
            dangerouslySetInnerHTML={{
              __html: renderPreviewContent(linkPreview.content),
            }}
          />
        </div>
      )}
    </>
  );
}
