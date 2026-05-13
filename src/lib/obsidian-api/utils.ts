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

const customIcons = new Map<string, string>();

export function addIcon(iconId: string, svgContent: string): void {
  customIcons.set(iconId, svgContent);
}

export function removeIcon(iconId: string): void {
  customIcons.delete(iconId);
}

const ICONS: Record<string, string> = {
  'link': '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  'external-link': '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/>',
  'search': '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/>',
  'scissors': '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" x2="8.12" y1="4" y2="15.88"/><line x1="14.47" x2="20" y1="14.48" y2="20"/><line x1="8.12" x2="12" y1="8.12" y2="12"/>',
  'type': '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>',
  'align-left': '<line x1="21" x2="3" y1="6" y2="6"/><line x1="15" x2="3" y1="12" y2="12"/><line x1="17" x2="3" y1="18" y2="18"/>',
  'plus-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/>',
  'copy': '<rect height="14" rx="2" ry="2" width="14" x="8" y="8"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  'clipboard': '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect height="4" rx="1" ry="1" width="8" x="8" y="2"/>',
  'clipboard-type': '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect height="4" rx="1" ry="1" width="8" x="8" y="2"/><polyline points="9 12 9 10 15 10 15 12"/><line x1="12" x2="12" y1="10" y2="16"/>',
  'check-square': '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  'chevron-right': '<polyline points="9 18 15 12 9 6"/>',
  'create-new': '<path d="M12 5v14"/><path d="M5 12h14"/>',
  'refresh-ccw': '<path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>',
  'settings': '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  'plus': '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  'check': '<polyline points="20 6 9 17 4 12"/>',
  'x': '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  'trash': '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  'trash-2': '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  'edit': '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  'rss': '<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
  'folder': '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  'menu': '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  'lucide-rss': '<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
  'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  'x-circle': '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  'arrow-up-right': '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
  'info': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  'youtube': '<path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/>',
  'filter': '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  'layout': '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
  'list': '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  'mail': '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  'more-vertical': '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
  'more-horizontal': '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  'inbox': '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  'layers': '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  'play': '<polygon points="5 3 19 12 5 21 5 3"/>',
  'video': '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
  'bookmark': '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  'star': '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  'clock': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'globe': '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  'minus': '<line x1="5" y1="12" x2="19" y2="12"/>',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/>',
  'settings-2': '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>'
};

export function setIcon(parent: HTMLElement, iconId: string): void {
  const custom = customIcons.get(iconId);
  if (custom) { parent.innerHTML = custom; return; }
  
  parent.setAttribute('data-icon', iconId);
  
  const innerHtml = ICONS[iconId];
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
