/**
 * Backlinks Panel
 *
 * Shows all notes that link to the currently active note,
 * enabling reverse navigation through the knowledge graph.
 */

import React from "react";
import { X } from "lucide-react";
import { getNoteName } from "../utils/helpers";

interface BacklinksPanelProps {
  backlinks: string[];
  onBacklinkClick: (path: string) => void;
  onClose: () => void;
}

export function BacklinksPanel({
  backlinks,
  onBacklinkClick,
  onClose,
}: BacklinksPanelProps) {
  return (
    <div className="flex flex-col h-full border-l border-(--border-subtle) bg-(--bg-secondary)">
      <div className="flex items-center justify-between px-4 py-3 border-b border-(--border-subtle)">
        <span className="text-xs font-semibold uppercase tracking-wider text-(--text-muted)">Backlinks</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-(--bg-active) text-(--text-secondary)">{backlinks.length}</span>
          <button
            className="bg-transparent border-none text-(--text-muted) cursor-pointer p-1 rounded hover:bg-(--bg-hover) hover:text-(--text-primary) transition-colors duration-150"
            onClick={onClose}
            title="Close backlinks panel"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {backlinks.length > 0 ? (
          backlinks.map((link) => (
            <button
              key={link}
              className="w-full flex flex-col gap-0.5 px-4 py-2.5 bg-transparent border-none text-left cursor-pointer transition-colors duration-150 hover:bg-(--bg-hover)"
              onClick={() => onBacklinkClick(link)}
            >
              <span className="text-[13px] font-medium text-(--text-primary)">{getNoteName(link)}</span>
              <span className="text-[11px] text-(--text-muted) truncate">{link}</span>
            </button>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-8 px-4 gap-2">
            <div className="text-2xl opacity-30">&#x1F517;</div>
            <div className="text-xs text-(--text-muted) text-center">
              No backlinks found
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
