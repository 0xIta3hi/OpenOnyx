const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const dom = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`, { url: "http://localhost/" });
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;

// Simple Obsidian API mock
global.obsidian = {
  Component: function() { this._loaded = true; },
  View: function(leaf) {
    global.obsidian.Component.call(this);
    this.app = {};
    this.leaf = leaf;
    this._containerEl = document.createElement('div');
    Object.defineProperty(this, 'containerEl', {
      get: function() { return this._containerEl; },
      set: function(el) { this._containerEl = el; },
      configurable: true
    });
  },
  ItemView: function(leaf) {
    global.obsidian.View.call(this, leaf);
    this.headerEl = document.createElement('div');
    this.headerEl.className = 'view-header';
    this.iconEl = document.createElement('div');
    this.iconEl.className = 'view-header-icon';
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'view-header-title';
    this.actionListEl = document.createElement('div');
    this.actionListEl.className = 'view-actions';
    this.headerEl.appendChild(this.iconEl);
    this.headerEl.appendChild(this.titleEl);
    this.headerEl.appendChild(this.actionListEl);
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'view-content';
    this.containerEl.appendChild(this.headerEl);
    this.containerEl.appendChild(this.contentEl);
  },
  Plugin: class Plugin { constructor(app, manifest) { this.app = app; this.manifest = manifest; } },
  addIcon: () => {},
  setIcon: () => {},
  PluginSettingTab: class PluginSettingTab {},
  Setting: class Setting {},
  Notice: class Notice {},
  requireApiVersion: () => true
};
global.obsidian.View.prototype = Object.create(global.obsidian.Component.prototype);
global.obsidian.ItemView.prototype = Object.create(global.obsidian.View.prototype);

// Polyfill addClass
HTMLElement.prototype.addClass = function(...classes) { this.classList.add(...classes); return this; };
HTMLElement.prototype.removeClass = function(...classes) { this.classList.remove(...classes); return this; };
HTMLElement.prototype.createDiv = function(opt) { const d = document.createElement('div'); if(opt&&opt.cls) d.className=opt.cls; this.appendChild(d); return d; };
HTMLElement.prototype.empty = function() { this.innerHTML = ''; };

const req = (m) => { if(m==='obsidian') return global.obsidian; return {}; };
global.require = req;
global.module = { exports: {} };

try {
  const code = fs.readFileSync('.openobsidian/plugins/rss-dashboard/main.js', 'utf8');
  eval(code);
  const PluginClass = global.module.exports;
  const plugin = new PluginClass({}, {});
  plugin.onload(); // Might crash if it expects full app, but let's see.
  // Wait, we need to find the View constructor!
  // The plugin probably registers a view.
  const views = {};
  plugin.registerView = (type, creator) => { views[type] = creator; };
  plugin.onload();
  const viewCreator = views["rss-dashboard-view"];
  if (viewCreator) {
    const leaf = { view: null };
    const view = viewCreator(leaf);
    console.log("View created successfully.");
    if (view.onOpen) {
      view.onOpen().catch(e => {
        console.error("onOpen error:", e.message, e.stack);
      });
    }
  } else {
    console.log("View not found in", Object.keys(views));
  }
} catch (e) {
  console.error("Eval error:", e.message, e.stack);
}
