/**
 * Sidebar - File Explorer Panel
 * 
 * Shows the vault's file tree with expand/collapse for directories,
 * context menus for file operations, and drag-and-drop support.
 */

import React, { useState, useCallback, useRef } from 'react';
import { ChevronRight, Folder, FolderOpen, FileText, FilePlus, FolderPlus, RefreshCw, FileEdit, Trash2, Star, ChevronDown, ChevronLeft } from 'lucide-react';
import { FileEntry } from '../types';
import { getNoteName } from '../utils/helpers';
import { getAPI } from '../utils/api';

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
  onRefresh: () => void;
  onToggleStar: (path: string) => void;
  onCollapse: () => void;
}

export function Sidebar({
  visible, fileTree, activeFilePath, starredNotes,
  onFileSelect, onNewNote, onNewFolder,
  onDeleteFile, onRenameFile, onRefresh, onToggleStar, onCollapse
}: SidebarProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; isDir: boolean } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [showStarred, setShowStarred] = useState(true);

  const toggleDir = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleContextMenu = (e: React.MouseEvent, path: string, isDir: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, path, isDir });
  };

  const closeContextMenu = () => setContextMenu(null);

  const startRename = (path: string) => {
    setRenamingPath(path);
    setRenameValue(getNoteName(path));
    closeContextMenu();
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (renamingPath && renameValue.trim()) {
      onRenameFile(renamingPath, renameValue.trim());
    }
    setRenamingPath(null);
    setRenameValue('');
  };

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, path: string) => {
    e.dataTransfer.setData('text/plain', path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverPath(targetPath);
  };

  const handleDragLeave = () => {
    setDragOverPath(null);
  };

  const handleDrop = async (e: React.DragEvent, targetDir: string) => {
    e.preventDefault();
    setDragOverPath(null);
    const sourcePath = e.dataTransfer.getData('text/plain');
    if (sourcePath && sourcePath !== targetDir) {
      const fileName = sourcePath.split('/').pop() || sourcePath;
      const newPath = targetDir ? `${targetDir}/${fileName}` : fileName;
      try {
        await getAPI().renameFile(sourcePath, newPath);
        onRefresh();
      } catch (err) {
        console.error('Move failed:', err);
      }
    }
  };

  const renderFileTree = (entries: FileEntry[], depth: number = 0) => {
    return entries.map(entry => {
      const isExpanded = expandedDirs.has(entry.path);
      const isActive = entry.path === activeFilePath;
      const isDragOver = entry.path === dragOverPath;
      const isRenaming = entry.path === renamingPath;

      return (
        <React.Fragment key={entry.path}>
          <button
            className={`file-tree-item ${isActive ? 'active' : ''} ${isDragOver ? 'drag-over' : ''}`}
            style={{ '--depth': depth } as React.CSSProperties}
            onClick={() => {
              if (entry.isDirectory) {
                toggleDir(entry.path);
              } else if (entry.extension === '.md' || entry.extension === '.canvas') {
                onFileSelect(entry.path);
              }
            }}
            onContextMenu={(e) => handleContextMenu(e, entry.path, entry.isDirectory)}
            draggable={!entry.isDirectory}
            onDragStart={(e) => handleDragStart(e, entry.path)}
            onDragOver={entry.isDirectory ? (e) => handleDragOver(e, entry.path) : undefined}
            onDragLeave={entry.isDirectory ? handleDragLeave : undefined}
            onDrop={entry.isDirectory ? (e) => handleDrop(e, entry.path) : undefined}
          >
            {entry.isDirectory ? (
              <span className={`chevron ${isExpanded ? 'open' : ''}`}>
                <ChevronRight size={14} strokeWidth={2} />
              </span>
            ) : (
              <span className="chevron-placeholder" style={{ width: 14 }}></span>
            )}
            <span className={`icon ${entry.isDirectory ? 'folder-icon' : ''}`}>
              {entry.isDirectory ? (isExpanded ? <FolderOpen size={16} strokeWidth={1.5} /> : <Folder size={16} strokeWidth={1.5} />) : <FileText size={16} strokeWidth={1.5} />}
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

          {entry.isDirectory && isExpanded && entry.children && (
            renderFileTree(entry.children, depth + 1)
          )}
        </React.Fragment>
      );
    });
  };

  return (
    <>
      <div className={`sidebar ${!visible ? 'collapsed' : ''}`}>
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
              onClick={() => onNewFolder('')}
              title="New Folder"
            >
              <FolderPlus size={16} strokeWidth={1.5} />
            </button>
            <button
              className="sidebar-btn"
              onClick={onRefresh}
              title="Refresh"
            >
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
                {showStarred ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              <Star size={14} className="section-icon" fill="currentColor" />
              <span>Starred</span>
              <span className="section-count">{starredNotes.length}</span>
            </button>
            {showStarred && (
              <div className="starred-list">
                {starredNotes.map(path => (
                  <button
                    key={path}
                    className={`file-item ${activeFilePath === path ? 'active' : ''}`}
                    onClick={() => onFileSelect(path)}
                    onContextMenu={(e) => handleContextMenu(e, path, false)}
                  >
                    <Star size={14} className="star-icon" fill="var(--accent-warning)" stroke="var(--accent-warning)" />
                    <span className="name">{getNoteName(path)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div
          className="file-explorer"
          onDragOver={(e) => handleDragOver(e, '')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, '')}
        >
          {fileTree.length > 0 ? (
            renderFileTree(fileTree)
          ) : (
            <div className="empty-state" style={{ padding: '2rem 1rem' }}>
              <div style={{ opacity: 0.5, marginBottom: '0.5rem' }}>
                <FolderOpen size={48} strokeWidth={1} />
              </div>
              <div className="empty-text" style={{ textAlign: 'center' }}>
                No files yet.<br />Create a new note to get started.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 199 }}
            onClick={closeContextMenu}
            onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }}
          />
          <div
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {!contextMenu.isDir && (
              <>
                <button
                  className="context-menu-item"
                  onClick={() => { onFileSelect(contextMenu.path); closeContextMenu(); }}
                >
                  <FileText size={14} style={{ marginRight: 8 }} /> Open
                </button>
                <button
                  className="context-menu-item"
                  onClick={() => { onToggleStar(contextMenu.path); closeContextMenu(); }}
                >
                  <Star 
                    size={14} 
                    style={{ marginRight: 8 }} 
                    fill={starredNotes.includes(contextMenu.path) ? 'currentColor' : 'none'} 
                  /> 
                  {starredNotes.includes(contextMenu.path) ? 'Unstar' : 'Star'}
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
                onClick={() => { onNewFolder(contextMenu.path); closeContextMenu(); }}
              >
                <FolderPlus size={14} style={{ marginRight: 8 }} /> New Subfolder
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
