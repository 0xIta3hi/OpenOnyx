// ── Global setup for plugins (must be before anything else) ──
import moment from 'moment';
(window as any).moment = moment;
(window as any)._bundledLocaleWeekSpec = (moment.localeData() as any)._week || { dow: 0, doy: 6 };

import './lib/obsidian-api/dom-extensions';

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "katex/dist/katex.min.css";
import "./styles/index.css";
import "./styles/spaces.css";
import "./styles/plugins.css";
import "./styles/collaboration.css";
import "./styles/database.css";

// ── Global shims for plugin compatibility ──
if (!(String.prototype as any).contains) {
  (String.prototype as any).contains = String.prototype.includes;
}
if (!(Array.prototype as any).contains) {
  (Array.prototype as any).contains = Array.prototype.includes;
}

// ── Global Error Handling for Debugging ──
window.onerror = (msg, url, line, col, error) => {
  if (typeof msg === 'string' && msg.includes('ResizeObserver loop completed')) return false;
  console.log(`[FATAL] ${msg} at ${url}:${line}:${col}`, error);
  return false;
};
window.onunhandledrejection = (event) => {
  console.log(`[REJECTION]`, event.reason);
};

console.log('[OpenObsidian] Main entry point executing');

const rootEl = document.getElementById("root");
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} else {
  console.error('[OpenObsidian] Root element not found!');
}
