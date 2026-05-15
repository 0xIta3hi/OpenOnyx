/**
 * Embeddings — Local semantic embeddings via Transformers.js
 *
 * Storage: .openobsidian/embeddings/ (one JSON file per note, NOT localStorage)
 * Index:   .openobsidian/embeddings/_index.json (path→hash map for quick checks)
 *
 * Features:
 *  - Auto-embeds notes on create/update (hash-based change detection)
 *  - Cosine similarity for finding related notes
 *  - Disk-backed with in-memory cache (scales to 1000+ notes)
 *  - Query embedding for RAG retrieval
 *  - Suggestion tracking with temporal weighting
 */

// @ts-ignore — Transformers.js types
import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { readData, writeData, listData, deleteData, createDebouncedWriter } from "./disk-store";

// Disable local model loading — always use remote CDN cache
env.allowLocalModels = false;

// Electron/Browser compatibility fixes
// Force use of wasm backend and disable node-specific backends
if (env.backends) {
  // @ts-ignore
  if (!env.backends.onnx) env.backends.onnx = {};
  
  // @ts-ignore
  env.backends.onnx.wasm = {
    numThreads: 1,
    proxy: false,
    // Point to remote WASM binaries to ensure they can be loaded in Electron
    wasmPaths: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/'
  };
  
  // Explicitly tell transformers to use the web backend even in Electron/Node-like environments
  // @ts-ignore
  env.backends.onnx.node = false;
}

// Force environment to 'browser' to avoid node-specific path lookups
// @ts-ignore
env.env = 'browser';
// @ts-ignore
env.allowRemoteModels = true;

// ── Model singleton ──────────────────────────────────────────────────────────

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const EMBEDDING_DIM = 384;

let _pipeline: FeatureExtractionPipeline | null = null;
let _loadingPromise: Promise<FeatureExtractionPipeline> | null = null;
let _loadProgress = 0;

type ProgressCallback = (progress: number, status: string) => void;
let _onProgress: ProgressCallback | null = null;

export function setProgressCallback(cb: ProgressCallback | null): void {
  _onProgress = cb;
}

export function getLoadProgress(): number {
  return _loadProgress;
}

async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (_pipeline) return _pipeline;
  if (_loadingPromise) return _loadingPromise;

  _loadingPromise = (async () => {
    try {
      _loadProgress = 10;
      _onProgress?.(10, "Loading analysis engine...");
      
      // Explicitly catch pipeline errors
      const p = await pipeline("feature-extraction", MODEL_ID).catch(err => {
        console.error("[Embeddings] Pipeline creation failed:", err);
        throw err;
      });

      if (!p) throw new Error("Pipeline creation returned null");

      _loadProgress = 100;
      _onProgress?.(100, "Model ready");
      _pipeline = p as FeatureExtractionPipeline;
      _loadingPromise = null;
      return _pipeline;
    } catch (err) {
      _loadingPromise = null;
      _loadProgress = 0;
      _onProgress?.(0, "Analysis engine failed to load");
      throw err;
    }
  })();

  return _loadingPromise;
}

export function isModelLoaded(): boolean {
  return _pipeline !== null;
}

