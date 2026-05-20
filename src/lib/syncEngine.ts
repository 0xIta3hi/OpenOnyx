import { supabase } from './supabase';
import { localDB, type LocalNote, type SyncQueueItem } from './localdb';
import { authManager } from './auth';
import { getUserSupabaseClient } from './userDatabase';
import { collaborationEngine } from './collaborationEngine';
import { getAPI } from '../utils/api';

/**
 * Get the active Supabase client -- either the user's own instance
 * or the default OpenObsidian instance.
 */
function getActiveClient() {
  return getUserSupabaseClient() || supabase;
}

function toLocalNote(note: any): LocalNote {
  return {
    id: note.id,
    space_id: note.space_id,
    vault_id: note.vault_id || null,
    last_client_id: note.last_client_id || null,
    title: note.title,
    path: note.path || '',
    content: note.content || '',
    pinned: !!note.pinned,
    created_at: note.created_at,
    updated_at: note.updated_at,
    deleted: !!note.deleted,
    is_canvas: !!note.is_canvas,
  };
}

/**
 * SyncEngine manages local-first data synchronization with Supabase.
 *
 * Responsibilities:
 * - Push: read sync_queue, batch upsert/soft-delete to Supabase
 * - Pull: delta-fetch by updated_at, LWW merge into IndexedDB + filesystem
 *
 * Realtime is owned by CollaborationEngine (not duplicated here).
 * Presence is handled by Supabase Realtime Presence (not DB polling).
 */
export class SyncEngine {
  private isSyncing = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private pushDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<(status: SyncStatus) => void> = new Set();
  private authUnsubscribe: (() => void) | null = null;

  private activeSpaceId: string | null = null;
  private activeVaultPath: string | null = null;
  private clientId: string = '';

  constructor() {
    this.init();
  }

  private async init() {
    this.clientId = await localDB.getClientId();
    this.startAutoSync();
  }

  /**
   * Set the active vault and resolve its corresponding cloud space.
   * Called by App.tsx when a vault is opened/switched.
   */
  public async setActiveVault(vaultPath: string | null) {
    this.activeVaultPath = vaultPath;

    if (vaultPath) {
      try {
        const space = await collaborationEngine.getSpaceForVault(vaultPath);
        this.activeSpaceId = space?.id || null;
      } catch {
        this.activeSpaceId = null;
      }
    } else {
      this.activeSpaceId = null;
    }

    // If there's an active space, do an initial pull
    if (this.activeSpaceId) {
      this.sync();
    }
  }

