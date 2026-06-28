import React from "react";
import { Bookmark, X } from "lucide-react";
import type { BookmarkEntry } from "../../types";

interface BookmarksPanelProps {
  bookmarks: BookmarkEntry[];
  activeFilePath: string | null;
  onOpen: (path: string) => void;
  onRemove: (id: string) => void;
}

export function BookmarksPanel({ bookmarks, activeFilePath, onOpen, onRemove }: BookmarksPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-secondary)]">
      <div className="flex min-h-9 items-center justify-center border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
        <Bookmark size={18} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {bookmarks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-5 text-center text-xs text-[var(--text-muted)]">
            <Bookmark size={30} strokeWidth={1.3} />
            <span>No bookmarks yet</span>
            <span>Right-click a file and choose Add bookmark.</span>
          </div>
        ) : bookmarks.map((bookmark) => (
          <div
            key={bookmark.id}
            className={`group mb-0.5 flex min-h-7 items-center gap-2 rounded px-2 text-[13px] ${
              activeFilePath === bookmark.path
                ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            }`}
          >
            <button
              className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent p-0 text-left text-inherit"
              onClick={() => onOpen(bookmark.path)}
              title={bookmark.path}
            >
              <span className="min-w-0 flex-1 truncate">{bookmark.title}</span>
            </button>
            <button
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-0 bg-transparent text-[var(--text-muted)] opacity-0 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] group-hover:opacity-100"
              onClick={() => onRemove(bookmark.id)}
              aria-label={`Remove ${bookmark.title} bookmark`}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
