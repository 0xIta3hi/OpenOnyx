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
import type { CollabOperation, CursorPresence } from "../utils/collabOperations";
import { operationToChangeSpec, clampOperation } from "../utils/collabOperations";
import { Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

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
  const cursorDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Ref to the CodeMirror EditorView -- needed to apply remote operations
  // directly without going through React state (which would cause full-doc replace).
  const editorViewRef = useRef<EditorView | null>(null);

  const handleEditorViewReady = useCallback((view: EditorView | null) => {
    editorViewRef.current = view;
  }, []);

  // Flag: when true, the next onContentChange from the Editor is caused by
  // us applying a remote operation / full-content update, so skip re-broadcasting.
  const isRemoteUpdateRef = useRef<boolean>(false);

  // Remote cursor presence state for the current file
  const [remoteCursors, setRemoteCursors] = useState<CursorPresence[]>([]);

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

  // ── Content Change Handler ──────────────────────────────────────────────────

  const handleContentChange = useCallback((newContent: string, isUserEdit?: boolean) => {
    // If this change was triggered by us applying a remote operation, skip.
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }

    setContent(newContent);

    // Let the global state know there was a change
    onContentChangeGlobal(activeTab.path, newContent);

    // Presence: mark as typing
    const isCollabSpace = !!collaborationEngine.activeSpaceId;
    if (isCollabSpace && activeTab.path && activeTab.path !== "__new_tab__" && isUserEdit) {
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

    // Persist to IndexedDB + enqueue for sync to Supabase (debounced)
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

  // ── Operation-Based Broadcast ───────────────────────────────────────────────

  /**
   * Called by the Editor when the user makes an edit. The Editor extracts
   * granular operations from the CodeMirror transaction and passes them here.
   * We broadcast them to all peers immediately.
   */
  const handleCollabOperations = useCallback((ops: CollabOperation[]) => {
    if (!collaborationEngine.activeSpaceId) return;
    if (!activeTab.path || activeTab.path === "__new_tab__") return;
    collaborationEngine.broadcastOperations(activeTab.path, ops);
  }, [activeTab.path]);

  // ── Cursor Presence Broadcast ───────────────────────────────────────────────

  const handleCursorChange = useCallback((cursor: { from: number; to: number }) => {
    if (!collaborationEngine.activeSpaceId) return;
    if (!activeTab.path || activeTab.path === "__new_tab__") return;

    // Debounce cursor presence updates (50ms)
    if (cursorDebounceRef.current) {
      clearTimeout(cursorDebounceRef.current);
    }
    cursorDebounceRef.current = setTimeout(() => {
      cursorDebounceRef.current = null;
      const user = authManager.getUser();
      if (!user) return;

      const userId = user.id;
      collaborationEngine.broadcastCursorPresence({
        user_id: userId,
        file_path: activeTab.path,
        cursor,
        name: user.email?.split('@')[0] || 'Anonymous',
        color: getColorForUser(userId),
      });
    }, 50);
  }, [activeTab.path]);

  // ── Receive Remote Operations ───────────────────────────────────────────────

  useEffect(() => {
    if (activeTab.path === "__new_tab__") return;

    const unsub = collaborationEngine.onRemoteOperation((path, ops) => {
      if (path !== activeTab.path) return;

      const view = editorViewRef.current;
      if (!view) return;

      // Convert operations to CodeMirror ChangeSpecs and apply them
      const docLen = view.state.doc.length;
      const changes = ops.map(op => operationToChangeSpec(clampOperation(op, docLen)));

      if (changes.length > 0) {
        // Set flag so handleContentChange skips re-broadcast and state update
        isRemoteUpdateRef.current = true;
        view.dispatch({
          changes,
          // Use 'remote' annotation so the CM update listener recognises this
          // as a non-user edit (isUserEvent("input"/"delete"/etc.) returns false).
          annotations: Transaction.remote.of(true),
        });
        // Sync React state with the authoritative CM document.
        // We read from the view directly since it already has the applied changes.
        const newDoc = view.state.doc.toString();
        setContent(newDoc);
        onContentChangeGlobal(activeTab.path, newDoc);
      }
    });

    return unsub;
  }, [activeTab.path, onContentChangeGlobal]);

  // ── Receive Remote Cursor Presence ──────────────────────────────────────────

  useEffect(() => {
    if (activeTab.path === "__new_tab__") return;

    const unsub = collaborationEngine.onRemoteCursor((presence) => {
      // Only show cursors for the same file
      if (presence.file_path !== activeTab.path) {
        // Remove this user's cursor if they moved to a different file
        setRemoteCursors(prev => prev.filter(c => c.user_id !== presence.user_id));
        return;
      }

      setRemoteCursors(prev => {
        const existing = prev.findIndex(c => c.user_id === presence.user_id);
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = presence;
          return next;
        }
        return [...prev, presence];
      });
    });

    return unsub;
  }, [activeTab.path]);

  // ── Full-Content Fallback (DB-level sync via postgres_changes) ──────────────

  useEffect(() => {
    if (activeTab.path === "__new_tab__") return;

    const unsub = collaborationEngine.onRemoteDocumentUpdate((path, remoteContent, _senderClientId) => {
      if (path !== activeTab.path) return;

      const view = editorViewRef.current;
      if (view) {
        const currentDoc = view.state.doc.toString();
        if (currentDoc !== remoteContent) {
          isRemoteUpdateRef.current = true;
          view.dispatch({
            changes: { from: 0, to: currentDoc.length, insert: remoteContent },
            annotations: Transaction.remote.of(true),
          });
          setContent(remoteContent);
          onContentChangeGlobal(activeTab.path, remoteContent);
        }
      } else {
        isRemoteUpdateRef.current = true;
        setContent(remoteContent);
        onContentChangeGlobal(activeTab.path, remoteContent);
      }

      // Write to local disk (debounced)
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

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      if (dbSyncTimer.current) clearTimeout(dbSyncTimer.current);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (cursorDebounceRef.current) {
        clearTimeout(cursorDebounceRef.current);
        cursorDebounceRef.current = null;
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

  // Clear remote cursors when switching files
  useEffect(() => {
    setRemoteCursors([]);
  }, [activeTab.path]);

  // ── Render ──────────────────────────────────────────────────────────────────

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
          onCollabOperations={isCollabSpace ? handleCollabOperations : undefined}
          onCursorChange={isCollabSpace ? handleCursorChange : undefined}
          remoteCursors={isCollabSpace ? remoteCursors : undefined}
          localClientId={isCollabSpace ? collaborationEngine.currentClientId : undefined}
          onEditorViewReady={handleEditorViewReady}
        />
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const COLLABORATOR_COLORS = [
  '#3b82f6', '#2563eb', '#059669', '#d97706', '#dc2626',
  '#0ea5e9', '#0891b2', '#65a30d', '#ea580c', '#e11d48',
];

function getColorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }
  return COLLABORATOR_COLORS[Math.abs(hash) % COLLABORATOR_COLORS.length];
}
