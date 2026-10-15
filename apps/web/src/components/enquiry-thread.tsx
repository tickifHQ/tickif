'use client';

import { startTransition, useEffect, useRef, useState } from 'react';
import {
  enquiryMessageSchema,
  enquiryActivityResultSchema,
  enquiryThreadSchema,
  sendEnquiryMessageSchema,
  type EnquiryThread as Thread,
} from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { Field, FieldLabel } from '@repo/ui/components/field';
import { Textarea } from '@repo/ui/components/textarea';
import { Skeleton } from '@repo/ui/components/skeleton';
import { Send } from 'lucide-react';
import { api } from '@/lib/api';
import { refreshVisitorHomeActivity } from '@/lib/visitor-activity.actions';
import { latestEnquiryReadWatermark } from '@/lib/enquiry-read-watermark';

type Target = { kind: 'lead' | 'visitor'; id: string };
export function EnquiryThread({
  target,
  readThrough,
  onRead,
}: {
  target: Target;
  readThrough?: string;
  onRead?: (id: string, through: string) => void;
}) {
  const [data, setData] = useState<Thread | null>(null);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState(false);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<{ body: string; requestId: string } | null>(null);
  const { kind, id } = target;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setActivityError(false);
    void (async () => {
      const params = { param: { id }, query: { page, limit: 20 } };
      const response =
        kind === 'lead'
          ? await api.api.leads[':id'].messages.$get(params, {
              init: { signal: controller.signal, cache: 'no-store' },
            })
          : await api.api.enquiries[':id'].messages.$get(params, {
              init: { signal: controller.signal, cache: 'no-store' },
            });
      if (!response.ok) throw new Error('Could not load messages.');
      const parsed = enquiryThreadSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error('Invalid messages.');
      if (controller.signal.aborted) return;
      setData(parsed.data);
    })()
      .catch(() => {
        if (!controller.signal.aborted) setError('Could not load messages. Please retry.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, kind, page, retry]);

  useEffect(() => {
    if (loading || error || !data?.enquiryId) return;
    const thread = data;
    const controller = new AbortController();
    let started = false;
    async function acknowledge() {
      // Mark only a rendered thread in a visible tab, never a background preload.
      if (document.visibilityState !== 'visible' || started) return;
      started = true;
      try {
        const options = { init: { signal: controller.signal } };
        const messageTime = thread.messages[0]?.createdAt;
        const through = latestEnquiryReadWatermark([readThrough, thread.readThrough, messageTime]);
        const acknowledged =
          kind === 'lead'
            ? await api.api.leads[':id'].viewed.$post({ param: { id } }, options)
            : through
              ? await api.api.enquiries[':id'].read.$post(
                  { param: { id }, json: { through } },
                  options,
                )
              : null;
        const result = acknowledged?.ok
          ? enquiryActivityResultSchema.safeParse(await acknowledged.json())
          : null;
        const confirmed = result?.success && result.data.acknowledged;
        if (!confirmed && !controller.signal.aborted) setActivityError(true);
        if (kind === 'visitor' && confirmed && through && !controller.signal.aborted) {
          onRead?.(id, through);
          startTransition(async () => {
            try {
              await refreshVisitorHomeActivity();
            } catch {
              if (!controller.signal.aborted) setActivityError(true);
            }
          });
        }
      } catch {
        if (!controller.signal.aborted) setActivityError(true);
      }
    }
    const onVisible = () => {
      void acknowledge();
    };
    onVisible();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      controller.abort();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [data, error, id, kind, loading, readThrough, onRead]);

  async function send() {
    if (busy || !data?.canReply) return;
    const trimmed = body.trim();
    if (request.current?.body !== trimmed)
      request.current = { body: trimmed, requestId: crypto.randomUUID() };
    const parsed = sendEnquiryMessageSchema.safeParse(request.current);
    if (!parsed.success) {
      setError('Enter a message between 1 and 2,000 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await api.api.leads[':id'].messages.$post({
        param: { id },
        json: parsed.data,
      });
      if (!response.ok) throw new Error('Send failed');
      const message = enquiryMessageSchema.safeParse(await response.json());
      if (!message.success) throw new Error('Invalid send response');
      setBody('');
      request.current = null;
      setPage(1);
      setRetry((value) => value + 1);
    } catch {
      setError('Could not send your message. Your draft is kept. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!loading && data?.enquiryId === null && !error) return null;
  return (
    <section
      aria-label="Studio messages"
      className="mt-5 flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4"
    >
      <h3 className="text-sm font-medium">Messages from the studio</h3>
      {!loading ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="self-start"
          onClick={() => setRetry((value) => value + 1)}
        >
          Refresh messages
        </Button>
      ) : null}
      {loading ? (
        <Skeleton className="h-12 w-full" aria-label="Loading messages" />
      ) : data?.messages.length ? (
        <ol className="flex flex-col gap-3">
          {data.messages.map((message) => (
            <li key={message.id} className="rounded-lg bg-muted p-3">
              <p className="break-words whitespace-pre-wrap text-sm">{message.body}</p>
              <time
                dateTime={message.createdAt}
                className="mt-1 block text-xs text-muted-foreground"
              >
                {new Intl.DateTimeFormat('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Asia/Kolkata',
                }).format(new Date(message.createdAt))}
              </time>
            </li>
          ))}
        </ol>
      ) : !error ? (
        <p className="text-xs text-muted-foreground">No studio messages yet.</p>
      ) : null}
      {error ? (
        <p role="status" className="text-xs text-destructive">
          {error}
          <Button
            type="button"
            variant="link"
            size="xs"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry
          </Button>
        </p>
      ) : null}
      {activityError ? (
        <p role="status" className="text-xs text-muted-foreground">
          Could not mark this enquiry as viewed.
          <Button
            type="button"
            variant="link"
            size="xs"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry
          </Button>
        </p>
      ) : null}
      {!loading && data ? (
        <div className="flex gap-2">
          {page > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setPage((value) => value - 1)}
            >
              Newer messages
            </Button>
          ) : null}
          {data.hasMore ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setPage((value) => value + 1)}
            >
              Older messages
            </Button>
          ) : null}
        </div>
      ) : null}
      {kind === 'lead' && data?.canReply ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          className="flex flex-col gap-3"
        >
          <Field>
            <FieldLabel htmlFor={`reply-${id}`}>Message the visitor</FieldLabel>
            <Textarea
              id={`reply-${id}`}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={2000}
              disabled={busy}
              placeholder="Send an update about their enquiry"
            />
          </Field>
          <Button
            type="submit"
            size="sm"
            className="self-start"
            disabled={busy || loading || !body.trim()}
            aria-busy={busy}
          >
            <Send aria-hidden data-icon="inline-start" />
            {busy ? 'Sending…' : 'Send message'}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
