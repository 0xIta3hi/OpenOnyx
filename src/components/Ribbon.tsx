import React from "react";
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
  Package,
} from "lucide-react";
import { getAPI } from "../utils/api";

interface RibbonProps {
  onNewNote: () => void;
  onSearch: () => void;
  onGraph: () => void;
  onToggleExplorer: () => void;
  onSettings: () => void;
  onDailyNote?: () => void;
  onToggleTags?: () => void;
  onToggleOutline?: () => void;
  onThoughtModel?: () => void;
  onSpaces?: () => void;
  onCanvas?: () => void;
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
}: RibbonProps) {
  const handleSearch = () => {
    document.dispatchEvent(new CustomEvent("editor:open-search"));
  };

  return (
    <div className="app-ribbon">
      <div className="ribbon-top">
        <button
          className="ribbon-btn"
          onClick={onToggleExplorer}
          title="File Explorer (Ctrl+B)"
        >
          <FolderOpen size={20} strokeWidth={1.5} />
        </button>
        <button
          className="ribbon-btn"
          onClick={handleSearch}
          title="Search inside file (Ctrl+F)"
        >
          <Search size={20} strokeWidth={1.5} />
        </button>
        <button
          className="ribbon-btn"
          onClick={onNewNote}
          title="New Note (Ctrl+N)"
        >
          <FilePlus size={20} strokeWidth={1.5} />
        </button>
        {onDailyNote && (
          <button
            className="ribbon-btn"
            onClick={onDailyNote}
            title="Daily Note"
          >
            <Calendar size={20} strokeWidth={1.5} />
          </button>
        )}
        <button
          className="ribbon-btn"
          onClick={onGraph}
          title="Graph View (Ctrl+G)"
        >
          <Network size={20} strokeWidth={1.5} />
        </button>
        {onToggleOutline && (
          <button
            className="ribbon-btn"
            onClick={onToggleOutline}
            title="Toggle Outline"
          >
            <List size={20} strokeWidth={1.5} />
          </button>
        )}
        {onThoughtModel && (
          <button
            className="ribbon-btn"
            onClick={onThoughtModel}
            title="AI Assistant"
          >
            <Sparkles size={20} strokeWidth={1.5} />
          </button>
        )}
        {onSpaces && (
          <button
            className="ribbon-btn"
            onClick={onSpaces}
            title="Spaces"
          >
            <Package size={20} strokeWidth={1.5} />
          </button>
        )}
        {onCanvas && (
          <button
            className="ribbon-btn"
            onClick={onCanvas}
            title="Canvas (Ctrl+Shift+C)"
          >
            <Layout size={20} strokeWidth={1.5} />
          </button>
        )}
      </div>
      <div className="ribbon-bottom">
        <button className="ribbon-btn" onClick={onSettings} title="Settings">
          <Settings size={20} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
