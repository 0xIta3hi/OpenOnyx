import { supabase } from './supabase';
import { localDB, type LocalSpace, type LocalNote, type SyncQueueItem } from './localdb';
import { authManager } from './auth';
import { getUserSupabaseClient } from './userDatabase';

/**
 * Get the active Supabase client -- either the user's own instance
 * or the default OpenObsidian instance.
 */
function getActiveClient() {
  return getUserSupabaseClient() || supabase;
}

function toLocalSpace(
  space: {
    visibility: string | null;
    is_public: boolean;
  } & Record<string, any>
): LocalSpace {
  const visibility =
    space.visibility === 'local' || space.visibility === 'public' || space.visibility === 'private'
      ? space.visibility
      : (space.is_public ? 'public' : 'private');

  return {
    ...space,
    visibility,
  } as LocalSpace;
}

function toLocalNote(note: any): LocalNote {
  return {
    id: note.id,
    space_id: note.space_id,
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
 * DESIGN:
 * - Only sync spaces where visibility !== 'local'
 * - Local spaces remain fully offline
 * - Sync only happens when user is logged in
 * - Push: queued local changes -> Supabase
 * - Pull: remote changes since last sync -> local
 * - Conflict resolution: Last-Write-Wins (based on updated_at)
 * - Soft-delete: notes are marked deleted=true, not physically removed
 * - Supports user-owned Supabase instances via getUserSupabaseClient()
 */
export class SyncEngine {
  private isSyncing = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<(status: SyncStatus) => void> = new Set();
  private authUnsubscribe: (() => void) | null = null;

  constructor() {
    this.startAutoSync();
  }

  private startAutoSync() {
    // Auto-sync every 30 seconds
    this.syncInterval = setInterval(() => {
      this.sync();
    }, 30000);

    // Also sync on window focus
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        this.sync();
      });
    }

    // Trigger sync on login
    this.authUnsubscribe = authManager.subscribe((state) => {
      if (state.user && !state.isLoading) {
        this.sync();
      }
    });
    
    // Initial sync on startup
    setTimeout(() => {
      this.sync();
    }, 1000);
  }

  /**
   * Subscribe to sync status changes.
   */
  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyStatus(status: SyncStatus) {
    this.listeners.forEach(fn => fn(status));
  }

  /**
   * Run a full sync cycle: push local changes, then pull remote changes.
   */
  async sync(): Promise<{ pushed: number; pulled: number }> {
    if (this.isSyncing) return { pushed: 0, pulled: 0 };
    if (!authManager.isLoggedIn()) return { pushed: 0, pulled: 0 };
    if (typeof window !== 'undefined' && !navigator.onLine) return { pushed: 0, pulled: 0 };

    this.isSyncing = true;
    this.notifyStatus({ state: 'syncing' });

    let pushed = 0;
    let pulled = 0;
    try {
      await this.dedupeQueue();
      pushed = await this.pushChanges();
      pulled = await this.pullChanges();
      this.notifyStatus({ state: 'idle', lastSync: new Date().toISOString(), pushed, pulled });
    } catch (err) {
      console.error('[SyncEngine] Sync failed:', err);
      this.notifyStatus({ state: 'error', error: String(err) });
    } finally {
      this.isSyncing = false;
    }
    return { pushed, pulled };
  }

  /**
   * Helper utility to dedupe the sync queue.
   * Note: Our enqueueChange automatically dedupes by overriding the ID,
   * but this method ensures no stale updates exist for deleted items.
   */
  private async dedupeQueue(): Promise<void> {
    const queue = await localDB.getSyncQueue();
    const toDelete = new Set<string>();

    // If an item is marked for delete, drop any prior inserts or updates for it
    const deletedIds = new Set(queue.filter(i => i.operation === 'delete').map(i => i.id));
    for (const item of queue) {
      if ((item.operation === 'insert' || item.operation === 'update') && deletedIds.has(item.id.replace(/_(insert|update)$/, '_delete'))) {
        toDelete.add(item.id);
      }
    }

    for (const id of toDelete) {
      await localDB.removeSyncItem(id);
    }
  }

  /**
   * Helper utility for Last-Write-Wins logic
   */
  private applyRemoteChanges(localRecord: any | undefined, remoteRecord: any): boolean {
    if (!localRecord) return true;
    return remoteRecord.updated_at >= localRecord.updated_at;
  }

  /**
   * Push local queue to Supabase.
   * Only pushes items for spaces with visibility !== 'local'.
   */
  private async pushChanges(): Promise<number> {
    const client = getActiveClient();
    const queue = await localDB.getSyncQueue();
    if (queue.length === 0) return 0;
    if (typeof window !== 'undefined' && !navigator.onLine) return 0;

    let count = 0;
    
    const itemsToDeleteFromQueue: string[] = [];
    const itemsToRetry: SyncQueueItem[] = [];

    const batches = {
      spaces: { insert: [] as SyncQueueItem[], update: [] as SyncQueueItem[], delete: [] as SyncQueueItem[] },
      notes: { insert: [] as SyncQueueItem[], update: [] as SyncQueueItem[], delete: [] as SyncQueueItem[] },
      note_chunks: { insert: [] as SyncQueueItem[], update: [] as SyncQueueItem[], delete: [] as SyncQueueItem[] }
    };

    for (const item of queue) {
      if (item.table === 'spaces' && item.payload.visibility === 'local') {
        itemsToDeleteFromQueue.push(item.id);
        continue;
      }
      
      if (item.table === 'notes' || item.table === 'note_chunks') {
        let spaceIdToCheck = item.payload.space_id;
        if (item.table === 'note_chunks' && item.payload.note_id) {
           const note = await localDB.getNote(item.payload.note_id);
           if (note) spaceIdToCheck = note.space_id;
        }
        if (spaceIdToCheck) {
           const space = await localDB.getSpace(spaceIdToCheck);
           if (space && space.visibility === 'local') {
             itemsToDeleteFromQueue.push(item.id);
             continue;
           }
        }
      }
      
      batches[item.table][item.operation].push(item);
    }

    const processBatch = async (table: 'spaces' | 'notes' | 'note_chunks', operation: 'insert' | 'update' | 'delete', items: SyncQueueItem[]) => {
      if (items.length === 0) return;
      
      try {
        if (operation === 'insert' || operation === 'update') {
          // Remove local-only properties before pushing to Supabase
          const payloads = items.map(i => {
            const p = { ...i.payload };
            if (table === 'spaces') {
              delete p.visibility; // Remove local visibility flag
            }
            return p;
          });
          const { error } = await client.from(table).upsert(payloads);
          if (error) throw error;
        } else if (operation === 'delete') {
          if (table === 'notes') {
            const payloads = items.map(i => i.payload);
            const { error } = await client.from(table).upsert(payloads);
            if (error) throw error;
          } else {
             const ids = items.map(i => i.record_id);
             const { error } = await client.from(table).delete().in('id', ids);
             if (error) throw error;
          }
        }
        
        items.forEach(i => itemsToDeleteFromQueue.push(i.id));
        count += items.length;
      } catch (err) {
        console.error(`[SyncEngine] Batch ${operation} failed for ${table}:`, err);
        for (const item of items) {
          if (item.retry_count < 3) {
            itemsToRetry.push({ ...item, retry_count: item.retry_count + 1 });
          } else {
            console.error(`[SyncEngine] Max retries reached for item ${item.id}, dropping.`);
            itemsToDeleteFromQueue.push(item.id);
          }
        }
      }
    };

    for (const table of ['spaces', 'notes', 'note_chunks'] as const) {
       await processBatch(table, 'insert', batches[table].insert);
       await processBatch(table, 'update', batches[table].update);
       await processBatch(table, 'delete', batches[table].delete);
    }
    
    // Process queue updates in parallel
    const queueUpdates: Promise<void>[] = [];
    for (const id of itemsToDeleteFromQueue) {
      queueUpdates.push(localDB.removeSyncItem(id));
    }
    for (const item of itemsToRetry) {
      queueUpdates.push(localDB.putSyncItem(item));
    }
    await Promise.all(queueUpdates);

    return count;
  }

  /**
   * Pull changes from Supabase since last sync time.
   * Only pulls spaces owned by the current user (private + public).
   * Uses Last-Write-Wins: remote updated_at > local updated_at = remote wins.
   */
  private async pullChanges(): Promise<number> {
    const client = getActiveClient();
    const user = authManager.getUser();
    if (!user) return 0;
    if (typeof window !== 'undefined' && !navigator.onLine) return 0;

    const lastSyncTime = await localDB.getLastSyncTime() || new Date(0).toISOString();
    const now = new Date().toISOString();
    let count = 0;

    // 1. Pull user's own spaces (private + public, NOT local since those aren't in DB)
    const { data: spaces, error: spaceErr } = await client
      .from('spaces')
      .select('*')
      .eq('owner_id', user.id)
      .gte('updated_at', lastSyncTime);
    if (spaceErr) throw spaceErr;

    if (spaces && spaces.length > 0) {
      for (const remoteSpace of spaces) {
        const localSpace = await localDB.getSpace(remoteSpace.id);

        if (this.applyRemoteChanges(localSpace, remoteSpace)) {
          await localDB.putSpace(toLocalSpace(remoteSpace), false);
          count++;
        }
      }
    }

    // 2. Pull notes scoped to user's spaces only
    const spaceIds = (spaces || []).map(s => s.id);

    // Also include spaces we already have locally (in case they weren't in the delta)
    const localSpaces = await localDB.getSpaces();
    const allSyncedSpaceIds = new Set([
      ...spaceIds,
      ...localSpaces
        .filter(s => s.visibility !== 'local')
        .map(s => s.id)
    ]);

    const syncSpaceIds = [...allSyncedSpaceIds];

    if (syncSpaceIds.length > 0) {
      const { data: notes, error: notesErr } = await client
        .from('notes')
        .select('*')
        .in('space_id', syncSpaceIds)
        .gte('updated_at', lastSyncTime);
      if (notesErr) throw notesErr;

      if (notes && notes.length > 0) {
        for (const remoteNote of notes) {
          const localNote = await localDB.getNote(remoteNote.id);

          // Handle soft-deletes from remote
          if (remoteNote.deleted) {
            if (localNote) {
              await localDB.deleteNote(remoteNote.id, false);
            }
            count++;
            continue;
          }

          if (this.applyRemoteChanges(localNote, remoteNote)) {
            await localDB.putNote(toLocalNote(remoteNote), false);
            count++;
          }
        }
      }

      // 3. Pull chunks scoped to synced notes
      const { data: chunks, error: chunkErr } = await client
        .from('note_chunks')
        .select('*')
        .in('note_id', notes?.map(n => n.id) || [])
        .gte('updated_at', lastSyncTime);
      if (chunkErr) throw chunkErr;

      if (chunks && chunks.length > 0) {
        await Promise.all(chunks.map(chunk => localDB.putChunk(chunk, false)));
        count += chunks.length;
      }
    }

    await localDB.setLastSyncTime(now);
    return count;
  }

  /**
   * Full sync: Pull ALL user data from cloud to rebuild local cache.
   * Used when logging in on a new device.
   */
  async fullSync(): Promise<number> {
    const client = getActiveClient();
    const user = authManager.getUser();
    if (!user) return 0;
    if (typeof window !== 'undefined' && !navigator.onLine) return 0;

    this.notifyStatus({ state: 'syncing' });
    let count = 0;

    try {
      // Pull all spaces
      const { data: spaces } = await client
        .from('spaces')
        .select('*')
        .eq('owner_id', user.id);

      if (spaces && spaces.length > 0) {
        await Promise.all(spaces.map(space => localDB.putSpace(toLocalSpace(space), false)));
        count += spaces.length;
      }

      // Pull all notes for those spaces (excluding deleted)
      const spaceIds = (spaces || []).map(s => s.id);
      if (spaceIds.length > 0) {
        const { data: notes } = await client
          .from('notes')
          .select('*')
          .in('space_id', spaceIds)
          .eq('deleted', false);

        if (notes && notes.length > 0) {
          await Promise.all(notes.map(note => localDB.putNote(toLocalNote(note), false)));
          count += notes.length;
        }

        // Pull chunks
        const noteIds = (notes || []).map(n => n.id);
        if (noteIds.length > 0) {
          const { data: chunks } = await client
            .from('note_chunks')
            .select('*')
            .in('note_id', noteIds);

          if (chunks && chunks.length > 0) {
            await Promise.all(chunks.map(chunk => localDB.putChunk(chunk, false)));
            count += chunks.length;
          }
        }
      }

      await localDB.setLastSyncTime(new Date().toISOString());
      this.notifyStatus({ state: 'idle', lastSync: new Date().toISOString(), pushed: 0, pulled: count });
    } catch (err) {
      console.error('[SyncEngine] Full sync failed:', err);
      this.notifyStatus({ state: 'error', error: String(err) });
    }

    return count;
  }

  /**
   * Promote local-only spaces to cloud by changing visibility.
   * Called when user confirms "sync local spaces to cloud".
   */
  async promoteLocalSpacesToCloud(): Promise<number> {
    const user = authManager.getUser();
    if (!user) return 0;

    const allSpaces = await localDB.getSpaces();
    const localSpaces = allSpaces.filter((s: any) => s.visibility === 'local' || !s.visibility);
    let count = 0;

    if (localSpaces.length > 0) {
      await Promise.all(localSpaces.map(space => {
        const updated = {
          ...space,
          visibility: 'private',
          owner_id: user.id,
          updated_at: new Date().toISOString(),
        };
        return localDB.putSpace(updated as any, true);
      }));
      count += localSpaces.length;
    }

    // Trigger immediate sync
    await this.sync();
    return count;
  }

  /**
   * Force-push a single space and all its notes to cloud.
   * Used when publishing a space.
   */
  async pushSpace(spaceId: string): Promise<void> {
    const client = getActiveClient();
    const space = await localDB.getSpace(spaceId);
    if (!space || space.visibility === 'local') return;

    const payload = { ...space };
    delete (payload as any).visibility;

    // Push space
    const { error: spaceErr } = await client.from('spaces').upsert(payload as any);
    if (spaceErr) throw spaceErr;

    // Push all notes
    const notes = await localDB.getNotes(spaceId);
    if (notes.length > 0) {
      const { error: notesErr } = await client.from('notes').upsert(notes as any);
      if (notesErr) throw notesErr;
    }

    // Push all chunks for those notes
    for (const note of notes) {
      const chunks = await localDB.getChunks(note.id);
      if (chunks.length > 0) {
        const { error: chunkErr } = await client.from('note_chunks').upsert(chunks as any);
        if (chunkErr) throw chunkErr;
      }
    }
  }

  dispose() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    if (this.authUnsubscribe) {
      this.authUnsubscribe();
    }
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'error';
  lastSync?: string;
  pushed?: number;
  pulled?: number;
  error?: string;
}

export const syncEngine = new SyncEngine();
