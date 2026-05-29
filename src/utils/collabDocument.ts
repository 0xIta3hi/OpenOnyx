export interface DocumentVersionMeta {
  version: number;
  last_modified: string;
  client_id: string | null;
  content_hash: string;
}

export const EMPTY_DOCUMENT_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export async function sha256Hex(content: string): Promise<string> {
  const encoded = new TextEncoder().encode(content);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  // Fallback for non-browser test environments. Runtime collaboration uses
  // WebCrypto SHA-256 in the Electron renderer.
  let hash = 2166136261;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function normalizeVersion(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

export function isVersionNewer(incomingVersion: unknown, currentVersion: unknown): boolean {
  return normalizeVersion(incomingVersion) > normalizeVersion(currentVersion);
}
