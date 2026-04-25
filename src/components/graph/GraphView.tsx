/**
 * Graph View Component - Canvas2D based
 * Matches app theme with smooth zoom and hover dimming
 */

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { HexColorPicker } from "react-colorful";
import {
  Maximize,
  Minimize,
  Settings,
  X,
  RotateCcw,
  Target,
} from "lucide-react";
import { GraphNode, GraphEdge, Theme } from "../../types";
import { GraphRenderer } from "./GraphRenderer";
import { getAPI } from "../../utils/api";

const api = getAPI();

function getVaultHash(path: string): string {
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    const chr = path.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

interface GraphSettings {
  searchTerm: string;
  existingFilesOnly: boolean;
  showOrphans: boolean;
  backgroundColor: string;
  nodeColor: string;
  connectedColor: string;
  edgeColor: string;
  nodeSize: number;
  linkWidth: number;
  textColor: string;
  textSize: number;
  showLabels: boolean;
  labelThreshold: number;
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
}

// Default colors matching app theme
export const getDefaultSettings = (theme: Theme): GraphSettings => {
  const isLight = theme === "light";
  const isOceanic = theme === "oceanic";

  return {
    searchTerm: "",
    existingFilesOnly: false,
    showOrphans: true,
    backgroundColor: isOceanic ? "#14161a" : isLight ? "#fff7ed" : "#1f1f1f",
    nodeColor: isOceanic ? "#ffffff" : isLight ? "#4a4a4a" : "#d5d1d1",
    connectedColor: isOceanic ? "#7dd3fc" : isLight ? "#3a3a3a" : "#c0c0c0",
    edgeColor: isOceanic ? "#878787" : isLight ? "#404040" : "#5d5d5d",
    nodeSize: isLight ? 8 : 6,
    linkWidth: isOceanic ? 1.5 : (isLight ? 2 : 2.5),
    textColor: isOceanic ? "#a2aab4" : isLight ? "#606060" : "#a0a0a0",
    textSize: 18,
    showLabels: true,
    labelThreshold: 0.5,
    centerForce: 50,
    repelForce: 10,
    linkForce: 100,
    linkDistance: 20,
  };
};

function hexToNumber(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

// UI Components
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
      <button className="graph-section-header" onClick={() => setOpen(!open)}>
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
  info,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  info?: string;
}) {
  return (
    <div className="graph-toggle-row" onClick={() => onChange(!checked)}>
      <span className="graph-toggle-label">
        {label}
        {info && (
          <span className="graph-info-icon" title={info}>
            ℹ
          </span>
        )}
      </span>
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
  info,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  info?: string;
}) {
  return (
    <div className="graph-slider-row">
      <label className="graph-slider-label">
        {label}
        {info && (
          <span className="graph-info-icon" title={info}>
            ℹ
          </span>
        )}
      </label>
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
            onClick={() => setIsOpen(!isOpen)}
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface GraphViewProps {
  onNodeClick: (noteName: string, heading?: string, notePath?: string) => void;
  onClose: () => void;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
  theme?: Theme;
  vaultPath?: string | null;
  localNodePath?: string;
}

interface GraphDataState {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function GraphView({
  onNodeClick,
  onClose,
  isFullScreen = false,
  onToggleFullScreen,
  theme = "dark",
  vaultPath,
  localNodePath,
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GraphRenderer | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const initDoneRef = useRef(false);
  const prevThemeRef = useRef<Theme>(theme);

  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [alpha, setAlpha] = useState(0);
  const [graphData, setGraphData] = useState<GraphDataState | null>(null);
  const [loading, setLoading] = useState(true);
  const [reinitCounter, setReinitCounter] = useState(0); // Force re-init on filter/theme change

  const isDark = theme === "dark" || theme === "oceanic";
  const vaultHash = useMemo(
    () => getVaultHash(vaultPath || "default"),
    [vaultPath],
  );

  // Separate settings keys for different themes
  let settingsKey = `openobsidian-graph-settings-v7-dark-${vaultHash}`;
  if (theme === "light") settingsKey = `openobsidian-graph-settings-v7-light-${vaultHash}`;
  if (theme === "oceanic") settingsKey = `openobsidian-graph-settings-v7-oceanic-${vaultHash}`;
  const positionsKey = `openobsidian-graph-positions-v3-${vaultHash}`;

  const [settings, setSettings] = useState<GraphSettings>(() => {
    try {
      const saved = localStorage.getItem(settingsKey);
      if (saved) return { ...getDefaultSettings(theme), ...JSON.parse(saved) };
    } catch {}
    return getDefaultSettings(theme);
  });

  // Load settings when theme changes and update renderer background
  useEffect(() => {
    if (prevThemeRef.current !== theme) {
      prevThemeRef.current = theme;
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

      // Update background color immediately without full re-init
      const renderer = rendererRef.current;
      if (renderer && renderer.isInitialized()) {
        renderer.setBackgroundColor(
          hexToNumber(
            settings.backgroundColor || (isDark ? "#101010" : "#f0f0f6"),
          ),
        );
      }

      // Force re-init with new theme colors
      setReinitCounter((c) => c + 1);
    }
  }, [theme, isDark, settingsKey]);

  // Save settings whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(settingsKey, JSON.stringify(settings));
      window.dispatchEvent(new Event("manual-graph-settings-changed"));
    } catch {}
  }, [settings, settingsKey]);

  // Load graph data from API
  useEffect(() => {
    if (!vaultPath) return;

    const loadGraph = async () => {
      setLoading(true);
      try {
        const data = await api.getGraphData();
        if (data) {
          setGraphData(data);
        }
      } catch (err) {
        console.error("Failed to load graph:", err);
      } finally {
        setLoading(false);
      }
    };

    loadGraph();
  }, [vaultPath]);

  // Filter nodes based on settings
  const filteredData = useMemo(() => {
    if (!graphData) return { nodes: [], edges: [] };

    let nodes = [...graphData.nodes];
    let edges = [...graphData.edges];

    // Search filter
    if (settings.searchTerm) {
      const term = settings.searchTerm.toLowerCase();
      nodes = nodes.filter((n) => n.name.toLowerCase().includes(term));
    }

    // Create a set of valid node IDs
    const nodeIds = new Set(nodes.map((n) => n.id));

    // Filter edges to only include valid nodes
    edges = edges.filter((e) => {
      const sourceId = typeof e.source === "string" ? e.source : e.source.id;
      const targetId = typeof e.target === "string" ? e.target : e.target.id;
      return nodeIds.has(sourceId) && nodeIds.has(targetId);
    });

    // Build connected set
    const connected = new Set<string>();
    edges.forEach((e) => {
      const sourceId = typeof e.source === "string" ? e.source : e.source.id;
      const targetId = typeof e.target === "string" ? e.target : e.target.id;
      connected.add(sourceId);
      connected.add(targetId);
    });

    // Filter orphans if needed
    if (!settings.showOrphans) {
      nodes = nodes.filter((n) => connected.has(n.id));
    }

    // Update connections count
    const connectionCount = new Map<string, number>();
    edges.forEach((e) => {
      const sourceId = typeof e.source === "string" ? e.source : e.source.id;
      const targetId = typeof e.target === "string" ? e.target : e.target.id;
      connectionCount.set(sourceId, (connectionCount.get(sourceId) || 0) + 1);
      connectionCount.set(targetId, (connectionCount.get(targetId) || 0) + 1);
    });

    nodes = nodes.map((n) => ({
      ...n,
      connections: connectionCount.get(n.id) || 0,
    }));

    // Normalize edges to just source/target strings
    const normalizedEdges = edges.map((e) => ({
      source: typeof e.source === "string" ? e.source : e.source.id,
      target: typeof e.target === "string" ? e.target : e.target.id,
    }));

    return { nodes, edges: normalizedEdges };
  }, [
    graphData,
    settings.searchTerm,
    settings.showOrphans,
    settings.existingFilesOnly,
  ]);

  // Initialize renderer and worker
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current || loading) return;
    if (filteredData.nodes.length === 0) {
      // Clear any existing renderer
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }

      const canvas = canvasRef.current;
      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));

      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${Math.max(1, rect.width)}px`;
      canvas.style.height = `${Math.max(1, rect.height)}px`;

      const context = canvas.getContext("2d");
      if (context) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.fillStyle =
          settings.backgroundColor || (isDark ? "#101010" : "#f0f0f6");
        context.fillRect(0, 0, width, height);
      }

      return;
    }

    // Clean up previous instances
    if (rendererRef.current) {
      rendererRef.current.destroy();
      rendererRef.current = null;
    }
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();

    // Skip initialization if container has no size yet
    if (rect.width < 10 || rect.height < 10) {
      return;
    }

    // Use app theme background colors
    const bgColor = hexToNumber(
      settings.backgroundColor || (isDark ? "#101010" : "#f0f0f6"),
    );

    const renderer = new GraphRenderer(canvas, {
      width: rect.width,
      height: rect.height,
      backgroundColor: bgColor,
      isDark,
    });
    rendererRef.current = renderer;

    const worker = new Worker(new URL("./graphWorker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, ids, positions, alpha: a } = e.data;

      if (type === "tick" && renderer.isInitialized()) {
        const posArray = new Float32Array(positions);
        renderer.updatePositionsFromArray(ids, posArray);
        setAlpha(a);
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
        } catch {}
      }
    };

    renderer
      .init()
      .then(() => {
        renderer.setCallbacks({
          onNodeClick: (nodeId) => {
            const node = filteredData.nodes.find((n) => n.id === nodeId);
            if (node) {
              onNodeClick(node.name, undefined, node.path || undefined);
            }
          },
          onNodeDrag: (nodeId, x, y, active) => {
            worker.postMessage({
              type: "drag",
              data: { id: nodeId, x, y, active },
            });
          },
        });

        // Apply Obsidian-style colors
        renderer.setNodeStyle({
          color: hexToNumber(settings.nodeColor),
          size: settings.nodeSize,
          selectedColor: hexToNumber(settings.nodeColor),
          hoveredColor: hexToNumber(settings.connectedColor),
          connectedColor: hexToNumber(settings.connectedColor),
        });
        renderer.setEdgeStyle({
          color: hexToNumber(settings.edgeColor),
          width: settings.linkWidth,
          highlightColor: hexToNumber(settings.edgeColor),
        });
        renderer.setLabelStyle({
          color: settings.textColor,
          size: settings.textSize,
          show: settings.showLabels,
          threshold: settings.labelThreshold,
        });

        // Load saved positions
        let savedPositions: Record<string, { x: number; y: number }> | null =
          null;
        try {
          const saved = localStorage.getItem(positionsKey);
          if (saved) savedPositions = JSON.parse(saved);
        } catch {}

        const nodesWithPositions = filteredData.nodes.map((n) => {
          if (savedPositions && savedPositions[n.id]) {
            return { ...n, ...savedPositions[n.id] };
          }
          return {
            ...n,
            x: (Math.random() - 0.5) * 500,
            y: (Math.random() - 0.5) * 500,
          };
        });

        renderer.setData(nodesWithPositions, filteredData.edges);

        worker.postMessage({
          type: "init",
          data: {
            nodes: nodesWithPositions.map((n) => ({
              id: n.id,
              x: n.x,
              y: n.y,
              connections: n.connections || 0,
            })),
            edges: filteredData.edges.map((e) => ({
              source: e.source,
              target: e.target,
            })),
            forces: {
              centerStrength: settings.centerForce / 100,
              repelStrength: settings.repelForce * 10,
              linkStrength: settings.linkForce / 50,
              linkDistance: settings.linkDistance * 2.5,
              collisionRadius: 60,
            },
          },
        });

        if (!savedPositions || Object.keys(savedPositions).length === 0) {
          setSimulating(true);
          worker.postMessage({ type: "start" });
        } else {
          setTimeout(() => renderer.centerView(), 100);
        }
      })
      .catch(console.error);

    // Debounced resize handler to prevent glitches during drag resize
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      // Clear any pending resize
      if (resizeTimer) clearTimeout(resizeTimer);

      // Debounce the resize to prevent flickering
      resizeTimer = setTimeout(() => {
        const rect = container.getBoundingClientRect();
        if (rect.width > 10 && rect.height > 10) {
          renderer.resize(rect.width, rect.height);
        }
      }, 16); // ~60fps throttle
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
  }, [
    filteredData.nodes.length,
    filteredData.edges.length,
    loading,
    isDark,
    reinitCounter,
    settings.backgroundColor,
  ]);

  // Update styles when visual settings change
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !renderer.isInitialized()) return;

    renderer.setNodeStyle({
      color: hexToNumber(settings.nodeColor),
      size: settings.nodeSize,
      selectedColor: hexToNumber(settings.nodeColor),
      hoveredColor: hexToNumber(settings.connectedColor),
      connectedColor: hexToNumber(settings.connectedColor),
    });
    renderer.setEdgeStyle({
      color: hexToNumber(settings.edgeColor),
      width: settings.linkWidth,
      highlightColor: hexToNumber(settings.edgeColor),
    });
    renderer.setLabelStyle({
      color: settings.textColor,
      size: settings.textSize,
      show: settings.showLabels,
      threshold: settings.labelThreshold,
    });
  }, [
    settings.nodeColor,
    settings.connectedColor,
    settings.edgeColor,
    settings.nodeSize,
    settings.linkWidth,
    settings.textColor,
    settings.textSize,
    settings.showLabels,
    settings.labelThreshold,
  ]);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;

    worker.postMessage({
      type: "forces",
      data: {
        centerStrength: settings.centerForce / 100,
        repelStrength: settings.repelForce * 10,
        linkStrength: settings.linkForce / 50,
        linkDistance: settings.linkDistance * 2.5,
      },
    });

    // Reheat simulation for live updates
    setSimulating(true);
    worker.postMessage({ type: "reheat" });
  }, [
    settings.centerForce,
    settings.repelForce,
    settings.linkForce,
    settings.linkDistance,
  ]);

  const recalculateLayout = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) return;

    setSimulating(true);
    worker.postMessage({ type: "reheat" });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(getDefaultSettings(theme));
  }, [theme]);

  const centerView = useCallback(() => {
    rendererRef.current?.centerView();
  }, []);

  if (loading) {
    return (
      <div className="graph-view-container">
        <div className="graph-loading">
          <div className="loading-spinner" />
          <span>Loading graph...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`graph-view-container ${isFullScreen ? "fullscreen" : ""}`}>
      {/* Main content */}
      <div className="graph-main">
        {/* Canvas area */}
        <div ref={containerRef} className="graph-canvas-container">
          <canvas ref={canvasRef} />
          {filteredData.nodes.length === 0 && !loading && (
            <div className="graph-empty">
              <span>No nodes to display</span>
            </div>
          )}

          <div className="graph-node-counter">{filteredData.nodes.length} nodes</div>
        </div>

        {/* Settings panel */}
        {showSettingsPanel && (
          <div className="graph-settings-panel">
            <Section title="Filters">
              <div className="graph-search-row">
                <input
                  type="text"
                  placeholder="Search nodes..."
                  value={settings.searchTerm}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, searchTerm: e.target.value }))
                  }
                  className="graph-search-input"
                />
              </div>
              <Toggle
                label="Existing files only"
                checked={settings.existingFilesOnly}
                onChange={(v) => {
                  setSettings((s) => ({ ...s, existingFilesOnly: v }));
                  setReinitCounter((k) => k + 1);
                }}
                info="Hide phantom (unresolved) links"
              />
              <Toggle
                label="Show orphans"
                checked={settings.showOrphans}
                onChange={(v) => {
                  setSettings((s) => ({ ...s, showOrphans: v }));
                  setReinitCounter((k) => k + 1);
                }}
                info="Show notes with no links"
              />
            </Section>

            <Section title="Display" defaultOpen={false}>
              <ColorPicker
                label="Background"
                value={
                  settings.backgroundColor || (isDark ? "#101010" : "#f0f0f6")
                }
                onChange={(v) => {
                  setSettings((s) => ({ ...s, backgroundColor: v }));
                  const renderer = rendererRef.current;
                  if (renderer && renderer.isInitialized()) {
                    renderer.setBackgroundColor(hexToNumber(v));
                  }
                }}
                presets={["#101010", "#151515", "#f0f0f6", "#ffffff"]}
              />
              <ColorPicker
                label="Node color"
                value={settings.nodeColor}
                onChange={(v) => setSettings((s) => ({ ...s, nodeColor: v }))}
                presets={[
                  "#a0a0a0",
                  "#7f7f7f",
                  "#606060",
                  "#404040",
                  "#808080",
                ]}
              />
              <ColorPicker
                label="Connected"
                value={settings.connectedColor}
                onChange={(v) =>
                  setSettings((s) => ({ ...s, connectedColor: v }))
                }
                presets={[
                  "#c0c0c0",
                  "#a0a0a0",
                  "#808080",
                  "#606060",
                  "#b0b0b0",
                ]}
              />
              <ColorPicker
                label="Edge color"
                value={settings.edgeColor}
                onChange={(v) => setSettings((s) => ({ ...s, edgeColor: v }))}
                presets={[
                  "#505050",
                  "#404040",
                  "#606060",
                  "#707070",
                  "#808080",
                ]}
              />
              <Slider
                label="Node size"
                value={settings.nodeSize}
                onChange={(v) => setSettings((s) => ({ ...s, nodeSize: v }))}
                min={2}
                max={15}
              />
              <Slider
                label="Link width"
                value={settings.linkWidth}
                onChange={(v) => setSettings((s) => ({ ...s, linkWidth: v }))}
                min={0.5}
                max={5}
                step={0.5}
              />
            </Section>

            <Section title="Text" defaultOpen={false}>
              <Toggle
                label="Show labels"
                checked={settings.showLabels}
                onChange={(v) => setSettings((s) => ({ ...s, showLabels: v }))}
              />
              <ColorPicker
                label="Text color"
                value={settings.textColor}
                onChange={(v) => setSettings((s) => ({ ...s, textColor: v }))}
                presets={[
                  "#808080",
                  "#909090",
                  "#a0a0a0",
                  "#707070",
                  "#606060",
                ]}
              />
              <Slider
                label="Text size"
                value={settings.textSize}
                onChange={(v) => setSettings((s) => ({ ...s, textSize: v }))}
                min={8}
                max={18}
              />
              <Slider
                label="Show at zoom"
                value={settings.labelThreshold}
                onChange={(v) =>
                  setSettings((s) => ({ ...s, labelThreshold: v }))
                }
                min={0.1}
                max={1}
                step={0.1}
                info="Labels appear above this zoom level"
              />
            </Section>

            <Section title="Forces" defaultOpen={false}>
              <Slider
                label="Center force"
                value={settings.centerForce}
                onChange={(v) => setSettings((s) => ({ ...s, centerForce: v }))}
                min={0}
                max={50}
                info="Pulls nodes toward center"
              />
              <Slider
                label="Repel force"
                value={settings.repelForce}
                onChange={(v) => setSettings((s) => ({ ...s, repelForce: v }))}
                min={10}
                max={200}
                info="Pushes nodes apart"
              />
              <Slider
                label="Link force"
                value={settings.linkForce}
                onChange={(v) => setSettings((s) => ({ ...s, linkForce: v }))}
                min={0}
                max={100}
                info="Link spring strength"
              />
              <Slider
                label="Link distance"
                value={settings.linkDistance}
                onChange={(v) =>
                  setSettings((s) => ({ ...s, linkDistance: v }))
                }
                min={20}
                max={200}
                info="Target distance between linked nodes"
              />
            </Section>

            <div className="graph-settings-actions">
              <button className="graph-btn-secondary" onClick={resetSettings}>
                Reset All
              </button>
              <button className="graph-btn-primary" onClick={recalculateLayout}>
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
            <button className="graph-btn" onClick={centerView} title="Center view">
              <Target size={14} />
            </button>
            <button
              className="graph-btn"
              onClick={recalculateLayout}
              title="Recalculate layout"
            >
              <RotateCcw size={14} />
            </button>
            <button
              className={`graph-btn ${showSettingsPanel ? "active" : ""}`}
              onClick={() => setShowSettingsPanel(!showSettingsPanel)}
              title="Settings"
            >
              <Settings size={14} />
            </button>
            {onToggleFullScreen && (
              <button
                className="graph-btn"
                onClick={onToggleFullScreen}
                title={isFullScreen ? "Exit fullscreen" : "Fullscreen"}
              >
                {isFullScreen ? <Minimize size={14} /> : <Maximize size={14} />}
              </button>
            )}
            <button className="graph-btn" onClick={onClose} title="Close">
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GraphView;
