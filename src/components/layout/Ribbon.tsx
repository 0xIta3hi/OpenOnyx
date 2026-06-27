import React, { useEffect, useRef, useState } from "react";
import {
  FilePlus,
  Network,
  Calendar,
  List,
  Sparkles,
  Layout,
} from "lucide-react";
import type { PluginRibbonAction } from '../../types/plugin';
import { setIcon } from '../../lib/obsidian-api/utils';
import { SpacesIcon } from "../spaces/SpacesIcon";

const ribbonRootClass = "flex flex-col justify-between items-center w-[var(--ribbon-width)] bg-(--bg-secondary) border-r border-(--divider-color) border-t px-1 pt-2 pb-3 shrink-0";
const ribbonGroupClass = "flex flex-col items-center gap-1";
const ribbonBtnClass = "flex h-8 w-8 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-(--text-secondary) transition-colors duration-150 hover:bg-(--bg-hover) hover:text-(--text-primary)";
const pluginRibbonIconClass = "flex h-5 w-5 items-center justify-center text-current [&_.svg-icon]:block [&_.svg-icon]:h-5 [&_.svg-icon]:w-5 [&_.svg-icon]:shrink-0 [&_.svg-icon]:text-current [&_.svg-icon]:[stroke-width:1.5]";

interface RibbonProps {
  onNewNote: () => void;
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
  const [hoveringRibbon, setHoveringRibbon] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const ribbonRootRef = useRef<HTMLDivElement | null>(null);
  const ribbonItemsRef = useRef<HTMLDivElement | null>(null);

  const renderPluginIcon = (el: HTMLSpanElement | null, action: PluginRibbonAction) => {
    if (!el) return;
    setIcon(el, action.icon);
    const svg = el.querySelector("svg");
    if (svg) {
      svg.setAttribute("width", "20");
      svg.setAttribute("height", "20");
      svg.style.width = "20px";
      svg.style.height = "20px";
      svg.style.strokeWidth = "1.5";
      svg.style.color = "currentColor";
    }
    const item = (window as any).__oo_app?.workspace?.leftRibbon?.items?.find(
      (entry: any) => entry.id === (action as any).id,
    );
    if (item) item.buttonEl = el;
  };

  useEffect(() => {
    const ribbon = (window as any).__oo_app?.workspace?.leftRibbon;
    if (!ribbon) return;
    ribbon.containerEl = ribbonRootRef.current;
    ribbon.ribbonItemsEl = ribbonItemsRef.current;
    return () => {
      if (ribbon.containerEl === ribbonRootRef.current) ribbon.containerEl = document.createElement('div');
      if (ribbon.ribbonItemsEl === ribbonItemsRef.current) ribbon.ribbonItemsEl = ribbon.containerEl;
    };
  }, []);

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
      ref={ribbonRootRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={ribbonGroupClass} ref={ribbonItemsRef}>
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
            className={`${ribbonBtnClass} oo-plugin-ribbon-btn`}
            onClick={(e) => action.callback(e.nativeEvent)}
            data-tooltip={action.title}
          >
            <span
              className={pluginRibbonIconClass}
              ref={(el) => renderPluginIcon(el, action)}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
