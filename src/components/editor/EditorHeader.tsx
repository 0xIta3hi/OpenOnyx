import React from "react";
import { Lightbulb, ChevronRight, BookOpen, PenLine, MoreVertical } from "lucide-react";
import { ViewMode } from "../../types";

interface EditorHeaderProps {
  filePath: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleInsight?: () => void;
  onMoreOptions?: () => void;
  activeEditors?: any[];
}

export function EditorHeader({
  filePath,
  viewMode,
  onViewModeChange,
  onToggleInsight,
  onMoreOptions,
  activeEditors = [],
}: EditorHeaderProps) {
  // Parse breadcrumbs
  const pathParts = filePath.split("/").filter(Boolean);
  const fileName = filePath === "__new_tab__" ? "New tab" : (pathParts.pop()?.replace(/\.md$/, "") || "");

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

        {activeEditors && activeEditors.length > 0 && (
          <div className="editor-collab-pill" title={activeEditors.map(u => u.name || u.email.split("@")[0]).join(", ")}>
            <span className="editor-collab-dot" />
            <span>
              {activeEditors.map(u => u.name || u.email.split("@")[0]).join(", ")} {activeEditors.length === 1 ? "is" : "are"} editing
            </span>
          </div>
        )}
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

