/**
 * Graph View Component - WebGL-based with PixiJS
 * Uses Web Worker for physics simulation and Canvas2D overlay for crisp labels
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Network, Maximize, Minimize, Settings, X, RotateCcw, Target } from 'lucide-react';
import { GraphNode, GraphEdge, Theme } from '../../types';
import { GraphRenderer } from './GraphRenderer';
import { getAPI } from '../../utils/api';

const api = getAPI();

// Get vault hash for localStorage keys
function getVaultHash(path: string): string {
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    const chr = path.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

interface GraphSettings {
  searchTerm: string;
  existingFilesOnly: boolean;
  showOrphans: boolean;
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

const getDefaultSettings = (isDark: boolean): GraphSettings => ({
  searchTerm: '',
  existingFilesOnly: false,
  showOrphans: true,
  nodeColor: isDark ? '#6ee7b7' : '#10b981',
  connectedColor: '#fbbf24',
  edgeColor: isDark ? '#6ee7b7' : '#059669',
  nodeSize: 5,
  linkWidth: 1,
  textColor: isDark ? '#9ca3af' : '#4b5563',
  textSize: 11,
  showLabels: true,
  labelThreshold: 0.4,
  centerForce: 10,
  repelForce: 100,
  linkForce: 50,
  linkDistance: 100,
});

function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

// UI Components
function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="graph-section">
      <button className="graph-section-header" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span className="graph-section-arrow">{open ? '▼' : '▶'}</span>
      </button>
      {open && <div className="graph-section-content">{children}</div>}
    </div>
  );
}

function Toggle({ label, checked, onChange, info }: { label: string; checked: boolean; onChange: (v: boolean) => void; info?: string }) {
  return (
    <label className="graph-toggle-row">
      <span className="graph-toggle-label">
        {label}
        {info && <span className="graph-info-icon" title={info}>ℹ</span>}
      </span>
      <div className={`graph-toggle ${checked ? 'active' : ''}`} onClick={() => onChange(!checked)}>
        <div className="graph-toggle-thumb" />
      </div>
    </label>
  );
}

function Slider({ label, value, onChange, min, max, step = 1, info }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; info?: string }) {
  return (
    <div className="graph-slider-row">
      <label className="graph-slider-label">
        {label}
        {info && <span className="graph-info-icon" title={info}>ℹ</span>}
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

function ColorPicker({ label, value, onChange, presets }: { label: string; value: string; onChange: (v: string) => void; presets?: string[] }) {
  return (
    <div className="graph-color-row">
      <label className="graph-color-label">{label}</label>
      <div className="graph-color-control">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="graph-color-input" />
        {presets && (
          <div className="graph-color-presets">
            {presets.map((c) => (
              <button key={c} className="graph-color-preset" style={{ backgroundColor: c }} onClick={() => onChange(c)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface GraphViewProps {
  onNodeClick: (noteName: string, heading?: string) => void;
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
  theme = 'dark',
  vaultPath,
  localNodePath,
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GraphRenderer | null>(null);
  const workerRef = useRef<Worker | null>(null);
  
  const [showSettingsPanel, setShowSettingsPanel] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [alpha, setAlpha] = useState(0);
  const [graphData, setGraphData] = useState<GraphDataState | null>(null);
  const [loading, setLoading] = useState(true);
  
  const isDark = theme === 'dark';
  const vaultHash = useMemo(() => getVaultHash(vaultPath || 'default'), [vaultPath]);
  const settingsKey = `openobsidian-graph-settings-v5-${vaultHash}`;
  const positionsKey = `openobsidian-graph-positions-v2-${vaultHash}`;
  
  // Load settings from localStorage
  const [settings, setSettings] = useState<GraphSettings>(() => {
    try {
      const saved = localStorage.getItem(settingsKey);
      if (saved) return { ...getDefaultSettings(isDark), ...JSON.parse(saved) };
    } catch {}
    return getDefaultSettings(isDark);
  });
  
  // Save settings
  useEffect(() => {
    try {
      localStorage.setItem(settingsKey, JSON.stringify(settings));
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
        console.error('Failed to load graph:', err);
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
      nodes = nodes.filter(n => n.name.toLowerCase().includes(term));
    }
    
    // Create a set of valid node IDs
    const nodeIds = new Set(nodes.map(n => n.id));
    
    // Filter edges to only include valid nodes
    edges = edges.filter(e => {
      const sourceId = typeof e.source === 'string' ? e.source : e.source.id;
      const targetId = typeof e.target === 'string' ? e.target : e.target.id;
      return nodeIds.has(sourceId) && nodeIds.has(targetId);
    });
    
    // Build connected set
    const connected = new Set<string>();
    edges.forEach(e => {
      const sourceId = typeof e.source === 'string' ? e.source : e.source.id;
      const targetId = typeof e.target === 'string' ? e.target : e.target.id;
      connected.add(sourceId);
      connected.add(targetId);
    });
    
    // Filter orphans if needed
    if (!settings.showOrphans) {
      nodes = nodes.filter(n => connected.has(n.id));
    }
    
    // Update connections count
    const connectionCount = new Map<string, number>();
    edges.forEach(e => {
      const sourceId = typeof e.source === 'string' ? e.source : e.source.id;
      const targetId = typeof e.target === 'string' ? e.target : e.target.id;
      connectionCount.set(sourceId, (connectionCount.get(sourceId) || 0) + 1);
      connectionCount.set(targetId, (connectionCount.get(targetId) || 0) + 1);
    });
    
    nodes = nodes.map(n => ({
      ...n,
      connections: connectionCount.get(n.id) || 0,
    }));
    
    // Normalize edges to just source/target strings
    const normalizedEdges = edges.map(e => ({
      source: typeof e.source === 'string' ? e.source : e.source.id,
      target: typeof e.target === 'string' ? e.target : e.target.id,
    }));
    
    return { nodes, edges: normalizedEdges };
  }, [graphData, settings.searchTerm, settings.showOrphans]);
  
  // Initialize renderer and worker
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current || loading || filteredData.nodes.length === 0) return;
    
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    
    // Create renderer
    const renderer = new GraphRenderer(canvas, {
      width: rect.width,
      height: rect.height,
      backgroundColor: isDark ? 0x111827 : 0xffffff,
    });
    rendererRef.current = renderer;
    
    // Create worker
    const worker = new Worker(
      new URL('./graphWorker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;
    
    // Worker message handler
    worker.onmessage = (e) => {
      const { type, ids, positions, alpha: a } = e.data;
      
      if (type === 'tick' && renderer.isInitialized()) {
        const posArray = new Float32Array(positions);
        renderer.updatePositionsFromArray(ids, posArray);
        setAlpha(a);
      } else if (type === 'end') {
        setSimulating(false);
        setAlpha(0);
        // Save positions
        try {
          const allPositions = renderer.getAllPositions();
          const posObj: Record<string, { x: number; y: number }> = {};
          allPositions.forEach((pos, id) => { posObj[id] = pos; });
          localStorage.setItem(positionsKey, JSON.stringify(posObj));
        } catch {}
      }
    };
    
    // Initialize renderer async
    renderer.init().then(() => {
      renderer.setCallbacks({
        onNodeClick: (nodeId) => {
          const node = filteredData.nodes.find(n => n.id === nodeId);
          if (node) {
            onNodeClick(node.name);
          }
        },
        onNodeDrag: (nodeId, x, y, active) => {
          worker.postMessage({ type: 'drag', data: { id: nodeId, x, y, active } });
        },
      });
      
      // Set initial styles
      renderer.setNodeStyle({
        color: hexToNumber(settings.nodeColor),
        size: settings.nodeSize,
        connectedColor: hexToNumber(settings.connectedColor),
      });
      renderer.setEdgeStyle({
        color: hexToNumber(settings.edgeColor),
        width: settings.linkWidth,
      });
      renderer.setLabelStyle({
        color: settings.textColor,
        size: settings.textSize,
        show: settings.showLabels,
        threshold: settings.labelThreshold,
      });
      
      // Load saved positions or initialize
      let savedPositions: Record<string, { x: number; y: number }> | null = null;
      try {
        const saved = localStorage.getItem(positionsKey);
        if (saved) savedPositions = JSON.parse(saved);
      } catch {}
      
      // Apply saved positions to nodes
      const nodesWithPositions = filteredData.nodes.map(n => {
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
      
      // Initialize worker
      worker.postMessage({
        type: 'init',
        data: {
          nodes: nodesWithPositions.map(n => ({
            id: n.id,
            x: n.x,
            y: n.y,
            connections: filteredData.edges.filter(e => e.source === n.id || e.target === n.id).length,
          })),
          edges: filteredData.edges.map(e => ({ source: e.source, target: e.target })),
          forces: {
            centerStrength: settings.centerForce / 100,
            repelStrength: settings.repelForce * 10,
            linkStrength: settings.linkForce / 50,
            linkDistance: settings.linkDistance * 2.5,
            collisionRadius: 60,
          },
        },
      });
      
      // Start simulation if no saved positions
      if (!savedPositions || Object.keys(savedPositions).length === 0) {
        setSimulating(true);
        worker.postMessage({ type: 'start' });
      } else {
        renderer.centerView();
      }
    }).catch(console.error);
    
    // Resize handler
    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      renderer.resize(rect.width, rect.height);
    };
    
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    
    return () => {
      resizeObserver.disconnect();
      worker.terminate();
      renderer.destroy();
    };
  }, [filteredData.nodes.length, filteredData.edges.length, loading, isDark]);
  
  // Update styles when settings change
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !renderer.isInitialized()) return;
    
    renderer.setNodeStyle({
      color: hexToNumber(settings.nodeColor),
      size: settings.nodeSize,
      connectedColor: hexToNumber(settings.connectedColor),
    });
    renderer.setEdgeStyle({
      color: hexToNumber(settings.edgeColor),
      width: settings.linkWidth,
    });
    renderer.setLabelStyle({
      color: settings.textColor,
      size: settings.textSize,
      show: settings.showLabels,
      threshold: settings.labelThreshold,
    });
  }, [settings.nodeColor, settings.connectedColor, settings.edgeColor, settings.nodeSize, settings.linkWidth, settings.textColor, settings.textSize, settings.showLabels, settings.labelThreshold]);
  
  // Update forces and reheat when force settings change
  const updateForces = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) return;
    
    worker.postMessage({
      type: 'forces',
      data: {
        centerStrength: settings.centerForce / 100,
        repelStrength: settings.repelForce * 10,
        linkStrength: settings.linkForce / 50,
        linkDistance: settings.linkDistance * 2.5,
      },
    });
  }, [settings.centerForce, settings.repelForce, settings.linkForce, settings.linkDistance]);
  
  const recalculateLayout = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) return;
    
    updateForces();
    setSimulating(true);
    worker.postMessage({ type: 'reheat' });
  }, [updateForces]);
  
  const resetSettings = useCallback(() => {
    setSettings(getDefaultSettings(isDark));
  }, [isDark]);
  
  const centerView = useCallback(() => {
    rendererRef.current?.centerView();
  }, []);

  if (loading) {
    return (
      <div className="graph-view-container">
        <div className="graph-header">
          <div className="graph-header-left">
            <Network size={16} />
            <span className="graph-title">Graph View</span>
          </div>
          <div className="graph-header-right">
            <button className="graph-btn" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="graph-loading">
          <div className="loading-spinner" />
          <span>Loading graph...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`graph-view-container ${isFullScreen ? 'fullscreen' : ''}`}>
      {/* Header */}
      <div className="graph-header">
        <div className="graph-header-left">
          <Network size={16} />
          <span className="graph-title">Graph View</span>
          <span className="graph-node-count">{filteredData.nodes.length} nodes</span>
        </div>
        <div className="graph-header-right">
          {simulating && (
            <div className="graph-sim-indicator">
              <div className="graph-sim-spinner" />
              <span>{Math.round(alpha * 100)}%</span>
            </div>
          )}
          <button className="graph-btn" onClick={centerView} title="Center view">
            <Target size={14} />
          </button>
          <button className="graph-btn" onClick={recalculateLayout} title="Recalculate layout">
            <RotateCcw size={14} />
          </button>
          <button className="graph-btn" onClick={() => setShowSettingsPanel(!showSettingsPanel)} title="Settings">
            <Settings size={14} />
          </button>
          {onToggleFullScreen && (
            <button className="graph-btn" onClick={onToggleFullScreen} title={isFullScreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {isFullScreen ? <Minimize size={14} /> : <Maximize size={14} />}
            </button>
          )}
          <button className="graph-btn" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>
      </div>
      
      {/* Main content */}
      <div className="graph-main">
        {/* Canvas area */}
        <div ref={containerRef} className="graph-canvas-container">
          <canvas ref={canvasRef} />
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
                  onChange={(e) => setSettings(s => ({ ...s, searchTerm: e.target.value }))}
                  className="graph-search-input"
                />
              </div>
              <Toggle
                label="Existing files only"
                checked={settings.existingFilesOnly}
                onChange={(v) => setSettings(s => ({ ...s, existingFilesOnly: v }))}
                info="Hide phantom (unresolved) links"
              />
              <Toggle
                label="Show orphans"
                checked={settings.showOrphans}
                onChange={(v) => setSettings(s => ({ ...s, showOrphans: v }))}
                info="Show notes with no links"
              />
            </Section>
            
            <Section title="Display" defaultOpen={false}>
              <ColorPicker
                label="Node color"
                value={settings.nodeColor}
                onChange={(v) => setSettings(s => ({ ...s, nodeColor: v }))}
                presets={['#6ee7b7', '#60a5fa', '#f472b6', '#facc15', '#a78bfa']}
              />
              <ColorPicker
                label="Connected"
                value={settings.connectedColor}
                onChange={(v) => setSettings(s => ({ ...s, connectedColor: v }))}
                presets={['#fbbf24', '#fb923c', '#f87171', '#4ade80', '#38bdf8']}
              />
              <ColorPicker
                label="Edge color"
                value={settings.edgeColor}
                onChange={(v) => setSettings(s => ({ ...s, edgeColor: v }))}
                presets={['#6ee7b7', '#6b7280', '#4b5563', '#9ca3af', '#d1d5db']}
              />
              <Slider
                label="Node size"
                value={settings.nodeSize}
                onChange={(v) => setSettings(s => ({ ...s, nodeSize: v }))}
                min={2}
                max={15}
              />
              <Slider
                label="Link width"
                value={settings.linkWidth}
                onChange={(v) => setSettings(s => ({ ...s, linkWidth: v }))}
                min={0.5}
                max={5}
                step={0.5}
              />
            </Section>
            
            <Section title="Text" defaultOpen={false}>
              <Toggle
                label="Show labels"
                checked={settings.showLabels}
                onChange={(v) => setSettings(s => ({ ...s, showLabels: v }))}
              />
              <ColorPicker
                label="Text color"
                value={settings.textColor}
                onChange={(v) => setSettings(s => ({ ...s, textColor: v }))}
                presets={['#9ca3af', '#d1d5db', '#f3f4f6', '#6b7280', '#ffffff']}
              />
              <Slider
                label="Text size"
                value={settings.textSize}
                onChange={(v) => setSettings(s => ({ ...s, textSize: v }))}
                min={8}
                max={18}
              />
              <Slider
                label="Show at zoom"
                value={settings.labelThreshold}
                onChange={(v) => setSettings(s => ({ ...s, labelThreshold: v }))}
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
                onChange={(v) => setSettings(s => ({ ...s, centerForce: v }))}
                min={0}
                max={50}
                info="Pulls nodes toward center"
              />
              <Slider
                label="Repel force"
                value={settings.repelForce}
                onChange={(v) => setSettings(s => ({ ...s, repelForce: v }))}
                min={10}
                max={200}
                info="Pushes nodes apart"
              />
              <Slider
                label="Link force"
                value={settings.linkForce}
                onChange={(v) => setSettings(s => ({ ...s, linkForce: v }))}
                min={0}
                max={100}
                info="Link spring strength"
              />
              <Slider
                label="Link distance"
                value={settings.linkDistance}
                onChange={(v) => setSettings(s => ({ ...s, linkDistance: v }))}
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
      </div>
    </div>
  );
}

export default GraphView;
