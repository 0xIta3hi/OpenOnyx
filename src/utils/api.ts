/**
 * API Bridge
 * 
 * Provides a unified API interface that uses the real Electron API
 * when running inside Electron, or falls back to a browser-compatible
 * mock for development and testing.
 */

import { createMockAPI } from './mockAPI';

type API = typeof window.electronAPI;

let _api: API | null = null;

export function getAPI(): API {
  if (_api) return _api;

  if (window.electronAPI) {
    // Running inside Electron — use real API
    _api = window.electronAPI;
  } else {
    // Running in browser — use mock API
    console.log('%c[OpenObsidian] Running in browser mode with mock API', 'color: #6c63ff; font-weight: bold;');
    _api = createMockAPI();
  }

  return _api;
}
