/**
 * Graph View - Interactive Knowledge Graph
 * 
 * Visualizes notes as nodes and [[links]] as edges using D3.js
 * force-directed layout. Features:
 * - Interactive zoom & pan
 * - Click nodes to navigate to notes
 * - Node size scales with connection count
 * - Phantom nodes for unresolved links
 * - Smooth force simulation
 */

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Network, Maximize, Minimize } from 'lucide-react';
import { GraphData, GraphNode, GraphEdge, Theme } from '../../types';
import { getAPI } from '../../utils/api';

const api = getAPI();

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
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [nodeSpacing, setNodeSpacing] = useState<number>(150); // Default spacing
  const [isLocalView, setIsLocalView] = useState(!!localNodePath);
  const onNodeClickRef = useRef(onNodeClick);

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

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

  // Compute filtered data for stats display
  const { displayNodeCount, displayEdgeCount } = React.useMemo(() => {
    if (!graphData) return { displayNodeCount: 0, displayEdgeCount: 0 };
    
    if (!isLocalView || !localNodePath) {
      return { displayNodeCount: graphData.nodes.length, displayEdgeCount: graphData.edges.length };
    }

    // Build adjacency map
    const adjacencyMap = new Map<string, Set<string>>();
    graphData.edges.forEach(edge => {
      const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
      const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;
      if (!adjacencyMap.has(sourceId)) adjacencyMap.set(sourceId, new Set());
      if (!adjacencyMap.has(targetId)) adjacencyMap.set(targetId, new Set());
      adjacencyMap.get(sourceId)!.add(targetId);
      adjacencyMap.get(targetId)!.add(sourceId);
    });

    const focalName = localNodePath.replace(/\.md$/, '').split('/').pop()!;
    const focalNodeId = graphData.nodes.find(n => 
      n.id === focalName || n.id === localNodePath || n.id === localNodePath.replace(/\.md$/, '')
    )?.id;

    if (focalNodeId && adjacencyMap.has(focalNodeId)) {
      const connectedIds = adjacencyMap.get(focalNodeId)!;
      const localNodeIds = new Set([focalNodeId, ...connectedIds]);
      const nodeCount = graphData.nodes.filter(n => localNodeIds.has(n.id)).length;
      const edgeCount = graphData.edges.filter(e => {
        const sourceId = typeof e.source === 'string' ? e.source : e.source.id;
        const targetId = typeof e.target === 'string' ? e.target : e.target.id;
        return localNodeIds.has(sourceId) && localNodeIds.has(targetId);
      }).length;
      return { displayNodeCount: nodeCount, displayEdgeCount: edgeCount };
    }

    return { displayNodeCount: graphData.nodes.length, displayEdgeCount: graphData.edges.length };
  }, [graphData, isLocalView, localNodePath]);

  // Render D3 graph
  useEffect(() => {
    if (!svgRef.current || !graphData || graphData.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const container = svgRef.current.parentElement!;
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.attr('width', width).attr('height', height);

    // Theme-specific colors  
    const isDark = theme === 'dark';
    const nodeColor = isDark ? '#ffffff' : '#4b5563'; // White in dark, gray in light
    const nodeHoverColor = isDark ? '#a5f3fc' : '#0891b2';
    const phantomNodeColor = isDark ? '#6b7280' : '#9ca3af';
    const phantomHoverColor = isDark ? '#9ca3af' : '#6b7280';
    const strokeColor = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)';
    const linkColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)'; // More visible links
    const textColor = isDark ? '#f5f5f5' : '#1f2937';
    const selectedColor = '#22c55e'; // Green for selected node
    const connectedColor = '#f59e0b'; // Amber/orange for connected nodes

    // Build adjacency map for finding connected nodes
    const adjacencyMap = new Map<string, Set<string>>();
    graphData.edges.forEach(edge => {
      const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
      const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;
      
      if (!adjacencyMap.has(sourceId)) adjacencyMap.set(sourceId, new Set());
      if (!adjacencyMap.has(targetId)) adjacencyMap.set(targetId, new Set());
      adjacencyMap.get(sourceId)!.add(targetId);
      adjacencyMap.get(targetId)!.add(sourceId);
    });

    // Filter for local graph view - show only the focus node and its direct connections
    let displayNodes = graphData.nodes;
    let displayEdges = graphData.edges;
    
    if (isLocalView && localNodePath) {
      // Find the focal node ID (match by path without .md extension)
      const focalName = localNodePath.replace(/\.md$/, '').split('/').pop()!;
      const focalNodeId = graphData.nodes.find(n => 
        n.id === focalName || n.id === localNodePath || n.id === localNodePath.replace(/\.md$/, '')
      )?.id;
      
      if (focalNodeId && adjacencyMap.has(focalNodeId)) {
        const connectedIds = adjacencyMap.get(focalNodeId)!;
        const localNodeIds = new Set([focalNodeId, ...connectedIds]);
        
        displayNodes = graphData.nodes.filter(n => localNodeIds.has(n.id));
        displayEdges = graphData.edges.filter(e => {
          const sourceId = typeof e.source === 'string' ? e.source : e.source.id;
          const targetId = typeof e.target === 'string' ? e.target : e.target.id;
          return localNodeIds.has(sourceId) && localNodeIds.has(targetId);
        });
      }
    }

    // Create zoom behavior and store reference
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

    // Initialize nodes with better starting positions (circular layout)
    const nodeCount = displayNodes.length;
    displayNodes.forEach((node, i) => {
      if (node.x === undefined || node.y === undefined) {
        const angle = (2 * Math.PI * i) / nodeCount;
        const radius = Math.min(width, height) * 0.35;
        node.x = width / 2 + radius * Math.cos(angle);
        node.y = height / 2 + radius * Math.sin(angle);
      }
    });

    // Create force simulation with adjustable spacing to prevent text overlap
    const chargeStrength = -nodeSpacing * 4; // Scale repulsion with spacing
    const collisionPadding = nodeSpacing * 0.27; // Scale collision buffer
    
    const simulation = d3.forceSimulation<GraphNode>(displayNodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(displayEdges)
        .id(d => d.id)
        .distance(nodeSpacing)
        .strength(0.4))
      .force('charge', d3.forceManyBody()
        .strength(chargeStrength)
        .distanceMax(nodeSpacing * 3.3))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d: any) => Math.min(30, 5 + Math.sqrt(d.connections) * 4) + collisionPadding))
      .force('x', d3.forceX(width / 2).strength(0.03))
      .force('y', d3.forceY(height / 2).strength(0.03));

    // Pre-run simulation to stabilize layout before rendering
    simulation.alpha(1).alphaDecay(0.02);
    for (let i = 0; i < 300; i++) {
      simulation.tick();
    }
    simulation.alpha(0.3).restart();

    // Draw edges with better visibility
    const link = g.selectAll('.graph-link')
      .data(displayEdges)
      .join('line')
      .attr('class', 'graph-link')
      .style('stroke', linkColor)
      .style('stroke-width', '1.5px');

    // Draw nodes
    const node = g.selectAll('.graph-node')
      .data(displayNodes)
      .join('g')
      .attr('class', (d: GraphNode) => `graph-node ${!d.path ? 'phantom' : ''}`)
      .call(d3.drag<SVGGElement, GraphNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }) as any);

    // Node circle - cap radius at 30 to prevent excessively large nodes
    const calculateRadius = (d: GraphNode) => Math.min(30, 5 + Math.sqrt(d.connections) * 4);

    // Helper to check if node is connected to selected node
    const isConnected = (nodeId: string) => {
      if (!selectedNode) return false;
      if (nodeId === selectedNode) return true;
      return adjacencyMap.get(selectedNode)?.has(nodeId) || false;
    };

    // Helper to check if edge is connected to selected node
    const isEdgeConnected = (edge: GraphEdge) => {
      if (!selectedNode) return false;
      const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
      const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;
      return sourceId === selectedNode || targetId === selectedNode;
    };

    const circles = node.append('circle')
      .attr('r', calculateRadius)
      .style('fill', (d: GraphNode) => {
        if (selectedNode) {
          if (d.id === selectedNode) return selectedColor; // Green for selected
          if (isConnected(d.id)) return connectedColor; // Amber for connected
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

    // Update link styles based on selection - highlight connected, keep others visible
    link
      .style('stroke', (d: any) => {
        if (selectedNode && isEdgeConnected(d)) return connectedColor;
        return linkColor;
      })
      .style('stroke-width', (d: any) => {
        if (selectedNode && isEdgeConnected(d)) return '2.5px';
        return '1.5px';
      });

    // Node labels
    node.append('text')
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
      .style('pointer-events', 'none');

    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: GraphNode) => `translate(${d.x},${d.y})`);
    });

    // Initial zoom to fit
    const initialTransform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(0.8)
      .translate(-width / 2, -height / 2);
    svg.call(zoom.transform, initialTransform);

    return () => {
      simulation.stop();
    };
  }, [graphData, theme, selectedNode, nodeSpacing, isLocalView, localNodePath]);

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

  return (
    <>
      <div className="graph-header">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Network size={20} strokeWidth={1.5} style={{ opacity: 0.6 }} />
          {isLocalView ? 'Local Graph' : 'Graph View'}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {localNodePath && (
            <button 
              className={`btn btn-ghost ${isLocalView ? 'active' : ''}`}
              onClick={() => setIsLocalView(!isLocalView)}
              style={{ fontSize: '13px', padding: '4px 10px' }}
              title={isLocalView ? 'Show full graph' : 'Show local graph (current note connections only)'}
            >
              {isLocalView ? '🌐 Global' : '📍 Local'}
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label htmlFor="spacing-slider" style={{ fontSize: '13px', opacity: 0.7, whiteSpace: 'nowrap' }}>
              Spacing:
            </label>
            <input
              id="spacing-slider"
              type="range"
              min="50"
              max="300"
              value={nodeSpacing}
              onChange={(e) => setNodeSpacing(Number(e.target.value))}
              style={{ width: '100px', cursor: 'pointer' }}
              title={`Node spacing: ${nodeSpacing}`}
            />
            <span style={{ fontSize: '13px', opacity: 0.6, width: '35px' }}>{nodeSpacing}</span>
          </div>
          <div className="graph-stats">
            <span>{displayNodeCount} nodes</span>
            <span>{displayEdgeCount} connections</span>
          </div>
          {onToggleFullScreen && (
            <button className="btn btn-ghost" onClick={onToggleFullScreen} style={{ display: 'inline-flex', padding: '6px' }} title="Toggle Full Screen">
              {isFullScreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>✕ Close</button>
        </div>
      </div>

      <div className="graph-container">
        {loading ? (
          <div className="empty-state">
            <div className="loading-spinner" />
            <div className="empty-text">Loading graph...</div>
          </div>
        ) : graphData && graphData.nodes.length === 0 ? (
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
    </>
  );
}
