/**
 * Obsidian API Compatibility — Utility Functions
 */

export function normalizePath(path: string): string {
  if (!path || path === '/') return '/';
  const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
  return normalized || '/';
}

export function parseYaml(yaml: string): any {
  try {
    const lines = yaml.trim().split('\n');
    const result: Record<string, any> = {};
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx < 0) continue;
      const key = line.substring(0, colonIdx).trim();
      let value: any = line.substring(colonIdx + 1).trim();
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (value === 'null') value = null;
      else if (/^\d+$/.test(value)) value = parseInt(value, 10);
      else if (/^\d+\.\d+$/.test(value)) value = parseFloat(value);
      else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
        value = value.slice(1, -1);
      if (value === '') value = null;
      if (key) result[key] = value;
    }
    return result;
  } catch { return {}; }
}

export function stringifyYaml(obj: any): string {
  if (!obj || typeof obj !== 'object') return '';
  return Object.entries(obj).map(([k, v]) => {
    if (v === null || v === undefined) return `${k}: `;
    if (typeof v === 'string') return `${k}: "${v}"`;
    return `${k}: ${v}`;
  }).join('\n');
}

import { icons } from 'lucide';

const customIcons = new Map<string, string>();

export function addIcon(iconId: string, svgContent: string): void {
  customIcons.set(iconId, svgContent);
}

export function removeIcon(iconId: string): void {
  customIcons.delete(iconId);
}

// Convert kebab-case to PascalCase (e.g. arrow-up-right -> ArrowUpRight)
function toPascalCase(str: string): string {
  return str.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

function getLucideIconHtml(iconId: string): string | null {
  // Handle some obsidian specific mappings if needed
  if (iconId === 'lucide-rss') iconId = 'rss';
  if (iconId === 'document') iconId = 'file';
  
  const pascalName = toPascalCase(iconId);
  const iconNodes = (icons as any)[pascalName];
  if (!iconNodes) return null;
  
  let innerHtml = '';
  for (const node of iconNodes) {
    const [tag, attrs] = node;
    const attrStr = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
    innerHtml += `<${tag} ${attrStr}></${tag}>`;
  }
  return innerHtml;
}

export function setIcon(parent: HTMLElement, iconId: string): void {
  const custom = customIcons.get(iconId);
  if (custom) { parent.innerHTML = custom; return; }
  
  parent.setAttribute('data-icon', iconId);
  
  let innerHtml = getLucideIconHtml(iconId);
  if (!innerHtml) {
    console.log("[setIcon] Missing icon requested by plugin:", iconId);
  }
  const svgContent = innerHtml || '<circle cx="12" cy="12" r="10"/>';
  parent.innerHTML = `<svg class="svg-icon" data-icon-name="${iconId}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgContent}</svg>`;
}

export function setTooltip(el: HTMLElement, tooltip: string, options?: any): void {
  el.title = tooltip;
}

export const Platform = {
  isDesktop: true,
  isDesktopApp: true,
  isMobile: false,
  isMobileApp: false,
  isPhone: false,
  isTablet: false,
  isMacOS: navigator.platform?.includes('Mac') || false,
  isWin: navigator.platform?.includes('Win') || false,
  isLinux: navigator.platform?.includes('Linux') || false,
  isSafari: false,
  isIosApp: false,
  isAndroidApp: false,
};

export function requestUrl(request: any): Promise<any> {
  const params = typeof request === 'string' ? { url: request } : request;
  return fetch(params.url, {
    method: params.method || 'GET',
    headers: params.headers || {},
    body: params.body,
  }).then(async (response) => {
    const arrayBuffer = await response.arrayBuffer().catch(() => new ArrayBuffer(0));
    const text = new TextDecoder().decode(arrayBuffer);
    let json: any;
    try { json = JSON.parse(text); } catch { json = null; }
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      text,
      json,
      arrayBuffer,
    };
  });
}

export async function request(req: any): Promise<string> {
  const result = await requestUrl(req);
  return result.text;
}

