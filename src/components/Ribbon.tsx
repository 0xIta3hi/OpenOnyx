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

const ribbonRootClass = "flex flex-col justify-between items-center w-[var(--ribbon-width)] bg-(--bg-secondary) border-r border-(--divider-color) border-t px-1 pt-2 pb-3 shrink-0";
const ribbonGroupClass = "flex flex-col items-center gap-1";
const ribbonBtnClass = "flex h-8 w-8 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-(--text-secondary) transition-colors duration-150 hover:bg-(--bg-hover) hover:text-(--text-primary)";

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
      className={`${ribbonRootClass} ${hoveringRibbon ? "tooltips-ready" : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={ribbonGroupClass}>
        <button
          className={ribbonBtnClass}
          onClick={handleSearch}
          data-tooltip="Search inside file (Ctrl+F)"
        >
          <Search size={20} strokeWidth={1.5} />
        </button>
        <button
          className={ribbonBtnClass}
          onClick={onNewNote}
          data-tooltip="New Note (Ctrl+N)"
        >
          <FilePlus size={20} strokeWidth={1.5} />
        </button>
        {onDailyNote && (
          <button
            className={ribbonBtnClass}
            onClick={onDailyNote}
            data-tooltip="Daily Note"
          >
            <Calendar size={20} strokeWidth={1.5} />
          </button>
        )}
        <button
          className={ribbonBtnClass}
          onClick={onGraph}
          data-tooltip="Graph View (Ctrl+G)"
        >
          <Network size={20} strokeWidth={1.5} />
        </button>
        {onToggleOutline && (
          <button
            className={ribbonBtnClass}
            onClick={onToggleOutline}
            data-tooltip="Toggle Outline"
          >
            <List size={20} strokeWidth={1.5} />
          </button>
        )}
        {onThoughtModel && (
          <button
            className={ribbonBtnClass}
            onClick={onThoughtModel}
            data-tooltip="AI Assistant"
          >
            <Sparkles size={20} strokeWidth={1.5} />
          </button>
        )}
        {onSpaces && (
          <button
            className={ribbonBtnClass}
            onClick={onSpaces}
            data-tooltip="Spaces"
          >
            <SpacesIcon size={20} />
          </button>
        )}
        {onCanvas && (
          <button
            className={ribbonBtnClass}
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
            className={ribbonBtnClass}
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
