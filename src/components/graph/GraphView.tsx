/**
 * Graph View - STATIC Knowledge Graph
 * No floating, no scattering. Positions are computed once then frozen.
 * Positions persist across sessions via localStorage.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { Network, Maximize, Minimize, Settings, ChevronDown, ChevronRight, Search, X, RotateCcw, Info } from 'lucide-react';
import { GraphData, GraphNode, GraphEdge, Theme } from '../../types';
import { getAPI } from '../../utils/api';

const api = getAPI();
const SETTINGS_KEY = 'openobsidian-graph-settings-v4';
const POSITIONS_KEY = 'openobsidian-graph-positions-v1';

interface GraphSettings {
  searchFilter: string;
  showOrphans: boolean;
  existingFilesOnly: boolean;
  nodeColor: string;
  edgeColor: string;
  nodeSize: number;
  linkThickness: number;
  showLabels: boolean;
  textColor: string;
  textSize: number;
  textThreshold: number;
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
}

// Theme-specific default settings
const getDefaultSettings = (isDark: boolean): GraphSettings => ({
  searchFilter: '',
  showOrphans: true,
  existingFilesOnly: false,
  nodeColor: isDark ? '#6ee7b7' : '#10b981',
  edgeColor: isDark ? '#6ee7b7' : '#059669',
  nodeSize: 3,
  linkThickness: 0.8,
  showLabels: true,
  textColor: isDark ? '#9ca3af' : '#4b5563',
  textSize: 9,
  textThreshold: 0,
  centerForce: 30,
  repelForce: 100,
  linkForce: 50,
  linkDistance: 60,
});

// Fallback for initial load
const defaultSettings = getDefaultSettings(true);

function loadSettings(isDark: boolean): GraphSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? { ...getDefaultSettings(isDark), ...JSON.parse(saved) } : getDefaultSettings(isDark);
  } catch { return getDefaultSettings(isDark); }
}

function saveSettings(s: GraphSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

// Position persistence
function loadPositions(): Map<string, {x: number, y: number}> {
  try {
    const saved = localStorage.getItem(POSITIONS_KEY);
    if (saved) {
      const arr = JSON.parse(saved) as Array<[string, {x: number, y: number}]>;
      return new Map(arr);
    }
  } catch {}
  return new Map();
}

function savePositions(positions: Map<string, {x: number, y: number}>) {
  try {
    const arr = Array.from(positions.entries());
    localStorage.setItem(POSITIONS_KEY, JSON.stringify(arr));
  } catch {}
}

// UI Components
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`graph-toggle-switch ${checked ? 'active' : ''}`} onClick={() => onChange(!checked)} type="button">
      <span className="graph-toggle-thumb" />
    </button>
  );
}

function Slider({ value, onChange, min, max, step = 1, label, info }: { 
  value: number; onChange: (v: number) => void; min: number; max: number; step?: number; label: string; info?: string;
}) {
  return (
    <div className="graph-setting-row">
      <div className="graph-setting-label">
        <span>{label}</span>
        {info && <span className="graph-info-icon" title={info}><Info size={12} /></span>}
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="graph-slider-input" />
    </div>
  );
}

function ColorPicker({ value, onChange, label, info }: { value: string; onChange: (v: string) => void; label: string; info?: string; }) {
  return (
    <div className="graph-setting-row">
      <div className="graph-setting-label">
        <span>{label}</span>
        {info && <span className="graph-info-icon" title={info}><Info size={12} /></span>}
      </div>
      <input type="color" value={value} onChange={e => onChange(e.target.value)} className="graph-color-input" />
    </div>
  );
}

function ToggleRow({ checked, onChange, label, info }: { checked: boolean; onChange: (v: boolean) => void; label: string; info?: string; }) {
  return (
    <div className="graph-setting-row">
      <div className="graph-setting-label">
        <span>{label}</span>
        {info && <span className="graph-info-icon" title={info}><Info size={12} /></span>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

interface GraphViewProps {
  onNodeClick: (noteName: string) => void;
  onClose: () => void;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
  theme?: Theme;
  vaultPath?: string | null;
  localNodePath?: string | null;
}

export function GraphView({ 
  onNodeClick, onClose, isFullScreen, onToggleFullScreen, 
  theme = 'dark', vaultPath, localNodePath 
}: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const positionsRef = useRef<Map<string, {x: number, y: number}>>(loadPositions());
  const initialFitDoneRef = useRef(positionsRef.current.size > 0);
  const prevForceSettingsRef = useRef<string>('');
  
  const isDark = theme === 'dark';
  
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isLocalView, setIsLocalView] = useState(!!localNodePath);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<GraphSettings>(() => loadSettings(isDark));
  const [sections, setSections] = useState({ filters: true, display: false, text: false, forces: false });
  const [layoutKey, setLayoutKey] = useState(0);
  
  const onNodeClickRef = useRef(onNodeClick);
  useEffect(() => { onNodeClickRef.current = onNodeClick; }, [onNodeClick]);
  useEffect(() => { saveSettings(settings); }, [settings]);

  const updateSetting = useCallback(<K extends keyof GraphSettings>(key: K, value: GraphSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    setLoading(true);
    api.getGraphData()
      .then(data => setGraphData(data))
      .catch(err => console.error('Failed to load graph:', err))
      .finally(() => setLoading(false));
  }, [vaultPath]);

  const adjacencyMap = useMemo(() => {
    if (!graphData) return new Map<string, Set<string>>();
    const map = new Map<string, Set<string>>();
    graphData.edges.forEach(edge => {
      const sid = typeof edge.source === 'string' ? edge.source : edge.source.id;
      const tid = typeof edge.target === 'string' ? edge.target : edge.target.id;
      if (!map.has(sid)) map.set(sid, new Set());
      if (!map.has(tid)) map.set(tid, new Set());
      map.get(sid)!.add(tid);
      map.get(tid)!.add(sid);
    });
    return map;
  }, [graphData]);

  const { displayNodes, displayEdges } = useMemo(() => {
    if (!graphData) return { displayNodes: [], displayEdges: [] };
    
    let nodes = graphData.nodes.map(n => ({ ...n }));
    let edges = graphData.edges.map(e => ({ ...e }));
    
    if (settings.searchFilter.trim()) {
      const search = settings.searchFilter.toLowerCase();
      const matchIds = new Set(nodes.filter(n => n.name.toLowerCase().includes(search)).map(n => n.id));
      nodes = nodes.filter(n => matchIds.has(n.id));
      edges = edges.filter(e => {
        const sid = typeof e.source === 'string' ? e.source : e.source.id;
        const tid = typeof e.target === 'string' ? e.target : e.target.id;
        return matchIds.has(sid) && matchIds.has(tid);
      });
    }
    
    if (settings.existingFilesOnly) {
      const existIds = new Set(nodes.filter(n => n.path).map(n => n.id));
      nodes = nodes.filter(n => existIds.has(n.id));
      edges = edges.filter(e => {
        const sid = typeof e.source === 'string' ? e.source : e.source.id;
        const tid = typeof e.target === 'string' ? e.target : e.target.id;
        return existIds.has(sid) && existIds.has(tid);
      });
    }
    
    if (!settings.showOrphans) {
      const connected = new Set<string>();
      edges.forEach(e => {
        connected.add(typeof e.source === 'string' ? e.source : e.source.id);
        connected.add(typeof e.target === 'string' ? e.target : e.target.id);
      });
      nodes = nodes.filter(n => connected.has(n.id));
    }
    
    if (isLocalView && localNodePath) {
      const focalName = localNodePath.replace(/\.md$/, '').split('/').pop()!;
      const focal = nodes.find(n => n.id === focalName || n.id === localNodePath || n.id === localNodePath.replace(/\.md$/, ''));
      if (focal && adjacencyMap.has(focal.id)) {
        const localIds = new Set([focal.id, ...adjacencyMap.get(focal.id)!]);
        nodes = nodes.filter(n => localIds.has(n.id));
        edges = edges.filter(e => {
          const sid = typeof e.source === 'string' ? e.source : e.source.id;
          const tid = typeof e.target === 'string' ? e.target : e.target.id;
          return localIds.has(sid) && localIds.has(tid);
        });
      }
    }
    
    return { displayNodes: nodes, displayEdges: edges };
  }, [graphData, settings.searchFilter, settings.existingFilesOnly, settings.showOrphans, isLocalView, localNodePath, adjacencyMap]);

  // Check if force settings changed - if so, trigger relayout
  const forceSettingsKey = `${settings.centerForce}-${settings.repelForce}-${settings.linkForce}-${settings.linkDistance}`;
  
  useEffect(() => {
    if (prevForceSettingsRef.current && prevForceSettingsRef.current !== forceSettingsKey) {
      // Force settings changed, recalculate layout
      positionsRef.current.clear();
      setLayoutKey(k => k + 1);
    }
    prevForceSettingsRef.current = forceSettingsKey;
  }, [forceSettingsKey]);

  // MAIN RENDER - Compute layout ONCE, then render STATIC
  useEffect(() => {
    if (!svgRef.current || displayNodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    const container = svgRef.current.parentElement!;
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    svg.attr('width', width).attr('height', height);
    svg.selectAll('*').remove();

    const nodeColor = settings.nodeColor;
    const phantomColor = isDark ? '#6b7280' : '#9ca3af';
    const edgeColor = settings.edgeColor + (isDark ? '50' : '70');
    const textColor = settings.textColor;
    const selectedColor = '#22c55e';
    const connectedColor = '#f59e0b';

    const g = svg.append('g');

    // Zoom - save transform on zoom, restore previous transform
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', e => {
        g.attr('transform', e.transform);
        transformRef.current = e.transform;
      });
    zoomRef.current = zoom;
    svg.call(zoom);
    
    // Restore previous transform immediately (no animation)
    if (transformRef.current !== d3.zoomIdentity) {
      svg.call(zoom.transform, transformRef.current);
    }
    
    svg.on('click', e => { if (e.target === svgRef.current) setSelectedNode(null); });

    const getRadius = (d: GraphNode) => {
      const base = settings.nodeSize;
      const connBonus = Math.min(Math.log2((d.connections || 0) + 1), 3);
      return Math.max(2, Math.min(base + connBonus, 10));
    };

    // Check if we have cached positions
    const needsLayout = displayNodes.some(n => !positionsRef.current.has(n.id));
    let didLayout = false;

    if (needsLayout) {
      didLayout = true;
      // COMPUTE LAYOUT SYNCHRONOUSLY - no animation, no floating
      const simNodes = displayNodes.map(n => ({ ...n }));
      const simEdges = displayEdges.map(e => ({ ...e }));

      // Initialize positions
      simNodes.forEach((node, i) => {
        const cached = positionsRef.current.get(node.id);
        if (cached) {
          node.x = cached.x;
          node.y = cached.y;
        } else {
          const angle = (i / simNodes.length) * 2 * Math.PI;
          const radius = Math.min(width, height) * 0.3;
          node.x = width / 2 + Math.cos(angle) * radius * (0.5 + Math.random() * 0.5);
          node.y = height / 2 + Math.sin(angle) * radius * (0.5 + Math.random() * 0.5);
        }
      });

      // Create and run simulation to completion
      const simulation = d3.forceSimulation<GraphNode>(simNodes)
        .force('link', d3.forceLink<GraphNode, GraphEdge>(simEdges)
          .id(d => d.id)
          .distance(settings.linkDistance)
          .strength(settings.linkForce / 100))
        .force('charge', d3.forceManyBody()
          .strength(-settings.repelForce * 1.5)
          .distanceMax(400))
        .force('center', d3.forceCenter(width / 2, height / 2)
          .strength(settings.centerForce / 100))
        .force('collision', d3.forceCollide().radius(d => getRadius(d as GraphNode) + 5))
        .stop();

      // Run simulation ticks synchronously
      for (let i = 0; i < 300; i++) {
        simulation.tick();
      }

      // Save positions to ref and localStorage
      simNodes.forEach(node => {
        if (node.x !== undefined && node.y !== undefined) {
          positionsRef.current.set(node.id, { x: node.x, y: node.y });
          const original = displayNodes.find(n => n.id === node.id);
          if (original) {
            original.x = node.x;
            original.y = node.y;
          }
        }
      });
      // Persist to localStorage
      savePositions(positionsRef.current);
    } else {
      // Use cached positions
      displayNodes.forEach(node => {
        const cached = positionsRef.current.get(node.id);
        if (cached) {
          node.x = cached.x;
          node.y = cached.y;
        }
      });
    }

    // Now render STATIC graph
    const nodeMap = new Map(displayNodes.map(n => [n.id, n]));
    
    // Links
    const linkGroup = g.append('g').attr('class', 'links');
    linkGroup.selectAll('line')
      .data(displayEdges)
      .enter()
      .append('line')
      .attr('x1', d => {
        const src = typeof d.source === 'string' ? nodeMap.get(d.source) : d.source;
        return src?.x || 0;
      })
      .attr('y1', d => {
        const src = typeof d.source === 'string' ? nodeMap.get(d.source) : d.source;
        return src?.y || 0;
      })
      .attr('x2', d => {
        const tgt = typeof d.target === 'string' ? nodeMap.get(d.target) : d.target;
        return tgt?.x || 0;
      })
      .attr('y2', d => {
        const tgt = typeof d.target === 'string' ? nodeMap.get(d.target) : d.target;
        return tgt?.y || 0;
      })
      .attr('stroke', edgeColor)
      .attr('stroke-width', settings.linkThickness);

    // Nodes
    const nodeGroup = g.append('g').attr('class', 'nodes');
    const isConnected = (id: string) => selectedNode === id || adjacencyMap.get(selectedNode || '')?.has(id);

    const nodes = nodeGroup.selectAll('g')
      .data(displayNodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.x},${d.y})`);

    nodes.append('circle')
      .attr('r', getRadius)
      .attr('fill', d => {
        if (selectedNode === d.id) return selectedColor;
        if (selectedNode && isConnected(d.id)) return connectedColor;
        return d.path ? nodeColor : phantomColor;
      })
      .attr('stroke', isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', d => d.path ? 'none' : '2 1')
      .style('opacity', d => selectedNode && !isConnected(d.id) ? 0.3 : 1)
      .style('cursor', 'pointer')
      .on('click', (e, d) => {
        e.stopPropagation();
        setSelectedNode(prev => prev === d.id ? null : d.id);
        onNodeClickRef.current(d.name);
      });

    // Labels
    if (settings.showLabels) {
      nodes.filter(d => (d.connections || 0) >= settings.textThreshold)
        .append('text')
        .text(d => d.name)
        .attr('dy', d => getRadius(d) + settings.textSize + 2)
        .attr('text-anchor', 'middle')
        .attr('font-size', `${settings.textSize}px`)
        .attr('fill', textColor)
        .style('pointer-events', 'none')
        .style('opacity', d => selectedNode && !isConnected(d.id) ? 0.2 : 0.8);
    }

    // DRAG - moves node directly, NO simulation
    const drag = d3.drag<SVGGElement, GraphNode>()
      .on('drag', function(event, d) {
        d.x = event.x;
        d.y = event.y;
        d3.select(this).attr('transform', `translate(${event.x},${event.y})`);
        
        // Update connected links
        linkGroup.selectAll('line')
          .attr('x1', (l: any) => {
            const src = typeof l.source === 'string' ? nodeMap.get(l.source) : l.source;
            return src?.x || 0;
          })
          .attr('y1', (l: any) => {
            const src = typeof l.source === 'string' ? nodeMap.get(l.source) : l.source;
            return src?.y || 0;
          })
          .attr('x2', (l: any) => {
            const tgt = typeof l.target === 'string' ? nodeMap.get(l.target) : l.target;
            return tgt?.x || 0;
          })
          .attr('y2', (l: any) => {
            const tgt = typeof l.target === 'string' ? nodeMap.get(l.target) : l.target;
            return tgt?.y || 0;
          });
      })
      .on('end', function(_, d) {
        positionsRef.current.set(d.id, { x: d.x!, y: d.y! });
        // Persist after manual drag
        savePositions(positionsRef.current);
      });
    
    nodes.call(drag as any);

    // Fit to view ONLY on initial layout or after recalculate
    if (didLayout || !initialFitDoneRef.current) {
      setTimeout(() => {
        const bounds = g.node()?.getBBox();
        if (bounds && bounds.width > 0) {
          const padding = 80;
          const scale = Math.min(0.9, Math.min(
            (width - padding) / bounds.width,
            (height - padding) / bounds.height
          ));
          const tx = width / 2 - (bounds.x + bounds.width / 2) * scale;
          const ty = height / 2 - (bounds.y + bounds.height / 2) * scale;
          svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
          initialFitDoneRef.current = true;
        }
      }, 50);
    }

  }, [displayNodes, displayEdges, isDark, selectedNode, settings, adjacencyMap, layoutKey]);

  const handleZoom = (factor: number) => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, factor);
    }
  };

  // Reset only visual settings, preserve force settings and layout
  const handleReset = () => {
    const defaults = getDefaultSettings(isDark);
    setSettings(prev => ({
      ...prev,
      // Reset visual settings only
      nodeColor: defaults.nodeColor,
      edgeColor: defaults.edgeColor,
      textColor: defaults.textColor,
      nodeSize: defaults.nodeSize,
      linkThickness: defaults.linkThickness,
      textSize: defaults.textSize,
      textThreshold: defaults.textThreshold,
      showLabels: defaults.showLabels,
      // Keep force settings as-is to avoid relayout
      // centerForce, repelForce, linkForce, linkDistance stay the same
    }));
  };
  
  // Full reset including forces (triggers relayout)
  const handleFullReset = () => {
    const defaults = getDefaultSettings(isDark);
    positionsRef.current.clear();
    localStorage.removeItem(POSITIONS_KEY);
    initialFitDoneRef.current = false;
    transformRef.current = d3.zoomIdentity;
    setSettings(defaults);
    setLayoutKey(k => k + 1);
  };
  
  const handleResetLayout = () => {
    positionsRef.current.clear();
    localStorage.removeItem(POSITIONS_KEY);
    initialFitDoneRef.current = false;
    transformRef.current = d3.zoomIdentity;
    setLayoutKey(k => k + 1);
  };

  const Section = ({ title, id, children }: { title: string; id: keyof typeof sections; children: React.ReactNode }) => (
    <div className="graph-section">
      <button className="graph-section-header" onClick={() => setSections(p => ({ ...p, [id]: !p[id] }))}>
        {sections[id] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>{title}</span>
      </button>
      {sections[id] && <div className="graph-section-content">{children}</div>}
    </div>
  );

  return (
    <>
      <div className="graph-header">
        <h2><Network size={18} style={{ opacity: 0.6 }} /> {isLocalView ? 'Local Graph' : 'Graph View'}</h2>
        <div className="graph-header-actions">
          {localNodePath && (
            <button className={`graph-view-toggle ${isLocalView ? 'local' : ''}`} onClick={() => setIsLocalView(v => !v)}>
              {isLocalView ? '🌐 Global' : '📍 Local'}
            </button>
          )}
          <span className="graph-stats">{displayNodes.length} nodes</span>
          <button className={`btn-icon ${showSettings ? 'active' : ''}`} onClick={() => setShowSettings(v => !v)} title="Settings">
            <Settings size={16} />
          </button>
          {onToggleFullScreen && (
            <button className="btn-icon" onClick={onToggleFullScreen} title="Fullscreen">
              {isFullScreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          )}
          <button className="btn-icon" onClick={onClose} title="Close">✕</button>
        </div>
      </div>

      <div className="graph-body">
        {showSettings && (
          <div className="graph-settings">
            <div className="graph-settings-header">
              <span className="graph-settings-title">Settings</span>
              <button className="graph-settings-reset" onClick={handleReset} title="Reset to defaults">
                <RotateCcw size={14} />
              </button>
              <button className="graph-settings-close" onClick={() => setShowSettings(false)}>
                <X size={14} />
              </button>
            </div>

            <Section title="Filters" id="filters">
              <div className="graph-search">
                <Search size={14} />
                <input type="text" placeholder="Search files..." value={settings.searchFilter} onChange={e => updateSetting('searchFilter', e.target.value)} />
                {settings.searchFilter && <button onClick={() => updateSetting('searchFilter', '')}><X size={12} /></button>}
              </div>
              <ToggleRow label="Existing files only" checked={settings.existingFilesOnly} onChange={v => updateSetting('existingFilesOnly', v)} info="Only show notes that exist as files" />
              <ToggleRow label="Show orphans" checked={settings.showOrphans} onChange={v => updateSetting('showOrphans', v)} info="Show notes with no connections" />
            </Section>

            <Section title="Display" id="display">
              <ColorPicker label="Node color" value={settings.nodeColor} onChange={v => updateSetting('nodeColor', v)} info="Color of note nodes" />
              <ColorPicker label="Edge color" value={settings.edgeColor} onChange={v => updateSetting('edgeColor', v)} info="Color of connection lines" />
              <Slider label="Node size" value={settings.nodeSize} min={1} max={8} onChange={v => updateSetting('nodeSize', v)} info="Base size of nodes" />
              <Slider label="Link thickness" value={settings.linkThickness} min={0.3} max={3} step={0.1} onChange={v => updateSetting('linkThickness', v)} info="Thickness of lines" />
            </Section>

            <Section title="Text" id="text">
              <ToggleRow label="Show labels" checked={settings.showLabels} onChange={v => updateSetting('showLabels', v)} info="Display note names" />
              <ColorPicker label="Text color" value={settings.textColor} onChange={v => updateSetting('textColor', v)} info="Color of labels" />
              <Slider label="Text size" value={settings.textSize} min={6} max={14} onChange={v => updateSetting('textSize', v)} info="Font size in pixels" />
              <Slider label="Show labels above" value={settings.textThreshold} min={0} max={10} onChange={v => updateSetting('textThreshold', v)} info="Min connections to show label" />
            </Section>

            <Section title="Forces" id="forces">
              <Slider label="Center force" value={settings.centerForce} min={0} max={100} onChange={v => updateSetting('centerForce', v)} info="Pull toward center" />
              <Slider label="Repel force" value={settings.repelForce} min={0} max={200} onChange={v => updateSetting('repelForce', v)} info="Push nodes apart" />
              <Slider label="Link force" value={settings.linkForce} min={0} max={100} onChange={v => updateSetting('linkForce', v)} info="Pull connected nodes together" />
              <Slider label="Link distance" value={settings.linkDistance} min={20} max={150} onChange={v => updateSetting('linkDistance', v)} info="Target distance between nodes" />
              <button className="graph-relayout-btn" onClick={handleResetLayout}>
                <RotateCcw size={12} /> Recalculate Layout
              </button>
            </Section>
            
            <div className="graph-reset-all">
              <button className="graph-reset-all-btn" onClick={handleFullReset}>
                Reset All to Defaults
              </button>
            </div>
          </div>
        )}

        <div className="graph-canvas">
          {loading ? (
            <div className="graph-empty"><div className="loading-spinner" /><span>Loading...</span></div>
          ) : displayNodes.length === 0 ? (
            <div className="graph-empty"><Network size={48} strokeWidth={1} style={{ opacity: 0.3 }} /><span>No notes</span></div>
          ) : (
            <>
              <svg ref={svgRef} />
              <div className="graph-zoom-controls">
                <button onClick={() => handleZoom(1.3)}>+</button>
                <button onClick={() => handleZoom(0.7)}>−</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
