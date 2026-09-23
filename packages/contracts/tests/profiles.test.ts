import { describe, expect, it } from 'vitest';
import {
  PROFILE_FOOTPRINT_LIMITS,
  PROFILE_STAFF_COUNT_MAX,
  listTaxonomyQuerySchema,
  logoCommitRequestSchema,
  logoUploadRequestSchema,
  onboardDesignerSchema,
  onboardingDraftFieldsSchema,
  onboardingDraftSchema,
  onboardingStepSchema,
  taxonomyKindSchema,
  updateProfileSchema,
} from '../src';

describe('profile and taxonomy contracts', () => {
  it('shares the complete taxonomy enum while keeping public queries forward-compatible', () => {
    expect(taxonomyKindSchema.options).toContain(taxonomyKindSchema.enum.city);
    expect(listTaxonomyQuerySchema.safeParse({ kind: 'city' }).success).toBe(true);
    expect(listTaxonomyQuerySchema.safeParse({ kind: 'future_kind' }).success).toBe(true);
  });

  it('uses shared footprint limits and user-facing validation messages', () => {
    const tooManyCities = Array.from(
      { length: PROFILE_FOOTPRINT_LIMITS.city + 1 },
      (_, index) => `${index + 1}1111111-1111-4111-8111-111111111111`,
    );
    const result = updateProfileSchema.safeParse({
      displayName: 'M',
      foundedYear: 1899,
      cityIds: tooManyCities,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.flatten().fieldErrors).toMatchObject({
      displayName: ['Use at least 2 characters.'],
      foundedYear: ['Enter a year from 1900 onward.'],
      cityIds: [`Select up to ${PROFILE_FOOTPRINT_LIMITS.city} cities.`],
    });
  });

  it('bounds staff count consistently for onboarding and profile updates', () => {
    const staffCount = PROFILE_STAFF_COUNT_MAX + 1;
    const update = updateProfileSchema.safeParse({ staffCount });
    const onboarding = onboardDesignerSchema.safeParse({
      entityType: 'individual',
      userName: 'Designer Name',
      staffCount,
    });

    expect(update.success).toBe(false);
    expect(onboarding.success).toBe(false);
    if (update.success) return;
    expect(update.error.flatten().fieldErrors.staffCount).toEqual([
      `Enter ${PROFILE_STAFF_COUNT_MAX} or fewer.`,
    ]);
  });
});

describe('portfolio logo upload contracts', () => {
  it('allows a larger untouched source while keeping display crops at 5 MB', () => {
    expect(
      logoUploadRequestSchema.safeParse({
        contentType: 'image/png',
        contentLength: 8_000_000,
        variant: 'source',
      }).success,
    ).toBe(true);
    expect(
      logoUploadRequestSchema.safeParse({
        contentType: 'image/webp',
        contentLength: 8_000_000,
        variant: 'display',
      }).success,
    ).toBe(false);
  });

  it('accepts a profile-owned source key and rejects malformed keys', () => {
    expect(
      logoCommitRequestSchema.safeParse({
        objectKey: 'originals/logos/profile-1/display-key',
        sourceObjectKey: 'originals/logos/profile-1/source-key',
        logoCrop: { x: 12.5, y: 20, width: 50, height: 60 },
      }).success,
    ).toBe(true);
    expect(
      logoCommitRequestSchema.safeParse({
        objectKey: 'originals/logos/profile-1/display-key',
        sourceObjectKey: 'originals/logos/profile-1/nested/source-key',
      }).success,
    ).toBe(false);
  });

  it('rejects crop selections outside the untouched source bounds', () => {
    expect(
      logoCommitRequestSchema.safeParse({
        objectKey: 'originals/logos/profile-1/display-key',
        logoCrop: { x: 70, y: 0, width: 40, height: 100 },
      }).success,
    ).toBe(false);
    expect(
      logoCommitRequestSchema.safeParse({
        objectKey: 'originals/logos/profile-1/display-key',
        logoCrop: { x: 0, y: 0, width: 0, height: 100 },
      }).success,
    ).toBe(false);
  });
});

describe('onboarding draft contract (E-298)', () => {
  it('accepts a fully partial/incomplete draft without the strict onboarding gates', () => {
    // Only a step + one field, no company name, no min-length name — all fine for a draft,
    // even though the strict onboardDesignerSchema would reject this.
    const draft = onboardingDraftSchema.safeParse({
      step: 'details',
      fields: { entityType: 'company', userName: 'A' },
    });
    expect(draft.success).toBe(true);

    const strict = onboardDesignerSchema.safeParse({ entityType: 'company', userName: 'A' });
    expect(strict.success).toBe(false); // company requires companyName; name min 2
  });

  it('accepts an empty fields object (nothing entered yet)', () => {
    expect(onboardingDraftSchema.safeParse({ step: 'entity', fields: {} }).success).toBe(true);
  });

  it('strips unknown keys so a client cannot smuggle extra state into the draft', () => {
    const parsed = onboardingDraftFieldsSchema.parse({
      userName: 'Mahi',
      userId: 'attacker-supplied',
      role: 'admin',
    } as Record<string, unknown>);
    expect(parsed).not.toHaveProperty('userId');
    expect(parsed).not.toHaveProperty('role');
    expect(parsed.userName).toBe('Mahi');
  });

  it('rejects an invalid step and caps taxonomy id arrays', () => {
    expect(onboardingStepSchema.safeParse('nope').success).toBe(false);
    const tooManyScopes = Array.from(
      { length: PROFILE_FOOTPRINT_LIMITS.scope + 1 },
      (_, i) => `${i + 1}1111111-1111-4111-8111-111111111111`,
    );
    expect(onboardingDraftFieldsSchema.safeParse({ scopeIds: tooManyScopes }).success).toBe(false);
  });
});
