import React, { useState, useRef } from "react";
import {
  FilePlus,
  Search,
  Network,
  Settings,
  FolderOpen,
  Calendar,
  Hash,
  List,
  Sparkles,
  Layout,
} from "lucide-react";
import type { PluginRibbonAction } from '../types/plugin';
import { SpacesIcon } from "./SpacesIcon";

interface RibbonProps {
  onNewNote: () => void;
  onSearch: () => void;
  onToggleExplorer?: () => void;
  onGraph: () => void;
  onSettings: () => void;
  onDailyNote?: () => void;
  onToggleTags?: () => void;
  onToggleOutline?: () => void;
  onThoughtModel?: () => void;
  onSpaces?: () => void;
  onCanvas?: () => void;
  pluginRibbonActions?: PluginRibbonAction[];
}

export function Ribbon({
  onNewNote,
  onSearch,
  onGraph,
  onToggleExplorer,
  onSettings,
  onDailyNote,
  onToggleTags,
  onToggleOutline,
  onThoughtModel,
  onSpaces,
  onCanvas,
  pluginRibbonActions = [],
}: RibbonProps) {
  const handleSearch = () => {
    document.dispatchEvent(new CustomEvent("editor:open-search"));
  };

  const [hoveringRibbon, setHoveringRibbon] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveringRibbon(true);
    }, 400);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveringRibbon(false);
  };

  return (
    <div 
      className={`app-ribbon ${hoveringRibbon ? "tooltips-ready" : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="ribbon-top">
        <button
          className="ribbon-btn"
          onClick={handleSearch}
          data-tooltip="Search inside file (Ctrl+F)"
        >
          <Search size={20} strokeWidth={1.5} />
        </button>
        <button
          className="ribbon-btn"
          onClick={onNewNote}
          data-tooltip="New Note (Ctrl+N)"
        >
          <FilePlus size={20} strokeWidth={1.5} />
        </button>
        {onDailyNote && (
          <button
            className="ribbon-btn"
            onClick={onDailyNote}
            data-tooltip="Daily Note"
          >
            <Calendar size={20} strokeWidth={1.5} />
          </button>
        )}
        <button
          className="ribbon-btn"
          onClick={onGraph}
          data-tooltip="Graph View (Ctrl+G)"
        >
          <Network size={20} strokeWidth={1.5} />
        </button>
        {onToggleOutline && (
          <button
            className="ribbon-btn"
            onClick={onToggleOutline}
            data-tooltip="Toggle Outline"
          >
            <List size={20} strokeWidth={1.5} />
          </button>
        )}
        {onThoughtModel && (
          <button
            className="ribbon-btn"
            onClick={onThoughtModel}
            data-tooltip="AI Assistant"
          >
            <Sparkles size={20} strokeWidth={1.5} />
          </button>
        )}
        {onSpaces && (
          <button
            className="ribbon-btn"
            onClick={onSpaces}
            data-tooltip="Spaces"
          >
            <SpacesIcon size={20} />
          </button>
        )}
        {onCanvas && (
          <button
            className="ribbon-btn"
            onClick={onCanvas}
            data-tooltip="Canvas (Ctrl+Shift+C)"
          >
            <Layout size={20} strokeWidth={1.5} />
          </button>
        )}
        {/* Plugin ribbon actions */}
        {pluginRibbonActions.map((action, i) => (
          <button
            key={`plugin-ribbon-${action.pluginId}-${i}`}
            className="ribbon-btn oo-plugin-ribbon-btn"
            onClick={(e) => action.callback(e.nativeEvent)}
            data-tooltip={action.title}
          >
            <span style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              ref={(el) => {
                if (el && action.el) {
                  el.innerHTML = '';
                  el.appendChild(action.el.cloneNode(true));
                }
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
