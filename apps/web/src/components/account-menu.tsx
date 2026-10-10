'use client';

import { useRef, useState } from 'react';
import { ACCOUNT_STATUS, PLATFORM_ROLE } from '@repo/contracts';
import { authClient } from '@/lib/auth-client';
import { visibleAccountName } from '@/lib/account-identity';
import { InitialsAvatar } from '@/components/initials-avatar';
import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/avatar';
import { AccountMenuDetails } from '@/components/account-menu-details';
import { AccountLogoutDialog } from '@/components/account-logout-dialog';
import { SUPPORT_WHATSAPP_URL } from '@/lib/support';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuGroup,
} from '@repo/ui/components/dropdown-menu';
import { Skeleton } from '@repo/ui/components/skeleton';
import { cn } from '@repo/ui/lib/utils';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';

/**
 * Where "Complete setup" sends a pending account. A deferred designer signup is
 * role=visitor + status=pending until they create a studio, so we cannot rely on
 * the DESIGNER role to detect designer intent. Any pending account that reached a
 * designer-onboarding entry point resumes the designer flow — mirroring
 * public-header's getListYourWorkHref (status=pending → /designer/onboarding), so
 * "Complete setup", "List your work", and "Continue setup" all land on the same
 * resumable onboarding rather than the visitor form. An explicit DESIGNER role
 * (rare in this pending+no-org state) also routes there.
 */
function completeSetupHref(personalRole: string | null): string {
  return personalRole === PLATFORM_ROLE.VISITOR || personalRole === PLATFORM_ROLE.DESIGNER
    ? '/designer/onboarding'
    : '/onboarding';
}

