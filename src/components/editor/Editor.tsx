/**
 * Editor - Main Markdown Editing Component
 * 
 * Features:
 * - CodeMirror 6 for the editor with markdown syntax highlighting
 * - Live markdown preview using the `marked` library
 * - Split view showing both editor and preview
 * - Tab management for multiple open notes
 * - Wiki-link [[link]] support in both editor and preview
 * - Link autocomplete when typing [[
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, ViewUpdate, Decoration, DecorationSet, ViewPlugin } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { search, highlightSelectionMatches } from '@codemirror/search';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { Tab, ViewMode } from '../../types';
import { MarkdownPreview } from './MarkdownPreview';
import { SearchReplace } from './SearchReplace';
import { linkAutocomplete, linkAutocompleteTheme, setAvailableNotes } from '../../utils/linkAutocomplete';

interface EditorProps {
  tabs: Tab[];
  availableNotes?: { name: string; path: string }[];
  activeTabId: string;
  content: string;
  viewMode: ViewMode;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onContentChange: (content: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onLinkClick: (linkName: string, heading?: string) => void;
  onGetNoteContent?: (noteName: string) => string | null;
}

/**
 * CodeMirror plugin to highlight [[wiki-links]] in the editor.
 * Creates decorations for text matching the [[...]] pattern.
 */
function wikiLinkPlugin(onLinkClick: (name: string) => void) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const decorations: any[] = [];
      const doc = view.state.doc;

      for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const regex = /\[\[([^\]]+)\]\]/g;
        let match;

        while ((match = regex.exec(line.text)) !== null) {
          const from = line.from + match.index;
          const to = from + match[0].length;

          decorations.push(
            Decoration.mark({
              class: 'cm-wikilink',
              attributes: {
                'data-link': match[1],
                title: `Open: ${match[1]}`,
              },
            }).range(from, to)
          );
        }
      }

      return Decoration.set(decorations, true);
    }
  }, {
    decorations: v => v.decorations,
    eventHandlers: {
      click: (e: MouseEvent, view: EditorView) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('cm-wikilink') || target.closest('.cm-wikilink')) {
          const linkEl = target.classList.contains('cm-wikilink') ? target : target.closest('.cm-wikilink') as HTMLElement;
          const linkName = linkEl?.getAttribute('data-link');
          if (linkName && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onLinkClick(linkName);
          }
        }
      }
    }
  });
}

/**
 * CodeMirror plugin to highlight #tags in the editor.
 */
function tagPlugin() {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const decorations: any[] = [];
      const doc = view.state.doc;

      for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const regex = /(?:^|\s)(#[a-zA-Z][a-zA-Z0-9_-]*)/g;
        let match;

        while ((match = regex.exec(line.text)) !== null) {
          const tagStart = line.from + match.index + (match[0].startsWith(' ') ? 1 : 0);
          const tagEnd = tagStart + match[1].length;

          decorations.push(
            Decoration.mark({ class: 'cm-tag-mark' }).range(tagStart, tagEnd)
          );
        }
      }

      return Decoration.set(decorations, true);
    }
  }, {
    decorations: v => v.decorations,
  });
}

