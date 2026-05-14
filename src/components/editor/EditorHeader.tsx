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
    <div className="editor-header">
      <div className="editor-header-left">
        <button
          className="editor-header-btn insight-btn"
          onClick={onToggleInsight}
          title="Note Insights"
        >
          <Lightbulb size={16} strokeWidth={1.5} />
        </button>
      </div>

      <div className="editor-header-center">
        <div className="breadcrumbs">
          {pathParts.map((part, index) => (
            <React.Fragment key={index}>
              <span className="breadcrumb-part">{part}</span>
              <ChevronRight size={14} className="breadcrumb-separator" />
            </React.Fragment>
          ))}
          <span className="breadcrumb-part active">{fileName}</span>
        </div>
      </div>

      <div className="editor-header-right">
        <button
          className="editor-header-btn"
          onClick={() => onViewModeChange(viewMode === "editor" ? "preview" : "editor")}
          title={viewMode === "editor" ? "Reading view" : "Editing view"}
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
        >
          <MoreVertical size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
