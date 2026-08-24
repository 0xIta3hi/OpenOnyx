// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  getTopLevelFolder,
  isComprehensiveSpaceQuery,
  mapCloudRpcChunk,
  parseActionPayload,
  stripJSONBlock,
  retrieveChunks,
} from "../src/utils/spaces-rag";

describe("spaces RAG parsers", () => {
  it("parses a fenced action payload", () => {
    const parsed = parseActionPayload(`Sure.

\`\`\`json
{"intent":"create_note","actions":[{"type":"create_note","title":"A","path":"A.md","content":"hi"}]}
\`\`\`
`);
    expect(parsed.intent).toBe("create_note");
    expect(parsed.actions[0].title).toBe("A");
  });

  it("parses raw JSON with an action key", () => {
    const parsed = parseActionPayload('prefix {"action":"create_note","title":"B"} suffix');
    expect(parsed.action).toBe("create_note");
  });

  it("parses raw JSON with only a type key", () => {
    const parsed = parseActionPayload('prefix {"type":"update_note","file_path":"Note.md"} suffix');
    expect(parsed.type).toBe("update_note");
  });

  it("returns null for conversation-only replies", () => {
    expect(parseActionPayload("Deadlocks happen when...")).toBeNull();
    expect(parseActionPayload("")).toBeNull();
  });

  it("strips action JSON but keeps example code blocks", () => {
    const cleaned = stripJSONBlock(`Answer

\`\`\`python
print("hi")
\`\`\`

\`\`\`json
{"intent":"update_note","actions":[]}
\`\`\`
`);
    expect(cleaned).toContain("print(\"hi\")");
    expect(cleaned).not.toContain("update_note");
  });

  it("strips action JSON containing only type keys", () => {
    const cleaned = stripJSONBlock(`Answer

\`\`\`json
{"type":"update_note","file_path":"Note.md"}
\`\`\`
`);
    expect(cleaned).toBe("Answer");
  });

  it("repairs and parses truncated JSON action payloads", () => {
    const truncatedPayload = '```json\n{"type":"update_note","file_path":"Algorithms/Sorting.md","changes":{"after":"# Sorting';
    const parsed = parseActionPayload(truncatedPayload);
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("update_note");
    expect(parsed.file_path).toBe("Algorithms/Sorting.md");
  });

  it("strips truncated JSON action payloads completely", () => {
    const truncatedText = 'Here is your update:\n```json\n{"type":"update_note","file_path":"Algorithms/Sorting.md","changes":{"after":"# Sorting';
    const cleaned = stripJSONBlock(truncatedText);
    expect(cleaned).toBe("Here is your update:");
  });

  it("maps cloud RPC rows and keeps a path when the RPC provides one", () => {
    const withPath = mapCloudRpcChunk(
      { id: "1", note_title: "Note", content: "chunk", similarity: 0.8, path: "Folder/Note.md" },
      "space-1",
    );
    expect(withPath.chunk.notePath).toBe("Folder/Note.md");
    expect(withPath.chunk.noteTitle).toBe("Note");

    const missing = mapCloudRpcChunk({ id: "2", content: "x" }, "space-1");
    expect(missing.chunk.notePath).toBe("");
    expect(missing.chunk.noteTitle).toBe("Unknown Note");
  });

  it("detects overview queries", () => {
    expect(isComprehensiveSpaceQuery("what is in this vault?")).toBe(true);
    expect(isComprehensiveSpaceQuery("summarize the whole space")).toBe(true);
    expect(isComprehensiveSpaceQuery("what are deadlocks?")).toBe(false);
  });

  it("reads the top-level folder from a note path", () => {
    expect(getTopLevelFolder("Systems/Locks.md")).toBe("Systems");
    expect(getTopLevelFolder("Hello.md")).toBe("(root)");
    expect(getTopLevelFolder("")).toBe("(root)");
  });

  it("retrieves chunks and includes isLexicalFallback indicator", async () => {
    (window as any).electronAPI = {
      dataRead: async () => null,
    };
    const res = await retrieveChunks("space-1", "test query");
    expect(res).toBeDefined();
    expect(typeof res.isLexicalFallback).toBe("boolean");
  });
});
