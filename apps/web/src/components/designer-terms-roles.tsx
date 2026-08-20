'use client';

import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Avatar, AvatarFallback } from '@repo/ui/components/avatar';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { SelectField } from '@repo/ui/components/select-field';
import { AlertCircle, Clock3, MoreVertical, Send, Trash2, Undo } from 'lucide-react';
import {
  mockTeamWorkspace,
  teamRoles,
  type PendingTeamInvitation,
  type TeamMember,
  type TeamRole,
  type TeamWorkspacePreview,
} from '@/components/designer-terms-roles-mock-data';

const roleLabels: Record<TeamRole, string> = {
  admin: 'Admin',
  designer: 'Designer',
  project_manager: 'Project manager',
  sales_crm: 'Sales & CRM',
  accountant: 'Accountant',
};

const roleBadgeStyles: Record<TeamRole, string> = {
  admin: 'bg-secondary text-muted-foreground',
  designer: 'bg-info/10 text-info',
  project_manager: 'bg-success-lighter text-success',
  sales_crm: 'bg-warning/10 text-warning',
  accountant: 'bg-feature-lighter text-feature',
};

const avatarStyles = [
  'bg-success text-success-foreground',
  'bg-info text-info-foreground',
  'bg-feature text-feature-lighter',
  'bg-primary text-primary-foreground',
  'bg-warning text-warning-foreground',
] as const;

const roleOptions = teamRoles.map((role) => ({ value: role, label: roleLabels[role] }));

function initialsFromEmail(email: string) {
  return (
    email
      .split('@')[0]
      ?.replace(/[^a-z0-9]/gi, '')
      .slice(0, 2)
      .toUpperCase() || 'TM'
  );
}

function RoleBadge({ role }: { role: TeamRole }) {
  return (
    <Badge
      shape="square"
      className={`border-transparent px-2.5 py-1 text-[13px] leading-relaxed ${roleBadgeStyles[role]}`}
    >
      {roleLabels[role]}
    </Badge>
  );
}

