import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import {
  Maximize,
  Minimize,
  Network,
  RefreshCw,
  Settings,
  Target,
  X,
} from "lucide-react";
import { Theme } from "../../types";
import { GraphRenderer } from "./GraphRenderer";
import { getDefaultSettings as getManualDefaultSettings } from "./GraphView";
import {
  loadStoreAsync,
  loadSuggestionHistory,
  loadTransitionMap,
} from "../../utils/embeddings";
import { getAPI } from "../../utils/api";

const api = getAPI();

const AI_GRAPH_SIMILARITY_THRESHOLD = 0.45;
const AI_GRAPH_CLUSTER_THRESHOLD = 0.58;
const AI_GRAPH_MAX_EDGES_PER_NODE = 4;
const AI_GRAPH_DEFAULT_MAX_NODES = 180;
const AI_GRAPH_MIN_NODES = 100;
const AI_GRAPH_MAX_NODES = 300;

const CLUSTER_COLORS = [
  "#6ee7b7",
  "#60a5fa",
  "#f59e0b",
  "#f87171",
  "#a78bfa",
  "#34d399",
  "#f472b6",
  "#22d3ee",
  "#cbd5e1",
];

function getVaultHash(path: string): string {
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    const chr = path.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function hexToNumber(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

function noteNameFromPath(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/i, "") || path;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

interface AIKnowledgeGraphProps {
  onNodeClick: (noteName: string, heading?: string, notePath?: string) => void;
  onClose: () => void;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
  theme?: Theme;
  vaultPath?: string | null;
  localNodePath?: string;
}

interface SimilarityPair {
  source: string;
  target: string;
  similarity: number;
}

interface AIGraphNode {
  id: string;
  name: string;
  path: string;
  clusterId: number;
  connections: number;
  x?: number;
  y?: number;
}

interface AIGraphEdge {
  source: string;
  target: string;
  similarity: number;
  hiddenConnection: boolean;
}

interface DirectionalFlowInsight {
  source: string;
  target: string;
  count: number;
  confidence: number;
}

interface BridgeNoteInsight {
  path: string;
  name: string;
  bridgeClusters: number;
  clusterIds: number[];
  relatedPaths: string[];
}

interface IdeaIslandInsight {
  clusterId: number;
  size: number;
  internalStrength: number;
  memberPaths: string[];
}

interface AIGraphData {
  nodes: AIGraphNode[];
  edges: AIGraphEdge[];
  directionalFlows: DirectionalFlowInsight[];
  clusterCount: number;
  hiddenConnectionCount: number;
  bridgeNotes: BridgeNoteInsight[];
  ideaIslands: IdeaIslandInsight[];
}

interface AIGraphSettings {
  threshold: number;
  clusterThreshold: number;
  maxEdgesPerNode: number;
  maxNodes: number;
  showHiddenOnly: boolean;
  focusMode: boolean;
  showDirectionalFlow: boolean;
  searchTerm: string;
}

function getDefaultSettings(theme: Theme): AIGraphSettings {
  return {
    threshold: AI_GRAPH_SIMILARITY_THRESHOLD,
    clusterThreshold: AI_GRAPH_CLUSTER_THRESHOLD,
    maxEdgesPerNode: AI_GRAPH_MAX_EDGES_PER_NODE,
    maxNodes: AI_GRAPH_DEFAULT_MAX_NODES,
    showHiddenOnly: false,
    focusMode: true,
    showDirectionalFlow: true,
    searchTerm: "",
  };
}

function buildStrongAdjacency(
  nodes: AIGraphNode[],
  edges: AIGraphEdge[],
  clusterThreshold: number,
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) adjacency.set(node.id, new Set());

  for (const edge of edges) {
    if (edge.similarity < clusterThreshold) continue;
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  return adjacency;
}

function tokenizeGraphConcept(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2)
    .slice(0, 8);
}

function connectedComponents(
  nodes: AIGraphNode[],
  adjacency: Map<string, Set<string>>,
): Map<string, number> {
  const clusterByNode = new Map<string, number>();
  let clusterId = 0;

  for (const node of nodes) {
    if (clusterByNode.has(node.id)) continue;

    const queue = [node.id];
    clusterByNode.set(node.id, clusterId);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;

      const neighbors = adjacency.get(current);
      if (!neighbors) continue;

      for (const neighbor of neighbors) {
        if (clusterByNode.has(neighbor)) continue;
        clusterByNode.set(neighbor, clusterId);
        queue.push(neighbor);
      }
    }

    clusterId += 1;
  }

  return clusterByNode;
}

function buildManualEdgeSet(data: {
  nodes: Array<{ id: string; path: string }>;
  edges: Array<{ source: string | { id: string }; target: string | { id: string } }>;
} | null): Set<string> {
  if (!data) return new Set();

  const idToPath = new Map<string, string>();
  for (const node of data.nodes || []) {
    idToPath.set(node.id, node.path || node.id);
  }

  const manual = new Set<string>();
  for (const edge of data.edges || []) {
    const sourceId = typeof edge.source === "string" ? edge.source : edge.source.id;
    const targetId = typeof edge.target === "string" ? edge.target : edge.target.id;
    const sourcePath = idToPath.get(sourceId) || sourceId;
    const targetPath = idToPath.get(targetId) || targetId;
    manual.add(pairKey(sourcePath, targetPath));
  }

  return manual;
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="graph-section">
      <button type="button" className="graph-section-header" onClick={() => setOpen((v) => !v)}>
        <span>{title}</span>
        <span className="graph-section-arrow">{open ? "▼" : "▶"}</span>
      </button>
      {open && <div className="graph-section-content">{children}</div>}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="graph-toggle-row" onClick={() => onChange(!checked)}>
      <span className="graph-toggle-label">{label}</span>
      <div className={`graph-toggle-switch ${checked ? "active" : ""}`}>
        <div className="graph-toggle-thumb" />
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <div className="graph-slider-row">
      <label className="graph-slider-label">{label}</label>
      <div className="graph-slider-control">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="graph-slider"
        />
        <span className="graph-slider-value">{value}</span>
      </div>
    </div>
  );
}

