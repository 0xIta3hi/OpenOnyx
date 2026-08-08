/**
 * Status Bar — Onyx-style full-width footer with breadcrumbs + stats
 */

import React from "react";
import type { QueueStatus } from "../../utils/background-queue";
import {
  Check,
  Circle,
  Home,
  Link2,
  PencilLine,
  Paperclip,
  Tag,
} from "lucide-react";
import { Tab, Theme, ViewMode, FileEntry } from "../../types";
import { countWords, countCharacters } from "../../utils/helpers";
import type { PluginStatusBarItem } from '../../types/plugin';
import { VimModeIndicator } from "./VimModeIndicator";

const statusBarClass =
  "onyx-statusbar relative z-[180] flex h-[28px] w-full shrink-0 items-center justify-between overflow-hidden border-t border-[var(--divider-color)] bg-[var(--status-bar-background)] px-3 text-[12px] font-medium text-[var(--status-bar-text-color)]";
const statusGroupClass = "flex min-w-0 items-center gap-1";
const statusItemClass =
  "inline-flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap px-1.5 text-[12px] leading-none text-[var(--status-bar-text-color)]";
const crumbClass =
  "inline-flex max-w-[160px] items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-[var(--text-secondary)]";
const crumbSepClass = "mx-0.5 text-[var(--text-faint)] opacity-70";

interface StatusBarProps {
  activeTab: Tab | null;
  content: string;
  theme: Theme;
  viewMode: ViewMode;
  fileTree?: FileEntry[];
  queueStatus?: QueueStatus | null;
  pluginStatusBarItems?: PluginStatusBarItem[];
  vimEnabled?: boolean;
  showEditingMode?: boolean;
  backlinkCount?: number;
}

export function StatusBar({
  activeTab,
  content,
  viewMode,
  queueStatus,
  pluginStatusBarItems = [],
  vimEnabled = false,
  showEditingMode = true,
  backlinkCount = 0,
}: StatusBarProps) {
  const wordCount = content ? countWords(content) : 0;
  const charCount = content ? countCharacters(content) : 0;

  const pathParts =
    activeTab && !activeTab.path.startsWith("__")
      ? activeTab.path.split("/").filter(Boolean)
      : [];
  const noteName =
    pathParts.length > 0
      ? pathParts[pathParts.length - 1].replace(/\.md$/, "").replace(/\.canvas$/, "")
      : activeTab?.name || "";

  return (
    <div className={statusBarClass}>
      <div className={statusGroupClass} aria-label="Breadcrumbs">
        <span className={statusItemClass} title="Root">
          <Home size={13} strokeWidth={1.75} />
        </span>
        {pathParts.slice(0, -1).map((part, i) => (
          <React.Fragment key={`${part}-${i}`}>
            <span className={crumbSepClass}>›</span>
            <span className={crumbClass} title={part}>
              {part}
            </span>
          </React.Fragment>
        ))}
        {noteName && (
          <>
            <span className={crumbSepClass}>›</span>
            <span className={`${crumbClass} font-medium text-[var(--text-primary)]`}>
              {noteName}
            </span>
          </>
        )}
      </div>

      <div className={statusGroupClass} role="status" aria-label="Status bar">
        {pluginStatusBarItems.map((item, i) => (
          <span
            key={`plugin-status-${item.pluginId}-${i}`}
            className={statusItemClass}
            ref={(el) => {
              if (el && item.el && !el.contains(item.el)) {
                el.innerHTML = '';
                el.appendChild(item.el);
              }
            }}
          />
        ))}
        {queueStatus && (queueStatus.isRunning || queueStatus.message) && (
          <span className={statusItemClass} title={queueStatus.message}>
            <span className={`h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] ${queueStatus.isRunning ? "animate-pulse" : ""}`} />
            <span className="max-w-[180px] truncate">{queueStatus.message}</span>
            {queueStatus.progress > 0 && queueStatus.progress < 100 && (
              <span className="font-semibold [font-variant-numeric:tabular-nums]">{queueStatus.progress}%</span>
            )}
          </span>
        )}
        {activeTab ? (
          <>
            <span
              className={statusItemClass}
              title={activeTab.isModified ? "Modified" : "Saved"}
            >
              {activeTab.isModified ? (
                <Circle size={9} fill="currentColor" />
              ) : (
                <Check size={13} />
              )}
            </span>
            {backlinkCount > 0 && (
              <span className={statusItemClass} title="Backlinks">
                <Link2 size={12} strokeWidth={1.75} />
                {backlinkCount}
              </span>
            )}
            {showEditingMode && (
              <>
                <span className={statusItemClass} title={viewMode}>
                  {viewMode === "editor" ? (
                    <PencilLine size={13} strokeWidth={1.75} />
                  ) : (
                    <Link2 size={13} strokeWidth={1.75} />
                  )}
                </span>
                <VimModeIndicator vimEnabled={vimEnabled} />
              </>
            )}
            <span className={statusItemClass} title="Tags / attributes">
              <Tag size={12} strokeWidth={1.75} />
              attributes
            </span>
            <span className={statusItemClass} title="Attachments">
              <Paperclip size={12} strokeWidth={1.75} />
            </span>
            <span className={statusItemClass}>{wordCount} words</span>
            <span className={statusItemClass}>{charCount} chars</span>
          </>
        ) : (
          pluginStatusBarItems.length === 0 && (
            <span className={statusItemClass}>OpenOnyx</span>
          )
        )}
      </div>
    </div>
  );
}
