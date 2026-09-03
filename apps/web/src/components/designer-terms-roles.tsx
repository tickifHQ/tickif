'use client';

import { useId, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  OrganizationInvitation,
  OrganizationMember,
  OrganizationMemberRole,
  OrganizationWorkspaceResponse,
} from '@repo/contracts';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/avatar';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { SelectField } from '@repo/ui/components/select-field';
import { AlertCircle, CheckCircle2, Clock3, Loader2, MoreVertical, Send, Undo } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

type AssignableRole = Exclude<OrganizationMemberRole, 'owner'>;
type Feedback = { tone: 'success' | 'error'; message: string };

const roleLabels: Record<OrganizationMemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  billing_admin: 'Billing Admin',
  member: 'Member',
  viewer: 'Viewer',
};

const roleDescriptions: Record<OrganizationMemberRole, string> = {
  owner: 'Full control of this studio, including its team and settings.',
  admin: 'Can manage the studio team and day-to-day workspace access.',
  billing_admin: 'Can manage billing, invoices, and subscription operations.',
  member: 'Can access the studio workspace without team-management controls.',
  viewer: 'Can view organization analytics without editing workspace data.',
};

const roleBadgeStyles: Record<OrganizationMemberRole, string> = {
  owner: 'bg-secondary text-secondary-foreground',
  admin: 'bg-info/10 text-info',
  billing_admin: 'bg-feature/10 text-feature',
  member: 'bg-success-lighter text-success',
  viewer: 'bg-muted text-muted-foreground',
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
const TIER_ERROR_CODE = 'ORGANIZATION_RBAC_REQUIRES_CORPORATE';
const UPGRADE_MESSAGE = 'Upgrade to Corporate to unlock team management.';

function isTierError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown; status?: unknown };
  if (candidate.code === TIER_ERROR_CODE) return true;
  if (candidate.status === 402) return true;
  return (
    typeof candidate.message === 'string' &&
    (candidate.message.includes(TIER_ERROR_CODE) ||
      candidate.message.includes('Upgrade to Corporate'))
  );
}

function formatMutationError(fallback: string, error: unknown): string {
  if (isTierError(error)) return UPGRADE_MESSAGE;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

function formatSeatLimit(limit: number): string {
  if (!Number.isFinite(limit) || limit < 0) return 'Unlimited';
  return String(limit);
}

function UpgradePrompt({
  organizationName,
  seatUsage,
  seatLimit,
  subscriptionState,
}: {
  organizationName: string;
  seatUsage: number;
  seatLimit: number;
  subscriptionState: OrganizationWorkspaceResponse['subscriptionState'];
}) {
  if (subscriptionState === 'locked') {
    return (
      <Card className="space-y-3 p-5 shadow-none">
        <p className="text-sm font-medium text-foreground">Team access is suspended</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {organizationName} billing is past due, so team management is paused while the Corporate
          plan is retained. Restore billing to reactivate {seatUsage} of{' '}
          {formatSeatLimit(seatLimit)} seats with no data lost.
        </p>
        <Button type="button" size="compact" asChild>
          <Link href="/designer/plan-billing">Restore access</Link>
        </Button>
      </Card>
    );
  }
  return (
    <Card className="space-y-3 p-5 shadow-none">
      <p className="text-sm font-medium text-foreground">Team management is a Corporate feature</p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {organizationName} is on a single-user plan. The org is Owner solo with {seatUsage} of{' '}
        {formatSeatLimit(seatLimit)} seats used. Upgrade to Corporate to invite teammates, assign
        roles, and manage seats.
      </p>
      <Button type="button" size="compact" asChild>
        <Link href="/designer/plan-billing">View Corporate plans</Link>
      </Button>
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

function RoleBadge({ role }: { role: OrganizationMemberRole }) {
  return (
    <Badge
      shape="square"
      className={`border-transparent px-2.5 py-1 text-xs leading-relaxed ${roleBadgeStyles[role]}`}
    >
      {roleLabels[role]}
    </Badge>
  );
}

function SummaryCards({ workspace }: { workspace: OrganizationWorkspaceResponse }) {
  const now = Date.now();
  const expiringSoon = workspace.invitations.filter((invitation) => {
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
          {workspace.seatUsage} of {formatSeatLimit(workspace.seatLimit)} seats used
        </p>
      </Card>

      <Card className="flex min-h-32 flex-col gap-1.5 p-5 shadow-none">
        <p data-metric="invitations" className="text-2xl leading-tight text-card-foreground">
          {workspace.invitations.length}
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
        <RoleBadge role={workspace.currentUserRole} />
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
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <MoreVertical />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Change role</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={member.role}
          onValueChange={(value) => onChangeRole(value as AssignableRole)}
        >
          {assignableRoles.map((role) => (
            <DropdownMenuRadioItem key={role.value} value={role.value}>
              {role.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
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
            <RoleBadge role={member.role} />
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

function PendingInvites({
  invitations,
  isPending,
  onRevoke,
}: {
  invitations: OrganizationInvitation[];
  isPending: boolean;
  onRevoke: (invitation: OrganizationInvitation) => void;
}) {
  return (
    <Card className="divide-y overflow-hidden shadow-xs">
      {invitations.map((invitation) => {
        const expiresInDays = daysUntil(invitation.expiresAt);
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
                    {roleLabels[invitation.role]}
                  </span>{' '}
                  · {formatDate(invitation.createdAt)}
                </p>
              </div>
            </div>
            <p
              className={`flex items-center gap-1 text-xs font-medium ${expiresInDays <= 2 ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              <Clock3 className="size-4" aria-hidden="true" />
              {expiresInDays === 0 ? 'Expired' : `Expires in ${expiresInDays} days`}
            </p>
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

  function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    const duplicate = [...activeWorkspace.members, ...activeWorkspace.invitations].some(
      (person) => person.email.toLowerCase() === normalizedEmail,
    );
    if (duplicate) {
      setFeedback({
        tone: 'error',
        message: `${normalizedEmail} is already a member or has a pending invitation.`,
      });
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await authClient.organization.inviteMember({
          email: normalizedEmail,
          role,
          organizationId: activeWorkspace.organization.id,
        });
        if (result.error) {
          setFeedback({
            tone: 'error',
            message: formatMutationError('Could not send the invitation.', result.error),
          });
          return;
        }
        setEmail('');
        setRole('member');
        setFeedback({ tone: 'success', message: `Invitation sent to ${normalizedEmail}.` });
        router.refresh();
      } catch {
        setFeedback({ tone: 'error', message: 'Could not send the invitation.' });
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
          message: `${member.name}'s role changed to ${roleLabels[nextRole]}.`,
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
            subscriptionState={workspace.subscriptionState}
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
          <SectionCard title="Pending invites">
            {workspace.invitations.length ? (
              <PendingInvites
                invitations={workspace.invitations}
                isPending={isPending}
                onRevoke={revokeInvitation}
              />
            ) : (
              <Card className="px-5 py-8 text-center text-sm text-muted-foreground shadow-xs">
                No pending invitations.
              </Card>
            )}
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
