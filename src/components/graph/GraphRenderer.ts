/**
 * Graph Renderer using PixiJS v7
 * WebGL-based rendering with Canvas2D text overlay for crisp labels
 * Matches Obsidian's visual style and interactions
 */

import * as PIXI from 'pixi.js';

export interface RendererOptions {
  width: number;
  height: number;
  backgroundColor: number;
  isDark: boolean;
}

export interface NodeStyle {
  color: number;
  size: number;
  selectedColor: number;
  hoveredColor: number;
  connectedColor: number;
  dimmedAlpha: number;
}

export interface EdgeStyle {
  color: number;
  width: number;
  highlightColor: number;
  highlightWidth: number;
  alpha: number;
  dimmedAlpha: number;
}

export interface LabelStyle {
  color: string;
  size: number;
  show: boolean;
  threshold: number;
}

interface RenderNode {
  id: string;
  name: string;
  path: string;
  x: number;
  y: number;
  connections: number;
  graphics: PIXI.Graphics;
}

interface RenderEdge {
  source: string;
  target: string;
}

interface InputNode {
  id: string;
  name: string;
  path: string;
  x?: number;
  y?: number;
  connections?: number;
}

interface InputEdge {
  source: string;
  target: string;
}

export class GraphRenderer {
  private app: PIXI.Application | null = null;
  private viewport: PIXI.Container | null = null;
  private edgesGraphics: PIXI.Graphics | null = null;
  private nodesContainer: PIXI.Container | null = null;
  
  private canvas: HTMLCanvasElement;
  private labelCanvas: HTMLCanvasElement | null = null;
  private labelCtx: CanvasRenderingContext2D | null = null;
  
  private nodes = new Map<string, RenderNode>();
  private edges: RenderEdge[] = [];
  private adjacencyMap = new Map<string, Set<string>>();
  
  private selectedNodeId: string | null = null;
  private hoveredNodeId: string | null = null;
  
  private width: number;
  private height: number;
  private scale = 1;
  private targetScale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private targetOffsetX = 0;
  private targetOffsetY = 0;
  private backgroundColor: number;
  private isDark: boolean;
  
  private initialized = false;
  private isDragging = false;
  private isPanning = false;
  private dragNode: RenderNode | null = null;
  private lastPointerPos = { x: 0, y: 0 };
  private animationFrame: number | null = null;
  
  // Obsidian-style colors
  private nodeStyle: NodeStyle = {
    color: 0x7f7f7f, // Gray (Obsidian default)
    size: 5,
    selectedColor: 0x7f7f7f,
    hoveredColor: 0x7f7f7f,
    connectedColor: 0x7f7f7f,
    dimmedAlpha: 0.15,
  };
  
  private edgeStyle: EdgeStyle = {
    color: 0x7f7f7f,
    width: 1,
    highlightColor: 0x7f7f7f,
    highlightWidth: 2,
    alpha: 0.4,
    dimmedAlpha: 0.08,
  };
  
  private labelStyle: LabelStyle = {
    color: '#7f7f7f',
    size: 11,
    show: true,
    threshold: 0.4,
  };
  
  private onNodeClick?: (nodeId: string) => void;
  private onNodeDrag?: (nodeId: string, x: number, y: number, active: boolean) => void;
  private onViewportChange?: (x: number, y: number, scale: number) => void;
  
