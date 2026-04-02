/**
 * Core type definitions for OpenObsidian
 */

export interface FileEntry {
  name: string;
  path: string;
  absolutePath: string;
  isDirectory: boolean;
  extension: string;
  children?: FileEntry[];
  modifiedAt: number;
  size: number;
}

export interface SearchResult {
  path: string;
  name: string;
  matches: Array<{
    key: string;
    indices: readonly [number, number][];
    value: string;
  }>;
  score: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  name: string;
  path: string;
  connections: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
}

export interface Tab {
  id: string;
  path: string;
  name: string;
  isModified: boolean;
}

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
  category?: string;
}

export type ViewMode = 'editor' | 'preview' | 'split';
export type Theme = 'dark' | 'light';
