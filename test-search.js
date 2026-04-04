const { EditorState } = require('@codemirror/state');
const { EditorView } = require('@codemirror/view');
const { search } = require('@codemirror/search');
console.log("Checking search panel structure isn't easily doable headlessly without DOM, but we can do it via a quick node script if using jsdom.");
