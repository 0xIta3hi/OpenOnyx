import React from 'react';
import { FilePlus, Search, Network, SunMoon, TerminalSquare } from 'lucide-react';
import { getAPI } from '../utils/api';

interface RibbonProps {
  onNewNote: () => void;
  onSearch: () => void;
  onGraph: () => void;
  onCommandPalette: () => void;
  onSettings: () => void;
}

export function Ribbon({ onNewNote, onSearch, onGraph, onCommandPalette, onSettings }: RibbonProps) {
  const api = getAPI();
  
  const handleSearch = () => {
    // Notify the editor to open the search panel
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
        <button className="ribbon-btn" onClick={onGraph} title="Graph View (Ctrl+G)">
          <Network size={20} strokeWidth={1.5} />
        </button>
      </div>
      <div className="ribbon-bottom">
        <button className="ribbon-btn" onClick={onSettings} title="Toggle Theme">
          <SunMoon size={20} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
