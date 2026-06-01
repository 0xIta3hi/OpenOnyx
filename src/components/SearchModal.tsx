/**
 * Search Modal / Quick Switcher
 *
 * Full-text search across all vault notes with fuzzy matching.
 * Shows recent files when no search query is entered.
 * Supports keyboard navigation (arrow keys + Enter).
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { Search, Clock, FileText, Star } from "lucide-react";
import { SearchResult, FileEntry } from "../types";
import { debounce, getNoteName } from "../utils/helpers";
import { getAPI } from "../utils/api";

interface SearchModalProps {
  onClose: () => void;
  onSelect: (path: string) => void;
  recentFiles?: string[];
  starredNotes?: string[];
  fileTree?: FileEntry[];
  initialQuery?: string;
  initialMode?: "search" | "switcher";
}

const api = getAPI();

// Get all notes from file tree
function getAllNotes(entries: FileEntry[]): { name: string; path: string }[] {
  const notes: { name: string; path: string }[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory && entry.extension === ".md") {
      notes.push({ name: getNoteName(entry.name), path: entry.path });
    }
    if (entry.children) {
      notes.push(...getAllNotes(entry.children));
    }
  }
  return notes;
}

export function SearchModal({
  onClose,
  onSelect,
  recentFiles = [],
  starredNotes = [],
  fileTree = [],
  initialQuery = "",
  initialMode = "switcher",
}: SearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<"search" | "switcher">(initialMode); // Start in switcher mode
  const inputRef = useRef<HTMLInputElement>(null);

  // Trigger search on mount if initial query is provided in search mode
  useEffect(() => {
    if (initialMode === "search" && initialQuery.trim()) {
      void performSearch(initialQuery);
    }
  }, []);

  // All notes for quick switching
  const allNotes = useMemo(() => getAllNotes(fileTree), [fileTree]);

  // Quick filter for switcher mode (just filename matching, no content search)
  const filteredNotes = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allNotes
      .filter(
        (n) =>
          n.name.toLowerCase().includes(q) || n.path.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [query, allNotes]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced full-text search
  const performSearch = useCallback(
    debounce(async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }
      const res = await api.search(searchQuery);
      setResults(res);
      setSelectedIndex(0);
    }, 200),
    [],
  );

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (mode === "search") {
      performSearch(value);
    }
  };

  // Current display items
  const displayItems = useMemo(() => {
    if (mode === "search") {
      return results.map((r) => ({
        name: getNoteName(r.name),
        path: r.path,
        match: r.matches[0]?.value,
      }));
    } else {
      // Switcher mode: show filtered notes or recent+starred
      if (query.trim()) {
        return filteredNotes;
      } else {
        // Show starred first, then recent
        const items: {
          name: string;
          path: string;
          isStarred?: boolean;
          isRecent?: boolean;
        }[] = [];
        const added = new Set<string>();

        starredNotes.forEach((path) => {
          if (!added.has(path)) {
            items.push({ name: getNoteName(path), path, isStarred: true });
            added.add(path);
          }
        });

        recentFiles.forEach((path) => {
          if (!added.has(path)) {
            items.push({ name: getNoteName(path), path, isRecent: true });
            added.add(path);
          }
        });

        return items.slice(0, 10);
      }
    }
  }, [mode, query, results, filteredNotes, recentFiles, starredNotes]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, displayItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (displayItems[selectedIndex]) {
        onSelect(displayItems[selectedIndex].path);
      }
    } else if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Tab") {
      e.preventDefault();
      setMode((m) => (m === "search" ? "switcher" : "search"));
      setSelectedIndex(0);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-mode-tabs">
          <button
            className={`mode-tab ${mode === "switcher" ? "active" : ""}`}
            onClick={() => {
              setMode("switcher");
              setSelectedIndex(0);
            }}
          >
            <FileText size={14} /> Quick Switch
          </button>
          <button
            className={`mode-tab ${mode === "search" ? "active" : ""}`}
            onClick={() => {
              setMode("search");
              setSelectedIndex(0);
            }}
          >
            <Search size={14} /> Full Search
          </button>
        </div>

        <div className="search-input-wrapper">
          <span className="search-icon">
            {mode === "search" ? <Search size={18} /> : <FileText size={18} />}
          </span>
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            placeholder={
              mode === "search"
                ? "Search note contents..."
                : "Quick switch to note..."
            }
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="search-results">
          {displayItems.length > 0 ? (
            displayItems.map((item: any, index) => (
              <button
                key={item.path}
                className={`search-result-item ${index === selectedIndex ? "selected" : ""}`}
                onClick={() => onSelect(item.path)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="result-icon">
                  {item.isStarred ? (
                    <Star
                      size={14}
                      fill="var(--accent-warning)"
                      stroke="var(--accent-warning)"
                    />
                  ) : item.isRecent ? (
                    <Clock size={14} />
                  ) : (
                    <FileText size={14} />
                  )}
                </span>
                <span className="result-name">{item.name}</span>
                <span className="result-path">{item.path}</span>
                {item.match && (
                  <span className="result-match">
                    {item.match.substring(0, 100)}
                  </span>
                )}
              </button>
            ))
          ) : query ? (
            <div className="empty-state" style={{ padding: "2rem" }}>
              <div className="empty-text">No results found</div>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: "2rem" }}>
              <div className="empty-text">
                {mode === "search"
                  ? "Start typing to search contents..."
                  : recentFiles.length === 0 && starredNotes.length === 0
                    ? "Start typing to find notes..."
                    : "Your starred and recent notes"}
              </div>
            </div>
          )}
        </div>

        <div className="search-footer">
          <span>
            <kbd>↑↓</kbd> Navigate
          </span>
          <span>
            <kbd>↵</kbd> Open
          </span>
          <span>
            <kbd>Tab</kbd> Switch mode
          </span>
          <span>
            <kbd>Esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}
