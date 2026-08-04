'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type {
  OrganizationMember,
  OrganizationMemberRole,
  OrganizationWorkspaceResponse,
} from '@repo/contracts';
import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/avatar';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { SelectField } from '@repo/ui/components/select-field';
import { ChevronDown, Loader2, Mail, ShieldCheck, UserPlus, UsersRound, X } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

const assignableRoles: Array<{ value: Exclude<OrganizationMemberRole, 'owner'>; label: string }> = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function roleLabel(role: OrganizationMemberRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function RoleBadge({ role }: { role: OrganizationMemberRole }) {
  return (
    <Badge variant={role === 'owner' ? 'default' : role === 'admin' ? 'info' : 'outline'}>
      {roleLabel(role)}
    </Badge>
  );
}

function Metric({
  label,
  value,
  helper,
  metric,
}: {
  label: string;
  value: number | string;
  helper: string;
  metric: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p data-metric={metric} className="mt-2 text-2xl font-semibold text-foreground">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

function MemberRoleAction({
  member,
  organizationId,
  disabled,
}: {
  member: OrganizationMember;
  organizationId: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function updateRole(role: Exclude<OrganizationMemberRole, 'owner'>) {
    if (role === member.role) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await authClient.organization.updateMemberRole({
          memberId: member.id,
          role,
          organizationId,
        });
        if (result.error) {
          setError('Could not update this role.');
          return;
        }
        router.refresh();
      } catch {
        setError('Could not update this role.');
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || isPending}
            aria-label={`Change ${member.name} role`}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {roleLabel(member.role)}
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {assignableRoles.map((role) => (
            <DropdownMenuItem
              key={role.value}
              disabled={role.value === member.role}
              onSelect={() => updateRole(role.value)}
            >
              {role.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <span role="status" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function InviteMemberDialog({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<OrganizationMemberRole, 'owner'>>('member');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await authClient.organization.inviteMember({
          email: email.trim(),
          role,
          organizationId,
        });
        if (result.error) {
          setError(result.error.message || 'Could not send the invitation.');
          return;
        }
        setOpen(false);
        setEmail('');
        setRole('member');
        router.refresh();
      } catch {
        setError('Could not send the invitation.');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <UserPlus className="size-4" />
          Invite member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a studio member</DialogTitle>
          <DialogDescription>
            Send an invitation and choose the access they should receive.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              required
              autoComplete="email"
              placeholder="teammate@studio.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <SelectField
            label="Role"
            value={role}
            placeholder="Select a role"
            options={assignableRoles}
            onValueChange={(value) => setRole(value as Exclude<OrganizationMemberRole, 'owner'>)}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mail className="size-4" />
              )}
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  if (!workspace) {
    return (
      <div className="space-y-6 p-5">
        <div>
          <p className="text-sm font-medium text-primary">Designer workspace</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Teams & Roles</h1>
        </div>
        <div
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error ?? 'Could not load your studio team.'}
        </div>
      </div>
    );
  }

  const adminCount = workspace.members.filter(
    (member) => member.role === 'owner' || member.role === 'admin',
  ).length;

  function cancelInvitation(invitationId: string) {
    setActionError(null);
    startTransition(async () => {
      try {
        const result = await authClient.organization.cancelInvitation({ invitationId });
        if (result.error) {
          setActionError('Could not cancel the invitation.');
          return;
        }
        router.refresh();
      } catch {
        setActionError('Could not cancel the invitation.');
      }
    });
  }

  return (
    <div className="space-y-6 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Designer workspace</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Teams & Roles</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Manage access for{' '}
            <span className="font-medium text-foreground">{workspace.organization.name}</span>.
          </p>
        </div>
        {workspace.canManage ? (
          <InviteMemberDialog organizationId={workspace.organization.id} />
        ) : (
          <Badge variant="outline">Member access</Badge>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Team members"
          value={workspace.members.length}
          helper="Active access"
          metric="members"
        />
        <Metric label="Admins" value={adminCount} helper="Owners and admins" metric="admins" />
        {workspace.canManage ? (
          <Metric
            label="Pending invitations"
            value={workspace.invitations.length}
            helper="Awaiting response"
            metric="invitations"
          />
        ) : (
          <Metric
            label="Your role"
            value={roleLabel(workspace.currentUserRole)}
            helper="Read-only access"
            metric="current-role"
          />
        )}
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}
      {actionError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {actionError}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <UsersRound className="size-5 text-muted-foreground" />
          <div>
            <h2 className="font-semibold text-foreground">Studio members</h2>
            <p className="text-sm text-muted-foreground">People with access to this workspace</p>
          </div>
        </div>
        <div className="divide-y divide-border">
          {workspace.members.map((member) => {
            const roleLocked = member.role === 'owner';
            return (
              <div
                key={member.id}
                className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center"
              >
                <Avatar className="size-10">
                  {member.image ? <AvatarImage src={member.image} alt="" /> : null}
                  <AvatarFallback className="bg-primary font-semibold text-primary-foreground">
                    {initials(member.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{member.name}</p>
                    {member.isCurrentUser ? <Badge variant="secondary">You</Badge> : null}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Joined {formatDate(member.joinedAt)}
                  </p>
                </div>
                {workspace.canManage && !roleLocked ? (
                  <MemberRoleAction
                    member={member}
                    organizationId={workspace.organization.id}
                    disabled={isPending}
                  />
                ) : (
                  <RoleBadge role={member.role} />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {workspace.canManage ? (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <ShieldCheck className="size-5 text-muted-foreground" />
            <div>
              <h2 className="font-semibold text-foreground">Pending invitations</h2>
              <p className="text-sm text-muted-foreground">Invitations waiting to be accepted</p>
            </div>
          </div>
          {workspace.invitations.length ? (
            <div className="divide-y divide-border">
              {workspace.invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {invitation.email}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Sent {formatDate(invitation.createdAt)} / Expires{' '}
                      {formatDate(invitation.expiresAt)}
                    </p>
                  </div>
                  <RoleBadge role={invitation.role} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Cancel invitation for ${invitation.email}`}
                    title="Cancel invitation"
                    disabled={isPending}
                    onClick={() => cancelInvitation(invitation.id)}
                  >
                    {isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <X className="size-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-10 text-center">
              <Mail className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium text-foreground">No pending invitations</p>
              <p className="mt-1 text-sm text-muted-foreground">
                New invitations will appear here.
              </p>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
