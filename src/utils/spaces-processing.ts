/**
 * Spaces Processing — Vault note indexing pipeline
 *
 * Reads ALL markdown notes from the vault, chunks them,
 * generates embeddings, and builds a vector index for RAG.
 *
 * Pipeline:
 *  1. Walk vault file tree → collect all .md files
 *  2. Read each note's content
 *  3. Split into chunks (300–500 tokens, with overlap)
 *  4. Generate embeddings via existing embedText()
 *  5. Store in vector index with vault-relative paths
 *
 * Runs async — never blocks UI.
 */

import { embedText } from "./embeddings";
import { saveVectorIndex, updateSpace } from "./spaces-store";
import { getAPI } from "./api";
import type { SpaceChunk, SpaceVectorIndex } from "../types/spaces";
import type { FileEntry } from "../types/index";

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_CHUNK_TOKENS = 500;
const OVERLAP_TOKENS = 50;

// ── Vault Note Collection ────────────────────────────────────────────────────

interface VaultNote {
  path: string;
  title: string;
  content: string;
}

/**
 * Collect all markdown notes from the vault file tree.
 */
async function collectVaultNotes(fileTree: FileEntry[]): Promise<VaultNote[]> {
  const api = getAPI();
  const notes: VaultNote[] = [];

  async function walk(entries: FileEntry[]): Promise<void> {
    if (!entries) return;
    for (const entry of entries) {
      if (entry.isDirectory && entry.children) {
        await walk(entry.children);
        continue;
      }
      if (entry.name.endsWith(".md")) {
        try {
          const content = await api.readFile(entry.path);
          if (content && content.trim().length > 0) {
            notes.push({
              path: entry.path,
              title: entry.name.replace(/\.md$/, ""),
              content,
            });
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  await walk(fileTree);
  return notes;
}

// ── Chunking ─────────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Strip markdown formatting for cleaner embedding input.
 */
function cleanForEmbedding(text: string): string {
  return text
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^>\s*/gm, "")
    .trim();
}

/**
 * Split text into chunks at paragraph boundaries.
 */
export function chunkText(
  text: string,
): { text: string; startOffset: number; endOffset: number }[] {
  const cleaned = cleanForEmbedding(text);
  if (!cleaned.trim()) return [];

  if (estimateTokens(cleaned) <= MAX_CHUNK_TOKENS) {
    return [{ text: cleaned.trim(), startOffset: 0, endOffset: cleaned.length }];
  }

  const paragraphs = cleaned.split(/\n\s*\n/).filter((p) => p.trim());
  const chunks: { text: string; startOffset: number; endOffset: number }[] = [];
  let currentChunk = "";
  let currentStart = 0;
  let offset = 0;

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);
    const currentTokens = estimateTokens(currentChunk);

    if (currentTokens + paraTokens > MAX_CHUNK_TOKENS && currentChunk.trim()) {
      chunks.push({
        text: currentChunk.trim(),
        startOffset: currentStart,
        endOffset: offset,
      });

      const overlapText = getOverlapText(currentChunk, OVERLAP_TOKENS);
      currentChunk = overlapText + "\n\n" + para;
      currentStart = offset - overlapText.length;
    } else {
      if (!currentChunk) currentStart = offset;
      currentChunk += (currentChunk ? "\n\n" : "") + para;
    }

    offset += para.length + 2;
  }

  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      startOffset: currentStart,
      endOffset: offset,
    });
  }

  return chunks.flatMap((chunk) => {
    if (estimateTokens(chunk.text) > MAX_CHUNK_TOKENS * 1.5) {
      return splitLongChunk(chunk);
    }
    return [chunk];
  });
}

function getOverlapText(text: string, tokenCount: number): string {
  const charCount = tokenCount * 4;
  if (text.length <= charCount) return text;
  const tail = text.slice(-charCount);
  const sentenceBreak = tail.indexOf(". ");
  if (sentenceBreak > 0 && sentenceBreak < tail.length * 0.5) {
    return tail.slice(sentenceBreak + 2);
  }
  return tail;
}

function splitLongChunk(
  chunk: { text: string; startOffset: number; endOffset: number },
): { text: string; startOffset: number; endOffset: number }[] {
  const sentences = chunk.text.split(/(?<=[.!?])\s+/);
  const result: { text: string; startOffset: number; endOffset: number }[] = [];
  let current = "";
  let segStart = chunk.startOffset;

  for (const sentence of sentences) {
    if (estimateTokens(current + " " + sentence) > MAX_CHUNK_TOKENS && current.trim()) {
      result.push({
        text: current.trim(),
        startOffset: segStart,
        endOffset: segStart + current.length,
      });
      segStart += current.length;
      current = sentence;
    } else {
      current += (current ? " " : "") + sentence;
    }
  }

  if (current.trim()) {
    result.push({
      text: current.trim(),
      startOffset: segStart,
      endOffset: chunk.endOffset,
    });
  }

  return result;
}

// ── Vector Index Building ────────────────────────────────────────────────────

/**
 * Build the vector index for a space by reading ALL vault notes.
 * This is the main async pipeline entry point.
 */
export async function buildVectorIndex(
  spaceId: string,
  fileTree: FileEntry[],
  onProgress?: (processed: number, total: number) => void,
): Promise<SpaceVectorIndex> {
  // 1. Collect all vault notes
  const vaultNotes = await collectVaultNotes(fileTree);
  const totalNotes = vaultNotes.length;
  const allChunks: SpaceChunk[] = [];
  let processed = 0;

  // 2. Chunk + embed each note
  for (const note of vaultNotes) {
    const textChunks = chunkText(note.content);

    for (const chunk of textChunks) {
      const vector = await embedText(chunk.text);
      allChunks.push({
        id: `chunk-${allChunks.length}`,
        spaceId,
        notePath: note.path,
        noteTitle: note.title,
        chunkText: chunk.text,
        vector,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
      });
    }

    processed++;
    onProgress?.(processed, totalNotes);
  }

  // 3. Save vector index
  const index: SpaceVectorIndex = {
    spaceId,
    chunks: allChunks,
    updatedAt: new Date().toISOString(),
  };

  await saveVectorIndex(index);

  // 4. Update space noteCount
  await updateSpace(spaceId, { noteCount: totalNotes });

  return index;
}
