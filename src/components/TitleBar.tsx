/**
 * TitleBar - Custom window title bar
 * 
 * Provides window controls (minimize, maximize, close) on non-macOS
 * platforms, along with the app branding.
 */

import React from 'react';
import { Theme } from '../types';
import { getAPI } from '../utils/api';

interface TitleBarProps {
  theme: Theme;
}

export function TitleBar({ theme }: TitleBarProps) {
  const api = getAPI();
  const isMac = navigator.platform.includes('Mac');

  return (
    <div className="titlebar">
      <div className="titlebar-title">
        OpenObsidian
      </div>

      {!isMac && (
        <div className="titlebar-controls">
          <button
            className="titlebar-btn"
            onClick={() => api.minimizeWindow()}
            aria-label="Minimize"
          >
            ─
          </button>
          <button
            className="titlebar-btn"
            onClick={() => api.maximizeWindow()}
            aria-label="Maximize"
          >
            □
          </button>
          <button
            className="titlebar-btn close"
            onClick={() => api.closeWindow()}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
