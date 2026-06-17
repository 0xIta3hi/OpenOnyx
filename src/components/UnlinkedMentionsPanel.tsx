/**
 * Unlinked Mentions Panel
 *
 * Finds text in other notes that matches the current note's name
 * but isn't linked with [[brackets]]. Allows quick conversion to links.
 */

import React, { useState, useEffect, useMemo } from "react";
import { Link, LinkIcon, Eye, EyeOff, FileText } from "lucide-react";
import { getAPI } from "../utils/api";
import { getNoteName } from "../utils/helpers";

const api = getAPI();

interface UnlinkedMention {
  path: string;
  name: string;
  line: number;
  context: string;
  matchStart: number;
  matchEnd: number;
}

interface UnlinkedMentionsPanelProps {
  currentNotePath: string | null;
  currentNoteName: string;
  visible: boolean;
  onNavigate: (path: string, line?: number) => void;
}

export function UnlinkedMentionsPanel({
  currentNotePath,
  currentNoteName,
  visible,
  onNavigate,
}: UnlinkedMentionsPanelProps) {
  const [mentions, setMentions] = useState<UnlinkedMention[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  // Search for unlinked mentions when note changes
  useEffect(() => {
    if (!visible || !currentNoteName || currentNoteName.length < 2) {
      setMentions([]);
      return;
    }

    const searchMentions = async () => {
      setLoading(true);
      try {
        // Search for the note name in all files
        const results = await api.search(currentNoteName);

        const foundMentions: UnlinkedMention[] = [];

        for (const result of results) {
          // Skip the current note itself
          if (result.path === currentNotePath) continue;

          // Read the file content to find unlinked mentions
          const content = await api.readFile(result.path);
          const lines = content.split("\n");

          const namePattern = new RegExp(
            `(?<!\\[\\[)\\b${escapeRegex(currentNoteName)}\\b(?!\\]\\])`,
            "gi",
          );

          lines.forEach((line, lineIndex) => {
            let match;
            while ((match = namePattern.exec(line)) !== null) {
              // Make sure it's not inside a link
              const beforeMatch = line.substring(0, match.index);
              const afterMatch = line.substring(match.index + match[0].length);

              // Skip if it's already in a wiki-link
              if (beforeMatch.includes("[[") && !beforeMatch.includes("]]"))
                continue;
              if (afterMatch.includes("]]") && !afterMatch.includes("[["))
                continue;

              // Get context (surrounding text)
              const contextStart = Math.max(0, match.index - 30);
              const contextEnd = Math.min(
                line.length,
                match.index + match[0].length + 30,
              );
              const context = line.substring(contextStart, contextEnd);

              foundMentions.push({
                path: result.path,
                name: getNoteName(result.path),
                line: lineIndex + 1,
                context:
                  (contextStart > 0 ? "..." : "") +
                  context +
                  (contextEnd < line.length ? "..." : ""),
                matchStart:
                  match.index - contextStart + (contextStart > 0 ? 3 : 0),
                matchEnd:
                  match.index -
                  contextStart +
                  match[0].length +
                  (contextStart > 0 ? 3 : 0),
              });
            }
          });
        }

        setMentions(foundMentions);
      } catch (err) {
        console.error("Error searching for unlinked mentions:", err);
      } finally {
        setLoading(false);
      }
    };

    searchMentions();
  }, [currentNotePath, currentNoteName, visible]);

  if (!visible) return null;

  // Group by file
  const groupedMentions = useMemo(() => {
    const groups = new Map<string, UnlinkedMention[]>();
    mentions.forEach((m) => {
      if (!groups.has(m.path)) groups.set(m.path, []);
      groups.get(m.path)!.push(m);
    });
    return groups;
  }, [mentions]);

  return (
    <div className="border-t border-(--border-subtle)">
      <div className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-(--bg-hover) transition-colors duration-100" onClick={() => setExpanded(!expanded)}>
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
          <LinkIcon size={14} />
          Unlinked Mentions
          {mentions.length > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-(--bg-active) text-(--text-secondary) normal-case tracking-normal">{mentions.length}</span>
          )}
        </span>
        <button className="bg-transparent border-none text-(--text-muted) p-0 cursor-pointer">
          {expanded ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="px-2 pb-2">
          {loading ? (
            <div className="px-2 py-4 text-center text-xs text-(--text-muted)">Searching...</div>
          ) : mentions.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-(--text-muted)">
              No unlinked mentions found for "{currentNoteName}"
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {Array.from(groupedMentions.entries()).map(
                ([path, fileMentions]) => (
                  <div key={path} className="rounded-md overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold text-(--text-secondary) bg-(--bg-active)">
                      <FileText size={14} className="shrink-0 text-(--text-muted)" />
                      <span className="truncate">{getNoteName(path)}</span>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-(--bg-hover) text-(--text-muted) ml-auto">
                        {fileMentions.length}
                      </span>
                    </div>
                    {fileMentions.map((mention, i) => (
                      <button
                        key={i}
                        className="w-full flex items-center gap-2 px-3 py-1.5 bg-transparent border-none text-left cursor-pointer transition-colors duration-100 hover:bg-(--bg-hover)"
                        onClick={() => onNavigate(mention.path, mention.line)}
                        title={`Line ${mention.line}`}
                      >
                        <span className="text-[11px] text-(--text-muted) leading-relaxed flex-1 truncate">
                          {mention.context.substring(0, mention.matchStart)}
                          <mark className="bg-amber-500/20 text-amber-300 rounded-sm px-0.5">
                            {mention.context.substring(
                              mention.matchStart,
                              mention.matchEnd,
                            )}
                          </mark>
                          {mention.context.substring(mention.matchEnd)}
                        </span>
                        <span className="text-[10px] text-(--text-muted) shrink-0">:{mention.line}</span>
                      </button>
                    ))}
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Escape special regex characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
