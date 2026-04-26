/**
 * Spaces Store — CRUD for knowledge spaces
 *
 * A Space is a metadata layer over the vault — it doesn't store notes.
 * Notes live in the vault. The Space stores:
 *   - metadata (title, description, helpsWith, visibility, noteCount)
 *   - vector index (for RAG queries)
 *
 * Storage layout (.openobsidian/spaces/):
 *   ├── _index.json          — lightweight listing of all spaces
 *   ├── {space-id}.json      — space metadata
 *   └── {space-id}/
 *       └── vectors.json     — vector index for RAG
 */

import { readData, writeData, deleteData, createDebouncedWriter } from "./disk-store";
import { authManager, AuthRequiredError } from "../lib/auth";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import type {
  Space,
  SpaceIndexEntry,
  SpaceVectorIndex,
  SpaceVisibility,
} from "../types/spaces";

// ── Helpers ──────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from "uuid";

function generateId(): string {
  return uuidv4();
}

function normalizeVisibility(value: string | null | undefined): SpaceVisibility {
  if (value === "public" || value === "private" || value === "local") return value;
  return "local";
}

function toIndexEntry(space: Space): SpaceIndexEntry {
  return {
    id: space.id,
    title: space.title,
    description: space.description,
    helpsWith: space.helpsWith || [],
    visibility: space.visibility,
    ownerId: space.ownerId,
    noteCount: space.noteCount || 0,
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
  };
}

type RemoteSpaceRow = {
  id: string;
  title: string;
  description: string | null;
  helps_with: string[] | null;
  owner_id: string;
  visibility: string | null;
  is_public: boolean;
  forked_from: string | null;
  created_at: string;
  updated_at: string;
};

function mapRemoteToSpace(remote: RemoteSpaceRow): Space {
  const visibility = normalizeVisibility(remote.visibility) === "local"
    ? (remote.is_public ? "public" : "private")
    : normalizeVisibility(remote.visibility);

  return {
    id: remote.id,
    title: remote.title,
    description: remote.description || "",
    helpsWith: remote.helps_with || [],
    visibility,
    ownerId: remote.owner_id,
    noteCount: 0,
    createdAt: remote.created_at,
    updatedAt: remote.updated_at,
    forkedFrom: remote.forked_from || undefined,
  };
}

async function upsertCloudSpace(space: Space): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.");
  }

  const { error } = await supabase
    .from("spaces")
    .upsert(
      {
        id: space.id,
        owner_id: space.ownerId,
        title: space.title,
        description: space.description || null,
        helps_with: space.helpsWith,
        visibility: space.visibility,
        is_public: space.visibility === "public",
        forked_from: space.forkedFrom || null,
        created_at: space.createdAt,
        updated_at: space.updatedAt,
      },
      { onConflict: "id" },
    );

  if (error) throw error;
}

async function fetchRemoteSpaces(): Promise<SpaceIndexEntry[]> {
  if (!isSupabaseConfigured || !authManager.isLoggedIn()) return [];

  const userId = authManager.getUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("spaces")
    .select("id, title, description, helps_with, owner_id, visibility, is_public, forked_from, created_at, updated_at")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[SpacesStore] Failed to fetch remote spaces:", error);
    return [];
  }

  return (data || []).map((row) => toIndexEntry(mapRemoteToSpace(row as RemoteSpaceRow)));
}

// ── In-memory cache ──────────────────────────────────────────────────────────

let _indexCache: SpaceIndexEntry[] | null = null;
const _spaceCache = new Map<string, Space>();
const _debouncedWrite = createDebouncedWriter(800);

// ── Index operations ─────────────────────────────────────────────────────────

async function loadIndex(): Promise<SpaceIndexEntry[]> {
  if (_indexCache) return _indexCache;
  const data = await readData<SpaceIndexEntry[]>("spaces/_index.json");
  _indexCache = (data || []).map((entry) => ({
    ...entry,
    helpsWith: entry.helpsWith || [],
    visibility: normalizeVisibility((entry as any).visibility),
    ownerId: (entry as any).ownerId || "local",
  }));
  return _indexCache;
}

async function saveIndex(entries: SpaceIndexEntry[]): Promise<void> {
  _indexCache = entries;
  await writeData("spaces/_index.json", entries);
}

