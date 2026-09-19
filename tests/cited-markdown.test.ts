// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { renderCitedMarkdownHtml } from "../src/components/ai/CitedMarkdownAnswer";
import type { VaultCitation } from "../src/utils/vault-rag";

const citations: VaultCitation[] = [{
  id: 1,
  path: "Computer_Networks/DNS_and_HTTP/DNS_and_HTTP_Overview.md",
  title: "DNS and HTTP Overview",
  heading: "DNS lookup",
  startLine: 12,
  endLine: 20,
  excerpt: "A DNS resolver queries the hierarchy.",
  score: 1,
}];

describe("cited Markdown answer rendering", () => {
  it("renders Markdown blocks in reading mode and preserves clickable citations", () => {
    const html = renderCitedMarkdownHtml(
      "## DNS resolution\n\n- Check the **browser cache** [1]\n- Query the resolver",
      citations,
      "citation-marker",
    );
    const container = document.createElement("div");
    container.innerHTML = html;

    expect(container.querySelector("h2")?.textContent).toBe("DNS resolution");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("strong")?.textContent).toBe("browser cache");
    const citation = container.querySelector("button[data-vault-citation='1']");
    expect(citation?.textContent).toContain("DNS_and_HTTP_Overview.md");
    expect(citation?.getAttribute("title")).toContain("lines 12-20");
  });

  it("sanitizes HTML and does not convert citations inside code", () => {
    const html = renderCitedMarkdownHtml(
      "`lookup[1]`\n\n<script>alert('unsafe')</script>",
      citations,
      "citation-marker",
    );
    const container = document.createElement("div");
    container.innerHTML = html;

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("code")?.textContent).toBe("lookup[1]");
    expect(container.querySelector("button")).toBeNull();
  });
});
