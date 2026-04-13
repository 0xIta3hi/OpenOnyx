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
    <div className="panel unlinked-mentions-panel">
      <div className="panel-header" onClick={() => setExpanded(!expanded)}>
        <span className="panel-title">
          <LinkIcon size={14} />
          Unlinked Mentions
          {mentions.length > 0 && (
            <span className="panel-count">{mentions.length}</span>
          )}
        </span>
        <button className="panel-toggle">
          {expanded ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="panel-content">
          {loading ? (
            <div className="panel-loading">Searching...</div>
          ) : mentions.length === 0 ? (
            <div className="panel-empty">
              No unlinked mentions found for "{currentNoteName}"
            </div>
          ) : (
            <div className="unlinked-list">
              {Array.from(groupedMentions.entries()).map(
                ([path, fileMentions]) => (
                  <div key={path} className="unlinked-file">
                    <div className="unlinked-file-header">
                      <FileText size={14} />
                      <span>{getNoteName(path)}</span>
                      <span className="mention-count">
                        {fileMentions.length}
                      </span>
                    </div>
                    {fileMentions.map((mention, i) => (
                      <button
                        key={i}
                        className="unlinked-mention"
                        onClick={() => onNavigate(mention.path, mention.line)}
                        title={`Line ${mention.line}`}
                      >
                        <span className="mention-context">
                          {mention.context.substring(0, mention.matchStart)}
                          <mark>
                            {mention.context.substring(
                              mention.matchStart,
                              mention.matchEnd,
                            )}
                          </mark>
                          {mention.context.substring(mention.matchEnd)}
                        </span>
                        <span className="mention-line">:{mention.line}</span>
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