// ── Markdown stripping ───────────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  return text
    .replace(/^---[\s\S]*?---\s*/m, "")        // YAML frontmatter
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1") // wiki links
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")    // markdown links
    .replace(/```[\s\S]*?```/g, "")             // code blocks
    .replace(/`[^`]+`/g, "")                    // inline code
    .replace(/^#{1,6}\s+/gm, "")               // headings
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")   // bold/italic
    .replace(/<[^>]+>/g, "")                    // HTML
    .replace(/^\s*[-*+]\s+/gm, "")             // lists
    .replace(/^\s*\d+\.\s+/gm, "")             // numbered lists
    .replace(/^>\s*/gm, "")                     // blockquotes
    .replace(/\s+/g, " ")
    .trim();
}

// ── Hashing ──────────────────────────────────────────────────────────────────

export function simpleHash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

// ── Embedding generation ─────────────────────────────────────────────────────

export async function embedText(text: string): Promise<number[]> {
  const embedder = await getEmbedder();
  const clean = stripMarkdown(text).substring(0, 1500);
  if (clean.length < 5) {
    return new Array(EMBEDDING_DIM).fill(0);
  }
  const output = await embedder(clean, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array).slice(0, EMBEDDING_DIM);
}

// ── Cosine similarity ────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// ── Embedding store (in-memory cache + disk persistence) ─────────────────────

export interface StoredEmbedding {
  path: string;
  hash: string;
  vector: number[];
  updatedAt: number;
}

export interface EmbeddingStore {
  entries: Map<string, StoredEmbedding>;
}

// Index: maps path → hash (lightweight, loaded first for quick change detection)
interface EmbeddingIndex {
  [path: string]: { hash: string; updatedAt: number };
}

// In-memory cache (loaded lazily from disk)
let _memoryStore: EmbeddingStore = { entries: new Map() };
let _isLoaded = false;
let _isLoading = false;
let _loadPromise: Promise<void> | null = null;

// Debounced writer to batch disk writes
const _debouncedWrite = createDebouncedWriter(1000);

/**
 * Ensure embeddings are loaded from disk into memory.
 */
async function ensureLoaded(): Promise<void> {
  if (_isLoaded) return;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    _isLoading = true;
    try {
      // Load index first
      const index = await readData<EmbeddingIndex>("embeddings/_index.json");
      if (!index) {
        _isLoaded = true;
        _isLoading = false;
        return;
      }

      // Load individual embedding files
      const files = await listData("embeddings");
      for (const file of files) {
        if (file === "_index.json") continue;
        if (!file.endsWith(".json")) continue;
        try {
          const entry = await readData<StoredEmbedding>(`embeddings/${file}`);
          if (entry && entry.path && entry.vector) {
            _memoryStore.entries.set(entry.path, entry);
          }
        } catch { /* skip corrupt files */ }
      }
    } catch (err) {
      console.warn("[Embeddings] Failed to load from disk:", err);
      // Try fallback from localStorage (migration)
      tryMigrateFromLocalStorage();
    }
    _isLoaded = true;
    _isLoading = false;
  })();

  return _loadPromise;
}

/**
 * Migrate existing localStorage embeddings to disk (one-time).
 */
function tryMigrateFromLocalStorage(): void {
  try {
    const raw = localStorage.getItem("notework-embeddings-v2");
    if (!raw) return;
    const data: { entries: StoredEmbedding[] } = JSON.parse(raw);
    for (const e of data.entries) {
      _memoryStore.entries.set(e.path, e);
    }
    // Persist to disk
    persistAllToDisk();
    // Remove from localStorage after migration
    localStorage.removeItem("notework-embeddings-v2");
    console.log(`[Embeddings] Migrated ${data.entries.length} entries from localStorage to disk`);
  } catch { /* silent */ }
}

/**
 * Write all embeddings to disk (used during migration or bulk operations).
 */
async function persistAllToDisk(): Promise<void> {
  const index: EmbeddingIndex = {};
  for (const [path, entry] of _memoryStore.entries) {
    const safeName = path.replace(/[/\\]/g, "_").replace(/\.md$/, "") + ".json";
    index[path] = { hash: entry.hash, updatedAt: entry.updatedAt };
    await writeData(`embeddings/${safeName}`, entry);
  }
  await writeData("embeddings/_index.json", index);
}

/**
 * Persist a single embedding entry to disk.
 */
function persistEntry(entry: StoredEmbedding): void {
  const safeName = entry.path.replace(/[/\\]/g, "_").replace(/\.md$/, "") + ".json";
  _debouncedWrite(`embeddings/${safeName}`, entry);

  // Also update index (debounced)
  const index: EmbeddingIndex = {};
  for (const [p, e] of _memoryStore.entries) {
    index[p] = { hash: e.hash, updatedAt: e.updatedAt };
  }
  _debouncedWrite("embeddings/_index.json", index);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Load the embedding store (returns in-memory cache, loading from disk if needed).
 */
export function loadStore(): EmbeddingStore {
  if (!_isLoaded && !_isLoading) {
    // Trigger async load but return what we have
    ensureLoaded();
  }
  return _memoryStore;
}

/**
 * Explicitly load from disk (async version).
 */
export async function loadStoreAsync(): Promise<EmbeddingStore> {
  await ensureLoaded();
  return _memoryStore;
}

export function saveStore(_store: EmbeddingStore): void {
  // No-op — individual entries are persisted via persistEntry
  // This maintains backward API compatibility
}

/**
 * Embed a note if its content has changed.
 */
export async function embedNote(
  store: EmbeddingStore,
  path: string,
  content: string,
): Promise<boolean> {
  const hash = simpleHash(content);
  const existing = store.entries.get(path);

  if (existing && existing.hash === hash) return false;

  const vector = await embedText(content);
  const entry: StoredEmbedding = { path, hash, vector, updatedAt: Date.now() };
  store.entries.set(path, entry);
  _memoryStore.entries.set(path, entry);

  // Persist to disk (debounced)
  persistEntry(entry);

  return true;
}

/**
 * Remove an embedding (when note is deleted).
 */
export function removeEmbedding(store: EmbeddingStore, path: string): void {
  store.entries.delete(path);
  _memoryStore.entries.delete(path);

  const safeName = path.replace(/[/\\]/g, "_").replace(/\.md$/, "") + ".json";
  deleteData(`embeddings/${safeName}`);

  // Update index
  const index: EmbeddingIndex = {};
  for (const [p, e] of _memoryStore.entries) {
    index[p] = { hash: e.hash, updatedAt: e.updatedAt };
  }
  _debouncedWrite("embeddings/_index.json", index);
}

/**
 * Rename/move a single embedding path without re-embedding content.
 */
export function renameEmbeddingPath(
  store: EmbeddingStore,
  oldPath: string,
  newPath: string,
): boolean {
  if (oldPath === newPath) return false;

  const existing = store.entries.get(oldPath);
  if (!existing) return false;

  const oldSafeName = oldPath.replace(/[/\\]/g, "_").replace(/\.md$/, "") + ".json";
  deleteData(`embeddings/${oldSafeName}`);

  const updated: StoredEmbedding = {
    ...existing,
    path: newPath,
    updatedAt: Date.now(),
  };

  store.entries.delete(oldPath);
  _memoryStore.entries.delete(oldPath);
  store.entries.set(newPath, updated);
  _memoryStore.entries.set(newPath, updated);

  persistEntry(updated);
  return true;
}

/**
 * Rename/move all embeddings within a directory prefix.
 */
export function renameEmbeddingsByPrefix(
  store: EmbeddingStore,
  oldPrefix: string,
  newPrefix: string,
): number {
  if (!oldPrefix || oldPrefix === newPrefix) return 0;

  const normalizedOldPrefix = oldPrefix.endsWith("/") ? oldPrefix : `${oldPrefix}/`;
  const normalizedNewPrefix = newPrefix.endsWith("/") ? newPrefix : `${newPrefix}/`;

  let moved = 0;
  const entries = Array.from(store.entries.values());
  for (const entry of entries) {
    const path = entry.path;
    if (!(path === oldPrefix || path.startsWith(normalizedOldPrefix))) continue;

    const nextPath = path === oldPrefix
      ? newPrefix
      : `${normalizedNewPrefix}${path.slice(normalizedOldPrefix.length)}`;

    if (renameEmbeddingPath(store, path, nextPath)) {
      moved += 1;
    }
  }

  return moved;
}

/**
 * Remove all embeddings within a directory prefix.
 */
export function removeEmbeddingsByPrefix(
  store: EmbeddingStore,
  prefix: string,
): number {
  if (!prefix) return 0;

  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  const paths = Array.from(store.entries.keys()).filter(
    (path) => path === prefix || path.startsWith(normalizedPrefix),
  );

  for (const path of paths) {
    removeEmbedding(store, path);
  }

  return paths.length;
}

// ── Similarity search ────────────────────────────────────────────────────────

export interface SimilarNote {
  path: string;
  similarity: number;
}

export function findSimilar(
  store: EmbeddingStore,
  notePath: string,
  threshold = 0.35,
  maxResults = 5,
): SimilarNote[] {
  const entry = store.entries.get(notePath);
  if (!entry || entry.vector.length === 0) return [];

  const results: SimilarNote[] = [];
  for (const [path, other] of store.entries) {
    if (path === notePath) continue;
    if (other.vector.length !== entry.vector.length) continue;
    const sim = cosineSimilarity(entry.vector, other.vector);
    if (sim >= threshold) {
      results.push({ path, similarity: sim });
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, maxResults);
}

export async function searchByQuery(
  store: EmbeddingStore,
  query: string,
  maxResults = 8,
): Promise<SimilarNote[]> {
  const queryVec = await embedText(query);
  const results: SimilarNote[] = [];

  for (const [path, entry] of store.entries) {
    if (entry.vector.length !== queryVec.length) continue;
    const sim = cosineSimilarity(queryVec, entry.vector);
    if (sim > 0.15) {
      results.push({ path, similarity: sim });
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, maxResults);
}

// ── Suggestion tracking ──────────────────────────────────────────────────────

export interface SuggestionRecord {
  sourcePath: string;
  targetPath: string;
  action: "accepted" | "rejected" | "ignored";
  timestamp: number;
}

export interface TransitionMap {
  [concept: string]: Record<string, number>;
}

// Suggestion history is small — keep in localStorage for now
const SUGGESTION_HISTORY_KEY = "notework-suggestion-history-v1";
const TRANSITION_MAP_KEY = "notework-suggestion-transitions-v1";

function normalizeTransitionConcept(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function saveTransitionMap(map: TransitionMap): void {
  try {
    localStorage.setItem(TRANSITION_MAP_KEY, JSON.stringify(map));
  } catch {
    // Ignore persistence failures so suggestions remain functional.
  }
}

export function loadTransitionMap(): TransitionMap {
  try {
    const raw = localStorage.getItem(TRANSITION_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as TransitionMap;
  } catch {
    return {};
  }
}

export function recordTransition(fromConcept: string, toConcept: string): void {
  const from = normalizeTransitionConcept(fromConcept);
  const to = normalizeTransitionConcept(toConcept);
  if (!from || !to || from === to) return;

  const map = loadTransitionMap();
  if (!map[from]) map[from] = {};
  map[from][to] = (map[from][to] || 0) + 1;

  const entries = Object.entries(map[from]).sort((a, b) => b[1] - a[1]);
  map[from] = Object.fromEntries(entries.slice(0, 24));

  saveTransitionMap(map);
}

export function getTransitionBoost(
  fromConcept: string,
  candidateConcepts: string[],
): number {
  const from = normalizeTransitionConcept(fromConcept);
  if (!from || candidateConcepts.length === 0) return 0;

  const map = loadTransitionMap();
  const transitions = map[from];
  if (!transitions) return 0;

  const normalizedCandidates = candidateConcepts
    .map((concept) => normalizeTransitionConcept(concept))
    .filter(Boolean);
  if (normalizedCandidates.length === 0) return 0;

  const totalCount = Object.values(transitions).reduce(
    (sum, count) => sum + count,
    0,
  );
  if (totalCount <= 0) return 0;

  let bestProbability = 0;
  for (const candidate of normalizedCandidates) {
    const probability = (transitions[candidate] || 0) / totalCount;
    if (probability > bestProbability) bestProbability = probability;
  }

  return Math.min(0.1, bestProbability * 0.14);
}

export function loadSuggestionHistory(): SuggestionRecord[] {
  try {
    const raw = localStorage.getItem(SUGGESTION_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function recordSuggestion(record: SuggestionRecord): void {
  const history = loadSuggestionHistory();
  history.push(record);
  const trimmed = history.slice(-500);
  try {
    localStorage.setItem(SUGGESTION_HISTORY_KEY, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

/**
 * Record that suggestions were shown but not acted upon (decay trigger).
 * Call this when a user navigates away from a note without acting on suggestions.
 */
export function recordIgnoredSuggestions(
  sourcePath: string,
  shownPaths: string[],
): void {
  const history = loadSuggestionHistory();
  const now = Date.now();
  for (const targetPath of shownPaths) {
    // Only record ignore once per 30-minute window per pair
    const recentIgnore = history.find(
      (r) =>
        r.sourcePath === sourcePath &&
        r.targetPath === targetPath &&
        r.action === "ignored" &&
        now - r.timestamp < 30 * 60 * 1000,
    );
    if (!recentIgnore) {
      history.push({ sourcePath, targetPath, action: "ignored", timestamp: now });
    }
  }
  const trimmed = history.slice(-500);
  try {
    localStorage.setItem(SUGGESTION_HISTORY_KEY, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

/**
 * Apply suggestion weighting with temporal recency boost and decay.
 * - Accepted targets get boosted (+0.05)
 * - Rejected targets get demoted (-0.15)
 * - Ignored targets decay gradually (-0.03 per ignore)
 * - Recently edited notes get a temporal boost (+0.05)
 */
export function applyHistoryWeighting(
  sourcePath: string,
  results: SimilarNote[],
  recentPaths: string[] = [],
): SimilarNote[] {
  const history = loadSuggestionHistory();
  const boosts = new Map<string, number>();
  const recentSet = new Set(recentPaths);

  for (const record of history) {
    if (record.sourcePath === sourcePath) {
      const current = boosts.get(record.targetPath) || 0;
      if (record.action === "accepted") {
        boosts.set(record.targetPath, current + 0.05);
      } else if (record.action === "rejected") {
        boosts.set(record.targetPath, current - 0.15);
      } else if (record.action === "ignored") {
        // Gradual decay for ignored suggestions
        boosts.set(record.targetPath, current - 0.03);
      }
    }
  }

  return results
    .map((r) => {
      let sim = r.similarity + (boosts.get(r.path) || 0);
      // Temporal boost: +5% for recently accessed notes
      if (recentSet.has(r.path)) sim += 0.05;
      return { ...r, similarity: Math.max(0, sim) };
    })
    .filter((r) => r.similarity > 0.1)
    .sort((a, b) => b.similarity - a.similarity);
}

