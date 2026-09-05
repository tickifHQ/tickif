'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  OrganizationInvitation,
  OrganizationMember,
  OrganizationMemberRole,
  OrganizationWorkspaceResponse,
} from '@repo/contracts';
import { seatLimit } from '@repo/contracts';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/avatar';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { SelectField } from '@repo/ui/components/select-field';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  MoreVertical,
  Send,
  Undo,
} from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { api } from '@/lib/api';
import { formatOrganizationMutationError } from '@/lib/organization-errors';
import {
  OrganizationRoleBadge,
  formatSeatLimit,
  organizationRoleLabels,
} from '@/components/organization-presentation';

type AssignableRole = Exclude<OrganizationMemberRole, 'owner'>;
type Feedback = { tone: 'success' | 'error'; message: string };

const roleDescriptions: Record<OrganizationMemberRole, string> = {
  owner: 'Full control of this studio, including its team and settings.',
  admin: 'Can manage the studio team and day-to-day workspace access.',
  billing_admin: 'Can manage billing, invoices, and subscription operations.',
  member: 'Can access the studio workspace without team-management controls.',
  viewer: 'Can view organization analytics without editing workspace data.',
};

const avatarStyles = [
  'bg-success text-success-foreground',
  'bg-info text-info-foreground',
  'bg-feature text-feature-lighter',
] as const;

const assignableRoles = [
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'billing_admin', label: 'Billing Admin' },
  { value: 'admin', label: 'Admin' },
] satisfies ReadonlyArray<{ value: AssignableRole; label: string }>;

// Owner is intentionally absent: Admin must not be offered Owner, and ownership
// changes only through the two-party transfer flow (E-243), never the role menu.
const UPGRADE_MESSAGE = 'Upgrade to Corporate to unlock team management.';
const RESTORE_MESSAGE = 'Restore billing to unlock team management.';

function formatMutationError(fallback: string, error: unknown): string {
  return formatOrganizationMutationError(fallback, error, {
    upgrade: UPGRADE_MESSAGE,
    billingLocked: RESTORE_MESSAGE,
  });
}

const planTierLabels: Record<OrganizationWorkspaceResponse['planTier'], string> = {
  hobby: 'Hobby',
  professional_plus: 'Professional+',
  corporate: 'Corporate',
};

