import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Bookmark,
  Check,
  ChevronRight,
  CirclePlus,
  Clipboard,
  Code2,
  Copy,
  ExternalLink,
  FileDown,
  FolderInput,
  FolderOpen,
  GitMerge,
  History,
  Lightbulb,
  Link,
  MoreVertical,
  PanelBottomOpen,
  PanelRightOpen,
  PenLine,
  Pencil,
  Replace,
  Search,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { ViewMode } from "../../types";

interface EditorHeaderProps {
  filePath: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleInsight?: () => void;
  activeEditors?: any[];
  onToggleBacklinks?: () => void;
  onSplitRight?: () => void;
  onSplitDown?: () => void;
  onOpenInNewWindow?: () => void;
  onRename?: () => void;
  onMoveFile?: () => void;
  onBookmark?: () => void;
  onMergeFile?: () => void;
  onAddProperty?: () => void;
  onExportPdf?: () => void;
  onFind?: () => void;
  onReplace?: () => void;
  onCopyRelativePath?: () => void;
  onCopyAbsolutePath?: () => void;
  onOpenVersionHistory?: () => void;
  onOpenLinkedView?: () => void;
  onOpenInDefaultApp?: () => void;
  onShowInSystemExplorer?: () => void;
  onRevealInNavigation?: () => void;
  onDeleteFile?: () => void;
  canCopyAbsolutePath?: boolean;
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
const menuBackdropClass = "fixed inset-0 z-[3600] bg-transparent";
const menuClass =
  "fixed z-[3601] w-[205px] overflow-visible rounded-md border border-[var(--border-medium)] bg-[var(--bg-elevated)] py-[5px] text-[13px] text-[var(--text-secondary)] shadow-[0_8px_24px_rgba(0,0,0,0.38)]";
const menuItemClass =
  "group/menu-item flex min-h-[25px] w-full items-center gap-2 border-0 bg-transparent px-3 py-0.5 text-left font-[inherit] leading-5 text-[var(--text-secondary)] outline-none transition-colors duration-100 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";
const menuItemDangerClass = "text-[var(--danger)] hover:text-[var(--danger)]";
const menuItemDisabledClass =
  "cursor-default opacity-45 hover:bg-transparent hover:text-[var(--text-secondary)]";
const menuIconClass = "flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-muted)]";
const menuLabelClass = "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap";
const menuCheckClass = "ml-auto flex h-4 w-4 shrink-0 items-center justify-center";
const menuSeparatorClass = "mx-0 my-1 h-px bg-[var(--border-subtle)]";
const submenuContainerClass = "group/submenu relative";
const submenuClass =
  "absolute left-[calc(100%-2px)] top-[-5px] z-[3602] hidden w-[178px] rounded-md border border-[var(--border-medium)] bg-[var(--bg-elevated)] py-[5px] shadow-[0_8px_24px_rgba(0,0,0,0.38)] group-hover/submenu:block";

function MenuIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className={menuIconClass}>
      <Icon size={15} strokeWidth={1.6} />
    </span>
  );
}

function clampMenuPosition(x: number, y: number, width = 205, height = 430) {
  const margin = 8;
  return {
    x: Math.min(Math.max(margin, x), Math.max(margin, window.innerWidth - width - margin)),
    y: Math.min(Math.max(margin, y), Math.max(margin, window.innerHeight - height - margin)),
  };
}

