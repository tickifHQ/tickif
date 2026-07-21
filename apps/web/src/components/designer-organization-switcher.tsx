'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
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
}: {
  activeOrganizationId: string | null;
  studioName: string;
  studioLocation: string;
}) {
  const router = useRouter();
  const { data: organizations, isPending, error: listError } = authClient.useListOrganizations();
  const [open, setOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  async function handleSwitch(organizationId: string) {
    if (organizationId === activeOrganizationId || switchingId) return;

    setSwitchError(null);
    setSwitchingId(organizationId);
    try {
      const result = await authClient.organization.setActive({ organizationId });
      if (result.error) {
        setSwitchError('Could not switch organization. Please try again.');
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setSwitchError('Could not switch organization. Please try again.');
    } finally {
      setSwitchingId(null);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Switch organization"
          className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
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
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" className="w-56">
        <DropdownMenuLabel>Your studios</DropdownMenuLabel>
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
                disabled={isActive || switchingId !== null}
                className="cursor-pointer"
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
                  <span className="ml-auto text-xs text-muted-foreground">Switching…</span>
                ) : null}
              </DropdownMenuItem>
            );
          })
        ) : (
          <div role="alert" className="px-2 py-2 text-sm text-destructive">
            No organization memberships found.
          </div>
        )}
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
