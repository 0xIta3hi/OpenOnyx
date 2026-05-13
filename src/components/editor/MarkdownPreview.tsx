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

  // Universal Embed Registry: Rules for transforming links and applying themes
  const getSmartEmbed = useCallback((url: string, currentTheme: string) => {
    const isDark = currentTheme === "dark";
    
    // 1. YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?]+)/);
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

    // 3. Twitter / X (Handled via blockquote + script)
    // Note: Twitter's script reads data-theme on the blockquote
    
    return null;
  }, []);

  // Configure marked for GFM (GitHub Flavored Markdown) support
  const renderedHtml = useMemo(() => {
    if (!content) return "";

    let processed = content;

    // ... (rest of the processing logic) ...
    // Note: I will only replace the relevant sections below for brevity in the tool call
    
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

    // Handle all other iframes via the registry
    html = html.replace(/<iframe\s+([^>]*src="([^"]+)"[^>]*)><\/iframe>/g, (match, attrs, src) => {
      const config = getSmartEmbed(src, theme || "dark");
      if (config) {
        return `<iframe src="${config.src}" ${config.attrs} style="height:100%;width:100%; aspect-ratio: 16 / 9; border: none; border-radius: var(--radius-md);"></iframe>`;
      }
      return match;
    });

    // Sanitize
    return DOMPurify.sanitize(html, {
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|vault):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      ADD_ATTR: ["data-link", "data-tag", "data-line", "data-heading", "data-embed", "data-callout", "data-foldable", "data-collapsed", "data-theme", "data-video-id", "checked", "type", "style", "frameborder", "allow", "allowfullscreen", "scrolling", "width", "height", "sandbox", "src", "onmouseover", "onmouseout", "onerror"],
      ADD_TAGS: ["span", "input", "math", "semantics", "mrow", "mi", "mo", "mn", "msup", "mspace", "msqrt", "mfrac", "table", "tbody", "tr", "mtd", "mtr", "annotation", "iframe", "blockquote", "div", "svg", "path"],
      ADD_DATA_URI_TAGS: ["img"],
    });
  }, [content, onEmbed, theme, getSmartEmbed]);

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
      if (iframe.dataset.hdPosterApplied) return;
      
      const videoId = src.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?]+)/)?.[1];
      if (!videoId) return;

      iframe.dataset.hdPosterApplied = "true";
      
      const hdThumb = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      const hqThumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      
      const wrapper = document.createElement("div");
      wrapper.className = "yt-hd-poster";
      wrapper.style.cssText = "position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: 12px; overflow: hidden; background: #000; cursor: pointer; margin: 16px 0;";
      
      wrapper.innerHTML = `
        <img src="${hdThumb}" onerror="this.src='${hqThumb}'" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; transition: opacity 0.2s;">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 68px; height: 48px; background: rgba(255, 0, 0, 0.9); border-radius: 12px; display: flex; align-items: center; justify-content: center; pointer-events: none; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
          <svg viewBox="0 0 24 24" style="width: 32px; height: 32px; fill: white;"><path d="M8 5v14l11-7z"/></svg>
        </div>
      `;
      
      wrapper.onmouseover = () => { (wrapper.querySelector('img') as HTMLImageElement).style.opacity = '0.8'; };
      wrapper.onmouseout = () => { (wrapper.querySelector('img') as HTMLImageElement).style.opacity = '1'; };
      
      wrapper.onclick = () => {
        wrapper.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&vq=hd1080" allow="fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen style="width:100%; height:100%; border:none; border-radius: 12px;"></iframe>`;
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
