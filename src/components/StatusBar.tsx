/**
 * Status Bar
 * 
 * Bottom bar showing document stats, view mode, and theme info.
 */

import React from 'react';
import { Moon, Sun, Check, Circle } from 'lucide-react';
import { Tab, Theme, ViewMode } from '../types';
import { countWords, countCharacters } from '../utils/helpers';

interface StatusBarProps {
  activeTab: Tab | null;
  content: string;
  theme: Theme;
  viewMode: ViewMode;
}

export function StatusBar({ activeTab, content, theme, viewMode }: StatusBarProps) {
  const wordCount = content ? countWords(content) : 0;
  const charCount = content ? countCharacters(content) : 0;
  const lineCount = content ? content.split('\n').length : 0;

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        {activeTab ? (
          <>
            <span className="status-item" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {activeTab.isModified ? <><Circle size={10} fill="currentColor" /> Modified</> : <><Check size={14} /> Saved</>}
            </span>
            <span className="status-item">{wordCount} words</span>
            <span className="status-item">{charCount} chars</span>
            <span className="status-item">{lineCount} lines</span>
          </>
        ) : (
          <span className="status-item">OpenObsidian</span>
        )}
      </div>
      <div className="status-bar-right">
        <span className="status-item">{viewMode}</span>
        <span className="status-item" style={{ display: 'flex', alignItems: 'center' }}>
          {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
        </span>
        <span className="status-item">Markdown</span>
      </div>
    </div>
  );
}
