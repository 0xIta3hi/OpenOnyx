/**
 * Synthesis Engine — Graph intelligence, synthesis, and insight detection
 *
 * Features:
 *  1. Cluster detection — groups semantically similar notes
 *  2. Missing link detection — finds unconnected but related pairs
 *  3. Synthesis generation — produces higher-level insights with confidence
 *  4. Unwritten insight detection — finds conceptual gaps
 *  5. Variation detection — prevents synthesis on near-duplicates
 *
 * All results are cached to avoid unnecessary computation/LLM calls.
 */

import { loadStore, findSimilar, type EmbeddingStore } from "./embeddings";
import { loadAIConfig, getBaseUrl, getProviderHeaders } from "./ai-settings";
import { readData, writeData, createDebouncedWriter } from "./disk-store";

interface SynthesisCacheEntry {
  noteKeys: string[];
  insight: string;
  confidence: number;
  createdAt: number;
}

// In-memory cache + disk persistence
let _synthCache: Record<string, SynthesisCacheEntry> | null = null;
let _synthCacheLoaded = false;
const _debouncedSave = createDebouncedWriter(2000);

async function loadSynthesisCache(): Promise<Record<string, SynthesisCacheEntry>> {
  if (_synthCache && _synthCacheLoaded) return _synthCache;

  // Try disk
  const diskData = await readData<Record<string, SynthesisCacheEntry>>("synthesis.json");
  if (diskData) {
    _synthCache = diskData;
    _synthCacheLoaded = true;
    return _synthCache;
  }

  // Migrate from localStorage
  try {
    const raw = localStorage.getItem("openobsidian-synthesis-cache-v1");
    if (raw) {
      _synthCache = JSON.parse(raw);
      _synthCacheLoaded = true;
      await writeData("synthesis.json", _synthCache);
      localStorage.removeItem("openobsidian-synthesis-cache-v1");
      return _synthCache!;
    }
  } catch { /* silent */ }

  _synthCache = {};
  _synthCacheLoaded = true;
  return _synthCache;
}

function saveSynthesisCache(cache: Record<string, SynthesisCacheEntry>): void {
  _synthCache = cache;
  _debouncedSave("synthesis.json", cache);
}

function makeCacheKey(paths: string[]): string {
  return [...paths].sort().join("|");
}

// ── Text similarity (for variation check) ────────────────────────────────────

/**
 * Simple Jaccard similarity on word sets to detect near-duplicate content.
 * Used to ensure synthesis only triggers on notes with meaningful variation.
 */
function jaccardWordSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  const setA = new Set(normalize(a));
  const setB = new Set(normalize(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  return intersection / (setA.size + setB.size - intersection);
}

/**
 * Check if a group of notes has enough content variation.
 * Returns false if most pairs are near-duplicates (>70% word overlap).
 */
export function hasContentVariation(contents: string[], threshold = 0.7): boolean {
  if (contents.length < 2) return false;
  let dupCount = 0;
  let pairCount = 0;

  for (let i = 0; i < contents.length; i++) {
    for (let j = i + 1; j < contents.length; j++) {
      pairCount++;
      if (jaccardWordSimilarity(contents[i], contents[j]) > threshold) {
        dupCount++;
      }
    }
  }

  // If more than half the pairs are near-duplicates, skip
  return pairCount > 0 && dupCount / pairCount < 0.5;
}

// ── Cluster detection ────────────────────────────────────────────────────────

export interface NoteCluster {
  center: string;
  members: string[];
  avgSimilarity: number;
  confidence: number; // 0-1 confidence that synthesis would be valuable
}

/**
 * Detect clusters of semantically similar notes.
 * Includes a confidence score for synthesis potential.
 */
export function detectClusters(
  store: EmbeddingStore,
  threshold = 0.4,
  minClusterSize = 3,
): NoteCluster[] {
  const paths = Array.from(store.entries.keys());
  const visited = new Set<string>();
  const clusters: NoteCluster[] = [];

  for (const path of paths) {
    if (visited.has(path)) continue;

    // BFS connected component
    const component: string[] = [];
    const queue = [path];
    visited.add(path);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);

      const similar = findSimilar(store, current, threshold, 20);
      for (const { path: neighborPath } of similar) {
        if (!visited.has(neighborPath)) {
          visited.add(neighborPath);
          queue.push(neighborPath);
        }
      }
    }

    if (component.length >= minClusterSize) {
      // Center = most-connected node
      let maxConns = 0;
      let center = component[0];
      for (const p of component) {
        const conns = findSimilar(store, p, threshold, 50).filter((s) =>
          component.includes(s.path),
        ).length;
        if (conns > maxConns) {
          maxConns = conns;
          center = p;
        }
      }

      // Average similarity
      let totalSim = 0;
      let pairCount = 0;
      for (const p of component) {
        const sims = findSimilar(store, p, 0, 50);
        for (const sim of sims) {
          if (component.includes(sim.path)) {
            totalSim += sim.similarity;
            pairCount++;
          }
        }
      }
      const avgSim = pairCount > 0 ? totalSim / pairCount : 0;

      // Confidence scoring:
      //  - Higher avg similarity = stronger cluster
      //  - More members = richer potential synthesis
      //  - But too high similarity = might be duplicates (lower confidence)
      const sizeFactor = Math.min(1, component.length / 8); // caps at 8 notes
      const simFactor = avgSim > 0.8 ? 0.5 : avgSim; // penalize near-duplicates
      const confidence = Math.min(1, sizeFactor * 0.4 + simFactor * 0.6);

      clusters.push({
        center,
        members: component,
        avgSimilarity: avgSim,
        confidence,
      });
    }
  }

  return clusters.sort((a, b) => b.confidence - a.confidence);
}

