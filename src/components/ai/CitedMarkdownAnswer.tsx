import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import DOMPurify from "dompurify";
import { marked } from "marked";
import type { VaultCitation } from "../../utils/vault-rag";

interface CitedMarkdownAnswerProps {
  answer: string;
  citations: VaultCitation[];
  className: string;
  citationClassName: string;
  onOpenNote: (path: string) => void;
}

interface CitationPreview {
  citation: VaultCitation;
  top: number;
  left: number;
}

export function renderCitedMarkdownHtml(
  markdown: string,
  citations: VaultCitation[],
  citationClassName: string,
): string {
  const rendered = marked.parse(markdown, { async: false, breaks: true, gfm: true }) as string;
  const sanitized = DOMPurify.sanitize(rendered);
  if (typeof document === "undefined") return sanitized;

  const citationsById = new Map(citations.map((citation) => [citation.id, citation]));
  const template = document.createElement("template");
  template.innerHTML = sanitized;
  const walker = document.createTreeWalker(template.content, 4);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    const parent = textNode.parentElement;
    if (!parent?.closest("code, pre, a, button") && /\[\d+]/.test(textNode.data)) {
      textNodes.push(textNode);
    }
  }

  for (const textNode of textNodes) {
    const fragment = document.createDocumentFragment();
    const citationPattern = /\[(\d+)]/g;
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = citationPattern.exec(textNode.data)) !== null) {
      const citation = citationsById.get(Number(match[1]));
      if (!citation) continue;
      fragment.append(textNode.data.slice(cursor, match.index));
      const button = document.createElement("button");
      button.type = "button";
      button.className = citationClassName;
      button.dataset.vaultCitation = String(citation.id);
      button.title = `${citation.path}, lines ${citation.startLine}-${citation.endLine}`;
      const icon = document.createElement("span");
      icon.className = "shrink-0 text-[11px] opacity-80";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "▱";
      const label = document.createElement("span");
      label.className = "truncate";
      label.textContent = citation.path.split("/").pop() || citation.title;
      button.append(icon, label);
      fragment.append(button);
      cursor = match.index + match[0].length;
    }

    if (cursor === 0) continue;
    fragment.append(textNode.data.slice(cursor));
    textNode.replaceWith(fragment);
  }

  return template.innerHTML;
}

export function CitedMarkdownAnswer({
  answer,
  citations,
  className,
  citationClassName,
  onOpenNote,
}: CitedMarkdownAnswerProps) {
  const [preview, setPreview] = useState<CitationPreview | null>(null);
  const html = useMemo(
    () => renderCitedMarkdownHtml(answer, citations, citationClassName),
    [answer, citations, citationClassName],
  );

  const showPreview = (target: EventTarget | null) => {
    const element = target instanceof HTMLElement ? target : null;
    const button = element?.closest<HTMLButtonElement>("button[data-vault-citation]");
    if (!button) return;
    const citation = citations.find(
      (source) => source.id === Number(button.dataset.vaultCitation),
    );
    if (!citation) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(340, Math.max(260, window.innerWidth - 24));
    setPreview({
      citation,
      top: Math.min(rect.bottom + 8, window.innerHeight - 230),
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
    });
  };

  return (
    <>
      <div
        className={`${className} markdown-rendered`}
        onMouseOver={(event) => showPreview(event.target)}
        onFocusCapture={(event) => showPreview(event.target)}
        onMouseOut={(event) => {
          const target = event.target as HTMLElement;
          const button = target.closest("button[data-vault-citation]");
          if (button && !button.contains(event.relatedTarget as Node | null)) setPreview(null);
        }}
        onBlurCapture={(event) => {
          if ((event.target as HTMLElement).closest("button[data-vault-citation]")) setPreview(null);
        }}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          const button = target.closest<HTMLButtonElement>("button[data-vault-citation]");
          if (!button || !event.currentTarget.contains(button)) return;
          const citation = citations.find(
            (source) => source.id === Number(button.dataset.vaultCitation),
          );
          if (citation) onOpenNote(citation.path);
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {preview && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[10000] w-[min(340px,calc(100vw-24px))] overflow-hidden rounded-xl border border-(--border-medium) bg-(--bg-elevated) p-3 shadow-xl"
          style={{ top: preview.top, left: preview.left }}
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-[13px] text-(--text-muted)" aria-hidden="true">▱</span>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold text-(--text-primary)">
                {preview.citation.path.split("/").pop() || preview.citation.title}
              </div>
              <div className="mt-0.5 truncate text-[10px] text-(--text-muted)">
                {preview.citation.heading || preview.citation.path} · L{preview.citation.startLine}–{preview.citation.endLine}
              </div>
            </div>
          </div>
          <div className="mt-2 max-h-36 overflow-hidden whitespace-pre-wrap text-[12px] leading-[1.55] text-(--text-secondary)">
            {preview.citation.excerpt}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
