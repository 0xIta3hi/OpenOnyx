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
  'create-new': '<path d="M12 5v14"/><path d="M5 12h14"/>'
};

export function setIcon(parent: HTMLElement, iconId: string): void {
  const custom = customIcons.get(iconId);
  if (custom) { parent.innerHTML = custom; return; }
  
  parent.setAttribute('data-icon', iconId);
  
  const innerHtml = ICONS[iconId] || '<circle cx="12" cy="12" r="10"/>';
  parent.innerHTML = `<svg class="svg-icon" data-icon-name="${iconId}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${innerHtml}</svg>`;
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
    const text = await response.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = null; }
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      text,
      json,
      arrayBuffer: await response.clone().arrayBuffer().catch(() => new ArrayBuffer(0)),
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
