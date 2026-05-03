/**
 * Graph Renderer using pure Canvas2D
 * No WebGL dependencies - guaranteed compatibility with Electron
 * Matches Obsidian's visual style and interactions
 */

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
  radius: number;
}

interface RenderEdge {
  source: string;
  target: string;
  directed?: boolean;
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
  directed?: boolean;
}

// Helper to convert hex number to CSS color string
function hexToRgb(hex: number): { r: number; g: number; b: number } {
  return {
    r: (hex >> 16) & 255,
    g: (hex >> 8) & 255,
    b: hex & 255,
  };
}

function hexToColor(hex: number, alpha = 1): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export class GraphRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;

  private nodes = new Map<string, RenderNode>();
  private edges: RenderEdge[] = [];
  private adjacencyMap = new Map<string, Set<string>>();

  private selectedNodeId: string | null = null;
  private hoveredNodeId: string | null = null;

  private width: number;
  private height: number;
  private dpr = 1;
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
  private pointerDownPos = { x: 0, y: 0 };
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
    color: "#7f7f7f",
    size: 11,
    show: true,
    threshold: 0.4,
  };

  private onNodeClick?: (nodeId: string) => void;
  private onNodeDrag?: (
    nodeId: string,
    x: number,
    y: number,
    active: boolean,
  ) => void;
  private onViewportChange?: (x: number, y: number, scale: number) => void;

  private wheelHandler: ((e: WheelEvent) => void) | null = null;
  private pointerDownHandler: ((e: PointerEvent) => void) | null = null;
  private pointerMoveHandler: ((e: PointerEvent) => void) | null = null;
  private pointerUpHandler: ((e: PointerEvent) => void) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    options: Partial<RendererOptions> = {},
  ) {
    this.canvas = canvas;
    this.width = options.width || 800;
    this.height = options.height || 600;
    this.isDark = options.isDark ?? true;
    this.backgroundColor =
      options.backgroundColor ?? (this.isDark ? 0x101010 : 0xf0f0f6);
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    const minDimension = 100;
    const safeWidth = Math.max(this.width, minDimension);
    const safeHeight = Math.max(this.height, minDimension);

    this.width = safeWidth;
    this.height = safeHeight;
    
    // Enforce high-quality rendering by scaling up DPR
    const baseDpr = window.devicePixelRatio || 1;
    this.dpr = Math.max(2, baseDpr * 1.5); // Ensure at least 2x, or 1.5x of native

    // Setup canvas with proper HiDPI scaling
    this.canvas.width = Math.floor(safeWidth * this.dpr);
    this.canvas.height = Math.floor(safeHeight * this.dpr);
    this.canvas.style.width = `${safeWidth}px`;
    this.canvas.style.height = `${safeHeight}px`;

    this.ctx = this.canvas.getContext("2d");
    if (!this.ctx) {
      throw new Error("Failed to get 2D context");
    }

    // Center the viewport
    this.offsetX = this.width / 2;
    this.offsetY = this.height / 2;
    this.targetOffsetX = this.offsetX;
    this.targetOffsetY = this.offsetY;

    this.setupInteraction();
    this.startAnimationLoop();

    this.initialized = true;
  }

  private setupInteraction(): void {
    this.wheelHandler = this.handleWheel.bind(this);
    this.canvas.addEventListener("wheel", this.wheelHandler, {
      passive: false,
    });

    this.pointerDownHandler = this.handlePointerDown.bind(this);
    this.pointerMoveHandler = this.handlePointerMove.bind(this);
    this.pointerUpHandler = this.handlePointerUp.bind(this);

    this.canvas.addEventListener("pointerdown", this.pointerDownHandler);
    this.canvas.addEventListener("pointermove", this.pointerMoveHandler);
    this.canvas.addEventListener("pointerup", this.pointerUpHandler);
    this.canvas.addEventListener(
      "pointerleave",
      this.handlePointerLeave.bind(this),
    );
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
        this.render();
      }
    };

    animate();
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Smooth zoom factor
    const zoomIntensity = 0.1;
    const zoomFactor = e.deltaY > 0 ? 1 - zoomIntensity : 1 + zoomIntensity;
    const newScale = Math.max(0.00001, Math.min(20, this.targetScale * zoomFactor));

    // Zoom towards mouse position
    const worldX = (mouseX - this.offsetX) / this.scale;
    const worldY = (mouseY - this.offsetY) / this.scale;

    this.targetScale = newScale;
    this.targetOffsetX = mouseX - worldX * newScale;
    this.targetOffsetY = mouseY - worldY * newScale;

    this.onViewportChange?.(
      this.targetOffsetX,
      this.targetOffsetY,
      this.targetScale,
    );
  }

  private handlePointerDown(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.lastPointerPos = { x, y };
    this.pointerDownPos = { x, y };

    const node = this.getNodeAtPosition(x, y);
    if (node) {
      this.dragNode = node;
      this.isDragging = true;
      this.onNodeDrag?.(node.id, node.x, node.y, true);
    } else {
      this.isPanning = true;
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const dx = x - this.lastPointerPos.x;
    const dy = y - this.lastPointerPos.y;
    this.lastPointerPos = { x, y };

    if (this.isDragging && this.dragNode) {
      this.dragNode.x += dx / this.scale;
      this.dragNode.y += dy / this.scale;
      this.render();
      this.onNodeDrag?.(
        this.dragNode.id,
        this.dragNode.x,
        this.dragNode.y,
        true,
      );
    } else if (this.isPanning) {
      this.targetOffsetX += dx;
      this.targetOffsetY += dy;
      this.offsetX = this.targetOffsetX;
      this.offsetY = this.targetOffsetY;
      this.render();
      this.onViewportChange?.(this.offsetX, this.offsetY, this.scale);
    } else {
      // Hover detection - dim other nodes
      const node = this.getNodeAtPosition(x, y);
      const newHoveredId = node?.id || null;
      if (newHoveredId !== this.hoveredNodeId) {
        this.hoveredNodeId = newHoveredId;
        this.render();
      }
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const movedDistance = Math.hypot(
      x - this.pointerDownPos.x,
      y - this.pointerDownPos.y,
    );
    const clickThreshold = 5;

    if (this.isDragging && this.dragNode) {
      this.onNodeDrag?.(
        this.dragNode.id,
        this.dragNode.x,
        this.dragNode.y,
        false,
      );
      if (movedDistance <= clickThreshold) {
        this.selectedNodeId = this.dragNode.id;
        this.render();
        this.onNodeClick?.(this.dragNode.id);
      }
    } else if (
      !this.isPanning ||
      (Math.abs(x - this.lastPointerPos.x) < 5 &&
        Math.abs(y - this.lastPointerPos.y) < 5)
    ) {
      const node = this.getNodeAtPosition(x, y);
      if (node) {
        this.selectedNodeId = node.id;
        this.render();
        this.onNodeClick?.(node.id);
      } else if (this.selectedNodeId) {
        this.selectedNodeId = null;
        this.render();
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
      this.render();
    }
  }

  private getNodeAtPosition(
    screenX: number,
    screenY: number,
  ): RenderNode | null {
    const worldX = (screenX - this.offsetX) / this.scale;
    const worldY = (screenY - this.offsetY) / this.scale;

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

  private render(): void {
    if (!this.ctx) return;

    const ctx = this.ctx;

    // Enable high quality rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Clear and fill background
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = hexToColor(this.backgroundColor);
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply DPR and viewport transform
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Use Math.round to prevent subpixel blurring of the viewport
    ctx.translate(Math.round(this.offsetX), Math.round(this.offsetY));
    ctx.scale(this.scale, this.scale);

    // Draw edges
    this.drawEdges(ctx);

    // Draw nodes
    this.drawNodes(ctx);

    // Draw labels (in screen space)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawLabels(ctx);
  }

  private drawEdges(ctx: CanvasRenderingContext2D): void {
    const connectedToHovered = this.hoveredNodeId
      ? this.adjacencyMap.get(this.hoveredNodeId)
      : null;

    for (const edge of this.edges) {
      const sourceNode = this.nodes.get(edge.source);
      const targetNode = this.nodes.get(edge.target);
      if (!sourceNode || !targetNode) continue;

      const isHighlighted =
        edge.source === this.selectedNodeId ||
        edge.target === this.selectedNodeId ||
        edge.source === this.hoveredNodeId ||
        edge.target === this.hoveredNodeId;

      const isDimmed = this.hoveredNodeId && !isHighlighted;

      const color = isHighlighted
        ? this.edgeStyle.highlightColor
        : this.edgeStyle.color;
      const width = isHighlighted
        ? this.edgeStyle.highlightWidth
        : this.edgeStyle.width;
      const alpha = isDimmed
        ? this.edgeStyle.dimmedAlpha
        : isHighlighted
          ? 0.8
          : this.edgeStyle.alpha;

      ctx.strokeStyle = hexToColor(color, alpha);
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(sourceNode.x, sourceNode.y);
      ctx.lineTo(targetNode.x, targetNode.y);
      ctx.stroke();

      if (edge.directed) {
        const dx = targetNode.x - sourceNode.x;
        const dy = targetNode.y - sourceNode.y;
        const length = Math.hypot(dx, dy);
        if (length > 0.001) {
          const ux = dx / length;
          const uy = dy / length;
          const targetRadius = targetNode.radius;
          const tipX = targetNode.x - ux * (targetRadius + 1.2);
          const tipY = targetNode.y - uy * (targetRadius + 1.2);
          const arrowLength = 6;
          const arrowWidth = 3.2;
          const leftX = tipX - ux * arrowLength - uy * arrowWidth;
          const leftY = tipY - uy * arrowLength + ux * arrowWidth;
          const rightX = tipX - ux * arrowLength + uy * arrowWidth;
          const rightY = tipY - uy * arrowLength - ux * arrowWidth;

          ctx.fillStyle = hexToColor(color, Math.min(1, alpha + 0.18));
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(leftX, leftY);
          ctx.lineTo(rightX, rightY);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  private drawNodes(ctx: CanvasRenderingContext2D): void {
    const connectedToSelected = this.selectedNodeId
      ? this.adjacencyMap.get(this.selectedNodeId)
      : null;
    const connectedToHovered = this.hoveredNodeId
      ? this.adjacencyMap.get(this.hoveredNodeId)
      : null;

    for (const node of this.nodes.values()) {
      const isSelected = node.id === this.selectedNodeId;
      const isHovered = node.id === this.hoveredNodeId;
      const isConnectedToHovered = connectedToHovered?.has(node.id);
      const isConnectedToSelected = connectedToSelected?.has(node.id);

      const isDimmed =
        this.hoveredNodeId && !isHovered && !isConnectedToHovered;

      let color = this.nodeStyle.color;
      if (isSelected) color = this.nodeStyle.selectedColor;
      else if (isHovered) color = this.nodeStyle.hoveredColor;
      else if (isConnectedToSelected || isConnectedToHovered)
        color = this.nodeStyle.connectedColor;

      const size = node.radius;
      const alpha = isDimmed ? this.nodeStyle.dimmedAlpha : 1;

      ctx.fillStyle = hexToColor(color, alpha);
      ctx.beginPath();
      ctx.arc(node.x, node.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawLabels(ctx: CanvasRenderingContext2D): void {
    if (!this.labelStyle.show) return;

    // Fade transition properties
    const fadeStart = this.labelStyle.threshold;
    const fadeEnd = this.labelStyle.threshold + 0.15;
    
    ctx.font = `${this.labelStyle.size}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const connectedToHovered = this.hoveredNodeId
      ? this.adjacencyMap.get(this.hoveredNodeId)
      : null;

    for (const node of this.nodes.values()) {
      const screenX = this.offsetX + node.x * this.scale;
      const screenY = this.offsetY + node.y * this.scale;

      if (
        screenX < -100 ||
        screenX > this.width + 100 ||
        screenY < -100 ||
        screenY > this.height + 100
      ) {
        continue;
      }

      // Adaptive reveal: Hubs appear earlier (at lower zoom levels) than peripheral nodes
      // fadeStart is the threshold for peripheral nodes. Hubs start appearing at fadeStart / 4.
      const hubFadeStart = fadeStart / 4;
      const isHub = node.connections > 10;
      const effectiveFadeStart = isHub ? hubFadeStart : fadeStart;
      const effectiveFadeEnd = isHub ? fadeStart : fadeEnd;

      if (this.scale < effectiveFadeStart) continue;

      let alpha = 1;
      if (this.scale < effectiveFadeEnd) {
        alpha = (this.scale - effectiveFadeStart) / (effectiveFadeEnd - effectiveFadeStart);
      }

      if (
        this.hoveredNodeId &&
        node.id !== this.hoveredNodeId &&
        !connectedToHovered?.has(node.id)
      ) {
        alpha *= 0.2;
      }

      // Parse label color
      let r = 127,
        g = 127,
        b = 127;
      if (this.labelStyle.color.startsWith("#")) {
        r = parseInt(this.labelStyle.color.slice(1, 3), 16);
        g = parseInt(this.labelStyle.color.slice(3, 5), 16);
        b = parseInt(this.labelStyle.color.slice(5, 7), 16);
      }
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;

      const size = node.radius;
      const labelY = screenY + size * this.scale + 4;

      ctx.fillText(node.name, Math.round(screenX), Math.round(labelY));
    }
  }

  setCallbacks(callbacks: {
    onNodeClick?: (nodeId: string) => void;
    onNodeDrag?: (
      nodeId: string,
      x: number,
      y: number,
      active: boolean,
    ) => void;
    onViewportChange?: (x: number, y: number, scale: number) => void;
  }): void {
    this.onNodeClick = callbacks.onNodeClick;
    this.onNodeDrag = callbacks.onNodeDrag;
    this.onViewportChange = callbacks.onViewportChange;
  }

  setData(nodes: InputNode[], edges: InputEdge[]): void {
    if (!this.initialized) return;

    this.nodes.clear();
    this.edges = [];
    this.adjacencyMap.clear();

    // Build adjacency map
    for (const edge of edges) {
      if (!this.adjacencyMap.has(edge.source))
        this.adjacencyMap.set(edge.source, new Set());
      if (!this.adjacencyMap.has(edge.target))
        this.adjacencyMap.set(edge.target, new Set());
      this.adjacencyMap.get(edge.source)!.add(edge.target);
      this.adjacencyMap.get(edge.target)!.add(edge.source);
    }

    // Create nodes
    for (const node of nodes) {
      const connections = this.adjacencyMap.get(node.id)?.size || 0;
      
      // Obsidian-parity power-law scaling: radius = base * (1 + connections^0.6 * 0.4)
      const radius = this.nodeStyle.size * (1 + Math.pow(connections, 0.6) * 0.4);

      this.nodes.set(node.id, {
        id: node.id,
        name: node.name,
        path: node.path,
        x: node.x || 0,
        y: node.y || 0,
        connections,
        radius,
      });
    }

    this.edges = edges.map((e) => ({
      source: e.source,
      target: e.target,
      directed: Boolean(e.directed),
    }));
    this.render();
  }

  updatePositionsFromArray(ids: string[], positions: Float32Array): void {
    for (let i = 0; i < ids.length; i++) {
      const node = this.nodes.get(ids[i]);
      if (node) {
        node.x = positions[i * 2];
        node.y = positions[i * 2 + 1];
      }
    }
    this.render();
  }

  setNodeStyle(style: Partial<NodeStyle>): void {
    Object.assign(this.nodeStyle, style);
    this.render();
  }

  setEdgeStyle(style: Partial<EdgeStyle>): void {
    Object.assign(this.edgeStyle, style);
    this.render();
  }

  setLabelStyle(style: Partial<LabelStyle>): void {
    Object.assign(this.labelStyle, style);
    this.render();
  }

  setBackgroundColor(color: number): void {
    this.backgroundColor = color;
    this.render();
  }

  selectNode(nodeId: string | null): void {
    this.selectedNodeId = nodeId;
    this.render();
  }

  centerView(): void {
    if (this.nodes.size === 0) return;

    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

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

    this.onViewportChange?.(
      this.targetOffsetX,
      this.targetOffsetY,
      this.targetScale,
    );
  }

  resize(width: number, height: number): void {
    const minDimension = 100;
    const safeWidth = Math.max(width, minDimension);
    const safeHeight = Math.max(height, minDimension);

    this.width = safeWidth;
    this.height = safeHeight;

    const baseDpr = window.devicePixelRatio || 1;
    this.dpr = Math.max(2, baseDpr * 1.5);

    this.canvas.width = Math.floor(safeWidth * this.dpr);
    this.canvas.height = Math.floor(safeHeight * this.dpr);
    this.canvas.style.width = `${safeWidth}px`;
    this.canvas.style.height = `${safeHeight}px`;

    this.render();
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

    if (this.wheelHandler) {
      this.canvas.removeEventListener("wheel", this.wheelHandler);
    }
    if (this.pointerDownHandler) {
      this.canvas.removeEventListener("pointerdown", this.pointerDownHandler);
    }
    if (this.pointerMoveHandler) {
      this.canvas.removeEventListener("pointermove", this.pointerMoveHandler);
    }
    if (this.pointerUpHandler) {
      this.canvas.removeEventListener("pointerup", this.pointerUpHandler);
    }

    this.nodes.clear();
    this.edges = [];
    this.adjacencyMap.clear();
    this.initialized = false;
  }
}
