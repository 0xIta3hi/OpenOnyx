/**
 * Graph Physics Worker
 * Runs d3-force simulation in a Web Worker for smooth UI
 * Uses Obsidian-like force parameters
 */

import * as d3 from "d3-force";

interface WorkerNode {
  id: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  connections: number;
}

interface WorkerEdge {
  source: string | WorkerNode;
  target: string | WorkerNode;
}

interface ForceParams {
  centerStrength: number;
  repelStrength: number;
  linkStrength: number;
  linkDistance: number;
  collisionRadius: number;
}

let simulation: d3.Simulation<WorkerNode, WorkerEdge> | null = null;
let nodes: WorkerNode[] = [];
let edges: WorkerEdge[] = [];
let isRunning = false;
let nodeMap = new Map<string, WorkerNode>();

// Default Obsidian-like parameters
let forceParams: ForceParams = {
  centerStrength: 0.1,
  repelStrength: 1000,
  linkStrength: 1,
  linkDistance: 250,
  collisionRadius: 60,
};

function initSimulation() {
  if (nodes.length === 0) return;

  // Build node map
  nodeMap.clear();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  // Create simulation with Obsidian-like parameters
  simulation = d3
    .forceSimulation<WorkerNode>(nodes)
    .force("x", d3.forceX(0).strength(forceParams.centerStrength))
    .force("y", d3.forceY(0).strength(forceParams.centerStrength))
    .force(
      "charge",
      d3
        .forceManyBody<WorkerNode>()
        .strength(-forceParams.repelStrength)
        .distanceMin(30),
    )
    .force(
      "link",
      d3
        .forceLink<WorkerNode, WorkerEdge>(edges)
        .id((d) => d.id)
        .distance(forceParams.linkDistance)
        .strength((d) => {
          // Obsidian-style: weaker links between highly connected nodes
          const source = d.source as WorkerNode;
          const target = d.target as WorkerNode;
          return (
            forceParams.linkStrength /
            Math.min(source.connections || 1, target.connections || 1)
          );
        }),
    )
    .force(
      "collision",
      d3.forceCollide<WorkerNode>().radius(forceParams.collisionRadius)
    )
    .alphaDecay(1 - Math.pow(0.001, 1 / 300)) // Obsidian's alpha decay
    .velocityDecay(0.6) // Match sim.js damping factor
    .on("tick", onTick)
    .on("end", onEnd);
}

function onTick() {
  if (!simulation) return;

  const ids = nodes.map((n) => n.id);
  const positions = new Float32Array(nodes.length * 2);

  for (let i = 0; i < nodes.length; i++) {
    positions[i * 2] = nodes[i].x;
    positions[i * 2 + 1] = nodes[i].y;
  }

  self.postMessage(
    {
      type: "tick",
      ids,
      positions: positions.buffer,
      alpha: simulation.alpha(),
    },
    { transfer: [positions.buffer] },
  );
}

function onEnd() {
  isRunning = false;
  self.postMessage({ type: "end" });
}

self.onmessage = (e: MessageEvent) => {
  const { type, data } = e.data;

  switch (type) {
    case "init": {
      nodes = data.nodes.map((n: any) => ({
        ...n,
        x: n.x ?? (Math.random() - 0.5) * 500,
        y: n.y ?? (Math.random() - 0.5) * 500,
        vx: 0,
        vy: 0,
      }));
      edges = data.edges.map((e: any) => ({ ...e }));
      if (data.forces) {
        forceParams = { ...forceParams, ...data.forces };
      }
      initSimulation();
      break;
    }

    case "start": {
      if (simulation && !isRunning) {
        isRunning = true;
        simulation.alpha(1).restart();
      }
      break;
    }

    case "stop": {
      if (simulation) {
        simulation.stop();
        isRunning = false;
      }
      break;
    }

    case "forces": {
      forceParams = { ...forceParams, ...data };
      if (simulation) {
        simulation
          .force(
            "center",
            d3.forceCenter(0, 0).strength(forceParams.centerStrength),
          )
          .force("x", d3.forceX(0).strength(forceParams.centerStrength))
          .force("y", d3.forceY(0).strength(forceParams.centerStrength))
          .force(
            "charge",
            d3
              .forceManyBody<WorkerNode>()
              .strength(-forceParams.repelStrength)
              .distanceMax(800),
          )
          .force(
            "link",
            d3
              .forceLink<WorkerNode, WorkerEdge>(edges)
              .id((d) => d.id)
              .distance(forceParams.linkDistance)
              .strength((d) => {
                const source = d.source as WorkerNode;
                const target = d.target as WorkerNode;
                return (
                  forceParams.linkStrength /
                  Math.min(source.connections || 1, target.connections || 1)
                );
              }),
          )
          .force(
            "collision",
            d3
              .forceCollide<WorkerNode>()
              .radius(
                (d) =>
                  forceParams.collisionRadius +
                  Math.pow(d.connections || 0, 0.6) * 2,
              ),
          );
      }
      break;
    }

    case "reheat": {
      if (simulation) {
        isRunning = true;
        simulation.alpha(1).restart();
      }
      break;
    }

    case "drag": {
      const { id, x, y, active } = data;
      const node = nodeMap.get(id);
      if (node) {
        if (active) {
          node.fx = x;
          node.fy = y;
          if (simulation && !isRunning) {
            isRunning = true;
            simulation.alphaTarget(0.3).restart();
          }
        } else {
          node.fx = null;
          node.fy = null;
          if (simulation) {
            simulation.alphaTarget(0);
          }
        }
      }
      break;
    }

    case "pin": {
      const { id, pinned, x, y } = data;
      const node = nodeMap.get(id);
      if (node) {
        if (pinned) {
          node.fx = x;
          node.fy = y;
        } else {
          node.fx = null;
          node.fy = null;
        }
      }
      break;
    }

    case "setPositions": {
      const { positions } = data;
      for (const [id, pos] of Object.entries(positions)) {
        const node = nodeMap.get(id);
        if (node) {
          node.x = (pos as any).x;
          node.y = (pos as any).y;
        }
      }
      // Send updated positions back
      onTick();
      break;
    }

    case "getPositions": {
      const positions: Record<string, { x: number; y: number }> = {};
      nodes.forEach((n) => {
        positions[n.id] = { x: n.x, y: n.y };
      });
      self.postMessage({ type: "positions", positions });
      break;
    }
  }
};
