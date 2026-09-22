'use client';

import { Dialog, DialogContent, DialogTitle } from '@repo/ui/components/dialog';
import { LoginCard } from '@/components/login-card';
import { callbackPathFromLoginHref } from '@/lib/auth-paths';

export function ActionLoginDialog({
  open,
  onOpenChange,
  loginHref,
  title = 'Sign in to continue',
  initialMode = 'browsing',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loginHref: string;
  title?: string;
  initialMode?: 'browsing' | 'designer';
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        overlayClassName="bg-foreground/60 backdrop-blur-sm"
        className="max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto border-0 bg-transparent p-0 shadow-none sm:max-w-3xl"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <LoginCard
          initialMode={initialMode}
          callbackPath={callbackPathFromLoginHref(loginHref)}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
