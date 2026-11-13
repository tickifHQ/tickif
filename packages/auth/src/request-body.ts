/** Reads a string field from an unvalidated Better Auth hook body or query. */
export function bodyString(body: unknown, key: string): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const value = Reflect.get(body, key);
  return typeof value === 'string' ? value : undefined;
}
