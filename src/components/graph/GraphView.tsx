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

interface GraphViewProps {
  onNodeClick: (noteName: string) => void;
  onClose: () => void;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
  theme?: Theme;
}

const api = getAPI();

export function GraphView({ onNodeClick, onClose, isFullScreen, onToggleFullScreen, theme = 'dark' }: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const onNodeClickRef = useRef(onNodeClick);

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  // Fetch graph data
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
  }, []);

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
    const nodeColor = isDark ? '#ffffff' : '#1f2937';
    const nodeHoverColor = isDark ? '#e5e7eb' : '#374151';
    const phantomNodeColor = isDark ? '#4b5563' : '#9ca3af';
    const phantomHoverColor = isDark ? '#6b7280' : '#6b7280';
    const strokeColor = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';
    const linkColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)';
    const textColor = isDark ? '#f3f4f6' : '#1f2937';

    // Create zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Main group for zoom/pan
    const g = svg.append('g');

    // Create force simulation with better spacing
    const simulation = d3.forceSimulation<GraphNode>(graphData.nodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(graphData.edges)
        .id(d => d.id)
        .distance(120)
        .strength(0.2))
      .force('charge', d3.forceManyBody()
        .strength(-300)
        .distanceMax(500))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d: any) => Math.min(30, 5 + Math.sqrt(d.connections) * 4) + 20));

    // Draw edges
    const link = g.selectAll('.graph-link')
      .data(graphData.edges)
      .join('line')
      .attr('class', 'graph-link')
      .attr('stroke', linkColor)
      .attr('stroke-width', 1);

    // Draw nodes
    const node = g.selectAll('.graph-node')
      .data(graphData.nodes)
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

    node.append('circle')
      .attr('r', calculateRadius)
      .attr('fill', (d: GraphNode) => d.path ? nodeColor : phantomNodeColor)
      .attr('stroke', strokeColor)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', (d: GraphNode) => d.path ? 'none' : '4 2')
      .style('cursor', 'pointer')
      .on('click', (_event: any, d: GraphNode) => {
        onNodeClickRef.current(d.name);
      })
      .on('mouseover', function(this: SVGCircleElement, _event: any, d: GraphNode) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', calculateRadius(d) + 3)
          .attr('fill', d.path ? nodeHoverColor : phantomHoverColor);
      })
      .on('mouseout', function(this: SVGCircleElement, _event: any, d: GraphNode) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', calculateRadius(d))
          .attr('fill', d.path ? nodeColor : phantomNodeColor);
      });

    // Node labels - clean text without glow
    node.append('text')
      .text((d: GraphNode) => d.name)
      .attr('dy', (d: GraphNode) => calculateRadius(d) + 14)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('fill', textColor)
      .attr('font-weight', '500')
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
  }, [graphData, theme]);

  // Zoom controls
  const handleZoomIn = () => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().duration(300).call(
      d3.zoom<SVGSVGElement, unknown>().scaleBy as any, 1.3
    );
  };

  const handleZoomOut = () => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().duration(300).call(
      d3.zoom<SVGSVGElement, unknown>().scaleBy as any, 0.7
    );
  };

  return (
    <>
      <div className="graph-header">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Network size={20} strokeWidth={1.5} style={{ opacity: 0.6 }} />
          Graph View
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="graph-stats">
            <span>{graphData?.nodes.length || 0} nodes</span>
            <span>{graphData?.edges.length || 0} connections</span>
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
