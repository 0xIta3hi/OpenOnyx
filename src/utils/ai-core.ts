/**
 * AI Core — Minimal, controlled LLM usage
 *
 * Storage: .openobsidian/annotations.json (disk-backed, NOT localStorage)
 *
 * LLM is used ONLY for:
 *  1. Auto-annotation: 1-line per note (generated once, cached)
 *  2. Synthesis across multiple notes (on user request)
 *  3. RAG query answering (on user request)
 *
 * LLM does NOT: auto-modify notes, auto-create links, replace user thinking.
 * All outputs are cached. The system works fully without an API key.
 */

import { loadAIConfig, getBaseUrl, getProviderHeaders } from "./ai-settings";
import { readData, writeData, createDebouncedWriter } from "./disk-store";

// ── Cache ────────────────────────────────────────────────────────────────────

interface AnnotationEntry {
  text: string;
  hash: string;
  createdAt: number;
}

interface SynthesisEntry {
  text: string;
  createdAt: number;
}

interface AICache {
  annotations: Record<string, AnnotationEntry>;
  syntheses: Record<string, SynthesisEntry>;
}

// In-memory cache
let _cache: AICache | null = null;
let _cacheLoaded = false;

const _debouncedSave = createDebouncedWriter(2000);

async function loadCache(): Promise<AICache> {
  if (_cache && _cacheLoaded) return _cache;

  // Try disk first
  const diskData = await readData<AICache>("annotations.json");
  if (diskData && diskData.annotations) {
    _cache = diskData;
    _cacheLoaded = true;
    return _cache;
  }

  // Migrate from localStorage if exists
  try {
    const raw = localStorage.getItem("notework-ai-cache-v2");
    if (raw) {
      _cache = JSON.parse(raw);
      _cacheLoaded = true;
      // Persist to disk and remove from localStorage
      await writeData("annotations.json", _cache);
      localStorage.removeItem("notework-ai-cache-v2");
      console.log("[AI Core] Migrated cache from localStorage to disk");
      return _cache!;
    }
  } catch { /* silent */ }

  _cache = { annotations: {}, syntheses: {} };
  _cacheLoaded = true;
  return _cache;
}

function loadCacheSync(): AICache {
  if (_cache) return _cache;
  // If not loaded yet, trigger async load and return empty
  loadCache();
  return _cache || { annotations: {}, syntheses: {} };
}

function saveCache(cache: AICache): void {
  _cache = cache;
  _debouncedSave("annotations.json", cache);
}

function simpleHash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

// ── LLM call helper ─────────────────────────────────────────────────────────

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 300,
  temperature = 0.2,
): Promise<string> {
  const config = loadAIConfig();
  if (!config) throw new Error("No API key configured.");

  const baseUrl = getBaseUrl(config);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: getProviderHeaders(config),
    body: JSON.stringify({
      model: config.modelId,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 401) throw new Error("Invalid API key.");
    if (status === 429) throw new Error("Rate limited. Try later.");
    throw new Error(`AI request failed (${status}).`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty AI response.");
  return content.trim();
}

// ── 1. Auto-annotation ──────────────────────────────────────────────────────

export async function getAnnotation(
  notePath: string,
  noteContent: string,
): Promise<string | null> {
  const cache = await loadCache();
  const hash = simpleHash(noteContent);

  const cached = cache.annotations[notePath];
  if (cached && cached.hash === hash) return cached.text;

  const config = loadAIConfig();
  if (!config) return null;

  try {
    const systemPrompt = `You are a subtle assistant in a knowledge management tool.
Generate ONE sentence (max 20 words) capturing the core insight of this note.
Be specific. No fluff. Reply with ONLY the sentence.`;

    const cleaned = noteContent.replace(/^---[\s\S]*?---\s*/m, "").trim();
    if (cleaned.length < 20) return null;

    const text = await callLLM(systemPrompt, cleaned.substring(0, 1500), 100);

    cache.annotations[notePath] = { text, hash, createdAt: Date.now() };
    saveCache(cache);
    return text;
  } catch (err) {
    console.warn("[AI] Annotation failed:", err);
    return null;
  }
}

export function getCachedAnnotation(notePath: string): string | null {
  const cache = loadCacheSync();
  return cache.annotations[notePath]?.text || null;
}

// ── 2. Synthesis ────────────────────────────────────────────────────────────

export async function synthesizeNotes(
  notes: { title: string; content: string }[],
): Promise<string> {
  if (notes.length < 2) throw new Error("Need at least 2 notes.");

  const cacheKey = notes.map((n) => n.title).sort().join("|");
  const cache = await loadCache();
  const cached = cache.syntheses[cacheKey];
  if (cached) return cached.text;

  const systemPrompt = `You are a synthesis engine in a knowledge management tool.
Analyze these notes and produce a 3-5 sentence synthesis.
Focus on connections, tensions, and unexplored questions.
Be specific. No headers or formatting. Just the synthesis.`;

  const notesBlock = notes
    .map((n) => `--- ${n.title} ---\n${n.content.substring(0, 600)}`)
    .join("\n\n");

  const text = await callLLM(systemPrompt, notesBlock, 400, 0.3);

  cache.syntheses[cacheKey] = { text, createdAt: Date.now() };
  saveCache(cache);
  return text;
}

// ── 3. RAG Query ────────────────────────────────────────────────────────────

export async function queryRAG(
  question: string,
  relevantNotes: { title: string; content: string; similarity: number }[],
): Promise<{ answer: string; sources: string[] }> {
  if (relevantNotes.length === 0) {
    return {
      answer: "No relevant notes found. Try rephrasing or adding more notes.",
      sources: [],
    };
  }

  const systemPrompt = `You are a knowledge assistant for a note-taking tool.
Answer based ONLY on the provided notes.
Reference notes by name. Keep concise (3-6 sentences).
If information is insufficient, say so. Reply with ONLY the answer.`;

  const notesBlock = relevantNotes
    .map((n) => `[${n.title}] (${Math.round(n.similarity * 100)}%)\n${n.content.substring(0, 800)}`)
    .join("\n\n---\n\n");

  const answer = await callLLM(
    systemPrompt,
    `Question: ${question}\n\n--- Notes ---\n\n${notesBlock}`,
    500,
    0.2,
  );

  return { answer, sources: relevantNotes.map((n) => n.title) };
}

// ── Utility ──────────────────────────────────────────────────────────────────

export function isAIConfigured(): boolean {
  return loadAIConfig() !== null;
}
