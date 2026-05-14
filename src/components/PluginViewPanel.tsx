/**
 * Plugin View Panel — Right Sidebar Host
 *
 * Renders plugin views (like Calendar, Kanban, etc.) in a right sidebar panel.
 * Each plugin view's `containerEl` is mounted into the DOM via a ref.
 */

import React, { useEffect, useRef, useState, useContext } from 'react';
import { getPluginScopeClass } from '../lib/pluginStyles';
import { DragCtx } from '../context/DragContext';

interface PluginViewInfo {
  viewType: string;
  displayText: string;
  icon: string;
  containerEl: HTMLElement;
  pluginId?: string;
}

interface PluginViewPanelProps {
  views: PluginViewInfo[];
  onClose: (viewType: string) => void;
  isMainView?: boolean;
  width?: number;
}

export function PluginViewPanel({ views, onClose, isMainView, width = 300 }: PluginViewPanelProps) {
  const [activeViewType, setActiveViewType] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { setDragCtx } = useContext(DragCtx);

  // Auto-select first view if none active
  useEffect(() => {
    if (views.length > 0 && (!activeViewType || !views.find(v => v.viewType === activeViewType))) {
      setActiveViewType(views[0].viewType);
    }
  }, [views, activeViewType]);

  const activeView = views.find(v => v.viewType === activeViewType);

  // Mount the plugin's containerEl into our React container
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !activeView) return;

    // Clear previous content
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Apply plugin CSS scope class
    if (activeView.pluginId) {
      const scopeClass = getPluginScopeClass(activeView.pluginId);
      activeView.containerEl.classList.add(scopeClass);
    }

    // Mount the plugin's DOM element
    container.appendChild(activeView.containerEl);

    return () => {
      // Don't destroy the element on unmount — just detach it
      if (activeView.containerEl.parentNode === container) {
        container.removeChild(activeView.containerEl);
      }
    };
  }, [activeView]);

  if (views.length === 0) return null;

  return (
    <div
      className={`plugin-view-panel ${isMainView ? 'is-main-view' : ''}`}
      style={isMainView ? {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-primary)',
      } : {
        width: 'var(--right-sidebar-width, 300px)',
        minWidth: '200px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        background: 'var(--bg-secondary, #1a1a2e)',
        overflow: 'hidden',
        flexShrink: 0,
        paddingTop: '0',
      }}
    >
      {/* Tab bar for multiple views (hidden in main view) */}
      {!isMainView && views.length > 0 && (
        <div className="plugin-view-tabs">
          {views.map((view) => (
            <button
              key={view.viewType}
              className={`plugin-view-tab ${view.viewType === activeViewType ? 'active' : ''}`}
              onClick={() => setActiveViewType(view.viewType)}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                setDragCtx({
                  type: 'plugin',
                  pluginView: {
                    viewType: view.viewType,
                    displayText: view.displayText
                  }
                });
              }}
              onDragEnd={() => setDragCtx(null)}
            >
              <span className="plugin-view-tab-text">{view.displayText}</span>
              <span
                className="plugin-view-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(view.viewType);
                }}
              >
                ×
              </span>
            </button>
          ))}
        </div>
      )}

      {/* View content — plugin's DOM is mounted here */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'auto',
        }}
      />
    </div>
  );
}
