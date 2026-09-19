// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  chunkMarkdown,
  collectMarkdownPaths,
  extractCitationIds,
  rankVaultPassages,
} from "../src/utils/vault-rag";
import type { FileEntry } from "../src/types";

function entry(overrides: Partial<FileEntry> & Pick<FileEntry, "name" | "path">): FileEntry {
  return {
    absolutePath: `/vault/${overrides.path}`,
    isDirectory: false,
    extension: "",
    modifiedAt: 0,
    size: 0,
    ...overrides,
  };
}

describe("vault RAG citations", () => {
  it("collects Markdown notes from the live tree even when they are not embedded", () => {
    const tree = [
      entry({
        name: "Systems",
        path: "Systems",
        isDirectory: true,
        children: [
          entry({ name: "Cache.md", path: "Systems/Cache.md", extension: ".md" }),
          entry({ name: "Diagram.canvas", path: "Systems/Diagram.canvas", extension: ".canvas" }),
        ],
      }),
      entry({ name: "README.MD", path: "README.MD" }),
    ];

    expect(collectMarkdownPaths(tree)).toEqual(["Systems/Cache.md", "README.MD"]);
  });

  it("preserves headings and exact line ranges when chunking Markdown", () => {
    const passages = chunkMarkdown("Research/Cache.md", "# Cache\n\nIntro text.\n\n## Eviction\n\nLRU removes the least recently used item.");

    expect(passages).toEqual([
      expect.objectContaining({ heading: "Cache", startLine: 3, endLine: 3, excerpt: "Intro text." }),
      expect.objectContaining({ heading: "Eviction", startLine: 7, endLine: 7, excerpt: "LRU removes the least recently used item." }),
    ]);
  });

  it("ranks the passage containing the query terms above unrelated passages", () => {
    const results = rankVaultPassages("cache eviction policy", [
      { path: "Cooking.md", content: "# Soup\n\nAdd salt and water.", semanticScore: 0.1 },
      { path: "Systems/Cache.md", content: "# Cache\n\nAn LRU eviction policy removes the least recently used entry.", semanticScore: 0.4 },
    ]);

    expect(results[0]).toEqual(expect.objectContaining({ path: "Systems/Cache.md", heading: "Cache", id: 1 }));
    expect(results[0].excerpt).toContain("LRU eviction policy");
  });

  it("accepts only citation ids that exist in the supplied context", () => {
    expect(extractCitationIds("Claim [2]. Another [99]. Repeated [2] and [1].", 3)).toEqual([2, 1]);
  });
});
