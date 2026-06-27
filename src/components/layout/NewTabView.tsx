import React from 'react';
import { Plus, Search, X, FilePlus, FileSearch } from 'lucide-react';

interface NewTabViewProps {
  onNewNote: () => void;
  onSearch: () => void;
  onClose: () => void;
}

export function NewTabView({ onNewNote, onSearch, onClose }: NewTabViewProps) {
  return (
    <div className="flex items-center justify-center h-full w-full bg-(--bg-primary)">
      <div className="flex flex-col items-center gap-6">
        <div className="mb-2">
           {/* You can add a logo here if needed */}
        </div>
        
        <div className="flex flex-col gap-2 w-full max-w-[280px]">
          <button onClick={onNewNote} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-(--bg-secondary) border border-(--border-subtle) text-(--text-primary) cursor-pointer transition-all duration-150 hover:bg-(--bg-hover) hover:border-(--border-medium)">
            <span className="text-(--text-muted)"><Plus size={18} /></span>
            <span className="text-sm font-medium flex-1 text-left">Create new note</span>
            <span className="text-[11px] text-(--text-muted) font-mono px-1.5 py-0.5 rounded bg-(--bg-active)">Ctrl + N</span>
          </button>
          
          <button onClick={onSearch} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-(--bg-secondary) border border-(--border-subtle) text-(--text-primary) cursor-pointer transition-all duration-150 hover:bg-(--bg-hover) hover:border-(--border-medium)">
            <span className="text-(--text-muted)"><Search size={18} /></span>
            <span className="text-sm font-medium flex-1 text-left">Go to file</span>
            <span className="text-[11px] text-(--text-muted) font-mono px-1.5 py-0.5 rounded bg-(--bg-active)">Ctrl + O</span>
          </button>
        </div>
      </div>
    </div>
  );
}