function ColorPicker({
  label,
  value,
  onChange,
  presets,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  presets?: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="graph-color-row">
      <label className="graph-color-label">{label}</label>
      <div className="graph-color-control">
        <div style={{ position: "relative" }} ref={popoverRef}>
          <button
            className="graph-color-input"
            style={{ backgroundColor: value }}
            onClick={() => setIsOpen((v) => !v)}
            type="button"
          />
          {isOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: "8px",
                zIndex: 1000,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-medium)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-lg)",
                padding: "8px",
              }}
            >
              <HexColorPicker color={value} onChange={onChange} />
            </div>
          )}
        </div>
        {presets && (
          <div className="graph-color-presets">
            {presets.map((c) => (
              <button
                key={c}
                className="graph-color-preset"
                style={{ backgroundColor: c }}
                onClick={() => onChange(c)}
                type="button"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AIKnowledgeGraph({
  onNodeClick,
  onClose,
  isFullScreen = false,
  onToggleFullScreen,
  theme = "dark",
  vaultPath,
}: AIKnowledgeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GraphRenderer | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const similarityCacheRef = useRef<Map<string, SimilarityPair[]>>(new Map());
  const hasRenderedGraphRef = useRef(false);

  const isDark = theme === "dark" || theme === "oceanic" || theme === "dark-plus";
  const vaultHash = useMemo(() => getVaultHash(vaultPath || "default"), [vaultPath]);

  const [manualSettingsTick, setManualSettingsTick] = useState(0);

  useEffect(() => {
    const handleManualSettingsChange = () => {
      setManualSettingsTick((tick) => tick + 1);
    };
    window.addEventListener("manual-graph-settings-changed", handleManualSettingsChange);
    return () => {
      window.removeEventListener("manual-graph-settings-changed", handleManualSettingsChange);
    };
  }, []);

  let settingsKey = `openobsidian-ai-graph-settings-v3-${vaultHash}-dark`;
  if (theme === "light") settingsKey = `openobsidian-ai-graph-settings-v3-${vaultHash}-light`;
  if (theme === "oceanic") settingsKey = `openobsidian-ai-graph-settings-v3-${vaultHash}-oceanic`;
  
  const positionsKey = `openobsidian-ai-graph-positions-v2-${vaultHash}`;

  const [settings, setSettings] = useState<AIGraphSettings>(() => {
    try {
      const saved = localStorage.getItem(settingsKey);
      if (saved) return { ...getDefaultSettings(theme), ...JSON.parse(saved) };
    } catch {
      // Ignore parse errors.
    }
    return getDefaultSettings(theme);
  });

  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<AIGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [simulating, setSimulating] = useState(false);
  const [alpha, setAlpha] = useState(0);
  const [layoutResetTick, setLayoutResetTick] = useState(0);
  const [insightFocusNodeIds, setInsightFocusNodeIds] = useState<Set<string> | null>(null);
  const [activeInsight, setActiveInsight] = useState<{
    title: string;
    detail: string;
    relatedPaths: string[];
  } | null>(null);
  const [semanticConfig, setSemanticConfig] = useState({
    threshold: AI_GRAPH_SIMILARITY_THRESHOLD,
    clusterThreshold: AI_GRAPH_CLUSTER_THRESHOLD,
    maxEdgesPerNode: AI_GRAPH_MAX_EDGES_PER_NODE,
    maxNodes: AI_GRAPH_DEFAULT_MAX_NODES,
  });

  useEffect(() => {
    try {
      localStorage.setItem(settingsKey, JSON.stringify(settings));
    } catch {
      // Ignore persistence failures.
    }
  }, [settings, settingsKey]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(settingsKey);
      if (saved) {
        setSettings({ ...getDefaultSettings(theme), ...JSON.parse(saved) });
      } else {
        setSettings(getDefaultSettings(theme));
      }
    } catch {
      setSettings(getDefaultSettings(theme));
    }
  }, [settingsKey, theme]);

  // Keep semantic graph rebuild responsive while dragging sliders.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSemanticConfig({
        threshold: settings.threshold,
        clusterThreshold: settings.clusterThreshold,
        maxEdgesPerNode: settings.maxEdgesPerNode,
        maxNodes: settings.maxNodes,
      });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [
    settings.threshold,
    settings.clusterThreshold,
    settings.maxEdgesPerNode,
    settings.maxNodes,
  ]);

  useEffect(() => {
    if (!vaultPath) {
      hasRenderedGraphRef.current = false;
      setGraphData({
        nodes: [],
        edges: [],
        directionalFlows: [],
        clusterCount: 0,
        hiddenConnectionCount: 0,
        bridgeNotes: [],
        ideaIslands: [],
      });
      setLoading(false);
      return;
    }

    let cancelled = false;

    const buildGraph = async () => {
      if (!hasRenderedGraphRef.current) {
        setLoading(true);
      }
      setError(null);

      try {
        const store = await loadStoreAsync();
        const allEntries = [...store.entries.values()]
          .filter((entry) => entry.path.toLowerCase().endsWith(".md"))
          .filter((entry) => entry.vector.length > 0)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, semanticConfig.maxNodes);

        if (allEntries.length === 0) {
          if (!cancelled) {
            setGraphData({
              nodes: [],
              edges: [],
              directionalFlows: [],
              clusterCount: 0,
              hiddenConnectionCount: 0,
              bridgeNotes: [],
              ideaIslands: [],
            });
          }
          return;
        }

        const cacheKey = allEntries
          .map((entry) => `${entry.path}:${entry.hash}`)
          .join("|");

        let pairwiseSimilarities = similarityCacheRef.current.get(cacheKey);
        if (!pairwiseSimilarities) {
          const pairs: SimilarityPair[] = [];
          for (let i = 0; i < allEntries.length; i++) {
            for (let j = i + 1; j < allEntries.length; j++) {
              const sim = cosineSimilarity(allEntries[i].vector, allEntries[j].vector);
              pairs.push({
                source: allEntries[i].path,
                target: allEntries[j].path,
                similarity: sim,
              });
            }
          }
          pairs.sort((a, b) => b.similarity - a.similarity);
          pairwiseSimilarities = pairs;
          similarityCacheRef.current.set(cacheKey, pairs);
        }

        const rawManualGraph = await api.getGraphData();
        const manualEdgeSet = buildManualEdgeSet(rawManualGraph || null);

        const nodeMap = new Map<string, AIGraphNode>();
        for (const entry of allEntries) {
          nodeMap.set(entry.path, {
            id: entry.path,
            name: noteNameFromPath(entry.path),
            path: entry.path,
            clusterId: 0,
            connections: 0,
          });
        }

        const degreeMap = new Map<string, number>();
        const aiEdges: AIGraphEdge[] = [];

        for (const pair of pairwiseSimilarities) {
          if (pair.similarity < semanticConfig.threshold) break;
          if (!nodeMap.has(pair.source) || !nodeMap.has(pair.target)) continue;

          const sourceDegree = degreeMap.get(pair.source) || 0;
          const targetDegree = degreeMap.get(pair.target) || 0;
          if (
            sourceDegree >= semanticConfig.maxEdgesPerNode ||
            targetDegree >= semanticConfig.maxEdgesPerNode
          ) {
            continue;
          }

          aiEdges.push({
            source: pair.source,
            target: pair.target,
            similarity: pair.similarity,
            hiddenConnection: !manualEdgeSet.has(pairKey(pair.source, pair.target)),
          });

          degreeMap.set(pair.source, sourceDegree + 1);
          degreeMap.set(pair.target, targetDegree + 1);
        }

        const nodes = [...nodeMap.values()].map((node) => ({
          ...node,
          connections: degreeMap.get(node.id) || 0,
        }));

        const strongAdjacency = buildStrongAdjacency(
          nodes,
          aiEdges,
          semanticConfig.clusterThreshold,
        );
        const clusterByNode = connectedComponents(nodes, strongAdjacency);

        const clusterNodes = new Map<number, string[]>();
        for (const node of nodes) {
          const clusterId = clusterByNode.get(node.id) || 0;
          node.clusterId = clusterId;
          const list = clusterNodes.get(clusterId) || [];
          list.push(node.id);
          clusterNodes.set(clusterId, list);
        }

        const hiddenConnectionCount = aiEdges.filter((edge) => edge.hiddenConnection).length;

        const acceptedHistory = loadSuggestionHistory().filter(
          (record) =>
            record.action === "accepted" &&
            nodeMap.has(record.sourcePath) &&
            nodeMap.has(record.targetPath),
        );
        const transitionMap = loadTransitionMap();
        const acceptedCountByDirection = new Map<string, number>();
        for (const record of acceptedHistory) {
          const key = `${record.sourcePath}->${record.targetPath}`;
          acceptedCountByDirection.set(key, (acceptedCountByDirection.get(key) || 0) + 1);
        }

        const directionalFlows: DirectionalFlowInsight[] = aiEdges
          .map((edge) => {
            const forwardAccepted =
              acceptedCountByDirection.get(`${edge.source}->${edge.target}`) || 0;
            const backwardAccepted =
              acceptedCountByDirection.get(`${edge.target}->${edge.source}`) || 0;

            const sourceNode = nodeMap.get(edge.source);
            const targetNode = nodeMap.get(edge.target);
            const sourceTokens = tokenizeGraphConcept(sourceNode?.name || edge.source);
            const targetTokens = tokenizeGraphConcept(targetNode?.name || edge.target);

            let conceptForward = 0;
            for (const fromToken of sourceTokens) {
              const transitions = transitionMap[fromToken];
              if (!transitions) continue;
              for (const toToken of targetTokens) {
                conceptForward += transitions[toToken] || 0;
              }
            }

            let conceptBackward = 0;
            for (const fromToken of targetTokens) {
              const transitions = transitionMap[fromToken];
              if (!transitions) continue;
              for (const toToken of sourceTokens) {
                conceptBackward += transitions[toToken] || 0;
              }
            }

            const forwardScore = forwardAccepted + conceptForward * 0.3;
            const backwardScore = backwardAccepted + conceptBackward * 0.3;
            const totalSignal = forwardScore + backwardScore;
            if (totalSignal < 1.4 || Math.abs(forwardScore - backwardScore) < 0.35) {
              return null;
            }

            if (forwardScore >= backwardScore) {
              return {
                source: edge.source,
                target: edge.target,
                count: Math.round(forwardScore * 10) / 10,
                confidence: Math.abs(forwardScore - backwardScore) / totalSignal,
              };
            }

            return {
              source: edge.target,
              target: edge.source,
              count: Math.round(backwardScore * 10) / 10,
              confidence: Math.abs(forwardScore - backwardScore) / totalSignal,
            };
          })
          .filter((item): item is DirectionalFlowInsight => Boolean(item))
          .sort((a, b) => b.count - a.count)
          .slice(0, 60);

        const bridgeNotes: BridgeNoteInsight[] = nodes
          .map((node) => {
            const neighborClusterMap = new Map<number, string[]>();
            for (const edge of aiEdges) {
              let neighborId: string | null = null;
              if (edge.source === node.id) neighborId = edge.target;
              if (edge.target === node.id) neighborId = edge.source;
              if (!neighborId) continue;
              const neighborCluster = clusterByNode.get(neighborId);
              if (
                typeof neighborCluster === "number" &&
                neighborCluster !== node.clusterId
              ) {
                const list = neighborClusterMap.get(neighborCluster) || [];
                list.push(neighborId);
                neighborClusterMap.set(neighborCluster, list);
              }
            }
            const rankedClusters = [...neighborClusterMap.entries()]
              .sort((a, b) => b[1].length - a[1].length)
              .map(([clusterId]) => clusterId);
            const relatedPaths = [...neighborClusterMap.values()]
              .flat()
              .filter((path, index, source) => source.indexOf(path) === index)
              .slice(0, 6);
            return {
              path: node.path,
              name: node.name,
              bridgeClusters: neighborClusterMap.size,
              clusterIds: rankedClusters,
              relatedPaths,
            };
          })
          .filter((item) => item.bridgeClusters >= 2)
          .sort((a, b) => b.bridgeClusters - a.bridgeClusters)
          .slice(0, 6);

        const ideaIslands: IdeaIslandInsight[] = [...clusterNodes.entries()]
          .map(([clusterId, clusterPaths]) => {
            const pathSet = new Set(clusterPaths);
            const internal = aiEdges.filter(
              (edge) => pathSet.has(edge.source) && pathSet.has(edge.target),
            );
            const external = aiEdges.filter(
              (edge) =>
                (pathSet.has(edge.source) && !pathSet.has(edge.target)) ||
                (!pathSet.has(edge.source) && pathSet.has(edge.target)),
            );
            const internalStrength =
              internal.length > 0
                ? internal.reduce((sum, edge) => sum + edge.similarity, 0) / internal.length
                : 0;
            return {
              clusterId,
              size: clusterPaths.length,
              internalStrength,
              externalCount: external.length,
              memberPaths: clusterPaths,
            };
          })
          .filter(
            (cluster) =>
              cluster.size >= 3 &&
              cluster.internalStrength >= 0.62 &&
              cluster.externalCount <= Math.max(1, Math.floor(cluster.size / 3)),
          )
          .sort((a, b) => b.internalStrength - a.internalStrength)
          .slice(0, 6)
          .map(({ externalCount: _externalCount, ...rest }) => rest);

        if (!cancelled) {
          hasRenderedGraphRef.current = true;
          setGraphData({
            nodes,
            edges: aiEdges,
            directionalFlows,
            clusterCount: clusterNodes.size,
            hiddenConnectionCount,
            bridgeNotes,
            ideaIslands,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError("Failed to build AI graph from embeddings.");
          console.error("[AI Graph] Build failed:", err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void buildGraph();

    return () => {
      cancelled = true;
    };
  }, [
    vaultPath,
    semanticConfig.threshold,
    semanticConfig.clusterThreshold,
    semanticConfig.maxEdgesPerNode,
    semanticConfig.maxNodes,
    reloadTick,
  ]);

  const adjacencyByNode = useMemo(() => {
    const adjacency = new Map<string, Array<{ id: string; similarity: number }>>();
    for (const node of graphData?.nodes || []) adjacency.set(node.id, []);
    for (const edge of graphData?.edges || []) {
      adjacency.get(edge.source)?.push({ id: edge.target, similarity: edge.similarity });
      adjacency.get(edge.target)?.push({ id: edge.source, similarity: edge.similarity });
    }
    adjacency.forEach((neighbors) => neighbors.sort((a, b) => b.similarity - a.similarity));
    return adjacency;
  }, [graphData]);

  const directionalByPair = useMemo(() => {
    const map = new Map<string, { source: string; target: string; confidence: number }>();
    for (const flow of graphData?.directionalFlows || []) {
      map.set(pairKey(flow.source, flow.target), {
        source: flow.source,
        target: flow.target,
        confidence: flow.confidence,
      });
    }
    return map;
  }, [graphData]);

  const clusterLabelById = useMemo(() => {
    const map = new Map<number, string>();
    const grouped = new Map<number, AIGraphNode[]>();
    for (const node of graphData?.nodes || []) {
      const list = grouped.get(node.clusterId) || [];
      list.push(node);
      grouped.set(node.clusterId, list);
    }
    grouped.forEach((members, clusterId) => {
      const lead = [...members].sort((a, b) => b.connections - a.connections)[0];
      map.set(clusterId, lead ? `Cluster ${clusterId + 1}: ${lead.name}` : `Cluster ${clusterId + 1}`);
    });
    return map;
  }, [graphData]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return graphData?.nodes.find((node) => node.id === selectedNodeId) || null;
  }, [graphData, selectedNodeId]);

  const focusSet = useMemo(() => {
    if (!selectedNodeId || !settings.focusMode) return null;
    const neighbors = adjacencyByNode.get(selectedNodeId) || [];
    return new Set<string>([
      selectedNodeId,
      ...neighbors.slice(0, 12).map((item) => item.id),
    ]);
  }, [adjacencyByNode, selectedNodeId, settings.focusMode]);

  const activeFocusSet = useMemo(() => {
    if (insightFocusNodeIds && insightFocusNodeIds.size > 0) return insightFocusNodeIds;
    return focusSet;
  }, [focusSet, insightFocusNodeIds]);

  const filteredData = useMemo(() => {
    const baseNodes = graphData?.nodes || [];
    const baseEdges = graphData?.edges || [];

    let nodes = [...baseNodes];

    const term = settings.searchTerm.trim().toLowerCase();
    if (term) nodes = nodes.filter((n) => n.name.toLowerCase().includes(term));

    if (activeFocusSet) nodes = nodes.filter((n) => activeFocusSet.has(n.id));

    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = baseEdges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .filter((e) => !settings.showHiddenOnly || e.hiddenConnection)
      .map((e) => {
        const directional = directionalByPair.get(pairKey(e.source, e.target));
        if (settings.showDirectionalFlow && directional) {
          return {
            source: directional.source,
            target: directional.target,
            directed: true,
          };
        }
        return { source: e.source, target: e.target, directed: false };
      });

    const signature = `${nodes.map((n) => n.id).join("|")}::${edges
      .map((e) => `${e.source}->${e.target}${e.directed ? ":d" : ""}`)
      .join("|")}`;

    return { nodes, edges, signature };
  }, [
    activeFocusSet,
    directionalByPair,
    graphData,
    settings.searchTerm,
    settings.showDirectionalFlow,
    settings.showHiddenOnly,
  ]);

  useEffect(() => {
    if (!filteredData.nodes.some((n) => n.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [filteredData.nodes, selectedNodeId]);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current || loading) return;
    if (rendererRef.current && workerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    const manualSettingsKey = `openobsidian-graph-settings-v7-${theme === "oceanic" ? "oceanic" : theme === "light" ? "light" : "dark"}-${vaultHash}`;
    let manualSettings = getManualDefaultSettings(theme);
    try {
      const saved = localStorage.getItem(manualSettingsKey);
      if (saved) manualSettings = { ...manualSettings, ...JSON.parse(saved) };
    } catch {}

    const renderer = new GraphRenderer(canvas, {
      width: rect.width,
      height: rect.height,
      backgroundColor: hexToNumber(manualSettings.backgroundColor),
      isDark,
    });
    rendererRef.current = renderer;

    const worker = new Worker(new URL("./graphWorker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, ids, positions, alpha: workerAlpha } = e.data;
      if (type === "tick" && renderer.isInitialized()) {
        renderer.updatePositionsFromArray(ids, new Float32Array(positions));
        setAlpha(workerAlpha);
      } else if (type === "end") {
        setSimulating(false);
        setAlpha(0);
        try {
          const allPositions = renderer.getAllPositions();
          const posObj: Record<string, { x: number; y: number }> = {};
          allPositions.forEach((pos, id) => {
            posObj[id] = pos;
          });
          localStorage.setItem(positionsKey, JSON.stringify(posObj));
        } catch {
          // Ignore position persistence errors.
        }
      }
    };

    renderer
      .init()
      .then(() => {
        renderer.setCallbacks({
          onNodeClick: (nodeId) => {
            setSelectedNodeId(nodeId);
            renderer.selectNode(nodeId);
          },
          onNodeDrag: (nodeId, x, y, active) => {
            worker.postMessage({
              type: "drag",
              data: { id: nodeId, x, y, active },
            });
          },
        });

        const selectedClusterColor = selectedNodeId
          ? CLUSTER_COLORS[
              (graphData?.nodes.find((n) => n.id === selectedNodeId)?.clusterId || 0) %
                CLUSTER_COLORS.length
            ]
          : manualSettings.connectedColor;

        renderer.setNodeStyle({
          color: hexToNumber(manualSettings.nodeColor),
          size: manualSettings.nodeSize,
          selectedColor: hexToNumber(selectedClusterColor),
          hoveredColor: hexToNumber(selectedClusterColor),
          connectedColor: hexToNumber(selectedClusterColor),
        });
        renderer.setEdgeStyle({
          color: hexToNumber(manualSettings.edgeColor),
          width: manualSettings.linkWidth,
          highlightColor: hexToNumber(selectedClusterColor),
        });
        renderer.setLabelStyle({
          color: manualSettings.textColor,
          size: manualSettings.textSize,
          show: true,
          threshold: manualSettings.labelThreshold,
        });
      })
      .catch((err) => {
        console.error("[AI Graph] Renderer init failed", err);
      });

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const updatedRect = container.getBoundingClientRect();
        if (updatedRect.width > 10 && updatedRect.height > 10) {
          renderer.resize(updatedRect.width, updatedRect.height);
        }
      }, 16);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
    };
  }, [loading, isDark, positionsKey, theme, vaultHash, manualSettingsTick]);

  useEffect(() => {
    const renderer = rendererRef.current;
    const worker = workerRef.current;
    if (!renderer || !worker || !renderer.isInitialized() || loading) return;

    if (filteredData.nodes.length === 0) {
      renderer.setData([], []);
      return;
    }

    const shouldResetLayout = layoutResetTick > 0;
    let savedPositions: Record<string, { x: number; y: number }> | null = null;
    if (!shouldResetLayout) {
      try {
        const saved = localStorage.getItem(positionsKey);
        if (saved) savedPositions = JSON.parse(saved);
      } catch {
        // Ignore invalid saved positions.
      }
    }

    const livePositions = shouldResetLayout
      ? new Map<string, { x: number; y: number }>()
      : renderer.getAllPositions();
    const nodesWithPositions = filteredData.nodes.map((n) => {
      const live = livePositions.get(n.id);
      if (live) return { ...n, ...live };
      if (savedPositions && savedPositions[n.id]) return { ...n, ...savedPositions[n.id] };
      return {
        ...n,
        x: (Math.random() - 0.5) * 500,
        y: (Math.random() - 0.5) * 500,
      };
    });

    renderer.setData(nodesWithPositions, filteredData.edges);

    const manualSettingsKey = `openobsidian-graph-settings-v7-${theme === "oceanic" ? "oceanic" : theme === "light" ? "light" : "dark"}-${vaultHash}`;
    let manualSettings = getManualDefaultSettings(theme);
    try {
      const saved = localStorage.getItem(manualSettingsKey);
      if (saved) manualSettings = { ...manualSettings, ...JSON.parse(saved) };
    } catch {}

    worker.postMessage({
      type: "init",
      data: {
        nodes: nodesWithPositions.map((n) => ({
          id: n.id,
          x: n.x,
          y: n.y,
          connections: n.connections || 0,
        })),
        edges: filteredData.edges,
        forces: {
          centerStrength: manualSettings.centerForce / 100,
          repelStrength: manualSettings.repelForce * 10,
          linkStrength: manualSettings.linkForce / 50,
          linkDistance: manualSettings.linkDistance * 2.5,
          collisionRadius: 60,
        },
      },
    });

    const hasLivePositions = livePositions.size > 0;
    const hasSavedPositions = !!savedPositions && Object.keys(savedPositions).length > 0;

    if (shouldResetLayout || (!hasLivePositions && !hasSavedPositions)) {
      setSimulating(true);
      worker.postMessage({ type: "start" });
    }
  }, [
    filteredData.signature,
    filteredData.nodes,
    filteredData.edges,
    loading,
    positionsKey,
    theme,
    vaultHash,
    manualSettingsTick,
    layoutResetTick,
  ]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !renderer.isInitialized()) return;

    const manualSettingsKey = `openobsidian-graph-settings-v7-${theme === "oceanic" ? "oceanic" : theme === "light" ? "light" : "dark"}-${vaultHash}`;
    let manualSettings = getManualDefaultSettings(theme);
    try {
      const saved = localStorage.getItem(manualSettingsKey);
      if (saved) manualSettings = { ...manualSettings, ...JSON.parse(saved) };
    } catch {}

    const selectedClusterColor = selectedNode
      ? CLUSTER_COLORS[selectedNode.clusterId % CLUSTER_COLORS.length]
      : manualSettings.connectedColor;

    renderer.setBackgroundColor(hexToNumber(manualSettings.backgroundColor));
    renderer.setNodeStyle({
      color: hexToNumber(manualSettings.nodeColor),
      size: manualSettings.nodeSize,
      selectedColor: hexToNumber(selectedClusterColor),
      hoveredColor: hexToNumber(selectedClusterColor),
      connectedColor: hexToNumber(selectedClusterColor),
    });
    renderer.setEdgeStyle({
      color: hexToNumber(manualSettings.edgeColor),
      width: manualSettings.linkWidth,
      highlightColor: hexToNumber(selectedClusterColor),
    });
    renderer.setLabelStyle({
      color: manualSettings.textColor,
      size: manualSettings.textSize,
      show: true,
      threshold: manualSettings.labelThreshold,
    });
  }, [theme, vaultHash, selectedNode, manualSettingsTick]);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;

    const manualSettingsKey = `openobsidian-graph-settings-v7-${theme === "oceanic" ? "oceanic" : theme === "light" ? "light" : "dark"}-${vaultHash}`;
    let manualSettings = getManualDefaultSettings(theme);
    try {
      const saved = localStorage.getItem(manualSettingsKey);
      if (saved) manualSettings = { ...manualSettings, ...JSON.parse(saved) };
    } catch {}

    setSimulating(true);
    worker.postMessage({
      type: "forces",
      data: {
        centerStrength: manualSettings.centerForce / 100,
        repelStrength: manualSettings.repelForce * 10,
        linkStrength: manualSettings.linkForce / 50,
        linkDistance: manualSettings.linkDistance * 2.5,
      },
    });
    worker.postMessage({ type: "reheat" });
  }, [theme, vaultHash, manualSettingsTick]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !renderer.isInitialized()) return;
    renderer.selectNode(selectedNodeId);
  }, [selectedNodeId]);

  const centerView = useCallback(() => {
    rendererRef.current?.centerView();
  }, []);

  const recalculateLayout = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) return;
    setSimulating(true);
    worker.postMessage({ type: "reheat" });
  }, []);

  const resetSettings = useCallback(() => {
    const defaults = getDefaultSettings(theme);

    try {
      localStorage.removeItem(settingsKey);
      localStorage.removeItem(positionsKey);
    } catch {
      // Ignore localStorage failures.
    }

    setSettings(defaults);
    setSemanticConfig({
      threshold: defaults.threshold,
      clusterThreshold: defaults.clusterThreshold,
      maxEdgesPerNode: defaults.maxEdgesPerNode,
      maxNodes: defaults.maxNodes,
    });
    setSelectedNodeId(null);
    setInsightFocusNodeIds(null);
    setActiveInsight(null);
    setLayoutResetTick((v) => v + 1);
    setSimulating(true);
    setAlpha(1);
  }, [isDark, positionsKey, settingsKey]);

  const clearInsightFocus = useCallback(() => {
    setInsightFocusNodeIds(null);
    setActiveInsight(null);
  }, []);

  const handleBridgeActivate = useCallback(
    (bridge: BridgeNoteInsight) => {
      if (!graphData) return;
      const bridgeNode = graphData.nodes.find((node) => node.path === bridge.path);
      if (!bridgeNode) return;

      const focusClusters = new Set<number>([
        bridgeNode.clusterId,
        ...bridge.clusterIds.slice(0, 2),
      ]);

      const focusedNodes = graphData.nodes
        .filter(
          (node) =>
            focusClusters.has(node.clusterId) ||
            node.path === bridge.path ||
            bridge.relatedPaths.includes(node.path),
        )
        .map((node) => node.id);

      setSelectedNodeId(bridge.path);
      setInsightFocusNodeIds(new Set(focusedNodes));

      const firstClusterLabel =
        clusterLabelById.get(bridge.clusterIds[0] ?? bridgeNode.clusterId) ||
        `Cluster ${(bridge.clusterIds[0] ?? bridgeNode.clusterId) + 1}`;
      const secondClusterLabel =
        clusterLabelById.get(bridge.clusterIds[1] ?? bridgeNode.clusterId) ||
        `Cluster ${(bridge.clusterIds[1] ?? bridgeNode.clusterId) + 1}`;

      setActiveInsight({
        title: `${bridge.name} bridges ${firstClusterLabel} <-> ${secondClusterLabel}`,
        detail: "Focused on cross-cluster bridge pathways.",
        relatedPaths: [bridge.path, ...bridge.relatedPaths].slice(0, 6),
      });
      setSettings((current) => ({ ...current, showHiddenOnly: false }));
    },
    [clusterLabelById, graphData],
  );

  const handleIslandExplore = useCallback(
    (island: IdeaIslandInsight) => {
      if (!graphData) return;
      const focusedNodes = graphData.nodes
        .filter((node) => node.clusterId === island.clusterId)
        .map((node) => node.id);

      setInsightFocusNodeIds(new Set(focusedNodes));
      setSelectedNodeId(island.memberPaths[0] || null);
      setActiveInsight({
        title: `${clusterLabelById.get(island.clusterId) || `Cluster ${island.clusterId + 1}`} is isolated`,
        detail: "Exploring related concepts within this island.",
        relatedPaths: island.memberPaths.slice(0, 6),
      });
      setSettings((current) => ({ ...current, showHiddenOnly: false }));
    },
    [clusterLabelById, graphData],
  );

  const handleIslandMissingLinks = useCallback(
    (island: IdeaIslandInsight) => {
      if (!graphData) return;
      const focusedNodes = graphData.nodes
        .filter((node) => node.clusterId === island.clusterId)
        .map((node) => node.id);

      setInsightFocusNodeIds(new Set(focusedNodes));
      setSelectedNodeId(island.memberPaths[0] || null);
      setActiveInsight({
        title: `${clusterLabelById.get(island.clusterId) || `Cluster ${island.clusterId + 1}`} missing links`,
        detail: "Showing hidden semantic links inside this idea island.",
        relatedPaths: island.memberPaths.slice(0, 6),
      });
      setSettings((current) => ({ ...current, showHiddenOnly: true }));
    },
    [clusterLabelById, graphData],
  );

  const handleOpenSelected = useCallback(() => {
    if (!selectedNode) return;
    onNodeClick(selectedNode.name, undefined, selectedNode.path);
  }, [onNodeClick, selectedNode]);

  const directionalFocusSummary = useMemo(() => {
    if (!selectedNodeId || !settings.showDirectionalFlow) return null;
    const outgoing = (graphData?.directionalFlows || [])
      .filter((flow) => flow.source === selectedNodeId)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    const incoming = (graphData?.directionalFlows || [])
      .filter((flow) => flow.target === selectedNodeId)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    return { outgoing, incoming };
  }, [graphData, selectedNodeId, settings.showDirectionalFlow]);

  const visibleNodeCount = filteredData.nodes.length;

  if (loading && !graphData) {
    return (
      <div className="graph-view-container">
        <div className="graph-loading">
          <div className="loading-spinner" />
          <span>Building semantic graph...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`graph-view-container ${isFullScreen ? "fullscreen" : ""}`}>
      <div className="graph-main">
        <div ref={containerRef} className="graph-canvas-container ai-graph-canvas-container">
          <canvas ref={canvasRef} />

          {!loading && !!error && (
            <div className="graph-empty">
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && graphData && graphData.nodes.length === 0 && (
            <div className="graph-empty">
              <span>No embeddings found yet. Open and save a few notes to build the AI graph.</span>
            </div>
          )}

          <div className="graph-node-counter">
            {visibleNodeCount} nodes • {graphData?.hiddenConnectionCount || 0} hidden links • {graphData?.directionalFlows.length || 0} directional flows
          </div>

          {(!!selectedNode || !!activeInsight) && (
            <div className="ai-graph-focus-card">
              {!!activeInsight && (
                <>
                  <div className="ai-graph-focus-title">{activeInsight.title}</div>
                  <div className="ai-graph-focus-meta">{activeInsight.detail}</div>
                  <div className="ai-graph-insights-list" style={{ gap: 4 }}>
                    {activeInsight.relatedPaths.slice(0, 4).map((path) => (
                      <button
                        key={path}
                        type="button"
                        className="graph-btn-secondary"
                        style={{ textAlign: "left", padding: "4px 8px" }}
                        onClick={() => onNodeClick(noteNameFromPath(path), undefined, path)}
                      >
                        {noteNameFromPath(path)}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="graph-btn-secondary" onClick={clearInsightFocus}>
                    Clear Insight Focus
                  </button>
                </>
              )}

              {!!selectedNode && (
                <>
                  <div className="ai-graph-focus-title">{selectedNode.name}</div>
                  <div className="ai-graph-focus-meta">
                    {adjacencyByNode.get(selectedNode.id)?.length || 0} semantic links
                  </div>
                  {!!directionalFocusSummary && (
                    <div className="ai-graph-focus-meta">
                      Flow out: {directionalFocusSummary.outgoing.length} • Flow in: {directionalFocusSummary.incoming.length}
                    </div>
                  )}
                  <button type="button" className="graph-btn-primary" onClick={handleOpenSelected}>
                    Open Note
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {showSettingsPanel && (
          <div className="graph-settings-panel ai-graph-settings-panel">
            <Section title="Filters">
              <input
                type="text"
                className="graph-search-input"
                placeholder="Search semantic nodes..."
                value={settings.searchTerm}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    searchTerm: event.target.value,
                  }))
                }
              />
              <Toggle
                label="Hidden connections only"
                checked={settings.showHiddenOnly}
                onChange={(v) =>
                  setSettings((current) => ({
                    ...current,
                    showHiddenOnly: v,
                  }))
                }
              />
              <Toggle
                label="Focus mode on selection"
                checked={settings.focusMode}
                onChange={(v) =>
                  setSettings((current) => ({
                    ...current,
                    focusMode: v,
                  }))
                }
              />
              <Toggle
                label="Show directional flow"
                checked={settings.showDirectionalFlow}
                onChange={(v) =>
                  setSettings((current) => ({
                    ...current,
                    showDirectionalFlow: v,
                  }))
                }
              />
            </Section>

            <Section title="Semantic" defaultOpen={false}>
              <Slider
                label="Similarity"
                value={Math.round(settings.threshold * 100)}
                onChange={(v) => setSettings((current) => ({ ...current, threshold: v / 100 }))}
                min={35}
                max={75}
              />
              <Slider
                label="Cluster"
                value={Math.round(settings.clusterThreshold * 100)}
                onChange={(v) =>
                  setSettings((current) => ({ ...current, clusterThreshold: v / 100 }))
                }
                min={45}
                max={85}
              />
              <div className="graph-settings-actions" style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="graph-btn-secondary"
                  onClick={() => setSettings((current) => ({ ...current, clusterThreshold: 0.72 }))}
                >
                  Tight
                </button>
                <button
                  type="button"
                  className="graph-btn-secondary"
                  onClick={() => setSettings((current) => ({ ...current, clusterThreshold: 0.62 }))}
                >
                  Medium
                </button>
                <button
                  type="button"
                  className="graph-btn-secondary"
                  onClick={() => setSettings((current) => ({ ...current, clusterThreshold: 0.52 }))}
                >
                  Broad
                </button>
              </div>
              <Slider
                label="Edges / node"
                value={settings.maxEdgesPerNode}
                onChange={(v) => setSettings((current) => ({ ...current, maxEdgesPerNode: v }))}
                min={3}
                max={6}
              />
              <Slider
                label="Node limit"
                value={settings.maxNodes}
                onChange={(v) => setSettings((current) => ({ ...current, maxNodes: v }))}
                min={AI_GRAPH_MIN_NODES}
                max={AI_GRAPH_MAX_NODES}
                step={10}
              />
            </Section>

            <Section title="Insights" defaultOpen={false}>
              <div className="graph-section-content ai-graph-insights-list" style={{ padding: 0 }}>
                <div className="ai-graph-insight-item">
                  <strong>{graphData?.clusterCount || 0}</strong>
                  <span>clusters</span>
                </div>
                <div className="ai-graph-insight-item">
                  <strong>{graphData?.bridgeNotes.length || 0}</strong>
                  <span>bridge notes</span>
                </div>
                <div className="ai-graph-insight-item">
                  <strong>{graphData?.ideaIslands.length || 0}</strong>
                  <span>idea islands</span>
                </div>
                <div className="ai-graph-insight-item">
                  <strong>{graphData?.directionalFlows.length || 0}</strong>
                  <span>directional flows</span>
                </div>
              </div>

              <div className="ai-graph-insights-list" style={{ marginTop: 10 }}>
                {(graphData?.bridgeNotes || []).map((bridge) => {
                  const firstCluster = bridge.clusterIds[0];
                  const secondCluster = bridge.clusterIds[1];
                  return (
                    <div key={bridge.path} className="ai-graph-insight-item" style={{ display: "block" }}>
                      <div style={{ color: "var(--text-primary)", marginBottom: 4 }}>
                        This note connects {clusterLabelById.get(firstCluster) || `Cluster ${(firstCluster ?? 0) + 1}`} <span>{"<->"}</span> {clusterLabelById.get(secondCluster) || `Cluster ${(secondCluster ?? 0) + 1}`}
                      </div>
                      <button
                        type="button"
                        className="graph-btn-secondary"
                        onClick={() => handleBridgeActivate(bridge)}
                      >
                        Focus Bridge
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="ai-graph-insights-list" style={{ marginTop: 10 }}>
                {(graphData?.ideaIslands || []).map((island) => (
                  <div key={island.clusterId} className="ai-graph-insight-item" style={{ display: "block" }}>
                    <div style={{ color: "var(--text-primary)", marginBottom: 4 }}>
                      {clusterLabelById.get(island.clusterId) || `Cluster ${island.clusterId + 1}`}: isolated idea cluster
                    </div>
                    <div className="graph-settings-actions" style={{ margin: 0 }}>
                      <button
                        type="button"
                        className="graph-btn-secondary"
                        onClick={() => handleIslandExplore(island)}
                      >
                        Explore Related Concepts
                      </button>
                      <button
                        type="button"
                        className="graph-btn-secondary"
                        onClick={() => handleIslandMissingLinks(island)}
                      >
                        Find Missing Links
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <div className="graph-settings-actions">
              <button type="button" className="graph-btn-secondary" onClick={resetSettings}>
                Reset All
              </button>
              <button type="button" className="graph-btn-primary" onClick={recalculateLayout}>
                Recalculate
              </button>
            </div>
          </div>
        )}

        <div className="graph-tools-rail">
          {simulating && (
            <div className="graph-tools-sim-indicator">
              <div className="graph-sim-spinner" />
              <span>{Math.round(alpha * 100)}%</span>
            </div>
          )}

          <div className="graph-tools-group">
            <button type="button" className="graph-btn" onClick={centerView} title="Center view">
              <Target size={14} />
            </button>
            <button type="button" className="graph-btn" onClick={recalculateLayout} title="Recalculate layout">
              <RefreshCw size={14} />
            </button>
            <button
              type="button"
              className={`graph-btn ${showSettingsPanel ? "active" : ""}`}
              onClick={() => setShowSettingsPanel((v) => !v)}
              title="Settings"
            >
              <Settings size={14} />
            </button>
            <button
              type="button"
              className="graph-btn"
              onClick={() => setReloadTick((v) => v + 1)}
              title="Rebuild semantic graph"
            >
              <Network size={14} />
            </button>
            {onToggleFullScreen && (
              <button
                type="button"
                className="graph-btn"
                onClick={onToggleFullScreen}
                title={isFullScreen ? "Exit fullscreen" : "Fullscreen"}
              >
                {isFullScreen ? <Minimize size={14} /> : <Maximize size={14} />}
              </button>
            )}
            <button type="button" className="graph-btn" onClick={onClose} title="Close">
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
