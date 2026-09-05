import { describe, expect, it } from 'vitest';
import {
  formatOrganizationMutationError,
  isOrganizationTierError,
} from '../../src/lib/organization-errors';

describe('organization-errors', () => {
  it('detects tier errors by code, status, and message', () => {
    expect(isOrganizationTierError({ code: 'ORGANIZATION_RBAC_REQUIRES_CORPORATE' })).toBe(true);
    expect(isOrganizationTierError({ status: 402 })).toBe(true);
    expect(isOrganizationTierError({ message: 'Upgrade to Corporate now' })).toBe(true);
    expect(isOrganizationTierError({ message: 'Access denied' })).toBe(false);
    expect(isOrganizationTierError(null)).toBe(false);
  });

  it('maps tier errors to the upgrade message and passes other messages through', () => {
    expect(
      formatOrganizationMutationError('Fallback', { status: 402 }, { upgrade: 'Custom upgrade' }),
    ).toBe('Custom upgrade');
    expect(
      formatOrganizationMutationError(
        'Fallback',
        { code: 'ORGANIZATION_BILLING_LOCKED' },
        { billingLocked: 'Custom restore' },
      ),
    ).toBe('Custom restore');
    expect(formatOrganizationMutationError('Fallback', { message: 'Nope' })).toBe('Nope');
    expect(formatOrganizationMutationError('Fallback', null)).toBe('Fallback');
  });
});
