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

interface StatusBarProps {
  activeTab: Tab | null;
  content: string;
  theme: Theme;
  viewMode: ViewMode;
  fileTree?: FileEntry[];
  queueStatus?: QueueStatus | null;
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
}: StatusBarProps) {
  const wordCount = content ? countWords(content) : 0;
  const charCount = content ? countCharacters(content) : 0;
  const lineCount = content ? content.split("\n").length : 0;
  const linkCount = content ? countLinks(content) : 0;
  const tagCount = content ? countTags(content) : 0;

  const vaultStats = useMemo(() => countEntries(fileTree), [fileTree]);

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        {activeTab ? (
          <>
            <span
              className="status-item"
              style={{ display: "flex", alignItems: "center", gap: "4px" }}
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
            <span className="status-item">{wordCount} words</span>
            <span className="status-item">{charCount} chars</span>
            <span className="status-item">{lineCount} lines</span>
            {linkCount > 0 && (
              <span className="status-item" title="Links in this note">
                <Link2 size={12} style={{ opacity: 0.7 }} /> {linkCount}
              </span>
            )}
            {tagCount > 0 && (
              <span className="status-item" title="Tags in this note">
                <Hash size={12} style={{ opacity: 0.7 }} /> {tagCount}
              </span>
            )}
          </>
        ) : (
          <span className="status-item">OpenObsidian</span>
        )}
      </div>
      {queueStatus && queueStatus.isRunning && (
        <div className="status-bar-queue">
          <span className="status-bar-queue-dot" />
          <span>{queueStatus.message}</span>
          {queueStatus.progress > 0 && queueStatus.progress < 100 && (
            <span className="status-bar-queue-progress">{queueStatus.progress}%</span>
          )}
        </div>
      )}
      <div className="status-bar-right">
        {vaultStats.notes > 0 && (
          <span className="status-item" title="Notes in vault">
            <FileText size={12} style={{ opacity: 0.7 }} /> {vaultStats.notes}
          </span>
        )}
        {vaultStats.folders > 0 && (
          <span className="status-item" title="Folders in vault">
            <FolderOpen size={12} style={{ opacity: 0.7 }} />{" "}
            {vaultStats.folders}
          </span>
        )}
        <span className="status-item">{viewMode}</span>
        <span
          className="status-item"
          style={{ display: "flex", alignItems: "center" }}
        >
          {theme === "dark" || theme === "oceanic" ? (
            <Moon size={14} />
          ) : (
            <Sun size={14} />
          )}
        </span>
        <span className="status-item">Markdown</span>
      </div>
    </div>
  );
}
