/**
 * SpacesPage — Main entry for the Spaces feature
 *
 * A Space is a queryable knowledge layer over the user's entire vault.
 * No manual note management — all vault notes are automatically indexed.
 *
 * Two views:
 *  1. Marketplace — grid of all spaces with create/delete/remix
 *  2. Space View — header, chat with streaming AI, vault note previews
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Layers, Plus, X, Trash2, ArrowLeft, Send, Loader2,
  Copy, FileText, Globe, RefreshCw, LogIn, LogOut,
} from "lucide-react";
import {
  listSpaces, getSpace, createSpace, deleteSpace, forkSpace,
} from "../utils/spaces-store";
import { buildVectorIndex } from "../utils/spaces-processing";
import { querySpaceStreaming, type RAGResult, type SpaceMetadata } from "../utils/spaces-rag";
import { isAIConfigured } from "../utils/ai-core";
import type { Space, SpaceIndexEntry, SpaceChatMessage, SpaceVisibility } from "../types/spaces";
import type { FileEntry } from "../types/index";
import { MarkdownPreview } from "./editor/MarkdownPreview";
import { authManager, AuthRequiredError } from "../lib/auth";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { AuthModal } from "./AuthModal";

// ── Props ────────────────────────────────────────────────────────────────────

interface SpacesPageProps {
  onClose: () => void;
  fileTree: FileEntry[];
  onOpenNote?: (path: string) => void;
}

// ── Suggested Queries ────────────────────────────────────────────────────────

const SUGGESTED_QUERIES = [
  "How should I start?",
  "What mistakes should I avoid?",
  "Give me a simple plan",
  "What are the key themes?",
  "Summarize the most important ideas",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Count .md files in a file tree */
function countNotes(entries: FileEntry[] = []): number {
  if (!entries) return 0;
  let count = 0;
  for (const e of entries) {
    if (e.isDirectory && e.children) count += countNotes(e.children);
    else if (e.name.endsWith(".md") || e.name.endsWith(".canvas")) count++;
  }
  return count;
}

/** Get a few preview notes from the file tree */
function getPreviewNotes(entries: FileEntry[] = [], max = 6): { path: string; title: string }[] {
  if (!entries) return [];
  const notes: { path: string; title: string; modified: number }[] = [];

  function walk(items: FileEntry[]) {
    if (!items) return;
    for (const e of items) {
      if (e.isDirectory && e.children) walk(e.children);
      else if (e.name.endsWith(".md")) {
        notes.push({ path: e.path, title: e.name.replace(/\.md$/, ""), modified: e.modifiedAt });
      }
    }
  }

  walk(entries);
  notes.sort((a, b) => b.modified - a.modified);
  return notes.slice(0, max);
}

