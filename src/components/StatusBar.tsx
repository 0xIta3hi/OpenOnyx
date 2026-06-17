/**
 * Status Bar
 *
 * Bottom bar showing document stats, view mode, vault stats, and theme info.
 */

import React, { useMemo } from "react";
import type { QueueStatus } from "../utils/background-queue";
import {
  Moon,
  Sun,
  Check,
  Circle,
  FileText,
  FolderOpen,
  Link2,
  Hash,
} from "lucide-react";
import { Tab, Theme, ViewMode, FileEntry } from "../types";
import { countWords, countCharacters } from "../utils/helpers";
import type { PluginStatusBarItem } from '../types/plugin';
import { VimModeIndicator } from "./VimModeIndicator";

const statusBarClass =
  "flex h-[24px] shrink-0 items-center justify-between gap-6 bg-(--status-bar-background) border-t border-(--status-bar-border-color) px-6 text-[var(--status-bar-font-size)] text-(--status-bar-text-color)";
const statusGroupClass = "flex min-w-0 items-center gap-2";
const statusRightGroupClass = `${statusGroupClass} justify-end`;
const statusItemClass = "inline-flex items-center text-xs text-(--text-muted) px-1.5";
const statusItemGapClass = `${statusItemClass} gap-1`;

interface StatusBarProps {
  activeTab: Tab | null;
  content: string;
  theme: Theme;
  viewMode: ViewMode;
  fileTree?: FileEntry[];
  queueStatus?: QueueStatus | null;
  pluginStatusBarItems?: PluginStatusBarItem[];
  vimEnabled?: boolean;
}

// Count notes and folders recursively
function countEntries(entries: FileEntry[]): {
  notes: number;
  folders: number;
} {
  let notes = 0;
  let folders = 0;

  for (const entry of entries) {
    if (entry.isDirectory) {
      folders++;
      if (entry.children) {
        const sub = countEntries(entry.children);
        notes += sub.notes;
        folders += sub.folders;
      }
    } else if (entry.extension === ".md") {
      notes++;
    }
  }

  return { notes, folders };
}

// Count links in text
function countLinks(text: string): number {
  const matches = text.match(/\[\[[^\]]+\]\]/g);
  return matches ? matches.length : 0;
}

// Count tags in text
function countTags(text: string): number {
  const matches = text.match(/#[a-zA-Z0-9_/-]+/g);
  return matches ? matches.length : 0;
}

export function StatusBar({
  activeTab,
  content,
  theme,
  viewMode,
  fileTree = [],
  queueStatus,
  pluginStatusBarItems = [],
  vimEnabled = false,
}: StatusBarProps) {
  const wordCount = content ? countWords(content) : 0;
  const charCount = content ? countCharacters(content) : 0;
  const lineCount = content ? content.split("\n").length : 0;
  const linkCount = content ? countLinks(content) : 0;
  const tagCount = content ? countTags(content) : 0;

  const vaultStats = useMemo(() => countEntries(fileTree), [fileTree]);

  return (
    <div className={statusBarClass}>
      <div className={statusGroupClass}>
        {activeTab ? (
          <>
            <span
              className={statusItemGapClass}
            >
              {activeTab.isModified ? (
                <>
                  <Circle size={10} fill="currentColor" /> Modified
                </>
              ) : (
                <>
                  <Check size={14} /> Saved
                </>
              )}
            </span>
            <span className={statusItemClass}>{wordCount} words</span>
            <span className={statusItemClass}>{charCount} chars</span>
            <span className={statusItemClass}>{lineCount} lines</span>
            {linkCount > 0 && (
              <span className={statusItemGapClass} title="Links in this note">
                <Link2 size={12} className="opacity-70" /> {linkCount}
              </span>
            )}
            {tagCount > 0 && (
              <span className={statusItemGapClass} title="Tags in this note">
                <Hash size={12} className="opacity-70" /> {tagCount}
              </span>
            )}
          </>
        ) : (
          <span className={statusItemClass}>OpenObsidian</span>
        )}
      </div>
      {queueStatus && queueStatus.isRunning && (
        <div className="flex items-center gap-1.5 text-[11px] text-(--text-muted)">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--text-muted)]" />
          <span>{queueStatus.message}</span>
          {queueStatus.progress > 0 && queueStatus.progress < 100 && (
            <span className="font-semibold [font-variant-numeric:tabular-nums]">{queueStatus.progress}%</span>
          )}
        </div>
      )}
      {/* Plugin status bar items */}
      {pluginStatusBarItems.length > 0 && (
        <div className={statusGroupClass}>
          {pluginStatusBarItems.map((item, i) => (
            <span
              key={`plugin-status-${item.pluginId}-${i}`}
              ref={(el) => {
                if (el && item.el && !el.contains(item.el)) {
                  el.innerHTML = '';
                  el.appendChild(item.el);
                }
              }}
            />
          ))}
        </div>
      )}
      <div className={statusRightGroupClass}>
        <VimModeIndicator vimEnabled={vimEnabled} />
        {vaultStats.notes > 0 && (
          <span className={statusItemGapClass} title="Notes in vault">
            <FileText size={12} className="opacity-70" /> {vaultStats.notes}
          </span>
        )}
        {vaultStats.folders > 0 && (
          <span className={statusItemGapClass} title="Folders in vault">
            <FolderOpen size={12} className="opacity-70" />{" "}
            {vaultStats.folders}
          </span>
        )}
        <span className={statusItemClass}>{viewMode}</span>
        <span
          className={statusItemClass}
        >
          {theme === "dark" || theme === "oceanic" || theme === "dark-plus" ? (
            <Moon size={14} />
          ) : (
            <Sun size={14} />
          )}
        </span>
        <span className={statusItemClass}>Markdown</span>
      </div>
    </div>
  );
}
