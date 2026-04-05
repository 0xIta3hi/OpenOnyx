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
 * - DOMPurify XSS protection
 */

import React, { useMemo, useEffect, useRef } from 'react';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import DOMPurify from 'dompurify';

// Enable math formatting
marked.use(markedKatex({ throwOnError: false }));

// Callout type icons and colors
const CALLOUT_TYPES: Record<string, { icon: string; color: string }> = {
  note: { icon: '📝', color: '#448aff' },
  info: { icon: 'ℹ️', color: '#448aff' },
  tip: { icon: '💡', color: '#00c853' },
  hint: { icon: '💡', color: '#00c853' },
  important: { icon: '🔥', color: '#ff5252' },
  warning: { icon: '⚠️', color: '#ff9100' },
  caution: { icon: '⚠️', color: '#ff9100' },
  danger: { icon: '🚨', color: '#ff5252' },
  error: { icon: '❌', color: '#ff5252' },
  bug: { icon: '🐛', color: '#ff5252' },
  example: { icon: '📋', color: '#7c4dff' },
  quote: { icon: '💬', color: '#9e9e9e' },
  cite: { icon: '💬', color: '#9e9e9e' },
  success: { icon: '✅', color: '#00c853' },
  check: { icon: '✅', color: '#00c853' },
  done: { icon: '✅', color: '#00c853' },
  question: { icon: '❓', color: '#448aff' },
  help: { icon: '❓', color: '#448aff' },
  faq: { icon: '❓', color: '#448aff' },
  abstract: { icon: '📄', color: '#00b8d4' },
  summary: { icon: '📄', color: '#00b8d4' },
  tldr: { icon: '📄', color: '#00b8d4' },
  todo: { icon: '☑️', color: '#448aff' },
  failure: { icon: '❌', color: '#ff5252' },
  fail: { icon: '❌', color: '#ff5252' },
  missing: { icon: '❌', color: '#ff5252' },
};

interface MarkdownPreviewProps {
  content: string;
  onLinkClick: (linkName: string, heading?: string) => void;
  onCheckboxToggle?: (lineIndex: number, checked: boolean) => void;
  onEmbed?: (noteName: string) => string | null;
}

