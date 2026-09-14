import {
  onboardingDraftGetResponseSchema,
  onboardingDraftResponseSchema,
  type OnboardingDraftInput,
  type OnboardingDraftResponse,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { handleApiResponse } from '@/lib/api-response';

/**
 * Client for the account-scoped onboarding draft (E-298). The draft is the
 * server-side source of truth for a pending designer's in-progress onboarding,
 * so it resumes on any device/browser once the same account is authenticated.
 *
 * The `me` endpoints always resolve the user from the session cookie; these
 * wrappers never send a userId.
 */

// hc accessor for the hyphenated path segment `/me/onboarding-draft`. Resolved
// lazily (per call) rather than at module load so importing this file never
// depends on the full client shape being present (keeps it test-mock friendly).
const draftEndpoint = () => api.api.profiles.me['onboarding-draft'];

/**
 * Read the caller's saved draft. Server components pass the request `cookie`;
 * client-side calls rely on `credentials: 'include'` (see lib/api.ts).
 * Returns null when no draft is stored.
 */
export async function fetchOnboardingDraft(cookie?: string): Promise<OnboardingDraftResponse | null> {
  const response = await draftEndpoint().$get(
    {},
    { headers: cookie ? { cookie } : undefined, init: { cache: 'no-store' } },
  );
  const { draft } = await handleApiResponse(
    response,
    onboardingDraftGetResponseSchema,
    'Could not load onboarding progress.',
  );
  return draft;
}

/** Persist the caller's in-progress onboarding (visitor + pending only). */
export async function saveOnboardingDraft(
  input: OnboardingDraftInput,
): Promise<OnboardingDraftResponse> {
  const response = await draftEndpoint().$put({ json: input });
  return handleApiResponse(
    response,
    onboardingDraftResponseSchema,
    'Could not save onboarding progress.',
  );
}

/** Idempotently clear the caller's draft (also removed atomically on completion). */
export async function clearOnboardingDraft(): Promise<void> {
  await draftEndpoint().$delete();
}
