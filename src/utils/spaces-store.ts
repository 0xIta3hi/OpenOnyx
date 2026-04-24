/**
 * Spaces Store — CRUD for knowledge spaces
 *
 * A Space is a metadata layer over the vault — it doesn't store notes.
 * Notes live in the vault. The Space stores:
 *   - metadata (title, description, helpsWith, noteCount)
 *   - vector index (for RAG queries)
 *
 * Storage layout (.openobsidian/spaces/):
 *   ├── _index.json          — lightweight listing of all spaces
 *   ├── {space-id}.json      — space metadata
 *   └── {space-id}/
 *       └── vectors.json     — vector index for RAG
 */

import { readData, writeData, deleteData, createDebouncedWriter } from "./disk-store";
import type {
  Space,
  SpaceIndexEntry,
  SpaceVectorIndex,
} from "../types/spaces";

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `space-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toIndexEntry(space: Space): SpaceIndexEntry {
  return {
    id: space.id,
    title: space.title,
    description: space.description,
    helpsWith: space.helpsWith || [],
    noteCount: space.noteCount || 0,
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
  };
}

// ── In-memory cache ──────────────────────────────────────────────────────────

let _indexCache: SpaceIndexEntry[] | null = null;
const _spaceCache = new Map<string, Space>();
const _debouncedWrite = createDebouncedWriter(800);

// ── Index operations ─────────────────────────────────────────────────────────

async function loadIndex(): Promise<SpaceIndexEntry[]> {
  if (_indexCache) return _indexCache;
  const data = await readData<SpaceIndexEntry[]>("spaces/_index.json");
  _indexCache = (data || []).map(entry => ({
    ...entry,
    helpsWith: entry.helpsWith || [],
  }));
  return _indexCache;
}

async function saveIndex(entries: SpaceIndexEntry[]): Promise<void> {
  _indexCache = entries;
  await writeData("spaces/_index.json", entries);
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function listSpaces(): Promise<SpaceIndexEntry[]> {
  return loadIndex();
}

export async function getSpace(id: string): Promise<Space | null> {
  const cached = _spaceCache.get(id);
  if (cached) return cached;

  const space = await readData<Space>(`spaces/${id}.json`);
  if (space) {
    // Ensure arrays exist (migration safety)
    if (!space.helpsWith) space.helpsWith = [];
    _spaceCache.set(id, space);
  }
  return space;
}

export async function createSpace(data: {
  title: string;
  description: string;
  helpsWith: string[];
  noteCount?: number;
}): Promise<Space> {
  const now = new Date().toISOString();
  const space: Space = {
    id: generateId(),
    title: data.title,
    description: data.description,
    helpsWith: data.helpsWith,
    noteCount: data.noteCount || 0,
    createdAt: now,
    updatedAt: now,
  };

  await writeData(`spaces/${space.id}.json`, space);
  _spaceCache.set(space.id, space);

  const index = await loadIndex();
  index.push(toIndexEntry(space));
  await saveIndex(index);

  return space;
}

export async function updateSpace(
  id: string,
  patch: Partial<Omit<Space, "id" | "createdAt">>,
): Promise<Space | null> {
  const space = await getSpace(id);
  if (!space) return null;

  const updated: Space = {
    ...space,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await writeData(`spaces/${id}.json`, updated);
  _spaceCache.set(id, updated);

  const index = await loadIndex();
  const idx = index.findIndex((e) => e.id === id);
  if (idx >= 0) {
    index[idx] = toIndexEntry(updated);
  } else {
    index.push(toIndexEntry(updated));
  }
  await saveIndex(index);

  return updated;
}

export async function deleteSpace(id: string): Promise<void> {
  await deleteData(`spaces/${id}.json`);
  await deleteData(`spaces/${id}/vectors.json`);
  _spaceCache.delete(id);

  const index = await loadIndex();
  const filtered = index.filter((e) => e.id !== id);
  await saveIndex(filtered);
}

// ── Fork / Remix ─────────────────────────────────────────────────────────────

/**
 * Fork a space — creates a copy of the metadata with a new ID.
 * The vector index is NOT copied — it will be rebuilt on open.
 */
export async function forkSpace(
  sourceId: string,
  overrides?: { title?: string; description?: string },
): Promise<Space | null> {
  const source = await getSpace(sourceId);
  if (!source) return null;

  return createSpace({
    title: overrides?.title || `${source.title} (Remix)`,
    description: overrides?.description || source.description,
    helpsWith: [...(source.helpsWith || [])],
    noteCount: source.noteCount,
  });
}

// ── Vector Index ─────────────────────────────────────────────────────────────

export async function loadVectorIndex(
  spaceId: string,
): Promise<SpaceVectorIndex | null> {
  return readData<SpaceVectorIndex>(`spaces/${spaceId}/vectors.json`);
}

export async function saveVectorIndex(index: SpaceVectorIndex): Promise<void> {
  _debouncedWrite(`spaces/${index.spaceId}/vectors.json`, index);
}

export function clearCache(): void {
  _indexCache = null;
  _spaceCache.clear();
}
