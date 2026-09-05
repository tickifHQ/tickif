'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, Loader2, Plus, UserRound } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { api } from '@/lib/api';
import { InitialsAvatar } from '@/components/initials-avatar';
import { Avatar } from '@repo/ui/components/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';

export function DesignerOrganizationSwitcher({
  activeOrganizationId,
  studioName,
  studioLocation,
  isWorkspaceRefreshing = false,
  onSwitchSuccess,
}: {
  activeOrganizationId: string | null;
  studioName: string;
  studioLocation: string;
  isWorkspaceRefreshing?: boolean;
  onSwitchSuccess?: (organizationId: string) => void;
}) {
  const router = useRouter();
  const { data: organizations, isPending, error: listError } = authClient.useListOrganizations();
  const [open, setOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const isBusy = switchingId !== null || isWorkspaceRefreshing;

  async function handleSwitch(organizationId: string) {
    if (organizationId === activeOrganizationId || isBusy) return;

    setSwitchError(null);
    setSwitchingId(organizationId);
    try {
      const response = await api.api.orgs.context.$put({
        json: { kind: 'organization', organizationId },
      });
      if (!response.ok) {
        setSwitchError('Could not switch organization. Please try again.');
        return;
      }

      setOpen(false);
      if (onSwitchSuccess) {
        onSwitchSuccess(organizationId);
      } else if (!activeOrganizationId) {
        router.push('/designer/dashboard');
      } else {
        router.refresh();
      }
    } catch {
      setSwitchError('Could not switch organization. Please try again.');
    } finally {
      setSwitchingId(null);
    }
  }

  async function handlePersonalSwitch() {
    if (!activeOrganizationId || isBusy) return;

    setSwitchError(null);
    setSwitchingId('personal');
    try {
      const response = await api.api.orgs.context.$put({ json: { kind: 'personal' } });
      if (!response.ok) {
        setSwitchError('Could not switch to My Tickif. Please try again.');
        return;
      }

      setOpen(false);
      router.push('/home');
    } catch {
      setSwitchError('Could not switch to My Tickif. Please try again.');
    } finally {
      setSwitchingId(null);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Switch context"
          aria-busy={isBusy}
          disabled={isBusy}
          className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
        >
          <Avatar className="size-10 rounded-xl">
            <InitialsAvatar seed={studioName} fallbackSeed={studioLocation} alt="" size={40} />
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm leading-none font-medium text-foreground">
              {studioName}
            </span>
            <span className="mt-1 block truncate text-xs leading-none text-muted-foreground">
              {studioLocation}
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
          {isWorkspaceRefreshing ? (
            <span className="sr-only">Loading {studioName} workspace</span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" className="w-56">
        <DropdownMenuLabel>Your studios</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!activeOrganizationId || isBusy}
          className="cursor-pointer data-[disabled]:cursor-not-allowed"
          onSelect={(event) => {
            event.preventDefault();
            void handlePersonalSwitch();
          }}
        >
          <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">My Tickif</span>
          {!activeOrganizationId ? (
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="size-3.5" />
              Current
            </span>
          ) : switchingId === 'personal' ? (
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
        <DropdownMenuSeparator />
        {isPending ? (
          <DropdownMenuItem disabled>Loading organizations…</DropdownMenuItem>
        ) : listError ? (
          <div role="alert" className="px-2 py-2 text-sm text-destructive">
            Could not load organizations.
          </div>
        ) : organizations?.length ? (
          organizations.map((organization) => {
            const isActive = organization.id === activeOrganizationId;
            const isSwitching = switchingId === organization.id;

            return (
              <DropdownMenuItem
                key={organization.id}
                disabled={isActive || isBusy}
                className="cursor-pointer data-[disabled]:cursor-not-allowed"
                onSelect={(event) => {
                  event.preventDefault();
                  void handleSwitch(organization.id);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{organization.name}</span>
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
          })
        ) : (
          <p className="px-2 py-2 text-sm leading-relaxed text-muted-foreground">
            No studios yet. Start with My Tickif above, or create your first organisation below.
          </p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isBusy}
          className="cursor-pointer data-[disabled]:cursor-not-allowed"
          onSelect={(event) => {
            event.preventDefault();
            setOpen(false);
            router.push('/designer/new-organization');
          }}
        >
          <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">Create an organisation</span>
        </DropdownMenuItem>
        {switchError ? (
          <div
            role="alert"
            className="mt-1 border-t border-border px-2 py-2 text-sm text-destructive"
          >
            {switchError}
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
