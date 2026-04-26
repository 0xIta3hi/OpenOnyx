import { openDB, DBSchema, IDBPDatabase } from 'idb';

// We define local types instead of importing from database.types to keep
// the local layer decoupled. These match the Supabase schema but the local
// store may contain extra fields like `visibility`.

export interface LocalSpace {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  helps_with: string[] | null;
  is_public: boolean;
  visibility: 'local' | 'private' | 'public';
  forked_from: string | null;
  created_at: string;
  updated_at: string;
}

export interface LocalNote {
  id: string;
  space_id: string;
  title: string;
  content: string;
  pinned: boolean;
  updated_at: string;
}

export interface LocalNoteChunk {
  id: string;
  note_id: string;
  content: string;
  embedding: any;
  created_at: string;
}

export interface SyncQueueItem {
  id: string;
  type: 'space' | 'note' | 'chunk';
  action: 'upsert' | 'delete';
  payload: any;
  timestamp: number;
}

interface NoteworkDB extends DBSchema {
  spaces: {
    key: string;
    value: LocalSpace;
    indexes: { 'by-owner': string; 'by-visibility': string };
  };
  notes: {
    key: string;
    value: LocalNote;
    indexes: { 'by-space': string; 'by-updated': string };
  };
  note_chunks: {
    key: string;
    value: LocalNoteChunk;
    indexes: { 'by-note': string };
  };
  sync_queue: {
    key: string;
    value: SyncQueueItem;
    indexes: { 'by-timestamp': number };
  };
  metadata: {
    key: string;
    value: any;
  };
}

let dbPromise: Promise<IDBPDatabase<NoteworkDB>>;

export function getLocalDB() {
  if (!dbPromise) {
    dbPromise = openDB<NoteworkDB>('notework-local', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const spaceStore = db.createObjectStore('spaces', { keyPath: 'id' });
          spaceStore.createIndex('by-owner', 'owner_id');

          const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
          noteStore.createIndex('by-space', 'space_id');
          noteStore.createIndex('by-updated', 'updated_at');

          const chunkStore = db.createObjectStore('note_chunks', { keyPath: 'id' });
          chunkStore.createIndex('by-note', 'note_id');

          const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
          syncStore.createIndex('by-timestamp', 'timestamp');

          db.createObjectStore('metadata');
        }
        if (oldVersion < 2) {
          // Add visibility index if upgrading from v1
          if (db.objectStoreNames.contains('spaces')) {
            const tx = (db as any).transaction?.('spaces', 'readwrite');
            if (tx) {
              const store = tx.objectStore('spaces');
              if (!store.indexNames.contains('by-visibility')) {
                store.createIndex('by-visibility', 'visibility');
              }
            }
          }
        }
      },
    });
  }
  return dbPromise;
}

export const localDB = {
  // ── Spaces ──────────────────────────────────────────────

  async getSpaces(): Promise<LocalSpace[]> {
    const db = await getLocalDB();
    return db.getAll('spaces');
  },

  async getSpacesByVisibility(visibility: 'local' | 'private' | 'public'): Promise<LocalSpace[]> {
    const all = await this.getSpaces();
    return all.filter(s => s.visibility === visibility);
  },

  async getSpace(id: string): Promise<LocalSpace | undefined> {
    const db = await getLocalDB();
    return db.get('spaces', id);
  },

  async putSpace(space: LocalSpace, enqueueSync = true): Promise<void> {
    const db = await getLocalDB();
    // Ensure visibility defaults
    if (!space.visibility) {
      space.visibility = space.is_public ? 'public' : 'local';
    }
    await db.put('spaces', space);
    if (enqueueSync && space.visibility !== 'local') {
      await db.put('sync_queue', {
        id: `space_upsert_${space.id}`,
        type: 'space',
        action: 'upsert',
        payload: space,
        timestamp: Date.now()
      });
    }
  },

  async deleteSpace(id: string, enqueueSync = true): Promise<void> {
    const db = await getLocalDB();
    const space = await db.get('spaces', id);
    await db.delete('spaces', id);
    if (enqueueSync && space && space.visibility !== 'local') {
      await db.put('sync_queue', {
        id: `space_delete_${id}`,
        type: 'space',
        action: 'delete',
        payload: { id },
        timestamp: Date.now()
      });
    }
  },

  // ── Notes ───────────────────────────────────────────────

  async getNotes(spaceId: string): Promise<LocalNote[]> {
    const db = await getLocalDB();
    return db.getAllFromIndex('notes', 'by-space', spaceId);
  },

  async getNote(id: string): Promise<LocalNote | undefined> {
    const db = await getLocalDB();
    return db.get('notes', id);
  },

  async putNote(note: LocalNote, enqueueSync = true): Promise<void> {
    const db = await getLocalDB();
    await db.put('notes', note);
    if (enqueueSync) {
      await db.put('sync_queue', {
        id: `note_upsert_${note.id}`,
        type: 'note',
        action: 'upsert',
        payload: note,
        timestamp: Date.now()
      });
    }
  },

  async deleteNote(id: string, enqueueSync = true): Promise<void> {
    const db = await getLocalDB();
    await db.delete('notes', id);
    if (enqueueSync) {
      await db.put('sync_queue', {
        id: `note_delete_${id}`,
        type: 'note',
        action: 'delete',
        payload: { id },
        timestamp: Date.now()
      });
    }
  },

  // ── Chunks ──────────────────────────────────────────────

  async getChunks(noteId: string): Promise<LocalNoteChunk[]> {
    const db = await getLocalDB();
    return db.getAllFromIndex('note_chunks', 'by-note', noteId);
  },

  async putChunk(chunk: LocalNoteChunk, enqueueSync = true): Promise<void> {
    const db = await getLocalDB();
    await db.put('note_chunks', chunk);
    if (enqueueSync) {
      await db.put('sync_queue', {
        id: `chunk_upsert_${chunk.id}`,
        type: 'chunk',
        action: 'upsert',
        payload: chunk,
        timestamp: Date.now()
      });
    }
  },

  async deleteChunksByNote(noteId: string): Promise<void> {
    const db = await getLocalDB();
    const chunks = await db.getAllFromIndex('note_chunks', 'by-note', noteId);
    for (const chunk of chunks) {
      await db.delete('note_chunks', chunk.id);
    }
  },

  // ── Metadata & Sync State ──────────────────────────────

  async setLastSyncTime(time: string): Promise<void> {
    const db = await getLocalDB();
    await db.put('metadata', time, 'last_sync_time');
  },

  async getLastSyncTime(): Promise<string | undefined> {
    const db = await getLocalDB();
    return db.get('metadata', 'last_sync_time') as Promise<string | undefined>;
  },

  async setMeta(key: string, value: any): Promise<void> {
    const db = await getLocalDB();
    await db.put('metadata', value, key);
  },

  async getMeta(key: string): Promise<any> {
    const db = await getLocalDB();
    return db.get('metadata', key);
  },

  // ── Sync Queue ─────────────────────────────────────────

  async getSyncQueue(): Promise<SyncQueueItem[]> {
    const db = await getLocalDB();
    return db.getAllFromIndex('sync_queue', 'by-timestamp');
  },

  async removeSyncItem(id: string): Promise<void> {
    const db = await getLocalDB();
    await db.delete('sync_queue', id);
  },

  async clearSyncQueue(): Promise<void> {
    const db = await getLocalDB();
    await db.clear('sync_queue');
  },
};
