/**
 * Obsidian API Compatibility — MetadataCache
 * Provides cached file metadata (frontmatter, headings, links, tags).
 */

import { Events } from './components';
import { TFile } from './files';

export interface CachedMetadata {
  frontmatter?: Record<string, any>;
  frontmatterPosition?: { start: { line: number; col: number; offset: number }; end: { line: number; col: number; offset: number } };
  headings?: Array<{ heading: string; level: number; position: any }>;
  links?: Array<{ link: string; original: string; displayText?: string; position: any }>;
  embeds?: Array<{ link: string; original: string; displayText?: string; position: any }>;
  tags?: Array<{ tag: string; position: any }>;
  sections?: Array<{ type: string; position: any; id?: string }>;
  listItems?: Array<{ position: any; parent: number; task?: string }>;
  frontmatterLinks?: Array<{ key: string; link: string; original: string; displayText?: string }>;
}

export class OOMetadataCache extends Events {
  private _cache: Map<string, CachedMetadata> = new Map();
  resolvedLinks: Record<string, Record<string, number>> = {};
  unresolvedLinks: Record<string, Record<string, number>> = {};

  getFileCache(file: TFile): CachedMetadata | null {
    return this._cache.get(file.path) || null;
  }

  getCache(path: string): CachedMetadata | null {
    return this._cache.get(path) || null;
  }

  getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null {
    const app = (window as any).__oo_app;
    if (!app?.vault) return null;
    // Try exact path
    let file = app.vault.getFileByPath(linkpath);
    if (file) return file;
    // Try with .md extension
    file = app.vault.getFileByPath(linkpath + '.md');
    if (file) return file;
    // Try basename match
    const allFiles = app.vault.getMarkdownFiles();
    return allFiles.find((f: TFile) => f.basename.toLowerCase() === linkpath.toLowerCase()) || null;
  }

  /** Build cache from vault content */
  async buildCache(vault: any): Promise<void> {
    const files = vault.getMarkdownFiles();
    for (const file of files) {
      try {
        const content = await vault.read(file);
        this._cache.set(file.path, this._parseMetadata(content));
      } catch { /* skip errored files */ }
    }
    this.trigger('resolved');
  }

  private _parseMetadata(content: string): CachedMetadata {
    const metadata: CachedMetadata = {};
    const lines = content.split('\n');

    // Parse frontmatter
    if (lines[0]?.trim() === '---') {
      const endIdx = lines.indexOf('---', 1);
      if (endIdx > 0) {
        const yamlStr = lines.slice(1, endIdx).join('\n');
        try {
          const fm: Record<string, any> = {};
          for (const line of yamlStr.split('\n')) {
            const ci = line.indexOf(':');
            if (ci < 0) continue;
            const k = line.substring(0, ci).trim();
            let v: any = line.substring(ci + 1).trim();
            if (v === 'true') v = true;
            else if (v === 'false') v = false;
            else if (/^\d+$/.test(v)) v = parseInt(v);
            if (k) fm[k] = v;
          }
          metadata.frontmatter = fm;
        } catch { /* skip */ }
      }
    }

    // Parse headings
    const headings: CachedMetadata['headings'] = [];
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(#{1,6})\s+(.+)/);
      if (match) {
        headings.push({
          heading: match[2].trim(),
          level: match[1].length,
          position: { start: { line: i, col: 0, offset: 0 }, end: { line: i, col: lines[i].length, offset: 0 } },
        });
      }
    }
    if (headings.length) metadata.headings = headings;

    // Parse links
    const links: CachedMetadata['links'] = [];
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    let match;
    for (let i = 0; i < lines.length; i++) {
      while ((match = linkRegex.exec(lines[i])) !== null) {
        const parts = match[1].split('|');
        links.push({
          link: parts[0].trim(),
          original: match[0],
          displayText: parts[1]?.trim(),
          position: { start: { line: i, col: match.index, offset: 0 }, end: { line: i, col: match.index + match[0].length, offset: 0 } },
        });
      }
    }
    if (links.length) metadata.links = links;

    // Parse tags
    const tags: CachedMetadata['tags'] = [];
    const tagRegex = /(?:^|\s)#([a-zA-Z][a-zA-Z0-9_/-]*)/g;
    for (let i = 0; i < lines.length; i++) {
      while ((match = tagRegex.exec(lines[i])) !== null) {
        tags.push({
          tag: '#' + match[1],
          position: { start: { line: i, col: match.index, offset: 0 }, end: { line: i, col: match.index + match[0].length, offset: 0 } },
        });
      }
    }
    if (tags.length) metadata.tags = tags;

    return metadata;
  }
}
