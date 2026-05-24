/**
 * TitleBar - Custom window title bar (Obsidian-style)
 *
 * Unified top bar with:
 *   Left: action icons aligned above the ribbon + sidebar
 *   Center: editor tabs starting at the editor content boundary
 *   Right: window controls (minimize, maximize, close)
 */

import React, { useRef } from "react";
import { Tab, Theme } from "../types";
import { getAPI } from "../utils/api";
import { DragCtx } from "../context/DragContext";
import {
  PanelLeft,
  Search,
  FilePlus,
  Plus,
  FolderOpen,
  PanelRightClose,
  PanelRightOpen,
  X,
} from "lucide-react";

interface TitleBarProps {
  theme: Theme;
  onToggleSidebar?: () => void;
  showSidebar?: boolean;
  onToggleRightSidebar?: () => void;
  showRightSidebar?: boolean;
  onNewNote?: () => void;
  onSearch?: () => void;
  onToggleExplorer?: () => void;
  /** Width of the left section (ribbon + sidebar) so tabs align with editor */
  leftWidth?: number;
  /** Tab data */
  tabs?: Tab[];
  activeTabId?: string | null;
  onTabSelect?: (id: string) => void;
  onTabClose?: (id: string) => void;
  onNewTab?: () => void;
  onTabReorder?: (draggedId: string, targetId: string, insertBefore: boolean) => void;
  tabScrollRef?: React.RefObject<HTMLDivElement | null>;
  children?: React.ReactNode;
  activeUsers?: { id: string, name: string, email: string, color?: string, isEditing?: boolean }[];
  onInvite?: () => void;
}

