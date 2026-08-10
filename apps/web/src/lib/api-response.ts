import type { ZodType } from 'zod';

function formatPath(path: unknown): string | null {
  if (typeof path === 'string') return path;
  if (!Array.isArray(path)) return null;
  const parts = path.filter(
    (part): part is string | number => typeof part === 'string' || typeof part === 'number',
  );
  return parts.length > 0 ? parts.join('.') : null;
}

/** Extract a useful message from Tickif's standard API error envelope. */
export function extractApiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object' || !('error' in body)) return fallback;
  const error = body.error;
  if (!error || typeof error !== 'object') return fallback;

  if ('details' in error && Array.isArray(error.details)) {
    const messages = error.details
      .filter(
        (detail): detail is { message: string; path?: unknown } =>
          !!detail &&
          typeof detail === 'object' &&
          'message' in detail &&
          typeof detail.message === 'string',
      )
      .slice(0, 3)
      .map((detail) => {
        const path = formatPath(detail.path);
        return path ? `${path}: ${detail.message}` : detail.message;
      });
    if (messages.length > 0) return messages.join('; ');
  }

  return 'message' in error && typeof error.message === 'string' ? error.message : fallback;
}

export async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    return extractApiErrorMessage(await response.json(), fallback);
  } catch {
    return fallback;
  }
}

/** Check the HTTP status and validate the success payload at the client boundary. */
export async function handleApiResponse<T>(
  response: Response,
  schema: ZodType<T>,
  fallback: string,
  invalidPayloadMessage = fallback,
): Promise<T> {
  if (!response.ok) throw new Error(await readApiErrorMessage(response, fallback));

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(invalidPayloadMessage);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error(invalidPayloadMessage);
  return parsed.data;
}
