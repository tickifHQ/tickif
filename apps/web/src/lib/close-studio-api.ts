import {
  organizationRetentionMutationResponseSchema,
  organizationRetentionResponseSchema,
  type OrganizationRetentionMutationResponse,
  type OrganizationRetentionResponse,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { handleApiResponse } from '@/lib/api-response';

/**
 * Close-studio API client — typed wrappers around the existing organization
 * retention (E-250) endpoints. Closing a studio reuses the recoverable
 * organization-closure lifecycle; there is no separate profile-deletion flow.
 *
 * Plain async functions (not hooks) so they can run inside client transitions
 * or event handlers, mirroring the other `*-api.ts` wrappers.
 */

/** GET /api/orgs/retention — current retention lifecycle for the active org, if any. */
export async function fetchStudioRetention(): Promise<OrganizationRetentionResponse> {
  const response = await api.api.orgs.retention.$get();
  return handleApiResponse(
    response,
    organizationRetentionResponseSchema,
    'Could not load the studio closure status.',
    'The studio closure status response was invalid. Please refresh.',
  );
}

/**
 * POST /api/orgs/retention/deletion — request recoverable closure of the active
 * organization. Owner-only; `confirmationSlug` must equal the organization slug
 * (the API rejects a mismatch with 422).
 */
export async function requestStudioClosure(
  confirmationSlug: string,
): Promise<OrganizationRetentionMutationResponse> {
  const response = await api.api.orgs.retention.deletion.$post({
    json: { confirmationSlug },
  });
  return handleApiResponse(
    response,
    organizationRetentionMutationResponseSchema,
    'Could not close the studio.',
    'The studio closure response was invalid. Please refresh.',
  );
}

/**
 * POST /api/orgs/retention/restore — restore the active organization during the
 * owner recovery window. Owner-only; the API rejects it once the window closes.
 */
export async function restoreStudio(): Promise<OrganizationRetentionMutationResponse> {
  const response = await api.api.orgs.retention.restore.$post();
  return handleApiResponse(
    response,
    organizationRetentionMutationResponseSchema,
    'Could not restore the studio.',
    'The studio restore response was invalid. Please refresh.',
  );
}
