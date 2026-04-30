/**
 * Obsidian API Compatibility — Core Components
 * Events, Component, Modal, Notice, Setting, UI widgets
 */

// ── EventRef ────────────────────────────────────────
export interface EventRef {
  _eventName: string;
  _callback: (...args: any[]) => any;
  _ctx?: any;
}

// ── Events ──────────────────────────────────────────
export class Events {
  private _events: Map<string, Array<{ cb: (...args: any[]) => any; ctx?: any }>> = new Map();

  on(name: string, callback: (...data: any[]) => any, ctx?: any): EventRef {
    if (!this._events.has(name)) this._events.set(name, []);
    this._events.get(name)!.push({ cb: callback, ctx });
    return { _eventName: name, _callback: callback, _ctx: ctx };
  }

  off(name: string, callback: (...data: any[]) => any): void {
    const handlers = this._events.get(name);
    if (!handlers) return;
    const idx = handlers.findIndex(h => h.cb === callback);
    if (idx >= 0) handlers.splice(idx, 1);
  }

  offref(ref: EventRef): void {
    this.off(ref._eventName, ref._callback);
  }

  trigger(name: string, ...data: any[]): void {
    const handlers = this._events.get(name);
    if (!handlers) return;
    for (const h of [...handlers]) {
      try { h.cb.apply(h.ctx, data); } catch (e) { console.error(`[Plugin Event Error] ${name}:`, e); }
    }
  }

  tryTrigger(evt: EventRef, args: any[]): void {
    try { evt._callback.apply(evt._ctx, args); } catch { /* silent */ }
  }
}

// ── Component ───────────────────────────────────────
// Function-based constructor for ES5 plugin compatibility.
// Many Obsidian plugins are compiled to ES5, which transpiles
// `class extends Plugin` to `Plugin.call(this)`. ES6 classes
// reject being called without `new`, so we use functions instead.

/** Interface for Component instances (used for TypeScript typing) */
export interface IComponent {
  _loaded: boolean;
  _children: any[];
  _events: EventRef[];
  _domEvents: Array<{ el: EventTarget; type: string; handler: any }>;
  _intervals: number[];
  load(): void;
  onload(): void;
  unload(): void;
  onunload(): void;
  addChild(child: any): any;
  removeChild(child: any): any;
  register(cb: () => any): void;
  registerEvent(eventRef: EventRef): void;
  registerDomEvent(el: EventTarget, type: string, callback: (evt: any) => any, options?: boolean | AddEventListenerOptions): void;
  registerInterval(id: number): number;
}

/** Component constructor type for TypeScript class extension */
export interface ComponentConstructor {
  new (...args: any[]): IComponent;
  prototype: IComponent;
}

function _Component(this: any) {
  this._loaded = false;
  this._children = [];
  this._events = [];
  this._domEvents = [];
  this._intervals = [];
}

_Component.prototype.load = function() {
  this._loaded = true;
  this.onload();
};

_Component.prototype.onload = function() { /* override */ };

_Component.prototype.unload = function() {
  this._loaded = false;
  for (const child of this._children) child.unload();
  this._children = [];
  for (const de of this._domEvents) de.el.removeEventListener(de.type, de.handler);
  this._domEvents = [];
  for (const id of this._intervals) window.clearInterval(id);
  this._intervals = [];
  this.onunload();
};

_Component.prototype.onunload = function() { /* override */ };

_Component.prototype.addChild = function(child: any) {
  this._children.push(child);
  if (this._loaded) child.load();
  return child;
};

_Component.prototype.removeChild = function(child: any) {
  const idx = this._children.indexOf(child);
  if (idx >= 0) { this._children.splice(idx, 1); child.unload(); }
  return child;
};

_Component.prototype.register = function(_cb: () => any) { /* no-op compat */ };

_Component.prototype.registerEvent = function(eventRef: EventRef) {
  this._events.push(eventRef);
};

