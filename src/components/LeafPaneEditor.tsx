import React, { useState, useEffect, useRef, useCallback } from "react";
import { Editor } from "./editor/Editor";
import { EditorHeader } from "./editor/EditorHeader";
import { Tab, ViewMode, Theme, PaneLeaf } from "../types";
import { getAPI } from "../utils/api";
import { type LinkType } from "./SuggestionBanner";
import type { EnrichedSuggestion } from "../utils/suggestion-enrichment";

const api = getAPI();

interface LeafPaneEditorProps {
  leaf: PaneLeaf;
  activeTab: Tab;
  theme: string;
  allNoteNames: { name: string; path: string }[];
  editorSuggestions: EnrichedSuggestion[];
  editorNextStepSuggestions: EnrichedSuggestion[];
  inlineAnnotation: string | null;
  showInlineInsight: boolean;
  ftuxConnectionPulse: boolean;
  isFocused: boolean;

  onTabSelect: (leafId: string, tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onLinkClick: (linkName: string, heading?: string) => void;
  onImagePaste: (file: File) => Promise<string | null>;
  getNoteContent: (noteName: string) => string | null;
  onAdjustFontSize: (delta: number, scope: "both" | "editor" | "preview") => void;
  onAcceptSuggestion: (path: string, linkType: LinkType) => void;
  onRejectSuggestion: (path: string) => void;
  onOpenNote: (path: string) => void;
  onToggleInsight: (show: boolean) => void;
  onContentChangeGlobal: (path: string, content: string) => void;
}

export function LeafPaneEditor({
  leaf,
  activeTab,
  theme,
  allNoteNames,
  editorSuggestions,
  editorNextStepSuggestions,
  inlineAnnotation,
  showInlineInsight,
  ftuxConnectionPulse,
  isFocused,

  onTabSelect,
  onTabClose,
  onLinkClick,
  onImagePaste,
  getNoteContent,
  onAdjustFontSize,
  onAcceptSuggestion,
  onRejectSuggestion,
  onOpenNote,
  onToggleInsight,
  onContentChangeGlobal,
}: LeafPaneEditorProps) {
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);

  // Load content when the active tab changes
  useEffect(() => {
    let isActive = true;
    
    // Set loading state to prevent Editor from mounting with old content
    setIsLoading(true); 

    api.readFile(activeTab.path)
      .then((c: string) => {
        if (isActive) {
          setContent(c);
          setIsLoading(false);
        }
      })
      .catch((err: Error) => {
        if (isActive) {
          setContent("");
          setIsLoading(false);
          console.error("Failed to load note content:", err);
        }
      });

    return () => {
      isActive = false;
    };
  }, [activeTab.path]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);

    // Let the global state know there was a change (for UI updates, event dispatch, modified mark, auto-embed)
    onContentChangeGlobal(activeTab.path, newContent);

    // Auto-save logic scoped to this pane
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }
    autoSaveTimer.current = setTimeout(async () => {
      autoSaveTimer.current = null;
      try {
        await api.writeFile(activeTab.path, newContent);
        // Note: we might want to let global know the save happened to clear the 'modified' dot
        // We can dispatch an event or pass a callback. For now, the existing app logic handles modified states.
      } catch (err) {
        console.error("Auto-save failed:", err);
      }
    }, 2000);
  }, [activeTab.path, onContentChangeGlobal]);

  // Cleanup auto-save on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
    };
  }, []);

  return (
    <div className={`ftux-editor-host ${ftuxConnectionPulse && isFocused ? "ftux-connection-highlight-pulse" : ""}`}>
      <EditorHeader
        filePath={activeTab.path}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onToggleInsight={() => onToggleInsight(!showInlineInsight)}
      />
      {isLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          Loading...
        </div>
      ) : (
        <Editor
          tabs={leaf.tabs}
          activeTabId={activeTab.id}
          content={content}
          viewMode={viewMode}
          availableNotes={allNoteNames}
          onAdjustFontSize={onAdjustFontSize}
          onTabSelect={(id) => onTabSelect(leaf.id, id)}
          onTabClose={onTabClose}
          onContentChange={handleContentChange}
          onViewModeChange={setViewMode}
          onLinkClick={onLinkClick}
          onImagePaste={onImagePaste}
          onGetNoteContent={getNoteContent}
          suggestions={editorSuggestions}
          nextStepSuggestions={editorNextStepSuggestions}
          onAcceptSuggestion={onAcceptSuggestion}
          onRejectSuggestion={onRejectSuggestion}
          onOpenNote={onOpenNote}
          annotation={inlineAnnotation}
          showInsight={showInlineInsight}
          onToggleInsight={onToggleInsight}
          theme={theme}
        />
      )}
    </div>
  );
}
