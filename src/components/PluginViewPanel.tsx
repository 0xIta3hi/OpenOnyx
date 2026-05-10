/**
 * Plugin View Panel — Right Sidebar Host
 *
 * Renders plugin views (like Calendar, Kanban, etc.) in a right sidebar panel.
 * Each plugin view's `containerEl` is mounted into the DOM via a ref.
 */

import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface PluginViewInfo {
  viewType: string;
  displayText: string;
  icon: string;
  containerEl: HTMLElement;
}

interface PluginViewPanelProps {
  views: PluginViewInfo[];
  onClose: (viewType: string) => void;
}

export function PluginViewPanel({ views, onClose }: PluginViewPanelProps) {
  const [activeViewType, setActiveViewType] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
      className="plugin-view-panel"
      style={{
        width: '300px',
        minWidth: '250px',
        maxWidth: '450px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        background: 'var(--bg-secondary, #1a1a2e)',
        overflow: 'hidden',
        flexShrink: 0,
        paddingTop: 0,
      }}
    >
      {/* Tab bar for multiple views */}
      {views.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
            background: 'var(--bg-primary, #181825)',
            minHeight: '36px',
            overflow: 'hidden',
          }}
        >
          {views.map((view) => (
            <button
              key={view.viewType}
              onClick={() => setActiveViewType(view.viewType)}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: view.viewType === activeViewType
                  ? 'var(--bg-secondary, #1a1a2e)'
                  : 'transparent',
                border: 'none',
                borderBottom: view.viewType === activeViewType
                  ? '2px solid var(--accent-primary, #6c63ff)'
                  : '2px solid transparent',
                color: view.viewType === activeViewType
                  ? 'var(--text-primary, #e0e0e0)'
                  : 'var(--text-muted, #888)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                transition: 'all 0.15s ease',
              }}
            >
              {view.displayText}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(view.viewType);
                }}
                style={{
                  marginLeft: '4px',
                  opacity: 0.5,
                  cursor: 'pointer',
                  fontSize: '10px',
                  lineHeight: 1,
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
          padding: '8px',
        }}
      />
    </div>
  );
}