// ── Missing link suggestions ─────────────────────────────────────────────────

export interface MissingLinkSuggestion {
  from: string;
  to: string;
  similarity: number;
  reason: string;
}

/**
 * Detect pairs of notes that are semantically similar but not linked.
 */
export function detectMissingLinks(
  store: EmbeddingStore,
  noteContents: Map<string, string>,
  threshold = 0.4,
  maxResults = 10,
): MissingLinkSuggestion[] {
  const results: MissingLinkSuggestion[] = [];
  const seen = new Set<string>();

  for (const [path] of store.entries) {
    const content = noteContents.get(path) || "";
    const similar = findSimilar(store, path, threshold, 10);

    for (const { path: targetPath, similarity } of similar) {
      const key = [path, targetPath].sort().join("<>");
      if (seen.has(key)) continue;
      seen.add(key);

      const targetName = targetPath.split("/").pop()?.replace(/\.md$/, "") || "";
      const isLinked = content.includes(`[[${targetName}]]`);

      const sourceName = path.split("/").pop()?.replace(/\.md$/, "") || "";
      const targetContent = noteContents.get(targetPath) || "";
      const isReverseLinked = targetContent.includes(`[[${sourceName}]]`);

      if (!isLinked && !isReverseLinked) {
        results.push({
          from: path,
          to: targetPath,
          similarity,
          reason: `${Math.round(similarity * 100)}% similar but not linked`,
        });
      }
    }
  }

  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults);
}

// ── Unwritten insight detection ──────────────────────────────────────────────

export interface UnwrittenInsight {
  type: "bridge_gap" | "cluster_gap";
  description: string;
  relatedNotes: string[];
  confidence: number;
}

/**
 * Detect conceptual gaps — places where ideas are related but not connected.
 * Returns insights like "These ideas seem related but are not connected."
 */
export function detectUnwrittenInsights(
  store: EmbeddingStore,
  noteContents: Map<string, string>,
  threshold = 0.35,
): UnwrittenInsight[] {
  const insights: UnwrittenInsight[] = [];
  const clusters = detectClusters(store, 0.4, 3);

  // 1. Bridge gaps: notes with high similarity to multiple clusters
  const paths = Array.from(store.entries.keys());
  for (const path of paths) {
    const clusterMemberships: number[] = [];
    for (let i = 0; i < clusters.length; i++) {
      const clusterSims = clusters[i].members
        .filter((m) => m !== path)
        .map((m) => {
          const entry = store.entries.get(path);
          const other = store.entries.get(m);
          if (!entry || !other) return 0;
          let dot = 0;
          for (let k = 0; k < entry.vector.length; k++) dot += entry.vector[k] * other.vector[k];
          return dot;
        });
      const avgSim = clusterSims.length > 0
        ? clusterSims.reduce((a, b) => a + b, 0) / clusterSims.length
        : 0;
      if (avgSim > threshold) clusterMemberships.push(i);
    }

    // If a note bridges 2+ clusters, it's a potential connecting concept
    if (clusterMemberships.length >= 2 && !clusters.some((c) => c.members.includes(path))) {
      const relatedClusters = clusterMemberships.map((i) => clusters[i]);
      const centerNames = relatedClusters.map((c) => {
        const name = c.center.split("/").pop()?.replace(/\.md$/, "") || c.center;
        return name;
      });
      insights.push({
        type: "bridge_gap",
        description: `This note bridges the "${centerNames.join('" and "')}" clusters but isn't connected to either.`,
        relatedNotes: [path, ...relatedClusters.flatMap((c) => c.members.slice(0, 2))],
        confidence: 0.7,
      });
    }
  }

  // 2. Cluster gaps: clusters that are semantically close but unconnected
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const a = clusters[i];
      const b = clusters[j];

      // Check if any cross-cluster links exist
      let hasLink = false;
      for (const pathA of a.members) {
        const contentA = noteContents.get(pathA) || "";
        for (const pathB of b.members) {
          const nameB = pathB.split("/").pop()?.replace(/\.md$/, "") || "";
          if (contentA.includes(`[[${nameB}]]`)) {
            hasLink = true;
            break;
          }
        }
        if (hasLink) break;
      }

      if (!hasLink) {
        // Check semantic distance between cluster centers
        const centerA = store.entries.get(a.center);
        const centerB = store.entries.get(b.center);
        if (centerA && centerB) {
          let dot = 0;
          for (let k = 0; k < centerA.vector.length; k++) {
            dot += centerA.vector[k] * centerB.vector[k];
          }
          if (dot > 0.3) {
            const nameA = a.center.split("/").pop()?.replace(/\.md$/, "") || "";
            const nameB = b.center.split("/").pop()?.replace(/\.md$/, "") || "";
            insights.push({
              type: "cluster_gap",
              description: `The "${nameA}" and "${nameB}" groups share themes but have no connections between them.`,
              relatedNotes: [a.center, b.center],
              confidence: Math.min(0.9, dot),
            });
          }
        }
      }
    }
  }

  return insights.sort((a, b) => b.confidence - a.confidence).slice(0, 8);
}