export function MarkdownPreview({ content, onLinkClick, onCheckboxToggle, onEmbed }: MarkdownPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);

  // Process callouts (Obsidian-style admonitions)
  const processCallouts = (text: string): string => {
    // Match > [!type] or > [!type]+ or > [!type]- with optional title
    const calloutRegex = /^(>\s*)\[!(\w+)\]([+-]?)(?:\s+(.*))?$/gm;
    
    return text.replace(calloutRegex, (match, prefix, type, foldState, title) => {
      const calloutType = type.toLowerCase();
      const config = CALLOUT_TYPES[calloutType] || CALLOUT_TYPES.note;
      const displayTitle = title || calloutType.charAt(0).toUpperCase() + calloutType.slice(1);
      const isFoldable = foldState === '+' || foldState === '-';
      const isCollapsed = foldState === '-';
      
      return `${prefix}<div class="callout callout-${calloutType}" data-callout="${calloutType}" data-foldable="${isFoldable}" data-collapsed="${isCollapsed}" style="--callout-color: ${config.color}">
> <div class="callout-title"><span class="callout-icon">${config.icon}</span><span class="callout-title-text">${displayTitle}</span>${isFoldable ? '<span class="callout-fold">▼</span>' : ''}</div>
> <div class="callout-content">`;
    });
  };

  // Close callout blocks
  const closeCallouts = (html: string): string => {
    // Find callout divs and close their content sections
    return html.replace(/<div class="callout-content">\s*<\/p>/g, '<div class="callout-content">')
               .replace(/<\/blockquote>/g, '</div></div></blockquote>');
  };

  // Configure marked for GFM (GitHub Flavored Markdown) support
  const renderedHtml = useMemo(() => {
    if (!content) return '';

    let processed = content;

    // Process embeds ![[note]] before other processing
    processed = processed.replace(
      /!\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g,
      (match, noteName, heading, displayText) => {
        const embedContent = onEmbed ? onEmbed(noteName) : null;
        if (embedContent) {
          return `<div class="embed-container" data-embed="${noteName}">
            <div class="embed-title">${noteName}${heading ? ' › ' + heading : ''}</div>
            <div class="embed-content">${embedContent}</div>
          </div>`;
        }
        return `<div class="embed-container embed-missing" data-embed="${noteName}">
          <span class="embed-icon">📄</span> ${displayText || noteName} (not found)
        </div>`;
      }
    );

    // Process wiki-links with alias and heading support: [[note|alias]] or [[note#heading]] or [[note#heading|alias]]
    processed = processed.replace(
      /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g,
      (match, noteName, heading, alias) => {
        const displayText = alias || (heading ? `${noteName} › ${heading}` : noteName);
        const dataHeading = heading ? ` data-heading="${heading}"` : '';
        return `<a class="wiki-link" data-link="${noteName}"${dataHeading} href="#">${displayText}</a>`;
      }
    );

    // Process tags
    processed = processed.replace(
      /(?:^|\s)(#[a-zA-Z][a-zA-Z0-9_/-]*)/gm,
      ' <span class="tag" data-tag="$1">$1</span>'
    );

    // Process callouts before markdown parsing
    processed = processCallouts(processed);

    // Add line numbers to checkboxes for toggle support
    let lineNum = 0;
    processed = processed.replace(/^(\s*[-*+]\s+)\[([ xX])\]/gm, (match, prefix, checked) => {
      const isChecked = checked.toLowerCase() === 'x';
      const result = `${prefix}<input type="checkbox" class="task-checkbox" data-line="${lineNum}" ${isChecked ? 'checked' : ''}>`;
      lineNum++;
      return result;
    });

    // Parse markdown to HTML
    let html = marked.parse(processed, {
      gfm: true,
      breaks: true,
    }) as string;

    // Close callout blocks properly
    html = closeCallouts(html);

    // Sanitize to prevent XSS, but allow our custom attributes and elements
    return DOMPurify.sanitize(html, {
      ADD_ATTR: ['data-link', 'data-tag', 'data-line', 'data-heading', 'data-embed', 'data-callout', 'data-foldable', 'data-collapsed', 'checked', 'type', 'style'],
      ADD_TAGS: ['span', 'input', 'math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'mspace', 'msqrt', 'mfrac', 'table', 'tbody', 'tr', 'mtd', 'mtr', 'annotation'],
    });
  }, [content, onEmbed]);

  // Handle clicks on wiki-links, tags, and checkboxes
  useEffect(() => {
    const container = previewRef.current;
    if (!container) return;

    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement;

      // Handle wiki-link clicks
      if (target.classList.contains('wiki-link')) {
        e.preventDefault();
        e.stopPropagation();
        const linkName = target.getAttribute('data-link');
        const heading = target.getAttribute('data-heading');
        if (linkName) {
          onLinkClick(linkName, heading || undefined);
        }
      }

      // Handle checkbox clicks
      if (target.classList.contains('task-checkbox')) {
        const lineIndex = parseInt(target.getAttribute('data-line') || '0', 10);
        const isChecked = (target as HTMLInputElement).checked;
        if (onCheckboxToggle) {
          onCheckboxToggle(lineIndex, isChecked);
        }
      }

      // Handle callout fold toggle
      if (target.classList.contains('callout-fold') || target.classList.contains('callout-title')) {
        const callout = target.closest('.callout');
        if (callout && callout.getAttribute('data-foldable') === 'true') {
          const isCollapsed = callout.getAttribute('data-collapsed') === 'true';
          callout.setAttribute('data-collapsed', isCollapsed ? 'false' : 'true');
        }
      }
    };

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [onLinkClick, onCheckboxToggle]);

  return (
    <div
      ref={previewRef}
      className="markdown-preview"
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
