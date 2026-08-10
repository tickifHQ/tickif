/** Normalize an optional user-entered URL consistently across profile forms. */
export function normalizeOptionalUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

/** Reject local or malformed hosts while allowing normal public HTTP(S) URLs. */
export function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      hostname.includes('.') &&
      !hostname.startsWith('.') &&
      !hostname.endsWith('.')
    );
  } catch {
    return false;
  }
}
