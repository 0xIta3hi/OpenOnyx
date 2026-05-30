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

// Beautiful SVG icons for premium look
const CALLOUT_ICONS = {
  note: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  info: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
  tip: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A5 5 0 0 0 8 8c0 1 .4 2.5 1.5 3.5.7.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
  important: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  warning: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  danger: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
  bug: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3 3 0 1 1 6 0v1"/><path d="M12 20c-4.97 0-9-4.03-9-9 0-4.97 4.03-9 9-9s9 4.03 9 9c0 4.97-4.03 9-9 9Z"/><path d="M12 9v11"/><path d="M3 11h18"/><path d="m19 15 3 3"/><path d="m5 15-3 3"/><path d="m19 7 3-3"/><path d="m5 7-3-3"/></svg>`,
  example: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 14h6"/><path d="M9 18h6"/><path d="M9 10h6"/></svg>`,
  quote: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 .25 1 1 1Z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 .25 1 1 1Z"/></svg>`,
  success: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`,
  question: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`,
  abstract: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 1 1 3-3h7z"/></svg>`,
  todo: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></svg>`,
};

// Callout type icons and colors
const CALLOUT_TYPES: Record<string, { icon: string; color: string }> = {
  note: { icon: CALLOUT_ICONS.note, color: "#448aff" },
  info: { icon: CALLOUT_ICONS.info, color: "#448aff" },
  tip: { icon: CALLOUT_ICONS.tip, color: "#00c853" },
  hint: { icon: CALLOUT_ICONS.tip, color: "#00c853" },
  important: { icon: CALLOUT_ICONS.important, color: "#ff5252" },
  warning: { icon: CALLOUT_ICONS.warning, color: "#ff9100" },
  caution: { icon: CALLOUT_ICONS.warning, color: "#ff9100" },
  danger: { icon: CALLOUT_ICONS.danger, color: "#ff5252" },
  error: { icon: CALLOUT_ICONS.danger, color: "#ff5252" },
  bug: { icon: CALLOUT_ICONS.bug, color: "#ff5252" },
  example: { icon: CALLOUT_ICONS.example, color: "#7c4dff" },
  quote: { icon: CALLOUT_ICONS.quote, color: "#9e9e9e" },
  cite: { icon: CALLOUT_ICONS.quote, color: "#9e9e9e" },
  success: { icon: CALLOUT_ICONS.success, color: "#00c853" },
  check: { icon: CALLOUT_ICONS.success, color: "#00c853" },
  done: { icon: CALLOUT_ICONS.success, color: "#00c853" },
  question: { icon: CALLOUT_ICONS.question, color: "#448aff" },
  help: { icon: CALLOUT_ICONS.question, color: "#448aff" },
  faq: { icon: CALLOUT_ICONS.question, color: "#448aff" },
  abstract: { icon: CALLOUT_ICONS.abstract, color: "#00b8d4" },
  summary: { icon: CALLOUT_ICONS.abstract, color: "#00b8d4" },
  tldr: { icon: CALLOUT_ICONS.abstract, color: "#00b8d4" },
  todo: { icon: CALLOUT_ICONS.todo, color: "#448aff" },
  failure: { icon: CALLOUT_ICONS.danger, color: "#ff5252" },
  fail: { icon: CALLOUT_ICONS.danger, color: "#ff5252" },
  missing: { icon: CALLOUT_ICONS.danger, color: "#ff5252" },
};

interface MarkdownPreviewProps {
  content: string;
  onLinkClick: (linkName: string, heading?: string) => void;
  onCheckboxToggle?: (lineIndex: number, checked: boolean) => void;
  onEmbed?: (noteName: string) => string | null;
  onGetLinkPreview?: (noteName: string) => string | null;
  onImageClick?: (src: string, alt: string) => void;
  theme?: string;
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
  theme,
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
    const calloutRegex = /^(>\s*)\[!(\w+)\]([+-]?)(?:[ \t]+(.*))?$/gm;

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

  // Universal Embed Registry: Rules for transforming links and applying themes
  const getSmartEmbed = useCallback((url: string, currentTheme: string) => {
    const isDark = currentTheme === "dark";

    // 1. YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?]+)/);
    if (ytMatch) {
      return {
        src: `https://www.youtube.com/embed/${ytMatch[1]}?vq=hd1080&rel=0`,
        attrs: `allow="fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen`
      };
    }

    // 2. Spotify
    if (url.includes('open.spotify.com/')) {
      const embedUrl = url.includes('/embed/') ? url : url.replace('open.spotify.com/', 'open.spotify.com/embed/');
      return {
        src: embedUrl,
        attrs: `allow="encrypted-media" style="border-radius:12px"`
      };
    }

    // 3. Vimeo
    const vimeoMatch = url.match(/(?:vimeo\.com\/video\/|vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/);
    if (vimeoMatch) {
      return {
        src: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
        attrs: `allow="fullscreen; autoplay; picture-in-picture" allowfullscreen`
      };
    }

    // 4. Generic URL Fallback
    return {
      src: url,
      attrs: `allow="fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen`
    };
  }, []);

  // Generate premium HTML wrapper card for URL previews
  const getUrlPreviewMarkup = useCallback((url: string, currentTheme: string) => {
    let domain = "";
    try {
      domain = new URL(url).hostname;
    } catch (e) {
      domain = url;
    }

    const displayDomain = domain.replace(/^www\./, "");
    
    // Determine category badge
    let badge = "Web Page";
    if (url.match(/(?:youtube\.com|youtu\.be)/)) {
      badge = "YouTube";
    } else if (url.includes("spotify.com")) {
      badge = "Spotify";
    } else if (url.includes("vimeo.com")) {
      badge = "Vimeo";
    } else if (url.endsWith(".pdf") || url.includes(".pdf?")) {
      badge = "PDF";
    } else if (url.match(/\.(mp4|webm|ogg)(?:\?.*)?$/i)) {
      badge = "Video Player";
    } else if (url.match(/\.(mp3|wav|ogg|m4a)(?:\?.*)?$/i)) {
      badge = "Audio Player";
    }

    const config = getSmartEmbed(url, currentTheme);
    const embedSrc = config.src;
    const embedAttrs = config.attrs;
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

    return `<div class="url-preview-card" data-url="${url}">
      <div class="url-preview-header">
        <div class="url-preview-info">
          <img class="url-preview-favicon" src="${faviconUrl}" alt="" onerror="this.style.display='none'">
          <span class="url-preview-title">${displayDomain}</span>
        </div>
        <div class="url-preview-actions">
          <span class="url-preview-badge">${badge}</span>
          <a class="url-preview-action-btn" href="${url}" target="_blank" rel="noopener noreferrer" title="Open in new tab">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          </a>
        </div>
      </div>
      <div class="url-preview-body">
        <iframe class="url-preview-iframe" src="${embedSrc}" ${embedAttrs} style="height:100%; width:100%; aspect-ratio: 16 / 9; border: none;"></iframe>
      </div>
    </div>`;
  }, [getSmartEmbed]);

  // Configure marked for GFM (GitHub Flavored Markdown) support
  const renderedHtml = useMemo(() => {
    if (!content) return "";

    let processed = content;

    // Convert url to preview (iframe) - standalone URLs or markdown links to ANY URL
    processed = processed.replace(
      /^(?:[ \t]*)(https?:\/\/[^\s]+)(?:[ \t]*)$/gm,
      (match, url) => `<div class="url-preview-placeholder" data-url="${url.trim()}"></div>`
    );

    processed = processed.replace(
      /^(?:[ \t]*)\[[^\]]*\]\((https?:\/\/[^\s)]+)\)(?:[ \t]*)$/gm,
      (match, url) => `<div class="url-preview-placeholder" data-url="${url.trim()}"></div>`
    );

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

    // Process wiki-links with alias and heading support
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

    // Render markdown image metadata controls
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
          styleParts.push(`object-position:calc(50% + ${Math.round(offsetX)}px) calc(50% + ${Math.round(offsetY)}px)`);
        }
        const safeAlt = String(alt).replace(/"/g, "&quot;");
        const resolvedSrc = resolveVaultImageSrc(String(src));
        const safeSrc = resolvedSrc.replace(/"/g, "&quot;");
        return `<img src="${safeSrc}" alt="${safeAlt}"${styleParts.length ? ` style="${styleParts.join(";")}"` : ""} />`;
      },
    );

    // Process callouts
    processed = processCallouts(processed);

    // Checkboxes
    let lineNum = 0;
    processed = processed.replace(
      /^(\s*[-*+]\s+)\[([ xX])\]/gm,
      (match, prefix, checked) => {
        const isChecked = checked.toLowerCase() === "x";
        return `${prefix}<input type="checkbox" class="task-checkbox" data-line="${lineNum++}" ${isChecked ? "checked" : ""}>`;
      },
    );

    // Parse markdown to HTML
    let html = marked.parse(processed, { gfm: true, breaks: true }) as string;
    html = closeCallouts(html);

    // --- Unified Smart Embed Resolver ---
    // Handle both raw iframes and Twitter blockquotes
    const themeValue = document.documentElement.getAttribute("data-theme-mode") || (theme === "dark" ? "dark" : "light");

    // Fix Twitter theme in the HTML string itself
    html = html.replace(/<blockquote class="twitter-tweet"/g, `<blockquote class="twitter-tweet" data-theme="${themeValue}"`);

    // Parse URL preview placeholders into premium cards and strip any wrapping paragraphs
    html = html.replace(
      /(?:<p>)?<div class="url-preview-placeholder" data-url="([^"]+)"><\/div>(?:<\/p>)?/g,
      (match, url) => {
        return getUrlPreviewMarkup(url, theme || "dark");
      }
    );

    // Handle all other raw empty iframes via the registry (ignore already-wrapped ones)
    html = html.replace(/<iframe\s+([^>]*src="([^"]+)"[^>]*)><\/iframe>/g, (match, attrs, src) => {
      if (attrs.includes("url-preview-iframe")) {
        return match;
      }
      return getUrlPreviewMarkup(src, theme || "dark");
    });

    // Sanitize
    return DOMPurify.sanitize(html, {
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|vault):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      ADD_ATTR: ["data-link", "data-tag", "data-line", "data-heading", "data-embed", "data-callout", "data-foldable", "data-collapsed", "data-theme", "data-video-id", "data-url", "data-active-player", "checked", "type", "style", "frameborder", "allow", "allowfullscreen", "scrolling", "width", "height", "sandbox", "src", "onmouseover", "onmouseout", "onerror", "viewBox", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "cx", "cy", "r", "x", "y", "rx", "ry", "x1", "y1", "x2", "y2", "d"],
      ADD_TAGS: ["span", "input", "math", "semantics", "mrow", "mi", "mo", "mn", "msup", "mspace", "msqrt", "mfrac", "table", "tbody", "tr", "mtd", "mtr", "annotation", "iframe", "blockquote", "div", "svg", "path", "circle", "line", "rect", "polyline"],
      ADD_DATA_URI_TAGS: ["img"],
    });
  }, [content, onEmbed, theme, getSmartEmbed, getUrlPreviewMarkup]);

  // Handle clicks on wiki-links, tags, and checkboxes
  useEffect(() => {
    const container = previewRef.current;
    if (!container) return;

    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement;

      // Handle image click for fullscreen preview
      if (target.tagName === "IMG" && !target.classList.contains("yt-poster-img") && onImageClick) {
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

  // Manually update the DOM and upgrade iframes injected by plugins
  useEffect(() => {
    if (!previewRef.current) return;

    if (lastHtmlRef.current !== renderedHtml) {
      previewRef.current.innerHTML = renderedHtml;
      lastHtmlRef.current = renderedHtml;

      // Handle Twitter embeds: if twit-blockquote exists, ensure widgets script is loaded and triggered
      if (renderedHtml.includes("twitter-tweet")) {
        // Apply theme to blockquotes before Twitter script processes them
        const tweets = previewRef.current.querySelectorAll("blockquote.twitter-tweet");
        tweets.forEach(tweet => {
          tweet.setAttribute("data-theme", document.documentElement.getAttribute("data-theme-mode") || (theme === "dark" ? "dark" : "light"));
        });

        const injectTwitter = () => {
          if (!(window as any).twttr) {
            const script = document.createElement("script");
            script.src = "https://platform.twitter.com/widgets.js";
            script.async = true;
            document.head.appendChild(script);
          } else if ((window as any).twttr.widgets) {
            (window as any).twttr.widgets.load(previewRef.current);
          }
        };
        injectTwitter();
      }
    }

    // Function to upgrade YouTube iframes into HD Posters
    const upgradeYouTubeIframe = (iframe: HTMLIFrameElement) => {
      const src = iframe.src || "";
      if (!src.includes("youtube.com") && !src.includes("youtu.be")) return;
      if (iframe.dataset.hdPosterApplied || iframe.dataset.activePlayer === "true") return;

      const videoId = src.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?]+)/)?.[1];
      if (!videoId) return;

      iframe.dataset.hdPosterApplied = "true";

      const hdThumb = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      const hqThumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

      const wrapper = document.createElement("div");
      wrapper.className = "yt-hd-poster";
      wrapper.style.cssText = "position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: 12px; overflow: hidden; background: #000; cursor: pointer; margin: 16px 0;";

      wrapper.innerHTML = `
        <img class="yt-poster-img" src="${hdThumb}" onerror="this.src='${hqThumb}'" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; transition: opacity 0.2s;">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 68px; height: 48px; background: rgba(255, 0, 0, 0.9); border-radius: 12px; display: flex; align-items: center; justify-content: center; pointer-events: none; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
          <svg viewBox="0 0 24 24" style="width: 32px; height: 32px; fill: white;"><path d="M8 5v14l11-7z"/></svg>
        </div>
      `;

      wrapper.onmouseover = () => { (wrapper.querySelector('img') as HTMLImageElement).style.opacity = '0.8'; };
      wrapper.onmouseout = () => { (wrapper.querySelector('img') as HTMLImageElement).style.opacity = '1'; };

      wrapper.onclick = () => {
        wrapper.innerHTML = `<iframe data-active-player="true" class="url-preview-iframe" src="https://www.youtube.com/embed/${videoId}?autoplay=1&vq=hd1080" allow="fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen style="width:100%; height:100%; border:none; border-radius: 12px;"></iframe>`;
      };

      if (iframe.parentNode) {
        iframe.parentNode.replaceChild(wrapper, iframe);
      }
    };

    // Upgrade existing iframes
    previewRef.current.querySelectorAll("iframe").forEach((el) => upgradeYouTubeIframe(el as HTMLIFrameElement));

    // Watch for iframes injected asynchronously by plugins (like obsidian-convert-url-to-iframe)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // ELEMENT_NODE
            const el = node as HTMLElement;
            const iframes = el.tagName === "IFRAME" ? [el as HTMLIFrameElement] : Array.from(el.querySelectorAll("iframe"));
            iframes.forEach(upgradeYouTubeIframe);
          }
        });
      });
    });

    observer.observe(previewRef.current, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [renderedHtml, theme]);

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
