export const ORGANIZATION_TIER_ERROR_CODE = 'ORGANIZATION_RBAC_REQUIRES_CORPORATE';

export function isOrganizationTierError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown; status?: unknown };
  if (candidate.code === ORGANIZATION_TIER_ERROR_CODE) return true;
  if (candidate.status === 402) return true;
  return (
    typeof candidate.message === 'string' &&
    (candidate.message.includes(ORGANIZATION_TIER_ERROR_CODE) ||
      candidate.message.includes('Upgrade to Corporate'))
  );
}

export function formatOrganizationMutationError(
  fallback: string,
  error: unknown,
  upgradeMessage = 'Upgrade to Corporate to unlock this feature.',
): string {
  if (isOrganizationTierError(error)) return upgradeMessage;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}
