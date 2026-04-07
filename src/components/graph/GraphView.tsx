/**
 * Graph View - Stable Knowledge Graph with Full Customization
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { Network, Maximize, Minimize, Settings, ChevronDown, ChevronRight, Search, X, RotateCcw, Info } from 'lucide-react';
import { GraphData, GraphNode, GraphEdge, Theme } from '../../types';
import { getAPI } from '../../utils/api';

const api = getAPI();
const SETTINGS_KEY = 'openobsidian-graph-settings-v2';

interface GraphSettings {
  // Filters
  searchFilter: string;
  showOrphans: boolean;
  existingFilesOnly: boolean;
  // Display
  nodeColor: string;
  edgeColor: string;
  nodeSize: number;
  linkThickness: number;
  // Text
  showLabels: boolean;
  textColor: string;
  textSize: number;
  textThreshold: number;
  // Forces
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
}

const defaultSettings: GraphSettings = {
  searchFilter: '',
  showOrphans: true,
  existingFilesOnly: false,
  nodeColor: '#6ee7b7',
  edgeColor: '#6ee7b7',
  nodeSize: 3,
  linkThickness: 0.8,
  showLabels: true,
  textColor: '#d1d5db',
  textSize: 9,
  textThreshold: 0,
  centerForce: 30,
  repelForce: 80,
  linkForce: 30,
  linkDistance: 50,
};

function loadSettings(): GraphSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  } catch { return defaultSettings; }
}

function saveSettings(s: GraphSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

// Components
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

function ColorPicker({ value, onChange, label, info }: { 
  value: string; onChange: (v: string) => void; label: string; info?: string;
}) {
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

function ToggleRow({ checked, onChange, label, info }: { 
  checked: boolean; onChange: (v: boolean) => void; label: string; info?: string;
}) {
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
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const initialRenderRef = useRef(true);
  
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isLocalView, setIsLocalView] = useState(!!localNodePath);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<GraphSettings>(loadSettings);
  const [sections, setSections] = useState({ filters: true, display: false, text: false, forces: false });
  
  const onNodeClickRef = useRef(onNodeClick);
  useEffect(() => { onNodeClickRef.current = onNodeClick; }, [onNodeClick]);
  useEffect(() => { saveSettings(settings); }, [settings]);

  const updateSetting = useCallback(<K extends keyof GraphSettings>(key: K, value: GraphSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  // Fetch graph data
  useEffect(() => {
    setLoading(true);
    api.getGraphData()
      .then(data => setGraphData(data))
      .catch(err => console.error('Failed to load graph:', err))
      .finally(() => setLoading(false));
  }, [vaultPath]);

  // Build adjacency map
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

  // Filter nodes and edges
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

  // Main render effect
  useEffect(() => {
    if (!svgRef.current || displayNodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    const container = svgRef.current.parentElement!;
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    svg.attr('width', width).attr('height', height);
    svg.selectAll('*').remove();

    // Colors
    const isDark = theme === 'dark';
    const nodeColor = settings.nodeColor;
    const phantomColor = isDark ? '#6b7280' : '#9ca3af';
    const edgeColor = settings.edgeColor + '40'; // Add transparency
    const textColor = settings.textColor;
    const selectedColor = '#22c55e';
    const connectedColor = '#f59e0b';

    const g = svg.append('g');

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', e => g.attr('transform', e.transform));
    zoomRef.current = zoom;
    svg.call(zoom);
    svg.on('click', e => { if (e.target === svgRef.current) setSelectedNode(null); });

    // Initialize positions only on first render
    if (initialRenderRef.current) {
      displayNodes.forEach((node, i) => {
        const angle = (i / displayNodes.length) * 2 * Math.PI;
        const radius = Math.min(width, height) * 0.3;
        node.x = width / 2 + Math.cos(angle) * radius;
        node.y = height / 2 + Math.sin(angle) * radius;
      });
      initialRenderRef.current = false;
    }

    // Links
    const linkGroup = g.append('g').attr('class', 'links');
    const links = linkGroup.selectAll('line')
      .data(displayEdges)
      .enter()
      .append('line')
      .attr('stroke', edgeColor)
      .attr('stroke-width', settings.linkThickness)
      .attr('stroke-linecap', 'round');

    // Nodes
    const nodeGroup = g.append('g').attr('class', 'nodes');
    const nodes = nodeGroup.selectAll('g')
      .data(displayNodes)
      .enter()
      .append('g')
      .attr('class', 'node');

    // Fixed small radius calculation
    const getRadius = (d: GraphNode) => {
      const base = settings.nodeSize;
      const connBonus = Math.min(Math.log2((d.connections || 0) + 1), 3);
      return Math.max(2, Math.min(base + connBonus, 12));
    };
    
    const isConnected = (id: string) => selectedNode === id || adjacencyMap.get(selectedNode || '')?.has(id);

    // Node circles
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

    // Drag - does NOT restart simulation aggressively
    const drag = d3.drag<SVGGElement, GraphNode>()
      .on('start', function(event, d) {
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', function(event, d) {
        d.fx = event.x;
        d.fy = event.y;
        d.x = event.x;
        d.y = event.y;
        d3.select(this).attr('transform', `translate(${event.x},${event.y})`);
        // Update connected links immediately
        links.filter((l: any) => l.source.id === d.id || l.target.id === d.id)
          .attr('x1', (l: any) => l.source.id === d.id ? event.x : l.source.x)
          .attr('y1', (l: any) => l.source.id === d.id ? event.y : l.source.y)
          .attr('x2', (l: any) => l.target.id === d.id ? event.x : l.target.x)
          .attr('y2', (l: any) => l.target.id === d.id ? event.y : l.target.y);
      })
      .on('end', function(_, d) {
        d.fx = null;
        d.fy = null;
      });
    nodes.call(drag as any);

    // Simulation with radial force for circular layout
    const centerX = width / 2;
    const centerY = height / 2;
    const graphRadius = Math.min(width, height) * 0.4;
    
    const simulation = d3.forceSimulation<GraphNode>(displayNodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(displayEdges)
        .id(d => d.id)
        .distance(settings.linkDistance)
        .strength(settings.linkForce / 100))
      .force('charge', d3.forceManyBody()
        .strength(-settings.repelForce)
        .distanceMax(400))
      .force('center', d3.forceCenter(centerX, centerY)
        .strength(settings.centerForce / 100))
      .force('collision', d3.forceCollide().radius(d => getRadius(d as GraphNode) + 4))
      // Radial force - pulls nodes toward a circle
      .force('radial', d3.forceRadial(graphRadius * 0.6, centerX, centerY).strength(0.05))
      .velocityDecay(0.5)
      .alpha(0.8)
      .alphaDecay(0.03);

    simulationRef.current = simulation;

    simulation.on('tick', () => {
      links
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);
      nodes.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Stop simulation after settling
    simulation.on('end', () => {
      simulationRef.current = null;
    });

    // Fit to view after initial layout
    setTimeout(() => {
      const bounds = g.node()?.getBBox();
      if (bounds && bounds.width > 0) {
        const padding = 60;
        const scale = Math.min(0.9, Math.min(
          (width - padding) / bounds.width,
          (height - padding) / bounds.height
        ));
        const tx = width / 2 - (bounds.x + bounds.width / 2) * scale;
        const ty = height / 2 - (bounds.y + bounds.height / 2) * scale;
        svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
      }
    }, 600);

    return () => { simulation.stop(); };
  }, [displayNodes, displayEdges, theme, selectedNode, settings, adjacencyMap]);

  const handleZoom = (factor: number) => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, factor);
    }
  };

  const handleReset = () => setSettings(defaultSettings);

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
                <input
                  type="text"
                  placeholder="Search files..."
                  value={settings.searchFilter}
                  onChange={e => updateSetting('searchFilter', e.target.value)}
                />
                {settings.searchFilter && <button onClick={() => updateSetting('searchFilter', '')}><X size={12} /></button>}
              </div>
              <ToggleRow 
                label="Existing files only" 
                checked={settings.existingFilesOnly} 
                onChange={v => updateSetting('existingFilesOnly', v)}
                info="Only show notes that exist as files, hide phantom links"
              />
              <ToggleRow 
                label="Show orphans" 
                checked={settings.showOrphans} 
                onChange={v => updateSetting('showOrphans', v)}
                info="Show notes with no connections to other notes"
              />
            </Section>

            <Section title="Display" id="display">
              <ColorPicker 
                label="Node color" 
                value={settings.nodeColor} 
                onChange={v => updateSetting('nodeColor', v)}
                info="Color of the note nodes in the graph"
              />
              <ColorPicker 
                label="Edge color" 
                value={settings.edgeColor} 
                onChange={v => updateSetting('edgeColor', v)}
                info="Color of the lines connecting nodes"
              />
              <Slider 
                label="Node size" 
                value={settings.nodeSize} 
                min={1} max={8} 
                onChange={v => updateSetting('nodeSize', v)}
                info="Base size of nodes (1-8px)"
              />
              <Slider 
                label="Link thickness" 
                value={settings.linkThickness} 
                min={0.3} max={3} step={0.1}
                onChange={v => updateSetting('linkThickness', v)}
                info="Thickness of connection lines"
              />
            </Section>

            <Section title="Text" id="text">
              <ToggleRow 
                label="Show labels" 
                checked={settings.showLabels} 
                onChange={v => updateSetting('showLabels', v)}
                info="Display note names below nodes"
              />
              <ColorPicker 
                label="Text color" 
                value={settings.textColor} 
                onChange={v => updateSetting('textColor', v)}
                info="Color of the label text"
              />
              <Slider 
                label="Text size" 
                value={settings.textSize} 
                min={6} max={14} 
                onChange={v => updateSetting('textSize', v)}
                info="Font size of labels in pixels"
              />
              <Slider 
                label="Show labels above" 
                value={settings.textThreshold} 
                min={0} max={10} 
                onChange={v => updateSetting('textThreshold', v)}
                info="Only show labels for nodes with this many connections or more"
              />
            </Section>

            <Section title="Forces" id="forces">
              <Slider 
                label="Center force" 
                value={settings.centerForce} 
                min={0} max={100} 
                onChange={v => updateSetting('centerForce', v)}
                info="How strongly nodes are pulled to the center"
              />
              <Slider 
                label="Repel force" 
                value={settings.repelForce} 
                min={0} max={200} 
                onChange={v => updateSetting('repelForce', v)}
                info="How strongly nodes push each other apart"
              />
              <Slider 
                label="Link force" 
                value={settings.linkForce} 
                min={0} max={100} 
                onChange={v => updateSetting('linkForce', v)}
                info="How strongly connected nodes are pulled together"
              />
              <Slider 
                label="Link distance" 
                value={settings.linkDistance} 
                min={20} max={150} 
                onChange={v => updateSetting('linkDistance', v)}
                info="Target distance between connected nodes"
              />
            </Section>
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
