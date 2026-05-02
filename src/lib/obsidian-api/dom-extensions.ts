/**
 * Obsidian DOM Extensions
 *
 * Obsidian patches HTMLElement.prototype with helper methods like
 * .empty(), .createEl(), .createDiv(), .setText(), etc.
 * Virtually every community plugin depends on these.
 *
 * This file must be imported early (before any plugins load)
 * to ensure the prototypes are patched.
 */

// Avoid double-patching
if (!(HTMLElement.prototype as any).__oo_dom_patched) {

  // ── empty() — Remove all children ───────────────────
  (HTMLElement.prototype as any).empty = function () {
    while (this.firstChild) {
      this.removeChild(this.firstChild);
    }
  };

  // ── setText() — Set text content ────────────────────
  (HTMLElement.prototype as any).setText = function (text: string) {
    this.textContent = text;
  };

  // ── getText() — Get text content ────────────────────
  (HTMLElement.prototype as any).getText = function (): string {
    return this.textContent || '';
  };

  // ── createEl() — Create and append a child element ──
  (HTMLElement.prototype as any).createEl = function (
    tag: string,
    o?: string | { text?: string; cls?: string | string[]; attr?: Record<string, string>; type?: string; href?: string; placeholder?: string; value?: string; prepend?: boolean; title?: string; },
    callback?: (el: HTMLElement) => void
  ): HTMLElement {
    const el = document.createElement(tag);

    if (typeof o === 'string') {
      el.textContent = o;
    } else if (o) {
      if (o.text) el.textContent = o.text;
      if (o.cls) {
        if (Array.isArray(o.cls)) {
          el.className = o.cls.join(' ');
        } else {
          el.className = o.cls;
        }
      }
      if (o.attr) {
        for (const [k, v] of Object.entries(o.attr)) {
          el.setAttribute(k, v);
        }
      }
      if (o.type) el.setAttribute('type', o.type);
      if (o.href) el.setAttribute('href', o.href);
      if (o.placeholder) el.setAttribute('placeholder', o.placeholder);
      if (o.value) (el as HTMLInputElement).value = o.value;
      if (o.title) el.title = o.title;
      if (o.prepend && this.firstChild) {
        this.insertBefore(el, this.firstChild);
      } else {
        this.appendChild(el);
      }
    } else {
      this.appendChild(el);
    }

    // If not prepended above, ensure it's appended
    if (!el.parentNode) {
      this.appendChild(el);
    }

    if (callback) callback(el);
    return el;
  };

  // ── createDiv() — Shorthand for createEl('div') ─────
  (HTMLElement.prototype as any).createDiv = function (
    o?: string | { text?: string; cls?: string | string[]; attr?: Record<string, string>; },
    callback?: (el: HTMLDivElement) => void
  ): HTMLDivElement {
    return (this as any).createEl('div', o, callback) as HTMLDivElement;
  };

  // ── createSpan() — Shorthand for createEl('span') ───
  (HTMLElement.prototype as any).createSpan = function (
    o?: string | { text?: string; cls?: string | string[]; attr?: Record<string, string>; },
    callback?: (el: HTMLSpanElement) => void
  ): HTMLSpanElement {
    return (this as any).createEl('span', o, callback) as HTMLSpanElement;
  };

  // ── addClass() — Add CSS class(es) ─────────────────
  (HTMLElement.prototype as any).addClass = function (...classes: string[]) {
    for (const cls of classes) {
      if (cls) this.classList.add(...cls.split(' ').filter(Boolean));
    }
  };

  // ── removeClass() — Remove CSS class(es) ────────────
  (HTMLElement.prototype as any).removeClass = function (...classes: string[]) {
    for (const cls of classes) {
      if (cls) this.classList.remove(...cls.split(' ').filter(Boolean));
    }
  };

  // ── toggleClass() — Toggle CSS class ────────────────
  (HTMLElement.prototype as any).toggleClass = function (cls: string, value?: boolean) {
    if (value === undefined) {
      this.classList.toggle(cls);
    } else {
      if (value) {
        this.classList.add(cls);
      } else {
        this.classList.remove(cls);
      }
    }
  };

  // ── hasClass() — Check CSS class ────────────────────
  (HTMLElement.prototype as any).hasClass = function (cls: string): boolean {
    return this.classList.contains(cls);
  };

  // ── detach() — Remove from DOM ──────────────────────
  (HTMLElement.prototype as any).detach = function () {
    this.remove();
  };

  // ── show() / hide() — Display control ───────────────
  (HTMLElement.prototype as any).show = function () {
    this.style.display = '';
  };

  (HTMLElement.prototype as any).hide = function () {
    this.style.display = 'none';
  };

  // ── isShown() — Check visibility ────────────────────
  (HTMLElement.prototype as any).isShown = function (): boolean {
    return this.style.display !== 'none' && this.offsetParent !== null;
  };

  // ── setCssProps() — Set multiple CSS properties ─────
  (HTMLElement.prototype as any).setCssProps = function (props: Record<string, string>) {
    for (const [key, value] of Object.entries(props)) {
      this.style.setProperty(key, value);
    }
  };

  // ── getCssPropertyValue() ───────────────────────────
  (HTMLElement.prototype as any).getCssPropertyValue = function (prop: string): string {
    return getComputedStyle(this).getPropertyValue(prop);
  };

  // ── matchParent() — Find closest ancestor matching selector
  (HTMLElement.prototype as any).matchParent = function (selector: string, lastParent?: Element): HTMLElement | null {
    return this.closest(selector);
  };

  // ── win / doc helpers ───────────────────────────────
  (HTMLElement.prototype as any).win = window;
  (HTMLElement.prototype as any).doc = document;

  // ── Also patch DocumentFragment for createEl ────────
  (DocumentFragment.prototype as any).createEl = function (
    tag: string,
    o?: string | { text?: string; cls?: string | string[]; attr?: Record<string, string>; },
    callback?: (el: HTMLElement) => void
  ): HTMLElement {
    const el = document.createElement(tag);
    if (typeof o === 'string') {
      el.textContent = o;
    } else if (o) {
      if (o.text) el.textContent = o.text;
      if (o.cls) {
        if (Array.isArray(o.cls)) el.className = o.cls.join(' ');
        else el.className = o.cls;
      }
      if (o.attr) {
        for (const [k, v] of Object.entries(o.attr)) el.setAttribute(k, v);
      }
    }
    this.appendChild(el);
    if (callback) callback(el);
    return el;
  };

  (DocumentFragment.prototype as any).createDiv = function (
    o?: string | { text?: string; cls?: string | string[]; },
    callback?: (el: HTMLDivElement) => void
  ): HTMLDivElement {
    return (this as any).createEl('div', o, callback);
  };

  (DocumentFragment.prototype as any).createSpan = function (
    o?: string | { text?: string; cls?: string | string[]; },
    callback?: (el: HTMLSpanElement) => void
  ): HTMLSpanElement {
    return (this as any).createEl('span', o, callback);
  };

  // Also add createEl/createDiv to document.body as a global helper
  // Some plugins use `createEl` as a standalone function
  (window as any).createEl = (tag: string, o?: any, callback?: any) => {
    return (document.body as any).createEl(tag, o, callback);
  };
  (window as any).createDiv = (o?: any, callback?: any) => {
    return (document.body as any).createDiv(o, callback);
  };
  (window as any).createSpan = (o?: any, callback?: any) => {
    return (document.body as any).createSpan(o, callback);
  };
  (window as any).createFragment = (callback?: (frag: DocumentFragment) => void): DocumentFragment => {
    const frag = document.createDocumentFragment();
    if (callback) callback(frag);
    return frag;
  };

  // Mark as patched
  (HTMLElement.prototype as any).__oo_dom_patched = true;
  console.log('[OpenObsidian] DOM extensions patched');
}

// Set window.moment early — many plugins reference it at parse time
import momentLib from 'moment';
if (!(window as any).moment) {
  (window as any).moment = momentLib;
}

// ── Node.js Environment Shims ───────────────────────
// Many plugins use libraries that assume Node.js globals (like `process` or `global`)
if (!(window as any).global) {
  (window as any).global = window;
}
if (!(window as any).process) {
  (window as any).process = {
    env: { NODE_ENV: 'production' },
    platform: window.navigator.platform?.includes('Win') ? 'win32' : 
              window.navigator.platform?.includes('Mac') ? 'darwin' : 'linux',
    type: 'renderer',
    versions: { electron: '20.0.0', node: '16.0.0' }
  };
}

// ── App Container Shim ──────────────────────────────
// Calendar plugin (and others) assume .app-container exists for mounting popups
if (!document.body.classList.contains('app-container')) {
  document.body.classList.add('app-container');
}

export {};