export function debounce<T extends (...args: any[]) => any>(
  fn: T, wait: number, immediate?: boolean
): T & { cancel: () => void } {
  let timeout: number | null = null;
  const debounced = function(this: any, ...args: any[]) {
    const later = () => { timeout = null; if (!immediate) fn.apply(this, args); };
    const callNow = immediate && !timeout;
    if (timeout) window.clearTimeout(timeout);
    timeout = window.setTimeout(later, wait);
    if (callNow) fn.apply(this, args);
  } as any;
  debounced.cancel = () => { if (timeout) window.clearTimeout(timeout); timeout = null; };
  return debounced;
}

export function sanitizeHTMLToDom(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

export function htmlToMarkdown(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export function prepareFuzzySearch(query: string): (text: string) => any | null {
  const q = query.toLowerCase();
  return (text: string) => {
    const t = text.toLowerCase();
    if (t.includes(q)) return { score: -t.indexOf(q), matches: [[t.indexOf(q), t.indexOf(q) + q.length]] };
    return null;
  };
}

export function prepareSimpleSearch(query: string): (text: string) => any | null {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return (text: string) => {
    const t = text.toLowerCase();
    const matches: [number, number][] = [];
    for (const w of words) {
      const idx = t.indexOf(w);
      if (idx < 0) return null;
      matches.push([idx, idx + w.length]);
    }
    return { score: -matches[0]?.[0] || 0, matches };
  };
}

export function renderMatches(el: HTMLElement, text: string, matches: any, offset?: number): void {
  el.textContent = text;
}

export function renderResults(el: HTMLElement, text: string, result: any, offset?: number): void {
  el.textContent = text;
}

export function sortSearchResults(results: any[]): void {
  results.sort((a: any, b: any) => (a.match?.score || 0) - (b.match?.score || 0));
}

export function requireApiVersion(version: string): boolean {
  return true; // We support all API versions
}

export function getLinkpath(linkText: string): string {
  return linkText.split('#')[0].split('|')[0];
}

export function stripHeading(heading: string): string {
  return heading.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim();
}

export function stripHeadingForLink(heading: string): string {
  return heading.replace(/[[\]|#^]/g, '').trim();
}

// Scope -- hotkey scoping
export class Scope {
  parent: Scope | null;
  private _keys: any[] = [];

  constructor(parent?: Scope) {
    this.parent = parent || null;
  }

  register(modifiers: string[] | null, key: string | null, func: (evt: KeyboardEvent) => any): any {
    const handler = { modifiers: modifiers || [], key, func };
    this._keys.push(handler);
    return handler;
  }

  unregister(handler: any): void {
    const idx = this._keys.indexOf(handler);
    if (idx >= 0) this._keys.splice(idx, 1);
  }

  /** Dispatch a keyboard event through registered handlers. Returns true if handled. */
  handleKey(evt: KeyboardEvent): boolean {
    for (const handler of this._keys) {
      // Match key
      if (handler.key && handler.key !== evt.key && handler.key !== evt.code) continue;

      // Match modifiers
      const mods = handler.modifiers || [];
      const requireCtrl = mods.some((m: string) => m === 'Ctrl' || m === 'Mod');
      const requireShift = mods.some((m: string) => m === 'Shift');
      const requireAlt = mods.some((m: string) => m === 'Alt');
      const requireMeta = mods.some((m: string) => m === 'Meta');

      if (requireCtrl && !evt.ctrlKey && !evt.metaKey) continue;
      if (requireShift && !evt.shiftKey) continue;
      if (requireAlt && !evt.altKey) continue;
      if (requireMeta && !evt.metaKey) continue;

      try {
        const result = handler.func(evt);
        if (result !== false) return true;
      } catch (e) {
        console.error('[Scope] Handler error:', e);
      }
    }

    // Delegate to parent scope
    if (this.parent) return this.parent.handleKey(evt);
    return false;
  }
}