_Component.prototype.registerDomEvent = function(
  el: EventTarget, type: string, callback: (evt: any) => any, options?: boolean | AddEventListenerOptions
) {
  el.addEventListener(type, callback, options);
  this._domEvents.push({ el, type, handler: callback });
};

_Component.prototype.registerInterval = function(id: number): number {
  this._intervals.push(id);
  return id;
};

// Cast the function constructor to the class-like type so it works in extends
export const Component = _Component as unknown as ComponentConstructor;

// ── Notice ──────────────────────────────────────────
export class Notice {
  noticeEl: HTMLElement;
  private _timeout: number | null = null;

  constructor(message: string | DocumentFragment, duration?: number) {
    const ms = duration ?? 5000;
    this.noticeEl = document.createElement('div');
    this.noticeEl.className = 'oo-notice';
    if (typeof message === 'string') {
      this.noticeEl.textContent = message;
    } else {
      this.noticeEl.appendChild(message);
    }

    let container = document.querySelector('.oo-notice-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'oo-notice-container';
      document.body.appendChild(container);
    }
    container.appendChild(this.noticeEl);

    if (ms > 0) {
      this._timeout = window.setTimeout(() => this.hide(), ms);
    }
  }

  setMessage(message: string | DocumentFragment): this {
    this.noticeEl.textContent = '';
    if (typeof message === 'string') this.noticeEl.textContent = message;
    else this.noticeEl.appendChild(message);
    return this;
  }

  hide(): void {
    if (this._timeout) window.clearTimeout(this._timeout);
    this.noticeEl.remove();
  }
}

// ── Modal ───────────────────────────────────────────
export class Modal {
  app: any;
  scope: any;
  containerEl: HTMLElement;
  modalEl: HTMLElement;
  titleEl: HTMLElement;
  contentEl: HTMLElement;

  constructor(app: any) {
    this.app = app;
    this.scope = null;
    this.containerEl = document.createElement('div');
    this.containerEl.className = 'modal-container oo-plugin-modal-container';
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'modal oo-plugin-modal';
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'modal-title';
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'modal-content';
    this.modalEl.appendChild(this.titleEl);
    this.modalEl.appendChild(this.contentEl);

    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.addEventListener('click', () => this.close());
    this.containerEl.appendChild(bg);
    this.containerEl.appendChild(this.modalEl);
  }

  open(): void {
    document.body.appendChild(this.containerEl);
    this.onOpen();
  }

  close(): void {
    this.onClose();
    this.containerEl.remove();
  }

  onOpen(): void { /* override */ }
  onClose(): void { /* override */ }
}

