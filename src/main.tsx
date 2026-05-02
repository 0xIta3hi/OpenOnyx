// ── Global setup for plugins (must be before anything else) ──
import moment from 'moment';
(window as any).moment = moment;
(window as any)._bundledLocaleWeekSpec = (moment.localeData() as any)._week || { dow: 0, doy: 6 };
console.log('[Moment Debug] _week:', (moment.localeData() as any)._week);
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
