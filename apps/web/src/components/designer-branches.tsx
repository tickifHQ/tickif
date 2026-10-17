'use client';

import { useCallback, useId, useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  errorResponseSchema,
  rbacEnabled,
  removeOrganizationBranchResponseSchema,
  type OrganizationBranchesResponse,
  type OrganizationPage,
  type OrganizationWorkspaceResponse,
} from '@repo/contracts';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { OrganizationManagementPrompt } from '@/components/organization-management-prompt';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@repo/ui/components/tooltip';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { api } from '@/lib/api';
import { formatOrganizationMutationError } from '@/lib/organization-errors';
import { formatSeatLimit } from '@/components/organization-presentation';
import { DesignerBranchMembers } from '@/components/designer-branch-members';
import { ListPagination } from '@/components/list-pagination';
import { useOrganizationPage } from '@/lib/use-organization-page';
import { loadBranchesPage } from '@/lib/organization-list-api';

type Feedback = { tone: 'success' | 'error'; message: string };
type Branch = OrganizationBranchesResponse['branches'][number];

function formatMutationError(fallback: string, error: unknown): string {
  return formatOrganizationMutationError(fallback, error, {
    upgrade: 'Upgrade to Corporate to unlock branches.',
    billingLocked: 'Restore billing to unlock branches.',
  });
}

