'use client';

import { useState, useTransition } from 'react';
import type {
  ModerationHistoryResponse,
  ModerationReasonCode,
  ProjectStatus,
} from '@repo/contracts';
import { moderationHistoryResponseSchema } from '@repo/contracts';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@repo/ui/components/dialog';
import { AlertCircle, Clock3, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@repo/ui/lib/utils';
import { api } from '@/lib/api';
import { ProjectModerationReasons } from '@/components/project-moderation-reasons';

type ModerationHistoryItem = ModerationHistoryResponse['items'][number];
type ModerationActionValue = ModerationHistoryItem['action'];

function actionLabel(action: ModerationActionValue): string {
  return action
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// Per-action visual treatment so adjacent events are easy to tell apart at a
// glance: a colored timeline dot + a matching badge tint. Reviewer decisions
// (approve/reject/changes) read differently from neutral/self-service steps.
const actionTone: Record<
  ModerationActionValue,
  { dot: string; badge: string }
> = {
  submit: { dot: 'bg-muted-foreground', badge: 'bg-muted text-muted-foreground' },
  resubmit: { dot: 'bg-muted-foreground', badge: 'bg-muted text-muted-foreground' },
  withdraw: { dot: 'bg-muted-foreground', badge: 'bg-muted text-muted-foreground' },
  start_review: { dot: 'bg-blue-500', badge: 'bg-blue-500/10 text-blue-600' },
  request_changes: { dot: 'bg-amber-500', badge: 'bg-amber-500/10 text-amber-600' },
  reject: { dot: 'bg-destructive', badge: 'bg-destructive/10 text-destructive' },
  unpublish: { dot: 'bg-amber-500', badge: 'bg-amber-500/10 text-amber-600' },
  publish: { dot: 'bg-emerald-500', badge: 'bg-emerald-500/10 text-emerald-600' },
  metadata_corrected: { dot: 'bg-muted-foreground', badge: 'bg-muted text-muted-foreground' },
  archive: { dot: 'bg-muted-foreground', badge: 'bg-muted text-muted-foreground' },
  restore: { dot: 'bg-emerald-500', badge: 'bg-emerald-500/10 text-emerald-600' },
  delete: { dot: 'bg-destructive', badge: 'bg-destructive/10 text-destructive' },
  organization_delist: { dot: 'bg-muted-foreground', badge: 'bg-muted text-muted-foreground' },
  organization_archive: { dot: 'bg-muted-foreground', badge: 'bg-muted text-muted-foreground' },
  organization_restore: { dot: 'bg-emerald-500', badge: 'bg-emerald-500/10 text-emerald-600' },
};

function toneForAction(action: ModerationActionValue) {
  return actionTone[action] ?? { dot: 'bg-muted-foreground', badge: 'bg-muted text-muted-foreground' };
}

const historyDateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});

function formatEventTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return historyDateFormatter.format(date);
}

