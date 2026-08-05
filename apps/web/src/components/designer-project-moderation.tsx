'use client';

import { useState, useTransition } from 'react';
import type { ModerationHistoryResponse, ProjectStatus } from '@repo/contracts';
import { moderationHistoryResponseSchema } from '@repo/contracts';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import { AlertCircle, Clock3, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

function humanizeReason(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

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
}: {
  projectId: string | null;
  status: ProjectStatus | null;
  moderationNote: string | null;
  rejectionReasonCode: string | null;
}) {
  const [history, setHistory] = useState<ModerationHistoryResponse['items'] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isChangesRequested = status === 'changes_requested';
  const isRejected = status === 'rejected';
  const hasFeedback = isChangesRequested || isRejected;

  function loadHistory() {
    if (!projectId) return;
    setError(null);
    setHistoryOpen(true);
    if (history) return;

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

  if (!projectId) return null;

  return (
    <div className="mt-6 space-y-3">
      {hasFeedback ? (
        <Alert variant={isRejected ? 'destructive' : 'default'}>
          <AlertCircle className="size-4" />
          <AlertTitle>{isRejected ? 'This project was rejected' : 'Needs Change'}</AlertTitle>
          <AlertDescription>
            {rejectionReasonCode ? (
              <span className="block font-medium">
                Reason: {humanizeReason(rejectionReasonCode)}
              </span>
            ) : null}
            {moderationNote ? <span className="mt-1 block">{moderationNote}</span> : null}
            {!moderationNote && !rejectionReasonCode ? (
              <span>Review feedback is available in the moderation history.</span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <Button type="button" variant="outline" size="sm" onClick={loadHistory} disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Clock3 className="size-4" />}
        {historyOpen ? 'Refresh moderation history' : 'View moderation history'}
      </Button>

      {historyOpen ? (
        <Card className="space-y-3 p-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Moderation history</h2>
            <p className="text-xs text-muted-foreground">Review actions for this project.</p>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {isPending && !history ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading history…
            </p>
          ) : null}
          {history && history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No moderation actions yet.</p>
          ) : null}
          {history && history.length > 0 ? (
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
                  {item.note ? <p className="mt-1 text-sm text-foreground">{item.note}</p> : null}
                </li>
              ))}
            </ol>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
