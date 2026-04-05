/**
 * Tag Pane - Browse and Filter by Tags
 * 
 * Shows all tags in the vault with counts,
 * allows clicking to filter/search by tag.
 */

import React, { useState, useEffect } from 'react';
import { Hash, ChevronRight, ChevronDown } from 'lucide-react';
import { getAPI } from '../utils/api';

interface TagPaneProps {
  visible: boolean;
  onTagClick: (tag: string) => void;
}

interface TagData {
  name: string;
  count: number;
  files: string[];
}

export function TagPane({ visible, onTagClick }: TagPaneProps) {
  const [tags, setTags] = useState<TagData[]>([]);
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTags = async () => {
      try {
        const api = getAPI();
        const tagMap = await api.getAllTags();
        
        const tagList: TagData[] = Object.entries(tagMap).map(([name, files]) => ({
          name,
          count: files.length,
          files,
        }));
        
        // Sort by count descending, then alphabetically
        tagList.sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return a.name.localeCompare(b.name);
        });
        
        setTags(tagList);
      } catch (err) {
        console.error('Failed to load tags:', err);
      } finally {
        setLoading(false);
      }
    };

    if (visible) {
      loadTags();
    }
  }, [visible]);

  const toggleExpand = (tagName: string) => {
    setExpandedTags(prev => {
      const next = new Set(prev);
      if (next.has(tagName)) {
        next.delete(tagName);
      } else {
        next.add(tagName);
      }
      return next;
    });
  };

  if (!visible) return null;

  return (
    <div className="tag-pane">
      <div className="tag-pane-header">
        <Hash size={14} strokeWidth={2} />
        <span>Tags</span>
        <span className="tag-count">{tags.length}</span>
      </div>

      <div className="tag-list">
        {loading ? (
          <div className="tag-loading">Loading tags...</div>
        ) : tags.length === 0 ? (
          <div className="tag-empty">No tags found</div>
        ) : (
          tags.map(tag => (
            <div key={tag.name} className="tag-group">
              <button
                className="tag-item"
                onClick={() => toggleExpand(tag.name)}
              >
                <span className="tag-expand">
                  {expandedTags.has(tag.name) ? (
                    <ChevronDown size={12} />
                  ) : (
                    <ChevronRight size={12} />
                  )}
                </span>
                <Hash size={12} className="tag-icon" />
                <span className="tag-name">{tag.name}</span>
                <span className="tag-badge">{tag.count}</span>
              </button>
              
              {expandedTags.has(tag.name) && (
                <div className="tag-files">
                  {tag.files.map(file => (
                    <button
                      key={file}
                      className="tag-file"
                      onClick={() => onTagClick(file)}
                    >
                      {file.replace('.md', '')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