async function upsertIndexEntry(entry: SpaceIndexEntry): Promise<void> {
  const index = await loadIndex();
  const idx = index.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    index[idx] = entry;
  } else {
    index.push(entry);
  }
  await saveIndex(index);
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function listSpaces(): Promise<SpaceIndexEntry[]> {
  const localEntries = await loadIndex();
  const merged = new Map<string, SpaceIndexEntry>(localEntries.map((entry) => [entry.id, entry]));

  const remoteEntries = await fetchRemoteSpaces();
  for (const remote of remoteEntries) {
    const existing = merged.get(remote.id);
    merged.set(remote.id, {
      ...remote,
      noteCount: existing?.noteCount ?? remote.noteCount,
    });
  }

  const result = Array.from(merged.values())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  _indexCache = result;
  return result;
}

export async function getSpace(id: string): Promise<Space | null> {
  const cached = _spaceCache.get(id);
  if (cached) return cached;

  const localSpace = await readData<Space>(`spaces/${id}.json`);
  if (localSpace) {
    const normalized: Space = {
      ...localSpace,
      description: localSpace.description || "",
      helpsWith: localSpace.helpsWith || [],
      visibility: normalizeVisibility((localSpace as any).visibility),
      ownerId: (localSpace as any).ownerId || "local",
      noteCount: localSpace.noteCount || 0,
    };
    _spaceCache.set(id, normalized);
    return normalized;
  }

  if (!isSupabaseConfigured || !authManager.isLoggedIn()) return null;

  const { data, error } = await supabase
    .from("spaces")
    .select("id, title, description, helps_with, owner_id, visibility, is_public, forked_from, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const remoteSpace = mapRemoteToSpace(data as RemoteSpaceRow);
  _spaceCache.set(id, remoteSpace);
  await writeData(`spaces/${id}.json`, remoteSpace);
  await upsertIndexEntry(toIndexEntry(remoteSpace));

  return remoteSpace;
}

export async function createSpace(data: {
  title: string;
  description: string;
  helpsWith: string[];
  noteCount?: number;
  visibility?: SpaceVisibility;
  forkedFrom?: string;
}): Promise<Space> {
  const now = new Date().toISOString();
  const visibility = data.visibility || "local";

  let ownerId = "local";
  if (visibility !== "local") {
    if (!isSupabaseConfigured) {
      throw new Error("Cloud spaces require Supabase configuration. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.");
    }
    const user = authManager.requireAuth();
    ownerId = user.id;
  }

  const space: Space = {
    id: generateId(),
    title: data.title,
    description: data.description,
    helpsWith: data.helpsWith,
    visibility,
    ownerId,
    noteCount: data.noteCount || 0,
    createdAt: now,
    updatedAt: now,
    forkedFrom: data.forkedFrom,
  };

  if (space.visibility !== "local") {
    await upsertCloudSpace(space);
  }

  await writeData(`spaces/${space.id}.json`, space);
  _spaceCache.set(space.id, space);
  await upsertIndexEntry(toIndexEntry(space));

  return space;
}

export async function updateSpace(
  id: string,
  patch: Partial<Omit<Space, "id" | "createdAt">>,
): Promise<Space | null> {
  const space = await getSpace(id);
  if (!space) return null;

  let ownerId = patch.ownerId ?? space.ownerId;
  const visibility = patch.visibility ?? space.visibility;

  if (visibility !== "local" && ownerId === "local") {
    const user = authManager.getUser();
    if (!user) {
      throw new AuthRequiredError("You must be logged in to update cloud spaces.");
    }
    ownerId = user.id;
  }

  const updated: Space = {
    ...space,
    ...patch,
    ownerId,
    visibility,
    updatedAt: new Date().toISOString(),
  };

  if (updated.visibility !== "local" && authManager.isLoggedIn()) {
    await upsertCloudSpace(updated);
  }

  await writeData(`spaces/${id}.json`, updated);
  _spaceCache.set(id, updated);
  await upsertIndexEntry(toIndexEntry(updated));

  return updated;
}

export async function deleteSpace(id: string): Promise<void> {
  const existing = await getSpace(id);

  if (existing && existing.visibility !== "local" && isSupabaseConfigured && authManager.isLoggedIn()) {
    const { error } = await supabase.from("spaces").delete().eq("id", id);
    if (error) throw error;
  }

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

  const visibility: SpaceVisibility = source.visibility === "local" ? "local" : "private";

  return createSpace({
    title: overrides?.title || `${source.title} (Remix)`,
    description: overrides?.description || source.description,
    helpsWith: [...(source.helpsWith || [])],
    noteCount: source.noteCount,
    visibility,
    forkedFrom: source.id,
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
