/**
 * Link Preview Component
 *
 * Shows a tooltip preview when hovering over wiki-links in preview mode.
 * Displays the first few lines of the linked note's content.
 */

import React, { useState, useEffect, useRef } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

interface LinkPreviewProps {
  noteName: string;
  content: string | null;
  position: { x: number; y: number };
  onClose: () => void;
}

export function LinkPreview({
  noteName,
  content,
  position,
  onClose,
}: LinkPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);

  // Render first ~200 chars of content as preview
  const previewContent = React.useMemo(() => {
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
  }, [content]);

  // Position adjustment to keep within viewport
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  useEffect(() => {
    if (previewRef.current) {
      const rect = previewRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let x = position.x;
      let y = position.y;

      // Adjust horizontal
      if (x + rect.width > vw - 20) {
        x = Math.max(20, vw - rect.width - 20);
      }

      // Adjust vertical
      if (y + rect.height > vh - 20) {
        y = Math.max(20, position.y - rect.height - 10);
      }

      setAdjustedPosition({ x, y });
    }
  }, [position]);

  return (
    <div
      ref={previewRef}
      className="link-preview"
      style={{
        position: "fixed",
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        zIndex: 10000,
      }}
      onMouseLeave={onClose}
    >
      <div className="link-preview-header">
        <span className="link-preview-title">{noteName}</span>
      </div>
      <div
        className="link-preview-content"
        dangerouslySetInnerHTML={{ __html: previewContent }}
      />
    </div>
  );
}

// CSS for link preview (add to index.css)
export const linkPreviewStyles = `
.link-preview {
  background: var(--bg-elevated);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  max-width: 400px;
  max-height: 300px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.link-preview-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-secondary);
}

.link-preview-title {
  font-weight: 600;
  font-size: var(--text-sm);
  color: var(--text-link);
}

.link-preview-content {
  padding: 12px;
  overflow: auto;
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--text-secondary);
}

.link-preview-content p {
  margin: 0 0 8px 0;
}

.link-preview-content p:last-child {
  margin-bottom: 0;
}

.link-preview-content .preview-empty {
  color: var(--text-muted);
  font-style: italic;
}

.link-preview-content h1,
.link-preview-content h2,
.link-preview-content h3 {
  font-size: var(--text-base);
  margin: 0 0 8px 0;
}

.link-preview-content code {
  background: var(--bg-code);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.9em;
}
`;
