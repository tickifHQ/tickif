import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { db, eq, schema } from '@repo/db';
import { makeUser } from '@repo/db/testing';
import type { OnboardingDraftInput } from '@repo/contracts';
import { profilesRepository } from '../../../src/modules/profiles/repository.js';

const draftInput: OnboardingDraftInput = {
  step: 'presence',
  fields: { entityType: 'individual', userName: 'Draft Owner', address: 'Bandra West, Mumbai' },
};

/** Minimal, taxonomy-free args to run the real onboarding transaction for a user. */
function onboardArgs(userId: string) {
  const suffix = userId.slice(-8);
  return {
    orgId: randomUUID(),
    orgName: `Draft Studio ${suffix}`,
    orgSlug: `draft-studio-${suffix}`,
    memberId: randomUUID(),
    teamId: randomUUID(),
    teamMemberId: randomUUID(),
    userId,
    displayName: `Draft Studio ${suffix}`,
    entityType: 'individual' as const,
    bio: null,
    address: null,
    phone: null,
    websiteUrl: null,
    googleBusinessUrl: null,
    instagramHandle: null,
    linkedinHandle: null,
    youtubeHandle: null,
    firmType: null,
    foundedYear: null,
    staffCount: null,
    footprintIds: [],
    allowAdditionalOrganization: false,
  };
}

describe('onboarding draft persistence (E-298, real DB)', () => {
  it('upserts (create then update) and reads back the caller draft', async () => {
    const user = await makeUser(); // defaults: visitor + pending
    await profilesRepository.upsertDraft(user.id, draftInput);

    let row = await profilesRepository.findDraftByUserId(user.id);
    expect(row?.step).toBe('presence');
    expect(row?.fields.userName).toBe('Draft Owner');

    // Second upsert updates the same single row (PK = userId).
    await profilesRepository.upsertDraft(user.id, {
      step: 'services',
      fields: { entityType: 'company', companyName: 'Draft Co' },
    });
    row = await profilesRepository.findDraftByUserId(user.id);
    expect(row?.step).toBe('services');
    expect(row?.fields.companyName).toBe('Draft Co');

    const count = await db
      .select({ userId: schema.onboardingDraft.userId })
      .from(schema.onboardingDraft)
      .where(eq(schema.onboardingDraft.userId, user.id));
    expect(count).toHaveLength(1);
  });

  it('deleteDraft is idempotent', async () => {
    const user = await makeUser();
    await profilesRepository.upsertDraft(user.id, draftInput);
    await profilesRepository.deleteDraft(user.id);
    await profilesRepository.deleteDraft(user.id); // no-op, must not throw
    expect(await profilesRepository.findDraftByUserId(user.id)).toBeNull();
  });

  it('the successful onboarding transaction atomically removes the draft', async () => {
    const user = await makeUser(); // visitor + pending
    await profilesRepository.upsertDraft(user.id, draftInput);
    expect(await profilesRepository.findDraftByUserId(user.id)).not.toBeNull();

    const result = await profilesRepository.onboard(onboardArgs(user.id));
    expect(result.created).toBe(true);

    // Draft is gone as part of the same transaction that created the profile/org.
    expect(await profilesRepository.findDraftByUserId(user.id)).toBeNull();
  });

  it('drafts are isolated per account', async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    await profilesRepository.upsertDraft(userA.id, {
      step: 'details',
      fields: { userName: 'Owner A' },
    });

    // B has no draft; A's draft is unaffected by reading B.
    expect(await profilesRepository.findDraftByUserId(userB.id)).toBeNull();
    const a = await profilesRepository.findDraftByUserId(userA.id);
    expect(a?.fields.userName).toBe('Owner A');
  });
});