// ── Setting ─────────────────────────────────────────
export class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;
  components: any[] = [];

  constructor(containerEl: HTMLElement) {
    this.settingEl = document.createElement('div');
    this.settingEl.className = 'setting-item oo-plugin-setting';
    this.infoEl = document.createElement('div');
    this.infoEl.className = 'setting-item-info';
    this.nameEl = document.createElement('div');
    this.nameEl.className = 'setting-item-name';
    this.descEl = document.createElement('div');
    this.descEl.className = 'setting-item-description';
    this.controlEl = document.createElement('div');
    this.controlEl.className = 'setting-item-control';
    this.infoEl.appendChild(this.nameEl);
    this.infoEl.appendChild(this.descEl);
    this.settingEl.appendChild(this.infoEl);
    this.settingEl.appendChild(this.controlEl);
    containerEl.appendChild(this.settingEl);
  }

  setName(name: string | DocumentFragment): this {
    this.nameEl.textContent = '';
    if (typeof name === 'string') this.nameEl.textContent = name;
    else this.nameEl.appendChild(name);
    return this;
  }

  setDesc(desc: string | DocumentFragment): this {
    this.descEl.textContent = '';
    if (typeof desc === 'string') this.descEl.textContent = desc;
    else this.descEl.appendChild(desc);
    return this;
  }

  setClass(cls: string): this { this.settingEl.classList.add(cls); return this; }
  setHeading(): this { this.settingEl.classList.add('setting-item-heading'); return this; }
  setDisabled(disabled: boolean): this { this.settingEl.classList.toggle('is-disabled', disabled); return this; }
  setTooltip(tooltip: string): this { this.settingEl.title = tooltip; return this; }

  addText(cb: (component: TextComponent) => any): this {
    const comp = new TextComponent(this.controlEl);
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addTextArea(cb: (component: TextAreaComponent) => any): this {
    const comp = new TextAreaComponent(this.controlEl);
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addToggle(cb: (component: ToggleComponent) => any): this {
    const comp = new ToggleComponent(this.controlEl);
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addButton(cb: (component: ButtonComponent) => any): this {
    const comp = new ButtonComponent(this.controlEl);
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addDropdown(cb: (component: DropdownComponent) => any): this {
    const comp = new DropdownComponent(this.controlEl);
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addSlider(cb: (component: SliderComponent) => any): this {
    const comp = new SliderComponent(this.controlEl);
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addExtraButton(cb: (component: ExtraButtonComponent) => any): this {
    const comp = new ExtraButtonComponent(this.controlEl);
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addColorPicker(cb: (component: ColorComponent) => any): this {
    const comp = new ColorComponent(this.controlEl);
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addSearch(cb: (component: SearchComponent) => any): this {
    const comp = new SearchComponent(this.controlEl);
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addProgressBar(cb: (component: any) => any): this { return this; }
  addMomentFormat(cb: (component: any) => any): this { return this; }
  addComponent<T>(cb: (el: HTMLElement) => T): this { cb(this.controlEl); return this; }

  then(cb: (setting: this) => any): this { cb(this); return this; }

  clear(): this {
    this.controlEl.innerHTML = '';
    this.nameEl.textContent = '';
    this.descEl.textContent = '';
    this.components = [];
    return this;
  }
}

// ── SettingTab ───────────────────────────────────────
export abstract class SettingTab {
  app: any;
  containerEl: HTMLElement;
  icon: string = '';

  constructor(app?: any) {
    this.app = app;
    this.containerEl = document.createElement('div');
    this.containerEl.className = 'oo-plugin-setting-tab';
  }

  abstract display(): void;
  hide(): void { this.containerEl.innerHTML = ''; }
}

export abstract class PluginSettingTab extends SettingTab {
  plugin: any;

  constructor(app: any, plugin: any) {
    super(app);
    this.plugin = plugin;
  }
}

// ── Menu ────────────────────────────────────────────
export class Menu {
  dom: HTMLElement;
  items: MenuItem[] = [];

  constructor() {
    this.dom = document.createElement('div');
    this.dom.className = 'menu oo-plugin-menu';
  }

  addItem(cb: (item: MenuItem) => any): this {
    const item = new MenuItem();
    cb(item);
    this.items.push(item);
    this.dom.appendChild(item.dom);
    return this;
  }

  addSeparator(): this {
    const sep = document.createElement('div');
    sep.className = 'menu-separator';
    this.dom.appendChild(sep);
    return this;
  }

  showAtMouseEvent(evt: MouseEvent): this {
    this.dom.style.position = 'fixed';
    this.dom.style.left = `${evt.clientX}px`;
    this.dom.style.top = `${evt.clientY}px`;
    document.body.appendChild(this.dom);
    const close = (e: MouseEvent) => {
      if (!this.dom.contains(e.target as Node)) { this.dom.remove(); document.removeEventListener('click', close); }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
    return this;
  }

  showAtPosition(pos: { x: number; y: number }): this {
    this.dom.style.position = 'fixed';
    this.dom.style.left = `${pos.x}px`;
    this.dom.style.top = `${pos.y}px`;
    document.body.appendChild(this.dom);
    return this;
  }

  hide(): this { this.dom.remove(); return this; }
  close(): void { this.dom.remove(); }
}

export class MenuItem {
  dom: HTMLElement;
  private _callback?: (evt: MouseEvent | KeyboardEvent) => any;

  constructor() {
    this.dom = document.createElement('div');
    this.dom.className = 'menu-item';
    this.dom.addEventListener('click', (e) => this._callback?.(e));
  }

  setTitle(title: string | DocumentFragment): this {
    if (typeof title === 'string') this.dom.textContent = title;
    else { this.dom.textContent = ''; this.dom.appendChild(title); }
    return this;
  }

  setIcon(icon: string): this { return this; }
  setChecked(checked: boolean): this { this.dom.classList.toggle('is-checked', checked); return this; }
  setDisabled(disabled: boolean): this { this.dom.classList.toggle('is-disabled', disabled); return this; }
  setIsLabel(isLabel: boolean): this { this.dom.classList.toggle('is-label', isLabel); return this; }
  setSection(section: string): this { return this; }

  onClick(callback: (evt: MouseEvent | KeyboardEvent) => any): this {
    this._callback = callback;
    return this;
  }
}

// ── UI Widget Components ────────────────────────────

export class ButtonComponent {
  buttonEl: HTMLButtonElement;
  constructor(containerEl: HTMLElement) {
    this.buttonEl = document.createElement('button');
    this.buttonEl.className = 'oo-plugin-btn';
    containerEl.appendChild(this.buttonEl);
  }
  setButtonText(name: string): this { this.buttonEl.textContent = name; return this; }
  setCta(): this { this.buttonEl.classList.add('mod-cta'); return this; }
  setWarning(): this { this.buttonEl.classList.add('mod-warning'); return this; }
  setDisabled(disabled: boolean): this { this.buttonEl.disabled = disabled; return this; }
  setIcon(icon: string): this { return this; }
  setTooltip(tooltip: string): this { this.buttonEl.title = tooltip; return this; }
  removeCta(): this { this.buttonEl.classList.remove('mod-cta'); return this; }
  onClick(callback: (evt: MouseEvent) => any): this {
    this.buttonEl.addEventListener('click', callback);
    return this;
  }
  setClass(cls: string): this { this.buttonEl.classList.add(cls); return this; }
}

export class TextComponent {
  inputEl: HTMLInputElement;
  private _onChange?: (value: string) => any;
  constructor(containerEl: HTMLElement) {
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = 'oo-plugin-text-input';
    containerEl.appendChild(this.inputEl);
    this.inputEl.addEventListener('input', () => this._onChange?.(this.inputEl.value));
  }
  getValue(): string { return this.inputEl.value; }
  setValue(value: string): this { this.inputEl.value = value; return this; }
  setPlaceholder(placeholder: string): this { this.inputEl.placeholder = placeholder; return this; }
  setDisabled(disabled: boolean): this { this.inputEl.disabled = disabled; return this; }
  onChange(callback: (value: string) => any): this { this._onChange = callback; return this; }
  then(cb: (component: this) => any): this { cb(this); return this; }
}

export class TextAreaComponent {
  inputEl: HTMLTextAreaElement;
  private _onChange?: (value: string) => any;
  constructor(containerEl: HTMLElement) {
    this.inputEl = document.createElement('textarea');
    this.inputEl.className = 'oo-plugin-textarea';
    containerEl.appendChild(this.inputEl);
    this.inputEl.addEventListener('input', () => this._onChange?.(this.inputEl.value));
  }
  getValue(): string { return this.inputEl.value; }
  setValue(value: string): this { this.inputEl.value = value; return this; }
  setPlaceholder(placeholder: string): this { this.inputEl.placeholder = placeholder; return this; }
  setDisabled(disabled: boolean): this { this.inputEl.disabled = disabled; return this; }
  onChange(callback: (value: string) => any): this { this._onChange = callback; return this; }
}

export class ToggleComponent {
  toggleEl: HTMLElement;
  private _value = false;
  private _onChange?: (value: boolean) => any;
  constructor(containerEl: HTMLElement) {
    this.toggleEl = document.createElement('div');
    this.toggleEl.className = 'checkbox-container oo-plugin-toggle';
    this.toggleEl.addEventListener('click', () => { this.setValue(!this._value); this._onChange?.(this._value); });
    containerEl.appendChild(this.toggleEl);
  }
  getValue(): boolean { return this._value; }
  setValue(on: boolean): this {
    this._value = on;
    this.toggleEl.classList.toggle('is-enabled', on);
    return this;
  }
  setDisabled(disabled: boolean): this { this.toggleEl.classList.toggle('is-disabled', disabled); return this; }
  setTooltip(tooltip: string): this { this.toggleEl.title = tooltip; return this; }
  onClick(): void { /* compat */ }
  onChange(callback: (value: boolean) => any): this { this._onChange = callback; return this; }
}

export class DropdownComponent {
  selectEl: HTMLSelectElement;
  private _onChange?: (value: string) => any;
  constructor(containerEl: HTMLElement) {
    this.selectEl = document.createElement('select');
    this.selectEl.className = 'dropdown oo-plugin-dropdown';
    containerEl.appendChild(this.selectEl);
    this.selectEl.addEventListener('change', () => this._onChange?.(this.selectEl.value));
  }
  getValue(): string { return this.selectEl.value; }
  setValue(value: string): this { this.selectEl.value = value; return this; }
  addOption(value: string, display: string): this {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = display;
    this.selectEl.appendChild(opt);
    return this;
  }
  addOptions(options: Record<string, string>): this {
    for (const [k, v] of Object.entries(options)) this.addOption(k, v);
    return this;
  }
  setDisabled(disabled: boolean): this { this.selectEl.disabled = disabled; return this; }
  onChange(callback: (value: string) => any): this { this._onChange = callback; return this; }
}

export class SliderComponent {
  sliderEl: HTMLInputElement;
  private _onChange?: (value: number) => any;
  constructor(containerEl: HTMLElement) {
    this.sliderEl = document.createElement('input');
    this.sliderEl.type = 'range';
    this.sliderEl.className = 'slider oo-plugin-slider';
    containerEl.appendChild(this.sliderEl);
    this.sliderEl.addEventListener('input', () => this._onChange?.(this.getValue()));
  }
  getValue(): number { return parseFloat(this.sliderEl.value); }
  setValue(value: number): this { this.sliderEl.value = String(value); return this; }
  setLimits(min: number, max: number, step: number | 'any'): this {
    this.sliderEl.min = String(min); this.sliderEl.max = String(max);
    this.sliderEl.step = String(step);
    return this;
  }
  getValuePretty(): string { return this.sliderEl.value; }
  setDynamicTooltip(): this { return this; }
  showTooltip(): void { /* compat */ }
  setDisabled(disabled: boolean): this { this.sliderEl.disabled = disabled; return this; }
  setInstant(instant: boolean): this { return this; }
  onChange(callback: (value: number) => any): this { this._onChange = callback; return this; }
}

export class SearchComponent {
  inputEl: HTMLInputElement;
  clearButtonEl: HTMLElement;
  private _onChange?: (value: string) => any;
  constructor(containerEl: HTMLElement) {
    const wrapper = document.createElement('div');
    wrapper.className = 'search-input-container';
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'search';
    this.inputEl.className = 'oo-plugin-search-input';
    this.clearButtonEl = document.createElement('div');
    this.clearButtonEl.className = 'search-input-clear-button';
    this.clearButtonEl.addEventListener('click', () => { this.inputEl.value = ''; this._onChange?.(''); });
    wrapper.appendChild(this.inputEl);
    wrapper.appendChild(this.clearButtonEl);
    containerEl.appendChild(wrapper);
    this.inputEl.addEventListener('input', () => this._onChange?.(this.inputEl.value));
  }
  getValue(): string { return this.inputEl.value; }
  setValue(value: string): this { this.inputEl.value = value; return this; }
  setPlaceholder(placeholder: string): this { this.inputEl.placeholder = placeholder; return this; }
  onChange(callback: (value: string) => any): this { this._onChange = callback; return this; }
  onChanged(): void { /* compat */ }
}

export class ExtraButtonComponent {
  extraSettingsEl: HTMLElement;
  private _onClick?: (evt: MouseEvent) => any;
  constructor(containerEl: HTMLElement) {
    this.extraSettingsEl = document.createElement('div');
    this.extraSettingsEl.className = 'extra-setting-button oo-plugin-extra-btn';
    containerEl.appendChild(this.extraSettingsEl);
    this.extraSettingsEl.addEventListener('click', (e) => this._onClick?.(e));
  }
  setIcon(icon: string): this { this.extraSettingsEl.setAttribute('data-icon', icon); return this; }
  setTooltip(tooltip: string): this { this.extraSettingsEl.title = tooltip; return this; }
  setDisabled(disabled: boolean): this { this.extraSettingsEl.classList.toggle('is-disabled', disabled); return this; }
  onClick(callback: (evt: MouseEvent) => any): this { this._onClick = callback; return this; }
}

export class ColorComponent {
  colorPickerEl: HTMLInputElement;
  private _onChange?: (value: string) => any;
  constructor(containerEl: HTMLElement) {
    this.colorPickerEl = document.createElement('input');
    this.colorPickerEl.type = 'color';
    this.colorPickerEl.className = 'oo-plugin-color';
    containerEl.appendChild(this.colorPickerEl);
    this.colorPickerEl.addEventListener('input', () => this._onChange?.(this.colorPickerEl.value));
  }
  getValue(): string { return this.colorPickerEl.value; }
  setValue(value: string): this { this.colorPickerEl.value = value; return this; }
  onChange(callback: (value: string) => any): this { this._onChange = callback; return this; }
}

// ── SuggestModal ────────────────────────────────────
export abstract class SuggestModal<T> extends Modal {
  limit = 100;
  emptyStateText = 'No results found.';
  inputEl: HTMLInputElement;
  resultContainerEl: HTMLElement;

  constructor(app: any) {
    super(app);
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = 'prompt-input';
    this.contentEl.insertBefore(this.inputEl, this.contentEl.firstChild);
    this.resultContainerEl = document.createElement('div');
    this.resultContainerEl.className = 'suggestion-container';
    this.contentEl.appendChild(this.resultContainerEl);
  }

  setPlaceholder(placeholder: string): void { this.inputEl.placeholder = placeholder; }
  setInstructions(instructions: Array<{ command: string; purpose: string }>): void { /* compat */ }
  onNoSuggestion(): void { /* compat */ }
  selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void { this.onChooseSuggestion(value, evt); this.close(); }
  selectActiveSuggestion(evt: MouseEvent | KeyboardEvent): void { /* compat */ }

  abstract getSuggestions(query: string): T[] | Promise<T[]>;
  abstract renderSuggestion(value: T, el: HTMLElement): void;
  abstract onChooseSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void;
}

export abstract class FuzzySuggestModal<T> extends SuggestModal<any> {
  abstract getItems(): T[];
  abstract getItemText(item: T): string;
  abstract onChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void;
  getSuggestions(query: string) { return this.getItems().filter(i => this.getItemText(i).toLowerCase().includes(query.toLowerCase())); }
  renderSuggestion(value: any, el: HTMLElement) { el.textContent = this.getItemText(value); }
  onChooseSuggestion(item: any, evt: MouseEvent | KeyboardEvent) { this.onChooseItem(item, evt); }
}
