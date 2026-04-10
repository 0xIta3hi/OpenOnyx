/**
 * Backlinks Panel
 * 
 * Shows all notes that link to the currently active note,
 * enabling reverse navigation through the knowledge graph.
 */

import React from 'react';
import { X } from 'lucide-react';
import { getNoteName } from '../utils/helpers';

interface BacklinksPanelProps {
  backlinks: string[];
  onBacklinkClick: (path: string) => void;
  onClose: () => void;
}

export function BacklinksPanel({ backlinks, onBacklinkClick, onClose }: BacklinksPanelProps) {
  return (
    <div className="backlinks-panel">
      <div className="backlinks-header">
        <span>Backlinks</span>
        <div className="backlinks-header-right">
          <span className="backlinks-count">{backlinks.length}</span>
          <button className="backlinks-close-btn" onClick={onClose} title="Close backlinks panel">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="backlinks-list">
        {backlinks.length > 0 ? (
          backlinks.map(link => (
            <button
              key={link}
              className="backlink-item"
              onClick={() => onBacklinkClick(link)}
            >
              <span className="backlink-name">{getNoteName(link)}</span>
              <span className="backlink-path">{link}</span>
            </button>
          ))
        ) : (
          <div className="empty-state" style={{ padding: '2rem 1rem' }}>
            <div style={{ fontSize: '24px', opacity: 0.3 }}>🔗</div>
            <div className="empty-text" style={{ textAlign: 'center' }}>
              No backlinks found
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
