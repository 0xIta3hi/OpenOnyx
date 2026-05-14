import React from 'react';
import { Plus, Search, X, FilePlus, FileSearch } from 'lucide-react';

interface NewTabViewProps {
  onNewNote: () => void;
  onSearch: () => void;
  onClose: () => void;
}

export function NewTabView({ onNewNote, onSearch, onClose }: NewTabViewProps) {
  return (
    <div className="new-tab-view">
      <div className="new-tab-content">
        <div className="new-tab-logo">
           {/* You can add a logo here if needed */}
        </div>
        
        <div className="new-tab-actions">
          <button onClick={onNewNote} className="new-tab-link">
            <span className="link-icon"><Plus size={18} /></span>
            <span className="link-text">Create new note</span>
            <span className="link-shortcut">Ctrl + N</span>
          </button>
          
          <button onClick={onSearch} className="new-tab-link">
            <span className="link-icon"><Search size={18} /></span>
            <span className="link-text">Go to file</span>
            <span className="link-shortcut">Ctrl + O</span>
          </button>
        </div>
      </div>
    </div>
  );
}
