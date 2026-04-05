import React from 'react';
import { FilePlus, Search, Network, Settings, TerminalSquare, Calendar, FileText, Hash, List } from 'lucide-react';
import { getAPI } from '../utils/api';

interface RibbonProps {
  onNewNote: () => void;
  onSearch: () => void;
  onGraph: () => void;
  onCommandPalette: () => void;
  onSettings: () => void;
  onDailyNote?: () => void;
  onToggleTags?: () => void;
  onToggleOutline?: () => void;
}

export function Ribbon({ 
  onNewNote, 
  onSearch, 
  onGraph, 
  onCommandPalette, 
  onSettings,
  onDailyNote,
  onToggleTags,
  onToggleOutline
}: RibbonProps) {
  const handleSearch = () => {
    document.dispatchEvent(new CustomEvent('editor:open-search'));
  };

  return (
    <div className="app-ribbon">
      <div className="ribbon-top">
        <button className="ribbon-btn" onClick={onCommandPalette} title="Command Palette (Ctrl+P)">
          <TerminalSquare size={20} strokeWidth={1.5} />
        </button>
        <button className="ribbon-btn" onClick={handleSearch} title="Search inside file (Ctrl+F)">
          <Search size={20} strokeWidth={1.5} />
        </button>
        <button className="ribbon-btn" onClick={onNewNote} title="New Note (Ctrl+N)">
          <FilePlus size={20} strokeWidth={1.5} />
        </button>
        {onDailyNote && (
          <button className="ribbon-btn" onClick={onDailyNote} title="Daily Note">
            <Calendar size={20} strokeWidth={1.5} />
          </button>
        )}
        <button className="ribbon-btn" onClick={onGraph} title="Graph View (Ctrl+G)">
          <Network size={20} strokeWidth={1.5} />
        </button>
        {onToggleOutline && (
          <button className="ribbon-btn" onClick={onToggleOutline} title="Toggle Outline">
            <List size={20} strokeWidth={1.5} />
          </button>
        )}
        {onToggleTags && (
          <button className="ribbon-btn" onClick={onToggleTags} title="Toggle Tags">
            <Hash size={20} strokeWidth={1.5} />
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
