/**
 * Spaces RAG — Retrieval-Augmented Generation for Space queries
 *
 * Pipeline:
 *  1. Embed user query
 *  2. Retrieve top-K relevant chunks from vector index
 *  3. Construct prompt with retrieved context + space identity
 *  4. Stream LLM response
 *
 * The system prompt makes the LLM behave as the SPACE's thinking layer —
 * not a generic assistant. It reasons using the space's content, infers
 * the creator's perspective, and refuses generic answers.
 */

import { embedText } from "./embeddings";
import { loadVectorIndex } from "./spaces-store";
import { loadAIConfig, getBaseUrl, getProviderHeaders } from "./ai-settings";
import type { SpaceChunk } from "../types/spaces";

// ── Constants ────────────────────────────────────────────────────────────────

const TOP_K = 6;
const MIN_SIMILARITY = 0.15;

// ── Space Metadata (passed from UI) ──────────────────────────────────────────

export interface SpaceMetadata {
  title: string;
  description: string;
  helpsWith: string[];
}

// ── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(meta: SpaceMetadata): string {
  const helpsWith = meta.helpsWith || [];
  const helpsLine = helpsWith.length > 0
    ? `\n  helps_with: ${helpsWith.join(", ")}`
    : "";

  return `You are not an assistant.
You are the thinking layer of this knowledge system.

SPACE IDENTITY:
  title: ${meta.title}
  description: ${meta.description}${helpsLine}

---

CORE RULES:

1. CONTEXT FIRST
- Use ONLY the provided context
- Do NOT rely on general knowledge unless absolutely necessary
- If context is weak, say it clearly

2. NO GENERIC ANSWERS (STRICT)
Never output:
- "it depends"
- "start by defining your goals"
- "break it into steps"
If the answer sounds like something that could apply to ANY topic, it is wrong.

3. THINK LIKE THE SPACE
Infer:
- what the creator believes
- what approach they prefer
- what patterns exist in the notes
Then answer from THAT perspective.

4. BE SPECIFIC TO THE TOPIC
Always anchor the response in:
- the subject of this space
- the actual terms used in the notes

5. STRUCTURE INTELLIGENTLY
Do NOT use fixed templates. Dynamically choose structure based on the query:
- "how to start" → phased plan
- "why am I stuck" → diagnosis + causes
- "what should I do" → prioritized actions
- "compare" → contrast format

6. HANDLE WEAK CONTEXT PROPERLY
If context is insufficient:
- say what's missing
- suggest what kind of notes would improve answers
Example: "This space doesn't yet contain enough detail about X to give a strong answer."

7. REFLECT PATTERNS
Occasionally surface structure:
- recurring ideas
- repeated strategies
- gaps in coverage
Example: "A recurring pattern in this space is…"

---

RESPONSE FORMAT:
- Start directly with the answer (no fluff)
- Use clean markdown sections if helpful
- Be concise but insightful
- Avoid long paragraphs
- No emojis, no filler

---

QUALITY CHECK (MANDATORY):
Before responding, ensure:
- Is this specific to THIS space?
- Could this answer exist without the context? (if yes, reject it)
- Does it reflect actual content patterns?
- Is it useful immediately?
Only output if all pass.

---

GOAL:
Make the user feel: "This isn't ChatGPT. This is MY system thinking back at me."`;
}

// ── Cosine Similarity ────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are pre-normalized
}

// ── Retrieval ────────────────────────────────────────────────────────────────

export interface RetrievedChunk {
  chunk: SpaceChunk;
  similarity: number;
}

