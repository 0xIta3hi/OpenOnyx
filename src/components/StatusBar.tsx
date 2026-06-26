/**
 * Status Bar
 *
 * Obsidian-style compact status area.
 */

import React from "react";
import type { QueueStatus } from "../utils/background-queue";
import {
  Check,
  Circle,
  Link2,
  PencilLine,
} from "lucide-react";
import { Tab, Theme, ViewMode, FileEntry } from "../types";
import { countWords, countCharacters } from "../utils/helpers";
import type { PluginStatusBarItem } from '../types/plugin';
import { VimModeIndicator } from "./VimModeIndicator";

const statusBarClass =
  "fixed bottom-0 right-0 z-[180] flex h-[30px] w-fit max-w-[calc(100vw-12px)] items-center justify-end overflow-hidden rounded-tl-[var(--radius-md)] border border-b-0 border-r-0 border-(--status-bar-border-color) bg-(--status-bar-background) text-[12px] font-medium text-(--text-primary) shadow-none";
const statusGroupClass = "flex min-w-0 items-center justify-end gap-0.5";
const statusItemClass =
  "inline-flex h-[29px] shrink-0 items-center gap-1 whitespace-nowrap border-l border-[var(--border-subtle)] px-2 text-[12px] leading-none text-(--text-primary) first:border-l-0";
const statusIconItemClass =
  "inline-flex h-[29px] w-[24px] shrink-0 items-center justify-center border-l border-[var(--border-subtle)] text-(--text-primary) first:border-l-0";

interface StatusBarProps {
  activeTab: Tab | null;
  content: string;
  theme: Theme;
  viewMode: ViewMode;
  fileTree?: FileEntry[];
  queueStatus?: QueueStatus | null;
  pluginStatusBarItems?: PluginStatusBarItem[];
  vimEnabled?: boolean;
  backlinkCount?: number;
}

export function StatusBar({
  activeTab,
  content,
  viewMode,
  queueStatus,
  pluginStatusBarItems = [],
  vimEnabled = false,
  backlinkCount = 0,
}: StatusBarProps) {
  const wordCount = content ? countWords(content) : 0;
  const charCount = content ? countCharacters(content) : 0;

  return (
    <div className={statusBarClass}>
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
        {queueStatus && queueStatus.isRunning && (
          <span className={statusItemClass} title={queueStatus.message}>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--text-muted)]" />
            <span className="max-w-[220px] truncate">{queueStatus.message}</span>
            {queueStatus.progress > 0 && queueStatus.progress < 100 && (
              <span className="font-semibold [font-variant-numeric:tabular-nums]">{queueStatus.progress}%</span>
            )}
          </span>
        )}
        {activeTab ? (
          <>
            <span
              className={statusIconItemClass}
              title={activeTab.isModified ? "Modified" : "Saved"}
            >
              {activeTab.isModified ? (
                <Circle size={10} fill="currentColor" />
              ) : (
                <Check size={13} />
              )}
            </span>
            {backlinkCount > 0 && (
              <span className={statusItemClass} title="Backlinks">
                {backlinkCount} backlinks
              </span>
            )}
            <span className={statusIconItemClass} title={viewMode}>
              {viewMode === "editor" ? <PencilLine size={14} /> : <Link2 size={14} />}
            </span>
            <VimModeIndicator vimEnabled={vimEnabled} />
            <span className={statusItemClass}>{wordCount} words</span>
            <span className={statusItemClass}>{charCount} characters</span>
          </>
        ) : (
          pluginStatusBarItems.length === 0 && <span className={statusItemClass}>OpenObsidian</span>
        )}
      </div>
    </div>
  );
}
