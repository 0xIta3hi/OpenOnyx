import React, { useState, useEffect, useRef, useCallback } from "react";
import { Editor } from "./editor/Editor";
import { EditorHeader } from "./editor/EditorHeader";
import { Tab, ViewMode, Theme, PaneLeaf } from "../types";
import { NewTabView } from "./NewTabView";
import { getAPI } from "../utils/api";
import { type LinkType } from "./SuggestionBanner";
import type { EnrichedSuggestion } from "../utils/suggestion-enrichment";
import { authManager } from "../lib/auth";
import { collaborationEngine } from "../lib/collaborationEngine";
import { syncEngine } from "../lib/syncEngine";

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
  activeUsers?: any[];
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
  activeUsers = [],
}: LeafPaneEditorProps) {
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(activeTab.path !== "__new_tab__");
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const dbSyncTimer = useRef<NodeJS.Timeout | null>(null);
  const [isSelfTyping, setIsSelfTyping] = useState<boolean>(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Flag to prevent echo: when we receive a remote update and set content,
  // the Editor's updateListener fires onContentChange. This ref tells
  // handleContentChange to NOT re-broadcast that change.
  const isRemoteUpdateRef = useRef<boolean>(false);

  // Load content when the active tab changes
  useEffect(() => {
    let isActive = true;
    
    // Set loading state to prevent Editor from mounting with old content
    setIsLoading(true); 

    if (activeTab.path === "__new_tab__") {
      setContent("");
      setIsLoading(false);
      return;
    }
    
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

  const handleContentChange = useCallback((newContent: string, isUserEdit?: boolean) => {
    // If this change was triggered by us applying a remote update, skip echo.
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }

    setContent(newContent);

    // Let the global state know there was a change (for UI updates, event dispatch, modified mark, auto-embed)
    onContentChangeGlobal(activeTab.path, newContent);

    // If it's a collaborative space and a real user edit, broadcast instantly
    const isCollabSpace = !!collaborationEngine.activeSpaceId;
    if (isCollabSpace && activeTab.path && activeTab.path !== "__new_tab__" && isUserEdit) {
      // Broadcast the entire document content to all peers immediately
      collaborationEngine.broadcastDocumentUpdate(activeTab.path, newContent);

      setIsSelfTyping(true);
      collaborationEngine.updatePresenceNote(activeTab.path, true);

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        typingTimeoutRef.current = null;
        collaborationEngine.updatePresenceNote(activeTab.path, false);
        setIsSelfTyping(false);
      }, 2500);
    }

    // Auto-save to local disk (debounced)
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }
    autoSaveTimer.current = setTimeout(async () => {
      autoSaveTimer.current = null;
      try {
        await api.writeFile(activeTab.path, newContent);
      } catch (err) {
        console.error("Auto-save failed:", err);
      }
    }, 2000);

    // Persist to IndexedDB + enqueue for sync to Supabase (debounced separately)
    if (isCollabSpace && activeTab.path && activeTab.path !== "__new_tab__") {
      if (dbSyncTimer.current) {
        clearTimeout(dbSyncTimer.current);
      }
      dbSyncTimer.current = setTimeout(async () => {
        dbSyncTimer.current = null;
        try {
          await collaborationEngine.persistNoteEdit(activeTab.path, newContent);
          syncEngine.triggerPush();
        } catch (err) {
          console.error("[Collab] DB sync failed:", err);
        }
      }, 1500);
    }
  }, [activeTab.path, onContentChangeGlobal]);

  // Cleanup auto-save, db sync, and typing presence on unmount/tab changes
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
      if (dbSyncTimer.current) {
        clearTimeout(dbSyncTimer.current);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (isSelfTyping && activeTab.path && activeTab.path !== "__new_tab__") {
        collaborationEngine.updatePresenceNote(activeTab.path, false);
      }
    };
  }, [activeTab.path, isSelfTyping]);

  // Subscribe to real-time document broadcasts from remote collaborators
  useEffect(() => {
    if (!collaborationEngine.activeSpaceId) return;
    if (activeTab.path === "__new_tab__") return;

    const unsub = collaborationEngine.onRemoteDocumentUpdate((path, remoteContent, _senderClientId) => {
      // Only apply if this update is for the file we currently have open
      if (path !== activeTab.path) return;

      // Set the flag so handleContentChange knows to skip re-broadcasting
      isRemoteUpdateRef.current = true;
      setContent(remoteContent);

      // Notify global state so the rest of the UI stays in sync
      onContentChangeGlobal(activeTab.path, remoteContent);

      // Write to local disk (debounced) -- broadcast is ephemeral, so we
      // must persist the received content ourselves.
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
      autoSaveTimer.current = setTimeout(async () => {
        autoSaveTimer.current = null;
        try {
          await api.writeFile(activeTab.path, remoteContent);
        } catch (err) {
          console.error("[Collab] Failed to write remote content to disk:", err);
        }
      }, 1000);
    });

    return unsub;
  }, [activeTab.path, onContentChangeGlobal]);

  const currentUser = authManager.getUser();
  const currentUserId = currentUser?.id;
  const isCollabSpace = !!collaborationEngine.activeSpaceId;

  const activeEditors = [...(activeUsers || []).filter(u => u.activeNoteId === activeTab.path && u.isEditing)];
  
  if (isCollabSpace && currentUser && activeTab.path !== "__new_tab__" && isSelfTyping) {
    const hasSelf = activeEditors.some(u => u.id === currentUserId);
    if (!hasSelf) {
      const username = currentUser.email?.split('@')[0] || 'Guest';
      activeEditors.unshift({
        id: currentUserId,
        email: currentUser.email || '',
        name: `You (${username})`,
        color: '#10b981',
        isEditing: true,
        activeNoteId: activeTab.path,
      });
    }
  }


  return (
    <div className={`ftux-editor-host ${ftuxConnectionPulse && isFocused ? "ftux-connection-highlight-pulse" : ""}`}>
      <EditorHeader
        filePath={activeTab.path}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onToggleInsight={() => onToggleInsight(!showInlineInsight)}
        activeEditors={activeEditors}
      />
      {isLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          Loading...
        </div>
      ) : activeTab.path === "__new_tab__" ? (
        <NewTabView
          onNewNote={() => {
            // Use the global handler if possible, or trigger event
            document.dispatchEvent(new CustomEvent("menu:new-note"));
          }}
          onSearch={() => {
            document.dispatchEvent(new CustomEvent("editor:open-search"));
          }}
          onClose={() => onTabClose(activeTab.id)}
        />
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
