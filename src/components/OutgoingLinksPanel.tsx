/**
 * Outgoing Links Panel
 * 
 * Shows all links from the current note (what this note links to),
 * both resolved and unresolved (phantom) links.
 */

import React, { useMemo } from 'react';
import { ArrowUpRight, FileText, FilePlus } from 'lucide-react';

interface OutgoingLink {
  name: string;
  exists: boolean;
}

interface OutgoingLinksPanelProps {
  content: string;
  existingNotes: string[];
  onLinkClick: (linkName: string) => void;
  visible: boolean;
}

export function OutgoingLinksPanel({ content, existingNotes, onLinkClick, visible }: OutgoingLinksPanelProps) {
  // Extract wiki-links from content
  const links = useMemo(() => {
    if (!content) return [];
    
    const linkRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
    const found = new Set<string>();
    let match;
    
    while ((match = linkRegex.exec(content)) !== null) {
      found.add(match[1].trim());
    }
    
    // Convert to array with existence check
    const existingSet = new Set(existingNotes.map(n => n.toLowerCase().replace('.md', '')));
    
    return Array.from(found).map(name => ({
      name,
      exists: existingSet.has(name.toLowerCase()),
    })).sort((a, b) => {
      // Sort existing first, then alphabetically
      if (a.exists !== b.exists) return a.exists ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [content, existingNotes]);

  if (!visible) return null;

  const existingLinks = links.filter(l => l.exists);
  const phantomLinks = links.filter(l => !l.exists);

  return (
    <div className="outgoing-links-panel">
      <div className="outgoing-links-header">
        <ArrowUpRight size={14} strokeWidth={2} />
        <span>Outgoing Links</span>
        <span className="outgoing-links-count">{links.length}</span>
      </div>

      <div className="outgoing-links-list">
        {links.length === 0 ? (
          <div className="outgoing-links-empty">
            No outgoing links
          </div>
        ) : (
          <>
            {existingLinks.length > 0 && (
              <div className="outgoing-links-section">
                <div className="outgoing-links-section-title">
                  <FileText size={12} /> Linked Notes ({existingLinks.length})
                </div>
                {existingLinks.map(link => (
                  <button
                    key={link.name}
                    className="outgoing-link-item"
                    onClick={() => onLinkClick(link.name)}
                  >
                    <FileText size={14} className="link-icon" />
                    <span className="link-name">{link.name}</span>
                  </button>
                ))}
              </div>
            )}
            
            {phantomLinks.length > 0 && (
              <div className="outgoing-links-section">
                <div className="outgoing-links-section-title phantom">
                  <FilePlus size={12} /> Unresolved ({phantomLinks.length})
                </div>
                {phantomLinks.map(link => (
                  <button
                    key={link.name}
                    className="outgoing-link-item phantom"
                    onClick={() => onLinkClick(link.name)}
                    title="Click to create this note"
                  >
                    <FilePlus size={14} className="link-icon" />
                    <span className="link-name">{link.name}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