function SummaryCards({
  activeMembers,
  pendingInvites,
  expiringSoon,
  seatLimit,
  planName,
  currentUserRole,
}: {
  activeMembers: number;
  pendingInvites: number;
  expiringSoon: number;
  seatLimit: number;
  planName: string;
  currentUserRole: TeamRole;
}) {
  const seatUsage =
    seatLimit > 0 ? Math.min(100, Math.round((activeMembers / seatLimit) * 100)) : 0;

  return (
    <div className="grid gap-3.5 sm:grid-cols-3">
      <Card className="flex min-h-32 flex-col gap-1.5 p-5 shadow-none">
        <p className="text-2xl leading-tight text-card-foreground">{activeMembers}</p>
        <p className="font-mono text-xs tracking-wider text-foreground-disabled uppercase">
          Active members
        </p>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Seats used"
          aria-valuemin={0}
          aria-valuemax={seatLimit}
          aria-valuenow={activeMembers}
        >
          <div className="h-full rounded-full bg-success" style={{ width: `${seatUsage}%` }} />
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {activeMembers} of {seatLimit} seats used · {planName} plan
        </p>
      </Card>

      <Card className="flex min-h-32 flex-col gap-1.5 p-5 shadow-none">
        <p className="text-2xl leading-tight text-card-foreground">{pendingInvites}</p>
        <p className="font-mono text-xs tracking-wider text-foreground-disabled uppercase">
          Pending invites
        </p>
        <div className="flex w-fit items-center gap-1 rounded-md bg-warning/10 px-2 py-1.5 text-xs font-medium text-warning">
          <AlertCircle className="size-3.5" aria-hidden="true" />
          {expiringSoon} expiring soon
        </div>
      </Card>

      <Card variant="muted" className="flex min-h-32 flex-col gap-1.5 p-5 shadow-none">
        <p className="font-mono text-xs tracking-wider text-foreground-disabled uppercase">
          Your access
        </p>
        <Badge shape="square" className="border-transparent bg-foreground text-background">
          {roleLabels[currentUserRole]}
        </Badge>
        <p className="max-w-48 text-[11px] leading-relaxed text-muted-foreground">
          Full access including billing, team, and studio controls.
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
  onChangeRole,
  onRemove,
}: {
  member: TeamMember;
  onChangeRole: (role: TeamRole) => void;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`Manage ${member.name}`}
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Change role</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={member.role}
          onValueChange={(value) => onChangeRole(value as TeamRole)}
        >
          {roleOptions.map((role) => (
            <DropdownMenuRadioItem key={role.value} value={role.value}>
              {role.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onRemove}>
          <Trash2 />
          Remove member
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MembersList({
  members,
  onChangeRole,
  onRemove,
}: {
  members: TeamMember[];
  onChangeRole: (memberId: string, role: TeamRole) => void;
  onRemove: (memberId: string) => void;
}) {
  return (
    <Card className="divide-y overflow-hidden shadow-xs">
      {members.map((member, index) => (
        <div key={member.id} className="flex min-h-18 items-center gap-3 px-3 py-4 sm:px-5">
          <Avatar aria-hidden="true">
            <AvatarFallback className={avatarStyles[index % avatarStyles.length]}>
              {member.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">{member.name}</p>
              {member.isCurrentUser ? (
                <Badge
                  shape="square"
                  className="border-transparent bg-info/10 px-2 py-1 text-[11px] leading-none text-info uppercase"
                >
                  You
                </Badge>
              ) : null}
            </div>
            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <RoleBadge role={member.role} />
            <MemberActions
              member={member}
              onChangeRole={(role) => onChangeRole(member.id, role)}
              onRemove={() => onRemove(member.id)}
            />
          </div>
        </div>
      ))}
    </Card>
  );
}

function PendingInvites({
  invitations,
  onRemind,
  onRevoke,
}: {
  invitations: PendingTeamInvitation[];
  onRemind: (invitation: PendingTeamInvitation) => void;
  onRevoke: (invitation: PendingTeamInvitation) => void;
}) {
  return (
    <Card className="divide-y overflow-hidden shadow-xs">
      {invitations.map((invitation) => {
        const expiringSoon = invitation.expiresInDays <= 2;
        return (
          <div
            key={invitation.id}
            className="flex flex-col gap-3 px-3 py-4 sm:px-5 lg:flex-row lg:items-center"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar aria-hidden="true">
                <AvatarFallback>{invitation.initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{invitation.email}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Invited as{' '}
                  <span className="font-medium text-foreground/80">
                    {roleLabels[invitation.role]}
                  </span>{' '}
                  · {invitation.invitedAgo}
                </p>
              </div>
            </div>
            <p
              className={`flex items-center gap-1 text-xs font-medium ${expiringSoon ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              <Clock3 className="size-4" aria-hidden="true" />
              Expires in {invitation.expiresInDays} days
            </p>
            <div className="flex items-center gap-2.5">
              <Button
                type="button"
                variant="neutral"
                size="compact"
                onClick={() => onRevoke(invitation)}
              >
                <Undo />
                Revoke
              </Button>
              <Button
                type="button"
                variant="fancy"
                size="compact"
                onClick={() => onRemind(invitation)}
              >
                <Send />
                Remind
              </Button>
            </div>
          </div>
        );
      })}
    </Card>
  );
}

/** Figma-faithful Team & Roles preview using local state until E-240 and E-242 land. */
export function DesignerTermsRoles({
  initialWorkspace = mockTeamWorkspace,
}: {
  initialWorkspace?: TeamWorkspacePreview;
}) {
  const emailId = useId();
  const [members, setMembers] = useState(() => initialWorkspace.members);
  const [invitations, setInvitations] = useState(() => initialWorkspace.invitations);
  const [email, setEmail] = useState('livspace@org.in');
  const [role, setRole] = useState<TeamRole>('admin');
  const [status, setStatus] = useState<string | null>(null);

  const expiringSoon = invitations.filter((invitation) => invitation.expiresInDays <= 2).length;

  function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    const duplicate = [...members, ...invitations].some(
      (person) => person.email.toLowerCase() === normalizedEmail,
    );
    if (duplicate) {
      setStatus(`${normalizedEmail} already belongs to this team or has a pending invite.`);
      return;
    }

    setInvitations((current) => [
      ...current,
      {
        id: `preview-${normalizedEmail}`,
        email: normalizedEmail,
        initials: initialsFromEmail(normalizedEmail),
        role,
        invitedAgo: 'just now',
        expiresInDays: 7,
      },
    ]);
    setStatus(`Preview invitation added for ${normalizedEmail}. No email was sent.`);
    setEmail('');
  }

  function changeMemberRole(memberId: string, nextRole: TeamRole) {
    setMembers((current) =>
      current.map((member) => (member.id === memberId ? { ...member, role: nextRole } : member)),
    );
    const member = members.find((candidate) => candidate.id === memberId);
    if (member) setStatus(`${member.name}'s preview role changed to ${roleLabels[nextRole]}.`);
  }

  function removeMember(memberId: string) {
    const member = members.find((candidate) => candidate.id === memberId);
    if (!member || member.isCurrentUser) {
      setStatus('The current account cannot be removed from this preview.');
      return;
    }
    setMembers((current) => current.filter((candidate) => candidate.id !== memberId));
    setStatus(`${member.name} was removed from the preview team.`);
  }

  function revokeInvitation(invitation: PendingTeamInvitation) {
    setInvitations((current) => current.filter((candidate) => candidate.id !== invitation.id));
    setStatus(`Preview invitation for ${invitation.email} was revoked.`);
  }

  return (
    <div className="px-5 py-10 sm:px-8 lg:py-12">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="space-y-1.5">
          <h1 className="text-2xl font-medium leading-tight text-foreground">Team & roles</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your studio&apos;s people, access levels, and pending invites · all in one place.
          </p>
        </header>

        <SummaryCards
          activeMembers={members.length}
          pendingInvites={invitations.length}
          expiringSoon={expiringSoon}
          seatLimit={initialWorkspace.seatLimit}
          planName={initialWorkspace.planName}
          currentUserRole={initialWorkspace.currentUserRole}
        />

        <SectionCard title="Invite a teammate">
          <form
            className="grid gap-3 rounded-xl border bg-card p-3 shadow-xs sm:grid-cols-[minmax(0,1.7fr)_minmax(12rem,1fr)_auto] sm:items-end"
            onSubmit={submitInvitation}
          >
            <div className="space-y-1">
              <Label htmlFor={emailId} className="text-[13px] font-medium text-muted-foreground">
                Work email
              </Label>
              <Input
                id={emailId}
                type="email"
                autoComplete="email"
                required
                className="h-8 px-2 text-[13px]"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <SelectField
              label="Role"
              value={role}
              placeholder="Select a role"
              options={roleOptions}
              className="space-y-1 [&_label]:text-[13px] [&_label]:text-muted-foreground"
              selectClassName="h-8 px-2 py-1 pr-8 text-[13px]"
              onValueChange={(value) => setRole(value as TeamRole)}
            />
            <Button type="submit" size="compact">
              <Send />
              Send invite
            </Button>
          </form>
        </SectionCard>

        <SectionCard title="Members">
          <MembersList members={members} onChangeRole={changeMemberRole} onRemove={removeMember} />
        </SectionCard>

        <SectionCard title="Pending invites">
          {invitations.length ? (
            <PendingInvites
              invitations={invitations}
              onRemind={(invitation) =>
                setStatus(`Preview reminder prepared for ${invitation.email}. No email was sent.`)
              }
              onRevoke={revokeInvitation}
            />
          ) : (
            <Card className="px-5 py-8 text-center text-sm text-muted-foreground shadow-xs">
              No pending invitations.
            </Card>
          )}
        </SectionCard>

        <p className="sr-only" role="status" aria-live="polite">
          {status}
        </p>
      </div>
    </div>
  );
}
