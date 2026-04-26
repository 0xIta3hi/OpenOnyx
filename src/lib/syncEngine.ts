import { supabase } from './supabase';
import { localDB, type LocalSpace } from './localdb';
import { authManager } from './auth';

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
 * UPDATED RULES:
 * - Only sync spaces where visibility !== 'local'
 * - Local spaces remain fully offline
 * - Sync only happens when user is logged in
 * - Push: queued local changes → Supabase
 * - Pull: remote changes since last sync → local
 */
export class SyncEngine {
  private isSyncing = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

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

  async sync(): Promise<{ pushed: number; pulled: number }> {
    if (this.isSyncing) return { pushed: 0, pulled: 0 };
    if (!authManager.isLoggedIn()) return { pushed: 0, pulled: 0 };

    this.isSyncing = true;
    let pushed = 0;
    let pulled = 0;
    try {
      pushed = await this.pushChanges();
      pulled = await this.pullChanges();
    } catch (err) {
      console.error('[SyncEngine] Sync failed:', err);
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
            const { error } = await supabase.from('spaces').upsert(payload);
            if (error) throw error;
          } else if (type === 'note') {
            const { error } = await supabase.from('notes').upsert(payload);
            if (error) throw error;
          } else if (type === 'chunk') {
            const { error } = await supabase.from('note_chunks').upsert(payload);
            if (error) throw error;
          }
        } else if (action === 'delete') {
          if (type === 'space') {
            const { error } = await supabase.from('spaces').delete().eq('id', payload.id);
            if (error) throw error;
          } else if (type === 'note') {
            const { error } = await supabase.from('notes').delete().eq('id', payload.id);
            if (error) throw error;
          } else if (type === 'chunk') {
            const { error } = await supabase.from('note_chunks').delete().eq('id', payload.id);
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
   */
  private async pullChanges(): Promise<number> {
    const user = authManager.getUser();
    if (!user) return 0;

    const lastSyncTime = await localDB.getLastSyncTime() || new Date(0).toISOString();
    const now = new Date().toISOString();
    let count = 0;

    // 1. Pull user's own spaces (private + public, NOT local since those aren't in DB)
    const { data: spaces, error: spaceErr } = await supabase
      .from('spaces')
      .select('*')
      .eq('owner_id', user.id)
      .gte('updated_at', lastSyncTime);
    if (spaceErr) throw spaceErr;

    for (const space of (spaces || [])) {
      await localDB.putSpace(toLocalSpace(space), false);
      count++;
    }

    // 2. Pull notes for user's spaces
    const { data: notes, error: notesErr } = await supabase
      .from('notes')
      .select('*')
      .gte('updated_at', lastSyncTime);
    if (notesErr) throw notesErr;

    for (const note of (notes || [])) {
      await localDB.putNote(note, false);
      count++;
    }

    // 3. Pull chunks
    const { data: chunks, error: chunkErr } = await supabase
      .from('note_chunks')
      .select('*')
      .gte('created_at', lastSyncTime);
    if (chunkErr) throw chunkErr;

    for (const chunk of (chunks || [])) {
      await localDB.putChunk(chunk, false);
      count++;
    }

    await localDB.setLastSyncTime(now);
    return count;
  }

  /**
   * Full sync: Pull ALL user data from cloud to rebuild local cache.
   * Used when logging in on a new device.
   */
  async fullSync(): Promise<number> {
    const user = authManager.getUser();
    if (!user) return 0;

    let count = 0;

    // Pull all spaces
    const { data: spaces } = await supabase
      .from('spaces')
      .select('*')
      .eq('owner_id', user.id);

    for (const space of (spaces || [])) {
      await localDB.putSpace(toLocalSpace(space), false);
      count++;
    }

    // Pull all notes for those spaces
    const spaceIds = (spaces || []).map(s => s.id);
    if (spaceIds.length > 0) {
      const { data: notes } = await supabase
        .from('notes')
        .select('*')
        .in('space_id', spaceIds);

      for (const note of (notes || [])) {
        await localDB.putNote(note, false);
        count++;
      }

      // Pull chunks
      const noteIds = (notes || []).map(n => n.id);
      if (noteIds.length > 0) {
        const { data: chunks } = await supabase
          .from('note_chunks')
          .select('*')
          .in('note_id', noteIds);

        for (const chunk of (chunks || [])) {
          await localDB.putChunk(chunk, false);
          count++;
        }
      }
    }

    await localDB.setLastSyncTime(new Date().toISOString());
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

    for (const space of localSpaces) {
      const updated = {
        ...space,
        visibility: 'private',
        owner_id: user.id,
        updated_at: new Date().toISOString(),
      };
      await localDB.putSpace(updated as any, true);
      count++;
    }

    // Trigger immediate sync
    await this.sync();
    return count;
  }

  dispose() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }
}

export const syncEngine = new SyncEngine();
