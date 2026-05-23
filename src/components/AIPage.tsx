/**
 * AIPage — Knowledge Graph Intelligence Panel
 *
 * Tabs:
 *  1. Suggest — auto-suggestions for active note
 *  2. Insights — clusters, missing links, unwritten insights, synthesis
 *  3. Query — RAG-based Q&A
 *  4. Spaces — export/import knowledge spaces
 *  5. Settings — AI provider configuration
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getAPI } from "../utils/api";
import { FileEntry, Theme } from "../types";
import {
  Sparkles,
  Settings,
  Send,
  Loader2,
  AlertCircle,
  X,
  Maximize,
  Minimize,
  FileText,
  ExternalLink,
  Key,
  Check,
  Link,
  Search,
  Brain,
  Lightbulb,
  Layers,
  GitBranch,
  CircleDot,
  Save,
  Download,
  Upload,
  Eye,
  Zap,
} from "lucide-react";
import { SpacesIcon } from "./SpacesIcon";
import {
  loadStore,
  findSimilar,
  searchByQuery,
  applyHistoryWeighting,
  recordSuggestion,
  isModelLoaded,
  getLoadProgress,
  setProgressCallback,
  type EmbeddingStore,
  type SimilarNote,
} from "../utils/embeddings";
import {
  queryRAG,
  isAIConfigured,
  getCachedAnnotation,
} from "../utils/ai-core";
import {
  detectClusters,
  detectMissingLinks,
  detectUnwrittenInsights,
  generateSynthesis,
  type NoteCluster,
  type MissingLinkSuggestion,
  type UnwrittenInsight,
  type SynthesisResult,
} from "../utils/synthesis";
import {
  exportSpace,
  importSpace,
  type ImportResult,
} from "../utils/space";
import {
  loadSettings,
  saveSettings,
  getModelsForProvider,
  AI_PROVIDER_PRESETS,
  type AISettings,
  DEFAULT_MODEL_ID,
} from "../utils/ai-settings";
import { LINK_TYPES, type LinkType } from "./SuggestionBanner";
import { enrichSuggestions, type EnrichedSuggestion } from "../utils/suggestion-enrichment";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getNoteName(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/, "") || path;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface AIPageProps {
  vaultPath: string | null;
  theme: Theme;
  fileTree: FileEntry[];
  activeNotePath?: string | null;
  onOpenNote: (path: string) => void;
  onClose: () => void;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
}

type AITab = "suggestions" | "insights" | "query" | "spaces";

export function AIPage({
  vaultPath,
  theme,
  fileTree,
  activeNotePath,
  onOpenNote,
  onClose,
  isFullScreen,
  onToggleFullScreen,
}: AIPageProps) {
  const api = useMemo(() => getAPI(), []);

  // ── Tab ────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<AITab>("suggestions");

  // ── AI Settings ────────────────────────────────────
  const [aiSettings, setAiSettings] = useState<AISettings>(loadSettings);

  useEffect(() => {
    const handleSettingsChanged = () => {
      setAiSettings(loadSettings());
    };
    window.addEventListener("ai-settings-changed", handleSettingsChanged);
    return () => {
      window.removeEventListener("ai-settings-changed", handleSettingsChanged);
    };
  }, []);

  const hasApiKey = !!aiSettings.apiKey;
  const models = getModelsForProvider(aiSettings.provider);
  const matchedModel = models.find((m) => m.id === aiSettings.modelId);
  const isCustomModel = !matchedModel && aiSettings.provider === "openrouter";
  const currentModel = matchedModel || (isCustomModel ? {
    id: aiSettings.modelId,
    label: aiSettings.modelId,
    shortLabel: aiSettings.modelId.split("/").pop() || aiSettings.modelId,
    description: "Custom OpenRouter Model",
    supportsGrounding: false
  } : models[0]);

  // ── Model status ───────────────────────────────────
  const [modelStatus, setModelStatus] = useState<string>(
    isModelLoaded() ? "ready" : "not loaded"
  );
  const [modelProgress, setModelProgress] = useState(isModelLoaded() ? 100 : 0);

  useEffect(() => {
    setProgressCallback((progress, status) => {
      setModelProgress(progress);
      setModelStatus(status);
    });
    return () => setProgressCallback(null);
  }, []);

  // ── Embedding store ────────────────────────────────
  const [store, setStore] = useState<EmbeddingStore>(loadStore);
  const indexedCount = store.entries.size;

  useEffect(() => {
    const interval = setInterval(() => setStore(loadStore()), 3000);
    return () => clearInterval(interval);
  }, []);

  // ── Suggestion threshold (user-controlled) ────────
  const [suggestionThreshold, setSuggestionThreshold] = useState(() => {
    try {
      const saved = localStorage.getItem("openobsidian-suggestion-threshold");
      return saved ? parseFloat(saved) : 0.35;
    } catch { return 0.35; }
  });

  const updateThreshold = useCallback((value: number) => {
    setSuggestionThreshold(value);
    localStorage.setItem("openobsidian-suggestion-threshold", value.toString());
  }, []);

  // ── Auto-suggestions for active note ───────────────
  const [suggestions, setSuggestions] = useState<EnrichedSuggestion[]>([]);
  const [linkTypeSelector, setLinkTypeSelector] = useState<string | null>(null);

  useEffect(() => {
    if (!activeNotePath || indexedCount === 0) {
      setSuggestions([]);
      return;
    }

    (async () => {
      try {
        const currentStore = loadStore();
        const raw = findSimilar(currentStore, activeNotePath, Math.max(0.2, suggestionThreshold - 0.15), 8);
        const weighted = applyHistoryWeighting(activeNotePath, raw);
        const basic = weighted.map((s) => ({ ...s, title: getNoteName(s.path) }));

        // Load source + target contents for enrichment
        let sourceContent = "";
        try { sourceContent = await api.readFile(activeNotePath); } catch { /* empty */ }

        const noteContents = new Map<string, string>();
        await Promise.all(
          basic.map(async (s) => {
            try {
              const content = await api.readFile(s.path);
              noteContents.set(s.path, content);
            } catch { /* skip */ }
          }),
        );

        const enriched = enrichSuggestions(sourceContent, basic, noteContents);
        // Apply threshold filter after enrichment
        setSuggestions(enriched.filter((s) => s.similarity >= suggestionThreshold).slice(0, 8));
      } catch { /* silent */ }
    })();
  }, [activeNotePath, indexedCount, suggestionThreshold, api]);

  const handleAcceptSuggestion = useCallback(
    async (targetPath: string, linkType: LinkType) => {
      if (!activeNotePath) return;
      try {
        const content = await api.readFile(activeNotePath);
        const targetName = getNoteName(targetPath);
        const linkText = linkType === "related"
          ? `[[${targetName}]]`
          : `[[${targetName}]] %%${linkType}%%`;
        const separator = content.endsWith("\n") ? "\n" : "\n\n";
        await api.writeFile(activeNotePath, content + separator + linkText + "\n");
        recordSuggestion({ sourcePath: activeNotePath, targetPath, action: "accepted", timestamp: Date.now() });
        setSuggestions((prev) => prev.filter((s) => s.path !== targetPath));
        setLinkTypeSelector(null);
      } catch (err) {
        console.error("Failed to create link:", err);
      }
    },
    [activeNotePath, api],
  );

  const handleRejectSuggestion = useCallback(
    (targetPath: string) => {
      if (!activeNotePath) return;
      recordSuggestion({ sourcePath: activeNotePath, targetPath, action: "rejected", timestamp: Date.now() });
      setSuggestions((prev) => prev.filter((s) => s.path !== targetPath));
      setLinkTypeSelector(null);
    },
    [activeNotePath],
  );

  // ── Insights: Clusters + Missing Links + Unwritten Insights + Synthesis ──
  const [clusters, setClusters] = useState<NoteCluster[]>([]);
  const [missingLinks, setMissingLinks] = useState<MissingLinkSuggestion[]>([]);
  const [unwrittenInsights, setUnwrittenInsights] = useState<UnwrittenInsight[]>([]);
  const [synthesisResult, setSynthesisResult] = useState<SynthesisResult | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [selectedClusterIdx, setSelectedClusterIdx] = useState<number | null>(null);

  // Insight dismissal cooldown (prevent noise)
  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("openobsidian-dismissed-insights");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set<string>(); }
  });

  const dismissInsight = useCallback((idx: number) => {
    const insight = unwrittenInsights[idx];
    if (!insight) return;
    const key = insight.relatedNotes.sort().join("|");
    setDismissedInsights((prev) => {
      const next = new Set(prev);
      next.add(key);
      localStorage.setItem("openobsidian-dismissed-insights", JSON.stringify([...next]));
      return next;
    });
    setUnwrittenInsights((prev) => prev.filter((_, i) => i !== idx));
  }, [unwrittenInsights]);

  // Auto-compute clusters, missing links, and unwritten insights
  useEffect(() => {
    if (indexedCount < 3) {
      setClusters([]);

      setMissingLinks([]);
      setUnwrittenInsights([]);
      return;
    }
    const currentStore = loadStore();
    const c = detectClusters(currentStore, 0.4, 3);
    setClusters(c);

    (async () => {
      const contents = new Map<string, string>();
      await Promise.all(
        [...currentStore.entries.keys()].map(async (path) => {
          try {
            const content = await api.readFile(path);
            contents.set(path, content);
          } catch { /* skip */ }
        }),
      );
      const ml = detectMissingLinks(currentStore, contents, 0.4, 10);
      setMissingLinks(ml);
      const rawInsights = detectUnwrittenInsights(currentStore, contents, 0.35);
      // Filter: confidence ≥ 0.4, exclude dismissed, max 3
      const filtered = rawInsights
        .filter((ui) => ui.confidence >= 0.4)
        .filter((ui) => {
          const key = ui.relatedNotes.sort().join("|");
          return !dismissedInsights.has(key);
        })
        .slice(0, 3);
      setUnwrittenInsights(filtered);
    })();
  }, [indexedCount, api, dismissedInsights]);

  const handleSynthesizeCluster = useCallback(
    async (clusterMembers: string[]) => {
      setIsSynthesizing(true);
      setSynthesisResult(null);
      try {
        const notes = await Promise.all(
          clusterMembers.slice(0, 5).map(async (path) => {
            const content = await api.readFile(path);
            return { title: getNoteName(path), content };
          }),
        );
        const result = await generateSynthesis(notes);
        if (result) {
          setSynthesisResult(result);
        } else {
          setSynthesisResult({ insight: "Could not generate synthesis. Ensure API key is configured.", confidence: 0 });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Synthesis failed";
        setSynthesisResult({ insight: `⚠️ ${msg}`, confidence: 0 });
      } finally {
        setIsSynthesizing(false);
      }
    },
    [api],
  );

  const handleSaveSynthesis = useCallback(async () => {
    if (!synthesisResult || !vaultPath) return;
    try {
      const timestamp = new Date().toISOString().slice(0, 10);
      const fileName = `Synthesis ${timestamp}.md`;
      const content = `---\ntype: synthesis\ndate: ${timestamp}\nconfidence: ${synthesisResult.confidence.toFixed(2)}\n---\n\n# Synthesis\n\n${synthesisResult.insight}\n`;
      await api.createFile(fileName, content);
      onOpenNote(fileName);
    } catch (err) {
      console.error("Failed to save synthesis:", err);
    }
  }, [synthesisResult, vaultPath, api, onOpenNote]);

  const handleAcceptMissingLink = useCallback(
    async (from: string, to: string) => {
      try {
        const content = await api.readFile(from);
        const targetName = getNoteName(to);
        const separator = content.endsWith("\n") ? "\n" : "\n\n";
        await api.writeFile(from, content + separator + `[[${targetName}]]\n`);
        setMissingLinks((prev) => prev.filter((ml) => !(ml.from === from && ml.to === to)));
      } catch (err) {
        console.error("Failed to create link:", err);
      }
    },
    [api],
  );

  // ── Spaces: Export/Import ──────────────────────────
  const [spaceTitle, setSpaceTitle] = useState("");
  const [spaceDesc, setSpaceDesc] = useState("");
  const [includeEmbeddings, setIncludeEmbeddings] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(async () => {
    if (!spaceTitle.trim()) return;
    setIsExporting(true);
    try {
      await exportSpace({
        title: spaceTitle.trim(),
        description: spaceDesc.trim(),
        includeEmbeddings,
      });
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  }, [spaceTitle, spaceDesc, includeEmbeddings]);

  const handleImport = useCallback(async (file: File) => {
    setIsImporting(true);
    setImportResult(null);
    try {
      const result = await importSpace(file);
      setImportResult(result);
    } catch (err) {
      console.error("Import failed:", err);
    } finally {
      setIsImporting(false);
    }
  }, []);

  // ── Query (RAG) ────────────────────────────────────
  const [queryInput, setQueryInput] = useState("");
  const [queryResult, setQueryResult] = useState<{ answer: string; sources: string[] } | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);

  const handleQuery = useCallback(async () => {
    const q = queryInput.trim();
    if (!q || indexedCount === 0) return;
    setIsQuerying(true);
    setQueryResult(null);
    try {
      const relevant = await searchByQuery(loadStore(), q, 8);
      const results = await Promise.all(
        relevant.map(async (r) => {
          try {
            const content = await api.readFile(r.path);
            return { title: getNoteName(r.path), content, similarity: r.similarity };
          } catch {
            return null;
          }
        }),
      );
      const notesWithContent = results.filter((n): n is { title: string; content: string; similarity: number } => n !== null);
      const result = await queryRAG(q, notesWithContent);
      setQueryResult(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Query failed";
      setQueryResult({ answer: `⚠️ ${msg}`, sources: [] });
    } finally {
      setIsQuerying(false);
    }
  }, [queryInput, indexedCount, api]);

  const handleQueryKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleQuery(); }
  };

  // ── Enriched suggestion renderer ──────────────────────────────────────────

  const renderEnrichedSuggestion = (
    s: EnrichedSuggestion,
    activeLinkSel: string | null,
    setActiveLinkSel: (v: string | null) => void,
    onAccept: (path: string, linkType: LinkType) => void,
    onReject: (path: string) => void,
    onOpen: (path: string) => void,
  ) => {
    const confidenceClass =
      s.similarity >= 0.7 ? "ai-confidence-high" :
      s.similarity >= 0.5 ? "ai-confidence-medium" : "ai-confidence-low";

    const typeBadgeClass =
      s.type === "expands" ? "ai-type-expands" :
      s.type === "contradicts" ? "ai-type-contradicts" :
      s.type === "example" ? "ai-type-example" : "ai-type-related";

    return (
      <div key={s.path} className={`ai-suggestion-item ${confidenceClass} ${s.isLinked ? "ai-suggestion-linked" : ""}`}>
        <div className="ai-suggestion-content">
          <div className="ai-suggestion-top-row">
            <span className={`ai-suggestion-type-badge ${typeBadgeClass}`}>
              {s.typeSymbol} {s.typeLabel}
            </span>
            <button className="ai-suggestion-info" onClick={() => onOpen(s.path)}>
              <span className="ai-suggestion-title">{s.title}</span>
            </button>
            <span className="ai-suggestion-score">{Math.round(s.similarity * 100)}%</span>
            {!s.isLinked && (
              <span className="ai-suggestion-not-linked" title="Not yet linked">⊘</span>
            )}
          </div>
          <div className="ai-suggestion-reason">
            <Sparkles size={10} />
            <span>{s.reason}</span>
          </div>
        </div>
        <div className="ai-suggestion-actions">
          {activeLinkSel === s.path ? (
            <div className="ai-link-type-selector">
              {LINK_TYPES.map((lt) => (
                <button key={lt.id} className="ai-link-type-btn" onClick={() => { onAccept(s.path, lt.id); setActiveLinkSel(null); }}>
                  <span>{lt.symbol}</span><span>{lt.label}</span>
                </button>
              ))}
              <button className="ai-link-cancel" onClick={() => setActiveLinkSel(null)}><X size={10} /></button>
            </div>
          ) : (
            <>
              <button className="ai-suggestion-accept" onClick={() => setActiveLinkSel(s.path)} title="Create link">
                <Check size={12} /> Link
              </button>
              <button className="ai-suggestion-reject" onClick={() => onReject(s.path)} title="Dismiss"><X size={12} /></button>
            </>
          )}
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <>
      {/* Header */}
      <div className="graph-header thought-model-header">
        <h2>
          <Brain size={18} strokeWidth={1.5} style={{ opacity: 0.5 }} />
          Knowledge Graph
        </h2>
        <div className="thought-model-controls">
          {indexedCount > 0 && (
            <div className="thought-model-stats">
              <span>{indexedCount} indexed</span>
            </div>
          )}
          {onToggleFullScreen && (
            <button className="btn btn-ghost" onClick={onToggleFullScreen}>
              {isFullScreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="thought-model-content">
        {/* Model loading indicator */}
        {modelStatus !== "ready" && modelStatus !== "not loaded" && modelStatus !== "Model ready" && (
          <div className="ai-model-status">
            <Loader2 size={12} className="thought-model-spinner" />
            <span>{modelStatus}</span>
            {modelProgress > 0 && modelProgress < 100 && (
              <div className="ai-model-progress">
                <div className="ai-model-progress-bar" style={{ width: `${modelProgress}%` }} />
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="thought-model-tabs">
          <button className={`thought-model-tab ${activeTab === "suggestions" ? "active" : ""}`} onClick={() => setActiveTab("suggestions")}>
            <Link size={14} /> Suggest
          </button>
          <button className={`thought-model-tab ${activeTab === "insights" ? "active" : ""}`} onClick={() => setActiveTab("insights")}>
            <Lightbulb size={14} /> Insights
          </button>
          <button className={`thought-model-tab ${activeTab === "query" ? "active" : ""}`} onClick={() => setActiveTab("query")}>
            <Search size={14} /> Query
          </button>
          <button className={`thought-model-tab ${activeTab === "spaces" ? "active" : ""}`} onClick={() => setActiveTab("spaces")}>
            <SpacesIcon size={14} /> Spaces
          </button>
        </div>

        {/* ══ Suggestions Tab ═════════════════════════════ */}
        {activeTab === "suggestions" && (
          <div className="ai-suggest-tab">
            {indexedCount === 0 ? (
              <div className="ai-empty-state">
                <Layers size={32} style={{ opacity: 0.15 }} />
                <p>Open and save a note to start building the index automatically.</p>
              </div>
            ) : !activeNotePath ? (
              <div className="ai-empty-state">
                <Link size={28} style={{ opacity: 0.15 }} />
                <p>Open a note to see similar notes suggested here.</p>
              </div>
            ) : suggestions.length > 0 ? (
              <div className="ai-suggestions-list">
                <div className="ai-suggestions-header">Connections for "{getNoteName(activeNotePath)}"</div>
                {/* Similarity threshold control */}
                <div className="ai-threshold-control">
                  <label className="ai-threshold-label">
                    <span>Sensitivity</span>
                    <span className="ai-threshold-value">{Math.round(suggestionThreshold * 100)}%</span>
                  </label>
                  <input
                    type="range"
                    min="0.2"
                    max="0.7"
                    step="0.05"
                    value={suggestionThreshold}
                    onChange={(e) => updateThreshold(parseFloat(e.target.value))}
                    className="ai-threshold-slider"
                  />
                  <div className="ai-threshold-labels">
                    <span>Broad</span>
                    <span>Precise</span>
                  </div>
                </div>

                {/* ── Strong Matches ─── */}
                {(() => {
                  const strong = suggestions.filter((s) => s.group === "strong");
                  const broader = suggestions.filter((s) => s.group === "broader");
                  return (
                    <>
                      {strong.length > 0 && (
                        <div className="ai-suggestion-group">
                          <div className="ai-suggestion-group-label">
                            <span className="ai-dot ai-dot-strong" />
                            Strong Matches
                          </div>
                          {strong.map((s) => renderEnrichedSuggestion(s, linkTypeSelector, setLinkTypeSelector, handleAcceptSuggestion, handleRejectSuggestion, onOpenNote))}
                        </div>
                      )}
                      {broader.length > 0 && (
                        <div className="ai-suggestion-group">
                          <div className="ai-suggestion-group-label">
                            <span className="ai-dot ai-dot-broader" />
                            Broader Connections
                          </div>
                          {broader.map((s) => renderEnrichedSuggestion(s, linkTypeSelector, setLinkTypeSelector, handleAcceptSuggestion, handleRejectSuggestion, onOpenNote))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="ai-empty-state">
                <p>No similar notes found for "{getNoteName(activeNotePath)}".</p>
                <p className="ai-section-hint">Similarity updates automatically when notes are saved.</p>
              </div>
            )}
          </div>
        )}

        {/* ══ Insights Tab ════════════════════════════════ */}
        {activeTab === "insights" && (
          <div className="ai-insights-tab">
            {indexedCount < 3 ? (
              <div className="ai-empty-state">
                <Layers size={32} style={{ opacity: 0.15 }} />
                <p>Need at least 3 indexed notes for graph intelligence.</p>
              </div>
            ) : (
              <>
                {/* Unwritten Insights */}
                {unwrittenInsights.length > 0 && (
                  <div className="ai-synthesis-section">
                    <div className="ai-section-header">
                      <Zap size={12} style={{ opacity: 0.5 }} />
                      <span>Unwritten Insights</span>
                      <span className="ai-section-badge">{unwrittenInsights.length}</span>
                    </div>
                    <div className="ai-unwritten-list">
                      {unwrittenInsights.map((insight, idx) => (
                        <div key={idx} className="ai-unwritten-item">
                          <div className="ai-unwritten-description">
                            <Eye size={11} style={{ opacity: 0.4, flexShrink: 0, marginTop: 2 }} />
                            <span>{insight.description}</span>
                          </div>
                          <div className="ai-unwritten-notes">
                            {insight.relatedNotes.slice(0, 4).map((path) => (
                              <button key={path} className="ai-cluster-member" onClick={() => onOpenNote(path)}>
                                <FileText size={10} />
                                <span>{getNoteName(path)}</span>
                              </button>
                            ))}
                          </div>
                          <div className="ai-unwritten-actions">
                            <button
                              className="btn btn-ghost btn-xs"
                              onClick={() => handleAcceptMissingLink(insight.relatedNotes[0], insight.relatedNotes[1])}
                            >
                              <Link size={10} /> Connect
                            </button>
                            {hasApiKey && insight.relatedNotes.length >= 2 && (
                              <button
                                className="btn btn-ghost btn-xs"
                                onClick={() => handleSynthesizeCluster(insight.relatedNotes)}
                                disabled={isSynthesizing}
                              >
                                <Sparkles size={10} /> Synthesize
                              </button>
                            )}
                            <button
                              className="btn btn-ghost btn-xs"
                              onClick={() => dismissInsight(idx)}
                            >
                              <X size={10} />
                            </button>
                          </div>
                          <span className="ai-confidence-badge">{Math.round(insight.confidence * 100)}% confidence</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Clusters */}
                <div className="ai-synthesis-section">
                  <div className="ai-section-header">
                    <CircleDot size={12} style={{ opacity: 0.5 }} />
                    <span>Note Clusters</span>
                    <span className="ai-section-badge">{clusters.length}</span>
                  </div>
                  {clusters.length === 0 ? (
                    <p className="ai-section-hint">No strong clusters detected yet.</p>
                  ) : (
                    <div className="ai-cluster-list">
                      {clusters.map((cluster, idx) => (
                        <div key={idx} className={`ai-cluster-item ${selectedClusterIdx === idx ? "active" : ""}`}>
                          <button className="ai-cluster-header-btn" onClick={() => setSelectedClusterIdx(selectedClusterIdx === idx ? null : idx)}>
                            <GitBranch size={12} />
                            <span className="ai-cluster-name">{getNoteName(cluster.center)} + {cluster.members.length - 1} notes</span>
                            <span className="ai-confidence-badge">{Math.round(cluster.confidence * 100)}%</span>
                          </button>
                          {selectedClusterIdx === idx && (
                            <div className="ai-cluster-members">
                              {cluster.members.map((path) => (
                                <button key={path} className="ai-cluster-member" onClick={() => onOpenNote(path)}>
                                  <FileText size={10} />
                                  <span>{getNoteName(path)}</span>
                                </button>
                              ))}
                              {hasApiKey && cluster.confidence >= 0.3 && (
                                <button
                                  className="btn btn-ghost btn-xs"
                                  onClick={() => handleSynthesizeCluster(cluster.members)}
                                  disabled={isSynthesizing}
                                  style={{ marginTop: 4 }}
                                >
                                  {isSynthesizing ? (
                                    <><Loader2 size={10} className="thought-model-spinner" /> Synthesizing...</>
                                  ) : (
                                    <><Sparkles size={10} /> Synthesize cluster</>
                                  )}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Synthesis result */}
                {synthesisResult && (
                  <div className="ai-synthesis-section">
                    <div className="ai-section-header">
                      <Sparkles size={12} style={{ opacity: 0.5 }} />
                      <span>Synthesis</span>
                      <span className="ai-confidence-badge">{Math.round(synthesisResult.confidence * 100)}% confidence</span>
                    </div>
                    <div className="ai-synthesis-result">
                      <p>{synthesisResult.insight}</p>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-ghost btn-xs" onClick={handleSaveSynthesis}>
                        <Save size={10} /> Save as note
                      </button>
                      <button className="btn btn-ghost btn-xs" onClick={() => setSynthesisResult(null)}>
                        <X size={10} /> Dismiss
                      </button>
                    </div>
                  </div>
                )}

                {/* Missing Links */}
                <div className="ai-synthesis-section">
                  <div className="ai-section-header">
                    <Link size={12} style={{ opacity: 0.5 }} />
                    <span>Missing Links</span>
                    <span className="ai-section-badge">{missingLinks.length}</span>
                  </div>
                  {missingLinks.length === 0 ? (
                    <p className="ai-section-hint">All strongly related notes are already linked.</p>
                  ) : (
                    <div className="ai-suggestions-list" style={{ padding: 0 }}>
                      {missingLinks.map((ml, idx) => (
                        <div key={idx} className="ai-suggestion-item">
                          <div className="ai-missing-link-info">
                            <button className="ai-cluster-member" onClick={() => onOpenNote(ml.from)}>
                              <FileText size={10} /><span>{getNoteName(ml.from)}</span>
                            </button>
                            <span className="ai-missing-link-arrow">→</span>
                            <button className="ai-cluster-member" onClick={() => onOpenNote(ml.to)}>
                              <FileText size={10} /><span>{getNoteName(ml.to)}</span>
                            </button>
                            <span className="ai-suggestion-score">{ml.reason}</span>
                          </div>
                          <div className="ai-suggestion-actions">
                            <button className="ai-suggestion-accept" onClick={() => handleAcceptMissingLink(ml.from, ml.to)}>
                              <Check size={10} /> Link
                            </button>
                            <button className="ai-suggestion-reject" onClick={() => setMissingLinks((prev) => prev.filter((_, i) => i !== idx))}>
                              <X size={10} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ Query Tab (RAG) ═════════════════════════════ */}
        {activeTab === "query" && (
          <div className="ai-query-tab">
            {indexedCount === 0 ? (
              <div className="ai-empty-state">
                <Layers size={32} style={{ opacity: 0.15 }} />
                <p>Save some notes first to enable queries.</p>
              </div>
            ) : !hasApiKey ? (
              <div className="ai-empty-state">
                <Key size={28} style={{ opacity: 0.15 }} />
                <p>Add an API key in Settings to ask questions about your notes.</p>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("open-settings", { detail: { section: "ai" } }));
                  }}
                >
                  <Settings size={14} /> Open Settings
                </button>
              </div>
            ) : (
              <>
                <div className="ai-query-input-area">
                  <div className="ai-query-box">
                    <Search size={14} className="ai-query-icon" />
                    <input
                      type="text"
                      className="ai-query-input"
                      value={queryInput}
                      onChange={(e) => setQueryInput(e.target.value)}
                      onKeyDown={handleQueryKeyDown}
                      placeholder="Ask about your notes..."
                    />
                    <button className="ai-query-send" onClick={handleQuery} disabled={!queryInput.trim() || isQuerying}>
                      {isQuerying ? <Loader2 size={14} className="thought-model-spinner" /> : <Send size={14} />}
                    </button>
                  </div>
                  <p className="ai-query-info">Finds relevant notes via semantic search, then asks AI for an answer.</p>
                </div>
                {queryResult && (
                  <div className="ai-query-result">
                    <div className="ai-query-answer"><p>{queryResult.answer}</p></div>
                    {queryResult.sources.length > 0 && (
                      <div className="ai-query-sources">
                        <span className="ai-query-sources-label">Sources:</span>
                        {queryResult.sources.map((s, i) => (
                          <span key={i} className="ai-query-source">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══ Spaces Tab (Export/Import) ═══════════════════ */}
        {activeTab === "spaces" && (
          <div className="ai-spaces-tab">
            {/* Export Section */}
            <div className="ai-synthesis-section">
              <div className="ai-section-header">
                <Download size={12} style={{ opacity: 0.5 }} />
                <span>Export Space</span>
              </div>
              <p className="ai-section-hint">
                Package your vault as a shareable knowledge space with notes, links, and insights.
              </p>
              <div className="ai-space-form">
                <input
                  type="text"
                  className="ai-setting-input"
                  placeholder="Space title"
                  value={spaceTitle}
                  onChange={(e) => setSpaceTitle(e.target.value)}
                />
                <input
                  type="text"
                  className="ai-setting-input"
                  placeholder="Description (optional)"
                  value={spaceDesc}
                  onChange={(e) => setSpaceDesc(e.target.value)}
                />
                <label className="ai-space-checkbox">
                  <input
                    type="checkbox"
                    checked={includeEmbeddings}
                    onChange={(e) => setIncludeEmbeddings(e.target.checked)}
                  />
                  <span>Include analysis data (faster import)</span>
                </label>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleExport}
                  disabled={isExporting || !spaceTitle.trim()}
                >
                  {isExporting ? (
                    <><Loader2 size={14} className="thought-model-spinner" /> Exporting...</>
                  ) : (
                    <><Download size={14} /> Export .openobsidian.zip</>
                  )}
                </button>
              </div>
            </div>

            {/* Import Section */}
            <div className="ai-synthesis-section">
              <div className="ai-section-header">
                <Upload size={12} style={{ opacity: 0.5 }} />
                <span>Import Space</span>
              </div>
              <p className="ai-section-hint">
                Import a .openobsidian.zip archive to restore notes, links, and structure.
              </p>
              <input
                type="file"
                ref={fileInputRef}
                accept=".zip"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImport(file);
                  e.target.value = "";
                }}
              />
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
              >
                {isImporting ? (
                  <><Loader2 size={14} className="thought-model-spinner" /> Importing...</>
                ) : (
                  <><Upload size={14} /> Select .openobsidian.zip</>
                )}
              </button>
              {importResult && (
                <div className="ai-import-result">
                  <div className="ai-import-stat"><Check size={12} /> {importResult.notesImported} notes imported</div>
                  {importResult.attachmentsImported > 0 && (
                    <div className="ai-import-stat"><Check size={12} /> {importResult.attachmentsImported} attachments</div>
                  )}
                  {importResult.embeddingsRestored > 0 && (
                    <div className="ai-import-stat"><Check size={12} /> {importResult.embeddingsRestored} analysis entries restored</div>
                  )}
                  {importResult.errors.length > 0 && (
                    <div className="ai-import-errors">
                      {importResult.errors.slice(0, 5).map((err, i) => (
                        <div key={i} className="ai-import-error"><AlertCircle size={10} /> {err}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default AIPage;
