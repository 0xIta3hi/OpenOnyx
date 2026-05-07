/**
 * Resolves a local image path to an absolute file:// URI
 * relative to the current vault path.
 */
export function resolveVaultImageSrc(src: string): string {
  if (!src) return src;

  // Return early if it's already an absolute URL or data URI
  if (/^(https?|data|file|blob|vault):/i.test(src)) {
    return src;
  }

  // Use the custom vault:// protocol which handles
  // both exact paths and filename searching across the vault
  let urlPath = src;
  if (urlPath.startsWith('/')) {
    urlPath = urlPath.slice(1);
  }
  
  // URL encode the path to handle spaces properly
  // but keep slashes intact so paths work
  const segments = urlPath.split('/').map(encodeURIComponent);
  // Prepend 'local/' as the host part because custom protocols with standard: true 
  // lowercase the host part. This ensures the case-sensitive filename is preserved in the path.
  return `vault://local/${segments.join('/')}`;
}
