'use client';

import { useCallback, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type {
  OrganizationBranchesResponse,
  OrganizationWorkspaceResponse,
  OrganizationMember,
} from '@repo/contracts';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Avatar, AvatarFallback } from '@repo/ui/components/avatar';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/dialog';
import { SelectField } from '@repo/ui/components/select-field';
import { Input } from '@repo/ui/components/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table';
import { Loader2, Search, UserPlus } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { formatOrganizationMutationError } from '@/lib/organization-errors';
import { organizationRoleLabels } from '@/components/organization-presentation';
import { ListPagination } from '@/components/list-pagination';
import { useOrganizationPage } from '@/lib/use-organization-page';
import { loadBranchMembersPage, loadOrganizationMembersPage } from '@/lib/organization-list-api';

type Branch = OrganizationBranchesResponse['branches'][number];

export function DesignerBranchMembers({
  branch,
  workspace,
  serverLists = false,
}: {
  branch: Branch;
  workspace: OrganizationWorkspaceResponse;
  serverLists?: boolean;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [memberId, setMemberId] = useState('');
  const [removeMember, setRemoveMember] = useState<Branch['members'][number] | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null,
  );
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const loadMembers = useCallback(
    (query: Parameters<typeof loadBranchMembersPage>[1], signal: AbortSignal) =>
      loadBranchMembersPage(branch.id, query, signal),
    [branch.id],
  );
  const memberList = useOrganizationPage<Branch['members'][number] & { frozen?: boolean }>({
    initialData: {
      items: branch.members,
      total: branch.memberCount,
      page: 1,
      limit: 12,
      totalPages: Math.max(1, Math.ceil(branch.memberCount / 12)),
    },
    load: loadMembers,
    enabled: serverLists,
    refreshKey: branch,
  });
  const loadAvailable = useCallback(
    (query: Parameters<typeof loadOrganizationMembersPage>[0], signal: AbortSignal) =>
      loadOrganizationMembersPage(query, signal, { availableForBranchId: branch.id }),
    [branch.id],
  );
  const available = useOrganizationPage<OrganizationMember>({
    initialData: {
      items: workspace.members.filter(
        (member) =>
          !member.frozen && !branch.members.some((assigned) => assigned.userId === member.userId),
      ),
      total: 0,
      page: 1,
      limit: 12,
      totalPages: 1,
    },
    load: loadAvailable,
    enabled: serverLists && addOpen,
    refreshKey: branch,
  });
  const canManage = workspace.canManage && workspace.rbacEnabled && !branch.frozen;
  const canAddMembers = canManage && workspace.capabilities.manageMembers;
  const assignableMembers = available.data.items;
  const memberSearch = memberList.search;
  const memberQuery = memberSearch.trim();
  const visibleMembers = memberList.data.items;

  function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const member = assignableMembers.find((item) => item.userId === memberId);
    if (!member || !canAddMembers) return;
    setFeedback(null);
    setDialogError(null);
    startTransition(async () => {
      try {
        const result = await authClient.organization.addTeamMember({
          teamId: branch.id,
          userId: member.userId,
        });
        if (result.error) {
          setDialogError(
            formatOrganizationMutationError('Could not add the member.', result.error),
          );
          return;
        }
        setAddOpen(false);
        setMemberId('');
        setFeedback({ tone: 'success', message: `${member.name} added to ${branch.name}.` });
        memberList.reload();
        available.reload();
        router.refresh();
      } catch {
        setDialogError('Could not add the member.');
      }
    });
  }

  function unassignMember() {
    if (!removeMember || !canAddMembers) return;
    const member = removeMember;
    setFeedback(null);
    setDialogError(null);
    startTransition(async () => {
      try {
        const result = await authClient.organization.removeTeamMember({
          teamId: branch.id,
          userId: member.userId,
        });
        if (result.error) {
          setDialogError(
            formatOrganizationMutationError('Could not remove the member.', result.error),
          );
          return;
        }
        setRemoveMember(null);
        setFeedback({
          tone: 'success',
          message: `${member.name} removed from the branch. Their studio membership is unchanged.`,
        });
        memberList.reload();
        available.reload();
        router.refresh();
      } catch {
        setDialogError('Could not remove the member.');
      }
    });
  }

  return (
    <section aria-labelledby="branch-members-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="branch-members-heading" className="text-lg font-medium">
          Members
        </h2>
        {canAddMembers ? (
          <Button
            size="compact"
            disabled={isPending || (!serverLists && !assignableMembers.length)}
            onClick={() => {
              setAddOpen(true);
              setDialogError(null);
            }}
          >
            <UserPlus aria-hidden="true" />
            Add members
          </Button>
        ) : null}
      </div>
      {feedback ? (
        <Alert
          variant={feedback.tone === 'error' ? 'destructive' : 'success'}
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search members by name or email"
            placeholder="Search members by name or email"
            className="pl-9"
            value={memberSearch}
            maxLength={200}
            onChange={(event) => memberList.setSearch(event.target.value)}
          />
        </div>
        <Link
          href="/designer/terms-roles"
          className="shrink-0 self-end text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground sm:self-auto"
        >
          Change roles in team and roles
        </Link>
      </div>
      {memberList.error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {memberList.error}{' '}
            <Button variant="muted-link" size="inline" onClick={memberList.reload}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {memberList.isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading members…
        </p>
      ) : null}
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table aria-label={`${branch.name} members`} className="min-w-[32rem]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Member</TableHead>
              <TableHead scope="col">Email</TableHead>
              <TableHead scope="col">Role</TableHead>
              <TableHead scope="col" className="text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleMembers.map((member) => {
              const orgMember = workspace.members.find((item) => item.userId === member.userId);
              return (
                <TableRow key={member.userId}>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <Avatar aria-hidden="true" className="size-8">
                        <AvatarFallback className="text-xs">
                          {member.name
                            .split(/\s+/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((part) => part[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{member.name}</span>
                      {(member.frozen ?? orgMember?.frozen) ? <Badge>Frozen</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{member.email}</TableCell>
                  <TableCell>
                    <Badge variant={member.role === 'owner' ? 'secondary' : 'outline'}>
                      {organizationRoleLabels[member.role]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {canAddMembers ? (
                      <Button
                        variant="ghost"
                        size="compact"
                        aria-label={`Remove ${member.name} from ${branch.name}`}
                        disabled={isPending}
                        onClick={() => {
                          setRemoveMember(member);
                          setDialogError(null);
                        }}
                      >
                        Remove
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {!visibleMembers.length ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  {memberQuery ? 'No members match your search.' : 'No members in this branch yet.'}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      <ListPagination
        page={memberList.data.page}
        totalPages={memberList.data.totalPages}
        total={memberList.data.total}
        limit={memberList.data.limit}
        itemName="member"
        disabled={memberList.isLoading}
        onPageChange={memberList.setPage}
        onLimitChange={memberList.setLimit}
      />
      {canAddMembers && !serverLists && !assignableMembers.length ? (
        <p className="text-sm text-muted-foreground">
          All active studio members are already in this branch.
        </p>
      ) : null}

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (!open && !isPending) {
            setAddOpen(false);
            setMemberId('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add members to {branch.name}</DialogTitle>
            <DialogDescription>
              Choose an existing studio member to add to this branch.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={addMember}>
            {serverLists ? (
              <Input
                type="search"
                aria-label="Search available studio members"
                placeholder="Search members by name or email"
                maxLength={200}
                value={available.search}
                onChange={(event) => {
                  available.setSearch(event.target.value);
                  setMemberId('');
                }}
              />
            ) : null}
            <SelectField
              label="Member"
              placeholder="Select a member"
              value={memberId}
              options={assignableMembers.map((member) => ({
                value: member.userId,
                label: `${member.name} (${member.email})`,
              }))}
              disabled={isPending || available.isLoading}
              onValueChange={setMemberId}
            />
            {serverLists ? (
              <ListPagination
                page={available.data.page}
                totalPages={available.data.totalPages}
                total={available.data.total}
                limit={available.data.limit}
                itemName="member"
                disabled={available.isLoading}
                onPageChange={(page) => {
                  available.setPage(page);
                  setMemberId('');
                }}
                onLimitChange={(limit) => {
                  available.setLimit(limit);
                  setMemberId('');
                }}
              />
            ) : null}
            {available.error ? (
              <p role="alert" className="text-sm text-destructive">
                {available.error}
              </p>
            ) : null}
            {dialogError ? (
              <p role="alert" className="text-sm text-destructive">
                {dialogError}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="neutral"
                disabled={isPending}
                onClick={() => {
                  setAddOpen(false);
                  setMemberId('');
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !memberId}>
                {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}Add
                member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removeMember !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) setRemoveMember(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Remove {removeMember?.name} from {branch.name}?
            </DialogTitle>
            <DialogDescription>
              Their studio membership and other branch assignments will stay the same.
            </DialogDescription>
          </DialogHeader>
          {dialogError ? (
            <p role="alert" className="text-sm text-destructive">
              {dialogError}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="neutral" disabled={isPending} onClick={() => setRemoveMember(null)}>
              Keep member
            </Button>
            <Button variant="destructive" disabled={isPending} onClick={unassignMember}>
              Remove member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
