/**
 * YDocManager -- Manages the lifecycle of Yjs Y.Doc instances for open notes.
 *
 * Responsibilities:
 *   - Lazy Y.Doc creation when a note tab is opened
 *   - IndexedDB persistence via y-indexeddb
 *   - Filesystem initialization for new docs
 *   - SupabaseProvider connection for real-time sync
 *   - Y.UndoManager creation scoped to local edits
 *   - Cleanup when tabs are closed
 *
 * Instrumentation: Every event logs with [YJS] prefix for full observability.
 */

import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { Awareness } from 'y-protocols/awareness';
import { SupabaseProvider, type SupabaseProviderOptions } from './supabaseProvider';
import { localDB } from './localdb';
import { authManager } from './auth';
import { getAPI } from '../utils/api';
import { normalizeSyncPath } from './syncEngine';

// ── Types ───────────────────────────────────────────────────────────────────

export interface OpenDocResult {
  doc: Y.Doc;
  text: Y.Text;
  awareness: Awareness;
  undoManager: Y.UndoManager;
  provider: SupabaseProvider;
}

interface DocEntry {
  doc: Y.Doc;
  text: Y.Text;
  provider: SupabaseProvider;
  idbPersistence: IndexeddbPersistence;
  undoManager: Y.UndoManager;
  refCount: number;
}

// ── Color assignment for awareness ──────────────────────────────────────────

const AWARENESS_COLORS = [
  '#3b82f6', '#2563eb', '#059669', '#d97706', '#dc2626',
  '#0ea5e9', '#0891b2', '#65a30d', '#ea580c', '#e11d48',
];

function getColorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }
  return AWARENESS_COLORS[Math.abs(hash) % AWARENESS_COLORS.length];
}

// ── Manager ─────────────────────────────────────────────────────────────────

class YDocManagerImpl {
  private entries = new Map<string, DocEntry>();
  private clientId: string | null = null;

  /**
   * Open (or reuse) a Y.Doc for the given note path.
   *
   * If a doc is already open for this path, its reference count is incremented
   * and the same doc is returned. This supports split panes viewing the same note.
   */
  async openDoc(notePath: string, spaceId: string): Promise<OpenDocResult> {
    const cleanPath = normalizeSyncPath(notePath) || notePath;
    const key = `${spaceId}:${cleanPath}`;

    // Reuse existing doc if already open (split panes)
    const existing = this.entries.get(key);
    if (existing) {
      existing.refCount++;
      console.log(`[YJS] Reused document for note: ${cleanPath} (refCount: ${existing.refCount})`);
      return {
        doc: existing.doc,
        text: existing.text,
        awareness: existing.provider.awareness,
        undoManager: existing.undoManager,
        provider: existing.provider,
      };
    }

    // Ensure client ID is loaded
    if (!this.clientId) {
      this.clientId = await localDB.getClientId();
    }

    // Create a new Y.Doc
    const doc = new Y.Doc();
    const text = doc.getText('content');
    console.log(`[YJS] Created document for note: ${cleanPath}`);

    // 1. Restore from IndexedDB (offline state)
    const idbKey = `yjs-${spaceId}-${cleanPath.replace(/[/\\:]/g, '_')}`;
    const idbPersistence = new IndexeddbPersistence(idbKey, doc);
    await idbPersistence.whenSynced;
    console.log(`[YJS] Hydrated document from IndexedDB (${text.length} chars)`);

    // 2. If doc is empty after IndexedDB restore, initialize from local filesystem
    if (text.length === 0) {
      try {
        const api = getAPI();
        const fileContent = await api.readFile(cleanPath);
        if (fileContent && fileContent.length > 0) {
          doc.transact(() => {
            text.insert(0, fileContent);
          }, 'init');
          console.log(`[YJS] Hydrated document from filesystem (.md) (${fileContent.length} chars)`);
        }
      } catch {
        // File may not exist yet (new note)
      }
    }

    // 3. Resolve user info for awareness
    const user = authManager.getUser();
    const userId = authManager.getUserId() || 'anonymous';
    const userInfo: SupabaseProviderOptions['user'] = {
      id: userId,
      name: user?.email?.split('@')[0] || 'Anonymous',
      email: user?.email || '',
      color: getColorForUser(userId),
    };

    // 4. Create provider and connect
    const provider = new SupabaseProvider(doc, {
      spaceId,
      notePath: cleanPath,
      clientId: this.clientId,
      user: userInfo,
    });
    await provider.connect();

    // If the doc is still empty after IndexedDB + filesystem, request snapshot from peers
    if (text.length === 0) {
      provider.requestSnapshot();
    }

    // 5. Create undo manager scoped to local edits
    const undoManager = new Y.UndoManager(text, {
      trackedOrigins: new Set([null]),
      captureTimeout: 500,
    });

    const entry: DocEntry = {
      doc,
      text,
      provider,
      idbPersistence,
      undoManager,
      refCount: 1,
    };

    this.entries.set(key, entry);

    return {
      doc,
      text,
      awareness: provider.awareness,
      undoManager,
      provider,
    };
  }

  /**
   * Close a Y.Doc for the given note path.
   * Decrements reference count; actually destroys only when refCount reaches 0.
   */
  closeDoc(notePath: string, spaceId: string): void {
    const cleanPath = normalizeSyncPath(notePath) || notePath;
    const key = `${spaceId}:${cleanPath}`;

    const entry = this.entries.get(key);
    if (!entry) return;

    entry.refCount--;
    if (entry.refCount > 0) {
      console.log(`[YJS] Decremented refCount for note: ${cleanPath} (remaining: ${entry.refCount})`);
      return;
    }

    // Fully clean up
    console.log(`[YJS] Destroyed document for note: ${cleanPath}`);
    entry.provider.disconnect();
    entry.undoManager.destroy();
    entry.idbPersistence.destroy();
    entry.doc.destroy();
    this.entries.delete(key);
  }

  /**
   * Check if a doc is currently open for the given note path.
   */
  hasDoc(notePath: string, spaceId: string): boolean {
    const cleanPath = normalizeSyncPath(notePath) || notePath;
    const key = `${spaceId}:${cleanPath}`;
    return this.entries.has(key);
  }

  /**
   * Get an already-open doc entry. Returns undefined if not open.
   */
  getDoc(notePath: string, spaceId: string): OpenDocResult | undefined {
    const cleanPath = normalizeSyncPath(notePath) || notePath;
    const key = `${spaceId}:${cleanPath}`;
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    return {
      doc: entry.doc,
      text: entry.text,
      awareness: entry.provider.awareness,
      undoManager: entry.undoManager,
      provider: entry.provider,
    };
  }

  /**
   * Close all open docs. Call on vault switch or app unmount.
   */
  closeAll(): void {
    for (const [key, entry] of this.entries) {
      console.log(`[YJS] Destroying open document on closeAll: ${key}`);
      entry.provider.disconnect();
      entry.undoManager.destroy();
      entry.idbPersistence.destroy();
      entry.doc.destroy();
    }
    this.entries.clear();
  }

  /**
   * Get the number of currently open docs.
   */
  get openDocCount(): number {
    return this.entries.size;
  }
}

export const yDocManager = new YDocManagerImpl();
