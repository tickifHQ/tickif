export const ORGANIZATION_TIER_ERROR_CODE = 'ORGANIZATION_RBAC_REQUIRES_CORPORATE';
export const ORGANIZATION_BILLING_LOCKED_ERROR_CODE = 'ORGANIZATION_BILLING_LOCKED';

function organizationEntitlementErrorCode(
  error: unknown,
): typeof ORGANIZATION_TIER_ERROR_CODE | typeof ORGANIZATION_BILLING_LOCKED_ERROR_CODE | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as { code?: unknown; message?: unknown; status?: unknown };
  if (candidate.code === ORGANIZATION_BILLING_LOCKED_ERROR_CODE) {
    return ORGANIZATION_BILLING_LOCKED_ERROR_CODE;
  }
  if (candidate.code === ORGANIZATION_TIER_ERROR_CODE || candidate.status === 402) {
    return ORGANIZATION_TIER_ERROR_CODE;
  }
  if (typeof candidate.message !== 'string') return null;
  if (
    candidate.message.includes(ORGANIZATION_BILLING_LOCKED_ERROR_CODE) ||
    candidate.message.includes('Restore billing')
  ) {
    return ORGANIZATION_BILLING_LOCKED_ERROR_CODE;
  }
  if (
    candidate.message.includes(ORGANIZATION_TIER_ERROR_CODE) ||
    candidate.message.includes('Upgrade to Corporate')
  ) {
    return ORGANIZATION_TIER_ERROR_CODE;
  }
  return null;
}

export function isOrganizationTierError(error: unknown): boolean {
  return organizationEntitlementErrorCode(error) === ORGANIZATION_TIER_ERROR_CODE;
}

export function formatOrganizationMutationError(
  fallback: string,
  error: unknown,
  messages: {
    upgrade?: string;
    billingLocked?: string;
  } = {},
): string {
  const entitlementCode = organizationEntitlementErrorCode(error);
  if (entitlementCode === ORGANIZATION_BILLING_LOCKED_ERROR_CODE) {
    return messages.billingLocked ?? 'Restore billing to unlock this feature.';
  }
  if (entitlementCode === ORGANIZATION_TIER_ERROR_CODE) {
    return messages.upgrade ?? 'Upgrade to Corporate to unlock this feature.';
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}