  private renderScheduled = false;
  private wheelHandler: ((e: WheelEvent) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, options: Partial<RendererOptions> = {}) {
    this.canvas = canvas;
    this.width = options.width || 800;
    this.height = options.height || 600;
    this.isDark = options.isDark ?? true;
    // Obsidian colors: dark = #2d2d2d, light = #ffffff
    this.backgroundColor = options.backgroundColor ?? (this.isDark ? 0x2d2d2d : 0xffffff);
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    
    try {
      this.app = new PIXI.Application({
        view: this.canvas,
        width: this.width,
        height: this.height,
        backgroundColor: this.backgroundColor,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      this.viewport = new PIXI.Container();
      this.app.stage.addChild(this.viewport);
      
      this.edgesGraphics = new PIXI.Graphics();
      this.viewport.addChild(this.edgesGraphics);
      
      this.nodesContainer = new PIXI.Container();
      this.viewport.addChild(this.nodesContainer);
      
      this.viewport.x = this.width / 2;
      this.viewport.y = this.height / 2;
      this.offsetX = this.viewport.x;
      this.offsetY = this.viewport.y;
      this.targetOffsetX = this.offsetX;
      this.targetOffsetY = this.offsetY;
      
      this.createLabelCanvas();
      this.setupInteraction();
      this.startAnimationLoop();
      
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize PixiJS:', error);
      throw error;
    }
  }

  private createLabelCanvas(): void {
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.style.position = 'absolute';
    this.labelCanvas.style.top = '0';
    this.labelCanvas.style.left = '0';
    this.labelCanvas.style.pointerEvents = 'none';
    this.labelCanvas.style.width = '100%';
    this.labelCanvas.style.height = '100%';
    
    const dpr = window.devicePixelRatio || 1;
    this.labelCanvas.width = this.width * dpr;
    this.labelCanvas.height = this.height * dpr;
    
    this.labelCtx = this.labelCanvas.getContext('2d');
    if (this.labelCtx) {
      this.labelCtx.scale(dpr, dpr);
    }
    
    if (this.canvas.parentElement) {
      this.canvas.parentElement.style.position = 'relative';
      this.canvas.parentElement.appendChild(this.labelCanvas);
    }
  }

  private setupInteraction(): void {
    if (!this.app) return;
    
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.app.screen;
    
    this.wheelHandler = this.handleWheel.bind(this);
    this.canvas.addEventListener('wheel', this.wheelHandler, { passive: false });
    
    stage.on('pointerdown', this.handlePointerDown.bind(this));
    stage.on('pointermove', this.handlePointerMove.bind(this));
    stage.on('pointerup', this.handlePointerUp.bind(this));
    stage.on('pointerupoutside', this.handlePointerUp.bind(this));
    stage.on('pointerleave', this.handlePointerLeave.bind(this));
  }

  private startAnimationLoop(): void {
    const animate = () => {
      this.animationFrame = requestAnimationFrame(animate);
      
      // Smooth zoom interpolation (Obsidian-style)
      const zoomLerp = 0.15;
      const panLerp = 0.2;
      
      const scaleDiff = Math.abs(this.targetScale - this.scale);
      const offsetXDiff = Math.abs(this.targetOffsetX - this.offsetX);
      const offsetYDiff = Math.abs(this.targetOffsetY - this.offsetY);
      
      if (scaleDiff > 0.001 || offsetXDiff > 0.5 || offsetYDiff > 0.5) {
        this.scale += (this.targetScale - this.scale) * zoomLerp;
        this.offsetX += (this.targetOffsetX - this.offsetX) * panLerp;
        this.offsetY += (this.targetOffsetY - this.offsetY) * panLerp;
        
        if (this.viewport) {
          this.viewport.scale.set(this.scale);
          this.viewport.x = this.offsetX;
          this.viewport.y = this.offsetY;
        }
        
        this.renderLabels();
      }
    };
    
    animate();
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    if (!this.viewport) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Smooth zoom factor
    const zoomIntensity = 0.1;
    const zoomFactor = e.deltaY > 0 ? (1 - zoomIntensity) : (1 + zoomIntensity);
    const newScale = Math.max(0.1, Math.min(5, this.targetScale * zoomFactor));
    
    // Zoom towards mouse position
    const worldX = (mouseX - this.offsetX) / this.scale;
    const worldY = (mouseY - this.offsetY) / this.scale;
    
    this.targetScale = newScale;
    this.targetOffsetX = mouseX - worldX * newScale;
    this.targetOffsetY = mouseY - worldY * newScale;
    
    this.onViewportChange?.(this.targetOffsetX, this.targetOffsetY, this.targetScale);
  }

  private handlePointerDown(e: PIXI.FederatedPointerEvent): void {
    this.lastPointerPos = { x: e.globalX, y: e.globalY };
    
    const node = this.getNodeAtPosition(e.globalX, e.globalY);
    if (node) {
      this.dragNode = node;
      this.isDragging = true;
      this.onNodeDrag?.(node.id, node.x, node.y, true);
    } else {
      this.isPanning = true;
    }
  }

  private handlePointerMove(e: PIXI.FederatedPointerEvent): void {
    const dx = e.globalX - this.lastPointerPos.x;
    const dy = e.globalY - this.lastPointerPos.y;
    this.lastPointerPos = { x: e.globalX, y: e.globalY };

    if (this.isDragging && this.dragNode) {
      this.dragNode.x += dx / this.scale;
      this.dragNode.y += dy / this.scale;
      this.dragNode.graphics.x = this.dragNode.x;
      this.dragNode.graphics.y = this.dragNode.y;
      this.drawEdges();
      this.renderLabels();
      this.onNodeDrag?.(this.dragNode.id, this.dragNode.x, this.dragNode.y, true);
    } else if (this.isPanning && this.viewport) {
      this.targetOffsetX += dx;
      this.targetOffsetY += dy;
      this.offsetX = this.targetOffsetX;
      this.offsetY = this.targetOffsetY;
      this.viewport.x = this.offsetX;
      this.viewport.y = this.offsetY;
      this.renderLabels();
      this.onViewportChange?.(this.offsetX, this.offsetY, this.scale);
    } else {
      // Hover detection - dim other nodes
      const node = this.getNodeAtPosition(e.globalX, e.globalY);
      const newHoveredId = node?.id || null;
      if (newHoveredId !== this.hoveredNodeId) {
        this.hoveredNodeId = newHoveredId;
        this.updateNodeStyles();
        this.drawEdges();
        this.renderLabels();
      }
    }
  }

  private handlePointerUp(e: PIXI.FederatedPointerEvent): void {
    if (this.isDragging && this.dragNode) {
      this.onNodeDrag?.(this.dragNode.id, this.dragNode.x, this.dragNode.y, false);
    } else if (!this.isPanning || (Math.abs(e.globalX - this.lastPointerPos.x) < 5 && Math.abs(e.globalY - this.lastPointerPos.y) < 5)) {
      const node = this.getNodeAtPosition(e.globalX, e.globalY);
      if (node) {
        this.selectedNodeId = node.id;
        this.updateNodeStyles();
        this.drawEdges();
        this.renderLabels();
        this.onNodeClick?.(node.id);
      } else if (this.selectedNodeId) {
        this.selectedNodeId = null;
        this.updateNodeStyles();
        this.drawEdges();
        this.renderLabels();
      }
    }
    
    this.isDragging = false;
    this.isPanning = false;
    this.dragNode = null;
  }

  private handlePointerLeave(): void {
    this.isPanning = false;
    this.isDragging = false;
    this.dragNode = null;
    if (this.hoveredNodeId) {
      this.hoveredNodeId = null;
      this.updateNodeStyles();
      this.drawEdges();
      this.renderLabels();
    }
  }

  private getNodeAtPosition(globalX: number, globalY: number): RenderNode | null {
    if (!this.viewport) return null;
    
    const worldX = (globalX - this.offsetX) / this.scale;
    const worldY = (globalY - this.offsetY) / this.scale;
    
    const hitRadius = 15 / this.scale;
    let closest: RenderNode | null = null;
    let closestDist = hitRadius;
    
    for (const node of this.nodes.values()) {
      const dx = node.x - worldX;
      const dy = node.y - worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closest = node;
      }
    }
    
    return closest;
  }

  private renderLabels(): void {
    if (!this.labelCtx || !this.labelStyle.show || !this.viewport) return;
    
    const ctx = this.labelCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    
    if (this.scale < this.labelStyle.threshold) return;
    
    ctx.font = `${this.labelStyle.size}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    const connectedToHovered = this.hoveredNodeId ? this.adjacencyMap.get(this.hoveredNodeId) : null;
    
    for (const node of this.nodes.values()) {
      const screenX = this.offsetX + node.x * this.scale;
      const screenY = this.offsetY + node.y * this.scale;
      
      if (screenX < -100 || screenX > this.width + 100 ||
          screenY < -100 || screenY > this.height + 100) {
        continue;
      }
      
      // Dim labels when hovering other nodes
      let alpha = 1;
      if (this.hoveredNodeId && node.id !== this.hoveredNodeId && !connectedToHovered?.has(node.id)) {
        alpha = 0.2;
      }
      
      ctx.fillStyle = this.labelStyle.color.replace(')', `, ${alpha})`).replace('rgb', 'rgba');
      if (!this.labelStyle.color.includes('rgb')) {
        // Hex color
        const r = parseInt(this.labelStyle.color.slice(1, 3), 16);
        const g = parseInt(this.labelStyle.color.slice(3, 5), 16);
        const b = parseInt(this.labelStyle.color.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
      
      const size = this.nodeStyle.size + Math.sqrt(node.connections) * 1.5;
      const labelY = screenY + size * this.scale + 4;
      
      ctx.fillText(node.name, screenX, labelY);
    }
  }

  setCallbacks(callbacks: {
    onNodeClick?: (nodeId: string) => void;
    onNodeDrag?: (nodeId: string, x: number, y: number, active: boolean) => void;
    onViewportChange?: (x: number, y: number, scale: number) => void;
  }): void {
    this.onNodeClick = callbacks.onNodeClick;
    this.onNodeDrag = callbacks.onNodeDrag;
    this.onViewportChange = callbacks.onViewportChange;
  }

  setData(nodes: InputNode[], edges: InputEdge[]): void {
    if (!this.initialized || !this.nodesContainer) return;
    
    this.nodesContainer.removeChildren();
    this.nodes.clear();
    this.edges = [];
    this.adjacencyMap.clear();
    
    // Build adjacency map
    for (const edge of edges) {
      if (!this.adjacencyMap.has(edge.source)) this.adjacencyMap.set(edge.source, new Set());
      if (!this.adjacencyMap.has(edge.target)) this.adjacencyMap.set(edge.target, new Set());
      this.adjacencyMap.get(edge.source)!.add(edge.target);
      this.adjacencyMap.get(edge.target)!.add(edge.source);
    }
    
    // Create nodes
    for (const node of nodes) {
      const connections = this.adjacencyMap.get(node.id)?.size || 0;
      const size = this.nodeStyle.size + Math.sqrt(connections) * 1.5;
      
      const graphics = new PIXI.Graphics();
      graphics.beginFill(this.nodeStyle.color);
      graphics.drawCircle(0, 0, size);
      graphics.endFill();
      graphics.x = node.x || 0;
      graphics.y = node.y || 0;
      
      this.nodesContainer.addChild(graphics);
      
      this.nodes.set(node.id, {
        id: node.id,
        name: node.name,
        path: node.path,
        x: node.x || 0,
        y: node.y || 0,
        connections,
        graphics,
      });
    }
    
    this.edges = edges.map(e => ({ source: e.source, target: e.target }));
    this.drawEdges();
    this.renderLabels();
  }

  updatePositionsFromArray(ids: string[], positions: Float32Array): void {
    for (let i = 0; i < ids.length; i++) {
      const node = this.nodes.get(ids[i]);
      if (node) {
        node.x = positions[i * 2];
        node.y = positions[i * 2 + 1];
        node.graphics.x = node.x;
        node.graphics.y = node.y;
      }
    }
    this.drawEdges();
    this.renderLabels();
  }

  private drawEdges(): void {
    if (!this.edgesGraphics) return;
    
    this.edgesGraphics.clear();
    
    const connectedToHovered = this.hoveredNodeId ? this.adjacencyMap.get(this.hoveredNodeId) : null;
    
    for (const edge of this.edges) {
      const sourceNode = this.nodes.get(edge.source);
      const targetNode = this.nodes.get(edge.target);
      if (!sourceNode || !targetNode) continue;
      
      const isHighlighted = 
        edge.source === this.selectedNodeId || edge.target === this.selectedNodeId ||
        edge.source === this.hoveredNodeId || edge.target === this.hoveredNodeId;
      
      // Dim edges not connected to hovered node
      const isDimmed = this.hoveredNodeId && !isHighlighted;
      
      const color = isHighlighted ? this.edgeStyle.highlightColor : this.edgeStyle.color;
      const width = isHighlighted ? this.edgeStyle.highlightWidth : this.edgeStyle.width;
      const alpha = isDimmed ? this.edgeStyle.dimmedAlpha : (isHighlighted ? 0.8 : this.edgeStyle.alpha);
      
      this.edgesGraphics.lineStyle(width, color, alpha);
      this.edgesGraphics.moveTo(sourceNode.x, sourceNode.y);
      this.edgesGraphics.lineTo(targetNode.x, targetNode.y);
    }
  }

  private updateNodeStyles(): void {
    const connectedToSelected = this.selectedNodeId ? this.adjacencyMap.get(this.selectedNodeId) : null;
    const connectedToHovered = this.hoveredNodeId ? this.adjacencyMap.get(this.hoveredNodeId) : null;
    
    for (const node of this.nodes.values()) {
      const isSelected = node.id === this.selectedNodeId;
      const isHovered = node.id === this.hoveredNodeId;
      const isConnectedToHovered = connectedToHovered?.has(node.id);
      const isConnectedToSelected = connectedToSelected?.has(node.id);
      
      // Dim nodes not connected to hovered node
      const isDimmed = this.hoveredNodeId && !isHovered && !isConnectedToHovered;
      
      let color = this.nodeStyle.color;
      if (isSelected) color = this.nodeStyle.selectedColor;
      else if (isHovered) color = this.nodeStyle.hoveredColor;
      else if (isConnectedToSelected || isConnectedToHovered) color = this.nodeStyle.connectedColor;
      
      const size = this.nodeStyle.size + Math.sqrt(node.connections) * 1.5;
      const alpha = isDimmed ? this.nodeStyle.dimmedAlpha : 1;
      
      node.graphics.clear();
      node.graphics.beginFill(color, alpha);
      node.graphics.drawCircle(0, 0, size);
      node.graphics.endFill();
    }
  }

  setNodeStyle(style: Partial<NodeStyle>): void {
    Object.assign(this.nodeStyle, style);
    this.updateNodeStyles();
  }

  setEdgeStyle(style: Partial<EdgeStyle>): void {
    Object.assign(this.edgeStyle, style);
    this.drawEdges();
  }

  setLabelStyle(style: Partial<LabelStyle>): void {
    Object.assign(this.labelStyle, style);
    this.renderLabels();
  }

  setBackgroundColor(color: number): void {
    this.backgroundColor = color;
    if (this.app) {
      this.app.renderer.background.color = color;
    }
  }

  selectNode(nodeId: string | null): void {
    this.selectedNodeId = nodeId;
    this.updateNodeStyles();
    this.drawEdges();
    this.renderLabels();
  }

  centerView(): void {
    if (!this.viewport || this.nodes.size === 0) return;
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const node of this.nodes.values()) {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
    }
    
    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    const padding = 100;
    const scaleX = (this.width - padding) / Math.max(graphWidth, 1);
    const scaleY = (this.height - padding) / Math.max(graphHeight, 1);
    this.targetScale = Math.min(scaleX, scaleY, 1.5);
    
    this.targetOffsetX = this.width / 2 - centerX * this.targetScale;
    this.targetOffsetY = this.height / 2 - centerY * this.targetScale;
    
    this.onViewportChange?.(this.targetOffsetX, this.targetOffsetY, this.targetScale);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    
    if (this.app) {
      this.app.renderer.resize(width, height);
    }
    
    if (this.labelCanvas && this.labelCtx) {
      const dpr = window.devicePixelRatio || 1;
      this.labelCanvas.width = width * dpr;
      this.labelCanvas.height = height * dpr;
      this.labelCanvas.style.width = `${width}px`;
      this.labelCanvas.style.height = `${height}px`;
      this.labelCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.labelCtx.scale(dpr, dpr);
    }
    
    this.renderLabels();
  }

  getAllPositions(): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    for (const [id, node] of this.nodes) {
      positions.set(id, { x: node.x, y: node.y });
    }
    return positions;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  destroy(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    
    if (this.labelCanvas?.parentElement) {
      this.labelCanvas.parentElement.removeChild(this.labelCanvas);
    }
    
    if (this.wheelHandler) {
      this.canvas.removeEventListener('wheel', this.wheelHandler);
    }
    
    if (this.app) {
      this.app.destroy(true);
      this.app = null;
    }
    
    this.nodes.clear();
    this.edges = [];
    this.adjacencyMap.clear();
    this.initialized = false;
  }
}
