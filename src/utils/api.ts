/**
 * API Bridge
 *
 * Provides a unified API interface that uses the real Electron API
 * when running inside Electron, or falls back to a browser-compatible
 * mock for development and testing.
 */

import { createMockAPI } from "./mockAPI";

type API = typeof window.electronAPI;

let _api: API | null = null;

export function getAPI(): API {
  if (window.electronAPI) {
    // Electron replaces this bridge when a renderer reloads. Refresh the
    // cached reference so plugin and vault operations never target a stale
    // preload object.
    if (_api !== window.electronAPI) _api = window.electronAPI;
    return _api;
  }

  if (!_api) {
    // Running in browser — use mock API
    console.log(
      "%c[OpenObsidian] Running in browser mode with mock API",
      "color: #6c63ff; font-weight: bold;",
    );
    _api = createMockAPI();
  }

  return _api;
}