  private startAutoSync() {
    // Periodic pull as a fallback (realtime handles the fast path)
    this.syncInterval = setInterval(() => {
      if (this.activeSpaceId) {
        this.pullChanges();
      }
    }, 30000); // 30s interval

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        if (this.activeSpaceId) this.pullChanges();
      });
      window.addEventListener('online', () => {
        if (this.activeSpaceId) this.sync();
      });
    }

    this.authUnsubscribe = authManager.subscribe((state) => {
      if (state.user && !state.isLoading && this.activeSpaceId) {
        this.sync();
      }
    });
  }

  /**
   * Trigger a debounced push. Called by App.tsx when the user edits a note.
   */
  public triggerPush() {
    // Don't push during bootstrap
    if (collaborationEngine.status.state === 'bootstrapping') return;
    if (!this.activeSpaceId) return;

    if (this.pushDebounceTimeout) clearTimeout(this.pushDebounceTimeout);
    this.pushDebounceTimeout = setTimeout(() => {
      this.pushChanges();
    }, 500);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyStatus(status: SyncStatus) {
    this.listeners.forEach(fn => fn(status));
  }

  async sync(): Promise<{ pushed: number; pulled: number }> {
    if (this.isSyncing) return { pushed: 0, pulled: 0 };
    if (!authManager.isLoggedIn()) return { pushed: 0, pulled: 0 };
    if (collaborationEngine.status.state === 'bootstrapping') return { pushed: 0, pulled: 0 };

    this.isSyncing = true;
    this.notifyStatus({ state: 'syncing' });

    let pushed = 0;
    let pulled = 0;

    try {
      pushed = await this.pushChanges();
      pulled = await this.pullChanges();
      this.notifyStatus({
        state: 'idle',
        lastSync: new Date().toISOString(),
        pushed,
        pulled,
      });
    } catch (err) {
      console.error('[SyncEngine] Sync failed:', err);
      this.notifyStatus({ state: 'error', error: String(err) });
    } finally {
      this.isSyncing = false;
    }

    return { pushed, pulled };
  }

  // ── Push (Local -> Cloud) ──────────────────────────────────────────────────

  public async pushChanges(): Promise<number> {
    if (collaborationEngine.status.state === 'bootstrapping') return 0;
    if (!this.activeSpaceId) return 0;

    const client = getActiveClient();
    const queue = await localDB.getSyncQueue();
    if (queue.length === 0) return 0;

    let count = 0;

    // Group by table:operation for batching
    const batches: Record<string, SyncQueueItem[]> = {};
    for (const item of queue) {
      const key = `${item.table}:${item.operation}`;
      if (!batches[key]) batches[key] = [];
      batches[key].push(item);
    }

    for (const [key, items] of Object.entries(batches)) {
      const [table, op] = key.split(':');

      // Only sync notes and note_chunks for collaboration
      if (table !== 'notes' && table !== 'note_chunks') continue;

      const payloads = items.map(item => {
        const payload = { ...item.payload };
        payload.last_client_id = this.clientId;
        // Ensure space_id is set
        if (this.activeSpaceId && !payload.space_id) {
          payload.space_id = this.activeSpaceId;
        }
        return payload;
      });

      try {
        if (op === 'insert' || op === 'update') {
          const { error } = await client.from(table as any).upsert(payloads);
          if (error) throw error;
        } else if (op === 'delete') {
          // Soft-delete: upsert with deleted=true
          const { error } = await client.from(table as any).upsert(payloads);
          if (error) throw error;
        }
        count += payloads.length;

        // Remove successfully pushed items from queue
        for (const item of items) {
          await localDB.removeSyncItem(item.id);
        }
      } catch (err) {
        console.error(`[SyncEngine] Push failed for ${table}:`, err);
        // Increment retry count, drop after 3 failures
        for (const item of items) {
          if (item.retry_count >= 3) {
            console.warn(`[SyncEngine] Dropping item after 3 retries: ${item.id}`);
            await localDB.removeSyncItem(item.id);
          } else {
            await localDB.putSyncItem({ ...item, retry_count: item.retry_count + 1 });
          }
        }
      }
    }

    return count;
  }

  // ── Pull (Cloud -> Local) ──────────────────────────────────────────────────

  public async pullChanges(): Promise<number> {
    if (!this.activeSpaceId) return 0;
    if (!authManager.isLoggedIn()) return 0;

    const client = getActiveClient();
    // Use a per-space sync time to avoid cross-space/cross-account issues
    const syncTimeKey = `lastSync_${this.activeSpaceId}`;
    const lastSync = await localDB.getMeta(syncTimeKey) || new Date(0).toISOString();
    let count = 0;

    const { data: notes, error } = await client
      .from('notes')
      .select('*')
      .eq('space_id', this.activeSpaceId)
      .gte('updated_at', lastSync);

    if (error) {
      // Empty message errors are usually RLS blocking during auth init -- skip noisy logging
      const msg = error.message || '';
      if (msg) {
        console.error('[SyncEngine] Pull failed:', msg);
      }
      return 0;
    }

    if (notes) {
      for (const remote of notes) {
        const local = await localDB.getNote(remote.id);

        // LWW: only apply if remote is newer
        if (local) {
          const remoteTime = new Date(remote.updated_at).getTime();
          const localTime = new Date(local.updated_at).getTime();
          if (remoteTime <= localTime) continue;
        }

        // Apply to IndexedDB (no sync enqueue -- this came from remote)
        await localDB.putNote(toLocalNote(remote), false);

        // Write to filesystem
        if (remote.path && !remote.deleted) {
          try {
            const api = getAPI();
            if (remote.path.includes('/')) {
              const parentDir = remote.path.split('/').slice(0, -1).join('/');
              try { await api.createDirectory(parentDir); } catch { /* exists */ }
            }
            await api.writeFile(remote.path, remote.content || '');
          } catch (err) {
            console.error('[SyncEngine] Failed to write pulled file:', err);
          }
        }

        count++;
      }
    }

    await localDB.setMeta(syncTimeKey, new Date().toISOString());
    return count;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  dispose() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    if (this.pushDebounceTimeout) clearTimeout(this.pushDebounceTimeout);
    if (this.authUnsubscribe) this.authUnsubscribe();
  }
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'error';
  lastSync?: string;
  pushed?: number;
  pulled?: number;
  error?: string;
}

export const syncEngine = new SyncEngine();