export function DesignerProjectModeration({
  projectId,
  status,
  moderationNote,
  rejectionReasonCode,
  rejectionReasonCodes,
  showFeedbackAlert = true,
}: {
  projectId: string | null;
  status: ProjectStatus | null;
  moderationNote: string | null;
  rejectionReasonCode: ModerationReasonCode | null;
  rejectionReasonCodes?: ModerationReasonCode[];
  showFeedbackAlert?: boolean;
}) {
  const [history, setHistory] = useState<ModerationHistoryResponse['items'] | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Bumped on every fetch so the spinner icon remounts and its CSS spin
  // animation restarts each refresh (reusing the same node would not replay it).
  const [refreshKey, setRefreshKey] = useState(0);
  const isChangesRequested = status === 'changes_requested';
  const isRejected = status === 'rejected';
  const hasFeedback = isChangesRequested || isRejected;
  const feedbackReasons = rejectionReasonCodes?.length
    ? rejectionReasonCodes
    : rejectionReasonCode
      ? [rejectionReasonCode]
      : [];

  // Real server refetch of the moderation timeline. Deliberately does NOT clear
  // `history` first: while the request is pending the previously loaded events
  // stay visible (only the Refresh control shows a spinner). E-270 owns the
  // underlying "refresh actually refetches" fix; this drawer always calls the
  // endpoint on open and on every explicit refresh, so it consumes that fix
  // without adding competing caching/short-circuit logic.
  function fetchHistory() {
    if (!projectId) return;
    setError(null);
    setRefreshKey((key) => key + 1);
    startTransition(async () => {
      try {
        const response = await api.api.projects[':id']['moderation-history'].$get({
          param: { id: projectId },
        });
        const payload: unknown = await response.json();
        const parsed = moderationHistoryResponseSchema.safeParse(payload);
        if (!response.ok || !parsed.success) {
          setError('Could not load moderation history.');
          return;
        }
        setHistory(parsed.data.items);
      } catch {
        setError('Could not load moderation history.');
      }
    });
  }

  function openDrawer() {
    setDrawerOpen(true);
    // Fetch on first open; if events are already loaded they stay visible and
    // the designer can pull fresh events with the in-drawer Refresh control.
    if (!history) fetchHistory();
  }

  if (!projectId) return null;

  const showInitialLoading = isPending && !history;
  const showEmpty = !!history && history.length === 0 && !isPending;
  const showTimeline = !!history && history.length > 0;

  return (
    <div className="mt-6 space-y-3">
      {hasFeedback && showFeedbackAlert ? (
        <Alert variant={isRejected ? 'destructive' : 'default'}>
          <AlertCircle className="size-4" />
          <AlertTitle>{isRejected ? 'This project was rejected' : 'Needs Change'}</AlertTitle>
          <AlertDescription>
            <ProjectModerationReasons reasonCodes={feedbackReasons} />
            {moderationNote ? <span className="mt-1 block">{moderationNote}</span> : null}
            {!moderationNote && feedbackReasons.length === 0 ? (
              <span>Review feedback is available in the moderation history.</span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <Button type="button" variant="outline" size="sm" onClick={openDrawer}>
        <Clock3 className="size-4" />
        View moderation history
      </Button>

      {/*
        E-279: moderation history now uses the established right-side drawer
        pattern (Radix Dialog anchored to the right edge, mirroring the admin
        moderation drawer in admin-moderation-queue.tsx). Radix provides the
        overlay, Escape-to-close, focus trap, and focus return to the trigger;
        DialogContent's built-in close button gives an accessible Close.
      */}
      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogContent
          className="left-auto right-0 top-0 flex h-[100dvh] max-h-none w-full max-w-md translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none border-y-0 border-r-0 p-0"
          overlayClassName="bg-foreground/30"
        >
          <div className="flex items-start justify-between gap-4 border-b border-border p-5">
            <div className="min-w-0">
              <DialogTitle className="text-base">Moderation history</DialogTitle>
              <DialogDescription className="text-xs">
                Review actions for this project.
              </DialogDescription>
            </div>
            {/* Icon-only Refresh. Real refetch; existing events stay visible. */}
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={fetchHistory}
              disabled={isPending}
              aria-label="Refresh moderation history"
              title="Refresh moderation history"
              className="mr-8 shrink-0"
            >
              {isPending ? (
                <Loader2 key={refreshKey} className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
            </Button>
          </div>

          <div className="space-y-3 p-5">
            {error ? (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="size-4 shrink-0" />
                  {error}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={fetchHistory}
                  disabled={isPending}
                >
                  {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Try again
                </Button>
              </div>
            ) : null}

            {showInitialLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading history…
              </p>
            ) : null}

            {showEmpty ? (
              <p className="text-sm text-muted-foreground">No moderation actions yet.</p>
            ) : null}

            {showTimeline ? (
              <ol
                className={cn(
                  'relative space-y-4 pl-6',
                  // Continuous connector line running down the left of the dots.
                  'before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-border',
                  isPending && 'opacity-60 transition-opacity',
                )}
              >
                {history.map((item) => {
                  const tone = toneForAction(item.action);
                  const reasonCodes =
                    item.reasonCodes.length > 0
                      ? item.reasonCodes
                      : item.reasonCode
                        ? [item.reasonCode]
                        : [];
                  const eventTime = formatEventTime(item.createdAt);
                  return (
                    <li key={item.id} className="relative">
                      {/* Timeline dot, sits on the connector line. */}
                      <span
                        className={cn(
                          'absolute -left-6 top-1 size-[11px] rounded-full ring-4 ring-background',
                          tone.dot,
                        )}
                        aria-hidden="true"
                      />
                      <div className="rounded-lg border border-border/70 bg-card p-3 shadow-sm">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold',
                              tone.badge,
                            )}
                          >
                            {actionLabel(item.action)}
                          </span>
                          {eventTime ? (
                            <time
                              className="ml-auto text-[11px] text-muted-foreground"
                              dateTime={item.createdAt}
                            >
                              {eventTime}
                            </time>
                          ) : null}
                        </div>
                        <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                          <span className="capitalize">{item.fromStatus.replaceAll('_', ' ')}</span>
                          <span aria-hidden="true">→</span>
                          <span className="capitalize font-medium text-foreground/80">
                            {item.toStatus.replaceAll('_', ' ')}
                          </span>
                          <span className="mx-1 text-border" aria-hidden="true">
                            ·
                          </span>
                          <span>by {item.actorLabel}</span>
                        </p>
                        {item.note ? (
                          <p className="mt-2 text-sm leading-relaxed text-foreground">{item.note}</p>
                        ) : null}
                        {reasonCodes.length > 0 ? (
                          <div className="mt-2">
                            <ProjectModerationReasons reasonCodes={reasonCodes} />
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
