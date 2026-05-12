/**
 * Sidebar - File Explorer Panel
 *
 * Shows the vault's file tree with expand/collapse for directories,
 * context menus for file operations, and drag-and-drop support.
 */

import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  FilePlus,
  FolderPlus,
  RefreshCw,
  FileEdit,
  Trash2,
  Star,
  ChevronDown,
  ChevronLeft,
  Search,
  X,
  ArrowUpDown,
  Palette,
  Image,
  FileCode,
  File,
  LayoutGrid,
  ChevronsUpDown,
  Check,
  Library,
  Settings,
} from "lucide-react";
import { FileEntry } from "../types";
import { getNoteName } from "../utils/helpers";

interface SidebarProps {
  visible: boolean;
  fileTree: FileEntry[];
  activeFilePath: string | null;
  starredNotes: string[];
  onFileSelect: (path: string) => void;
  onNewNote: () => void;
  onNewFolder: (parentPath: string) => void;
  onDeleteFile: (path: string, isDir: boolean) => void;
  onRenameFile: (oldPath: string, newName: string) => void;
  onMoveFile: (oldPath: string, newPath: string) => void | Promise<void>;
  onRefresh: () => void;
  onToggleStar: (path: string) => void;
  onCollapse: () => void;
  vaultPath?: string;
  onOpenVault?: () => void;
  onSettings?: () => void;
}

type SortMode = "name" | "modified" | "type";

// ── File Type Helpers ────────────────────────────────────────────────────────


function countChildren(entries: FileEntry[]): number {
  let count = 0;
  for (const e of entries) {
    if (e.isDirectory && e.children) count += countChildren(e.children);
    else count++;
  }
  return count;
}

function sortEntries(entries: FileEntry[], mode: SortMode): FileEntry[] {
  const sorted = [...entries].sort((a, b) => {
    // Directories always first
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;

    switch (mode) {
      case "modified":
        return (b.modifiedAt || 0) - (a.modifiedAt || 0);
      case "type": {
        const extA = a.extension || "";
        const extB = b.extension || "";
        if (extA !== extB) return extA.localeCompare(extB);
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }
      case "name":
      default:
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }
  });

  return sorted.map((e) =>
    e.isDirectory && e.children
      ? { ...e, children: sortEntries(e.children, mode) }
      : e,
  );
}

function filterTree(entries: FileEntry[], query: string): FileEntry[] {
  if (!query) return entries;
  const q = query.toLowerCase();
  return entries.reduce<FileEntry[]>((acc, entry) => {
    if (entry.isDirectory && entry.children) {
      const filtered = filterTree(entry.children, query);
      if (filtered.length > 0) {
        acc.push({ ...entry, children: filtered });
      }
    } else if (entry.name.toLowerCase().includes(q)) {
      acc.push(entry);
    }
    return acc;
  }, []);
}

