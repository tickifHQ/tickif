'use client';

import { useRouter } from 'next/navigation';
import type { OnboardDesignerInput, OnboardDesignerResponse } from '@repo/contracts';
import { onboardDesignerResponseSchema } from '@repo/contracts';
import { DesignerOnboarding } from '@/components/designer-onboarding';
import { api } from '@/lib/api';

/**
 * Dedicated full-page organisation creation flow (E-249 decision): reuses
 * the complete designer metadata contract and the transactional
 * organisation-creation endpoint, then selects the new organisation before
 * landing on its dashboard.
 */
export function NewOrganizationForm({
  signedInName,
  signedInAs,
}: {
  signedInName: string | null;
  signedInAs: string | null;
}) {
  const router = useRouter();

  async function submitAdditionalOrganization(
    input: OnboardDesignerInput,
  ): Promise<{ data: OnboardDesignerResponse; created: boolean }> {
    const created = await api.api.orgs.$post({ json: input });
    if (!created.ok) {
      throw new Error('Could not create the organisation. Please try again.');
    }
    const parsed = onboardDesignerResponseSchema.safeParse(await created.json());
    if (!parsed.success) {
      throw new Error('Could not create the organisation. Please try again.');
    }

    // The create endpoint selects and persists the new organization context in
    // the same request. Repeating that mutation here adds a failure path where
    // retrying the form would create a duplicate organization.
    router.refresh();
    return { data: parsed.data, created: created.status === 201 };
  }

  return (
    <DesignerOnboarding
      signedInName={signedInName}
      signedInAs={signedInAs}
      onSubmitOnboarding={submitAdditionalOrganization}
    />
  );
}