export function Editor({
  tabs, activeTabId, content, viewMode, availableNotes,
  onTabSelect, onTabClose, onContentChange,
  onViewModeChange, onLinkClick, onGetNoteContent
}: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const contentRef = useRef(content);
  
  const [editorWidth, setEditorWidth] = useState(50); // percentage
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Update available notes for autocomplete
  useEffect(() => {
    if (availableNotes) {
      setAvailableNotes(availableNotes);
    }
  }, [availableNotes]);

  // Handle checkbox toggle in preview - updates the source markdown
  const handleCheckboxToggle = useCallback((checkboxIndex: number, checked: boolean) => {
    const lines = content.split('\n');
    let currentCheckbox = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(\s*[-*+]\s+)\[([ xX])\]/);
      if (match) {
        if (currentCheckbox === checkboxIndex) {
          // Toggle the checkbox
          lines[i] = lines[i].replace(
            /^(\s*[-*+]\s+)\[([ xX])\]/,
            `$1[${checked ? 'x' : ' '}]`
          );
          onContentChange(lines.join('\n'));
          return;
        }
        currentCheckbox++;
      }
    }
  }, [content, onContentChange]);

  // Resizer logic
  const handleDrag = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
    if (newWidth > 15 && newWidth < 85) setEditorWidth(newWidth);
  }, []);

  const stopDrag = useCallback(() => {
    document.removeEventListener('mousemove', handleDrag);
    document.removeEventListener('mouseup', stopDrag);
    document.body.style.cursor = 'default';
  }, [handleDrag]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', stopDrag);
    document.body.style.cursor = 'col-resize';
  }, [handleDrag, stopDrag]);

  // Keep contentRef in sync
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // Initialize/update CodeMirror
  useEffect(() => {
    if (!editorRef.current) return;

    // If view already exists, just update content
    if (viewRef.current) {
      const currentDoc = viewRef.current.state.doc.toString();
      if (currentDoc !== content) {
        viewRef.current.dispatch({
          changes: {
            from: 0,
            to: currentDoc.length,
            insert: content,
          },
        });
      }
      return;
    }

    // Create new editor view
    const state = EditorState.create({
      doc: content,
      extensions: [
        history(),
        search(),
        highlightSelectionMatches(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle),
        oneDark,
        linkAutocomplete(),
        linkAutocompleteTheme,
        wikiLinkPlugin(onLinkClick),
        tagPlugin(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onContentChange(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '15px' },
          '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-sans)', lineHeight: '1.6' },
          '.cm-content': { padding: '20px 40px', maxWidth: '800px', margin: '0 auto' },
          '.cm-wikilink': {
            color: 'var(--text-link)',
            textDecoration: 'none',
            cursor: 'pointer',
            transition: 'color 0.2s',
          },
          '.cm-wikilink:hover': {
            color: 'var(--accent-glow)',
            textDecoration: 'underline',
          },
          '.cm-tag-mark': {
            color: 'var(--accent-secondary)',
            fontWeight: 'bold',
          },
          '.cm-searchMatch': {
            backgroundColor: 'rgba(255, 200, 0, 0.3)',
            borderBottom: '1px solid #f5c518',
          },
          '.cm-searchMatch-selected': {
            backgroundColor: 'rgba(255, 200, 0, 0.5)',
            border: '1px solid #f5c518',
            borderRadius: '1px',
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [activeTabId]); // Re-create when tab changes

  // Update content when it changes externally (tab switch)
  useEffect(() => {
    if (viewRef.current) {
      const currentDoc = viewRef.current.state.doc.toString();
      if (currentDoc !== content) {
        viewRef.current.dispatch({
          changes: {
            from: 0,
            to: currentDoc.length,
            insert: content,
          },
        });
      }
    }
  }, [content]);

  // Handle custom search event from Ribbon or App
  useEffect(() => {
    const handleOpenSearch = () => {
      setIsSearchOpen(true);
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    
    document.addEventListener('editor:open-search', handleOpenSearch as EventListener);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('editor:open-search', handleOpenSearch as EventListener);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <>
      {/* Tab Bar */}
      <div className="editor-tab-bar">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`editor-tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => onTabSelect(tab.id)}
          >
            <span style={{ opacity: 0.5, marginRight: '4px' }}>
              {tab.isModified ? '●' : ''}
            </span>
            {tab.name}
            <button
              className="close-btn"
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Editor Header with View Mode Toggle */}
      <div className="editor-header">
        <div className="editor-breadcrumb">
          <span>vault</span>
          <span className="separator">/</span>
          <span className="current">
            {tabs.find(t => t.id === activeTabId)?.name || ''}
          </span>
        </div>

        <div className="editor-actions">
          <div className="view-mode-toggle">
            <button
              className={`view-mode-btn ${viewMode === 'editor' ? 'active' : ''}`}
              onClick={() => onViewModeChange('editor')}
            >
              Edit
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'split' ? 'active' : ''}`}
              onClick={() => onViewModeChange('split')}
            >
              Split
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'preview' ? 'active' : ''}`}
              onClick={() => onViewModeChange('preview')}
            >
              Read
            </button>
          </div>
        </div>
      </div>

      {/* Editor & Preview Container */}
      <div 
        className="editor-container" 
        ref={containerRef}
        style={{
          display: 'flex',
          flexDirection: 'row',
          height: '100%',
          position: 'relative',
        }}
      >
        {/* VS Code-style Search/Replace Panel */}
        <SearchReplace 
          getView={() => viewRef.current} 
          isOpen={isSearchOpen} 
          onClose={() => setIsSearchOpen(false)} 
        />

        <div
          ref={editorRef}
          style={{
            flex: viewMode === 'split' ? `0 0 ${editorWidth}%` : 1,
            height: '100%',
            overflow: 'auto',
            display: (viewMode === 'editor' || viewMode === 'split') ? 'block' : 'none',
            backgroundColor: 'var(--bg-primary)'
          }}
        />

        {viewMode === 'split' && (
          <div
            className="resizer"
            onMouseDown={startDrag}
            style={{ width: '4px', cursor: 'col-resize' }}
          />
        )}

        <div style={{ 
          flex: viewMode === 'split' ? `0 0 calc(${100 - editorWidth}% - 4px)` : 1,
          overflow: 'auto', 
          height: '100%',
          display: (viewMode === 'preview' || viewMode === 'split') ? 'block' : 'none',
          backgroundColor: 'var(--bg-primary)'
        }}>
          <MarkdownPreview
            content={content}
            onLinkClick={onLinkClick}
            onCheckboxToggle={handleCheckboxToggle}
            onEmbed={onGetNoteContent}
          />
        </div>
      </div>
    </>
  );
}
