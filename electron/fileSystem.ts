/**
 * FileSystem Manager
 * 
 * Handles all filesystem operations for the vault.
 * Provides an abstraction layer over Node.js fs module
 * with vault-scoped path resolution and safety checks.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface FileEntry {
  name: string;
  path: string;           // Relative path from vault root
  absolutePath: string;
  isDirectory: boolean;
  extension: string;
  children?: FileEntry[];
  modifiedAt: number;
  size: number;
}

export interface NoteLink {
  source: string;  // Source note (relative path)
  target: string;  // Target note name from [[link]]
}

export class FileSystemManager {
  private vaultPath: string | null = null;

  /** Set the active vault directory */
  setVaultPath(vaultPath: string): boolean {
    if (!fs.existsSync(vaultPath)) {
      try {
        fs.mkdirSync(vaultPath, { recursive: true });
      } catch {
        return false;
      }
    }
    this.vaultPath = vaultPath;
    return true;
  }

  getVaultPath(): string | null {
    return this.vaultPath;
  }

  /** Resolve a relative path to an absolute path within the vault */
  private resolvePath(relativePath: string): string {
    if (!this.vaultPath) throw new Error('No vault path set');
    const resolved = path.resolve(this.vaultPath, relativePath);
    // Security: ensure resolved path is within vault
    if (!resolved.startsWith(this.vaultPath)) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  /** List files in a directory (relative path) */
  async listFiles(dirPath: string = ''): Promise<FileEntry[]> {
    const absoluteDir = this.resolvePath(dirPath);
    if (!fs.existsSync(absoluteDir)) return [];

    const entries = await fs.promises.readdir(absoluteDir, { withFileTypes: true });
    const result: FileEntry[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      const relativePath = path.join(dirPath, entry.name);
      const absolutePath = path.join(absoluteDir, entry.name);
      
      try {
        const stats = await fs.promises.stat(absolutePath);
        result.push({
          name: entry.name,
          path: relativePath,
          absolutePath,
          isDirectory: entry.isDirectory(),
          extension: path.extname(entry.name),
          modifiedAt: stats.mtimeMs,
          size: stats.size,
        });
      } catch (e) {
        console.warn('Skipping file due to stat error:', absolutePath);
      }
    }

    // Sort: directories first, then files alphabetically
    return result.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  /** Get full file tree recursively */
  async getFileTree(dirPath: string = ''): Promise<FileEntry[]> {
    const entries = await this.listFiles(dirPath);
    
    for (const entry of entries) {
      if (entry.isDirectory) {
        entry.children = await this.getFileTree(entry.path);
      }
    }

    return entries;
  }

  /** Read file content */
  async readFile(filePath: string): Promise<string> {
    const absolutePath = this.resolvePath(filePath);
    return fs.promises.readFile(absolutePath, 'utf-8');
  }

  /** Write file content (auto-creates directories) */
  async writeFile(filePath: string, content: string): Promise<void> {
    const absolutePath = this.resolvePath(filePath);
    const dir = path.dirname(absolutePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(absolutePath, content, 'utf-8');
  }

  /** Create a new file */
  async createFile(filePath: string, content: string = ''): Promise<void> {
    const absolutePath = this.resolvePath(filePath);
    const dir = path.dirname(absolutePath);
    await fs.promises.mkdir(dir, { recursive: true });
    
    // Don't overwrite existing files
    if (fs.existsSync(absolutePath)) {
      return;
    }
    await fs.promises.writeFile(absolutePath, content, 'utf-8');
  }

  /** Delete a file */
  async deleteFile(filePath: string): Promise<void> {
    const absolutePath = this.resolvePath(filePath);
    if (fs.existsSync(absolutePath)) {
      await fs.promises.unlink(absolutePath);
    }
  }

  /** Rename/move a file */
  async renameFile(oldPath: string, newPath: string): Promise<void> {
    const absoluteOld = this.resolvePath(oldPath);
    const absoluteNew = this.resolvePath(newPath);
    const dir = path.dirname(absoluteNew);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.rename(absoluteOld, absoluteNew);
  }

  /** Create a directory */
  async createDirectory(dirPath: string): Promise<void> {
    const absolutePath = this.resolvePath(dirPath);
    await fs.promises.mkdir(absolutePath, { recursive: true });
  }

  /** Delete a directory recursively */
  async deleteDirectory(dirPath: string): Promise<void> {
    const absolutePath = this.resolvePath(dirPath);
    if (fs.existsSync(absolutePath)) {
      await fs.promises.rm(absolutePath, { recursive: true, force: true });
    }
  }

  /** Check if a file exists */
  async fileExists(filePath: string): Promise<boolean> {
    const absolutePath = this.resolvePath(filePath);
    return fs.existsSync(absolutePath);
  }

  /**
   * Extract [[wiki-links]] from markdown content.
   * Returns an array of link target names (without brackets).
   */
  extractLinks(content: string): string[] {
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    const links: string[] = [];
    let match: RegExpExecArray | null;
    
    while ((match = linkRegex.exec(content)) !== null) {
      links.push(match[1].trim());
    }
    return [...new Set(links)]; // Deduplicate
  }

  /**
   * Extract #tags from markdown content.
   * Returns an array of tag names (without the #).
   */
  extractTags(content: string): string[] {
    // Match #tag but not inside code blocks or URLs
    const tagRegex = /(?:^|\s)#([a-zA-Z][a-zA-Z0-9_-]*)/g;
    const tags: string[] = [];
    let match: RegExpExecArray | null;
    
    while ((match = tagRegex.exec(content)) !== null) {
      tags.push(match[1]);
    }
    return [...new Set(tags)];
  }

  /**
   * Build a full graph of note connections.
   * Scans all .md files and extracts [[links]] to build nodes and edges.
   */
  async buildGraph(): Promise<{ nodes: any[]; edges: any[] }> {
    if (!this.vaultPath) return { nodes: [], edges: [] };

    const allFiles = await this.getAllMarkdownFiles();
    const nodes: Map<string, { id: string; name: string; path: string; connections: number }> = new Map();
    const edges: { source: string; target: string }[] = [];
    // Track children for each node (outgoing links - nodes this note links TO)
    const childrenMap: Map<string, Set<string>> = new Map();

    // Create nodes for all existing files
    for (const file of allFiles) {
      const name = path.basename(file, '.md');
      const key = name.toLowerCase();
      nodes.set(key, {
        id: key,
        name,
        path: file,
        connections: 0,
      });
      childrenMap.set(key, new Set());
    }

    // Build edges by scanning links in each file
    for (const file of allFiles) {
      const content = await this.readFile(file);
      const links = this.extractLinks(content);
      const sourceName = path.basename(file, '.md').toLowerCase();

      for (const linkTarget of links) {
        const targetKey = linkTarget.toLowerCase();
        
        // Create node for target if it doesn't exist (phantom node)
        if (!nodes.has(targetKey)) {
          nodes.set(targetKey, {
            id: targetKey,
            name: linkTarget,
            path: '',
            connections: 0,
          });
          childrenMap.set(targetKey, new Set());
        }

        edges.push({ source: sourceName, target: targetKey });
        
        // Track children (outgoing links from source TO target)
        childrenMap.get(sourceName)?.add(targetKey);
      }
    }

    // Calculate total descendants for each node recursively
    const descendantCache: Map<string, number> = new Map();
    
    const countDescendants = (nodeId: string, visited: Set<string>): number => {
      // Prevent infinite loops from cycles
      if (visited.has(nodeId)) return 0;
      
      // Return cached value if available
      if (descendantCache.has(nodeId)) return descendantCache.get(nodeId)!;
      
      visited.add(nodeId);
      const children = childrenMap.get(nodeId) || new Set();
      
      let total = children.size; // Direct children
      for (const child of children) {
        total += countDescendants(child, new Set(visited));
      }
      
      descendantCache.set(nodeId, total);
      return total;
    };

    // Set connections to total descendants count
    for (const [nodeId, node] of nodes) {
      node.connections = countDescendants(nodeId, new Set());
    }

    return {
      nodes: Array.from(nodes.values()),
      edges,
    };
  }

  /**
   * Get backlinks for a specific note.
   * Returns paths of all notes that link to the given note.
   */
  async getBacklinks(filePath: string): Promise<string[]> {
    if (!this.vaultPath) return [];

    const targetName = path.basename(filePath, '.md');
    const allFiles = await this.getAllMarkdownFiles();
    const backlinks: string[] = [];

    for (const file of allFiles) {
      if (file === filePath) continue;
      const content = await this.readFile(file);
      const links = this.extractLinks(content);
      
      if (links.some(link => link.toLowerCase() === targetName.toLowerCase())) {
        backlinks.push(file);
      }
    }

    return backlinks;
  }

  /**
   * Get all tags across the vault with the files that contain each tag.
   */
  async getAllTags(): Promise<Record<string, string[]>> {
    if (!this.vaultPath) return {};

    const allFiles = await this.getAllMarkdownFiles();
    const tagMap: Record<string, string[]> = {};

    for (const file of allFiles) {
      const content = await this.readFile(file);
      const tags = this.extractTags(content);

      for (const tag of tags) {
        if (!tagMap[tag]) tagMap[tag] = [];
        tagMap[tag].push(file);
      }
    }

    return tagMap;
  }

  /** Get all .md files in the vault recursively */
  async getAllMarkdownFiles(dirPath: string = ''): Promise<string[]> {
    if (!this.vaultPath) return [];

    const absoluteDir = this.resolvePath(dirPath);
    if (!fs.existsSync(absoluteDir)) return [];

    const entries = await fs.promises.readdir(absoluteDir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      
      const relativePath = dirPath ? path.join(dirPath, entry.name) : entry.name;
      
      if (entry.isDirectory()) {
        const subFiles = await this.getAllMarkdownFiles(relativePath);
        files.push(...subFiles);
      } else if (entry.name.endsWith('.md')) {
        files.push(relativePath);
      }
    }

    return files;
  }

  /** Create a daily note with today's date */
  async createDailyNote(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const fileName = `Daily Notes/${dateStr}.md`;
    
    const exists = await this.fileExists(fileName);
    if (!exists) {
      const content = `# ${dateStr}\n\n## Tasks\n\n- [ ] \n\n## Notes\n\n\n\n## Links\n\n`;
      await this.createFile(fileName, content);
    }
    
    return fileName;
  }

  /**
   * Save an image to the attachments folder.
   * Creates the folder if it doesn't exist.
   * Returns the relative path to use in markdown.
   */
  async saveImage(fileName: string, base64Data: string): Promise<string> {
    if (!this.vaultPath) throw new Error('No vault path set');
    
    // Create attachments folder if it doesn't exist
    const attachmentsDir = path.join(this.vaultPath, 'attachments');
    if (!fs.existsSync(attachmentsDir)) {
      fs.mkdirSync(attachmentsDir, { recursive: true });
    }
    
    // Generate unique filename if needed
    let uniqueName = fileName;
    let counter = 1;
    while (fs.existsSync(path.join(attachmentsDir, uniqueName))) {
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      uniqueName = `${base}-${counter}${ext}`;
      counter++;
    }
    
    // Remove data URL prefix if present
    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
    
    // Write the image file
    const imagePath = path.join(attachmentsDir, uniqueName);
    fs.writeFileSync(imagePath, Buffer.from(base64Content, 'base64'));
    
    // Return relative path for markdown
    return `attachments/${uniqueName}`;
  }
}
