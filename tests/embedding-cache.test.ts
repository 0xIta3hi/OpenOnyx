// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '@xenova/transformers';
import {
  getRemoteEmbeddingModelSubpath,
  refreshEmbeddingMetadataIfUnchanged,
  resetEmbeddingsStore,
  resolveTransformersWasmPath,
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
  it('uses the disk-cached remote model configuration with WASM runtime path', () => {
    expect(env.allowLocalModels).toBe(false);
    expect(env.allowRemoteModels).toBe(true);
    expect(env.useBrowserCache).toBe(false);
    expect(env.backends.onnx.wasm.proxy).toBe(false);
    expect(env.backends.onnx.wasm.wasmPaths).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/@xenova\/transformers@/);
  });

  it('resolves WASM assets beside index.html in dev and packaged builds', () => {
    expect(resolveTransformersWasmPath('2.17.2', 'http://localhost:5173/index.html', false))
      .toBe('http://localhost:5173/wasm/');
    expect(resolveTransformersWasmPath('2.17.2', 'file:///opt/OpenOnyx/resources/app.asar/dist/index.html', false))
      .toBe('file:///opt/OpenOnyx/resources/app.asar/dist/wasm/');
  });

  it('only caches model files fetched from the remote model host', () => {
    expect(getRemoteEmbeddingModelSubpath(
      'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer.json',
    )).toBe('tokenizer.json');
    expect(getRemoteEmbeddingModelSubpath(
      'http://localhost:5173/models/Xenova/all-MiniLM-L6-v2/tokenizer.json',
    )).toBeNull();
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
