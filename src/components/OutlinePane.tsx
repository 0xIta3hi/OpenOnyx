/**
 * Outline Pane - Document Structure Navigation
 *
 * Displays a hierarchical view of headings in the current note,
 * allowing quick navigation to any section.
 */

import React, { useMemo } from "react";
import { List, ChevronRight } from "lucide-react";

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

export function OutlinePane({
  content,
  onHeadingClick,
  visible,
}: OutlinePaneProps) {
  // Extract headings from markdown content
  const headings = useMemo(() => {
    if (!content) return [];

    const lines = content.split("\n");
    const result: Heading[] = [];

    lines.forEach((line, index) => {
      // Match ATX headings (# Heading)
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        result.push({
          level: match[1].length,
          text: match[2].replace(/[#*_`\[\]]/g, "").trim(),
          line: index + 1,
        });
      }
    });

    return result;
  }, [content]);

  if (!visible) return null;

  return (
    <div className="flex flex-col h-full border-l border-(--border-subtle) bg-(--bg-secondary)">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-(--border-subtle)">
        <List size={14} strokeWidth={2} className="text-(--text-muted)" />
        <span className="text-xs font-semibold uppercase tracking-wider text-(--text-muted)">Outline</span>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-(--bg-active) text-(--text-secondary) ml-auto">{headings.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {headings.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-(--text-muted)">No headings found</div>
        ) : (
          headings.map((heading, index) => (
            <button
              key={`${heading.line}-${index}`}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 border-none bg-transparent text-left cursor-pointer transition-colors duration-100 hover:bg-(--bg-hover) text-(--text-secondary) hover:text-(--text-primary)"
              onClick={() => onHeadingClick(heading.line)}
              style={{ paddingLeft: `${12 + (heading.level - 1) * 12}px` }}
            >
              <ChevronRight size={12} className="opacity-50 shrink-0" />
              <span className="text-[12.5px] truncate">{heading.text}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
