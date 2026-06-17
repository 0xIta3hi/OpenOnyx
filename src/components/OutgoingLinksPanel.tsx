/**
 * Outgoing Links Panel
 *
 * Shows all links from the current note (what this note links to),
 * both resolved and unresolved (phantom) links.
 */

import React, { useMemo } from "react";
import { ArrowUpRight, FileText, FilePlus } from "lucide-react";

interface OutgoingLink {
  name: string;
  exists: boolean;
}

interface OutgoingLinksPanelProps {
  content: string;
  existingNotes: string[];
  onLinkClick: (linkName: string) => void;
  visible: boolean;
}

export function OutgoingLinksPanel({
  content,
  existingNotes,
  onLinkClick,
  visible,
}: OutgoingLinksPanelProps) {
  // Extract wiki-links from content
  const links = useMemo(() => {
    if (!content) return [];

    const linkRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
    const found = new Set<string>();
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      found.add(match[1].trim());
    }

    // Convert to array with existence check
    const existingSet = new Set(
      existingNotes.map((n) => n.toLowerCase().replace(".md", "")),
    );

    return Array.from(found)
      .map((name) => ({
        name,
        exists: existingSet.has(name.toLowerCase()),
      }))
      .sort((a, b) => {
        // Sort existing first, then alphabetically
        if (a.exists !== b.exists) return a.exists ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [content, existingNotes]);

  if (!visible) return null;

  const existingLinks = links.filter((l) => l.exists);
  const phantomLinks = links.filter((l) => !l.exists);

  return (
    <div className="flex flex-col border-l border-(--border-subtle) bg-(--bg-secondary)">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-(--border-subtle)">
        <ArrowUpRight size={14} strokeWidth={2} className="text-(--text-muted)" />
        <span className="text-xs font-semibold uppercase tracking-wider text-(--text-muted)">Outgoing Links</span>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-(--bg-active) text-(--text-secondary) ml-auto">{links.length}</span>
      </div>

      <div className="overflow-y-auto">
        {links.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-(--text-muted)">No outgoing links</div>
        ) : (
          <>
            {existingLinks.length > 0 && (
              <div className="py-1">
                <div className="flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
                  <FileText size={12} /> Linked Notes ({existingLinks.length})
                </div>
                {existingLinks.map((link) => (
                  <button
                    key={link.name}
                    className="w-full flex items-center gap-2 px-4 py-1.5 bg-transparent border-none text-left cursor-pointer transition-colors duration-100 hover:bg-(--bg-hover)"
                    onClick={() => onLinkClick(link.name)}
                  >
                    <FileText size={14} className="text-(--text-muted) shrink-0" />
                    <span className="text-[12.5px] text-(--text-primary) truncate">{link.name}</span>
                  </button>
                ))}
              </div>
            )}

            {phantomLinks.length > 0 && (
              <div className="py-1 border-t border-(--border-subtle)">
                <div className="flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500/70">
                  <FilePlus size={12} /> Unresolved ({phantomLinks.length})
                </div>
                {phantomLinks.map((link) => (
                  <button
                    key={link.name}
                    className="w-full flex items-center gap-2 px-4 py-1.5 bg-transparent border-none text-left cursor-pointer transition-colors duration-100 hover:bg-(--bg-hover)"
                    onClick={() => onLinkClick(link.name)}
                    title="Click to create this note"
                  >
                    <FilePlus size={14} className="text-amber-500/50 shrink-0" />
                    <span className="text-[12.5px] text-(--text-muted) italic truncate">{link.name}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