export function TitleBar({
  theme,
  onToggleSidebar,
  showSidebar = true,
  onToggleRightSidebar,
  showRightSidebar = true,
  onNewNote,
  onSearch,
  onToggleExplorer,
  leftWidth,
  tabs = [],
  activeTabId,
  onTabSelect,
  onTabClose,
  onNewTab,
  onTabReorder,
  tabScrollRef,
  children,
  activeUsers = [],
  onInvite,
}: TitleBarProps) {
  const api = getAPI();
  const isMac = navigator.platform.includes("Mac");
  const titlebarRef = useRef<HTMLDivElement>(null);
  const { setDragCtx } = React.useContext(DragCtx);

  const [dragOverTabId, setDragOverTabId] = React.useState<string | null>(null);
  const [dragDirection, setDragDirection] = React.useState<'left' | 'right' | null>(null);

  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    e.dataTransfer.setData("text/plain", tabId);
    e.dataTransfer.effectAllowed = "move";
    const tabObj = tabs.find(t => t.id === tabId);
    if (tabObj) {
      setDragCtx({
        type: 'tab',
        tab: tabObj
      });
    }
  };

  const handleDragEnd = () => {
    setDragCtx(null);
  };

  const handleDragOver = (e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const isRightHalf = x > rect.width / 2;
    
    setDragOverTabId(tabId);
    setDragDirection(isRightHalf ? 'right' : 'left');
  };

  const handleDragLeave = () => {
    setDragOverTabId(null);
    setDragDirection(null);
  };

  const handleDrop = (e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    const draggedTabId = e.dataTransfer.getData("text/plain");
    
    setDragOverTabId(null);
    setDragDirection(null);
    
    if (draggedTabId && draggedTabId !== targetTabId) {
      const isRightHalf = dragDirection === 'right';
      onTabReorder?.(draggedTabId, targetTabId, !isRightHalf);
    }
  };

  React.useEffect(() => {
    const el = tabScrollRef?.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [tabScrollRef]);

  return (
    <div className="titlebar" ref={titlebarRef}>
      {/* Background drag handle for window movement */}
      <div className="titlebar-drag-handle" />

      {/* Left action icons - spans over ribbon + sidebar */}
      <div
        className="titlebar-left"
        style={{
          width: leftWidth ? `${leftWidth}px` : undefined,
          minWidth: leftWidth ? `${leftWidth}px` : undefined,
        }}
      >
        {onToggleSidebar && (
          <button
            className="titlebar-action-btn titlebar-toggle-btn"
            onClick={onToggleSidebar}
            title={showSidebar ? "Close left sidebar" : "Open left sidebar"}
          >
            <PanelLeft size={20} strokeWidth={1.5} />
          </button>
        )}
        
        {showSidebar && (
          <div className="titlebar-vault-actions">
            {onToggleExplorer && (
              <button
                className="titlebar-action-btn"
                onClick={onToggleExplorer}
                title="File Explorer"
              >
                <FolderOpen size={20} strokeWidth={1.5} />
              </button>
            )}
            {onSearch && (
              <button
                className="titlebar-action-btn"
                onClick={onSearch}
                title="Search (Ctrl+F)"
              >
                <Search size={20} strokeWidth={1.5} />
              </button>
            )}
            {onNewNote && (
              <button
                className="titlebar-action-btn"
                onClick={onNewNote}
                title="New Note (Ctrl+N)"
              >
                <FilePlus size={20} strokeWidth={1.5} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Center: tabs - starts at editor content boundary */}
      <div className="titlebar-tabs">
        <div 
          className="titlebar-tab-scroll" 
          ref={tabScrollRef}
        >
          {tabs.map((tab) => (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              data-tooltip={tab.name}
              className={`titlebar-tab ${tab.id === activeTabId ? "active" : ""} ${
                dragOverTabId === tab.id ? `drop-target-${dragDirection}` : ""
              }`}
              onClick={() => onTabSelect?.(tab.id)}
              draggable
              onDragStart={(e) => handleDragStart(e, tab.id)}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDragLeave={handleDragLeave}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDrop(e, tab.id)}
            >
              <div className="tab-inner">
                {tab.isModified && (
                  <span className="titlebar-tab-dot">{"\u25CF"}</span>
                )}
                <span className="titlebar-tab-title">{tab.name}</span>
                <button
                  className="titlebar-tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabClose?.(tab.id);
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          ))}
          {onNewTab && (
            <button
              className="titlebar-new-tab titlebar-btn"
              onClick={onNewTab}
              title="New tab"
            >
              <Plus size={16} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* Right: window controls */}
      <div className="titlebar-right-controls" style={{ display: 'flex', alignItems: 'center', flexShrink: 0, paddingRight: '4px', position: 'relative', zIndex: 2, pointerEvents: 'auto', WebkitAppRegion: 'no-drag' } as any}>
        <div style={{ display: 'flex', alignItems: 'center', marginRight: '16px', gap: '4px' }}>
          {activeUsers.slice(0, 3).map((u, i) => (
            <div 
              key={u.id}
              title={`${u.name || u.email} - ${u.isEditing ? 'Editing' : 'Viewing'}`}
              style={{
                width: '24px', height: '24px', borderRadius: '50%',
                backgroundColor: u.color || 'var(--interactive-accent)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: 'bold', zIndex: 3 - i,
                marginLeft: i > 0 ? '-8px' : 0, border: '2px solid var(--background-primary)',
                position: 'relative'
              }}
            >
              {(u.name || u.email || '?')[0].toUpperCase()}
              {u.isEditing && (
                <div style={{
                  position: 'absolute', bottom: '-2px', right: '-2px',
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: '#10b981', border: '1px solid var(--background-primary)'
                }} title="Editing" />
              )}
            </div>
          ))}
          {activeUsers.length > 3 && (
            <div style={{
              width: '24px', height: '24px', borderRadius: '50%',
              backgroundColor: 'var(--background-modifier-border)',
              color: 'var(--text-normal)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '10px', fontWeight: 'bold', marginLeft: '-8px', border: '2px solid var(--background-primary)'
            }}>
              +{activeUsers.length - 3}
            </div>
          )}
          {onInvite && (
            <button
              className="titlebar-action-btn"
              style={{ marginLeft: '4px', width: '24px', height: '24px', padding: 0 }}
              onClick={onInvite}
              title="Invite collaborators"
            >
              <Plus size={16} strokeWidth={2} />
            </button>
          )}
        </div>
        
        {onToggleRightSidebar && (
          <button
            className="titlebar-action-btn"
            style={{ marginRight: '8px' }}
            onClick={onToggleRightSidebar}
            title={showRightSidebar ? "Close right sidebar" : "Open right sidebar"}
          >
            {showRightSidebar ? (
              <PanelRightClose size={20} strokeWidth={1.5} />
            ) : (
              <PanelRightOpen size={20} strokeWidth={1.5} />
            )}
          </button>
        )}
        {!isMac && (
          <div className="titlebar-controls">
          <button
            className="titlebar-btn"
            onClick={() => api.minimizeWindow()}
            aria-label="Minimize"
          >
            &#x2500;
          </button>
          <button
            className="titlebar-btn"
            onClick={() => api.maximizeWindow()}
            aria-label="Maximize"
          >
            &#x25A1;
          </button>
          <button
            className="titlebar-btn close"
            onClick={() => api.closeWindow()}
            aria-label="Close"
          >
            &#x2715;
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