export function DesignerBranches({
  branches,
  workspace,
  error,
  branchId,
  branchesPage,
  serverLists = false,
}: {
  branches: OrganizationBranchesResponse | null;
  workspace: OrganizationWorkspaceResponse | null;
  error?: string;
  branchId?: string;
  branchesPage?: OrganizationPage<Branch>;
  serverLists?: boolean;
}) {
  const router = useRouter();
  const createId = useId();
  const [name, setName] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Record<string, string>>({});
  const [removeDialogBranch, setRemoveDialogBranch] = useState<Branch | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const branchList = useOrganizationPage<Branch>({
    initialData: branchesPage ?? {
      items: branches?.branches ?? [],
      page: 1,
      limit: 12,
      total: branches?.branches.length ?? 0,
      totalPages: 1,
    },
    load: loadBranchesPage,
    enabled:
      serverLists &&
      !branchId &&
      !!workspace?.rbacEnabled &&
      rbacEnabled(workspace.planTier, workspace.subscriptionState),
    refreshKey: branches,
  });
  const loadRemovalTargets = useCallback(
    (query: Parameters<typeof loadBranchesPage>[0], signal: AbortSignal) =>
      loadBranchesPage(query, signal, removeDialogBranch?.id),
    [removeDialogBranch?.id],
  );
  const removalTargets = useOrganizationPage<Branch>({
    initialData: {
      items:
        branches?.branches.filter(
          (item) =>
            !item.frozen && item.profileStatus === 'active' && item.id !== removeDialogBranch?.id,
        ) ?? [],
      page: 1,
      limit: 12,
      total: 0,
      totalPages: 1,
    },
    load: loadRemovalTargets,
    enabled: serverLists && !!removeDialogBranch,
    refreshKey: branches,
  });

  if (!branches || !workspace)
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-5 py-10 sm:px-8 lg:py-12">
        <h1 className="text-2xl font-medium">Branches</h1>
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error ?? 'Could not load your branches.'}</AlertDescription>
        </Alert>
      </div>
    );

  const hasBranchManagement =
    workspace.rbacEnabled && rbacEnabled(workspace.planTier, workspace.subscriptionState);
  const branch = branches.branches.find((item) => item.id === branchId);
  const canManageBranches = workspace.canManage && hasBranchManagement;
  const canRemoveBranches = workspace.currentUserRole === 'owner' && hasBranchManagement;
  const publicRemovalTargets = branches.branches.filter(
    (item) => !item.frozen && item.profileStatus === 'active',
  );
  const canRemoveBranch =
    branch &&
    canRemoveBranches &&
    (serverLists
      ? branches.branchUsage > (branch.frozen ? 0 : 1)
      : publicRemovalTargets.some((target) => target.id !== branch.id));
  const organizationId = workspace.organization.id;
  const branchSearch = branchList.search;
  const branchQuery = branchSearch.trim();
  const visibleBranches = branchList.data.items;

  function refresh() {
    branchList.reload();
    removalTargets.reload();
    router.refresh();
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
        setCreateOpen(false);
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

  function removeBranch(branchId: string, branchName: string) {
    const targetBranchId = removeTarget[branchId];
    if (
      !targetBranchId ||
      targetBranchId === branchId ||
      removalTargets.isLoading ||
      removalTargets.error ||
      !removalTargets.data.items.some((target) => target.id === targetBranchId)
    ) {
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
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const parsedError = errorResponseSchema.safeParse(body);
          const message = formatMutationError(
            'Could not remove the branch.',
            parsedError.success ? parsedError.data.error : null,
          );
          setRemoveError(message);
          setFeedback({ tone: 'error', message });
          return;
        }
        const parsed = removeOrganizationBranchResponseSchema.safeParse(body);
        if (!parsed.success) {
          const message = 'Could not verify that the branch was removed. Refresh and try again.';
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
        const moved = ` ${parsed.data.reassignedProjectCount} ${parsed.data.reassignedProjectCount === 1 ? 'project' : 'projects'} moved.`;
        setFeedback({ tone: 'success', message: `Branch ${branchName} removed.${moved}` });
        router.push('/designer/branches');
        refresh();
      } catch {
        const message = 'Could not remove the branch.';
        setRemoveError(message);
        setFeedback({ tone: 'error', message });
      }
    });
  }

  function editBranch(item: Branch) {
    setFeedback(null);
    setEditingId(item.id);
    setEditingName(item.name);
  }

  function clearRemovalSelection() {
    if (removeDialogBranch)
      setRemoveTarget((previous) => ({ ...previous, [removeDialogBranch.id]: '' }));
  }

  if (!hasBranchManagement)
    return (
      <div className="px-5 py-10 sm:px-8 lg:py-12">
        <div className="mx-auto max-w-4xl space-y-4">
          <header className="space-y-1.5">
            <h1 className="text-2xl font-medium leading-tight text-foreground">Branches</h1>
          </header>
          <OrganizationManagementPrompt
            workspace={workspace}
            feature="branches"
            branchUsage={branches.branchUsage}
          />
        </div>
      </div>
    );
  return (
    <div className="px-5 py-10 sm:px-8 lg:py-12">
      <div className="mx-auto max-w-6xl space-y-6">
        {branchId ? (
          <Button asChild variant="muted-link" size="inline">
            <Link href="/designer/branches">
              <ArrowLeft aria-hidden="true" />
              All branches
            </Link>
          </Button>
        ) : null}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <h1 className="break-words text-2xl font-medium leading-tight">
              {branch?.name ?? 'Branches'}
            </h1>
            {branch ? (
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                  {branch.footprint.map((location) => location.label).join(', ') ||
                    'Location not set'}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {branch.projectCount} {branch.projectCount === 1 ? 'project' : 'projects'}
                </span>
                <span aria-hidden="true">·</span>
                {branch.profileStatus === 'active' ? (
                  <Link className="text-primary underline" href={`/d/${branch.profileSlug}`}>
                    Portfolio is live
                  </Link>
                ) : (
                  <span>Portfolio is not live</span>
                )}
              </p>
            ) : null}
          </div>
          {branch && ((canManageBranches && !branch.frozen) || canRemoveBranch) ? (
            <div
              role="group"
              aria-label="Branch actions"
              className="flex flex-wrap items-center gap-2"
            >
              {canManageBranches && !branch.frozen ? (
                <Button variant="outline" size="compact" onClick={() => editBranch(branch)}>
                  <Pencil aria-hidden="true" />
                  Edit branch
                </Button>
              ) : null}
              {canRemoveBranch ? (
                <Button
                  variant="ghost"
                  size="compact"
                  className="text-destructive"
                  aria-label={`Remove branch ${branch.name}`}
                  disabled={isPending}
                  onClick={() => {
                    setRemoveDialogBranch(branch);
                    setRemoveError(null);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  Remove branch
                </Button>
              ) : null}
            </div>
          ) : null}
        </header>

        {feedback && !removeDialogBranch && !createOpen && !editingId ? (
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

        {branchId && !branch ? (
          <Alert variant="destructive">
            <AlertDescription>This branch is unavailable in your current studio.</AlertDescription>
          </Alert>
        ) : null}

        {!branchId ? (
          <section aria-label="Branches" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {branches.branchUsage} of {formatSeatLimit(branches.branchLimit)} branches used
              </p>
              {canManageBranches ? (
                <Button
                  size="compact"
                  onClick={() => {
                    setCreateOpen(true);
                    setFeedback(null);
                  }}
                >
                  <Plus aria-hidden="true" />
                  Create new branch
                </Button>
              ) : null}
            </div>
            <div className="relative w-full sm:max-w-sm">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                aria-label="Search branches by name"
                placeholder="Search branches by name"
                className="pl-9"
                value={branchSearch}
                maxLength={200}
                onChange={(event) => branchList.setSearch(event.target.value)}
              />
            </div>
            {branchList.error ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {branchList.error}{' '}
                  <Button variant="muted-link" size="inline" onClick={branchList.reload}>
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {branchList.isLoading ? (
              <p role="status" className="text-sm text-muted-foreground">
                Loading branches…
              </p>
            ) : null}
            <div className="overflow-hidden rounded-xl border bg-card">
              <Table aria-label="Branches" className="min-w-[34rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Branch name</TableHead>
                    <TableHead scope="col">Location</TableHead>
                    <TableHead scope="col">Members</TableHead>
                    <TableHead scope="col" className="text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleBranches.map((item) => (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer"
                      onClick={(event) => {
                        if (!(event.target instanceof Element) || !event.target.closest('a,button'))
                          router.push(`/designer/branches/${encodeURIComponent(item.id)}`);
                      }}
                    >
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
                            href={`/designer/branches/${encodeURIComponent(item.id)}`}
                          >
                            {item.name}
                          </Link>
                          {item.frozen ? (
                            <Badge>Frozen</Badge>
                          ) : item.id === branches.activeTeamId ? (
                            <Badge>Current</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.footprint.map((location) => location.label).join(', ') || 'Not set'}
                      </TableCell>
                      <TableCell>
                        {item.memberCount} {item.memberCount === 1 ? 'member' : 'members'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canManageBranches && !item.frozen ? (
                            <Button
                              variant="ghost"
                              size="compact"
                              aria-label={`Edit branch ${item.name}`}
                              onClick={() => editBranch(item)}
                            >
                              <Pencil aria-hidden="true" />
                              Edit
                            </Button>
                          ) : null}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button asChild variant="ghost" size="icon-sm">
                                <Link
                                  href={`/designer/branches/${encodeURIComponent(item.id)}`}
                                  aria-label={`View branch details for ${item.name}`}
                                >
                                  <ArrowRight aria-hidden="true" />
                                </Link>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>View branch details</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!visibleBranches.length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                        {branchQuery ? 'No branches match your search.' : 'No branches to show.'}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
            <ListPagination
              page={branchList.data.page}
              totalPages={branchList.data.totalPages}
              total={branchList.data.total}
              limit={branchList.data.limit}
              itemName="branch"
              itemNamePlural="branches"
              disabled={branchList.isLoading}
              onPageChange={branchList.setPage}
              onLimitChange={branchList.setLimit}
            />
          </section>
        ) : null}

        {branch ? (
          <>
            {branch.frozen ? (
              <p className="text-sm text-muted-foreground">
                Frozen, restores when you re-upgrade. Published projects stay publicly live.{' '}
                <Link className="text-primary underline" href="/designer/plan-billing">
                  Re-upgrade to restore
                </Link>
              </p>
            ) : null}
            <DesignerBranchMembers
              key={branch.id}
              branch={branch}
              workspace={workspace}
              serverLists={serverLists}
            />
          </>
        ) : null}

        <Dialog
          open={createOpen || editingId !== null}
          onOpenChange={(open) => {
            if (!open && !isPending) {
              setCreateOpen(false);
              setEditingId(null);
              setFeedback(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{createOpen ? 'Create new branch' : 'Edit branch'}</DialogTitle>
              <DialogDescription>
                {createOpen
                  ? 'Give your new branch a name.'
                  : 'Update the name shown for this branch.'}
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                if (createOpen) createBranch(event);
                else {
                  event.preventDefault();
                  if (editingId) renameBranch(editingId);
                }
              }}
            >
              <div className="space-y-2">
                <Label htmlFor={createId}>Branch name</Label>
                <Input
                  id={createId}
                  value={createOpen ? name : editingName}
                  required
                  maxLength={255}
                  disabled={isPending}
                  onChange={(event) =>
                    createOpen ? setName(event.target.value) : setEditingName(event.target.value)
                  }
                />
              </div>
              {feedback?.tone === 'error' ? (
                <p role="alert" className="text-sm text-destructive">
                  {feedback.message}
                </p>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="neutral"
                  disabled={isPending}
                  onClick={() => {
                    setCreateOpen(false);
                    setEditingId(null);
                    setFeedback(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending || !(createOpen ? name : editingName).trim()}
                >
                  {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                  {createOpen ? 'Create branch' : 'Save changes'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={removeDialogBranch !== null}
          onOpenChange={(open) => {
            if (!open && !isPending) {
              setRemoveDialogBranch(null);
              setRemoveError(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove {removeDialogBranch?.name}?</DialogTitle>
              <DialogDescription>
                {removeDialogBranch?.projectCount} projects will move to the branch you select. This
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {serverLists ? (
              <Input
                type="search"
                aria-label="Search reassignment branches"
                placeholder="Search branches by name"
                maxLength={200}
                value={removalTargets.search}
                onChange={(event) => {
                  clearRemovalSelection();
                  removalTargets.setSearch(event.target.value);
                }}
              />
            ) : null}
            <SelectField
              label="Move projects to"
              placeholder="Select a branch"
              value={removeDialogBranch ? (removeTarget[removeDialogBranch.id] ?? '') : ''}
              options={removalTargets.data.items
                .filter((target) => target.id !== removeDialogBranch?.id)
                .map((target) => ({ value: target.id, label: target.name }))}
              disabled={isPending || removalTargets.isLoading}
              onValueChange={(value) => {
                if (removeDialogBranch)
                  setRemoveTarget((previous) => ({ ...previous, [removeDialogBranch.id]: value }));
              }}
            />
            {serverLists ? (
              <ListPagination
                page={removalTargets.data.page}
                totalPages={removalTargets.data.totalPages}
                total={removalTargets.data.total}
                limit={removalTargets.data.limit}
                itemName="branch"
                itemNamePlural="branches"
                disabled={removalTargets.isLoading}
                onPageChange={(page) => {
                  clearRemovalSelection();
                  removalTargets.setPage(page);
                }}
                onLimitChange={(limit) => {
                  clearRemovalSelection();
                  removalTargets.setLimit(limit);
                }}
              />
            ) : null}
            {removalTargets.error ? (
              <p role="alert" className="text-sm text-destructive">
                {removalTargets.error}
              </p>
            ) : null}
            {removeError ? (
              <p role="alert" className="text-sm text-destructive">
                {removeError}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                variant="neutral"
                disabled={isPending}
                onClick={() => setRemoveDialogBranch(null)}
              >
                Keep
              </Button>
              <Button
                variant="destructive"
                disabled={
                  isPending ||
                  removalTargets.isLoading ||
                  !!removalTargets.error ||
                  !removeDialogBranch ||
                  !removalTargets.data.items.some(
                    (target) => target.id === removeTarget[removeDialogBranch.id],
                  )
                }
                onClick={() => {
                  if (removeDialogBranch)
                    removeBranch(removeDialogBranch.id, removeDialogBranch.name);
                }}
              >
                {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}Confirm
                removal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
