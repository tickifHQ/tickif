'use client';

import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/avatar';
import { DropdownMenuItem, DropdownMenuLabel } from '@repo/ui/components/dropdown-menu';
import { Skeleton } from '@repo/ui/components/skeleton';
import { InitialsAvatar } from '@/components/initials-avatar';
import {
  fetchAccountActivity,
  fetchAccountAddress,
  maskedAccountPhone,
} from '@/lib/account-menu-data';

export function AccountMenuDetails({
  displayName,
  avatarSeed,
  image,
  phoneNumber,
  showActivity,
  canReadPersonal,
}: {
  displayName: string;
  avatarSeed: string;
  image: string | null;
  phoneNumber: string | null;
  showActivity: boolean;
  canReadPersonal: boolean;
}) {
  const [activity, setActivity] = useState<Awaited<ReturnType<typeof fetchAccountActivity>> | null>(
    null,
  );
  const [address, setAddress] = useState<string | null>(null);
  // null registers the empty live region before the first effect starts loading.
  const [loading, setLoading] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setActivity(null);
    setAddress(null);
    void Promise.allSettled([
      showActivity ? fetchAccountActivity(controller.signal) : Promise.resolve(null),
      canReadPersonal ? fetchAccountAddress(controller.signal) : Promise.resolve(null),
    ]).then(([counts, personal]) => {
      if (controller.signal.aborted) return;
      const values = counts.status === 'fulfilled' ? counts.value : null;
      setActivity(values);
      setAddress(personal.status === 'fulfilled' ? personal.value : null);
      setFailed(
        counts.status === 'rejected' ||
          personal.status === 'rejected' ||
          (showActivity && (values?.saved == null || values?.enquiries == null)),
      );
      setLoading(false);
    });
    return () => controller.abort();
  }, [attempt, canReadPersonal, showActivity]);

  const metadata = [maskedAccountPhone(phoneNumber), address].filter(Boolean).join(' · ');
  const statusMessage =
    loading === null
      ? ''
      : loading
        ? 'Loading account details.'
        : failed
          ? 'Some account details could not load. Use Retry to try again.'
          : [
              'Account details loaded.',
              showActivity && activity?.saved != null
                ? `Saved projects: ${activity.saved.toLocaleString('en-IN')}.`
                : null,
              showActivity && activity?.enquiries != null
                ? `Enquiries: ${activity.enquiries.toLocaleString('en-IN')}.`
                : null,
            ]
              .filter(Boolean)
              .join(' ');
  return (
    <>
      {showActivity || canReadPersonal ? (
        // Keep this live region mounted and outside aria-busy so updates can be
        // announced without moving keyboard focus or changing the Retry item.
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {statusMessage}
        </p>
      ) : null}
      <DropdownMenuLabel className="flex items-center gap-3 px-4 pb-3.5 pt-2.5 font-sans">
        <Avatar className="size-10">
          {image ? <AvatarImage src={image} alt="" /> : null}
          <AvatarFallback>
            <InitialsAvatar seed={avatarSeed} fallbackSeed="Account" alt="" size={40} />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-4.5 text-foreground">{displayName}</p>
          {metadata ? (
            <p
              className="mt-0.5 truncate text-xs font-normal leading-4 text-muted-foreground"
              title={metadata}
            >
              {metadata}
            </p>
          ) : null}
        </div>
      </DropdownMenuLabel>
      {showActivity ? (
        <dl
          aria-label="Your activity"
          aria-busy={loading !== false}
          className="grid grid-cols-2 gap-2 px-3 pb-3"
        >
          {(['saved', 'enquiries'] as const).map((key) => (
            <div
              key={key}
              className="flex min-w-0 flex-col items-center gap-0.5 rounded-lg bg-account-menu-subtle py-2.5"
            >
              <dt className="order-2 font-mono text-metadata font-medium leading-3 text-muted-foreground uppercase">
                {key}
              </dt>
              <dd className="text-sm font-medium leading-4.5 text-foreground">
                {loading !== false ? (
                  <Skeleton className="h-4.5 w-6" aria-label={`Loading ${key}`} />
                ) : activity?.[key] != null ? (
                  activity[key].toLocaleString('en-IN')
                ) : (
                  <span aria-label={`${key} count unavailable`}>N/A</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {failed ? (
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            // Retry disappears when loading starts. Move its focus to a surviving
            // action first so keyboard navigation does not fall back to the page.
            const retry = event.currentTarget;
            if (retry instanceof HTMLElement && document.activeElement === retry) {
              const items = retry
                .closest('[role="menu"]')
                ?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
              Array.from(items ?? [])
                .find((item) => item !== retry)
                ?.focus();
            }
            setAttempt((value) => value + 1);
          }}
          className="mx-2.5 mb-1 cursor-pointer rounded-lg text-xs text-muted-foreground"
        >
          Some details could not load. Retry
        </DropdownMenuItem>
      ) : null}
    </>
  );
}