export function Sidebar({
  visible,
  fileTree,
  activeFilePath,
  starredNotes,
  onFileSelect,
  onNewNote,
  onNewFolder,
  onDeleteFile,
  onRenameFile,
  onMoveFile,
  onRefresh,
  onToggleStar,
  onCollapse,
  vaultPath,
  onOpenVault,
  onSettings,
}: SidebarProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
    isDir: boolean;
  } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [showStarred, setShowStarred] = useState(true);
  const [filterQuery, setFilterQuery] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showVaultMenu, setShowVaultMenu] = useState(false);
  const vaultMenuRef = useRef<HTMLDivElement>(null);
  const vaultButtonRef = useRef<HTMLButtonElement>(null);
  const renameInFlightRef = useRef(false);
  const filterInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus filter input when shown
  useEffect(() => {
    if (showFilter && filterInputRef.current) {
      filterInputRef.current.focus();
    }
  }, [showFilter]);

  // Click outside handler for vault menu
  useEffect(() => {
    if (!showVaultMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (
        vaultMenuRef.current &&
        !vaultMenuRef.current.contains(e.target as Node) &&
        vaultButtonRef.current &&
        !vaultButtonRef.current.contains(e.target as Node)
      ) {
        setShowVaultMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showVaultMenu]);

  const vaultName = vaultPath ? vaultPath.split(/[/\\]/).pop() : "Vault";

  // Process file tree: filter then sort
  const processedTree = useMemo(() => {
    const filtered = filterTree(fileTree, filterQuery);
    return sortEntries(filtered, sortMode);
  }, [fileTree, filterQuery, sortMode]);

  // When filtering, auto-expand all directories so matches are visible
  const effectiveExpanded = useMemo(() => {
    if (!filterQuery) return expandedDirs;
    const allDirs = new Set<string>();
    function walk(entries: FileEntry[]) {
      for (const e of entries) {
        if (e.isDirectory) {
          allDirs.add(e.path);
          if (e.children) walk(e.children);
        }
      }
    }
    walk(processedTree);
    return allDirs;
  }, [filterQuery, expandedDirs, processedTree]);

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleContextMenu = (
    e: React.MouseEvent,
    path: string,
    isDir: boolean,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, path, isDir });
  };

  const closeContextMenu = () => setContextMenu(null);

  const startRename = (path: string) => {
    renameInFlightRef.current = false;
    setRenamingPath(path);
    setRenameValue(getNoteName(path));
    closeContextMenu();
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (renameInFlightRef.current) return;

    if (renamingPath && renameValue.trim()) {
      renameInFlightRef.current = true;
      onRenameFile(renamingPath, renameValue.trim());
      setTimeout(() => {
        renameInFlightRef.current = false;
      }, 0);
    }
    setRenamingPath(null);
    setRenameValue("");
  };

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, path: string) => {
    e.dataTransfer.setData("text/plain", path);
    e.dataTransfer.effectAllowed = "move";
    setDraggingPath(path);
  };

  const handleDragOver = (e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverPath(targetPath);
  };

  const handleDragLeave = () => {
    setDragOverPath(null);
  };

  const handleDragEnd = () => {
    setDraggingPath(null);
    setDragOverPath(null);
  };

  const handleDrop = async (e: React.DragEvent, targetDir: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPath(null);
    setDraggingPath(null);
    const sourcePath = e.dataTransfer.getData("text/plain");
    
    // Safety check: don't move a folder into itself or its child
    if (sourcePath && targetDir.startsWith(sourcePath + "/")) {
      return;
    }

    if (sourcePath && sourcePath !== targetDir) {
      const parts = sourcePath.split("/");
      const fileName = parts.pop() || sourcePath;
      
      // If we are moving a folder, we need its name too
      const newPath = targetDir ? `${targetDir}/${fileName}` : fileName;
      
      if (sourcePath === newPath) return;

      try {
        await onMoveFile(sourcePath, newPath);
      } catch (err) {
        console.error("Move failed:", err);
      }
    }
  };

  const handleFilterKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setFilterQuery("");
      setShowFilter(false);
    }
  };

  const cycleSortMode = () => {
    setSortMode((prev) => {
      if (prev === "name") return "modified";
      if (prev === "modified") return "type";
      return "name";
    });
  };

  const renderFileTree = (entries: FileEntry[], depth: number = 0) => {
    return entries.map((entry) => {
      const isExpanded = effectiveExpanded.has(entry.path);
      const isActive = entry.path === activeFilePath;
      const isDragOver = entry.path === dragOverPath;
      const isDragging = entry.path === draggingPath;
      const isRenaming = entry.path === renamingPath;
      const childCount = entry.isDirectory && entry.children ? countChildren(entry.children) : 0;

      return (
        <React.Fragment key={entry.path}>
          <button
            className={`file-tree-item ${isActive ? "active" : ""} ${isDragOver ? "drag-over" : ""} ${isDragging ? "dragging" : ""}`}
            onClick={() => {
              if (entry.isDirectory) {
                toggleDir(entry.path);
              } else if (
                entry.extension === ".md" ||
                entry.extension === ".canvas"
              ) {
                onFileSelect(entry.path);
              }
            }}
            onContextMenu={(e) =>
              handleContextMenu(e, entry.path, entry.isDirectory)
            }
            draggable={true}
            onDragStart={(e) => handleDragStart(e, entry.path)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => {
              const targetPath = entry.isDirectory ? entry.path : (entry.path.split('/').slice(0, -1).join('/'));
              handleDragOver(e, targetPath);
            }}
            onDragLeave={handleDragLeave}
            onDrop={(e) => {
              const targetPath = entry.isDirectory ? entry.path : (entry.path.split('/').slice(0, -1).join('/'));
              handleDrop(e, targetPath);
            }}
          >
            {entry.isDirectory && (
              <span className={`chevron ${isExpanded ? "open" : ""}`}>
                <ChevronRight size={14} strokeWidth={2} />
              </span>
            )}

            {isRenaming ? (
              <form onSubmit={handleRenameSubmit} style={{ flex: 1 }}>
                <input
                  className="rename-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={handleRenameSubmit}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              </form>
            ) : (
              <span className="name">
                {entry.isDirectory ? entry.name : getNoteName(entry.name)}
              </span>
            )}
            {entry.isDirectory && childCount > 0 && !isRenaming && (
              <span className="folder-count">{childCount}</span>
            )}
          </button>

          {entry.isDirectory && entry.children && (
            <div className={`file-tree-children-wrapper ${isExpanded ? "open" : ""}`}>
              <div className="file-tree-children">
                {entry.children.length > 0 ? (
                  renderFileTree(sortEntries(entry.children, sortMode), depth + 1)
                ) : (
                  <div className="empty-folder-hint">Empty</div>
                )}
              </div>
            </div>
          )}
        </React.Fragment>
      );
    });
  };

  const getStarredParentPath = (path: string) => {
    const idx = path.lastIndexOf("/");
    if (idx <= 0) return "Vault root";
    return path.slice(0, idx);
  };

  const sortLabel = sortMode === "name" ? "A-Z" : sortMode === "modified" ? "Recent" : "Type";

  return (
    <>
      <div className={`sidebar ${!visible ? "collapsed" : ""}`}>
        <div className="sidebar-header">
          <h3>Explorer</h3>
          <div className="sidebar-actions">
            <button
              className={`sidebar-btn ${showFilter ? "active" : ""}`}
              onClick={() => {
                setShowFilter(!showFilter);
                if (showFilter) setFilterQuery("");
              }}
              title="Filter files (Ctrl+Shift+F)"
            >
              <Search size={16} strokeWidth={1.5} />
            </button>
            <button
              className="sidebar-btn"
              onClick={onNewNote}
              title="New Note"
            >
              <FilePlus size={16} strokeWidth={1.5} />
            </button>
            <button
              className="sidebar-btn"
              onClick={() => onNewFolder("")}
              title="New Folder"
            >
              <FolderPlus size={16} strokeWidth={1.5} />
            </button>
            <button
              className="sidebar-btn"
              onClick={cycleSortMode}
              title={`Sort: ${sortLabel}`}
            >
              <ArrowUpDown size={16} strokeWidth={1.5} />
            </button>
            <button className="sidebar-btn" onClick={onRefresh} title="Refresh">
              <RefreshCw size={16} strokeWidth={1.5} />
            </button>
            <button
              className="sidebar-btn"
              onClick={onCollapse}
              title="Collapse Explorer"
            >
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        {showFilter && (
          <div className="sidebar-filter">
            <Search size={13} className="sidebar-filter-icon" />
            <input
              ref={filterInputRef}
              type="text"
              className="sidebar-filter-input"
              placeholder="Filter files..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              onKeyDown={handleFilterKeyDown}
            />
            {filterQuery && (
              <button
                className="sidebar-filter-clear"
                onClick={() => setFilterQuery("")}
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}

        {/* Sort indicator */}
        {sortMode !== "name" && (
          <div className="sidebar-sort-indicator">
            <ArrowUpDown size={10} />
            <span>Sorted by {sortLabel.toLowerCase()}</span>
          </div>
        )}

        {/* Starred Notes Section */}
        {starredNotes.length > 0 && !filterQuery && (
          <div className="sidebar-section starred-section">
            <button
              className="section-header"
              onClick={() => setShowStarred(!showStarred)}
            >
              <span className="section-chevron">
                {showStarred ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </span>
              <Star size={14} className="section-icon" fill="currentColor" />
              <span>Starred</span>
              <span className="section-count">{starredNotes.length}</span>
            </button>
            {showStarred && (
              <div className="starred-list">
                {starredNotes.map((path) => (
                  <button
                    key={path}
                    className={`file-tree-item starred-item ${activeFilePath === path ? "active" : ""} ${draggingPath === path ? "dragging" : ""}`}
                    onClick={() => onFileSelect(path)}
                    onContextMenu={(e) => handleContextMenu(e, path, false)}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, path)}
                    onDragEnd={handleDragEnd}
                  >
                    <Star
                      size={14}
                      className="star-icon"
                      fill="var(--accent-warning)"
                      stroke="var(--accent-warning)"
                    />
                    <span className="starred-text">
                      <span className="name">{getNoteName(path)}</span>
                      <span className="starred-path">
                        {getStarredParentPath(path)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div
          className={`file-explorer ${dragOverPath === "" ? "drag-over" : ""}`}
          onDragOver={(e) => handleDragOver(e, "")}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, "")}
        >
          {processedTree.length > 0 ? (
            renderFileTree(processedTree)
          ) : filterQuery ? (
            <div className="empty-state" style={{ padding: "2rem 1rem" }}>
              <div style={{ opacity: 0.3, marginBottom: "0.5rem" }}>
                <Search size={36} strokeWidth={1} />
              </div>
              <div className="empty-text" style={{ textAlign: "center" }}>
                No files matching &ldquo;{filterQuery}&rdquo;
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: "2rem 1rem" }}>
              <div style={{ opacity: 0.15, marginBottom: "0.5rem" }}>
                <FolderOpen size={48} strokeWidth={1} />
              </div>
              <div className="empty-text" style={{ textAlign: "center", lineHeight: 1.5 }}>
                No files yet.
                <br />
                Create a new note to get started.
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Footer - Vault Selector & Settings */}
        {vaultPath && (
          <div className="sidebar-footer">
            <button
              ref={vaultButtonRef}
              className={`vault-selector-btn ${showVaultMenu ? "active" : ""}`}
              onClick={() => setShowVaultMenu(!showVaultMenu)}
              title="Switch Vault"
            >
              <ChevronsUpDown size={20} className="vault-selector-icon" />
              <span className="vault-selector-name">{vaultName}</span>
            </button>
            {onSettings && (
              <button
                className="sidebar-settings-btn"
                onClick={onSettings}
                title="Settings"
              >
                <Settings size={16} />
              </button>
            )}
            
            {showVaultMenu && (
              <div className="vault-menu" ref={vaultMenuRef}>
                <div className="vault-menu-header">Current vault</div>
                <button className="vault-menu-item current">
                  <span className="vault-name">{vaultName}</span>
                  <Check size={14} className="check-icon" />
                </button>
                <div className="vault-menu-separator" />
                {onOpenVault && (
                  <button
                    className="vault-menu-item action"
                    onClick={() => {
                      setShowVaultMenu(false);
                      onOpenVault();
                    }}
                  >
                    <Library size={14} className="action-icon" />
                    <span>Manage vaults...</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 199 }}
            onClick={closeContextMenu}
            onContextMenu={(e) => {
              e.preventDefault();
              closeContextMenu();
            }}
          />
          <div
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {!contextMenu.isDir && (
              <>
                <button
                  className="context-menu-item"
                  onClick={() => {
                    onFileSelect(contextMenu.path);
                    closeContextMenu();
                  }}
                >
                  <FileText size={14} style={{ marginRight: 8 }} /> Open
                </button>
                <button
                  className="context-menu-item"
                  onClick={() => {
                    onToggleStar(contextMenu.path);
                    closeContextMenu();
                  }}
                >
                  <Star
                    size={14}
                    style={{ marginRight: 8 }}
                    fill={
                      starredNotes.includes(contextMenu.path)
                        ? "currentColor"
                        : "none"
                    }
                  />
                  {starredNotes.includes(contextMenu.path) ? "Unstar" : "Star"}
                </button>
              </>
            )}
            <button
              className="context-menu-item"
              onClick={() => startRename(contextMenu.path)}
            >
              <FileEdit size={14} style={{ marginRight: 8 }} /> Rename
            </button>
            {contextMenu.isDir && (
              <>
                <button
                  className="context-menu-item"
                  onClick={() => {
                    onNewFolder(contextMenu.path);
                    closeContextMenu();
                  }}
                >
                  <FolderPlus size={14} style={{ marginRight: 8 }} /> New
                  Subfolder
                </button>
              </>
            )}
            <div className="context-menu-separator" />
            <button
              className="context-menu-item danger"
              onClick={() => {
                onDeleteFile(contextMenu.path, contextMenu.isDir);
                closeContextMenu();
              }}
            >
              <Trash2 size={14} style={{ marginRight: 8 }} /> Delete
            </button>
          </div>
        </>
      )}
    </>
  );
}
