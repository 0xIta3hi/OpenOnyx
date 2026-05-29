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
import { setCursorsEffect } from "../utils/remoteCursorsPlugin";
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
  getViewState?: (path: string) => { scroll?: number; cursor?: number; viewMode?: ViewMode } | undefined;
  onViewStateChange?: (path: string, state: { scroll?: number; cursor?: number; viewMode?: ViewMode }) => void;
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
  getViewState,
  onViewStateChange,
}: LeafPaneEditorProps) {
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(activeTab.path !== "__new_tab__");
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  const [fileExists, setFileExists] = useState<boolean>(true);
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

  // Remote cursor presence state for the current file
  const [remoteCursors, setRemoteCursors] = useState<CursorPresence[]>([]);

  // Load content when the active tab changes
  useEffect(() => {
    let isActive = true;
    
    // Set loading state to prevent Editor from mounting with old content
    setIsLoading(true); 
    setFileExists(true);

    if (activeTab.path === "__new_tab__") {
      setContent("");
      setIsLoading(false);
      return;
    }
    
    const loadContent = async () => {
      try {
        const exists = await api.fileExists(activeTab.path);
        if (!isActive) return;
        if (!exists) {
          setFileExists(false);
          setIsLoading(false);
          return;
        }
        const c = await api.readFile(activeTab.path);
        if (!isActive) return;
        setContent(c);
        setIsLoading(false);
      } catch (err) {
        if (isActive) {
          setFileExists(false);
          setContent("");
          setIsLoading(false);
          console.error("Failed to load note content:", err);
        }
      }
    };

    void loadContent();

    return () => {
      isActive = false;
    };
  }, [activeTab.path]);

  // ── Content Change Handler ──────────────────────────────────────────────────

  const handleContentChange = useCallback((newContent: string, isUserEdit?: boolean) => {
    setContent(newContent);

    // Let the global state know there was a change
    onContentChangeGlobal(activeTab.path, newContent);

    // Only run side-effects for genuine user edits (not remote or programmatic syncs)
    if (!isUserEdit) return;

    // Presence: mark as typing
    const isCollabSpace = !!collaborationEngine.activeSpaceId && !collaborationEngine.collabPaused;
    if (isCollabSpace && activeTab.path && activeTab.path !== "__new_tab__") {
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

    // Persist to IndexedDB + enqueue for sync to Supabase (debounced).
    // Lower debounce than disk save so cloud sync starts sooner.
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
      }, 800);
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

    // For large edits (paste, AI generation), broadcast ONLY the full document.
    // Sending both granular ops AND a full-doc causes double-application on the
    // receiver side. Granular ops are only useful for small, incremental edits.
    const totalInserted = ops.reduce((sum, op) => sum + (op.text?.length || 0), 0);
    if (totalInserted > 500) {
      const view = editorViewRef.current;
      if (view) {
        collaborationEngine.broadcastFullDocument(activeTab.path, view.state.doc.toString());
      }
    } else {
      collaborationEngine.broadcastOperations(activeTab.path, ops);
    }
  }, [activeTab.path]);

  // ── Cursor Presence Broadcast ───────────────────────────────────────────────

  const handleCursorChange = useCallback((cursor: { from: number; to: number }) => {
    if (!collaborationEngine.activeSpaceId) return;
    if (!activeTab.path || activeTab.path === "__new_tab__") return;

    // Debounce cursor presence updates (150ms). The collaboration engine
    // also throttles at 100ms, but debouncing here avoids creating
    // unnecessary CursorPresence objects on every keystroke.
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
    }, 150);
  }, [activeTab.path]);

  // ── Receive Remote Operations ───────────────────────────────────────────────

  useEffect(() => {
    if (activeTab.path === "__new_tab__") return;

    const unsub = collaborationEngine.onRemoteOperation((path, ops) => {
      if (path !== activeTab.path) return;

      const view = editorViewRef.current;
      if (!view) return;

      // Apply each operation sequentially. Each dispatch changes the document
      // length, so we must re-read doc.length after each one. Batching them
      // all against a single stale snapshot causes position corruption on the
      // 2nd+ operation.
      for (const op of ops) {
        const docLen = view.state.doc.length;
        const clamped = clampOperation(op, docLen);
        const change = operationToChangeSpec(clamped);
        view.dispatch({
          changes: change,
          // Use 'remote' annotation so the CM update listener recognises this
          // as a non-user edit (isUserEvent("input"/"delete"/etc.) returns false).
          annotations: Transaction.remote.of(true),
        });
      }
    });

    return unsub;
  }, [activeTab.path, onContentChangeGlobal]);

  // ── Receive Remote Cursor Presence ──────────────────────────────────────────

  // Track when each remote cursor was last updated, so we can clean up stale ones
  const cursorLastSeenRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (activeTab.path === "__new_tab__") return;

    const unsub = collaborationEngine.onRemoteCursor((presence) => {
      // Only show cursors for the same file
      if (presence.file_path !== activeTab.path) {
        // Remove this user's cursor if they moved to a different file
        setRemoteCursors(prev => prev.filter(c => c.user_id !== presence.user_id));
        cursorLastSeenRef.current.delete(presence.user_id);
        return;
      }

      // Update last-seen timestamp for stale cleanup
      cursorLastSeenRef.current.set(presence.user_id, Date.now());

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

    // Clean up stale cursors every 10 seconds. If a user's cursor hasn't
    // been updated in 15 seconds they are likely offline or on another file.
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = 15_000;
      const staleUserIds: string[] = [];
      for (const [userId, lastSeen] of cursorLastSeenRef.current) {
        if (now - lastSeen > staleThreshold) {
          staleUserIds.push(userId);
        }
      }
      if (staleUserIds.length > 0) {
        for (const id of staleUserIds) {
          cursorLastSeenRef.current.delete(id);
        }
        setRemoteCursors(prev => prev.filter(c => !staleUserIds.includes(c.user_id)));
      }
    }, 10_000);

    // Also clean up cursors when users go offline (leave presence)
    const unsubUsers = collaborationEngine.onActiveUsersChange((users) => {
      const onlineUserIds = new Set(users.map(u => u.id));
      setRemoteCursors(prev => {
        const filtered = prev.filter(c => onlineUserIds.has(c.user_id));
        // Also prune the lastSeen map
        for (const [userId] of cursorLastSeenRef.current) {
          if (!onlineUserIds.has(userId)) {
            cursorLastSeenRef.current.delete(userId);
          }
        }
        return filtered.length !== prev.length ? filtered : prev;
      });
    });

    return () => {
      unsub();
      clearInterval(cleanupInterval);
      unsubUsers();
    };
  }, [activeTab.path]);

  // ── Full-Content Fallback (DB-level sync via postgres_changes) ──────────────

  useEffect(() => {
    if (activeTab.path === "__new_tab__") return;

    const unsub = collaborationEngine.onRemoteDocumentUpdate((path, remoteContent, _senderClientId, isBroadcast) => {
      if (path !== activeTab.path) return;

      // If this is a background database replication change (not a real-time broadcast),
      // IGNORE the full-document replacement to avoid overwriting concurrent local edits.
      // Real-time synchronization is handled natively via 'doc-ops' and 'doc-full' broadcasts.
      if (!isBroadcast) return;

      const view = editorViewRef.current;
      if (view) {
        const currentDoc = view.state.doc.toString();
        if (currentDoc !== remoteContent) {
          view.dispatch({
            changes: { from: 0, to: currentDoc.length, insert: remoteContent },
            annotations: Transaction.remote.of(true),
          });
        }
      } else {
        setContent(remoteContent);
        onContentChangeGlobal(activeTab.path, remoteContent);
      }

      // Clear stale remote cursor positions -- after a full-doc replace, all
      // absolute cursor positions from peers are invalid and must be refreshed
      // by the next cursor-presence broadcast from each peer.
      setRemoteCursors([]);

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

  // Clear remote cursors when switching files (both React state AND CodeMirror)
  useEffect(() => {
    setRemoteCursors([]);
    const view = editorViewRef.current;
    if (view) {
      try {
        view.dispatch({ effects: setCursorsEffect.of([]) });
      } catch { /* view may be destroyed during tab switch */ }
    }
  }, [activeTab.path]);

  // Restore viewMode state when tab changes
  useEffect(() => {
    if (activeTab.path && activeTab.path !== "__new_tab__") {
      const cached = getViewState?.(activeTab.path);
      if (cached?.viewMode) {
        setViewMode(cached.viewMode);
      } else {
        setViewMode("editor");
      }
    }
  }, [activeTab.path, getViewState]);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (activeTab.path && activeTab.path !== "__new_tab__") {
      onViewStateChange?.(activeTab.path, { viewMode: mode });
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const currentUser = authManager.getUser();
  const currentUserId = currentUser?.id;
  const isCollabSpace = !!collaborationEngine.activeSpaceId && !collaborationEngine.collabPaused;

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

  if (!fileExists) {
    return (
      <div className="file-missing-placeholder" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '24px',
        color: 'var(--text-muted)',
        textAlign: 'center',
        backgroundColor: 'var(--bg-primary, var(--background-primary))'
      }}>
        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-normal, var(--text-primary))' }}>
          File missing
        </div>
        <div style={{ fontSize: '12px', marginBottom: '16px', maxWidth: '300px' }}>
          The file <code style={{ wordBreak: 'break-all', backgroundColor: 'var(--bg-secondary, var(--background-secondary))', padding: '2px 4px', borderRadius: '4px' }}>{activeTab.path}</code> could not be found. It may have been renamed or deleted.
        </div>
        <button 
          className="setting-btn-secondary"
          onClick={() => onTabClose(activeTab.id)}
          style={{ padding: '6px 12px', fontSize: '12px' }}
        >
          Close tab
        </button>
      </div>
    );
  }

  return (
    <div className={`ftux-editor-host ${ftuxConnectionPulse && isFocused ? "ftux-connection-highlight-pulse" : ""}`}>
      <EditorHeader
        filePath={activeTab.path}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
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
          onViewModeChange={handleViewModeChange}
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
          getViewState={getViewState}
          onViewStateChange={onViewStateChange}
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
