/**
 * Heading Fold Extension for CodeMirror 6
 * 
 * Allows folding/collapsing content under markdown headings.
 * Click the fold gutter to toggle, or use keyboard shortcuts.
 */

import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, gutter, GutterMarker, WidgetType } from '@codemirror/view';
import { StateField, StateEffect, RangeSetBuilder, EditorState, Facet } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

// Effect to toggle fold at a position
const toggleFold = StateEffect.define<{ from: number; to: number }>();

// Track folded ranges
const foldedRanges = StateField.define<Set<string>>({
  create() {
    return new Set();
  },
  update(folded, tr) {
    let newFolded = folded;
    for (const effect of tr.effects) {
      if (effect.is(toggleFold)) {
        const key = `${effect.value.from}-${effect.value.to}`;
        newFolded = new Set(folded);
        if (newFolded.has(key)) {
          newFolded.delete(key);
        } else {
          newFolded.add(key);
        }
      }
    }
    return newFolded;
  },
});

// Find heading ranges in the document
function findHeadingRanges(state: EditorState): { level: number; from: number; to: number; lineFrom: number }[] {
  const headings: { level: number; from: number; to: number; lineFrom: number }[] = [];
  const doc = state.doc;
  
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    const match = text.match(/^(#{1,6})\s/);
    
    if (match) {
      const level = match[1].length;
      const from = line.from;
      
      // Find where this heading's content ends (next heading of same or higher level, or end of doc)
      let to = doc.length;
      for (let j = i + 1; j <= doc.lines; j++) {
        const nextLine = doc.line(j);
        const nextMatch = nextLine.text.match(/^(#{1,6})\s/);
        if (nextMatch && nextMatch[1].length <= level) {
          to = doc.line(j - 1).to;
          break;
        }
      }
      
      // Only add if there's content to fold
      if (to > line.to) {
        headings.push({ level, from, to, lineFrom: line.to });
      }
    }
  }
  
  return headings;
}

// Gutter marker for fold indicator
class FoldMarker extends GutterMarker {
  constructor(readonly folded: boolean) {
    super();
  }
  
  toDOM() {
    const span = document.createElement('span');
    span.className = `fold-marker ${this.folded ? 'folded' : 'open'}`;
    span.textContent = this.folded ? '▸' : '▾';
    span.title = this.folded ? 'Unfold' : 'Fold';
    return span;
  }
}

// Fold gutter
const foldGutter = gutter({
  class: 'cm-foldGutter',
  markers: (view) => {
    const builder = new RangeSetBuilder<GutterMarker>();
    const folded = view.state.field(foldedRanges);
    const headings = findHeadingRanges(view.state);
    
    for (const heading of headings) {
      const key = `${heading.lineFrom}-${heading.to}`;
      const isFolded = folded.has(key);
      builder.add(heading.from, heading.from, new FoldMarker(isFolded));
    }
    
    return builder.finish();
  },
  domEventHandlers: {
    click: (view, line) => {
      const headings = findHeadingRanges(view.state);
      const heading = headings.find(h => {
        const headingLine = view.state.doc.lineAt(h.from);
        return headingLine.from === line.from;
      });
      
      if (heading) {
        view.dispatch({
          effects: toggleFold.of({ from: heading.lineFrom, to: heading.to }),
        });
        return true;
      }
      return false;
    },
  },
});

// Decoration for folded content
class FoldWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span');
    span.className = 'fold-placeholder';
    span.textContent = '...';
    span.title = 'Click to expand';
    return span;
  }
}

const foldDecoration = Decoration.replace({
  Widget: new FoldWidget(),
});

// Plugin to apply fold decorations
const foldDecorations = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  
  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }
  
  update(update: ViewUpdate) {
    if (update.docChanged || update.state.field(foldedRanges) !== update.startState.field(foldedRanges)) {
      this.decorations = this.buildDecorations(update.view);
    }
  }
  
  buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const folded = view.state.field(foldedRanges);
    
    const sortedFolds = Array.from(folded)
      .map(key => {
        const [from, to] = key.split('-').map(Number);
        return { from, to };
      })
      .sort((a, b) => a.from - b.from);
    
    for (const { from, to } of sortedFolds) {
      if (from < to && from < view.state.doc.length) {
        builder.add(from, to, foldDecoration);
      }
    }
    
    return builder.finish();
  }
}, {
  decorations: v => v.decorations,
});

// Theme for fold gutter and markers
export const foldTheme = EditorView.theme({
  '.cm-foldGutter': {
    width: '16px',
    cursor: 'pointer',
  },
  '.fold-marker': {
    color: 'var(--text-muted)',
    fontSize: '12px',
    lineHeight: '1.4',
    userSelect: 'none',
  },
  '.fold-marker:hover': {
    color: 'var(--text-primary)',
  },
  '.fold-marker.folded': {
    color: 'var(--accent-primary)',
  },
  '.fold-placeholder': {
    background: 'var(--bg-tertiary)',
    color: 'var(--text-muted)',
    padding: '0 4px',
    borderRadius: '3px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  '.fold-placeholder:hover': {
    background: 'var(--bg-hover)',
  },
});

// Keyboard shortcut to fold/unfold at cursor
export function foldAtCursor(view: EditorView): boolean {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const headings = findHeadingRanges(view.state);
  
  // Find heading that contains cursor
  const heading = headings.find(h => {
    return line.from >= view.state.doc.lineAt(h.from).from && 
           line.from <= view.state.doc.lineAt(h.to).from;
  });
  
  if (heading) {
    view.dispatch({
      effects: toggleFold.of({ from: heading.lineFrom, to: heading.to }),
    });
    return true;
  }
  
  return false;
}

// Export the complete extension
export function headingFold() {
  return [
    foldedRanges,
    foldGutter,
    foldDecorations,
    foldTheme,
  ];
}
