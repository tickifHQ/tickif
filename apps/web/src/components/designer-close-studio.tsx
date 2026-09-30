'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock,
  EyeOff,
  Loader2,
  Lock,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import {
  ORGANIZATION_RETENTION_STATUS,
  type OrganizationRetentionState,
} from '@repo/contracts';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@repo/ui/components/dialog';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { UserFacingError } from '@/lib/user-facing-error';
import {
  fetchStudioRetention,
  requestStudioClosure,
  restoreStudio,
} from '@/lib/close-studio-api';

interface DesignerCloseStudioProps {
  organizationSlug: string;
  organizationName: string;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
    timeZoneName: 'short',
  }).format(new Date(value));
}

/** The owner can still recover the studio while it sits in this state. */
function isRecoverable(retention: OrganizationRetentionState): boolean {
  return (
    retention.status === ORGANIZATION_RETENTION_STATUS.DELETION_REQUESTED &&
    new Date(retention.archiveDueAt).getTime() > Date.now()
  );
}

/** A small icon + text row used in the "what happens" / "what stays" summary. */
function EffectRow({
  icon: Icon,
  tone,
  children,
}: {
  icon: typeof EyeOff;
  tone: 'destructive' | 'muted' | 'positive';
  children: React.ReactNode;
}) {
  const iconColor =
    tone === 'destructive'
      ? 'text-destructive'
      : tone === 'positive'
        ? 'text-success'
        : 'text-muted-foreground';
  return (
    <li className="flex items-start gap-2.5">
      <Icon className={`mt-0.5 size-4 shrink-0 ${iconColor}`} aria-hidden />
      <span className="text-[13px] leading-relaxed text-muted-foreground">{children}</span>
    </li>
  );
}

/** Shared section frame so the Danger Zone matches the portfolio page language. */
function DangerZoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <section className="px-6 pb-10" aria-labelledby="danger-zone-heading">
      <div className="overflow-hidden rounded-xl border border-destructive/20 bg-background shadow-sm">
        <div className="flex items-center gap-2 border-b border-destructive/15 bg-destructive/5 px-5 py-3">
          <TriangleAlert className="size-4 text-destructive" aria-hidden />
          <h2
            id="danger-zone-heading"
            className="text-sm font-semibold uppercase tracking-wide text-destructive"
          >
            Danger zone
          </h2>
        </div>
        {children}
      </div>
    </section>
  );
}

/**
 * "Close your studio" Danger Zone. Surfaces the existing recoverable
 * organization-closure lifecycle (E-250) for organization owners. It never
 * deletes the designer profile row directly and adds no new backend flow.
 */
