'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import {
  organizationBranchesResponseSchema,
  type OrganizationBranchesResponse,
} from '@repo/contracts';
import { api } from '@/lib/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';

/**
 * Second, subordinate branch selector rendered directly beneath the
 * My Tickif/organisation selector (E-249 decision). Hidden in personal
 * context and whenever fewer than two branches exist, so it never renders
 * a dead control. There is deliberately no "All branches" option until
 * org-roll-up reads exist.
 */
export function DesignerBranchSelector({ organizationId }: { organizationId: string | null }) {
  const router = useRouter();
  const [branches, setBranches] = useState<OrganizationBranchesResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const isBusy = switchingId !== null;

  useEffect(() => {
    setBranches(null);
    setSwitchError(null);
    if (!organizationId) {
      return;
    }
    let cancelled = false;
    async function loadBranches() {
      try {
        const response = await api.api.orgs.branches.$get();
        if (!response.ok || cancelled) return;
        const parsed = organizationBranchesResponseSchema.safeParse(await response.json());
        if (!parsed.success || cancelled) return;
        setBranches(parsed.data);
      } catch {
        if (!cancelled) setBranches(null);
      }
    }
    void loadBranches();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  async function refreshBranches() {
    if (!organizationId) return;
    try {
      const response = await api.api.orgs.branches.$get();
      if (!response.ok) return;
      const parsed = organizationBranchesResponseSchema.safeParse(await response.json());
      if (!parsed.success) return;
      setBranches(parsed.data);
    } catch {
      // Keep the last known branches on transient failures.
    }
  }

  async function handleSwitch(teamId: string) {
    if (!branches || !organizationId || teamId === branches.activeTeamId || isBusy) return;

    setSwitchError(null);
    setSwitchingId(teamId);
    try {
      const response = await api.api.orgs.context.$put({
        json: { kind: 'organization', organizationId, teamId },
      });
      if (!response.ok) {
        setSwitchError('Could not switch branch. Please try again.');
        return;
      }

      setBranches({ ...branches, activeTeamId: teamId });
      setOpen(false);
      router.refresh();
    } catch {
      setSwitchError('Could not switch branch. Please try again.');
    } finally {
      setSwitchingId(null);
    }
  }

  if (!organizationId || !branches || branches.branches.length <= 1) return null;
  const activeBranch = branches.branches.find((branch) => branch.id === branches.activeTeamId);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) void refreshBranches();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Switch branch"
          aria-busy={isBusy}
          disabled={isBusy}
          className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm leading-none font-medium text-foreground">
              {activeBranch?.name ?? 'Select branch'}
            </span>
            <span className="mt-1 block truncate text-xs leading-none text-muted-foreground">
              {branches.branchUsage} of{' '}
              {Number.isFinite(branches.branchLimit) && branches.branchLimit >= 0
                ? branches.branchLimit
                : 'Unlimited'}{' '}
              branches
            </span>
          </span>
          {isBusy ? (
            <Loader2
              aria-hidden="true"
              className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
            />
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" className="w-56">
        <DropdownMenuLabel>Your branches</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {branches.branches.map((branch) => {
          const isActive = branch.id === branches.activeTeamId;
          const isSwitching = switchingId === branch.id;

          return (
            <DropdownMenuItem
              key={branch.id}
              disabled={isActive || isBusy}
              className="cursor-pointer data-[disabled]:cursor-not-allowed"
              onSelect={(event) => {
                event.preventDefault();
                void handleSwitch(branch.id);
              }}
            >
              <span className="min-w-0 flex-1 truncate">{branch.name}</span>
              {isActive ? (
                <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Check className="size-3.5" />
                  Current
                </span>
              ) : isSwitching ? (
                <span
                  role="status"
                  aria-live="polite"
                  className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground"
                >
                  <Loader2
                    aria-hidden="true"
                    className="size-3.5 animate-spin motion-reduce:animate-none"
                  />
                  Switching…
                </span>
              ) : null}
            </DropdownMenuItem>
          );
        })}
        {switchError ? (
          <div role="alert" className="px-2 py-2 text-sm text-destructive">
            {switchError}
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