export function AccountMenu({
  showLabel = false,
  avatarSeed,
  showProfileSettings = false,
}: {
  showLabel?: boolean;
  avatarSeed?: string;
  showProfileSettings?: boolean;
}) {
  const { data: session, isPending } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  if (isPending) {
    return (
      <Skeleton
        role="status"
        className={showLabel ? 'size-10 rounded-full sm:w-28' : 'size-8 rounded-full'}
      />
    );
  }

  if (!session) {
    return (
      <Link
        href="/login"
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Sign in
      </Link>
    );
  }

  const user = session.user;
  const personalRole = 'role' in user ? user.role : null;
  const accountStatus = 'status' in user ? user.status : null;
  const hasOrganizationContext = Boolean(session.session.activeOrganizationId);
  const hasPersonalProfileRole =
    personalRole === PLATFORM_ROLE.VISITOR || personalRole === PLATFORM_ROLE.DESIGNER;
  const phoneNumber =
    'phoneNumber' in user && typeof user.phoneNumber === 'string' ? user.phoneNumber : null;
  const userName = visibleAccountName(user.name, phoneNumber);
  const displayName = userName ?? 'Account';
  const firstName = userName?.split(/\s+/, 1)[0] ?? 'Account';
  const resolvedAvatarSeed = avatarSeed?.trim() || displayName;
  const image = user.image?.trim() || null;
  const isActiveCustomer = hasPersonalProfileRole && accountStatus === ACCOUNT_STATUS.ACTIVE;
  const isPersonalVisitor =
    personalRole === PLATFORM_ROLE.VISITOR && isActiveCustomer && !hasOrganizationContext;
  const itemClassName =
    'cursor-pointer gap-3 rounded-lg px-1.5 py-2.5 text-sm font-medium leading-4.5';

  return (
    <>
      <DropdownMenu
        modal={false}
        open={open}
        onOpenChange={(value) => {
          if (!logoutOpen) setOpen(value);
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            ref={triggerRef}
            aria-label={`Open account menu for ${displayName}`}
            className={cn(
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              showLabel
                ? 'inline-flex cursor-pointer items-center gap-0 rounded-full border border-border bg-background p-1 text-sm leading-none font-medium text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground sm:gap-2 sm:pr-3'
                : 'inline-flex size-8 cursor-pointer items-center justify-center rounded-full outline-none',
            )}
          >
            <Avatar className="size-8">
              {image ? <AvatarImage src={image} alt="" /> : null}
              <AvatarFallback>
                <InitialsAvatar
                  seed={resolvedAvatarSeed}
                  fallbackSeed="Your name"
                  alt=""
                  size={32}
                />
              </AvatarFallback>
            </Avatar>
            {showLabel ? (
              <>
                <span className="hidden max-w-24 truncate text-sm leading-none font-medium sm:inline">
                  {firstName}
                </span>
                <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
              </>
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          ref={menuRef}
          inert={logoutOpen || undefined}
          align="end"
          collisionPadding={12}
          className="z-60 w-74 max-w-full overflow-y-auto rounded-account-menu border-account-menu-border px-0 py-2 shadow-account-menu max-h-(--radix-dropdown-menu-content-available-height)"
          onInteractOutside={(event) => {
            // The trigger already toggles the menu. Do not let an outgoing
            // menu layer dismiss a new opening while its exit animation finishes.
            if (
              logoutOpen ||
              (event.target instanceof Node && triggerRef.current?.contains(event.target))
            ) {
              event.preventDefault();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !logoutOpen) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }
          }}
          onCloseAutoFocus={(event) => {
            if (logoutOpen) event.preventDefault();
          }}
        >
          <AccountMenuDetails
            key={`${user.id}:${session.session.activeOrganizationId}:${personalRole}:${accountStatus}`}
            displayName={displayName}
            avatarSeed={resolvedAvatarSeed}
            image={image}
            phoneNumber={phoneNumber}
            showActivity={isActiveCustomer}
            canReadPersonal={isPersonalVisitor}
          />
          <div className="px-2.5">
            <DropdownMenuSeparator className="mx-0 my-0 bg-account-menu-divider" />
            {isActiveCustomer ? (
              <DropdownMenuGroup>
                <DropdownMenuItem asChild className={itemClassName}>
                  <Link href="/saved-projects">
                    <img
                      src="/images/landing/bookmarks.svg"
                      alt=""
                      className="shrink-0 dark:brightness-0 dark:invert"
                    />
                    Saved projects
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className={itemClassName}>
                  <Link href="/enquiries">
                    <img
                      src="/ui/account/chat-bubble.svg"
                      alt=""
                      className="shrink-0 dark:brightness-0 dark:invert"
                    />
                    Enquiries
                  </Link>
                </DropdownMenuItem>
                {isPersonalVisitor ? (
                  <DropdownMenuItem asChild className={itemClassName}>
                    <Link href="/home/settings#personal-details">
                      <img
                        src="/ui/account/home.svg"
                        alt=""
                        className="shrink-0 dark:brightness-0 dark:invert"
                      />
                      My home profile
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator className="mx-0 my-0 bg-account-menu-divider" />
              </DropdownMenuGroup>
            ) : null}
            <DropdownMenuGroup>
              {personalRole === PLATFORM_ROLE.VISITOR &&
              accountStatus === ACCOUNT_STATUS.ACTIVE &&
              !hasOrganizationContext ? (
                <DropdownMenuItem asChild className={itemClassName}>
                  <Link href="/home/settings">
                    <img
                      src="/ui/account/settings.svg"
                      alt=""
                      className="shrink-0 dark:brightness-0 dark:invert"
                    />
                    Settings
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {hasPersonalProfileRole &&
              accountStatus === ACCOUNT_STATUS.PENDING &&
              !hasOrganizationContext ? (
                <DropdownMenuItem asChild className={itemClassName}>
                  <Link href={completeSetupHref(personalRole)}>
                    <img
                      src="/ui/account/settings.svg"
                      alt=""
                      className="shrink-0 dark:brightness-0 dark:invert"
                    />
                    Complete setup
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {showProfileSettings &&
              personalRole === PLATFORM_ROLE.DESIGNER &&
              accountStatus === ACCOUNT_STATUS.ACTIVE &&
              hasOrganizationContext ? (
                <DropdownMenuItem asChild className={itemClassName}>
                  <Link href="/designer/profile">
                    <img
                      src="/ui/account/settings.svg"
                      alt=""
                      className="shrink-0 dark:brightness-0 dark:invert"
                    />
                    Profile &amp; settings
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild className={itemClassName}>
                <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                  <img
                    src="/ui/account/help.svg"
                    alt=""
                    className="shrink-0 dark:brightness-0 dark:invert"
                  />
                  Help &amp; report
                </a>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="mx-0 my-0 bg-account-menu-divider" />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setLogoutOpen(true);
              }}
              className={cn(
                itemClassName,
                'bg-account-menu-primary text-account-menu-primary-foreground focus:bg-account-menu-primary-hover focus:text-account-menu-primary-foreground',
              )}
            >
              <img src="/ui/account/logout.svg" alt="" className="shrink-0" />
              Log out
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <AccountLogoutDialog
        open={logoutOpen}
        anchorRef={menuRef}
        onOpenChange={(value) => {
          setLogoutOpen(value);
          if (!value) setOpen(false);
        }}
        onCloseFocus={() => triggerRef.current?.focus()}
      />
    </>
  );
}