function UpgradePrompt({
  organizationName,
  seatUsage,
  seatLimit: suspendedSeatLimit,
  planTier,
  subscriptionState,
  canManageBilling,
}: {
  organizationName: string;
  seatUsage: number;
  seatLimit: number;
  planTier: OrganizationWorkspaceResponse['planTier'];
  subscriptionState: OrganizationWorkspaceResponse['subscriptionState'];
  canManageBilling: boolean;
}) {
  if (subscriptionState === 'locked') {
    const restorableSeats = formatSeatLimit(seatLimit(planTier, 'active'));
    return (
      <Card className="space-y-3 p-5 shadow-none">
        <p className="text-sm font-medium text-foreground">Team access is suspended</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {organizationName} billing is past due, so team management is paused while the{' '}
          {planTierLabels[planTier]} plan is retained. Restore billing to reactivate {seatUsage} of{' '}
          {restorableSeats} seats with no data lost.
        </p>
        {canManageBilling ? (
          <Button type="button" size="compact" asChild>
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
    <Card className="space-y-3 p-5 shadow-none">
      <p className="text-sm font-medium text-foreground">Team management is a Corporate feature</p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {organizationName} is on a single-user plan. The org is Owner solo with {seatUsage} of{' '}
        {formatSeatLimit(suspendedSeatLimit)} seats used. Upgrade to Corporate to invite teammates,
        assign roles, and manage seats.
      </p>
      {canManageBilling ? (
        <Button type="button" size="compact" asChild>
          <Link href="/designer/plan-billing">View Corporate plans</Link>
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Contact your organization Owner to change plans.
        </p>
      )}
    </Card>
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'TM'
  );
}

function initialsFromEmail(email: string) {
  return (
    email
      .split('@')[0]
      ?.replace(/[^a-z0-9]/gi, '')
      .slice(0, 2)
      .toUpperCase() || 'TM'
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function daysUntil(value: string) {
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));
}

function SummaryCards({ workspace }: { workspace: OrganizationWorkspaceResponse }) {
  const displayedSeatLimit =
    workspace.subscriptionState === 'locked'
      ? seatLimit(workspace.planTier, 'active')
      : workspace.seatLimit;
  const now = Date.now();
  const pendingInvitations = workspace.invitations.filter(
    (invitation) => invitation.state === 'pending',
  );
  const expiringSoon = pendingInvitations.filter((invitation) => {
    const expiresAt = new Date(invitation.expiresAt).getTime();
    return expiresAt > now && expiresAt - now <= 2 * 86_400_000;
  }).length;

  return (
    <div className="grid gap-3.5 sm:grid-cols-3">
      <Card className="flex min-h-32 flex-col gap-1.5 p-5 shadow-none">
        <p data-metric="members" className="text-2xl leading-tight text-card-foreground">
          {workspace.seatUsage}
        </p>
        <p className="font-mono text-xs tracking-wider text-foreground-disabled uppercase">
          Active members
        </p>
        <p className="mt-auto text-xs leading-relaxed text-muted-foreground">
          {workspace.seatUsage} of {formatSeatLimit(displayedSeatLimit)} seats used
        </p>
      </Card>

      <Card className="flex min-h-32 flex-col gap-1.5 p-5 shadow-none">
        <p data-metric="invitations" className="text-2xl leading-tight text-card-foreground">
          {pendingInvitations.length}
        </p>
        <p className="font-mono text-xs tracking-wider text-foreground-disabled uppercase">
          Pending invites
        </p>
        {expiringSoon > 0 ? (
          <div className="mt-auto flex w-fit items-center gap-1 rounded-md bg-warning/10 px-2 py-1.5 text-xs font-medium text-warning">
            <AlertCircle className="size-3.5" aria-hidden="true" />
            {expiringSoon} expiring soon
          </div>
        ) : null}
      </Card>

      <Card variant="muted" className="flex min-h-32 flex-col gap-1.5 p-5 shadow-none">
        <p className="font-mono text-xs tracking-wider text-foreground-disabled uppercase">
          Your access
        </p>
        <OrganizationRoleBadge role={workspace.currentUserRole} />
        <p className="mt-auto max-w-56 text-xs leading-relaxed text-muted-foreground">
          {roleDescriptions[workspace.currentUserRole]}
        </p>
      </Card>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-muted/30 p-1">
      <h2 className="px-2 py-1.5 text-sm font-medium leading-relaxed text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function MemberActions({
  member,
  isPending,
  onChangeRole,
}: {
  member: OrganizationMember;
  isPending: boolean;
  onChangeRole: (role: AssignableRole) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={isPending}
          aria-label={`Manage ${member.name}`}
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MoreVertical className="size-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Change role</DropdownMenuLabel>
        {assignableRoles.map((role) => {
          const isActive = member.role === role.value;
          return (
            <DropdownMenuItem
              key={role.value}
              disabled={isPending}
              aria-label={`Change role to ${role.label}`}
              onSelect={() => onChangeRole(role.value)}
            >
              <span className="flex size-4 items-center justify-center" aria-hidden="true">
                {isActive ? <Check className="size-4" /> : null}
              </span>
              {role.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MembersList({
  members,
  canManage,
  isPending,
  onChangeRole,
}: {
  members: OrganizationMember[];
  canManage: boolean;
  isPending: boolean;
  onChangeRole: (member: OrganizationMember, role: AssignableRole) => void;
}) {
  return (
    <Card className="divide-y overflow-hidden shadow-xs">
      {members.map((member, index) => (
        <div key={member.id} className="flex min-h-18 items-center gap-3 px-3 py-4 sm:px-5">
          <Avatar aria-hidden="true">
            <AvatarImage src={member.image ?? undefined} alt="" />
            <AvatarFallback className={avatarStyles[index % avatarStyles.length]}>
              {initials(member.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">{member.name}</p>
              {member.isCurrentUser ? (
                <Badge
                  shape="square"
                  className="border-transparent bg-info/10 px-2 py-1 text-xs leading-none text-info uppercase"
                >
                  You
                </Badge>
              ) : null}
              {member.frozen ? (
                <Badge
                  shape="square"
                  className="border-transparent bg-muted px-2 py-1 text-xs leading-none text-muted-foreground uppercase"
                >
                  Frozen
                </Badge>
              ) : null}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {member.email} · Joined {formatDate(member.joinedAt)}
            </p>
            {member.frozen ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Frozen, restores on re-upgrade. Published work stays live.{' '}
                <Link href="/designer/plan-billing" className="text-primary underline">
                  Re-upgrade to restore
                </Link>
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <OrganizationRoleBadge role={member.role} />
            {canManage && !member.isCurrentUser && member.role !== 'owner' ? (
              <MemberActions
                member={member}
                isPending={isPending}
                onChangeRole={(role) => onChangeRole(member, role)}
              />
            ) : null}
          </div>
        </div>
      ))}
    </Card>
  );
}

const invitationStateLabels: Record<OrganizationInvitation['state'], string> = {
  pending: 'Pending',
  active: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  revoked: 'Revoked',
};

const invitationStateStyles: Record<OrganizationInvitation['state'], string> = {
  pending: 'bg-warning/10 text-warning',
  active: 'bg-success-lighter text-success',
  declined: 'bg-muted text-muted-foreground',
  expired: 'bg-destructive/10 text-destructive',
  revoked: 'bg-muted text-muted-foreground',
};

function PendingInvites({
  invitations,
  isPending,
  onResend,
  onRevoke,
}: {
  invitations: OrganizationInvitation[];
  isPending: boolean;
  onResend: (invitation: OrganizationInvitation) => void;
  onRevoke: (invitation: OrganizationInvitation) => void;
}) {
  return (
    <Card className="divide-y overflow-hidden shadow-xs">
      {invitations.map((invitation) => {
        const expiresInDays = daysUntil(invitation.expiresAt);
        const isPendingState = invitation.state === 'pending';
        const canResend = invitation.state === 'pending' || invitation.state === 'expired';
        return (
          <div
            key={invitation.id}
            className="flex flex-col gap-3 px-3 py-4 sm:px-5 lg:flex-row lg:items-center"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar aria-hidden="true">
                <AvatarFallback>{initialsFromEmail(invitation.email)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{invitation.email}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Invited as{' '}
                  <span className="font-medium text-foreground/80">
                    {organizationRoleLabels[invitation.role]}
                  </span>{' '}
                  · {formatDate(invitation.createdAt)}
                </p>
              </div>
            </div>
            <Badge
              shape="square"
              className={`border-transparent px-2 py-1 text-xs leading-none uppercase ${invitationStateStyles[invitation.state]}`}
            >
              {invitationStateLabels[invitation.state]}
            </Badge>
            {isPendingState ? (
              <p
                className={`flex items-center gap-1 text-xs font-medium ${expiresInDays <= 2 ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                <Clock3 className="size-4" aria-hidden="true" />
                {expiresInDays === 0 ? 'Expires today' : `${expiresInDays} days remaining`}
              </p>
            ) : null}
            <div className="flex shrink-0 items-center gap-2">
              {isPendingState ? (
                <Button
                  type="button"
                  variant="neutral"
                  size="compact"
                  disabled={isPending}
                  aria-label={`Revoke invitation for ${invitation.email}`}
                  onClick={() => onRevoke(invitation)}
                >
                  {isPending ? <Loader2 className="animate-spin" /> : <Undo />}
                  Revoke
                </Button>
              ) : null}
              {canResend ? (
                <Button
                  type="button"
                  variant="fancy"
                  size="compact"
                  disabled={isPending}
                  aria-label={`Resend invitation to ${invitation.email}`}
                  onClick={() => onResend(invitation)}
                >
                  {isPending ? <Loader2 className="animate-spin" /> : <Send />}
                  Resend
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

export function DesignerTermsRoles({
  workspace,
  error,
}: {
  workspace: OrganizationWorkspaceResponse | null;
  error?: string;
}) {
  const router = useRouter();
  const emailId = useId();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableRole>('member');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isPending, startTransition] = useTransition();
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    if (feedback?.tone !== 'success') return;
    feedbackTimer.current = setTimeout(() => setFeedback(null), 5000);
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, [feedback]);

  if (!workspace) {
    return (
      <div className="px-5 py-10 sm:px-8 lg:py-12">
        <div className="mx-auto max-w-4xl space-y-4">
          <h1 className="text-2xl font-medium leading-tight text-foreground">Team & Roles</h1>
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{error ?? 'Could not load your studio team.'}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  const activeWorkspace = workspace;
  const canInvite =
    workspace.canManage && workspace.capabilities.manageMembers && workspace.rbacEnabled;
  const canChangeRoles =
    workspace.canManage && workspace.capabilities.changeMemberRoles && workspace.rbacEnabled;
  const canTransfer = workspace.capabilities.transferOwnership && workspace.rbacEnabled;
  const ownerCount = workspace.members.filter((member) => member.role === 'owner').length;
  const isSoleOwner = workspace.currentUserRole === 'owner' && ownerCount <= 1;
  const transferTargets = workspace.members.filter(
    (member) =>
      !member.isCurrentUser &&
      !member.frozen &&
      (member.role === 'admin' || member.role === 'member'),
  );
  const pendingTransfer = workspace.ownershipTransfer;
  const isTransferTarget =
    pendingTransfer !== null &&
    workspace.members.some(
      (member) => member.isCurrentUser && member.id === pendingTransfer.target.memberId,
    );

  async function sendInvite(emailAddress: string, inviteRole: AssignableRole) {
    return authClient.organization.inviteMember({
      email: emailAddress,
      role: inviteRole,
      organizationId: activeWorkspace.organization.id,
    });
  }

  function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    const isMember = activeWorkspace.members.some(
      (person) => person.email.toLowerCase() === normalizedEmail,
    );
    if (isMember) {
      setFeedback({
        tone: 'error',
        message: `${normalizedEmail} is already a member of this studio.`,
      });
      return;
    }
    const pendingInvite = activeWorkspace.invitations.find(
      (invitation) =>
        invitation.email.toLowerCase() === normalizedEmail && invitation.state === 'pending',
    );

    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await sendInvite(normalizedEmail, role);
        if (result.error) {
          setFeedback({
            tone: 'error',
            message: formatMutationError('Could not send the invitation.', result.error),
          });
          return;
        }
        setEmail('');
        setRole('member');
        setFeedback({
          tone: 'success',
          message: pendingInvite
            ? `Invitation to ${normalizedEmail} was replaced with a new 7-day invite.`
            : `Invitation sent to ${normalizedEmail}.`,
        });
        router.refresh();
      } catch {
        setFeedback({ tone: 'error', message: 'Could not send the invitation.' });
      }
    });
  }

  function resendInvitation(invitation: OrganizationInvitation) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await sendInvite(invitation.email, invitation.role as AssignableRole);
        if (result.error) {
          setFeedback({
            tone: 'error',
            message: formatMutationError('Could not resend the invitation.', result.error),
          });
          return;
        }
        setFeedback({
          tone: 'success',
          message: `Invitation to ${invitation.email} was replaced with a new 7-day invite.`,
        });
        router.refresh();
      } catch {
        setFeedback({ tone: 'error', message: 'Could not resend the invitation.' });
      }
    });
  }

  function updateRole(member: OrganizationMember, nextRole: AssignableRole) {
    if (nextRole === member.role) return;
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await authClient.organization.updateMemberRole({
          memberId: member.id,
          role: nextRole,
          organizationId: activeWorkspace.organization.id,
        });
        if (result.error) {
          setFeedback({
            tone: 'error',
            message: formatMutationError('Could not update this role.', result.error),
          });
          return;
        }
        setFeedback({
          tone: 'success',
          message: `${member.name}'s role changed to ${organizationRoleLabels[nextRole]}.`,
        });
        router.refresh();
      } catch {
        setFeedback({ tone: 'error', message: 'Could not update this role.' });
      }
    });
  }

  function revokeInvitation(invitation: OrganizationInvitation) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await authClient.organization.cancelInvitation({
          invitationId: invitation.id,
        });
        if (result.error) {
          setFeedback({
            tone: 'error',
            message: formatMutationError('Could not revoke the invitation.', result.error),
          });
          return;
        }
        setFeedback({
          tone: 'success',
          message: `Invitation for ${invitation.email} was revoked.`,
        });
        router.refresh();
      } catch {
        setFeedback({ tone: 'error', message: 'Could not revoke the invitation.' });
      }
    });
  }

  function leaveOrganization() {
    setFeedback(null);
    setConfirmLeave(false);
    startTransition(async () => {
      try {
        const result = await authClient.organization.leave({
          organizationId: activeWorkspace.organization.id,
        });
        if (result.error) {
          setFeedback({
            tone: 'error',
            message: formatMutationError('Could not leave the organisation.', result.error),
          });
          return;
        }
        setFeedback({ tone: 'success', message: 'You left the organisation.' });
        router.replace('/designer/select-studio');
      } catch {
        setFeedback({ tone: 'error', message: 'Could not leave the organisation.' });
      }
    });
  }

  function startOwnershipTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transferTargetId) return;
    setFeedback(null);
    startTransition(async () => {
      try {
        const response = await api.api.orgs['ownership-transfers'].$post({
          json: { targetMemberId: transferTargetId },
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { code?: string; message?: string };
          } | null;
          setFeedback({
            tone: 'error',
            message: formatMutationError(
              'Could not start the ownership transfer.',
              body?.error ?? null,
            ),
          });
          return;
        }
        setTransferTargetId('');
        setFeedback({
          tone: 'success',
          message:
            'Ownership transfer requested. The nominee must accept, and your role becomes Admin on completion.',
        });
        router.refresh();
      } catch {
        setFeedback({ tone: 'error', message: 'Could not start the ownership transfer.' });
      }
    });
  }

  function resolveOwnershipTransfer(id: string, action: 'accept' | 'decline' | 'cancel') {
    setFeedback(null);
    startTransition(async () => {
      try {
        const response = await api.api.orgs['ownership-transfers'][':id'][action].$post({
          param: { id },
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { code?: string; message?: string };
          } | null;
          setFeedback({
            tone: 'error',
            message: formatMutationError(
              'Could not update the ownership transfer.',
              body?.error ?? null,
            ),
          });
          return;
        }
        const messages = {
          accept:
            'Ownership transfer accepted. The previous Owner is now an Admin with operational access.',
          decline: 'Ownership transfer declined. The studio team has been notified.',
          cancel: 'Ownership transfer request cancelled.',
        } as const;
        setFeedback({ tone: 'success', message: messages[action] });
        router.refresh();
      } catch {
        setFeedback({ tone: 'error', message: 'Could not update the ownership transfer.' });
      }
    });
  }

  return (
    <div className="px-5 py-10 sm:px-8 lg:py-12">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="space-y-1.5">
          <h1 className="text-2xl font-medium leading-tight text-foreground">Team & Roles</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your studio&apos;s people, access levels, and pending invites for{' '}
            <span className="font-medium text-foreground">{workspace.organization.name}</span>.
          </p>
        </header>

        <SummaryCards workspace={workspace} />

        {!workspace.rbacEnabled ? (
          <UpgradePrompt
            organizationName={workspace.organization.name}
            seatUsage={workspace.seatUsage}
            seatLimit={workspace.seatLimit}
            planTier={workspace.planTier}
            subscriptionState={workspace.subscriptionState}
            canManageBilling={workspace.capabilities.billing}
          />
        ) : null}

        {canInvite ? (
          <SectionCard title="Invite a teammate">
            <form
              className="grid gap-3 rounded-xl border bg-card p-3 shadow-xs sm:grid-cols-[minmax(0,1.7fr)_minmax(12rem,1fr)_auto] sm:items-end"
              onSubmit={submitInvitation}
            >
              <div className="space-y-1">
                <Label htmlFor={emailId} className="text-sm font-medium text-muted-foreground">
                  Work email
                </Label>
                <Input
                  id={emailId}
                  type="email"
                  autoComplete="email"
                  placeholder="teammate@studio.com"
                  required
                  className="h-8 px-2 text-sm"
                  value={email}
                  disabled={isPending}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <SelectField
                label="Role"
                value={role}
                placeholder="Select a role"
                options={assignableRoles}
                className="space-y-1 [&_label]:text-muted-foreground [&_select]:h-8 [&_select]:px-2 [&_select]:py-1 [&_select]:pr-8"
                disabled={isPending}
                onValueChange={(value) => setRole(value as AssignableRole)}
              />
              <Button type="submit" size="compact" disabled={isPending}>
                {isPending ? <Loader2 className="animate-spin" /> : <Send />}
                Send invite
              </Button>
            </form>
            <p className="px-2 pt-2 text-xs leading-relaxed text-muted-foreground">
              Invites are email only. Inviting an email with a pending invite replaces it with a new
              7-day invite instead of creating a duplicate.
            </p>
          </SectionCard>
        ) : null}

        {feedback ? (
          <Alert
            variant={feedback.tone === 'error' ? 'destructive' : 'success'}
            role={feedback.tone === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            {feedback.tone === 'error' ? (
              <AlertCircle aria-hidden="true" />
            ) : (
              <CheckCircle2 aria-hidden="true" />
            )}
            <AlertDescription>{feedback.message}</AlertDescription>
          </Alert>
        ) : null}

        <SectionCard title="Members">
          <MembersList
            members={workspace.members}
            canManage={canChangeRoles}
            isPending={isPending}
            onChangeRole={updateRole}
          />
        </SectionCard>

        {canInvite ? (
          <SectionCard title="Invitations">
            {workspace.invitations.length ? (
              <PendingInvites
                invitations={workspace.invitations}
                isPending={isPending}
                onResend={resendInvitation}
                onRevoke={revokeInvitation}
              />
            ) : (
              <Card className="px-5 py-8 text-center text-sm text-muted-foreground shadow-xs">
                No invitations yet.
              </Card>
            )}
          </SectionCard>
        ) : null}

        {canTransfer || pendingTransfer ? (
          <SectionCard title="Ownership transfer">
            {pendingTransfer ? (
              <Card className="space-y-3 p-5 shadow-none">
                <p className="text-sm font-medium text-foreground">
                  Transfer to {pendingTransfer.target.name} is pending
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {pendingTransfer.initiator.name} nominated {pendingTransfer.target.name} (
                  {pendingTransfer.target.email}) as Owner. The nominee must explicitly accept or
                  decline. On acceptance the previous Owner becomes an Admin and keeps operational
                  access.
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Expires {formatDate(pendingTransfer.expiresAt)}.
                </p>
                <div className="flex flex-wrap gap-2">
                  {isTransferTarget ? (
                    <>
                      <Button
                        type="button"
                        size="compact"
                        disabled={isPending}
                        onClick={() => resolveOwnershipTransfer(pendingTransfer.id, 'accept')}
                      >
                        {isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                        Accept transfer
                      </Button>
                      <Button
                        type="button"
                        variant="neutral"
                        size="compact"
                        disabled={isPending}
                        onClick={() => resolveOwnershipTransfer(pendingTransfer.id, 'decline')}
                      >
                        Decline
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="neutral"
                      size="compact"
                      disabled={isPending}
                      onClick={() => resolveOwnershipTransfer(pendingTransfer.id, 'cancel')}
                    >
                      {isPending ? <Loader2 className="animate-spin" /> : <Undo />}
                      Cancel request
                    </Button>
                  )}
                </div>
              </Card>
            ) : transferTargets.length ? (
              <form
                className="grid gap-3 rounded-xl border bg-card p-3 shadow-xs sm:grid-cols-[minmax(0,1.7fr)_auto] sm:items-end"
                onSubmit={startOwnershipTransfer}
              >
                <SelectField
                  label="Nominate an Admin or Member as Owner"
                  value={transferTargetId}
                  placeholder="Select a teammate"
                  options={transferTargets.map((member) => ({
                    value: member.id,
                    label: `${member.name} (${organizationRoleLabels[member.role]})`,
                  }))}
                  disabled={isPending}
                  onValueChange={setTransferTargetId}
                />
                <Button type="submit" size="compact" disabled={isPending || !transferTargetId}>
                  {isPending ? <Loader2 className="animate-spin" /> : <Send />}
                  Request transfer
                </Button>
              </form>
            ) : (
              <Card className="px-5 py-8 text-center text-sm text-muted-foreground shadow-xs">
                No eligible Admin or Member to nominate.
              </Card>
            )}
            <p className="px-2 pt-2 text-xs leading-relaxed text-muted-foreground">
              Ownership transfer is a two-party handshake. Your role becomes Admin on completion.
            </p>
          </SectionCard>
        ) : null}

        <SectionCard title="Leave organisation">
          {isSoleOwner ? (
            <Card className="space-y-2 p-5 shadow-none">
              <p className="text-sm font-medium text-foreground">
                Transfer ownership or delete the organisation first
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                You are the sole Owner, so leaving now would orphan this studio. Nominate another
                Owner above before leaving.
              </p>
            </Card>
          ) : confirmLeave ? (
            <Card className="space-y-3 p-5 shadow-none">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Leaving removes your studio access immediately. Published projects stay live.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="compact"
                  variant="destructive"
                  disabled={isPending}
                  onClick={leaveOrganization}
                >
                  {isPending ? <Loader2 className="animate-spin" /> : null}
                  Confirm leave
                </Button>
                <Button
                  type="button"
                  size="compact"
                  variant="neutral"
                  disabled={isPending}
                  onClick={() => setConfirmLeave(false)}
                >
                  Keep my access
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="space-y-3 p-5 shadow-none">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Leaving removes your studio access immediately. Published projects stay live.
              </p>
              <Button
                type="button"
                size="compact"
                variant="neutral"
                disabled={isPending}
                onClick={() => setConfirmLeave(true)}
              >
                Leave organisation
              </Button>
            </Card>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
