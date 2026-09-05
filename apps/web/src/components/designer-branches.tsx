'use client';

import { useId, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  OrganizationBranchesResponse,
  OrganizationMemberRole,
  OrganizationWorkspaceResponse,
} from '@repo/contracts';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Avatar, AvatarFallback } from '@repo/ui/components/avatar';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/dialog';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { SelectField } from '@repo/ui/components/select-field';
import {
  AlertCircle,
  ArrowLeftRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Loader2,
  Pencil,
  Send,
  SquareUser,
  Trash2,
  UserX,
} from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { api } from '@/lib/api';
import { formatOrganizationMutationError } from '@/lib/organization-errors';
import { RoleBadge, formatSeatLimit } from '@/components/designer-terms-roles';

type Feedback = { tone: 'success' | 'error'; message: string };

type AssignableRole = Exclude<OrganizationMemberRole, 'owner'>;

function formatMutationError(fallback: string, error: unknown): string {
  return formatOrganizationMutationError(
    fallback,
    error,
    'Upgrade to Corporate to unlock branches.',
  );
}

function memberInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'TM'
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

export function DesignerBranches({
  branches,
  workspace,
  error,
}: {
  branches: OrganizationBranchesResponse | null;
  workspace: OrganizationWorkspaceResponse | null;
  error?: string;
}) {
  const router = useRouter();
  const createId = useId();
  const inviteId = useId();
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AssignableRole>('member');
  const [inviteBranchId, setInviteBranchId] = useState('');
  const [assignBranchId, setAssignBranchId] = useState('');
  const [assignMemberId, setAssignMemberId] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [expandedBranches, setExpandedBranches] = useState<Record<string, boolean>>({});
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [confirmUnassignKey, setConfirmUnassignKey] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Record<string, string>>({});
  const [removeDialogBranch, setRemoveDialogBranch] = useState<{
    id: string;
    name: string;
    projectCount: number;
  } | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!branches || !workspace) {
    return (
      <div className="px-5 py-10 sm:px-8 lg:py-12">
        <div className="mx-auto max-w-4xl space-y-4">
          <h1 className="text-2xl font-medium leading-tight text-foreground">Branches</h1>
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{error ?? 'Could not load your branches.'}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  const canManageBranches = workspace.canManage && workspace.rbacEnabled;
  const canRemoveBranches = workspace.currentUserRole === 'owner' && workspace.rbacEnabled;
  const activeBranches = branches.branches.filter((branch) => !branch.frozen);
  const frozenListedBranches = branches.branches.filter((branch) => branch.frozen);
  const branchOptions = activeBranches.map((branch) => ({
    value: branch.id,
    label: branch.name,
  }));
  const organizationId = workspace.organization.id;
  const orgMembers = workspace.members;
  const assignableMembers = orgMembers.filter((member) => !member.frozen);

  function refresh() {
    router.refresh();
  }

  function copyProfileLink(profileSlug: string) {
    const url = `${window.location.origin}/d/${profileSlug}`;
    const done = () => {
      setCopiedSlug(profileSlug);
      window.setTimeout(() => {
        setCopiedSlug((current) => (current === profileSlug ? null : current));
      }, 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done, () => {
        setFeedback({ tone: 'error', message: 'Could not copy the link.' });
      });
      return;
    }
    setFeedback({ tone: 'error', message: 'Copy is not supported in this browser.' });
  }

  function createBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await authClient.organization.createTeam({
          name: trimmed,
          organizationId,
        });
        if (result.error) {
          setFeedback({
            tone: 'error',
            message: formatMutationError('Could not create the branch.', result.error),
          });
          return;
        }
        setName('');
        setFeedback({ tone: 'success', message: `Branch ${trimmed} created.` });
        refresh();
      } catch {
        setFeedback({ tone: 'error', message: 'Could not create the branch.' });
      }
    });
  }

  function renameBranch(branchId: string) {
    const trimmed = editingName.trim();
    if (!trimmed) return;
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await authClient.organization.updateTeam({
          teamId: branchId,
          data: { name: trimmed },
        });
        if (result.error) {
          setFeedback({
            tone: 'error',
            message: formatMutationError('Could not rename the branch.', result.error),
          });
          return;
        }
        setEditingId(null);
        setEditingName('');
        setFeedback({ tone: 'success', message: 'Branch renamed.' });
        refresh();
      } catch {
        setFeedback({ tone: 'error', message: 'Could not rename the branch.' });
      }
    });
  }

  function unassignMember(teamId: string, memberUserId: string, memberName: string) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await authClient.organization.removeTeamMember({
          teamId,
          userId: memberUserId,
        });
        if (result.error) {
          setFeedback({
            tone: 'error',
            message: formatMutationError('Could not remove the member.', result.error),
          });
          return;
        }
        setFeedback({
          tone: 'success',
          message: `${memberName} removed from the branch. Their studio membership is unchanged.`,
        });
        refresh();
      } catch {
        setFeedback({ tone: 'error', message: 'Could not remove the member.' });
      }
    });
  }
  function removeBranch(branchId: string, branchName: string) {
    const targetBranchId = removeTarget[branchId];
    if (!targetBranchId || targetBranchId === branchId) {
      setRemoveError('Select a different active branch to receive the projects.');
      return;
    }
    setFeedback(null);
    setRemoveError(null);
    startTransition(async () => {
      try {
        const response = await api.api.orgs.branches[':branchId'].$delete({
          param: { branchId },
          json: { targetBranchId },
        });
        const body = (await response.json().catch(() => null)) as {
          error?: { code?: string; message?: string };
          reassignedProjectCount?: number;
        } | null;
        if (!response.ok) {
          const message = formatMutationError('Could not remove the branch.', body?.error ?? null);
          setRemoveError(message);
          setFeedback({ tone: 'error', message });
          return;
        }
        setRemoveDialogBranch(null);
        setRemoveTarget((previous) => {
          const next = { ...previous };
          delete next[branchId];
          return next;
        });
        const moved =
          body && typeof body.reassignedProjectCount === 'number'
            ? ` ${body.reassignedProjectCount} ${body.reassignedProjectCount === 1 ? 'project' : 'projects'} moved.`
            : '';
        setFeedback({ tone: 'success', message: `Branch ${branchName} removed.${moved}` });
        refresh();
      } catch {
        setFeedback({ tone: 'error', message: 'Could not remove the branch.' });
      }
    });
  }

  function openDashboard(teamId: string) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const response = await api.api.orgs.context.$put({
          json: { kind: 'organization', organizationId, teamId },
        });
        if (!response.ok) {
          setFeedback({ tone: 'error', message: 'Could not open the branch dashboard.' });
          return;
        }
        router.push('/designer/dashboard');
        router.refresh();
      } catch {
        setFeedback({ tone: 'error', message: 'Could not open the branch dashboard.' });
      }
    });
  }

  function inviteIntoBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!normalizedEmail || !inviteBranchId) return;
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await authClient.organization.inviteMember({
          email: normalizedEmail,
          role: inviteRole,
          organizationId,
          teamId: inviteBranchId,
        });
        if (result.error) {
          setFeedback({
            tone: 'error',
            message: formatMutationError('Could not send the invitation.', result.error),
          });
          return;
        }
        setInviteEmail('');
        setFeedback({ tone: 'success', message: `Invitation sent to ${normalizedEmail}.` });
        refresh();
      } catch {
        setFeedback({ tone: 'error', message: 'Could not send the invitation.' });
      }
    });
  }

  function assignMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignBranchId || !assignMemberId) return;
    const member = orgMembers.find((candidate) => candidate.userId === assignMemberId);
    if (!member) return;
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await authClient.organization.addTeamMember({
          teamId: assignBranchId,
          userId: member.userId,
        });
        if (result.error) {
          setFeedback({
            tone: 'error',
            message: formatMutationError('Could not assign the member.', result.error),
          });
          return;
        }
        setAssignBranchId('');
        setAssignMemberId('');
        setFeedback({ tone: 'success', message: `${member.name} assigned to the branch.` });
        refresh();
      } catch {
        setFeedback({ tone: 'error', message: 'Could not assign the member.' });
      }
    });
  }

  return (
    <div className="px-5 py-10 sm:px-8 lg:py-12">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="space-y-1.5">
          <h1 className="text-2xl font-medium leading-tight text-foreground">Branches</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Each branch is its own public presence under{' '}
            <span className="font-medium text-foreground">{workspace.organization.name}</span>.
          </p>
        </header>

        {!workspace.rbacEnabled ? (
          <Card className="space-y-3 p-5 shadow-none">
            <p className="text-sm font-medium text-foreground">Branches are a Corporate feature</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {workspace.organization.name} is on a single-user plan with 1 studio. Upgrade to
              Corporate for unlimited branches and branch dashboards.
            </p>
            <Button type="button" size="compact" asChild>
              <Link href="/designer/plan-billing">View Corporate plans</Link>
            </Button>
          </Card>
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

        <SectionCard
          title={`Branches (${branches.branchUsage} of ${formatSeatLimit(branches.branchLimit)} used)`}
        >
          <div className="space-y-3 rounded-xl border bg-card p-3 shadow-xs">
            {branches.branches.map((branch) => {
              const isActive = branch.id === branches.activeTeamId;
              const isEditing = editingId === branch.id;
              return (
                <Card key={branch.id} className="space-y-3 p-4 shadow-none">
                  <div className="flex flex-wrap items-center gap-2">
                    <Building2
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    {isEditing ? (
                      <form
                        className="flex min-w-0 flex-1 items-center gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          renameBranch(branch.id);
                        }}
                      >
                        <Input
                          aria-label={`Branch name for ${branch.name}`}
                          value={editingName}
                          disabled={isPending}
                          onChange={(event) => setEditingName(event.target.value)}
                          className="h-8 px-2 text-sm"
                        />
                        <Button
                          type="submit"
                          size="compact"
                          disabled={isPending || !editingName.trim()}
                        >
                          {isPending ? <Loader2 className="animate-spin" /> : null}
                          Save
                        </Button>
                        <Button
                          type="button"
                          variant="neutral"
                          size="compact"
                          disabled={isPending}
                          onClick={() => {
                            setEditingId(null);
                            setEditingName('');
                          }}
                        >
                          Cancel
                        </Button>
                      </form>
                    ) : (
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {branch.name}
                      </p>
                    )}
                    {canManageBranches && !isEditing && !branch.frozen ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        disabled={isPending}
                        title="Edit name"
                        aria-label={`Edit name of ${branch.name}`}
                        onClick={() => {
                          setEditingId(branch.id);
                          setEditingName(branch.name);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    ) : null}
                    {isActive && !branch.frozen ? (
                      <Badge
                        shape="square"
                        className="border-transparent bg-success-lighter px-2 py-1 text-xs leading-none text-success uppercase"
                      >
                        Active
                      </Badge>
                    ) : null}
                    {branch.frozen ? (
                      <Badge
                        shape="square"
                        className="border-transparent bg-muted px-2 py-1 text-xs leading-none text-muted-foreground uppercase"
                      >
                        Frozen
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <Link
                      href={`/d/${branch.profileSlug}`}
                      className="font-medium text-primary underline"
                    >
                      /d/{branch.profileSlug}
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label={
                        copiedSlug === branch.profileSlug
                          ? `Link for ${branch.name} copied`
                          : `Copy link for ${branch.name}`
                      }
                      onClick={() => copyProfileLink(branch.profileSlug)}
                    >
                      {copiedSlug === branch.profileSlug ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </Button>
                    <span>
                      {branch.projectCount} {branch.projectCount === 1 ? 'project' : 'projects'}
                    </span>
                    <span>
                      {branch.memberCount} {branch.memberCount === 1 ? 'member' : 'members'}
                    </span>
                    {branch.reviewCount > 0 ? (
                      <span>
                        {branch.averageRating.toFixed(1)} · {branch.reviewCount}{' '}
                        {branch.reviewCount === 1 ? 'review' : 'reviews'}
                      </span>
                    ) : null}
                    {branch.footprint.length ? (
                      <span className="inline-flex flex-wrap items-center gap-1">
                        {branch.footprint.map((entry) => (
                          <Badge
                            key={entry.id}
                            shape="square"
                            className="border-transparent bg-muted px-2 py-1 text-xs leading-none text-muted-foreground"
                          >
                            {entry.label}
                          </Badge>
                        ))}
                      </span>
                    ) : null}
                    {branch.members.length ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="compact"
                        aria-expanded={expandedBranches[branch.id] === true}
                        aria-label={`${expandedBranches[branch.id] === true ? 'Hide' : 'Show'} members of ${branch.name}`}
                        onClick={() =>
                          setExpandedBranches((previous) => ({
                            ...previous,
                            [branch.id]: previous[branch.id] !== true,
                          }))
                        }
                      >
                        <SquareUser className="size-4 text-muted-foreground" aria-hidden="true" />
                        {branch.members.length} {branch.members.length === 1 ? 'member' : 'members'}
                        <ChevronDown
                          aria-hidden="true"
                          className={`size-4 transition-transform ${expandedBranches[branch.id] === true ? 'rotate-180' : ''}`}
                        />
                      </Button>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <SquareUser className="size-4 text-muted-foreground" aria-hidden="true" />
                        No members yet
                      </span>
                    )}
                  </div>
                  {expandedBranches[branch.id] === true ? (
                    <ul className="divide-y divide-border/40 overflow-hidden rounded-lg border">
                      {branch.members.map((member) => (
                        <li
                          key={member.userId}
                          className="flex items-center gap-3 bg-background px-3 py-2"
                        >
                          <Avatar aria-hidden="true" className="size-7">
                            <AvatarFallback className="text-[11px]">
                              {memberInitials(member.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {member.name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                          </div>
                          <RoleBadge role={member.role} />
                          {canManageBranches && !branch.frozen ? (
                            confirmUnassignKey === `${branch.id}:${member.userId}` ? (
                              <>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="compact"
                                  disabled={isPending}
                                  aria-label={`Confirm removal of ${member.name} from ${branch.name}`}
                                  onClick={() => {
                                    setConfirmUnassignKey(null);
                                    unassignMember(branch.id, member.userId, member.name);
                                  }}
                                >
                                  Confirm
                                </Button>
                                <Button
                                  type="button"
                                  variant="neutral"
                                  size="compact"
                                  disabled={isPending}
                                  aria-label={`Keep ${member.name} in ${branch.name}`}
                                  onClick={() => setConfirmUnassignKey(null)}
                                >
                                  Keep
                                </Button>
                              </>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                disabled={isPending}
                                title="Remove"
                                aria-label={`Remove ${member.name} from ${branch.name}`}
                                onClick={() =>
                                  setConfirmUnassignKey(`${branch.id}:${member.userId}`)
                                }
                              >
                                <UserX className="size-4" />
                              </Button>
                            )
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {canManageBranches && !isEditing && !branch.frozen ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {!isActive ? (
                        <Button
                          type="button"
                          variant="fancy"
                          size="compact"
                          disabled={isPending}
                          onClick={() => openDashboard(branch.id)}
                        >
                          {isPending ? <Loader2 className="animate-spin" /> : <ArrowLeftRight />}
                          Switch Branch
                        </Button>
                      ) : null}
                      {canRemoveBranches && activeBranches.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={isPending}
                          title="Remove branch"
                          aria-label={`Remove branch ${branch.name}`}
                          onClick={() =>
                            setRemoveDialogBranch({
                              id: branch.id,
                              name: branch.name,
                              projectCount: branch.projectCount,
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {branch.frozen ? (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Frozen, restores when you re-upgrade. Published projects stay publicly live.
                    </p>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </SectionCard>

        {canManageBranches ? (
          <SectionCard title="Create a branch">
            <form
              className="grid gap-3 rounded-xl border bg-card p-3 shadow-xs sm:grid-cols-[minmax(0,1.7fr)_auto] sm:items-end"
              onSubmit={createBranch}
            >
              <div className="space-y-1">
                <Label htmlFor={createId} className="text-sm font-medium text-muted-foreground">
                  Branch name
                </Label>
                <Input
                  id={createId}
                  type="text"
                  placeholder="Andheri studio"
                  required
                  className="h-8 px-2 text-sm"
                  value={name}
                  disabled={isPending}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <Button type="submit" size="compact" disabled={isPending || !name.trim()}>
                {isPending ? <Loader2 className="animate-spin" /> : <Send />}
                Create branch
              </Button>
            </form>
          </SectionCard>
        ) : null}

        {canManageBranches ? (
          <SectionCard title="Invite into a branch">
            <form
              className="grid gap-3 rounded-xl border bg-card p-3 shadow-xs sm:grid-cols-[minmax(0,1.5fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_auto] sm:items-end"
              onSubmit={inviteIntoBranch}
            >
              <div className="space-y-1">
                <Label htmlFor={inviteId} className="text-sm font-medium text-muted-foreground">
                  Work email
                </Label>
                <Input
                  id={inviteId}
                  type="email"
                  autoComplete="email"
                  placeholder="teammate@studio.com"
                  required
                  className="h-8 px-2 text-sm"
                  value={inviteEmail}
                  disabled={isPending}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
              </div>
              <SelectField
                label="Role"
                value={inviteRole}
                placeholder="Select a role"
                options={[
                  { value: 'member', label: 'Member' },
                  { value: 'viewer', label: 'Viewer' },
                  { value: 'billing_admin', label: 'Billing Admin' },
                  { value: 'admin', label: 'Admin' },
                ]}
                className="space-y-1 [&_label]:text-muted-foreground [&_select]:h-8 [&_select]:px-2 [&_select]:py-1 [&_select]:pr-8"
                disabled={isPending}
                onValueChange={(value) => setInviteRole(value as AssignableRole)}
              />
              <SelectField
                label="Branch"
                value={inviteBranchId}
                placeholder="Select a branch"
                options={branchOptions}
                className="space-y-1 [&_label]:text-muted-foreground [&_select]:h-8 [&_select]:px-2 [&_select]:py-1 [&_select]:pr-8"
                disabled={isPending}
                onValueChange={setInviteBranchId}
              />
              <Button type="submit" size="compact" disabled={isPending}>
                {isPending ? <Loader2 className="animate-spin" /> : <Send />}
                Send invite
              </Button>
            </form>
            <p className="px-2 pt-2 text-xs leading-relaxed text-muted-foreground">
              Invites are email only and land the teammate directly in the selected branch.
            </p>
          </SectionCard>
        ) : null}

        {canManageBranches ? (
          <SectionCard title="Assign a member to a branch">
            <form
              className="grid gap-3 rounded-xl border bg-card p-3 shadow-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
              onSubmit={assignMember}
            >
              <SelectField
                label="Member"
                value={assignMemberId}
                placeholder="Select a member"
                options={assignableMembers.map((member) => ({
                  value: member.userId,
                  label: `${member.name} (${member.email})`,
                }))}
                className="space-y-1 [&_label]:text-muted-foreground [&_select]:h-8 [&_select]:px-2 [&_select]:py-1 [&_select]:pr-8"
                disabled={isPending}
                onValueChange={setAssignMemberId}
              />
              <SelectField
                label="Branch"
                value={assignBranchId}
                placeholder="Select a branch"
                options={branchOptions}
                className="space-y-1 [&_label]:text-muted-foreground [&_select]:h-8 [&_select]:px-2 [&_select]:py-1 [&_select]:pr-8"
                disabled={isPending}
                onValueChange={setAssignBranchId}
              />
              <Button
                type="submit"
                size="compact"
                disabled={isPending || !assignBranchId || !assignMemberId}
              >
                {isPending ? <Loader2 className="animate-spin" /> : null}
                Assign
              </Button>
            </form>
          </SectionCard>
        ) : null}

        {frozenListedBranches.length ? (
          <SectionCard title="Frozen branches">
            <Card className="space-y-3 p-4 shadow-none">
              {frozenListedBranches.map((branch) => (
                <div key={branch.id} className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {branch.name}
                  </p>
                  <Badge
                    shape="square"
                    className="border-transparent bg-muted px-2 py-1 text-xs leading-none text-muted-foreground uppercase"
                  >
                    Frozen
                  </Badge>
                </div>
              ))}
              <p className="text-xs leading-relaxed text-muted-foreground">
                Frozen, restores when you re-upgrade. Published projects on frozen branches stay
                publicly live.{' '}
                <Link href="/designer/plan-billing" className="text-primary underline">
                  Re-upgrade to restore
                </Link>
              </p>
            </Card>
          </SectionCard>
        ) : null}

        {!canManageBranches && workspace.rbacEnabled ? (
          <SectionCard title="Branch access">
            <Card className="px-5 py-8 text-center text-sm text-muted-foreground shadow-xs">
              Branch management is available to studio owners and admins.
            </Card>
          </SectionCard>
        ) : null}

        <Dialog
          open={removeDialogBranch !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setRemoveDialogBranch(null);
              setRemoveError(null);
            }
          }}
        >
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>
                Remove {removeDialogBranch ? `“${removeDialogBranch.name}”` : 'branch'}?
              </DialogTitle>
              <DialogDescription>
                {removeDialogBranch
                  ? `${removeDialogBranch.projectCount} ${removeDialogBranch.projectCount === 1 ? 'project' : 'projects'} will move to the branch you select. This cannot be undone.`
                  : null}
              </DialogDescription>
            </DialogHeader>
            <SelectField
              label="Move projects to"
              value={removeDialogBranch ? (removeTarget[removeDialogBranch.id] ?? '') : ''}
              placeholder="Select a branch"
              options={activeBranches
                .filter((target) => target.id !== removeDialogBranch?.id)
                .map((target) => ({ value: target.id, label: target.name }))}
              className="space-y-1 [&_label]:text-muted-foreground [&_select]:h-8 [&_select]:px-2 [&_select]:py-1 [&_select]:pr-8"
              disabled={isPending}
              onValueChange={(value) => {
                if (!removeDialogBranch) return;
                const dialogBranchId = removeDialogBranch.id;
                setRemoveTarget((previous) => ({ ...previous, [dialogBranchId]: value }));
              }}
            />
            {removeError ? (
              <p role="alert" className="text-sm text-destructive">
                {removeError}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="neutral"
                size="compact"
                disabled={isPending}
                onClick={() => setRemoveDialogBranch(null)}
              >
                Keep
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="compact"
                disabled={isPending}
                onClick={() => {
                  if (removeDialogBranch) {
                    removeBranch(removeDialogBranch.id, removeDialogBranch.name);
                  }
                }}
              >
                {isPending ? <Loader2 className="animate-spin" /> : null}
                Confirm removal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
