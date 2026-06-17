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

const editorHeaderClass =
  "flex h-10 min-h-10 select-none items-center justify-between border-t border-[var(--divider-color)] bg-[var(--bg-primary)] px-6";
const editorHeaderSideClass = "flex flex-[0_0_auto] items-center gap-2";
const editorHeaderRightClass = `${editorHeaderSideClass} justify-end`;
const editorHeaderCenterClass =
  "flex min-w-0 flex-1 justify-center overflow-hidden px-6";
const breadcrumbsClass =
  "flex min-w-0 items-center overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-[var(--text-secondary)]";
const breadcrumbPartClass =
  "max-w-[150px] cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap transition-colors duration-150 hover:text-[var(--text-secondary)]";
const activeBreadcrumbPartClass =
  "max-w-[250px] font-medium text-[var(--text-secondary)]";
const breadcrumbSeparatorClass = "mx-1 shrink-0 opacity-50";
const editorHeaderBtnClass =
  "flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border-0 bg-transparent px-2 text-[var(--text-muted)] transition-all duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";
const insightBtnClass =
  "h-8 gap-1.5 py-0 pl-2 pr-2 text-[13px] text-[var(--text-secondary)]";

export function EditorHeader({
  filePath,
  viewMode,
  onViewModeChange,
  onToggleInsight,
  onMoreOptions,
}: EditorHeaderProps) {
  // Parse breadcrumbs
  const pathParts = filePath.split("/").filter(Boolean);
  const fileName = filePath === "__new_tab__" ? "New tab" : (pathParts.pop()?.replace(/\.md$/, "") || "");

  return (
    <div className={editorHeaderClass}>
      <div className={editorHeaderSideClass}>
        <button
          className={`${editorHeaderBtnClass} ${insightBtnClass}`}
          onClick={onToggleInsight}
          title="Note Insights"
        >
          <Lightbulb size={16} strokeWidth={1.5} />
        </button>
      </div>

      <div className={editorHeaderCenterClass}>
        <div className={breadcrumbsClass}>
          {pathParts.map((part, index) => (
            <React.Fragment key={index}>
              <span className={breadcrumbPartClass}>{part}</span>
              <ChevronRight size={14} className={breadcrumbSeparatorClass} />
            </React.Fragment>
          ))}
          <span className={`${breadcrumbPartClass} ${activeBreadcrumbPartClass}`}>{fileName}</span>
        </div>

      </div>

      <div className={editorHeaderRightClass}>
        <button
          className={editorHeaderBtnClass}
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
          className={editorHeaderBtnClass}
          onClick={onMoreOptions}
          title="More options"
        >
          <MoreVertical size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
