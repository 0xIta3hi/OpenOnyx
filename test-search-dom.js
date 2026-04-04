const { SearchQuery, search, openSearchPanel } = require('@codemirror/search');
const { EditorState } = require('@codemirror/state');
const { EditorView } = require('@codemirror/view');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><div id="editor"></div>');
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;

const state = EditorState.create({
  doc: "hello",
  extensions: [search({top: true})]
});
const view = new EditorView({
  state,
  parent: document.getElementById('editor')
});

openSearchPanel(view);
const panel = document.querySelector('.cm-search');
if (panel) {
  console.log(panel.outerHTML);
} else {
  console.log("No panel found");
}
