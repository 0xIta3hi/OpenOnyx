import { supabase } from './supabase';
import { localDB, type LocalSpace } from './localdb';
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

    this.isSyncing = true;
    this.notifyStatus({ state: 'syncing' });

    let pushed = 0;
    let pulled = 0;
    try {
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
   * Push local queue to Supabase.
   * Only pushes items for spaces with visibility !== 'local'.
   */
  private async pushChanges(): Promise<number> {
    const client = getActiveClient();
    const queue = await localDB.getSyncQueue();
    if (queue.length === 0) return 0;

    let count = 0;

    for (const item of queue) {
      try {
        const { type, action, payload } = item;

        // Skip syncing local-only spaces and their children
        if (type === 'space' && payload.visibility === 'local') {
          await localDB.removeSyncItem(item.id);
          continue;
        }

        if (type === 'note' || type === 'chunk') {
          // Check if the parent space is local-only
          const spaceId = payload.space_id || (type === 'chunk' ? null : null);
          if (spaceId) {
            const space = await localDB.getSpace(spaceId);
            if (space && space.visibility === 'local') {
              await localDB.removeSyncItem(item.id);
              continue;
            }
          }
        }

        if (action === 'upsert') {
          if (type === 'space') {
            const { error } = await client.from('spaces').upsert(payload);
            if (error) throw error;
          } else if (type === 'note') {
            const { error } = await client.from('notes').upsert(payload);
            if (error) throw error;
          } else if (type === 'chunk') {
            const { error } = await client.from('note_chunks').upsert(payload);
            if (error) throw error;
          }
        } else if (action === 'delete') {
          if (type === 'space') {
            const { error } = await client.from('spaces').delete().eq('id', payload.id);
            if (error) throw error;
          } else if (type === 'note') {
            // Soft-delete: mark as deleted rather than physically removing
            const { error } = await client.from('notes').update({
              deleted: true,
              updated_at: new Date().toISOString(),
            }).eq('id', payload.id);
            if (error) throw error;
          } else if (type === 'chunk') {
            const { error } = await client.from('note_chunks').delete().eq('id', payload.id);
            if (error) throw error;
          }
        }

        await localDB.removeSyncItem(item.id);
        count++;
      } catch (err) {
        console.error(`[SyncEngine] Failed to sync item ${item.id}`, err);
        // Leave in queue for retry
      }
    }

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

        // Last-Write-Wins: only overwrite if remote is newer or local doesn't exist
        if (!localSpace || remoteSpace.updated_at >= localSpace.updated_at) {
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

          // Last-Write-Wins
          if (!localNote || remoteNote.updated_at >= localNote.updated_at) {
            await localDB.putNote(remoteNote, false);
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
          await Promise.all(notes.map(note => localDB.putNote(note, false)));
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

    // Push space
    const { error: spaceErr } = await client.from('spaces').upsert(space as any);
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
