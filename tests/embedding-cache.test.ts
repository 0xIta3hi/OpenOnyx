// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '@xenova/transformers';
import {
  refreshEmbeddingMetadataIfUnchanged,
  resetEmbeddingsStore,
  simpleHash,
  type EmbeddingStore,
} from '../src/utils/embeddings';

beforeEach(() => {
  resetEmbeddingsStore();
  (window as any).electronAPI = {
    dataRead: vi.fn(async () => null),
    dataWrite: vi.fn(async () => {}),
    dataDelete: vi.fn(async () => {}),
    dataList: vi.fn(async () => []),
  };
});

describe('embedding cache metadata refresh', () => {
  it('uses local/cached and remote model configurations with WASM runtime path', () => {
    expect(env.allowLocalModels).toBe(true);
    expect(env.allowRemoteModels).toBe(true);
    expect(env.backends.onnx.wasm.proxy).toBe(false);
    expect(env.backends.onnx.wasm.wasmPaths).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/@xenova\/transformers@/);
  });

  it('updates cached file metadata without re-embedding unchanged content', () => {
    const content = '# Cached note\n\nSame content.';
    const store: EmbeddingStore = {
      entries: new Map([
        [
          'Cached.md',
          {
            path: 'Cached.md',
            hash: simpleHash(content),
            vector: [0.1, 0.2, 0.3],
            updatedAt: 100,
            modifiedAt: 1000,
            size: 12,
          },
        ],
      ]),
    };

    const refreshed = refreshEmbeddingMetadataIfUnchanged(
      store,
      'Cached.md',
      content,
      2000,
      content.length,
    );

    expect(refreshed).toBe(true);
    expect(store.entries.get('Cached.md')).toMatchObject({
      hash: simpleHash(content),
      vector: [0.1, 0.2, 0.3],
      modifiedAt: 2000,
      size: content.length,
    });
  });

  it('does not refresh metadata when content changed', () => {
    const store: EmbeddingStore = {
      entries: new Map([
        [
          'Changed.md',
          {
            path: 'Changed.md',
            hash: simpleHash('old content'),
            vector: [0.1, 0.2, 0.3],
            updatedAt: 100,
            modifiedAt: 1000,
            size: 11,
          },
        ],
      ]),
    };

    const refreshed = refreshEmbeddingMetadataIfUnchanged(
      store,
      'Changed.md',
      'new content',
      2000,
      11,
    );

    expect(refreshed).toBe(false);
    expect(store.entries.get('Changed.md')?.modifiedAt).toBe(1000);
  });
});
