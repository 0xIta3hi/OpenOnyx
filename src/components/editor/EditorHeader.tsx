import React from "react";
import { Lightbulb, ChevronRight, BookOpen, PenLine, MoreVertical } from "lucide-react";
import { ViewMode } from "../../types";

interface EditorHeaderProps {
  filePath: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleInsight?: () => void;
  onMoreOptions?: () => void;
}

export function EditorHeader({
  filePath,
  viewMode,
  onViewModeChange,
  onToggleInsight,
  onMoreOptions,
}: EditorHeaderProps) {
  // Parse breadcrumbs
  const pathParts = filePath.split("/").filter(Boolean);
  const fileName = pathParts.pop()?.replace(/\.md$/, "") || "";

  return (
    <div className="editor-header" style={{ position: 'relative', display: 'flex', justifyContent: 'space-between' }}>
      <div className="editor-header-left" style={{ flexShrink: 0, flexGrow: 0 }}>
        <button
          className="editor-header-btn insight-btn"
          onClick={onToggleInsight}
          title="Note Insights"
          style={{ width: '32px', height: '32px', justifyContent: 'center', padding: 0 }}
        >
          <Lightbulb size={16} strokeWidth={1.5} />
        </button>
      </div>

      <div 
        className="editor-header-center" 
        style={{ 
          position: 'static', 
          transform: 'none', 
          flex: 1, 
          minWidth: 0, 
          pointerEvents: 'auto',
          display: 'flex',
          justifyContent: 'center',
          padding: '0 12px'
        }}
      >
        <div className="breadcrumbs" style={{ display: 'flex', minWidth: 0, overflow: 'hidden' }}>
          {pathParts.map((part, index) => (
            <React.Fragment key={index}>
              <span className="breadcrumb-part" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>{part}</span>
              <ChevronRight size={14} className="breadcrumb-separator" style={{ flexShrink: 0, minWidth: '14px' }} />
            </React.Fragment>
          ))}
          <span className="breadcrumb-part active" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, fontWeight: 600 }}>{fileName}</span>
        </div>
      </div>

      <div className="editor-header-right" style={{ flexShrink: 0, flexGrow: 0 }}>
        <button
          className="editor-header-btn"
          onClick={() => onViewModeChange(viewMode === "editor" ? "preview" : "editor")}
          title={viewMode === "editor" ? "Reading view" : "Editing view"}
          style={{ width: '32px', height: '32px', justifyContent: 'center', padding: 0 }}
        >
          {viewMode === "editor" ? (
            <BookOpen size={16} strokeWidth={1.5} />
          ) : (
            <PenLine size={16} strokeWidth={1.5} />
          )}
        </button>
        <button
          className="editor-header-btn"
          onClick={onMoreOptions}
          title="More options"
          style={{ width: '32px', height: '32px', justifyContent: 'center', padding: 0 }}
        >
          <MoreVertical size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