export function EditorHeader({
  filePath,
  viewMode,
  onViewModeChange,
  onToggleInsight,
  onToggleBacklinks,
  onSplitRight,
  onSplitDown,
  onOpenInNewWindow,
  onRename,
  onMoveFile,
  onBookmark,
  onMergeFile,
  onAddProperty,
  onExportPdf,
  onFind,
  onReplace,
  onCopyRelativePath,
  onCopyAbsolutePath,
  onOpenVersionHistory,
  onOpenLinkedView,
  onOpenInDefaultApp,
  onShowInSystemExplorer,
  onRevealInNavigation,
  onDeleteFile,
  canCopyAbsolutePath,
}: EditorHeaderProps) {
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!menuPosition) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuPosition(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuPosition]);

  // Parse breadcrumbs
  const pathParts = filePath.split("/").filter(Boolean);
  const fileName = filePath === "__new_tab__" ? "New tab" : (pathParts.pop()?.replace(/\.md$/, "") || "");
  const isReadingView = viewMode === "preview";

  const openMenu = () => {
    const rect = moreButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPosition(clampMenuPosition(rect.right - 205, rect.bottom + 4));
  };

  const runAction = (action?: () => void) => {
    if (!action) return;
    setMenuPosition(null);
    action();
  };

  const renderItem = (
    label: string,
    icon: LucideIcon,
    action?: () => void,
    options: { danger?: boolean; disabled?: boolean; checked?: boolean; trailing?: React.ReactNode } = {},
  ) => (
    <button
      type="button"
      className={`${menuItemClass} ${options.danger ? menuItemDangerClass : ""} ${options.disabled ? menuItemDisabledClass : "cursor-pointer"}`}
      onClick={() => !options.disabled && runAction(action)}
      disabled={options.disabled}
    >
      <MenuIcon icon={icon} />
      <span className={menuLabelClass}>{label}</span>
      {options.trailing ?? (
        options.checked ? (
          <span className={menuCheckClass}>
            <Check size={14} strokeWidth={1.6} />
          </span>
        ) : null
      )}
    </button>
  );

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
          ref={moreButtonRef}
          className={editorHeaderBtnClass}
          onClick={openMenu}
          title="More options"
        >
          <MoreVertical size={16} strokeWidth={1.5} />
        </button>
      </div>

      {menuPosition && (
        <div
          className={menuBackdropClass}
          onClick={() => setMenuPosition(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenuPosition(null);
          }}
        >
          <div
            className={menuClass}
            style={{ left: menuPosition.x, top: menuPosition.y }}
            onClick={(event) => event.stopPropagation()}
          >
            {renderItem("Backlinks in document", Link, onToggleBacklinks)}
            {renderItem("Reading view", BookOpen, () => onViewModeChange(isReadingView ? "editor" : "preview"), { checked: isReadingView })}
            <div className={menuSeparatorClass} />
            {renderItem("Split right", SplitSquareHorizontal, onSplitRight)}
            {renderItem("Split down", SplitSquareVertical, onSplitDown)}
            {renderItem("Open in new window", PanelRightOpen, onOpenInNewWindow, { disabled: !onOpenInNewWindow })}
            <div className={menuSeparatorClass} />
            {renderItem("Rename...", Pencil, onRename)}
            {renderItem("Move file to...", FolderInput, onMoveFile)}
            {renderItem("Bookmark...", Bookmark, onBookmark)}
            {renderItem("Merge entire file with...", GitMerge, onMergeFile, { disabled: !onMergeFile })}
            {renderItem("Add file property", CirclePlus, onAddProperty)}
            {renderItem("Export to PDF...", FileDown, onExportPdf)}
            <div className={menuSeparatorClass} />
            {renderItem("Find...", Search, onFind)}
            {renderItem("Replace...", Replace, onReplace)}
            <div className={menuSeparatorClass} />
            <div className={submenuContainerClass}>
              <button type="button" className={`${menuItemClass} cursor-default`}>
                <MenuIcon icon={Clipboard} />
                <span className={menuLabelClass}>Copy path</span>
                <ChevronRight size={14} strokeWidth={1.6} />
              </button>
              <div className={submenuClass}>
                {renderItem("Relative path", Copy, onCopyRelativePath)}
                {renderItem("Absolute path", Copy, onCopyAbsolutePath, { disabled: !canCopyAbsolutePath })}
              </div>
            </div>
            <div className={menuSeparatorClass} />
            {renderItem("Open version history", History, onOpenVersionHistory, { disabled: !onOpenVersionHistory })}
            {renderItem("Open linked view", Code2, onOpenLinkedView, {
              disabled: !onOpenLinkedView,
              trailing: <ChevronRight size={14} strokeWidth={1.6} />,
            })}
            <div className={menuSeparatorClass} />
            {renderItem("Open in default app", ExternalLink, onOpenInDefaultApp)}
            {renderItem("Show in system explorer", FolderOpen, onShowInSystemExplorer)}
            {renderItem("Reveal file in navigation", PanelBottomOpen, onRevealInNavigation)}
            <div className={menuSeparatorClass} />
            {renderItem("Delete file", Trash2, onDeleteFile, { danger: true })}
          </div>
        </div>
      )}
    </div>
  );
}
