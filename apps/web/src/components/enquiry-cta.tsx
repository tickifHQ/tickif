'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@repo/ui/lib/utils';
import { Button, buttonVariants } from '@repo/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@repo/ui/components/dialog';
import { MessageSquare } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { EnquiryDialog } from '@/components/enquiry-dialog';
import { api } from '@/lib/api';

type EnquiryContext =
  | { type: 'project'; projectName: string; designerName: string; designerLocation?: string | null; designerLogoUrl?: string | null }
  | { type: 'designer'; designerName: string; designerLocation?: string | null; designerLogoUrl?: string | null };

type Props = {
  context: EnquiryContext;
  designerProfileId: string;
  referredProjectId?: string | null;
  loginHref: string;
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'emphasis' | 'outline' | 'secondary' | 'ghost' | 'inverted' | 'neutral' | 'fancy';
  ariaLabel?: string;
};

/**
 * Login-gated enquiry CTA.
 *
 * - Not logged in → links to login page (preserving redirect).
 * - Logged in + no existing enquiry → opens the enquiry dialog.
 * - Logged in + existing enquiry → shows "already sent" modal with link to Your Enquiries.
 */
export function EnquiryCta({
  context,
  designerProfileId,
  referredProjectId,
  loginHref,
  children,
  className,
  variant = 'default',
  ariaLabel,
}: Props) {
  const { data: session } = authClient.useSession();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [alreadySentOpen, setAlreadySentOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  if (!session) {
    return (
      <Link
        href={loginHref}
        aria-label={ariaLabel}
        className={cn(buttonVariants({ variant }), className)}
      >
        {children}
      </Link>
    );
  }

  const phoneNumber = session.user.phoneNumber ?? null;
  const email = session.user.email ?? null;

  async function handleClick() {
    if (!designerProfileId) {
      setDialogOpen(true);
      return;
    }

    setChecking(true);
    try {
      const res = await api.api.enquiries.check.$get({
        query: { designerProfileId },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.exists) {
          setAlreadySentOpen(true);
        } else {
          setDialogOpen(true);
        }
      } else {
        // If check fails, just open the dialog anyway
        setDialogOpen(true);
      }
    } catch {
      setDialogOpen(true);
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        disabled={checking}
        className={cn(buttonVariants({ variant }), className)}
        onClick={handleClick}
      >
        {children}
      </button>

      {/* Already sent modal */}
      <Dialog open={alreadySentOpen} onOpenChange={setAlreadySentOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle className="sr-only">Enquiry already sent</DialogTitle>
          <DialogDescription className="sr-only">
            You have already sent an enquiry to this designer.
          </DialogDescription>
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <MessageSquare className="size-5 text-primary" />
            </div>
            <p className="text-sm font-medium text-foreground">
              Enquiry already sent
            </p>
            <p className="text-xs text-muted-foreground">
              You have already raised an enquiry with {context.designerName}. Check your enquiries to see the status.
            </p>
            <Button asChild variant="emphasis" size="sm" className="mt-2">
              <Link href="/enquiries">View Your Enquiries</Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Enquiry form dialog */}
      <EnquiryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        context={context}
        designerProfileId={designerProfileId}
        referredProjectId={referredProjectId}
        phoneNumber={phoneNumber}
        email={email}
      />
    </>
  );
}
