/**
 * Sidebar - File Explorer Panel
 *
 * Shows the vault's file tree with expand/collapse for directories,
 * context menus for file operations, and drag-and-drop support.
 */

import React, { useState, useCallback, useRef } from "react";
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
  const renameInFlightRef = useRef(false);

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

  const renderFileTree = (entries: FileEntry[], depth: number = 0) => {
    return entries.map((entry) => {
      const isExpanded = expandedDirs.has(entry.path);
      const isActive = entry.path === activeFilePath;
      const isDragOver = entry.path === dragOverPath;
      const isDragging = entry.path === draggingPath;
      const isRenaming = entry.path === renamingPath;

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
              // If it's a directory, we drop INTO it
              // If it's a file, we drop into its PARENT directory
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
                <ChevronRight size={12} strokeWidth={2} />
              </span>
            )}
            <span className={`icon ${entry.isDirectory ? "folder-icon" : ""}`}>
              {entry.isDirectory ? (
                isExpanded ? (
                  <FolderOpen size={15} strokeWidth={1.5} />
                ) : (
                  <Folder size={15} strokeWidth={1.5} />
                )
              ) : (
                <FileText size={15} strokeWidth={1.5} />
              )}
            </span>
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
          </button>

          {entry.isDirectory &&
            isExpanded &&
            entry.children && (
              <div className="file-tree-children">
                {renderFileTree(entry.children, depth + 1)}
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

  return (
    <>
      <div className={`sidebar ${!visible ? "collapsed" : ""}`}>
        <div className="sidebar-header">
          <h3>Explorer</h3>
          <div className="sidebar-actions">
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

        {/* Starred Notes Section */}
        {starredNotes.length > 0 && (
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
          {fileTree.length > 0 ? (
            renderFileTree(fileTree)
          ) : (
            <div className="empty-state" style={{ padding: "2rem 1rem" }}>
              <div style={{ opacity: 0.5, marginBottom: "0.5rem" }}>
                <FolderOpen size={48} strokeWidth={1} />
              </div>
              <div className="empty-text" style={{ textAlign: "center" }}>
                No files yet.
                <br />
                Create a new note to get started.
              </div>
            </div>
          )}
        </div>
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
