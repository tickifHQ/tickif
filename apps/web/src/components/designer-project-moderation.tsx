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
import { api } from '@/lib/api';
import { ProjectModerationReasons } from '@/components/project-moderation-reasons';

function actionLabel(action: ModerationHistoryResponse['items'][number]['action']): string {
  return action
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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
          className="left-auto right-0 top-0 h-[100dvh] max-h-none w-full max-w-md translate-x-0 translate-y-0 grid-cols-1 gap-0 overflow-y-auto rounded-none border-y-0 border-r-0 p-0"
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
                <Loader2 className="size-4 animate-spin" />
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
              <ol className="space-y-3">
                {history.map((item) => (
                  <li key={item.id} className="border-l-2 border-border pl-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-foreground">
                      <span>{actionLabel(item.action)}</span>
                      <span className="text-xs text-muted-foreground">by {item.actorLabel}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.fromStatus.replaceAll('_', ' ')} → {item.toStatus.replaceAll('_', ' ')}
                    </p>
                    {item.note ? (
                      <p className="mt-1 text-sm text-foreground">{item.note}</p>
                    ) : null}
                    <ProjectModerationReasons
                      reasonCodes={
                        item.reasonCodes.length > 0
                          ? item.reasonCodes
                          : item.reasonCode
                            ? [item.reasonCode]
                            : []
                      }
                    />
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
