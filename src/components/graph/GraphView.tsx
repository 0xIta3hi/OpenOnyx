/**
 * Graph View - Interactive Knowledge Graph
 * 
 * Visualizes notes as nodes and [[links]] as edges using D3.js
 * force-directed layout. Features:
 * - Interactive zoom & pan with static layout option
 * - Click nodes to navigate to notes
 * - Node size scales with connection count (toggleable)
 * - Phantom nodes for unresolved links
 * - Obsidian-like settings panel with filters and forces
 * - Light/dark theme support with proper edge visibility
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { Network, Maximize, Minimize, Settings, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { GraphData, GraphNode, GraphEdge, Theme } from '../../types';
import { getAPI } from '../../utils/api';

const api = getAPI();

// Graph settings interface
interface GraphSettings {
  // Filters
  showTags: boolean;
  showOrphans: boolean;
  existingFilesOnly: boolean;
  searchFilter: string;
  
  // Display
  showLabels: boolean;
  labelThreshold: number; // Min connections to show label
  fixedNodeSize: boolean;
  nodeSize: number; // Fixed size when enabled
  
  // Forces
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
  
  // Behavior
  staticLayout: boolean; // Stop simulation after initial layout
}

const defaultSettings: GraphSettings = {
  showTags: false,
  showOrphans: true,
  existingFilesOnly: false,
  searchFilter: '',
  showLabels: true,
  labelThreshold: 0,
  fixedNodeSize: false,
  nodeSize: 8,
  centerForce: 0.5,
  repelForce: 0.5,
  linkForce: 0.5,
  linkDistance: 100,
  staticLayout: true,
};

interface GraphViewProps {
  onNodeClick: (noteName: string) => void;
  onClose: () => void;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
  theme?: Theme;
  vaultPath?: string | null;
  localNodePath?: string | null; // If set, shows only this node and its direct connections
}

export function GraphView({ onNodeClick, onClose, isFullScreen, onToggleFullScreen, theme = 'dark', vaultPath, localNodePath }: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
  const nodePositionsRef = useRef<Map<string, { x: number; y: number; fx?: number | null; fy?: number | null }>>(new Map());
  
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isLocalView, setIsLocalView] = useState(!!localNodePath);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<GraphSettings>(defaultSettings);
  
  // Collapsible sections state
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [forcesOpen, setForcesOpen] = useState(false);
  
  const onNodeClickRef = useRef(onNodeClick);

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  // Update setting helper
  const updateSetting = useCallback(<K extends keyof GraphSettings>(key: K, value: GraphSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  // Fetch graph data - reload when vaultPath changes
  useEffect(() => {
    const loadGraph = async () => {
      try {
        const data = await api.getGraphData();
        setGraphData(data);
      } catch (err) {
        console.error('Failed to load graph:', err);
      } finally {
        setLoading(false);
      }
    };
    loadGraph();
  }, [vaultPath]);

  // Build adjacency map for connected nodes lookup
  const adjacencyMap = useMemo(() => {
    if (!graphData) return new Map<string, Set<string>>();
    const map = new Map<string, Set<string>>();
    graphData.edges.forEach(edge => {
      const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
      const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;
      if (!map.has(sourceId)) map.set(sourceId, new Set());
      if (!map.has(targetId)) map.set(targetId, new Set());
      map.get(sourceId)!.add(targetId);
      map.get(targetId)!.add(sourceId);
    });
    return map;
  }, [graphData]);

  // Filter and compute display data
  const { displayNodes, displayEdges, displayNodeCount, displayEdgeCount } = useMemo(() => {
    if (!graphData) return { displayNodes: [], displayEdges: [], displayNodeCount: 0, displayEdgeCount: 0 };
    
    let nodes = [...graphData.nodes];
    let edges = [...graphData.edges];
    
    // Apply search filter
    if (settings.searchFilter.trim()) {
      const search = settings.searchFilter.toLowerCase();
      const matchingIds = new Set(nodes.filter(n => n.name.toLowerCase().includes(search)).map(n => n.id));
      nodes = nodes.filter(n => matchingIds.has(n.id));
      edges = edges.filter(e => {
        const sourceId = typeof e.source === 'string' ? e.source : e.source.id;
        const targetId = typeof e.target === 'string' ? e.target : e.target.id;
        return matchingIds.has(sourceId) && matchingIds.has(targetId);
      });
    }
    
    // Filter existing files only (exclude phantom nodes)
    if (settings.existingFilesOnly) {
      const existingIds = new Set(nodes.filter(n => n.path).map(n => n.id));
      nodes = nodes.filter(n => existingIds.has(n.id));
      edges = edges.filter(e => {
        const sourceId = typeof e.source === 'string' ? e.source : e.source.id;
        const targetId = typeof e.target === 'string' ? e.target : e.target.id;
        return existingIds.has(sourceId) && existingIds.has(targetId);
      });
    }
    
    // Filter orphans (nodes with no connections)
    if (!settings.showOrphans) {
      const connectedIds = new Set<string>();
      edges.forEach(e => {
        const sourceId = typeof e.source === 'string' ? e.source : e.source.id;
        const targetId = typeof e.target === 'string' ? e.target : e.target.id;
        connectedIds.add(sourceId);
        connectedIds.add(targetId);
      });
      nodes = nodes.filter(n => connectedIds.has(n.id));
    }
    
    // Local graph view - show only focal node and direct connections
    if (isLocalView && localNodePath) {
      const focalName = localNodePath.replace(/\.md$/, '').split('/').pop()!;
      const focalNodeId = nodes.find(n => 
        n.id === focalName || n.id === localNodePath || n.id === localNodePath.replace(/\.md$/, '')
      )?.id;
      
      if (focalNodeId && adjacencyMap.has(focalNodeId)) {
        const connectedIds = adjacencyMap.get(focalNodeId)!;
        const localNodeIds = new Set([focalNodeId, ...connectedIds]);
        
        nodes = nodes.filter(n => localNodeIds.has(n.id));
        edges = edges.filter(e => {
          const sourceId = typeof e.source === 'string' ? e.source : e.source.id;
          const targetId = typeof e.target === 'string' ? e.target : e.target.id;
          return localNodeIds.has(sourceId) && localNodeIds.has(targetId);
        });
      }
    }
    
    return { 
      displayNodes: nodes, 
      displayEdges: edges, 
      displayNodeCount: nodes.length, 
      displayEdgeCount: edges.length 
    };
  }, [graphData, settings, isLocalView, localNodePath, adjacencyMap]);

  // Render D3 graph
  useEffect(() => {
    if (!svgRef.current || displayNodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const container = svgRef.current.parentElement!;
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.attr('width', width).attr('height', height);

    // Theme-specific colors - improved for light theme visibility
    const isDark = theme === 'dark';
    const nodeColor = isDark ? '#6ee7b7' : '#059669'; // Teal/emerald for better visibility
    const nodeHoverColor = isDark ? '#a5f3fc' : '#0891b2';
    const phantomNodeColor = isDark ? '#6b7280' : '#9ca3af';
    const phantomHoverColor = isDark ? '#9ca3af' : '#6b7280';
    const strokeColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)';
    // Improved edge colors for both themes
    const linkColor = isDark ? 'rgba(100, 200, 200, 0.5)' : 'rgba(30, 80, 100, 0.4)';
    const textColor = isDark ? '#f5f5f5' : '#1f2937';
    const selectedColor = '#22c55e'; // Green for selected node
    const connectedColor = '#f59e0b'; // Amber for connected nodes
    const dimmedOpacity = 0.15; // Dim non-connected when a node is selected

    // Create zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    
    zoomRef.current = zoom;
    svg.call(zoom);

    // Click on background to deselect
    svg.on('click', (event) => {
      if (event.target === svgRef.current) {
        setSelectedNode(null);
      }
    });

    // Main group for zoom/pan
    const g = svg.append('g');

    // Initialize or restore node positions
    const nodeCount = displayNodes.length;
    displayNodes.forEach((node, i) => {
      const savedPos = nodePositionsRef.current.get(node.id);
      if (savedPos) {
        // Restore saved position
        node.x = savedPos.x;
        node.y = savedPos.y;
        if (savedPos.fx !== undefined) node.fx = savedPos.fx;
        if (savedPos.fy !== undefined) node.fy = savedPos.fy;
      } else if (node.x === undefined || node.y === undefined) {
        // Initialize with circular layout
        const angle = (2 * Math.PI * i) / nodeCount;
        const radius = Math.min(width, height) * 0.35;
        node.x = width / 2 + radius * Math.cos(angle);
        node.y = height / 2 + radius * Math.sin(angle);
      }
    });

    // Calculate forces based on settings
    const linkDistance = 50 + settings.linkDistance * 2;
    const chargeStrength = -100 - settings.repelForce * 300;
    const centerStrength = 0.01 + settings.centerForce * 0.08;
    const linkStrength = 0.2 + settings.linkForce * 0.6;

    // Create force simulation
    const simulation = d3.forceSimulation<GraphNode>(displayNodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(displayEdges)
        .id(d => d.id)
        .distance(linkDistance)
        .strength(linkStrength))
      .force('charge', d3.forceManyBody()
        .strength(chargeStrength)
        .distanceMax(linkDistance * 4))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(centerStrength))
      .force('collision', d3.forceCollide().radius((d: any) => {
        const r = settings.fixedNodeSize ? settings.nodeSize : Math.min(30, 4 + Math.sqrt(d.connections) * 3);
        return r + 10;
      }))
      .force('x', d3.forceX(width / 2).strength(centerStrength * 0.3))
      .force('y', d3.forceY(height / 2).strength(centerStrength * 0.3));

    simulationRef.current = simulation;

    // Pre-run simulation to stabilize layout
    simulation.alpha(1).alphaDecay(0.03);
    for (let i = 0; i < 200; i++) {
      simulation.tick();
    }

    // If static layout, stop simulation after initial positioning
    if (settings.staticLayout) {
      simulation.stop();
      // Save positions for later
      displayNodes.forEach(node => {
        if (node.x !== undefined && node.y !== undefined) {
          nodePositionsRef.current.set(node.id, { x: node.x, y: node.y, fx: node.fx, fy: node.fy });
        }
      });
    } else {
      simulation.alpha(0.3).restart();
    }

    // Calculate node radius
    const calculateRadius = (d: GraphNode) => {
      if (settings.fixedNodeSize) return settings.nodeSize;
      return Math.min(30, 4 + Math.sqrt(d.connections) * 3);
    };

    // Helper functions for selection highlighting
    const isConnected = (nodeId: string) => {
      if (!selectedNode) return false;
      if (nodeId === selectedNode) return true;
      return adjacencyMap.get(selectedNode)?.has(nodeId) || false;
    };

    const isEdgeConnected = (edge: GraphEdge) => {
      if (!selectedNode) return false;
      const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
      const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;
      return sourceId === selectedNode || targetId === selectedNode;
    };

    // Draw edges with improved visibility
    const link = g.selectAll('.graph-link')
      .data(displayEdges)
      .join('line')
      .attr('class', 'graph-link')
      .style('stroke', (d: any) => {
        if (selectedNode && isEdgeConnected(d)) return connectedColor;
        return linkColor;
      })
      .style('stroke-width', (d: any) => {
        if (selectedNode && isEdgeConnected(d)) return '2.5px';
        return '1.5px';
      })
      .style('opacity', (d: any) => {
        if (selectedNode && !isEdgeConnected(d)) return dimmedOpacity;
        return 1;
      })
      .attr('x1', (d: any) => d.source.x)
      .attr('y1', (d: any) => d.source.y)
      .attr('x2', (d: any) => d.target.x)
      .attr('y2', (d: any) => d.target.y);

    // Draw nodes
    const node = g.selectAll('.graph-node')
      .data(displayNodes)
      .join('g')
      .attr('class', (d: GraphNode) => `graph-node ${!d.path ? 'phantom' : ''}`)
      .attr('transform', (d: GraphNode) => `translate(${d.x},${d.y})`)
      .call(d3.drag<SVGGElement, GraphNode>()
        .on('start', (event, d) => {
          if (!settings.staticLayout && !event.active) {
            simulation.alphaTarget(0.3).restart();
          }
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
          // Update position immediately for static layout
          if (settings.staticLayout) {
            d.x = event.x;
            d.y = event.y;
            d3.select(event.sourceEvent.target.parentNode)
              .attr('transform', `translate(${event.x},${event.y})`);
            // Update connected edges
            link
              .filter((l: any) => l.source.id === d.id || l.target.id === d.id)
              .attr('x1', (l: any) => l.source.id === d.id ? event.x : l.source.x)
              .attr('y1', (l: any) => l.source.id === d.id ? event.y : l.source.y)
              .attr('x2', (l: any) => l.target.id === d.id ? event.x : l.target.x)
              .attr('y2', (l: any) => l.target.id === d.id ? event.y : l.target.y);
          }
        })
        .on('end', (event, d) => {
          if (settings.staticLayout) {
            // Keep the node fixed at its new position in static mode
            d.x = event.x;
            d.y = event.y;
            d.fx = event.x;
            d.fy = event.y;
            // Save position
            nodePositionsRef.current.set(d.id, { x: event.x, y: event.y, fx: event.x, fy: event.y });
          } else {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }
        }) as any);

    // Node circles
    const circles = node.append('circle')
      .attr('r', calculateRadius)
      .style('fill', (d: GraphNode) => {
        if (selectedNode) {
          if (d.id === selectedNode) return selectedColor;
          if (isConnected(d.id)) return connectedColor;
        }
        return d.path ? nodeColor : phantomNodeColor;
      })
      .style('stroke', (d: GraphNode) => {
        if (selectedNode && d.id === selectedNode) return selectedColor;
        if (selectedNode && isConnected(d.id)) return connectedColor;
        return strokeColor;
      })
      .style('stroke-width', (d: GraphNode) => {
        if (selectedNode && (d.id === selectedNode || isConnected(d.id))) return '3px';
        return '1.5px';
      })
      .style('opacity', (d: GraphNode) => {
        if (selectedNode && !isConnected(d.id)) return dimmedOpacity + 0.3;
        return 1;
      })
      .attr('stroke-dasharray', (d: GraphNode) => d.path ? 'none' : '4 2')
      .style('cursor', 'pointer')
      .on('click', (event: any, d: GraphNode) => {
        event.stopPropagation();
        setSelectedNode(prev => prev === d.id ? null : d.id);
        onNodeClickRef.current(d.name);
      })
      .on('mouseover', function(this: SVGCircleElement, _event: any, d: GraphNode) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', calculateRadius(d) + 3)
          .style('fill', () => {
            if (selectedNode && d.id === selectedNode) return selectedColor;
            if (selectedNode && isConnected(d.id)) return connectedColor;
            return d.path ? nodeHoverColor : phantomHoverColor;
          });
      })
      .on('mouseout', function(this: SVGCircleElement, _event: any, d: GraphNode) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', calculateRadius(d))
          .style('fill', () => {
            if (selectedNode) {
              if (d.id === selectedNode) return selectedColor;
              if (isConnected(d.id)) return connectedColor;
            }
            return d.path ? nodeColor : phantomNodeColor;
          });
      });

    // Node labels - conditionally show based on settings
    if (settings.showLabels) {
      node.filter((d: GraphNode) => d.connections >= settings.labelThreshold)
        .append('text')
        .text((d: GraphNode) => d.name)
        .attr('dy', (d: GraphNode) => calculateRadius(d) + 14)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px')
        .style('fill', textColor)
        .attr('font-weight', (d: GraphNode) => {
          if (selectedNode && (d.id === selectedNode || isConnected(d.id))) return '600';
          return '500';
        })
        .attr('font-family', 'Inter, -apple-system, sans-serif')
        .style('pointer-events', 'none')
        .style('opacity', (d: GraphNode) => {
          if (selectedNode && !isConnected(d.id)) return dimmedOpacity + 0.2;
          return 1;
        });
    }

    // Update positions on tick (only for non-static layout)
    if (!settings.staticLayout) {
      simulation.on('tick', () => {
        link
          .attr('x1', (d: any) => d.source.x)
          .attr('y1', (d: any) => d.source.y)
          .attr('x2', (d: any) => d.target.x)
          .attr('y2', (d: any) => d.target.y);

        node.attr('transform', (d: GraphNode) => `translate(${d.x},${d.y})`);
      });
    }

    // Initial zoom to fit
    const initialTransform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(0.85)
      .translate(-width / 2, -height / 2);
    svg.call(zoom.transform, initialTransform);

    return () => {
      simulation.stop();
    };
  }, [displayNodes, displayEdges, theme, selectedNode, settings, adjacencyMap]);

  // Zoom controls - use stored zoom behavior
  const handleZoomIn = () => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().duration(300).call(zoomRef.current.scaleBy, 1.4);
  };

  const handleZoomOut = () => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().duration(300).call(zoomRef.current.scaleBy, 0.7);
  };

  // Reset layout - clear saved positions
  const handleResetLayout = () => {
    nodePositionsRef.current.clear();
    // Force re-render
    setSettings(prev => ({ ...prev }));
  };

  // Render settings panel section
  const renderSettingsSection = (
    title: string, 
    isOpen: boolean, 
    setOpen: (open: boolean) => void, 
    children: React.ReactNode
  ) => (
    <div className="graph-settings-section">
      <button 
        className="graph-settings-section-header" 
        onClick={() => setOpen(!isOpen)}
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{title}</span>
      </button>
      {isOpen && <div className="graph-settings-section-content">{children}</div>}
    </div>
  );

  return (
    <>
      <div className="graph-header">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Network size={20} strokeWidth={1.5} style={{ opacity: 0.6 }} />
          {isLocalView ? 'Local Graph' : 'Graph View'}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {localNodePath && (
            <button 
              className={`graph-toggle-btn ${isLocalView ? 'active' : ''}`}
              onClick={() => {
                setIsLocalView(!isLocalView);
                // Clear positions when switching view mode
                nodePositionsRef.current.clear();
              }}
              title={isLocalView ? 'Show full graph' : 'Show local graph'}
            >
              {isLocalView ? '🌐 Global' : '📍 Local'}
            </button>
          )}
          <div className="graph-stats">
            <span>{displayNodeCount} nodes</span>
            <span>{displayEdgeCount} edges</span>
          </div>
          <button 
            className={`btn btn-ghost ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings(!showSettings)}
            title="Graph settings"
            style={{ padding: '6px' }}
          >
            <Settings size={16} />
          </button>
          {onToggleFullScreen && (
            <button className="btn btn-ghost" onClick={onToggleFullScreen} style={{ padding: '6px' }} title="Toggle Full Screen">
              {isFullScreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="graph-main-container">
        {/* Settings Panel */}
        {showSettings && (
          <div className="graph-settings-panel">
            {/* Filters Section */}
            {renderSettingsSection('Filters', filtersOpen, setFiltersOpen, (
              <>
                <div className="graph-settings-search">
                  <Search size={14} />
                  <input
                    type="text"
                    placeholder="Search files..."
                    value={settings.searchFilter}
                    onChange={(e) => updateSetting('searchFilter', e.target.value)}
                  />
                  {settings.searchFilter && (
                    <button onClick={() => updateSetting('searchFilter', '')}>
                      <X size={14} />
                    </button>
                  )}
                </div>
                <label className="graph-settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings.existingFilesOnly}
                    onChange={(e) => updateSetting('existingFilesOnly', e.target.checked)}
                  />
                  <span>Existing files only</span>
                </label>
                <label className="graph-settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings.showOrphans}
                    onChange={(e) => updateSetting('showOrphans', e.target.checked)}
                  />
                  <span>Show orphans</span>
                </label>
              </>
            ))}

            {/* Display Section */}
            {renderSettingsSection('Display', displayOpen, setDisplayOpen, (
              <>
                <label className="graph-settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings.showLabels}
                    onChange={(e) => updateSetting('showLabels', e.target.checked)}
                  />
                  <span>Show labels</span>
                </label>
                {settings.showLabels && (
                  <div className="graph-settings-slider">
                    <span>Label threshold</span>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={settings.labelThreshold}
                      onChange={(e) => updateSetting('labelThreshold', Number(e.target.value))}
                    />
                    <span className="value">{settings.labelThreshold}</span>
                  </div>
                )}
                <label className="graph-settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings.fixedNodeSize}
                    onChange={(e) => updateSetting('fixedNodeSize', e.target.checked)}
                  />
                  <span>Fixed node size</span>
                </label>
                {settings.fixedNodeSize && (
                  <div className="graph-settings-slider">
                    <span>Node size</span>
                    <input
                      type="range"
                      min="4"
                      max="20"
                      value={settings.nodeSize}
                      onChange={(e) => updateSetting('nodeSize', Number(e.target.value))}
                    />
                    <span className="value">{settings.nodeSize}</span>
                  </div>
                )}
              </>
            ))}

            {/* Forces Section */}
            {renderSettingsSection('Forces', forcesOpen, setForcesOpen, (
              <>
                <label className="graph-settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings.staticLayout}
                    onChange={(e) => {
                      updateSetting('staticLayout', e.target.checked);
                      if (e.target.checked) {
                        // Stop simulation when switching to static
                        simulationRef.current?.stop();
                      }
                    }}
                  />
                  <span>Static layout</span>
                </label>
                <div className="graph-settings-slider">
                  <span>Center force</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.centerForce * 100}
                    onChange={(e) => updateSetting('centerForce', Number(e.target.value) / 100)}
                  />
                </div>
                <div className="graph-settings-slider">
                  <span>Repel force</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.repelForce * 100}
                    onChange={(e) => updateSetting('repelForce', Number(e.target.value) / 100)}
                  />
                </div>
                <div className="graph-settings-slider">
                  <span>Link force</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.linkForce * 100}
                    onChange={(e) => updateSetting('linkForce', Number(e.target.value) / 100)}
                  />
                </div>
                <div className="graph-settings-slider">
                  <span>Link distance</span>
                  <input
                    type="range"
                    min="30"
                    max="200"
                    value={settings.linkDistance}
                    onChange={(e) => updateSetting('linkDistance', Number(e.target.value))}
                  />
                  <span className="value">{settings.linkDistance}</span>
                </div>
                <button className="graph-reset-btn" onClick={handleResetLayout}>
                  Reset Layout
                </button>
              </>
            ))}
          </div>
        )}

        {/* Graph Container */}
        <div className="graph-container">
          {loading ? (
            <div className="empty-state">
              <div className="loading-spinner" />
              <div className="empty-text">Loading graph...</div>
            </div>
          ) : displayNodeCount === 0 ? (
            <div className="empty-state">
              <div className="empty-icon" style={{ opacity: 0.5, marginBottom: '0.5rem' }}>
                <Network size={48} strokeWidth={1} />
              </div>
              <div className="empty-text">No notes to visualize yet</div>
            </div>
          ) : (
            <>
              <svg ref={svgRef} />
              <div className="graph-controls">
                <button onClick={handleZoomIn} title="Zoom In">+</button>
                <button onClick={handleZoomOut} title="Zoom Out">−</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
