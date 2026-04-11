/**
 * CanvasView — A premium infinite canvas workspace
 *
 * Architecture mirrors Obsidian's approach:
 *  • DOM nodes (not <canvas>) for cards, absolutely positioned inside a CSS-transform wrapper.
 *  • SVG overlay for edges with separate display + interaction paths.
 *  • --zoom-multiplier CSS var so controls scale inversely with zoom.
 *  • Vertical control strip on the right; card-menu above selected node.
 *  • Dot-pattern background via SVG inside the wrapper.
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Plus, Minus, Maximize, Grid3X3, ArrowUpRight,
  RotateCcw, RotateCw, Type, FileText, Globe,
  SquareDashed, Trash2, Palette, Copy, X, Layout,
  MousePointer, Hand, Spline, ZoomIn,
} from 'lucide-react';
import {
  CanvasNode, CanvasEdge, CanvasData, CanvasViewport,
  CanvasToolMode, EdgeSide, DragState,
  CanvasTextNode, CanvasFileNode, CanvasLinkNode, CanvasGroupNode,
  DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT,
  DEFAULT_GROUP_WIDTH, DEFAULT_GROUP_HEIGHT,
  MIN_NODE_WIDTH, MIN_NODE_HEIGHT, GRID_SIZE,
  CANVAS_PRESET_COLORS, resolveCanvasColor,
} from '../../types/canvas';
import { generateId } from '../../utils/helpers';
import { getAPI } from '../../utils/api';
import { MarkdownPreview } from '../editor/MarkdownPreview';

/* ─────── Constants ─────── */
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 5;
const ZOOM_SENSITIVITY = 0.002;
const HISTORY_LIMIT = 60;

interface Props {
  onClose: () => void;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
  theme: string;
  vaultPath: string;
  fileTree: any[];
  canvasFilePath: string | null;
  onOpenFile?: (p: string) => void;
}

/* ─────── History entry ─────── */
interface Snap { nodes: CanvasNode[]; edges: CanvasEdge[] }
const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

