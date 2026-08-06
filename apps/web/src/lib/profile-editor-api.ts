import {
  profileCompletionResponseSchema,
  profileOwnerResponseSchema,
  type ProfileCompletionResponse,
  type ProfileOwnerResponse,
  type UpdateProfileInput,
} from '@repo/contracts';
import { api } from '@/lib/api';

function formatPath(path: unknown): string | null {
  if (typeof path === 'string') return path;
  if (!Array.isArray(path)) return null;
  const parts = path.filter(
    (part): part is string | number => typeof part === 'string' || typeof part === 'number',
  );
  return parts.length > 0 ? parts.join('.') : null;
}

function extractErrorMessage(body: unknown, fallback: string): string {
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

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    return extractErrorMessage(await response.json(), fallback);
  } catch {
    return fallback;
  }
}

export async function updateDesignerProfile(
  input: UpdateProfileInput,
): Promise<ProfileOwnerResponse> {
  const response = await api.api.profiles.me.$patch({ json: input });
  if (!response.ok) {
    throw new Error(await readError(response, 'Could not save profile settings.'));
  }

  const parsed = profileOwnerResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('The saved profile response was invalid. Please refresh.');
  return parsed.data;
}

export async function fetchProfileCompletion(): Promise<ProfileCompletionResponse> {
  const response = await api.api.profiles.me.completion.$get();
  if (!response.ok) {
    throw new Error(await readError(response, 'Could not refresh profile completion.'));
  }

  const parsed = profileCompletionResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('The profile completion response was invalid.');
  return parsed.data;
}