export async function retrieveChunks(
  spaceId: string,
  query: string,
  topK: number = TOP_K,
): Promise<RetrievedChunk[]> {
  const index = await loadVectorIndex(spaceId);
  if (!index || index.chunks.length === 0) return [];

  const queryVector = await embedText(query);
  const results: RetrievedChunk[] = [];

  for (const chunk of index.chunks) {
    if (chunk.vector.length !== queryVector.length) continue;
    const sim = cosineSimilarity(queryVector, chunk.vector);
    if (sim > MIN_SIMILARITY) {
      results.push({ chunk, similarity: sim });
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, topK);
}

// ── Prompt Construction ──────────────────────────────────────────────────────

function buildUserPrompt(query: string, chunks: RetrievedChunk[]): string {
  const contextBlock = chunks
    .map(
      (r, i) =>
        `[${i + 1}] from "${r.chunk.noteTitle}" (${Math.round(r.similarity * 100)}% relevance)\n${r.chunk.chunkText}`,
    )
    .join("\n\n---\n\n");

  return `USER INPUT:\n${query}\n\nCONTEXT:\n${contextBlock}`;
}

// ── Query Result ─────────────────────────────────────────────────────────────

export interface RAGResult {
  answer: string;
  sources: { notePath: string; noteTitle: string; chunkText: string; similarity: number }[];
}

// ── Non-streaming Query ──────────────────────────────────────────────────────

export async function querySpace(
  spaceId: string,
  query: string,
  meta: SpaceMetadata,
): Promise<RAGResult> {
  const config = loadAIConfig();
  if (!config) {
    return {
      answer: "No API key configured. Please add one in AI Settings.",
      sources: [],
    };
  }

  const retrieved = await retrieveChunks(spaceId, query);

  if (retrieved.length === 0) {
    return {
      answer: "No relevant content found in this space. Try rephrasing or adding more notes to your vault.",
      sources: [],
    };
  }

  const systemPrompt = buildSystemPrompt(meta);
  const userPrompt = buildUserPrompt(query, retrieved);

  const baseUrl = getBaseUrl(config);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: getProviderHeaders(config),
    body: JSON.stringify({
      model: config.modelId,
      max_tokens: 4096,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 401) throw new Error("Invalid API key.");
    if (status === 429) throw new Error("Rate limited. Try again in a moment.");
    throw new Error(`AI request failed (${status}).`);
  }

  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("Empty response from AI.");

  return {
    answer,
    sources: retrieved.map((r) => ({
      notePath: r.chunk.notePath,
      noteTitle: r.chunk.noteTitle,
      chunkText: r.chunk.chunkText.substring(0, 200),
      similarity: r.similarity,
    })),
  };
}

// ── Streaming Query ──────────────────────────────────────────────────────────

export async function querySpaceStreaming(
  spaceId: string,
  query: string,
  meta: SpaceMetadata,
  onChunk: (text: string) => void,
): Promise<RAGResult> {
  const config = loadAIConfig();
  if (!config) {
    const msg = "No API key configured. Please add one in AI Settings.";
    onChunk(msg);
    return { answer: msg, sources: [] };
  }

  const retrieved = await retrieveChunks(spaceId, query);

  if (retrieved.length === 0) {
    const msg = "No relevant content found in this space. Try rephrasing or adding more notes to your vault.";
    onChunk(msg);
    return { answer: msg, sources: [] };
  }

  const systemPrompt = buildSystemPrompt(meta);
  const userPrompt = buildUserPrompt(query, retrieved);

  const baseUrl = getBaseUrl(config);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: getProviderHeaders(config),
    body: JSON.stringify({
      model: config.modelId,
      max_tokens: 4096,
      temperature: 0.2,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 401) throw new Error("Invalid API key.");
    if (status === 429) throw new Error("Rate limited. Try again in a moment.");
    throw new Error(`AI request failed (${status}).`);
  }

  const makeSources = () =>
    retrieved.map((r) => ({
      notePath: r.chunk.notePath,
      noteTitle: r.chunk.noteTitle,
      chunkText: r.chunk.chunkText.substring(0, 200),
      similarity: r.similarity,
    }));

  // Parse SSE stream
  let fullAnswer = "";
  const reader = response.body?.getReader();
  if (!reader) {
    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim() || "";
    onChunk(answer);
    return { answer, sources: makeSources() };
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const payload = trimmed.slice(6);
      if (payload === "[DONE]") continue;

      try {
        const parsed = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullAnswer += delta;
          onChunk(delta);
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  // Flush remaining buffer
  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed.startsWith("data: ") && trimmed.slice(6) !== "[DONE]") {
      try {
        const parsed = JSON.parse(trimmed.slice(6));
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullAnswer += delta;
          onChunk(delta);
        }
      } catch {
        // Ignore
      }
    }
  }

  return { answer: fullAnswer, sources: makeSources() };
}
