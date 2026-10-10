'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@repo/ui/components/button';
import { Checkbox } from '@repo/ui/components/checkbox';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@repo/ui/components/dialog';
import { authClient } from '@/lib/auth-client';

/** The existing Better Auth session APIs own revocation and cookie removal. */
export function AccountLogoutDialog({
  open,
  onOpenChange,
  onCloseFocus,
  anchorRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseFocus: () => void;
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const [allDevices, setAllDevices] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  // Read geometry only while open. ResizeObserver also handles wrapping, errors
  // and late-loading account details without running a scroll/render loop.
  useLayoutEffect(() => {
    const anchor = anchorRef?.current;
    if (!open || !content || !anchor) return;

    function placeBesideMenu() {
      if (!content || !anchor) return;
      const menu = anchor.getBoundingClientRect();
      const width = content.offsetWidth;
      const height = content.offsetHeight;
      const gap = Number.parseFloat(window.getComputedStyle(content).marginRight) || 0;
      const next =
        width > 0 && menu.left >= width + gap * 2
          ? {
              left: menu.left - width - gap,
              top: Math.max(gap, Math.min(menu.bottom - height, window.innerHeight - height - gap)),
            }
          : null;
      setPosition((previous) =>
        previous?.left === next?.left && previous?.top === next?.top ? previous : next,
      );
    }

    placeBesideMenu();
    const observer = new ResizeObserver(placeBesideMenu);
    observer.observe(anchor);
    observer.observe(content);
    window.addEventListener('resize', placeBesideMenu);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', placeBesideMenu);
    };
  }, [open, content, anchorRef]);

  async function logOut() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      if (allDevices) {
        const result = await authClient.revokeOtherSessions();
        if (result.error) {
          setError(
            'Could not log out of other devices. Try again or sign in again to refresh your session.',
          );
          return;
        }
      }
      const result = await authClient.signOut();
      if (result.error) throw new Error('Sign out failed');
      window.location.replace('/login');
    } catch {
      setError('Could not log out. Please try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function changeOpen(value: boolean) {
    if (inFlight.current) return;
    if (!value) {
      setAllDevices(false);
      setError('');
    }
    onOpenChange(value);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        ref={setContent}
        overlayClassName="bg-account-menu-overlay"
        showCloseButton={false}
        className="z-70 me-4 max-h-[calc(100dvh-var(--spacing)*8)] w-90 overflow-y-auto gap-3.5 rounded-account-logout border-account-menu-border px-6 pb-5 pt-6 shadow-account-menu sm:max-w-90"
        style={position ? { ...position, translate: 'none' } : undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onCloseFocus();
        }}
        onEscapeKeyDown={(event) => {
          if (inFlight.current) event.preventDefault();
        }}
        onKeyDown={(event) => {
          // The retained dropdown has its own dismissable layer. Handle Escape
          // in the focused dialog rather than relying on layer registration order.
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            changeOpen(false);
          }
        }}
        onInteractOutside={(event) => {
          if (inFlight.current) event.preventDefault();
        }}
      >
        <div className="flex size-11 items-center justify-center rounded-lg bg-account-logout-icon-background">
          <LogOut aria-hidden="true" className="size-5 text-account-logout-icon-foreground" />
        </div>
        <DialogTitle className="p-0 text-lg leading-6">Log out of this device?</DialogTitle>
        <DialogDescription className="leading-5">
          Your saved projects and enquiries stay safe on your account. Log back in anytime.
        </DialogDescription>
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-account-menu-muted px-3 py-2.5">
          <Checkbox
            checked={allDevices}
            onCheckedChange={(checked) => setAllDevices(checked === true)}
            disabled={busy}
            aria-label="Log out of all devices"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium leading-4.5">Log out of all devices</span>
            <span className="block text-xs leading-4 text-muted-foreground">
              Use this on a shared family phone
            </span>
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2" aria-busy={busy}>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={busy}
            onClick={() => changeOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-10 bg-account-menu-primary text-account-menu-primary-foreground hover:bg-account-menu-primary-hover"
            disabled={busy}
            onClick={() => void logOut()}
          >
            {busy ? 'Logging out...' : 'Log out'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
