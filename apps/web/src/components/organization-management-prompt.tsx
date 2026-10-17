import Link from 'next/link';
import { branchLimit, seatLimit, type OrganizationWorkspaceResponse } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import { Lock } from 'lucide-react';
import { formatSeatLimit } from '@/components/organization-presentation';

const planTierLabels: Record<OrganizationWorkspaceResponse['planTier'], string> = {
  hobby: 'Hobby',
  professional_plus: 'Professional+',
  corporate: 'Corporate',
};

export function OrganizationManagementPrompt({
  workspace,
  feature,
  branchUsage = 0,
}: {
  workspace: OrganizationWorkspaceResponse;
  feature: 'team' | 'branches';
  branchUsage?: number;
}) {
  const { organization, planTier, subscriptionState, capabilities } = workspace;
  const isBranches = feature === 'branches';
  const label = isBranches ? 'Branch' : 'Team';
  if (subscriptionState === 'locked') {
    const usage = isBranches ? branchUsage : workspace.seatUsage;
    const limit = formatSeatLimit(
      isBranches ? branchLimit(planTier, 'active') : seatLimit(planTier, 'active'),
    );
    return (
      <Card className="flex flex-col items-center gap-4 px-6 py-10 text-center shadow-none">
        <Lock className="size-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="font-sans text-lg font-medium tracking-normal text-foreground">
          {label} access is suspended
        </h2>
        <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
          {organization.name} billing is past due, so {isBranches ? 'branch' : 'team'} management is
          paused while the {planTierLabels[planTier]} plan is retained. Restore billing to
          reactivate {usage} of {limit} {isBranches ? 'branches' : 'seats'} with no data lost.
        </p>
        {capabilities.billing ? (
          <Button type="button" asChild>
            <Link href="/designer/plan-billing">Restore access</Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Contact your organization Owner to restore billing.
          </p>
        )}
      </Card>
    );
  }
  return (
    <Card className="flex flex-col items-center gap-4 px-6 py-10 text-center shadow-none">
      <Lock className="size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="font-sans text-lg font-medium tracking-normal text-foreground">
        {label} management is a Corporate feature
      </h2>
      <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
        {isBranches
          ? 'Upgrade to Corporate to create branches, add studio members, and manage branch access.'
          : 'Upgrade to Corporate to invite teammates, assign roles, and manage seats.'}
      </p>
      {capabilities.billing ? (
        <Button type="button" asChild>
          <Link href="/designer/plan-billing/subscribe?tier=corporate">View Corporate plans</Link>
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Contact your organization Owner to change plans.
        </p>
      )}
    </Card>
  );
}
