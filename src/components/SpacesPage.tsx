/**
 * SpacesPage — Main entry for the Spaces feature
 *
 * A Space is a queryable knowledge layer over the user's entire vault.
 * Stored locally (or synced with Supabase), fully indexed using AI embeddings.
 *
 * Redesigned UI/UX:
 *  1. Marketplace — Gorgeous glassmorphic grid with search, filter tabs, stats.
 *  2. Dual-Column Workspace — Sidebar (details & indexed notes explorer) + AI Chat.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, X, Trash2, ArrowLeft, Send, Loader2,
  Copy, FileText, Globe, RefreshCw, LogIn, LogOut, Search, Sparkles
} from "lucide-react";
import {
  listSpaces, getSpace, createSpace, deleteSpace, forkSpace,
} from "../utils/spaces-store";
import { buildVectorIndex, type VaultNote } from "../utils/spaces-processing";
import { querySpaceStreaming, type RAGResult, type SpaceMetadata } from "../utils/spaces-rag";
import { isAIConfigured } from "../utils/ai-core";
import { getAPI } from "../utils/api";
import type { Space, SpaceIndexEntry, SpaceChatMessage, SpaceVisibility } from "../types/spaces";
import type { FileEntry } from "../types/index";
import { SpacesIcon } from "./SpacesIcon";
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
  "Summarize the key ideas in my vault",
  "What are the main connections and themes?",
  "What mistakes or gaps should I watch out for?",
  "Give me a simple, actionable plan based on my notes",
  "How can I structure this project better?"
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

/** Get all preview notes from the file tree */
function getPreviewNotes(entries: FileEntry[] = [], max = 15): { path: string; title: string }[] {
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

  // Marketplace states
  const [spaces, setSpaces] = useState<SpaceIndexEntry[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [marketFilter, setMarketFilter] = useState<"all" | "local" | "cloud">("all");
  const [marketSearch, setMarketSearch] = useState("");

  // Space view state
  const [activeSpace, setActiveSpace] = useState<Space | null>(null);
  const currentUserId = authManager.getUserId();
  const isRemote = activeSpace?.visibility !== "local" && activeSpace?.ownerId !== currentUserId;

  // Create form states
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
      const isRemoteSpace = space.visibility !== "local" && space.ownerId !== currentUserId;
      
      // If it's a cloud space owned by someone else, we don't auto-index on open
      setIsIndexed(isRemoteSpace);
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
    if (!activeSpaceId) return;
    setIsIndexing(true);
    
    try {
      let customNotes: VaultNote[] | undefined = undefined;
      
      const currentUserId = authManager.getUserId();
      const isRemoteSpace = activeSpace && activeSpace.visibility !== "local" && activeSpace.ownerId !== currentUserId;
      
      if (activeSpace && activeSpace.visibility !== "local" && isRemoteSpace && isSupabaseConfigured) {
        // Cloud space (Remote): Fetch notes directly from Supabase to index them on the cloud
        const { data: cloudNotes, error: fetchErr } = await supabase
          .from("notes")
          .select("path, title, content, is_canvas")
          .eq("space_id", activeSpaceId)
          .eq("deleted", false);
          
        if (fetchErr) throw fetchErr;
        
        if (cloudNotes) {
          customNotes = cloudNotes.map(n => ({
            path: n.path,
            title: n.title,
            content: n.content || "",
            isCanvas: n.is_canvas || false,
          }));
        }
      }

      // Fetch a FRESH file tree from the API to avoid stale props
      const api = getAPI();
      const freshTree = await api.getFileTree();
      
      await buildVectorIndex(activeSpaceId, freshTree, (done, total) => {
        setIndexProgress({ done, total });
      }, customNotes);
      
      setIsIndexed(true);
      // Refresh space to get updated noteCount
      const updated = await getSpace(activeSpaceId);
      if (updated) setActiveSpace(updated);
      await refreshSpaces();
    } catch (err) {
      console.error("[Spaces] Index build failed:", err);
      showToast("Indexing failed. Check logs for details.", "error");
    }
    setIsIndexing(false);
  }, [activeSpaceId, activeSpace, refreshSpaces, showToast]);

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
            .limit(15);
          
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

  // Scroll to bottom on new messages
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

  // ── Filtering and Search inside Marketplace ─────────
  const filteredSpaces = spaces.filter((s) => {
    const matchesSearch =
      s.title.toLowerCase().includes(marketSearch.toLowerCase()) ||
      (s.description || "").toLowerCase().includes(marketSearch.toLowerCase()) ||
      (s.helpsWith || []).some(t => t.toLowerCase().includes(marketSearch.toLowerCase()));

    if (marketFilter === "local") {
      return matchesSearch && s.visibility === "local";
    }
    if (marketFilter === "cloud") {
      return matchesSearch && s.visibility !== "local";
    }
    return matchesSearch;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: Marketplace View
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "marketplace") {
    return (
      <div className="spaces-page">
        {/* Toast Notification */}
        {toastMessage && (
          <div className={`space-toast ${toastType}`} onClick={() => setToastMessage(null)}>
            {toastMessage}
          </div>
        )}

        <div className="spaces-marketplace-container">
          {/* Left Sidebar Panel */}
          <div className="spaces-marketplace-sidebar">
            <div className="spaces-sidebar-brand">
              <SpacesIcon size={18} />
              <span>Spaces</span>
            </div>

            <button
              className="btn btn-primary btn-sm spaces-sidebar-new-btn"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus size={14} /> New Space
            </button>

            <div className="spaces-menu-list">
              <button
                className={`spaces-menu-item ${marketFilter === "all" ? "active" : ""}`}
                onClick={() => setMarketFilter("all")}
              >
                <SpacesIcon size={14} />
                All Custom Layers
              </button>
              <button
                className={`spaces-menu-item ${marketFilter === "local" ? "active" : ""}`}
                onClick={() => setMarketFilter("local")}
              >
                <FileText size={14} strokeWidth={1.5} />
                Local Vaults
              </button>
              <button
                className={`spaces-menu-item ${marketFilter === "cloud" ? "active" : ""}`}
                onClick={() => setMarketFilter("cloud")}
              >
                <Globe size={14} strokeWidth={1.5} />
                Cloud Hub
              </button>
            </div>

            {/* Cloud User Profile status in Sidebar */}
            <div className="spaces-sidebar-user-section">
              <div className="spaces-user-status-text">
                {isSupabaseConfigured
                  ? authEmail
                    ? `Cloud Connected\n${authEmail}`
                    : "Cloud database online. Sign in for sync."
                  : "Cloud offline (Local Mode)"}
              </div>
              <div>
                {authEmail ? (
                  <button className="btn btn-ghost btn-sm" onClick={handleSignOut} style={{ width: "100%", padding: "6px 12px", fontSize: 11 }}>
                    <LogOut size={12} /> Sign out
                  </button>
                ) : (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setAuthMessage("Sign in to sync your knowledge layers with the cloud.");
                      setShowAuthModal(true);
                    }}
                    disabled={!isSupabaseConfigured}
                    title={!isSupabaseConfigured ? "Configure Supabase vars in environment to enable cloud database" : undefined}
                    style={{ width: "100%", padding: "6px 12px", fontSize: 11 }}
                  >
                    <LogIn size={12} /> Sign in
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Main Content Panel */}
          <div className="spaces-marketplace-content">
            <div className="spaces-marketplace-header">
              <div className="spaces-search-wrapper">
                <Search size={13} className="spaces-search-icon" />
                <input
                  type="text"
                  placeholder="Search custom spaces..."
                  className="spaces-search-input"
                  value={marketSearch}
                  onChange={(e) => setMarketSearch(e.target.value)}
                />
              </div>

              <div className="spaces-marketplace-header-right">
                <div className="spaces-marketplace-stats">
                  Vault Notes: {vaultNoteCount} | Custom Layers: {spaces.length}
                </div>
                <button className="spaces-close-btn" onClick={onClose}>
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Main Body Grid */}
            <div className="spaces-body">
              {filteredSpaces.length === 0 ? (
                <div className="spaces-empty">
                  <SpacesIcon size={36} style={{ opacity: 0.3, color: "var(--text-muted)", marginBottom: 8 }} />
                  <p>
                    {marketSearch
                      ? `No spaces matched the query "${marketSearch}".`
                      : `Build your first queryable AI knowledge layer over your ${vaultNoteCount} notes.`}
                  </p>
                  {!marketSearch && (
                    <button className="btn btn-primary btn-sm" onClick={() => setShowCreateModal(true)}>
                      <Plus size={14} /> Create a Space
                    </button>
                  )}
                </div>
              ) : (
                <div className="spaces-grid">
                  {filteredSpaces.map((s) => (
                    <div key={s.id} className="space-card" onClick={() => openSpace(s.id)}>
                      <div className="space-card-header-row">
                        <h3 className="space-card-title">{s.title}</h3>
                        <span className={`visibility-badge ${s.visibility}`}>
                          {getVisibilityLabel(s.visibility)}
                        </span>
                      </div>

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
                          <span>{s.noteCount} note{s.noteCount !== 1 ? "s" : ""} index size</span>
                        </div>
                        <div className="space-card-actions" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => handleFork(s.id)} title="Remix/Save Space">
                            <Copy size={11} /> Remix
                          </button>
                          <button onClick={() => setDeleteConfirmId(s.id)} title="Delete Space">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Create Space Dialog Modal */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>New Knowledge Space</h3>
                <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                  <X size={15} />
                </button>
              </div>
              <div className="space-create-form">
                <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
                  Creates an AI-queryable vector directory indexing all {vaultNoteCount} notes in your active vault.
                </div>

                <div className="space-form-field">
                  <label>Title</label>
                  <input
                    className="space-form-input"
                    placeholder="e.g. Research Hub, React Dev"
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="space-form-field">
                  <label>Description</label>
                  <textarea
                    className="space-form-input"
                    placeholder="Describe the knowledge covered by this space..."
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                  />
                </div>

                <div className="space-form-field">
                  <label>Focus Tags (Press Enter / Comma)</label>
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
                      placeholder={createTags.length === 0 ? "e.g. backend, hooks, styling" : ""}
                      value={createTagInput}
                      onChange={(e) => setCreateTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                    />
                  </div>
                </div>

                <div className="space-form-field">
                  <label>Vault Visibility</label>
                  <div className="space-visibility-options">
                    <button
                      type="button"
                      className={`space-visibility-option ${createVisibility === "local" ? "active" : ""}`}
                      onClick={() => setCreateVisibility("local")}
                    >
                      Local-Only
                    </button>
                    <button
                      type="button"
                      className={`space-visibility-option ${createVisibility === "private" ? "active" : ""}`}
                      onClick={() => setCreateVisibility("private")}
                      disabled={!isSupabaseConfigured}
                    >
                      Private Cloud
                    </button>
                    <button
                      type="button"
                      className={`space-visibility-option ${createVisibility === "public" ? "active" : ""}`}
                      onClick={() => setCreateVisibility("public")}
                      disabled={!isSupabaseConfigured}
                    >
                      Public Cloud
                    </button>
                  </div>
                  <div className="space-form-hint">
                    {createVisibility === "local"
                      ? "Securely cached on this local device only."
                      : createVisibility === "private"
                        ? "Encrypted & synced. Access restricted to your logged account."
                        : "Published dynamically. Discoverable and remixable by others."}
                  </div>
                  {!isSupabaseConfigured && (
                    <div className="space-form-hint warning">
                      Cloud DB parameters (Supabase environment keys) are required to toggle remote features.
                    </div>
                  )}
                </div>

                {createError && <div className="space-form-error">{createError}</div>}

                <div className="space-form-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleCreate}
                    disabled={!createTitle.trim()}
                  >
                    Create Space
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirm Modal */}
        {deleteConfirmId && (() => {
          const spaceToDelete = spaces.find(s => s.id === deleteConfirmId);
          const isCloud = spaceToDelete && spaceToDelete.visibility !== "local";
          const currentUserId = authManager.getUserId();
          const isOwner = spaceToDelete && currentUserId && spaceToDelete.ownerId === currentUserId;
          const canDelete = !isCloud || (authManager.isLoggedIn() && isOwner);

          return (
            <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
                <div className="modal-header">
                  <h3>Delete Space</h3>
                  <button className="modal-close" onClick={() => setDeleteConfirmId(null)}>
                    <X size={15} />
                  </button>
                </div>
                <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                    Are you sure you want to delete <strong>{spaceToDelete?.title || "this layer"}</strong>?
                    {" "}
                    {spaceToDelete?.visibility === "local"
                      ? "This action clears all local index tables."
                      : isOwner
                        ? "This will permanently remove the indices from cloud registers."
                        : ""}
                  </p>

                  {isCloud && !authManager.isLoggedIn() && (
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                      Account authentication is required to modify cloud states.
                    </p>
                  )}

                  {isCloud && authManager.isLoggedIn() && !isOwner && (
                    <p style={{ fontSize: 11, color: "#e8a838", margin: 0 }}>
                      Only space authors can delete this layer from cloud directory.
                    </p>
                  )}

                  <div className="space-form-actions" style={{ marginTop: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirmId(null)}>
                      Cancel
                    </button>
                    <button
                      className="btn btn-primary btn-sm btn-danger"
                      onClick={() => handleDelete(deleteConfirmId)}
                      disabled={!canDelete}
                    >
                      Confirm Delete
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
  // RENDER: Space View (Dual-Column Overhaul)
  // ═══════════════════════════════════════════════════════════════════════════

  if (!activeSpace) return null;

  const notesList = activeSpace.visibility === "local" ? previewNotes : remoteNotes;

  return (
    <div className="spaces-page space-view">
      {/* Dual Column Workspace Container */}
      <div className="space-view-workspace">
        
        {/* LEFT COLUMN: Sidebar (ChatGPT-Inspired Details & Notes Explorer) */}
        <div className="space-view-sidebar">
          {/* ChatGPT-style Sidebar Header Actions */}
          <div className="space-sidebar-actions-group">
            <button
              className="space-sidebar-btn primary-action"
              onClick={() => {
                setChatMessages([]);
                setStreamingText("");
                setChatInput("");
              }}
              title="Start a new AI conversation session"
            >
              <Plus size={14} />
              <span>New chat</span>
            </button>

            <button
              className="space-sidebar-btn secondary-action"
              onClick={() => {
                setView("marketplace");
                setActiveSpace(null);
                setActiveSpaceId(null);
                setIsIndexed(false);
              }}
              title="Return to the spaces marketplace directory"
            >
              <ArrowLeft size={14} />
              <span>Back to Spaces</span>
            </button>
          </div>

          {/* Space Information Details block */}
          <div className="space-sidebar-section">
            <div className="space-sidebar-section-header">Space Layer</div>
            <div className="space-sidebar-project-card">
              <div className="space-sidebar-project-header">
                <span className={`space-sidebar-visibility ${activeSpace.visibility}`}>
                  {getVisibilityLabel(activeSpace.visibility)}
                </span>
                <span className="space-sidebar-project-title">{activeSpace.title}</span>
              </div>
              
              {activeSpace.description && (
                <p className="space-sidebar-project-desc">{activeSpace.description}</p>
              )}

              {(activeSpace.helpsWith || []).length > 0 && (
                <div className="space-sidebar-project-tags">
                  {(activeSpace.helpsWith || []).map((tag) => (
                    <span key={tag} className="space-sidebar-project-tag">{tag}</span>
                  ))}
                </div>
              )}

              <div className="space-sidebar-project-meta">
                {activeSpace.visibility === "local" 
                  ? `${activeSpace.noteCount || vaultNoteCount} notes indexed` 
                  : `${activeSpace.noteCount ?? 0} notes indexed`}
              </div>

              <div className="space-sidebar-project-actions">
                {!isRemote && (
                  <button
                    className="space-sidebar-project-btn"
                    onClick={handleBuildIndex}
                    disabled={isIndexing}
                    title="Recompute vector indexes over note database"
                  >
                    <RefreshCw size={11} className={isIndexing ? "spinner" : ""} />
                    <span>Re-index</span>
                  </button>
                )}
                <button className="space-sidebar-project-btn" onClick={() => handleFork(activeSpace.id)}>
                  <Copy size={11} />
                  <span>Remix</span>
                </button>
              </div>
            </div>
          </div>

          {/* Curated File Navigator explorer list ("Recents" style) */}
          <div className="space-sidebar-section fill-height">
            <div className="space-sidebar-section-header">
              <span>Indexed Notes</span>
              <span className="space-sidebar-section-badge">{notesList.length}</span>
            </div>

            {notesList.length === 0 ? (
              <div className="space-sidebar-notes-empty">
                {isLoadingRemote ? "Loading index matrix..." : "No note layers indexed."}
              </div>
            ) : (
              <div className="space-sidebar-notes-list">
                {notesList.map((note) => (
                  <div
                    key={note.path}
                    className="space-sidebar-note-item"
                    onClick={() => {
                      if (note.path && onOpenNote) {
                        onOpenNote(note.path);
                      }
                    }}
                    title={activeSpace.visibility === "local" || activeSpace.ownerId === authManager.getUserId()
                      ? "Click to open in Markdown Editor"
                      : "Cloud read-only index. Remix to make local edits."}
                  >
                    <FileText size={13} className="space-note-icon" />
                    <span className="space-note-title">{note.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive AI Conversation Interface */}
        <div className="space-view-chat-container">
          {isIndexing && (
            <div className="space-view-indexing-indicator">
              <Loader2 size={12} className="spinner" />
              <span>AI Indexing Vault... ({indexProgress.done}/{indexProgress.total})</span>
            </div>
          )}
          
          <div className="space-chat-messages-scroll">
            {chatMessages.length === 0 && (
              <div className="space-chat-welcome">
                <div className="space-chat-welcome-glow" />
                <div className="space-chat-welcome-content">
                  <h2>Consult your knowledge space</h2>
                  <p>Query the knowledge layer of {activeSpace?.title || "this space"} using semantic context retrieval.</p>
                  
                  {/* CENTRAL INPUT */}
                  <div className="space-chat-central-input-wrapper">
                    <div className="space-chat-input-wrapper">
                      <textarea
                        className="space-chat-input"
                        placeholder="Ask anything..."
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
                        {isQuerying ? <Loader2 size={14} className="spinner" /> : <Send size={14} />}
                      </button>
                    </div>
                    {!isAIConfigured() && (
                      <div className="space-chat-no-ai-warning">
                        Configure an API key in AI Settings to enable chat queries over vector layers.
                      </div>
                    )}
                  </div>

                  <div className="space-chat-welcome-suggestions">
                    <div className="space-chat-suggestions-grid">
                      {SUGGESTED_QUERIES.map((q) => (
                        <button key={q} className="space-chat-suggestion" onClick={() => handleChat(q)}>
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Conversation Flow */}
            {chatMessages.map((msg) => (
              <div key={msg.id} className={`space-chat-message ${msg.role}`}>
                {msg.role === "user" ? (
                  <div className="message-bubble">
                    <div className="message-content">{msg.content}</div>
                  </div>
                ) : (
                  <>
                    <div className="message-content">
                      <MarkdownPreview
                        content={msg.content}
                        onLinkClick={(link) => onOpenNote?.(`${link}.md`)}
                      />
                    </div>
                    
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="space-chat-sources">
                        <span className="space-chat-sources-label">Sources Used</span>
                        <div className="space-chat-sources-list">
                          {msg.sources.map((s, i) => (
                            <span
                              key={i}
                              className="space-chat-source-pill"
                              onClick={() => onOpenNote?.(`${s}.md`)}
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            {/* Streaming Indicator */}
            {isQuerying && streamingText && (
              <div className="space-chat-message assistant">
                <div className="message-content">
                  <MarkdownPreview
                    content={streamingText}
                    onLinkClick={(link) => onOpenNote?.(`${link}.md`)}
                  />
                </div>
              </div>
            )}

            {/* AI thinking state loader */}
            {isQuerying && !streamingText && (
              <div className="space-chat-loading-indicator">
                <div className="flat-spinner" />
                <span>Synthesizing response...</span>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Sticky Anchored Query Drawer Input */}
          {chatMessages.length > 0 && (
            <div className="space-chat-input-panel">
              <div className="space-chat-input-wrapper">
                <textarea
                  className="space-chat-input"
                  placeholder="Ask anything..."
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
                  {isQuerying ? <Loader2 size={14} className="spinner" /> : <Send size={14} />}
                </button>
              </div>
              
              <div className="space-chat-footer-info">
                Spaces chat can make mistakes. Verify key details.
              </div>

              {!isAIConfigured() && (
                <div className="space-chat-no-ai-warning">
                  Configure an API key in AI Settings to enable chat queries over vector layers.
                </div>
              )}
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