// ── Synthesis generation ─────────────────────────────────────────────────────

export interface SynthesisResult {
  insight: string;
  confidence: number;
}

/**
 * Generate a synthesis insight for a group of related notes.
 * Only triggers if:
 *  1. Strong semantic cluster exists (passed by caller)
 *  2. Notes contain meaningful variation (not duplicates)
 *
 * Returns cached result if available. Includes confidence scoring.
 */
export async function generateSynthesis(
  notes: { title: string; content: string }[],
): Promise<SynthesisResult | null> {
  if (notes.length < 2) return null;

  // Variation check: skip if mostly duplicates
  const contents = notes.map((n) => n.content);
  if (!hasContentVariation(contents, 0.7)) {
    return {
      insight: "These notes are too similar to generate a meaningful synthesis. Try adding more diverse perspectives.",
      confidence: 0.1,
    };
  }

  // Check cache
  const cache = await loadSynthesisCache();
  const key = makeCacheKey(notes.map((n) => n.title));
  if (cache[key]) {
    return { insight: cache[key].insight, confidence: cache[key].confidence };
  }

  const config = loadAIConfig();
  if (!config) return null;

  try {
    const baseUrl = getBaseUrl(config);
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: getProviderHeaders(config),
      body: JSON.stringify({
        model: config.modelId,
        max_tokens: 250,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `You are a synthesis engine for a knowledge graph. Given multiple note excerpts, produce a 1-2 sentence insight that connects them at a higher level. Focus on emergent themes, tensions, or questions that arise from their intersection. Be specific and concise.

After the insight, on a new line, rate your confidence in this synthesis from 0.0 to 1.0 based on how meaningful and non-obvious the connection is.

Format:
INSIGHT: [your insight]
CONFIDENCE: [0.0-1.0]`,
          },
          {
            role: "user",
            content: notes
              .map((n) => `[${n.title}]\n${n.content.substring(0, 500)}`)
              .join("\n\n---\n\n"),
          },
        ],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    // Parse response
    const insightMatch = raw.match(/INSIGHT:\s*(.+)/i);
    const confMatch = raw.match(/CONFIDENCE:\s*([\d.]+)/i);
    const insight = insightMatch ? insightMatch[1].trim() : raw.split("\n")[0].trim();
    const confidence = confMatch ? Math.max(0, Math.min(1, parseFloat(confMatch[1]))) : 0.5;

    // Cache
    cache[key] = {
      noteKeys: notes.map((n) => n.title).sort(),
      insight,
      confidence,
      createdAt: Date.now(),
    };
    saveSynthesisCache(cache);

    return { insight, confidence };
  } catch {
    return null;
  }
}

/**
 * Auto-detect synthesis candidates — clusters where synthesis would be valuable.
 * Filters out low-confidence clusters.
 */
export function findSynthesisCandidates(
  store: EmbeddingStore,
  threshold = 0.45,
  minGroupSize = 3,
): NoteCluster[] {
  const clusters = detectClusters(store, threshold, minGroupSize);
  return clusters.filter((c) => c.confidence >= 0.3);
}

export function resetSynthesisCache(): void {
  _synthCache = null;
  _synthCacheLoaded = false;
}
