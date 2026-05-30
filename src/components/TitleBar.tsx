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
import { LocalGroup } from "../lib/localdb";
import {
  PanelLeft,
  Search,
  FilePlus,
  Plus,
  FolderOpen,
  PanelRightClose,
  PanelRightOpen,
  X,
  Trash2,
  Copy,
  Save,
  Link2Off,
} from "lucide-react";

export const GROUP_COLORS = [
  { name: "Blue", value: "#1a73e8" },
  { name: "Red", value: "#d93025" },
  { name: "Yellow", value: "#f29900" },
  { name: "Green", value: "#188038" },
  { name: "Pink", value: "#d01884" },
  { name: "Purple", value: "#a142f4" },
  { name: "Cyan", value: "#007b83" },
  { name: "Orange", value: "#fa7b17" },
  { name: "Grey", value: "#5f6368" },
];

function getContrastColor(hexColor: string): string {
  if (!hexColor) return "#ffffff";
  const hex = hexColor.replace("#", "");
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 150 ? "#111111" : "#ffffff";
  }
  if (hex.length === 6) {
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 150 ? "#111111" : "#ffffff";
  }
  return "#ffffff";
}

function groupAndSortTabs(tabsList: Tab[], groupsList: LocalGroup[]): Tab[] {
  const grouped: Record<string, Tab[]> = {};
  const ungrouped: Tab[] = [];
  const groupOrder: string[] = [];
  
  for (const tab of tabsList) {
    const hasGroup = tab.groupId && groupsList.some(g => g.id === tab.groupId);
    if (hasGroup && tab.groupId) {
      if (!grouped[tab.groupId]) {
        grouped[tab.groupId] = [];
        groupOrder.push(tab.groupId);
      }
      grouped[tab.groupId].push(tab);
    } else {
      ungrouped.push(tab);
    }
  }
  
  const sorted: Tab[] = [...ungrouped];
  for (const gId of groupOrder) {
    sorted.push(...grouped[gId]);
  }
  return sorted;
}

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
  onNewTab?: (groupId?: string) => void;
  onTabReorder?: (draggedId: string, targetId: string, insertBefore: boolean) => void;
  tabScrollRef?: React.RefObject<HTMLDivElement | null>;
  children?: React.ReactNode;
  activeUsers?: { id: string, name: string, email: string, color?: string, isEditing?: boolean }[];
  onInvite?: () => void;
  
  // Tab-groups refactoring props
  groups?: LocalGroup[];
  activeGroupId?: string | null;
  hasUnsavedChanges?: boolean;
  onRestoreGroup?: (groupId: string) => void;
  onSaveGroup?: (groupId: string) => void;
  onRenameGroup?: (groupId: string, currentName: string) => void;
  onChangeGroupColor?: (groupId: string, currentColor: string) => void;
  onToggleGroupAutoSave?: (groupId: string) => void;
  onDuplicateGroup?: (groupId: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onCreateGroupFromTab?: (tabId: string) => void;
  onAddTabToGroup?: (tabId: string, groupId: string) => void;
  onRemoveTabFromGroup?: (tabId: string) => void;
  onMoveTabToGroup?: (tabId: string, groupId: string) => void;
  collapsedGroupIds?: Set<string>;
  onToggleGroupCollapse?: (groupId: string) => void;
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
  
  groups = [],
  activeGroupId = null,
  hasUnsavedChanges = false,
  onRestoreGroup,
  onSaveGroup,
  onRenameGroup,
  onChangeGroupColor,
  onToggleGroupAutoSave,
  onDuplicateGroup,
  onDeleteGroup,
  onCreateGroupFromTab,
  onAddTabToGroup,
  onRemoveTabFromGroup,
  onMoveTabToGroup,
  collapsedGroupIds = new Set<string>(),
  onToggleGroupCollapse,
}: TitleBarProps) {
  const api = getAPI();
  const isMac = navigator.platform.includes("Mac");
  const titlebarRef = useRef<HTMLDivElement>(null);
  const { setDragCtx } = React.useContext(DragCtx);

  const [dragOverTabId, setDragOverTabId] = React.useState<string | null>(null);
  const [dragDirection, setDragDirection] = React.useState<'left' | 'right' | null>(null);
  const [hoveredTab, setHoveredTab] = React.useState<{ name: string; x: number; y: number } | null>(null);
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  
  const [tabContextMenu, setTabContextMenu] = React.useState<{
    x: number;
    y: number;
    tab: Tab;
  } | null>(null);

  const [groupPopup, setGroupPopup] = React.useState<{
    x: number;
    y: number;
    group: LocalGroup;
  } | null>(null);

  const sortedTabs = React.useMemo(() => {
    return groupAndSortTabs(tabs, groups);
  }, [tabs, groups]);

  const renderItems = React.useMemo(() => {
    const items: Array<
      | { type: "group-header"; group: LocalGroup; key: string; tabsCount: number; isCollapsed: boolean }
      | { type: "tab"; tab: Tab; key: string; tabGroup: LocalGroup | null }
    > = [];
    
    // 1. Add each group pill, followed by its active tabs (if any and not collapsed)
    for (const group of groups) {
      const activeGroupTabs = sortedTabs.filter(t => t.groupId === group.id);
      const isCollapsed = collapsedGroupIds.has(group.id);
      
      items.push({
        type: "group-header",
        group,
        key: `group-header-${group.id}`,
        tabsCount: activeGroupTabs.length,
        isCollapsed,
      });

      if (!isCollapsed) {
        for (const tab of activeGroupTabs) {
          items.push({
            type: "tab",
            tab,
            key: `tab-${tab.id}`,
            tabGroup: group,
          });
        }
      }
    }

    // 2. Add all ungrouped tabs at the end (so they appear next to/aside of the group names)
    const ungroupedTabs = sortedTabs.filter(t => !t.groupId || !groups.some(g => g.id === t.groupId));
    for (const tab of ungroupedTabs) {
      items.push({
        type: "tab",
        tab,
        key: `tab-${tab.id}`,
        tabGroup: null,
      });
    }
    
    return items;
  }, [sortedTabs, groups, collapsedGroupIds]);

  React.useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const handleTabMouseEnter = (e: React.MouseEvent, name: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const parentRect = titlebarRef.current?.getBoundingClientRect();
    if (!parentRect) return;

    const x = rect.left + rect.width / 2 - parentRect.left;
    const y = rect.bottom - parentRect.top + 6;

    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredTab({ name, x, y });
    }, 400);
  };

  const handleTabMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredTab(null);
  };

  const handleTabClick = (tabId: string) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredTab(null);
    onTabSelect?.(tabId);
  };

  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredTab(null);
    e.dataTransfer.setData("text/plain", tabId);
    e.dataTransfer.effectAllowed = "move";
    const tabObj = tabs.find(t => t.id === tabId);
    if (tabObj) {
      e.dataTransfer.setData("application/x-openobsidian-tab", tabObj.path);
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
          {renderItems.map((item) => {
            if (item.type === "group-header") {
              const { group, tabsCount, isCollapsed } = item;
              return (
                <div
                  key={item.key}
                  className={`titlebar-group-pill ${activeGroupId === group.id ? "active-group" : ""} ${
                    isCollapsed ? "is-collapsed" : ""
                  }`}
                  style={{
                    backgroundColor: group.color,
                    color: getContrastColor(group.color),
                  }}
                  onClick={() => {
                    if (group.id === activeGroupId) {
                      onToggleGroupCollapse?.(group.id);
                    } else {
                      onRestoreGroup?.(group.id);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setGroupPopup({
                      x: rect.left,
                      y: rect.bottom + 4,
                      group,
                    });
                  }}
                  title={`Group: ${group.name} (${tabsCount} tabs)`}
                >
                  <span className="titlebar-group-name">
                    {group.name}
                    {group.id === activeGroupId && hasUnsavedChanges ? " *" : ""}
                  </span>
                </div>
              );
            } else {
              const { tab, tabGroup } = item;
              return (
                <div
                  key={item.key}
                  data-tab-id={tab.id}
                  className={`titlebar-tab ${tab.id === activeTabId ? "active" : ""} ${
                    dragOverTabId === tab.id ? `drop-target-${dragDirection}` : ""
                  } ${tabGroup ? "grouped-tab" : ""}`}
                  style={{
                    borderTop: tabGroup ? `3px solid ${tabGroup.color}` : undefined,
                  }}
                  onClick={() => handleTabClick(tab.id)}
                  onMouseEnter={(e) => handleTabMouseEnter(e, tab.name)}
                  onMouseLeave={handleTabMouseLeave}
                  draggable
                  onDragStart={(e) => handleDragStart(e, tab.id)}
                  onDragOver={(e) => handleDragOver(e, tab.id)}
                  onDragLeave={handleDragLeave}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, tab.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setTabContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      tab,
                    });
                  }}
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
                        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                        setHoveredTab(null);
                        onTabClose?.(tab.id);
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              );
            }
          })}
          {onNewTab && (
            <button
              className="titlebar-new-tab titlebar-btn"
              onClick={() => onNewTab?.()}
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

      {hoveredTab && (
        <div
          className="titlebar-tooltip"
          style={{
            left: `${hoveredTab.x}px`,
            top: `${hoveredTab.y}px`,
          }}
        >
          {hoveredTab.name}
        </div>
      )}

      {tabContextMenu && (
        <div
          className="context-menu-backdrop"
          onClick={() => setTabContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setTabContextMenu(null);
          }}
        >
          <div
            className="context-menu"
            style={{ left: tabContextMenu.x, top: tabContextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {tabContextMenu.tab.groupId ? (
              <>
                <button
                  className="context-menu-item"
                  onClick={() => {
                    onRemoveTabFromGroup?.(tabContextMenu.tab.id);
                    setTabContextMenu(null);
                  }}
                >
                  Remove from Group
                </button>
                {groups.filter(g => g.id !== tabContextMenu.tab.groupId).length > 0 && (
                  <div className="context-menu-submenu-container">
                    <div className="context-menu-item submenu-header">
                      Move to Group &rarr;
                    </div>
                    <div className="context-menu-submenu">
                      {groups.filter(g => g.id !== tabContextMenu.tab.groupId).map(g => (
                        <button
                          key={g.id}
                          className="context-menu-item"
                          onClick={() => {
                            onMoveTabToGroup?.(tabContextMenu.tab.id, g.id);
                            setTabContextMenu(null);
                          }}
                        >
                          <span className="group-color-dot" style={{ backgroundColor: g.color }} />
                          {g.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {groups.length > 0 && (
                  <div className="context-menu-submenu-container">
                    <div className="context-menu-item submenu-header">
                      Add to Group &rarr;
                    </div>
                    <div className="context-menu-submenu">
                      {groups.map(g => (
                        <button
                          key={g.id}
                          className="context-menu-item"
                          onClick={() => {
                            onAddTabToGroup?.(tabContextMenu.tab.id, g.id);
                            setTabContextMenu(null);
                          }}
                        >
                          <span className="group-color-dot" style={{ backgroundColor: g.color }} />
                          {g.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  className="context-menu-item"
                  onClick={() => {
                    onCreateGroupFromTab?.(tabContextMenu.tab.id);
                    setTabContextMenu(null);
                  }}
                >
                  Create New Group from Tab
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {groupPopup && (
        <div
          className="context-menu-backdrop"
          onClick={() => setGroupPopup(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setGroupPopup(null);
          }}
        >
          <div
            className="group-editor-popup"
            style={{ left: groupPopup.x, top: groupPopup.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Input name field */}
            <input
              type="text"
              className="group-editor-input"
              style={{ borderColor: groupPopup.group.color }}
              defaultValue={groupPopup.group.name}
              placeholder="Group name"
              onChange={(e) => {
                const val = e.target.value.trim();
                if (val) {
                  onRenameGroup?.(groupPopup.group.id, val);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setGroupPopup(null);
                }
              }}
              autoFocus
            />

            {/* Color picker circles */}
            <div className="group-editor-colors">
              {GROUP_COLORS.map((c) => {
                const isSelected = groupPopup.group.color.toLowerCase() === c.value.toLowerCase();
                return (
                  <button
                    key={c.value}
                    className={`group-editor-color-btn ${isSelected ? "selected" : ""}`}
                    style={{
                      backgroundColor: c.value,
                      color: c.value,
                    }}
                    onClick={() => {
                      onChangeGroupColor?.(groupPopup.group.id, c.value);
                      setGroupPopup(prev => prev ? {
                        ...prev,
                        group: { ...prev.group, color: c.value }
                      } : null);
                    }}
                    title={c.name}
                  />
                );
              })}
            </div>

            <div className="group-editor-divider" />

            {/* Action list */}
            <button
              className="group-editor-item"
              onClick={() => {
                onNewTab?.(groupPopup.group.id);
                setGroupPopup(null);
              }}
            >
              <Plus size={15} />
              <span>New tab in group</span>
            </button>

            <button
              className="group-editor-item"
              onClick={() => {
                const tabsToUngroup = tabs.filter(t => t.groupId === groupPopup.group.id);
                tabsToUngroup.forEach(t => {
                  onRemoveTabFromGroup?.(t.id);
                });
                onDeleteGroup?.(groupPopup.group.id);
                setGroupPopup(null);
              }}
            >
              <Link2Off size={15} />
              <span>Ungroup</span>
            </button>

            <button
              className="group-editor-item"
              onClick={() => {
                const tabsToClose = sortedTabs.filter(t => t.groupId === groupPopup.group.id);
                tabsToClose.forEach(t => {
                  onTabClose?.(t.id);
                });
                setGroupPopup(null);
              }}
            >
              <X size={15} />
              <span>Close grouped tabs</span>
            </button>

            <div className="group-editor-divider" />

            <button
              className="group-editor-item"
              onClick={() => {
                onSaveGroup?.(groupPopup.group.id);
                setGroupPopup(null);
              }}
            >
              <Save size={15} />
              <span>Save current layout to group</span>
            </button>

            <button
              className="group-editor-item"
              onClick={() => {
                onToggleGroupAutoSave?.(groupPopup.group.id);
                setGroupPopup(prev => prev ? {
                  ...prev,
                  group: { ...prev.group, auto_save_enabled: !prev.group.auto_save_enabled }
                } : null);
              }}
            >
              <span className="group-editor-check">
                {groupPopup.group.auto_save_enabled ? "✓" : ""}
              </span>
              <span>Enable Auto-save</span>
            </button>

            <button
              className="group-editor-item"
              onClick={() => {
                onDuplicateGroup?.(groupPopup.group.id);
                setGroupPopup(null);
              }}
            >
              <Copy size={15} />
              <span>Duplicate group</span>
            </button>

            <div className="group-editor-divider" />

            <button
              className="group-editor-item danger"
              onClick={() => {
                onDeleteGroup?.(groupPopup.group.id);
                setGroupPopup(null);
              }}
            >
              <Trash2 size={15} />
              <span>Delete group</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