/* ─────── Edge helpers ─────── */
function bestSides(a: CanvasNode, b: CanvasNode): [EdgeSide, EdgeSide] {
  const dx = (b.x + b.width / 2) - (a.x + a.width / 2);
  const dy = (b.y + b.height / 2) - (a.y + a.height / 2);
  if (Math.abs(dx) > Math.abs(dy))
    return dx > 0 ? ['right', 'left'] : ['left', 'right'];
  return dy > 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

function portXY(n: CanvasNode, s: EdgeSide) {
  switch (s) {
    case 'top': return { x: n.x + n.width / 2, y: n.y };
    case 'bottom': return { x: n.x + n.width / 2, y: n.y + n.height };
    case 'left': return { x: n.x, y: n.y + n.height / 2 };
    case 'right': return { x: n.x + n.width, y: n.y + n.height / 2 };
  }
}

function cpOffset(s: EdgeSide, dist: number) {
  switch (s) { case 'top': return { dx: 0, dy: -dist }; case 'bottom': return { dx: 0, dy: dist }; case 'left': return { dx: -dist, dy: 0 }; case 'right': return { dx: dist, dy: 0 }; }
}

function colorWithAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  if (color.startsWith('#')) {
    let h = color.slice(1);
    if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
    if (h.length === 6) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
  }
  const rgb = color.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(',').map(s => s.trim());
    if (parts.length >= 3) {
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})`;
    }
  }
  return color;
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
export function CanvasView({ onClose, isFullScreen, onToggleFullScreen, theme, vaultPath, fileTree, canvasFilePath, onOpenFile }: Props) {

  /* ── state ── */
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [vp, setVp] = useState<CanvasViewport>({ x: 0, y: 0, zoom: 1 });
  const [tool, setTool] = useState<CanvasToolMode>('select');
  const [selNodes, setSelNodes] = useState<Set<string>>(new Set());
  const [selEdges, setSelEdges] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<DragState>({ type: 'none', startX: 0, startY: 0 });
  const [tempEdge, setTempEdge] = useState<{ fx: number; fy: number; tx: number; ty: number } | null>(null);
  const [selBox, setSelBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [grid, setGrid] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [fileModal, setFileModal] = useState(false);
  const [linkModal, setLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [alignLines, setAlignLines] = useState<{ x: number[], y: number[] }>({ x: [], y: [] });

  /* refs */
  const wrapRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const nodesRef = useRef(nodes);      // always-latest snapshot for move handler
  const loadingCanvasRef = useRef(false);
  nodesRef.current = nodes;

  /* ── history ── */
  const [hist, setHist] = useState<Snap[]>([{ nodes: [], edges: [] }]);
  const [histIdx, setHistIdx] = useState(0);

  const push = useCallback((n: CanvasNode[], e: CanvasEdge[]) => {
    setHist(prev => [...prev.slice(0, histIdx + 1), { nodes: clone(n), edges: clone(e) }].slice(-HISTORY_LIMIT));
    setHistIdx(i => Math.min(i + 1, HISTORY_LIMIT - 1));
  }, [histIdx]);

  const undo = useCallback(() => {
    if (histIdx <= 0) return;
    const s = hist[histIdx - 1];
    setNodes(clone(s.nodes)); setEdges(clone(s.edges)); setHistIdx(histIdx - 1);
  }, [hist, histIdx]);

  const redo = useCallback(() => {
    if (histIdx >= hist.length - 1) return;
    const s = hist[histIdx + 1];
    setNodes(clone(s.nodes)); setEdges(clone(s.edges)); setHistIdx(histIdx + 1);
  }, [hist, histIdx]);

  /* ── canvas file load/save ── */
  useEffect(() => {
    let cancelled = false;

    const loadCanvas = async () => {
      if (!canvasFilePath) {
        setNodes([]);
        setEdges([]);
        setSelNodes(new Set());
        setSelEdges(new Set());
        setHist([{ nodes: [], edges: [] }]);
        setHistIdx(0);
        return;
      }

      loadingCanvasRef.current = true;
      try {
        const raw = await getAPI().readFile(canvasFilePath);
        let parsed: CanvasData = {};

        try {
          parsed = raw?.trim() ? JSON.parse(raw) : {};
        } catch {
          parsed = {};
        }

        const nextNodes = Array.isArray(parsed.nodes) ? (parsed.nodes as CanvasNode[]) : [];
        const nextEdges = Array.isArray(parsed.edges) ? (parsed.edges as CanvasEdge[]) : [];

        if (cancelled) return;
        setNodes(nextNodes);
        setEdges(nextEdges);
        setSelNodes(new Set());
        setSelEdges(new Set());
        setHist([{ nodes: clone(nextNodes), edges: clone(nextEdges) }]);
        setHistIdx(0);
      } catch (error) {
        console.error('Failed to load canvas file:', canvasFilePath, error);
        if (cancelled) return;
        setNodes([]);
        setEdges([]);
        setSelNodes(new Set());
        setSelEdges(new Set());
        setHist([{ nodes: [], edges: [] }]);
        setHistIdx(0);
      } finally {
        if (!cancelled) loadingCanvasRef.current = false;
      }
    };

    void loadCanvas();
    return () => { cancelled = true; };
  }, [canvasFilePath]);

  useEffect(() => {
    if (!canvasFilePath || loadingCanvasRef.current) return;

    const timer = setTimeout(() => {
      const payload = JSON.stringify({ nodes, edges }, null, 2);
      getAPI().writeFile(canvasFilePath, payload).catch((error) => {
        console.error('Failed to save canvas file:', canvasFilePath, error);
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [canvasFilePath, nodes, edges]);

  /* ── coordinate helpers ── */
  const s2c = useCallback((sx: number, sy: number) => {
    const r = areaRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: (sx - r.left - vp.x) / vp.zoom, y: (sy - r.top - vp.y) / vp.zoom };
  }, [vp]);

  const snap = useCallback((v: number) => grid ? Math.round(v / GRID_SIZE) * GRID_SIZE : v, [grid]);

  /* ── center of viewport in canvas coords ── */
  const viewCenter = useCallback(() => {
    const r = areaRef.current?.getBoundingClientRect();
    const w = r?.width || 800, h = r?.height || 600;
    return { x: (-vp.x + w / 2) / vp.zoom, y: (-vp.y + h / 2) / vp.zoom };
  }, [vp]);

  /* ═══ NODE OPS ═══ */
  const addNode = useCallback((type: CanvasNode['type'], extra?: Record<string, any>) => {
    const c = viewCenter();
    const w = type === 'group' ? DEFAULT_GROUP_WIDTH : DEFAULT_NODE_WIDTH;
    const h = type === 'group' ? DEFAULT_GROUP_HEIGHT : (type === 'file' ? 80 : type === 'link' ? 100 : DEFAULT_NODE_HEIGHT);
    const base = { id: generateId(), x: snap(c.x - w / 2), y: snap(c.y - h / 2), width: w, height: h };
    let n: CanvasNode;
    switch (type) {
      case 'text': n = { ...base, type: 'text', text: '', ...extra } as CanvasTextNode; break;
      case 'file': n = { ...base, type: 'file', file: '', ...extra } as CanvasFileNode; break;
      case 'link': n = { ...base, type: 'link', url: '', ...extra } as CanvasLinkNode; break;
      case 'group': n = { ...base, type: 'group', label: 'Group', ...extra } as CanvasGroupNode; break;
      default: return;
    }
    // groups at back, rest at front
    const sorted = type === 'group' ? [n, ...nodes] : [...nodes, n];
    setNodes(sorted); setSelNodes(new Set([n.id])); setSelEdges(new Set()); push(sorted, edges);
    return n;
  }, [nodes, edges, viewCenter, snap, push]);

  const updateNode = useCallback((id: string, u: Record<string, any>) => {
    setNodes(prev => {
      const next = prev.map(n => n.id === id ? clone({ ...n, ...u }) as CanvasNode : n);
      push(next, edges);
      return next;
    });
  }, [edges, push]);

  const deleteSelected = useCallback(() => {
    const nn = nodes.filter(n => !selNodes.has(n.id));
    const ee = edges.filter(e => !selEdges.has(e.id) && !selNodes.has(e.fromNode) && !selNodes.has(e.toNode));
    setNodes(nn); setEdges(ee); setSelNodes(new Set()); setSelEdges(new Set()); push(nn, ee);
  }, [nodes, edges, selNodes, selEdges, push]);

  const duplicateNode = useCallback((id: string) => {
    const n = nodes.find(x => x.id === id);
    if (!n) return;
    const dup = clone({ ...n, id: generateId(), x: n.x + 30, y: n.y + 30 }) as CanvasNode;
    const nn = [...nodes, dup];
    setNodes(nn); setSelNodes(new Set([dup.id])); push(nn, edges);
  }, [nodes, edges, push]);

  /* ═══ MOUSE: DOWN ═══ */
  const onAreaDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && (tool === 'pan' || e.shiftKey))) {
      setDrag({ type: 'pan', startX: e.clientX - vp.x, startY: e.clientY - vp.y });
      e.preventDefault(); return;
    }
    if (e.button === 0 && tool === 'select') {
      const p = s2c(e.clientX, e.clientY);
      setDrag({ type: 'select', startX: p.x, startY: p.y });
      setSelNodes(new Set()); setSelEdges(new Set()); setColorPickerFor(null);
    }
  }, [tool, vp, s2c]);

  const onNodeDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const target = e.target as HTMLElement | null;
    const inNoDragArea = !!target?.closest('[data-cv-no-drag="true"]');
    const isInteractiveTarget = !!target?.closest(
      'a,button,input,textarea,select,label,[role="button"],.task-list-item-checkbox,.external-link,.internal-link,.wiki-link,.tag'
    );
    if (inNoDragArea && isInteractiveTarget) {
      const multi = e.ctrlKey || e.metaKey;
      if (multi) {
        setSelNodes(prev => {
          const s = new Set(prev);
          s.has(id) ? s.delete(id) : s.add(id);
          return s;
        });
      } else if (!selNodes.has(id)) {
        setSelNodes(new Set([id]));
        setSelEdges(new Set());
      }
      setColorPickerFor(null);
      return;
    }
    if (editingId === id) return;       // already editing
    if (tool === 'edge') {
      const n = nodes.find(x => x.id === id)!;
      const p = s2c(e.clientX, e.clientY);
      const cx = n.x + n.width / 2, cy = n.y + n.height / 2, dx = p.x - cx, dy = p.y - cy;
      const side: EdgeSide = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top');
      setDrag({ type: 'edge', startX: e.clientX, startY: e.clientY, edgeFromNode: id, edgeFromSide: side });
      return;
    }
    const multi = e.ctrlKey || e.metaKey;
    if (multi) { setSelNodes(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; }); }
    else if (!selNodes.has(id)) { setSelNodes(new Set([id])); setSelEdges(new Set()); }
    setColorPickerFor(null);
    const n = nodes.find(x => x.id === id)!;
    const p = s2c(e.clientX, e.clientY);

    const movingIds = new Set<string>();
    const getMoving = (nodeId: string) => {
      if (movingIds.has(nodeId)) return;
      movingIds.add(nodeId);
      const node = nodes.find(x => x.id === nodeId);
      if (node && node.type === 'group') {
        nodes.forEach(child => {
          if (child.id === node.id) return;
          if (child.x >= node.x && child.y >= node.y && 
              child.x + child.width <= node.x + node.width && 
              child.y + child.height <= node.y + node.height) {
            getMoving(child.id);
          }
        });
      }
    };
    getMoving(id);
    selNodes.forEach(sid => getMoving(sid));

    const originById: Record<string, { x: number; y: number }> = {};
    nodes.forEach(node => {
      if (movingIds.has(node.id)) {
        originById[node.id] = { x: node.x, y: node.y };
      }
    });

    setDrag({
      type: 'node',
      nodeId: id,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: p.x - n.x,
      offsetY: p.y - n.y,
      movingIds,
      originById,
    });
  }, [editingId, tool, nodes, selNodes, s2c]);

  const onPortDown = useCallback((e: React.MouseEvent, id: string, side: EdgeSide) => {
    e.stopPropagation();
    setDrag({ type: 'edge', startX: e.clientX, startY: e.clientY, edgeFromNode: id, edgeFromSide: side });
  }, []);

  const onResizeDown = useCallback((e: React.MouseEvent, id: string, handle: string) => {
    e.stopPropagation();
    const n = nodes.find(x => x.id === id);
    if (!n) return;
    setDrag({
      type: 'resize',
      nodeId: id,
      startX: e.clientX,
      startY: e.clientY,
      resizeHandle: handle,
      resizeOrigin: { x: n.x, y: n.y, width: n.width, height: n.height },
    });
  }, [nodes]);

  /* ═══ MOUSE: MOVE ═══ */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (drag.type === 'none') return;
      switch (drag.type) {
        case 'pan':
          setVp(p => ({ ...p, x: e.clientX - drag.startX, y: e.clientY - drag.startY }));
          break;
        case 'node': {
          const dx = (e.clientX - drag.startX) / vp.zoom;
          const dy = (e.clientY - drag.startY) / vp.zoom;
          const snap0 = nodesRef.current;
          const originById = drag.originById || {};
          let ax: number[] = [];
          let ay: number[] = [];
          
          let bestDx = dx;
          let bestDy = dy;

          if (drag.nodeId) {
            const origMain = originById[drag.nodeId] || snap0.find(o => o.id === drag.nodeId);
            if (!origMain) break;
            const dragStep = grid ? Math.max(4, Math.round(GRID_SIZE / 2)) : 1;
            const nx = grid ? Math.round((origMain.x + dx) / dragStep) * dragStep : origMain.x + dx;
            const ny = grid ? Math.round((origMain.y + dy) / dragStep) * dragStep : origMain.y + dy;
            
            bestDx = nx - origMain.x;
            bestDy = ny - origMain.y;

            if (!e.shiftKey) { 
              const THRESHOLD = 8 / vp.zoom;
              let minXDist = THRESHOLD;
              let minYDist = THRESHOLD;

              snap0.forEach(other => {
                if (drag.movingIds?.has(other.id)) return;
                
                const checkAlign = (targetArr: number[], mainArr: number[], isX: boolean) => {
                  targetArr.forEach(t => mainArr.forEach((m, i) => {
                    const dist = Math.abs(t - m);
                    if (isX && dist < minXDist) {
                      minXDist = dist;
                      bestDx = (t - (i === 1 ? (draggedNode?.width || 0) / 2 : i === 2 ? (draggedNode?.width || 0) : 0)) - origMain.x;
                      ax = [t];
                    }
                    else if (!isX && dist < minYDist) {
                      minYDist = dist;
                      bestDy = (t - (i === 1 ? (draggedNode?.height || 0) / 2 : i === 2 ? (draggedNode?.height || 0) : 0)) - origMain.y;
                      ay = [t];
                    }
                    else if (isX && dist === minXDist && dist < THRESHOLD && !ax.includes(t)) ax.push(t);
                    else if (!isX && dist === minYDist && dist < THRESHOLD && !ay.includes(t)) ay.push(t);
                  }));
                };

                const draggedNode = snap0.find(n => n.id === drag.nodeId);
                const dw = draggedNode?.width || 0;
                const dh = draggedNode?.height || 0;
                checkAlign([other.x, other.x + other.width / 2, other.x + other.width], [nx, nx + dw / 2, nx + dw], true);
                checkAlign([other.y, other.y + other.height / 2, other.y + other.height], [ny, ny + dh / 2, ny + dh], false);
              });
            }
          }
          setAlignLines({ x: ax, y: ay });

          setNodes(prev => prev.map(n => {
            if (!drag.movingIds?.has(n.id)) return n;
            const orig = originById[n.id] || { x: n.x, y: n.y };
            return { ...n, x: orig.x + bestDx, y: orig.y + bestDy };
          }));
          break;
        }
        case 'edge': {
          const from = nodesRef.current.find(n => n.id === drag.edgeFromNode);
          if (!from) break;
          const side = drag.edgeFromSide || 'right';
          const fp = portXY(from, side);
          const cp = s2c(e.clientX, e.clientY);
          setTempEdge({ fx: fp.x, fy: fp.y, tx: cp.x, ty: cp.y });
          break;
        }
        case 'select': {
          const cp = s2c(e.clientX, e.clientY);
          const x = Math.min(drag.startX, cp.x), y = Math.min(drag.startY, cp.y);
          const w = Math.abs(cp.x - drag.startX), h = Math.abs(cp.y - drag.startY);
          setSelBox({ x, y, w, h });
          const sel = new Set<string>();
          nodesRef.current.forEach(n => {
            if (n.x + n.width > x && n.x < x + w && n.y + n.height > y && n.y < y + h) sel.add(n.id);
          });
          setSelNodes(sel);
          break;
        }
        case 'resize': {
          const n = nodesRef.current.find(x => x.id === drag.nodeId);
          if (!n) break;
          const base = drag.resizeOrigin || { x: n.x, y: n.y, width: n.width, height: n.height };
          const dx = (e.clientX - drag.startX) / vp.zoom;
          const dy = (e.clientY - drag.startY) / vp.zoom;
          const h = drag.resizeHandle || 'se';
          let nx = base.x, ny = base.y, nw = base.width, nh = base.height;

          if (h.includes('e')) {
            nw = Math.max(MIN_NODE_WIDTH, base.width + dx);
          }
          if (h.includes('w')) {
            nw = Math.max(MIN_NODE_WIDTH, base.width - dx);
            nx = base.x + (base.width - nw);
          }
          if (h.includes('s')) {
            nh = Math.max(MIN_NODE_HEIGHT, base.height + dy);
          }
          if (h.includes('n')) {
            nh = Math.max(MIN_NODE_HEIGHT, base.height - dy);
            ny = base.y + (base.height - nh);
          }

          setNodes(prev => prev.map(nd => nd.id === drag.nodeId ? { ...nd, x: nx, y: ny, width: nw, height: nh } : nd));
          break;
        }
      }
    };
    const onUp = (e: MouseEvent) => {
      if (drag.type === 'edge') {
        const cp = s2c(e.clientX, e.clientY);
        for (const n of [...nodesRef.current].reverse()) {
          if (n.id === drag.edgeFromNode) continue;
          if (cp.x >= n.x && cp.x <= n.x + n.width && cp.y >= n.y && cp.y <= n.y + n.height) {
            const cx = n.x + n.width / 2, cy = n.y + n.height / 2;
            const dx = cp.x - cx, dy = cp.y - cy;
            const toSide: EdgeSide = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top');
            const dup = edges.some(ed => (ed.fromNode === drag.edgeFromNode && ed.toNode === n.id) || (ed.fromNode === n.id && ed.toNode === drag.edgeFromNode));
            if (!dup && drag.edgeFromNode) {
              const ne: CanvasEdge = { id: generateId(), fromNode: drag.edgeFromNode, fromSide: drag.edgeFromSide, toNode: n.id, toSide: toSide, toEnd: 'arrow' };
              const newEdges = [...edges, ne]; setEdges(newEdges); push(nodesRef.current, newEdges);
            }
            break;
          }
        }
        setTempEdge(null);
      }
      if (drag.type === 'node' || drag.type === 'resize') push(nodesRef.current, edges);
      setDrag({ type: 'none', startX: 0, startY: 0 });
      setAlignLines({ x: [], y: [] });
      setSelBox(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [drag, vp, selNodes, edges, s2c, snap, push]);

  /* ═══ WHEEL / ZOOM ═══ */
  useEffect(() => {
    const el = areaRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      const scrollHost = target?.closest('.cv-node-body') as HTMLElement | null;
      const canScrollNodeBody = !!scrollHost && (
        scrollHost.scrollHeight > scrollHost.clientHeight ||
        scrollHost.scrollWidth > scrollHost.clientWidth
      );

      if (!e.ctrlKey && !e.metaKey && canScrollNodeBody) {
        return;
      }

      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const d = -e.deltaY * ZOOM_SENSITIVITY;
        const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vp.zoom * (1 + d)));
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        const ratio = nz / vp.zoom;
        setVp({ x: mx - (mx - vp.x) * ratio, y: my - (my - vp.y) * ratio, zoom: nz });
      } else {
        setVp(p => ({ ...p, x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [vp]);

  const zoomBy = useCallback((d: number) => {
    const r = areaRef.current?.getBoundingClientRect();
    if (!r) return;
    const cx = r.width / 2, cy = r.height / 2;
    const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vp.zoom + d));
    const ratio = nz / vp.zoom;
    setVp({ x: cx - (cx - vp.x) * ratio, y: cy - (cy - vp.y) * ratio, zoom: nz });
  }, [vp]);

  const zoomFit = useCallback(() => {
    if (!nodes.length) { setVp({ x: 0, y: 0, zoom: 1 }); return; }
    const r = areaRef.current?.getBoundingClientRect(); if (!r) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    nodes.forEach(n => { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + n.width); y1 = Math.max(y1, n.y + n.height); });
    const pad = 80, cw = x1 - x0 + pad * 2, ch = y1 - y0 + pad * 2;
    const z = Math.min(1, r.width / cw, r.height / ch);
    setVp({ x: (r.width - cw * z) / 2 - (x0 - pad) * z, y: (r.height - ch * z) / 2 - (y0 - pad) * z, zoom: z });
  }, [nodes]);

  /* ═══ KEYBOARD ═══ */
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return;
      const ctrl = e.ctrlKey || e.metaKey;
      if ((e.key === 'Delete' || e.key === 'Backspace') && (selNodes.size || selEdges.size)) { deleteSelected(); return; }
      if (ctrl && e.key === 'a') { e.preventDefault(); setSelNodes(new Set(nodes.map(n => n.id))); }
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); redo(); }
      else if (ctrl && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.key === 'v' && !ctrl) setTool('select');
      if (e.key === 'h' && !ctrl) setTool('pan');
      if (e.key === 'c' && !ctrl) setTool('edge');
      if (e.key === 'Escape') { setSelNodes(new Set()); setSelEdges(new Set()); setTool('select'); setEditingId(null); setColorPickerFor(null); }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [selNodes, selEdges, nodes, deleteSelected, undo, redo]);

  /* ═══ EDITING ═══ */
  const startEdit = useCallback((id: string) => {
    const n = nodes.find(x => x.id === id); if (!n) return;
    if (n.type === 'text') { setEditText((n as CanvasTextNode).text); setEditingId(id); }
    if (n.type === 'group') { setEditText((n as CanvasGroupNode).label || ''); setEditingId(id); }
    if (n.type === 'link') window.open((n as CanvasLinkNode).url, '_blank');
    if (n.type === 'file' && onOpenFile) onOpenFile((n as CanvasFileNode).file);
  }, [nodes, onOpenFile]);

  const commitEdit = useCallback(() => {
    if (!editingId) return;
    const n = nodes.find(x => x.id === editingId);
    if (n?.type === 'text') updateNode(editingId, { text: editText });
    if (n?.type === 'group') updateNode(editingId, { label: editText });
    setEditingId(null);
  }, [editingId, editText, nodes, updateNode]);

  useEffect(() => { if (editingId && editRef.current) { editRef.current.focus(); editRef.current.select(); } }, [editingId]);

  /* ── flat file list for selector ── */
  const flatFiles = useMemo(() => {
    const go = (es: any[]): { name: string; path: string }[] => {
      const r: { name: string; path: string }[] = [];
      for (const e of es) { if (!e.isDirectory && e.extension === '.md') r.push({ name: e.name, path: e.path }); if (e.children) r.push(...go(e.children)); }
      return r;
    };
    return go(fileTree);
  }, [fileTree]);

  /* ═══ CURSOR ═══ */
  const cursor = drag.type === 'pan' ? 'grabbing' : drag.type === 'node' ? 'grabbing' : tool === 'pan' ? 'grab' : tool === 'edge' ? 'crosshair' : 'default';
  const uiZoomMult = Math.min(1.35, Math.max(0.85, 1 / vp.zoom));

  /* ── first selected node (for card-menu position) ── */
  const firstSel = selNodes.size === 1 ? nodes.find(n => selNodes.has(n.id)) : null;

  /* ═══ RENDER ═══ */
  return (
    <div className="cv" ref={wrapRef} data-dragging={drag.type !== 'none'} style={{ cursor, '--zoom-mult': uiZoomMult } as any}>

      {/* ── Canvas area ── */}
      <div ref={areaRef} className="cv-area" onMouseDown={onAreaDown} onContextMenu={e => e.preventDefault()}>

        {/* Dot-pattern background (SVG stays in viewport space) */}
        {grid && <DotGrid zoom={vp.zoom} offX={vp.x} offY={vp.y} />}

        {/* Transform group */}
        <div className="cv-transform" style={{ transform: `translate(${vp.x}px,${vp.y}px) scale(${vp.zoom})` }}>

          {/* SVG edges */}
          <svg className="cv-edges">
            {edges.map(ed => <EdgePath key={ed.id} edge={ed} nodes={nodes} selected={selEdges.has(ed.id)}
              onClick={(ev) => { ev.stopPropagation(); setSelNodes(new Set()); setSelEdges(new Set([ed.id])); }} />)}
            {tempEdge && <TempEdgePath from={tempEdge} />}
            {drag.type === 'node' && alignLines.x.map((x, i) => (
              <line key={`ax-${i}`} x1={x} y1={-100000} x2={x} y2={100000} stroke="var(--accent-color)" strokeWidth={1/vp.zoom} strokeDasharray="4 4" opacity={0.6} />
            ))}
            {drag.type === 'node' && alignLines.y.map((y, i) => (
              <line key={`ay-${i}`} x1={-100000} y1={y} x2={100000} y2={y} stroke="var(--accent-color)" strokeWidth={1/vp.zoom} strokeDasharray="4 4" opacity={0.6} />
            ))}
          </svg>

          {/* Selection rect */}
          {selBox && <div className="cv-sel-box" style={{ left: selBox.x, top: selBox.y, width: selBox.w, height: selBox.h }} />}

          {/* Nodes */}
          {nodes.map(n => (
            <NodeCard key={n.id} node={n} selected={selNodes.has(n.id)}
              editing={editingId === n.id} editText={editText}
              zoomMult={uiZoomMult}
              vaultPath={vaultPath}
              onMouseDown={e => onNodeDown(e, n.id)}
              onDoubleClick={() => startEdit(n.id)}
              onPortDown={(side, e) => onPortDown(e, n.id, side)}
              onResizeDown={(handle, e) => onResizeDown(e, n.id, handle)}
              onEditChange={setEditText} onEditBlur={commitEdit}
              onEditKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { setEditingId(null); } if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') commitEdit(); }} />
          ))}
        </div>
      </div>

      {/* ══ Card-menu (above selected node) ══ */}
      {firstSel && !editingId && (
        <div className="cv-card-menu" style={{
          left: vp.x + (firstSel.x + firstSel.width / 2) * vp.zoom,
          top: vp.y + firstSel.y * vp.zoom - 8,
        }}>
          <button className="cv-card-btn" title="Color" onClick={() => setColorPickerFor(colorPickerFor === firstSel.id ? null : firstSel.id)}><Palette size={14} /></button>
          <button className="cv-card-btn" title="Duplicate" onClick={() => duplicateNode(firstSel.id)}><Copy size={14} /></button>
          <div className="cv-card-menu-div" />
          <button className="cv-card-btn cv-card-btn-del" title="Delete" onClick={deleteSelected}><Trash2 size={14} /></button>
          {colorPickerFor === firstSel.id && (
            <div className="cv-color-row">
              <button className="cv-swatch cv-swatch-none" onClick={() => { updateNode(firstSel.id, { color: undefined }); setColorPickerFor(null); }} />
              {Object.entries(CANVAS_PRESET_COLORS).map(([k, hex]) => (
                <button key={k} className={`cv-swatch${firstSel.color === k ? ' on' : ''}`} style={{ background: hex }}
                  onClick={() => { updateNode(firstSel.id, { color: k }); setColorPickerFor(null); }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ Right-side controls (Obsidian-style) ══ */}
      <div className="cv-controls">
        <div className="cv-ctrl-group">
          <button className="cv-ctrl" title="Add card" onClick={() => addNode('text')}><Plus size={18} /></button>
        </div>
        <div className="cv-ctrl-group">
          <button className="cv-ctrl" title="Zoom in" onClick={() => zoomBy(0.15)}><Plus size={16} /></button>
          <button className="cv-ctrl cv-ctrl-label" title="Reset zoom" onClick={() => setVp(p => ({ ...p, zoom: 1 }))}>{Math.round(vp.zoom * 100)}%</button>
          <button className="cv-ctrl" title="Zoom out" onClick={() => zoomBy(-0.15)}><Minus size={16} /></button>
          <button className="cv-ctrl" title="Zoom to fit" onClick={zoomFit}><Maximize size={15} /></button>
        </div>
        <div className="cv-ctrl-group">
          <button className={`cv-ctrl${grid ? ' on' : ''}`} title="Toggle grid" onClick={() => setGrid(!grid)}><Grid3X3 size={15} /></button>
        </div>
        <div className="cv-ctrl-group">
          <button className="cv-ctrl" title="Undo" onClick={undo} disabled={histIdx <= 0}><RotateCcw size={15} /></button>
          <button className="cv-ctrl" title="Redo" onClick={redo} disabled={histIdx >= hist.length - 1}><RotateCw size={15} /></button>
        </div>
      </div>

      {/* ══ Bottom toolbar (add row) ══ */}
      <div className="cv-add-bar">
        <button className="cv-add-btn" onClick={() => addNode('text')} title="New text card"><FileText size={18} /></button>
        <button className="cv-add-btn" onClick={() => setFileModal(true)} title="Embed note"><FileText size={18} /><span className="cv-add-badge">+</span></button>
        <button className="cv-add-btn" onClick={() => setLinkModal(true)} title="Add web link"><Globe size={18} /></button>
        <button className="cv-add-btn" onClick={() => addNode('group')} title="Add group"><SquareDashed size={18} /></button>
      </div>

      {/* ══ Close / fullscreen chip ══ */}
      <button className="cv-close" onClick={onClose} title="Close canvas"><X size={16} /></button>

      {/* ══ File modal ══ */}
      {fileModal && (
        <div className="cv-overlay" onClick={() => setFileModal(false)}>
          <div className="cv-modal" onClick={e => e.stopPropagation()}>
            <div className="cv-modal-head"><span>Select a note</span><button onClick={() => setFileModal(false)}><X size={14} /></button></div>
            <div className="cv-modal-body">{flatFiles.length === 0 ? <p className="cv-modal-empty">No notes found</p> : flatFiles.map((f, i) => (
              <button key={i} className="cv-file-row" onClick={() => { addNode('file', { file: f.path }); setFileModal(false); }}><FileText size={14} />{f.name}</button>
            ))}</div>
          </div>
        </div>
      )}
      {/* ══ Link modal ══ */}
      {linkModal && (
        <div className="cv-overlay" onClick={() => setLinkModal(false)}>
          <div className="cv-modal cv-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="cv-modal-head"><span>Add link</span><button onClick={() => setLinkModal(false)}><X size={14} /></button></div>
            <div className="cv-modal-body">
              <input ref={linkRef} className="cv-link-input" placeholder="https://example.com" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { let u = linkUrl.trim(); if (u && !u.startsWith('http')) u = 'https://' + u; if (u) addNode('link', { url: u }); setLinkModal(false); setLinkUrl(''); } if (e.key === 'Escape') setLinkModal(false); }} autoFocus />
              <button className="cv-link-go" onClick={() => { let u = linkUrl.trim(); if (u && !u.startsWith('http')) u = 'https://' + u; if (u) addNode('link', { url: u }); setLinkModal(false); setLinkUrl(''); }}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SUB-COMPONENTS (inline for fewer files)
   ═══════════════════════════════════════════════════════════ */

/* ── Dot grid ── */
function DotGrid({ zoom, offX, offY }: { zoom: number; offX: number; offY: number }) {
  const r = 0.5;
  const gap = GRID_SIZE * zoom;
  const ox = ((offX % gap) + gap) % gap;
  const oy = ((offY % gap) + gap) % gap;
  return (
    <svg className="cv-dots">
      <defs>
        <pattern id="cvDot" width={gap} height={gap} patternUnits="userSpaceOnUse" x={ox} y={oy}>
          <circle cx={gap / 2} cy={gap / 2} r={r * Math.max(1, zoom)} fill="var(--cv-dot)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#cvDot)" />
    </svg>
  );
}

/* ── Edge (bezier) ── */
function EdgePath({ edge, nodes, selected, onClick }: { edge: CanvasEdge; nodes: CanvasNode[]; selected: boolean; onClick: (e: React.MouseEvent) => void }) {
  const a = nodes.find(n => n.id === edge.fromNode);
  const b = nodes.find(n => n.id === edge.toNode);
  if (!a || !b) return null;
  const [fs0, ts0] = bestSides(a, b);
  const fs = edge.fromSide || fs0, ts = edge.toSide || ts0;
  const p1 = portXY(a, fs), p2 = portXY(b, ts);
  const dist = Math.min(120, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.35 + 40);
  const c1 = cpOffset(fs, dist), c2 = cpOffset(ts, dist);
  const d = `M${p1.x},${p1.y} C${p1.x + c1.dx},${p1.y + c1.dy} ${p2.x + c2.dx},${p2.y + c2.dy} ${p2.x},${p2.y}`;
  const color = resolveCanvasColor(edge.color) || 'var(--cv-edge)';
  const endAngle = Math.atan2(p2.y - (p2.y + c2.dy), p2.x - (p2.x + c2.dx)) * 180 / Math.PI;
  return (
    <g className={`cv-edge${selected ? ' sel' : ''}`}>
      <path d={d} fill="none" stroke="transparent" strokeWidth={20} style={{ cursor: 'pointer' }} onClick={onClick} />
      <path d={d} className="cv-edge-display" stroke={color} strokeWidth={selected ? 2.5 : 2} fill="none" />
      {(edge.toEnd !== 'none') && <polygon points="-7,-4.5 0,0 -7,4.5" fill={color} transform={`translate(${p2.x},${p2.y}) rotate(${endAngle})`} />}
      {edge.label && (
        <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 8} textAnchor="middle" className="cv-edge-label">{edge.label}</text>
      )}
    </g>
  );
}

function TempEdgePath({ from }: { from: { fx: number; fy: number; tx: number; ty: number } }) {
  const dx = from.tx - from.fx, dy = from.ty - from.fy;
  const off = Math.min(100, Math.hypot(dx, dy) * 0.3 + 30);
  const d = `M${from.fx},${from.fy} C${from.fx + (dx > 0 ? off : -off)},${from.fy} ${from.tx + (dx > 0 ? -off : off)},${from.ty} ${from.tx},${from.ty}`;
  return (
    <g className="cv-edge temp">
      <path d={d} fill="none" stroke="var(--accent-color)" strokeWidth={2} strokeDasharray="6 3" opacity={0.7} />
      <circle cx={from.tx} cy={from.ty} r={4} fill="var(--accent-color)" />
    </g>
  );
}

function EmbeddedFileNode({ node, vaultPath }: { node: CanvasFileNode, vaultPath: string }) {
  const [content, setContent] = useState<string | null>(null);
  const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(node.file);

  useEffect(() => {
    let mounted = true;
    if (node.file.endsWith('.md')) {
      getAPI().readFile(node.file).then(c => {
        if (mounted) setContent(c);
      }).catch(e => console.error('Failed to load embedded note:', e));
    }
    return () => { mounted = false; };
  }, [node.file]);

  if (isImage) {
    const imgSrc = `file://${vaultPath}/${node.file}`;
    return (
      <div className="cv-node-body cv-embedded-image" style={{ padding: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
         <img src={imgSrc} alt={node.file} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} onError={(e) => (e.currentTarget.style.display = 'none')} />
      </div>
    );
  }

  if (content !== null) {
    return (
      <div className="cv-node-body cv-embedded-md" data-cv-no-drag="true" style={{ overflowY: 'auto' }}>
        <MarkdownPreview content={content} onLinkClick={() => {}} />
      </div>
    );
  }

  return (
    <div className="cv-node-body cv-file-body">
      <FileText size={15} className="cv-file-icon" />
      <span className="cv-file-name">{node.file.split('/').pop()}</span>
    </div>
  );
}

