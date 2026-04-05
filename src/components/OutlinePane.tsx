/**
 * Outline Pane - Document Structure Navigation
 * 
 * Displays a hierarchical view of headings in the current note,
 * allowing quick navigation to any section.
 */

import React, { useMemo } from 'react';
import { List, ChevronRight } from 'lucide-react';

interface Heading {
  level: number;
  text: string;
  line: number;
}

interface OutlinePaneProps {
  content: string;
  onHeadingClick: (line: number) => void;
  visible: boolean;
}

export function OutlinePane({ content, onHeadingClick, visible }: OutlinePaneProps) {
  // Extract headings from markdown content
  const headings = useMemo(() => {
    if (!content) return [];
    
    const lines = content.split('\n');
    const result: Heading[] = [];
    
    lines.forEach((line, index) => {
      // Match ATX headings (# Heading)
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        result.push({
          level: match[1].length,
          text: match[2].replace(/[#*_`\[\]]/g, '').trim(),
          line: index,
        });
      }
    });
    
    return result;
  }, [content]);

  if (!visible) return null;

  return (
    <div className="outline-pane">
      <div className="outline-header">
        <List size={14} strokeWidth={2} />
        <span>Outline</span>
        <span className="outline-count">{headings.length}</span>
      </div>
      
      <div className="outline-list">
        {headings.length === 0 ? (
          <div className="outline-empty">
            No headings found
          </div>
        ) : (
          headings.map((heading, index) => (
            <button
              key={`${heading.line}-${index}`}
              className={`outline-item outline-level-${heading.level}`}
              onClick={() => onHeadingClick(heading.line)}
              style={{ '--indent': heading.level - 1 } as React.CSSProperties}
            >
              <ChevronRight size={12} style={{ opacity: 0.5 }} />
              <span className="outline-text">{heading.text}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