export function DesignerCloseStudio({
  organizationSlug,
  organizationName,
}: DesignerCloseStudioProps) {
  const router = useRouter();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [retention, setRetention] = useState<OrganizationRetentionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Confirmation dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { retention: current } = await fetchStudioRetention();
      setRetention(current);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Could not load the studio closure status.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const slugMatches = confirmSlug.trim() === organizationSlug;

  function openDialog() {
    setConfirmSlug('');
    setActionError(null);
    setDialogOpen(true);
  }

  async function handleCloseStudio() {
    if (!slugMatches || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const { retention: updated } = await requestStudioClosure(confirmSlug.trim());
      setRetention(updated);
      setDialogOpen(false);
      router.refresh();
    } catch (err) {
      setActionError(
        err instanceof UserFacingError || err instanceof Error
          ? err.message
          : 'Could not close the studio.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const { retention: updated } = await restoreStudio();
      setRetention(updated);
      router.refresh();
    } catch (err) {
      setActionError(
        err instanceof UserFacingError || err instanceof Error
          ? err.message
          : 'Could not restore the studio.',
      );
    } finally {
      setBusy(false);
    }
  }

  // -------------------------------------------------------------------------
  // Loading / error
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <DangerZoneFrame>
        <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading studio closure status…
        </div>
      </DangerZoneFrame>
    );
  }

  if (loadError) {
    return (
      <DangerZoneFrame>
        <div className="p-5">
          <p className="text-sm font-medium text-foreground">
            Could not load studio closure status
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{loadError}</p>
          <Button variant="outline" size="compact" className="mt-3" onClick={() => void load()}>
            <RotateCcw aria-hidden />
            Retry
          </Button>
        </div>
      </DangerZoneFrame>
    );
  }

  // -------------------------------------------------------------------------
  // A closure is already in progress — show the current retention state.
  // -------------------------------------------------------------------------

  if (retention) {
    const recoverable = isRecoverable(retention);
    const onHold = !!retention.holdPlacedAt;
    return (
      <DangerZoneFrame>
        <div className="flex items-start gap-3 border-b border-destructive/20 bg-destructive/5 p-5">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Clock className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Studio closure in progress</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">{organizationName}</span> and its
              public profile are unavailable while closure is processed.
            </p>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {onHold ? (
            <Alert variant="info" aria-label="Closure paused">
              <Lock />
              <AlertTitle>Closure paused under a legal hold</AlertTitle>
              <AlertDescription>
                <p>Processing is paused. Contact support for details.</p>
              </AlertDescription>
            </Alert>
          ) : null}
          {recoverable ? (
            <Alert variant="warning" aria-label="Recovery window">
              <RotateCcw />
              <AlertTitle>You can still restore this studio</AlertTitle>
              <AlertDescription>
                <p>
                  Restore any time before{' '}
                  <span className="font-medium">{formatDate(retention.archiveDueAt)}</span>. After
                  that, closure continues to permanent deletion and cannot be undone.
                </p>
              </AlertDescription>
            </Alert>
          ) : !onHold ? (
            <Alert variant="destructive" aria-label="Permanent deletion scheduled">
              <TriangleAlert />
              <AlertTitle>The recovery window has passed</AlertTitle>
              <AlertDescription>
                <p>
                  Permanent deletion is scheduled for{' '}
                  <span className="font-medium">{formatDate(retention.hardDeleteDueAt)}</span>.
                </p>
              </AlertDescription>
            </Alert>
          ) : null}

          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <UserRound className="size-4 shrink-0 text-success" aria-hidden />
            Your personal Tickif account is not affected.
          </p>

          {actionError ? (
            <p className="text-[13px] text-destructive" role="alert">
              {actionError}
            </p>
          ) : null}

          {recoverable ? (
            <Button disabled={busy} onClick={() => void handleRestore()}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
              Restore studio
            </Button>
          ) : null}
        </div>
      </DangerZoneFrame>
    );
  }

  // -------------------------------------------------------------------------
  // No closure in progress — offer the recoverable closure action.
  // -------------------------------------------------------------------------

  return (
    <DangerZoneFrame>
      <div className="flex flex-col items-start justify-between gap-4 border-b border-destructive/15 bg-destructive/5 p-5 sm:flex-row">
        <div className="min-w-0">
          <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
            Take{' '}
            <span className="font-medium text-foreground">{organizationName}</span> and all its
            branches and public profiles offline. You can restore it during the recovery period before it is permanently
            deleted.
          </p>
        </div>
        <Button
          variant="destructive"
          size="compact"
          ref={closeButtonRef}
          className="shrink-0 shadow-md transition-shadow hover:shadow-lg hover:shadow-destructive/20"
          onClick={openDialog}
        >
          Close studio
        </Button>
      </div>

      <ul className="grid grid-rows-2 gap-x-8 gap-y-3 p-5 sm:grid-flow-col sm:grid-cols-2">
        <EffectRow icon={EyeOff} tone="destructive">
          All studio branches, public profiles, and published projects are removed from discovery and search
          immediately.
        </EffectRow>
        <EffectRow icon={Clock} tone="muted">
          A recovery period follows, during which you can restore the studio.
        </EffectRow>
        <EffectRow icon={ShieldCheck} tone="positive">
          After the recovery period ends, the studio and its data are permanently deleted.
        </EffectRow>
        <EffectRow icon={UserRound} tone="positive">
          Your personal Tickif account stays active — you can join or create another studio.
        </EffectRow>
      </ul>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && !busy) setDialogOpen(false);
        }}
      >
        <DialogContent
          role="alertdialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            closeButtonRef.current?.focus();
          }}
          showCloseButton={!busy}
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={busy ? (event) => event.preventDefault() : undefined}
        >
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-destructive" aria-hidden />
            Close your studio?
          </DialogTitle>
          <DialogDescription>
            This takes {organizationName}, all its branches, and their public profiles offline and starts the recovery
            period before permanent deletion. Your personal account is not deleted.
          </DialogDescription>

          <div className="space-y-2 pt-1">
            <Label htmlFor="close-studio-confirm" className="text-[13px]">
              To confirm, type the studio slug{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] font-medium text-foreground">
                {organizationSlug}
              </code>
            </Label>
            <Input
              id="close-studio-confirm"
              value={confirmSlug}
              onChange={(event) => setConfirmSlug(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={busy}
              placeholder={organizationSlug}
              aria-invalid={confirmSlug.length > 0 && !slugMatches}
            />
          </div>

          {actionError ? (
            <p className="text-[13px] text-destructive" role="alert">
              {actionError}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setDialogOpen(false)}>
              Keep my studio
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !slugMatches}
              onClick={() => void handleCloseStudio()}
            >
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {busy ? 'Closing…' : 'Close studio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DangerZoneFrame>
  );
}
