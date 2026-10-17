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
import { rbacEnabled, seatLimit } from '@repo/contracts';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/avatar';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/components/tabs';
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
import { SearchableSelect } from '@repo/ui/components/searchable-select';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  MoreVertical,
  Search,
  UserPlus,
  Send,
  Undo,
} from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { api } from '@/lib/api';
import { formatOrganizationMutationError } from '@/lib/organization-errors';
import { formatSeatLimit, organizationRoleLabels } from '@/components/organization-presentation';

import { OrganizationManagementPrompt } from '@/components/organization-management-prompt';
import { ListPagination } from '@/components/list-pagination';
import { useOrganizationPage } from '@/lib/use-organization-page';
import { useOrganizationOptions } from '@/lib/use-organization-options';
import {
  loadOrganizationMembersPage,
  loadOrganizationInvitationsPage,
} from '@/lib/organization-list-api';

type AssignableRole = Exclude<OrganizationMemberRole, 'owner'>;
type Feedback = { tone: 'success' | 'error'; message: string };

const loadTransferMembers: typeof loadOrganizationMembersPage = (query, signal) =>
  loadOrganizationMembersPage(query, signal, { transferEligible: true });

const roleDescriptions: Record<OrganizationMemberRole, string> = {
  owner: 'Full control of this studio, including its team and settings.',
  admin: 'Can manage the studio team and day-to-day workspace access.',
  billing_admin: 'Can manage billing, invoices, and subscription operations.',
  member: 'Can access the studio workspace without team-management controls.',
  viewer: 'Can view organization analytics without editing workspace data.',
};

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
          {workspace.pendingInvitationCount ?? pendingInvitations.length}
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
        <Badge variant={workspace.currentUserRole === 'owner' ? 'secondary' : 'outline'}>
          {organizationRoleLabels[workspace.currentUserRole]}
        </Badge>
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
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Joined date</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.length ? (
            members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8" aria-hidden="true">
                      <AvatarImage src={member.image ?? undefined} alt="" />
                      <AvatarFallback>{initials(member.name)}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{member.name}</span>
                    {member.isCurrentUser ? (
                      <Badge variant="outline" size="compact">
                        You
                      </Badge>
                    ) : null}
                    {member.frozen ? (
                      <Badge variant="secondary" size="compact">
                        Frozen
                      </Badge>
                    ) : null}
                  </div>
                  {member.frozen ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Frozen, restores on re-upgrade. Published work stays live.{' '}
                      <Link href="/designer/plan-billing" className="text-primary underline">
                        Re-upgrade to restore
                      </Link>
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">{member.email}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(member.joinedAt)}
                </TableCell>
                <TableCell>
                  <Badge variant={member.role === 'owner' ? 'secondary' : 'outline'}>
                    {organizationRoleLabels[member.role]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {canManage && !member.isCurrentUser && member.role !== 'owner' ? (
                    <MemberActions
                      member={member}
                      isPending={isPending || member.frozen}
                      onChangeRole={(role) => onChangeRole(member, role)}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                No members found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

const invitationStateLabels: Record<OrganizationInvitation['state'], string> = {
  pending: 'Pending',
  active: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  revoked: 'Revoked',
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
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Invited date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.length ? (
            invitations.map((invitation) => {
              const expiresInDays = daysUntil(invitation.expiresAt);
              const isPendingState = invitation.state === 'pending';
              const canResend = isPendingState || invitation.state === 'expired';
              return (
                <TableRow key={invitation.id}>
                  <TableCell className="font-medium">{invitation.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{organizationRoleLabels[invitation.role]}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(invitation.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={isPendingState ? 'secondary' : 'outline'}>
                      {invitationStateLabels[invitation.state]}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {isPendingState ? (
                      <span className="flex items-center gap-1">
                        <Clock3 className="size-4" aria-hidden="true" />
                        {expiresInDays === 0 ? 'Expires today' : `${expiresInDays} days remaining`}
                      </span>
                    ) : (
                      formatDate(invitation.expiresAt)
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {isPendingState ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="compact"
                          disabled={isPending}
                          aria-label={`Revoke invitation for ${invitation.email}`}
                          onClick={() => onRevoke(invitation)}
                        >
                          Revoke
                        </Button>
                      ) : null}
                      {canResend ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="compact"
                          disabled={isPending}
                          aria-label={`Resend invitation to ${invitation.email}`}
                          onClick={() => onResend(invitation)}
                        >
                          Resend
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                No invitations found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function DesignerTermsRoles({
  workspace,
  error,
  serverLists = false,
}: {
  workspace: OrganizationWorkspaceResponse | null;
  error?: string;
  serverLists?: boolean;
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('members');
  const [listRevision, setListRevision] = useState(0);
  const canLoadTeamLists =
    !!workspace &&
    workspace.rbacEnabled &&
    rbacEnabled(workspace.planTier, workspace.subscriptionState);
  const members = useOrganizationPage<OrganizationMember>({
    initialData: {
      items: workspace?.members ?? [],
      page: 1,
      limit: 12,
      total: workspace?.members.length ?? 0,
      totalPages: Math.max(1, Math.ceil((workspace?.members.length ?? 0) / 12)),
    },
    load: loadOrganizationMembersPage,
    enabled: serverLists && canLoadTeamLists,
    refreshKey: listRevision,
  });
  const invitations = useOrganizationPage<OrganizationInvitation>({
    initialData: {
      items: workspace?.invitations ?? [],
      page: 1,
      limit: 12,
      total: workspace?.invitations.length ?? 0,
      totalPages: Math.max(1, Math.ceil((workspace?.invitations.length ?? 0) / 12)),
    },
    load: loadOrganizationInvitationsPage,
    enabled:
      serverLists &&
      canLoadTeamLists &&
      !!workspace?.canManage &&
      !!workspace?.capabilities.manageMembers,
    refreshKey: listRevision,
  });
  const transferMembers = useOrganizationOptions<OrganizationMember>({
    initialItems:
      workspace?.members.filter(
        (member) =>
          !member.isCurrentUser &&
          !member.frozen &&
          (member.role === 'admin' || member.role === 'member'),
      ) ?? [],
    load: loadTransferMembers,
    enabled:
      serverLists &&
      canLoadTeamLists &&
      !!workspace?.capabilities.transferOwnership &&
      !workspace?.ownershipTransfer,
    refreshKey: listRevision,
  });

  function refreshWorkspace() {
    transferMembers.setSearch('');
    setListRevision((value) => value + 1);
    setTransferTargetId('');
    router.refresh();
  }

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
        <div className="mx-auto max-w-6xl space-y-4">
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
  const hasTeamManagement =
    workspace.rbacEnabled && rbacEnabled(workspace.planTier, workspace.subscriptionState);
  const canInvite =
    workspace.canManage && workspace.capabilities.manageMembers && hasTeamManagement;
  const canChangeRoles =
    workspace.canManage && workspace.capabilities.changeMemberRoles && hasTeamManagement;
  const canTransfer = workspace.capabilities.transferOwnership && hasTeamManagement;
  const ownerCount =
    workspace.ownerCount ?? workspace.members.filter((member) => member.role === 'owner').length;
  const isSoleOwner = workspace.currentUserRole === 'owner' && ownerCount <= 1;
  const transferTargets = transferMembers.items;
  const pendingTransfer = workspace.ownershipTransfer;
  const isTransferTarget =
    pendingTransfer !== null &&
    (workspace.currentUserMemberId === pendingTransfer.target.memberId ||
      workspace.members.some(
        (member) => member.isCurrentUser && member.id === pendingTransfer.target.memberId,
      ));

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

    const isMember = [...activeWorkspace.members, ...members.data.items].some(
      (person) => person.email.toLowerCase() === normalizedEmail,
    );
    if (isMember) {
      setFeedback({
        tone: 'error',
        message: `${normalizedEmail} is already a member of this studio.`,
      });
      return;
    }
    const pendingInvite = [...activeWorkspace.invitations, ...invitations.data.items].find(
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
        setInviteOpen(false);
        setFeedback({
          tone: 'success',
          message: pendingInvite
            ? `Invitation to ${normalizedEmail} was replaced with a new 7-day invite.`
            : `Invitation created for ${normalizedEmail}.`,
        });
        refreshWorkspace();
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
        refreshWorkspace();
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
        refreshWorkspace();
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
        refreshWorkspace();
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
    if (
      !transferTargetId ||
      transferMembers.isLoading ||
      transferMembers.error ||
      !transferTargets.some((member) => member.id === transferTargetId)
    )
      return;
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
        refreshWorkspace();
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
        refreshWorkspace();
      } catch {
        setFeedback({ tone: 'error', message: 'Could not update the ownership transfer.' });
      }
    });
  }

  return (
    <div className="px-5 py-10 sm:px-8 lg:py-12">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="space-y-1.5">
          <h1 className="text-2xl font-medium leading-tight text-foreground">Team & Roles</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Manage your studio&apos;s members, roles, and invitations.
          </p>
        </header>

        <SummaryCards workspace={workspace} />

        {!hasTeamManagement ? (
          <OrganizationManagementPrompt workspace={workspace} feature="team" />
        ) : null}

        {hasTeamManagement ? (
          <>
            {feedback && !inviteOpen ? (
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

            <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
              <TabsList variant="line" aria-label="Team management">
                <TabsTrigger value="members">Members</TabsTrigger>
                {canInvite ? <TabsTrigger value="invitations">Invitations</TabsTrigger> : null}
              </TabsList>
              <TabsContent value="members" className="space-y-4">
                <h2 className="sr-only">Members</h2>
                <div className="relative w-full sm:max-w-sm">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    type="search"
                    aria-label="Search members"
                    maxLength={200}
                    placeholder="Search members by name or email"
                    className="pl-9"
                    value={members.search}
                    onChange={(event) => members.setSearch(event.target.value)}
                  />
                </div>
                {members.error ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {members.error}
                      <Button variant="ghost" size="compact" onClick={members.reload}>
                        Retry
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : null}
                <div aria-busy={members.isLoading}>
                  {members.isLoading ? (
                    <p role="status" className="mb-3 text-sm text-muted-foreground">
                      Loading members…
                    </p>
                  ) : null}
                  <MembersList
                    members={members.data.items}
                    canManage={canChangeRoles}
                    isPending={isPending || members.isLoading}
                    onChangeRole={updateRole}
                  />
                </div>
                <ListPagination
                  page={members.data.page}
                  totalPages={members.data.totalPages}
                  limit={members.data.limit}
                  total={members.data.total}
                  itemName="member"
                  disabled={members.isLoading}
                  onPageChange={members.setPage}
                  onLimitChange={members.setLimit}
                />
              </TabsContent>
              {canInvite ? (
                <TabsContent value="invitations" className="space-y-4">
                  <h2 className="sr-only">Invitations</h2>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative w-full sm:max-w-sm">
                      <Search
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      />
                      <Input
                        type="search"
                        aria-label="Search invitations"
                        maxLength={200}
                        placeholder="Search invitations by email"
                        className="pl-9"
                        value={invitations.search}
                        onChange={(event) => invitations.setSearch(event.target.value)}
                      />
                    </div>
                    <Button size="compact" onClick={() => setInviteOpen(true)} disabled={isPending}>
                      <UserPlus aria-hidden="true" />
                      Invite a teammate
                    </Button>
                  </div>
                  {invitations.error ? (
                    <Alert variant="destructive">
                      <AlertDescription>
                        {invitations.error}
                        <Button variant="ghost" size="compact" onClick={invitations.reload}>
                          Retry
                        </Button>
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <div aria-busy={invitations.isLoading}>
                    {invitations.isLoading ? (
                      <p role="status" className="mb-3 text-sm text-muted-foreground">
                        Loading invitations…
                      </p>
                    ) : null}
                    <PendingInvites
                      invitations={invitations.data.items}
                      isPending={isPending || invitations.isLoading}
                      onResend={resendInvitation}
                      onRevoke={revokeInvitation}
                    />
                  </div>
                  <ListPagination
                    page={invitations.data.page}
                    totalPages={invitations.data.totalPages}
                    limit={invitations.data.limit}
                    total={invitations.data.total}
                    itemName="invitation"
                    disabled={invitations.isLoading}
                    onPageChange={invitations.setPage}
                    onLimitChange={invitations.setLimit}
                  />
                </TabsContent>
              ) : null}
            </Tabs>
            {canInvite ? (
              <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite a teammate</DialogTitle>
                    <DialogDescription>
                      Invite someone to join your studio by email.
                    </DialogDescription>
                  </DialogHeader>
                  <form className="space-y-4" onSubmit={submitInvitation}>
                    <div className="space-y-1">
                      <Label
                        htmlFor={emailId}
                        className="text-sm font-medium text-muted-foreground"
                      >
                        Work email
                      </Label>
                      <Input
                        id={emailId}
                        type="email"
                        autoComplete="email"
                        placeholder="teammate@studio.com"
                        required

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

                      disabled={isPending}
                      onValueChange={(value) => setRole(value as AssignableRole)}
                    />
                    <Button type="submit" size="compact" disabled={isPending}>
                      {isPending ? <Loader2 className="animate-spin" /> : <Send />}
                      Send invite
                    </Button>
                  </form>
                  <p className="px-2 pt-2 text-xs leading-relaxed text-muted-foreground">
                    Invites are email only. Inviting an email with a pending invite replaces it with
                    a new 7-day invite instead of creating a duplicate.
                  </p>

                  {feedback?.tone === 'error' ? (
                    <Alert variant="destructive">
                      <AlertDescription>{feedback.message}</AlertDescription>
                    </Alert>
                  ) : null}
                </DialogContent>
              </Dialog>
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
                      {pendingTransfer.target.email}) as Owner. The nominee must explicitly accept
                      or decline. On acceptance the previous Owner becomes an Admin and keeps
                      operational access.
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
                ) : (
                  <form
                    className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                    onSubmit={startOwnershipTransfer}
                  >
                    <SearchableSelect
                      key={listRevision}
                      label="Nominate an Admin or Member as Owner"
                      placeholder="Search or select a teammate"
                      value={transferTargetId}
                      options={transferTargets.map((member) => ({
                        value: member.id,
                        label: `${member.name} (${organizationRoleLabels[member.role]})`,
                      }))}
                      onValueChange={setTransferTargetId}
                      onSearchChange={(query) => {
                        transferMembers.setSearch(query);
                        setTransferTargetId('');
                      }}
                      disabled={isPending}
                      isLoading={transferMembers.isLoading}
                      error={transferMembers.error}
                      onRetry={transferMembers.reload}
                      hasMore={transferMembers.hasMore}
                      onLoadMore={transferMembers.loadMore}
                      emptyLabel="No eligible Admin or Member to nominate."
                    />
                    <Button
                      type="submit"
                      disabled={
                        isPending ||
                        transferMembers.isLoading ||
                        !!transferMembers.error ||
                        !transferTargetId ||
                        !transferTargets.some((member) => member.id === transferTargetId)
                      }
                    >
                      {isPending ? <Loader2 className="animate-spin" /> : <Send />}
                      Request transfer
                    </Button>
                  </form>
                )}
                <p className="px-2 pt-2 text-xs leading-relaxed text-muted-foreground">
                  Ownership transfer is a two-party handshake. Your role becomes Admin on
                  completion.
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
                    You are the sole Owner, so leaving now would orphan this studio. Nominate
                    another Owner above before leaving.
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
          </>
        ) : null}
      </div>
    </div>
  );
}