/* ── Node card ── */
interface NodeCardProps {
  node: CanvasNode; selected: boolean; editing: boolean; editText: string; zoomMult: number; vaultPath: string;
  onMouseDown: (e: React.MouseEvent) => void; onDoubleClick: () => void;
  onPortDown: (side: EdgeSide, e: React.MouseEvent) => void;
  onResizeDown: (handle: string, e: React.MouseEvent) => void;
  onEditChange: (v: string) => void; onEditBlur: () => void; onEditKeyDown: (e: React.KeyboardEvent) => void;
}

function NodeCard({ node, selected, editing, editText, zoomMult, vaultPath, onMouseDown, onDoubleClick, onPortDown, onResizeDown, onEditChange, onEditBlur, onEditKeyDown }: NodeCardProps) {
  const isGroup = node.type === 'group';
  const borderColor = resolveCanvasColor(node.color);

  const style: React.CSSProperties = {
    left: node.x, top: node.y, width: node.width, height: node.height,
    ...(borderColor && !isGroup ? {
      '--node-color': borderColor,
      background: `linear-gradient(${colorWithAlpha(borderColor, 0.12)}, ${colorWithAlpha(borderColor, 0.12)}), var(--cv-node-bg)`,
    } as any : {}),
    ...(borderColor && isGroup ? {
      '--node-color': borderColor,
      borderColor: colorWithAlpha(borderColor, 0.45),
      background: colorWithAlpha(borderColor, 0.08),
    } as any : {}),
  };

  return (
    <div className={`cv-node cv-node-${node.type}${selected ? ' sel' : ''}${editing ? ' editing' : ''}`}
      style={style} onMouseDown={onMouseDown} onDoubleClick={onDoubleClick} data-id={node.id}>

      {/* Connection ports (only non-group) */}
      {!isGroup && selected && (['top', 'right', 'bottom', 'left'] as EdgeSide[]).map(s => (
        <div key={s} className={`cv-port cv-port-${s}`} onMouseDown={e => onPortDown(s, e)} style={{ '--zm': zoomMult } as any} />
      ))}

      {/* Resize handles */}
      {selected && ['nw', 'ne', 'sw', 'se'].map(h => (
        <div key={h} className={`cv-resize cv-resize-${h}`} onMouseDown={e => onResizeDown(h, e)} style={{ '--zm': zoomMult } as any} />
      ))}

      {/* Group label */}
      {isGroup && (
        editing ? (
          <input className="cv-group-input" autoFocus value={editText} onChange={e => onEditChange(e.target.value)}
            onBlur={onEditBlur} onKeyDown={e => { onEditKeyDown(e); if (e.key === 'Enter') onEditBlur(); }}
            style={{ '--zm': zoomMult } as any} />
        ) : (
          <div className="cv-group-label" style={{ '--zm': zoomMult } as any}>
            {(node as CanvasGroupNode).label}
          </div>
        )
      )}

      {/* Content */}
      {node.type === 'text' && (
        editing ? (
          <textarea className="cv-text-edit" value={editText} onChange={e => onEditChange(e.target.value)}
            onBlur={onEditBlur} onKeyDown={onEditKeyDown} autoFocus />
        ) : (
          <div className="cv-node-body">
            {(node as CanvasTextNode).text || <span className="cv-placeholder">Double-click to edit…</span>}
          </div>
        )
      )}

      {node.type === 'file' && <EmbeddedFileNode node={node as CanvasFileNode} vaultPath={vaultPath} />}

      {node.type === 'link' && (
        <div className="cv-node-body cv-link-body">
          <Globe size={15} className="cv-link-icon" />
          <span className="cv-link-host">{(() => { try { return new URL((node as CanvasLinkNode).url).hostname; } catch { return (node as CanvasLinkNode).url; } })()}</span>
        </div>
      )}
    </div>
  );
}
