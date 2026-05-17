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
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

export interface LocalNoteChunk {
  id: string;
  note_id: string;
  content: string;
  embedding: any;
  created_at: string;
  updated_at: string;
}

export interface SyncQueueItem {
  id: string;
  operation: 'insert' | 'update' | 'delete';
  table: 'spaces' | 'notes' | 'note_chunks';
  record_id: string;
  payload: any;
  created_at: number;
  retry_count: number;
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
    indexes: { 'by-created-at': number };
  };
  metadata: {
    key: string;
    value: any;
  };
}

let dbPromise: Promise<IDBPDatabase<NoteworkDB>>;

export function getLocalDB() {
  if (!dbPromise) {
    dbPromise = openDB<NoteworkDB>('notework-local', 3, {
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
          syncStore.createIndex('by-created-at', 'created_at');

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
        if (oldVersion < 3) {
          if (db.objectStoreNames.contains('sync_queue')) {
            db.deleteObjectStore('sync_queue');
          }
          const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
          syncStore.createIndex('by-created-at', 'created_at');
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
    const isExisting = await db.get('spaces', space.id);
    await db.put('spaces', space);
    if (enqueueSync && space.visibility !== 'local') {
      await this.enqueueChange('spaces', isExisting ? 'update' : 'insert', space.id, space);
    }
  },

  async deleteSpace(id: string, enqueueSync = true): Promise<void> {
    const db = await getLocalDB();
    const space = await db.get('spaces', id);
    await db.delete('spaces', id);
    if (enqueueSync && space && space.visibility !== 'local') {
      await this.enqueueChange('spaces', 'delete', id, { id });
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
    const isExisting = await db.get('notes', note.id);
    await db.put('notes', note);
    if (enqueueSync) {
      await this.enqueueChange('notes', isExisting ? 'update' : 'insert', note.id, note);
    }
  },

  async deleteNote(id: string, enqueueSync = true): Promise<void> {
    const db = await getLocalDB();
    const note = await db.get('notes', id);
    if (note) {
      // Soft delete: update the note's deleted flag instead of physical delete
      note.deleted = true;
      note.updated_at = new Date().toISOString();
      await db.put('notes', note);
      
      if (enqueueSync) {
        await this.enqueueChange('notes', 'delete', id, note);
      }
    }
  },

  // ── Chunks ──────────────────────────────────────────────

  async getChunks(noteId: string): Promise<LocalNoteChunk[]> {
    const db = await getLocalDB();
    return db.getAllFromIndex('note_chunks', 'by-note', noteId);
  },

  async putChunk(chunk: LocalNoteChunk, enqueueSync = true): Promise<void> {
    const db = await getLocalDB();
    const isExisting = await db.get('note_chunks', chunk.id);
    await db.put('note_chunks', chunk);
    if (enqueueSync) {
      await this.enqueueChange('note_chunks', isExisting ? 'update' : 'insert', chunk.id, chunk);
    }
  },

  async deleteChunksByNote(noteId: string): Promise<void> {
    const db = await getLocalDB();
    const chunks = await db.getAllFromIndex('note_chunks', 'by-note', noteId);
    for (const chunk of chunks) {
      await db.delete('note_chunks', chunk.id);
      // We'll queue the delete as well
      await this.enqueueChange('note_chunks', 'delete', chunk.id, { id: chunk.id });
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

  async enqueueChange(table: 'spaces' | 'notes' | 'note_chunks', operation: 'insert' | 'update' | 'delete', record_id: string, payload: any): Promise<void> {
    const db = await getLocalDB();
    await db.put('sync_queue', {
      id: `${table}_${record_id}`,
      operation,
      table,
      record_id,
      payload,
      created_at: Date.now(),
      retry_count: 0
    });
  },

  async getSyncQueue(): Promise<SyncQueueItem[]> {
    const db = await getLocalDB();
    return db.getAllFromIndex('sync_queue', 'by-created-at');
  },

  async putSyncItem(item: SyncQueueItem): Promise<void> {
    const db = await getLocalDB();
    await db.put('sync_queue', item);
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