function getVisibilityLabel(visibility: SpaceVisibility): string {
  switch (visibility) {
    case "local":
      return "Local";
    case "private":
      return "Private";
    case "public":
      return "Public";
    default:
      return "Local";
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function SpacesPage({ onClose, fileTree, onOpenNote }: SpacesPageProps) {
  // Navigation
  const [view, setView] = useState<"marketplace" | "space">("marketplace");
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);

  // Marketplace state
  const [spaces, setSpaces] = useState<SpaceIndexEntry[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Space view state
  const [activeSpace, setActiveSpace] = useState<Space | null>(null);
  const currentUserId = authManager.getUserId();
  const isRemote = activeSpace?.visibility !== "local" && activeSpace?.ownerId !== currentUserId;

  // Create form
  const [createTitle, setCreateTitle] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createTags, setCreateTags] = useState<string[]>([]);
  const [createTagInput, setCreateTagInput] = useState("");
  const [createVisibility, setCreateVisibility] = useState<SpaceVisibility>("local");
  const [createError, setCreateError] = useState<string | null>(null);

  // Auth/cloud state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authEmail, setAuthEmail] = useState<string | null>(authManager.getUser()?.email ?? null);

  // Chat state
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<SpaceChatMessage[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [streamingText, setStreamingText] = useState("");

  // Indexing
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState({ done: 0, total: 0 });
  const [isIndexed, setIsIndexed] = useState(false);

  // Remote notes (for cloud spaces)
  const [remoteNotes, setRemoteNotes] = useState<{ path: string; title: string }[]>([]);
  const [isLoadingRemote, setIsLoadingRemote] = useState(false);

  // Delete confirm
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Toast notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error">("success");

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToastMessage(message);
    setToastType(type);
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const vaultNoteCount = countNotes(fileTree);
  const previewNotes = getPreviewNotes(fileTree);

  useEffect(() => {
    return authManager.subscribe((state) => {
      setAuthEmail(state.user?.email ?? null);
    });
  }, []);

  // ── Load spaces ──────────────────────────────────────
  const refreshSpaces = useCallback(async () => {
    try {
      const list = await listSpaces();
      setSpaces(list);
    } catch (err) {
      console.error("[Spaces] Failed to load spaces:", err);
      setSpaces([]);
    }
  }, []);

  useEffect(() => {
    refreshSpaces();
  }, [refreshSpaces]);

  // ── Open a space ─────────────────────────────────────
  const openSpace = useCallback(async (id: string) => {
    const space = await getSpace(id);
    if (space) {
      setActiveSpace(space);
      setActiveSpaceId(id);
      setView("space");
      setChatMessages([]);
      setStreamingText("");
      setChatInput("");
      const currentUserId = authManager.getUserId();
      const remoteStatus = space.visibility !== "local" && space.ownerId !== currentUserId;
      
      // If it's a remote space, we don't index the local vault
      setIsIndexed(remoteStatus);
    }
  }, []);

  // ── Create space ─────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!createTitle.trim()) return;
    setCreateError(null);
    try {
      const space = await createSpace({
        title: createTitle.trim(),
        description: createDesc.trim(),
        helpsWith: createTags,
        noteCount: vaultNoteCount,
        visibility: createVisibility,
      });
      setCreateTitle("");
      setCreateDesc("");
      setCreateTags([]);
      setCreateTagInput("");
      setCreateVisibility("local");
      setShowCreateModal(false);
      await refreshSpaces();
      openSpace(space.id);
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        setAuthMessage("Sign in to create private/public cloud spaces.");
        setShowAuthModal(true);
        return;
      }
      console.error("[SpacesPage] Failed to create space:", err);
      setCreateError(err instanceof Error ? err.message : "Failed to create space.");
    }
  }, [createTitle, createDesc, createTags, vaultNoteCount, createVisibility, refreshSpaces, openSpace]);

  // ── Delete space ─────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteSpace(id);
      setDeleteConfirmId(null);
      if (activeSpaceId === id) {
        setView("marketplace");
        setActiveSpace(null);
        setActiveSpaceId(null);
      }
      await refreshSpaces();
      showToast("Space deleted.");
    } catch (err) {
      setDeleteConfirmId(null);
      if (err instanceof AuthRequiredError) {
        setAuthMessage("Sign in to delete cloud spaces.");
        setShowAuthModal(true);
      } else {
        showToast(err instanceof Error ? err.message : "Failed to delete space.", "error");
      }
    }
  }, [activeSpaceId, refreshSpaces, showToast]);

  // ── Fork space ───────────────────────────────────────
  const handleFork = useCallback(async (id: string) => {
    try {
      const forked = await forkSpace(id);
      if (forked) {
        await refreshSpaces();
        showToast(`\u201c${forked.title}\u201d saved to your vault.`);
        openSpace(forked.id);
      }
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        setAuthMessage("Sign in to fork cloud spaces.");
        setShowAuthModal(true);
      } else {
        showToast(err instanceof Error ? err.message : "Remix failed.", "error");
      }
    }
  }, [refreshSpaces, openSpace, showToast]);

  const handleSignOut = useCallback(async () => {
    try {
      await authManager.signOut();
      await refreshSpaces();
    } catch (err) {
      console.error("[Spaces] Sign out failed:", err);
    }
  }, [refreshSpaces]);

  // ── Build index (auto-indexes entire vault) ──────────
  const handleBuildIndex = useCallback(async () => {
    if (!activeSpaceId || fileTree.length === 0) return;
    setIsIndexing(true);
    setIndexProgress({ done: 0, total: vaultNoteCount });
    try {
      await buildVectorIndex(activeSpaceId, fileTree, (done, total) => {
        setIndexProgress({ done, total });
      });
      setIsIndexed(true);
      // Refresh space to get updated noteCount
      const updated = await getSpace(activeSpaceId);
      if (updated) setActiveSpace(updated);
      await refreshSpaces();
    } catch (err) {
      console.error("[Spaces] Index build failed:", err);
    }
    setIsIndexing(false);
  }, [activeSpaceId, fileTree, vaultNoteCount, refreshSpaces]);

  useEffect(() => {
    if (activeSpaceId && fileTree.length > 0 && view === "space" && !isIndexed && !isIndexing && !isRemote) {
      handleBuildIndex();
    }
  }, [activeSpaceId, activeSpace, isRemote, isIndexed, isIndexing, view, fileTree.length, handleBuildIndex]);

  // Fetch remote notes for preview when entering a cloud space
  useEffect(() => {
    if (activeSpaceId && activeSpace && activeSpace.visibility !== "local" && view === "space") {
      const fetchRemote = async () => {
        setIsLoadingRemote(true);
        try {
          const { data } = await supabase
            .from("notes")
            .select("id, title")
            .eq("space_id", activeSpaceId)
            .eq("deleted", false)
            .limit(10);
          
          if (data) {
            setRemoteNotes(data.map(n => ({ path: n.id, title: n.title })));
          }
        } catch (err) {
          console.error("[Spaces] Failed to fetch remote notes:", err);
        }
        setIsLoadingRemote(false);
      };
      fetchRemote();
    } else {
      setRemoteNotes([]);
    }
  }, [activeSpaceId, activeSpace, view]);

  // ── Chat query ───────────────────────────────────────
  const handleChat = useCallback(async (query?: string) => {
    const q = (query || chatInput).trim();
    if (!q || !activeSpaceId || !activeSpace || isQuerying) return;

    const userMsg: SpaceChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: q,
      timestamp: Date.now(),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setIsQuerying(true);
    setStreamingText("");

    try {
      const spaceMeta: SpaceMetadata = {
        title: activeSpace.title,
        description: activeSpace.description,
        helpsWith: activeSpace.helpsWith || [],
      };
      const result = await querySpaceStreaming(activeSpaceId, q, spaceMeta, (chunk) => {
        setStreamingText((prev) => prev + chunk);
      });

      const assistantMsg: SpaceChatMessage = {
        id: `msg-${Date.now()}-resp`,
        role: "assistant",
        content: result.answer,
        sources: result.sources.map((s) => s.noteTitle),
        timestamp: Date.now(),
      };
      setChatMessages((prev) => [...prev, assistantMsg]);
      setStreamingText("");
    } catch (err) {
      const errMsg: SpaceChatMessage = {
        id: `msg-${Date.now()}-err`,
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : "Query failed"}`,
        timestamp: Date.now(),
      };
      setChatMessages((prev) => [...prev, errMsg]);
      setStreamingText("");
    }
    setIsQuerying(false);
  }, [chatInput, activeSpaceId, activeSpace, isQuerying]);

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleChat();
    }
  };

  // Scroll to bottom on new messages (guard: only when there are actual messages
  // to prevent scrollIntoView from propagating to ancestor containers on mount)
  useEffect(() => {
    if (chatMessages.length > 0 || streamingText) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [chatMessages, streamingText]);

  // ── Tag input ────────────────────────────────────────
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && createTagInput.trim()) {
      e.preventDefault();
      const tag = createTagInput.trim().replace(/,/g, "");
      if (tag && !createTags.includes(tag)) {
        setCreateTags((prev) => [...prev, tag]);
      }
      setCreateTagInput("");
    }
    if (e.key === "Backspace" && !createTagInput && createTags.length > 0) {
      setCreateTags((prev) => prev.slice(0, -1));
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: Marketplace
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "marketplace") {
    return (
      <div className="spaces-page">
        {/* Toast notification */}
        {toastMessage && (
          <div
            className={`space-toast ${toastType}`}
            onClick={() => setToastMessage(null)}
          >
            {toastMessage}
          </div>
        )}
        <div className="spaces-header">
          <h2>
            <Globe size={18} strokeWidth={1.5} style={{ opacity: 0.5 }} />
            Spaces
          </h2>
          <div className="spaces-header-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowCreateModal(true)}>
              <Plus size={14} /> New Space
            </button>
            <button className="btn btn-ghost" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="space-cloud-status">
          <div className="space-cloud-status-text">
            {isSupabaseConfigured
              ? authEmail
                ? `Cloud DB connected. Signed in as ${authEmail}.`
                : "Cloud DB connected. Sign in to create private/public spaces."
              : "Cloud DB not configured. Spaces run in local-only mode."}
          </div>
          <div className="space-cloud-status-actions">
            {authEmail ? (
              <button className="btn btn-ghost btn-sm" onClick={handleSignOut}>
                <LogOut size={12} /> Sign out
              </button>
            ) : (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setAuthMessage("Sign in to create cloud spaces and sync with Supabase.");
                  setShowAuthModal(true);
                }}
                disabled={!isSupabaseConfigured}
                title={!isSupabaseConfigured ? "Set Supabase env vars to enable cloud auth" : undefined}
              >
                <LogIn size={12} /> Sign in
              </button>
            )}
          </div>
        </div>

        <div className="spaces-body">
          {spaces.length === 0 ? (
            <div className="spaces-empty">
              <Layers size={40} style={{ opacity: 0.12 }} />
              <p>
                No spaces yet. Create one to make your {vaultNoteCount} note{vaultNoteCount !== 1 ? "s" : ""} queryable with AI.
              </p>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreateModal(true)}>
                <Plus size={14} /> Create your first Space
              </button>
            </div>
          ) : (
            <div className="spaces-grid">
              {spaces.map((s) => (
                <div key={s.id} className="space-card" onClick={() => openSpace(s.id)}>
                  <h3 className="space-card-title">{s.title}</h3>
                  {s.description && <p className="space-card-desc">{s.description}</p>}
                  {(s.helpsWith || []).length > 0 && (
                    <div className="space-card-tags">
                      {(s.helpsWith || []).map((tag) => (
                        <span key={tag} className="space-tag">{tag}</span>
                      ))}
                    </div>
                  )}
                  <div className="space-card-meta">
                    <div className="space-card-meta-left">
                      <span>{s.noteCount} note{s.noteCount !== 1 ? "s" : ""} indexed</span>
                      <span className={`visibility-badge ${s.visibility}`}>
                        {getVisibilityLabel(s.visibility)}
                      </span>
                    </div>
                    <div className="space-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => handleFork(s.id)} title="Remix">
                        <Copy size={12} /> Remix
                      </button>
                      <button onClick={() => setDeleteConfirmId(s.id)} title="Delete">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create Modal */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
              <div className="modal-header">
                <h3>Create Space</h3>
                <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="space-create-form">
                <div style={{ fontSize: 12, color: "var(--text-secondary)", padding: "4px 0 8px", lineHeight: 1.5 }}>
                  This will index all {vaultNoteCount} notes in your vault as a queryable knowledge space.
                </div>
                <div className="space-form-field">
                  <label>Title</label>
                  <input
                    className="space-form-input"
                    placeholder="e.g. React Patterns"
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-form-field">
                  <label>Description</label>
                  <textarea
                    className="space-form-input"
                    placeholder="What is this space about?"
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                  />
                </div>
                <div className="space-form-field">
                  <label>Helps with (press Enter to add)</label>
                  <div className="space-form-tags-input">
                    {createTags.map((tag) => (
                      <span key={tag} className="space-form-tag">
                        {tag}
                        <button onClick={() => setCreateTags((prev) => prev.filter((t) => t !== tag))}>
                          <X size={8} />
                        </button>
                      </span>
                    ))}
                    <input
                      placeholder={createTags.length === 0 ? "e.g. hooks, state, performance" : ""}
                      value={createTagInput}
                      onChange={(e) => setCreateTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                    />
                  </div>
                </div>
                <div className="space-form-field">
                  <label>Visibility</label>
                  <div className="space-visibility-options">
                    <button
                      type="button"
                      className={`space-visibility-option ${createVisibility === "local" ? "active" : ""}`}
                      onClick={() => setCreateVisibility("local")}
                    >
                      Local only
                    </button>
                    <button
                      type="button"
                      className={`space-visibility-option ${createVisibility === "private" ? "active" : ""}`}
                      onClick={() => setCreateVisibility("private")}
                      disabled={!isSupabaseConfigured}
                    >
                      Private cloud
                    </button>
                    <button
                      type="button"
                      className={`space-visibility-option ${createVisibility === "public" ? "active" : ""}`}
                      onClick={() => setCreateVisibility("public")}
                      disabled={!isSupabaseConfigured}
                    >
                      Public
                    </button>
                  </div>
                  <div className="space-form-hint">
                    {createVisibility === "local"
                      ? "Stored only on this device."
                      : createVisibility === "private"
                        ? "Synced to cloud and visible only to your account."
                        : "Published publicly so others can discover and remix it."}
                  </div>
                  {!isSupabaseConfigured && (
                    <div className="space-form-hint warning">
                      Cloud options require VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.
                    </div>
                  )}
                </div>
                {createError && <div className="space-form-error">{createError}</div>}
                <div className="space-form-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleCreate}
                    disabled={!createTitle.trim()}
                    style={{ fontWeight: 600 }}
                  >
                    Create Space
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirm */}
        {deleteConfirmId && (() => {
          const spaceToDelete = spaces.find(s => s.id === deleteConfirmId);
          const isCloud = spaceToDelete && spaceToDelete.visibility !== "local";
          const currentUserId = authManager.getUserId();
          const isOwner = spaceToDelete && currentUserId && spaceToDelete.ownerId === currentUserId;
          const canDelete = !isCloud || (authManager.isLoggedIn() && isOwner);

          return (
            <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
                <div className="space-delete-confirm">
                  <p>
                    Delete <strong>{spaceToDelete?.title || "this space"}</strong>?
                    {" "}
                    {spaceToDelete?.visibility === "local"
                      ? "This local space will be removed from your vault."
                      : isOwner
                        ? "This will also remove it from the cloud."
                        : ""}
                  </p>
                  {isCloud && !authManager.isLoggedIn() && (
                    <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                      You must sign in to delete cloud spaces.
                    </p>
                  )}
                  {isCloud && authManager.isLoggedIn() && !isOwner && (
                    <p style={{ fontSize: 11, color: "#e8a838", marginTop: 4 }}>
                      Only the owner can delete this space.
                    </p>
                  )}
                  <div className="space-form-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirmId(null)}>
                      Cancel
                    </button>
                    <button
                      className="btn btn-ghost btn-sm btn-danger"
                      onClick={() => handleDelete(deleteConfirmId)}
                      disabled={!canDelete}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {showAuthModal && (
          <AuthModal
            onClose={() => setShowAuthModal(false)}
            onSuccess={() => {
              setShowAuthModal(false);
              refreshSpaces();
            }}
            message={authMessage}
          />
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: Space View
  // ═══════════════════════════════════════════════════════════════════════════

  if (!activeSpace) return null;

  return (
    <div className="spaces-page space-view">
      <button
        className="space-view-back"
        onClick={() => {
          setView("marketplace");
          setActiveSpace(null);
          setActiveSpaceId(null);
          setIsIndexed(false);
        }}
      >
        <ArrowLeft size={14} /> Back to Spaces
      </button>

        {/* Index Progress — always rendered but hidden when not indexing to avoid layout shifts */}
        <div className={`space-index-bar${isIndexing ? " is-active" : ""}`}>
          <Loader2 size={14} className="spinner" />
          <span>Indexing vault notes...</span>
          <div className="space-index-progress">
            <div
              className="space-index-progress-fill"
              style={{ width: `${indexProgress.total > 0 ? (indexProgress.done / indexProgress.total) * 100 : 0}%` }}
            />
          </div>
          <span>{indexProgress.done}/{indexProgress.total}</span>
        </div>

        <div className="space-view-scroll">
          {/* Header */}
          <div className="space-view-header">
            <div className="space-view-title-row">
              <div>
                <h1 className="space-view-title">{activeSpace.title}</h1>
                {activeSpace.description && (
                  <p className="space-view-desc">{activeSpace.description}</p>
                )}
                <div className={`visibility-badge ${activeSpace.visibility}`} style={{ marginTop: 8 }}>
                  {getVisibilityLabel(activeSpace.visibility)}
                </div>
              </div>
              <div className="space-view-actions">
                {!isRemote && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleBuildIndex}
                    disabled={isIndexing}
                    title="Re-index vault notes"
                  >
                    <RefreshCw size={13} className={isIndexing ? "spinner" : ""} /> Re-index
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => handleFork(activeSpace.id)}>
                  <Copy size={13} /> Remix
                </button>
              </div>
            </div>
            {(activeSpace.helpsWith || []).length > 0 && (
              <div className="space-view-tags">
                {(activeSpace.helpsWith || []).map((tag) => (
                  <span key={tag} className="space-view-tag">{tag}</span>
                ))}
              </div>
            )}
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
              {activeSpace.noteCount || vaultNoteCount} vault notes indexed
            </div>
          </div>

          {/* Vault Preview — recent notes */}
          {((activeSpace.visibility === "local" || activeSpace.ownerId === authManager.getUserId()) ? previewNotes : remoteNotes).length > 0 && (
            <div className="space-preview-section">
              <div className="space-section-label">
                {activeSpace.visibility === "local" || activeSpace.ownerId === authManager.getUserId() 
                  ? "Recent Vault Notes" 
                  : "Recent Cloud Notes"}
              </div>
              <div className="space-preview-grid">
                {((activeSpace.visibility === "local" || activeSpace.ownerId === authManager.getUserId()) ? previewNotes : remoteNotes).map((note) => (
                  <div
                    key={note.path}
                    className="space-preview-card"
                    onClick={() => {
                      if (activeSpace.visibility === "local" || activeSpace.ownerId === authManager.getUserId()) {
                        onOpenNote?.(note.path);
                      }
                    }}
                    style={{ cursor: (activeSpace.visibility === "local" || activeSpace.ownerId === authManager.getUserId()) && onOpenNote ? "pointer" : "default" }}
                  >
                    <h4>
                      <FileText size={12} style={{ opacity: 0.4, marginRight: 6 }} />
                      {note.title}
                    </h4>
                    <p style={{ color: "var(--text-muted)", fontSize: 11 }}>
                      {activeSpace.visibility === "local" || activeSpace.ownerId === authManager.getUserId()
                        ? "Click to open in editor"
                        : "Cloud note (Remix to edit)"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}


        {/* Chat Section */}
        <div className="space-chat-section">
          <div className="space-section-label">
            Want to know something specific? Ask this brain
          </div>

          {/* Suggested queries — only shown when no messages yet */}
          {chatMessages.length === 0 && (
            <div className="space-chat-suggestions">
              {SUGGESTED_QUERIES.map((q) => (
                <button key={q} className="space-chat-suggestion" onClick={() => handleChat(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Chat history */}
          {chatMessages.map((msg) => (
            <div key={msg.id} className="space-chat-response" style={msg.role === "user" ? {
              background: "transparent", border: "none", padding: "8px 0",
              fontWeight: 500, fontSize: 13, color: "var(--text-primary)",
            } : {}}>
              {msg.role === "user" ? (
                <span>→ {msg.content}</span>
              ) : (
                <>
                  <div className="space-chat-answer">
                    <MarkdownPreview
                      content={msg.content}
                      onLinkClick={(link) => onOpenNote?.(`${link}.md`)}
                    />
                  </div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="space-chat-sources">
                      <span className="space-chat-sources-label">Sources</span>
                      {msg.sources.map((s, i) => (
                        <span key={i} className="space-chat-source-pill">{s}</span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          {/* Streaming indicator */}
          {isQuerying && streamingText && (
            <div className="space-chat-response">
              <div className="space-chat-answer">
                <MarkdownPreview
                  content={streamingText}
                  onLinkClick={(link) => onOpenNote?.(`${link}.md`)}
                />
              </div>
            </div>
          )}
          {isQuerying && !streamingText && (
            <div className="space-chat-loading">
              <Loader2 size={14} className="spinner" />
              Thinking...
            </div>
          )}

          <div ref={chatEndRef} />

          {/* Input */}
          <div className="space-chat-input-row">
            <textarea
              className="space-chat-input"
              placeholder="Ask this space anything..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              rows={1}
              disabled={isQuerying}
            />
            <button
              className="space-chat-send"
              onClick={() => handleChat()}
              disabled={!chatInput.trim() || isQuerying}
            >
              {isQuerying ? <Loader2 size={16} className="spinner" /> : <Send size={16} />}
            </button>
          </div>

          {!isAIConfigured() && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
              Configure an API key in AI Settings to enable chat.
            </div>
          )}
        </div>
      </div>

      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => {
            setShowAuthModal(false);
            refreshSpaces();
          }}
          message={authMessage}
        />
      )}
    </div>
  );
}

export default SpacesPage;
