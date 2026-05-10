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
import {
  PanelLeft,
  Search,
  FilePlus,
  Plus,
  FolderOpen,
} from "lucide-react";

interface TitleBarProps {
  theme: Theme;
  onToggleSidebar?: () => void;
  showSidebar?: boolean;
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
  tabScrollRef?: React.RefObject<HTMLDivElement>;
  children?: React.ReactNode;
}

export function TitleBar({
  theme,
  onToggleSidebar,
  showSidebar = true,
  onNewNote,
  onSearch,
  onToggleExplorer,
  leftWidth,
  tabs = [],
  activeTabId,
  onTabSelect,
  onTabClose,
  onNewTab,
  tabScrollRef,
  children,
}: TitleBarProps) {
  const api = getAPI();
  const isMac = navigator.platform.includes("Mac");
  const titlebarRef = useRef<HTMLDivElement>(null);

  return (
    <div className="titlebar" ref={titlebarRef}>
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
        <div className="titlebar-tab-scroll" ref={tabScrollRef}>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              className={`titlebar-tab ${tab.id === activeTabId ? "active" : ""}`}
              onClick={() => onTabSelect?.(tab.id)}
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
                  {"\u2715"}
                </button>
              </div>
            </div>
          ))}
        </div>
        {onNewTab && (
          <button
            className="titlebar-action-btn titlebar-new-tab"
            onClick={onNewTab}
            title="New tab"
          >
            <Plus size={14} strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Right: window controls */}
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
  );
}
