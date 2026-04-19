/**
 * SuggestionBanner — Context-aware inline suggestions
 *
 * Features:
 *  - Grouped display: Strong Matches vs Broader Connections
 *  - Type labels: Related, Expands, Contradicts, Example
 *  - Contextual reasoning: explains WHY each suggestion is relevant
 *  - Confidence-based visibility: highlight/normal/collapsed
 *  - "Not linked" indicator
 *  - Typed link creation with accept/reject
 *
 * Never auto-applies. All link creation requires explicit user action.
 */

import React, { useState, useCallback } from "react";
import {
  Link,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  LinkIcon,
  Sparkles,
  Eye,
} from "lucide-react";
import type { EnrichedSuggestion } from "../utils/suggestion-enrichment";

// ── Link types ───────────────────────────────────────────────────────────────

export type LinkType = "related" | "supports" | "contradicts" | "example_of";

export const LINK_TYPES: { id: LinkType; label: string; symbol: string }[] = [
  { id: "related", label: "Related", symbol: "↔" },
  { id: "supports", label: "Supports", symbol: "→" },
  { id: "contradicts", label: "Contradicts", symbol: "⇄" },
  { id: "example_of", label: "Example of", symbol: "∈" },
];

// ── Props ────────────────────────────────────────────────────────────────────

export interface Suggestion {
  path: string;
  title: string;
  similarity: number;
}

interface SuggestionBannerProps {
  suggestions: EnrichedSuggestion[];
  onAccept: (path: string, linkType: LinkType) => void;
  onReject: (path: string) => void;
  onDismissAll: () => void;
  onOpenNote?: (path: string) => void;
}

// ── Type badge colors ────────────────────────────────────────────────────────

function getTypeBadgeClass(type: string): string {
  switch (type) {
    case "expands": return "suggestion-type-expands";
    case "contradicts": return "suggestion-type-contradicts";
    case "example": return "suggestion-type-example";
    default: return "suggestion-type-related";
  }
}

function getConfidenceClass(similarity: number): string {
  if (similarity >= 0.7) return "suggestion-confidence-high";
  if (similarity >= 0.5) return "suggestion-confidence-medium";
  return "suggestion-confidence-low";
}

// ── Component ────────────────────────────────────────────────────────────────

export function SuggestionBanner({
  suggestions,
  onAccept,
  onReject,
  onDismissAll,
  onOpenNote,
}: SuggestionBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeLinkSelector, setActiveLinkSelector] = useState<string | null>(null);
  const [showBroader, setShowBroader] = useState(false);

  if (suggestions.length === 0) return null;

  // Group suggestions
  const strongMatches = suggestions.filter((s) => s.group === "strong");
  const broaderConnections = suggestions.filter((s) => s.group === "broader");

  // Only show top 2 strong matches initially
  const visibleStrong = expanded ? strongMatches : strongMatches.slice(0, 2);
  const hasMore = strongMatches.length > 2;

  const renderSuggestionItem = (s: EnrichedSuggestion) => (
    <div
      key={s.path}
      className={`suggestion-item ${getConfidenceClass(s.similarity)} ${s.isLinked ? "suggestion-already-linked" : ""}`}
    >
      <div className="suggestion-item-content">
        <div className="suggestion-item-top">
          {/* Type badge */}
          <span className={`suggestion-type-badge ${getTypeBadgeClass(s.type)}`}>
            <span className="suggestion-type-symbol">{s.typeSymbol}</span>
            {s.typeLabel}
          </span>

          {/* Title */}
          <button
            className="suggestion-title-btn"
            onClick={() => onOpenNote?.(s.path)}
            title={`Open ${s.title}`}
          >
            {s.title}
          </button>

          {/* Score */}
          <span className="suggestion-score">
            {Math.round(s.similarity * 100)}%
          </span>

          {/* Not linked indicator */}
          {!s.isLinked && (
            <span className="suggestion-not-linked" title="Not yet linked">
              <LinkIcon size={10} />
            </span>
          )}
        </div>

        {/* Contextual reason */}
        <div className="suggestion-reason">
          <Sparkles size={10} />
          <span>{s.reason}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="suggestion-actions">
        {activeLinkSelector === s.path ? (
          <div className="suggestion-link-types">
            {LINK_TYPES.map((lt) => (
              <button
                key={lt.id}
                className="suggestion-link-type-btn"
                onClick={() => {
                  onAccept(s.path, lt.id);
                  setActiveLinkSelector(null);
                }}
                title={lt.label}
              >
                <span className="suggestion-link-symbol">{lt.symbol}</span>
                <span>{lt.label}</span>
              </button>
            ))}
            <button
              className="suggestion-link-cancel"
              onClick={() => setActiveLinkSelector(null)}
            >
              <X size={10} />
            </button>
          </div>
        ) : (
          <>
            <button
              className="suggestion-accept"
              onClick={() => setActiveLinkSelector(s.path)}
              title="Create link"
            >
              <Check size={12} />
              Link
            </button>
            <button
              className="suggestion-reject"
              onClick={() => onReject(s.path)}
              title="Dismiss"
            >
              <X size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="suggestion-banner">
      <div className="suggestion-banner-header">
        <div className="suggestion-banner-left">
          <Sparkles size={12} />
          <span className="suggestion-banner-label">
            {suggestions.length} connection{suggestions.length !== 1 ? "s" : ""} found
          </span>
        </div>
        <div className="suggestion-banner-right">
          {hasMore && (
            <button
              className="suggestion-banner-toggle"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Show less" : `+${strongMatches.length - 2} more`}
            </button>
          )}
          <button
            className="suggestion-banner-dismiss"
            onClick={onDismissAll}
            title="Dismiss all"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Strong Matches */}
      {visibleStrong.length > 0 && (
        <div className="suggestion-group">
          <div className="suggestion-group-label">
            <span className="suggestion-group-dot suggestion-dot-strong" />
            Strong Matches
          </div>
          <div className="suggestion-list">
            {visibleStrong.map(renderSuggestionItem)}
          </div>
        </div>
      )}

      {/* Broader Connections (collapsed by default) */}
      {broaderConnections.length > 0 && (
        <div className="suggestion-group">
          <button
            className="suggestion-group-toggle"
            onClick={() => setShowBroader(!showBroader)}
          >
            {showBroader ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span className="suggestion-group-dot suggestion-dot-broader" />
            Broader Connections
            <span className="suggestion-group-count">{broaderConnections.length}</span>
          </button>
          {showBroader && (
            <div className="suggestion-list">
              {broaderConnections.map(renderSuggestionItem)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
