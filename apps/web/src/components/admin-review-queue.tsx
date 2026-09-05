'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  rejectReviewSchema,
  resolveReviewDisputeSchema,
  type AdminReviewDetailResponse,
  type AdminReviewsResponse,
} from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { Badge } from '@repo/ui/components/badge';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@repo/ui/components/dialog';
import { Label } from '@repo/ui/components/label';
import { Input } from '@repo/ui/components/input';
import { Textarea } from '@repo/ui/components/textarea';
import { EmptyState } from '@repo/ui/components/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table';
import { MessageSquare } from 'lucide-react';
import {
  fetchAdminReview,
  fetchAdminReviews,
  publishAdminReview,
  rejectAdminReview,
  resolveAdminReview,
} from '@/lib/admin-review-api';

type QueueStatus = 'pending' | 'disputed';
type Decision = 'publish' | 'reject' | 'remove';
function queueUrl(status: QueueStatus, page: number) {
  return `/review-moderation?status=${status}&page=${page}`;
}
function message(error: unknown) {
  return error instanceof Error ? error.message : 'Could not complete this request.';
}
function date(value: string) {
  return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

export function AdminReviewQueue({
  initialQueue,
  status,
  initialError,
}: {
  initialQueue: AdminReviewsResponse;
  status: QueueStatus;
  initialError?: string;
}) {
  const router = useRouter();
  const [queue, setQueue] = useState(initialQueue);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminReviewDetailResponse | null>(null);
  const [detailError, setDetailError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [note, setNote] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const request = useRef(0);

  async function refreshQueue() {
    setError(undefined);
    try {
      const next = await fetchAdminReviews({ status, page: queue.page, limit: queue.limit });
      if (next.page > Math.max(1, next.totalPages)) {
        router.replace(queueUrl(status, Math.max(1, next.totalPages)));
      } else setQueue(next);
    } catch (cause) {
      setError(message(cause));
    }
  }

  async function loadDetail(id: string) {
    const token = ++request.current;
    setOpenId(id);
    setDetail(null);
    setLoading(true);
    setDetailError('');
    setNote('');
    setReasonCode('');
    setNeedsRefresh(false);
    try {
      const next = await fetchAdminReview(id);
      if (request.current === token) setDetail(next);
    } catch (cause) {
      if (request.current === token) setDetailError(message(cause));
    } finally {
      if (request.current === token) setLoading(false);
    }
  }

  async function decide(decision: Decision) {
    if (!detail || saving || needsRefresh) return;
    const { review } = detail;
    setDetailError('');
    if (review.status === 'pending' && decision === 'reject') {
      const parsed = rejectReviewSchema.safeParse({ note, reasonCode });
      if (!parsed.success) {
        setDetailError('Enter a reason code (lowercase words separated by hyphens) and a note.');
        return;
      }
    } else if (review.status === 'disputed') {
      const parsed = resolveReviewDisputeSchema.safeParse({ decision, note });
      if (!parsed.success) {
        setDetailError('Enter a note explaining the dispute decision.');
        return;
      }
    }
    setSaving(true);
    try {
      if (review.status === 'pending') {
        if (decision === 'publish') await publishAdminReview(review.id, review.moderationRevision);
        else
          await rejectAdminReview(review.id, review.moderationRevision, {
            note: note.trim(),
            reasonCode: reasonCode.trim(),
          });
      } else if (review.status === 'disputed' && decision !== 'reject') {
        await resolveAdminReview(review.id, review.moderationRevision, {
          decision,
          note: note.trim(),
        });
      } else return;
      setOpenId(null);
      setDetail(null);
      setNotice('Review decision saved.');
      await refreshQueue();
    } catch (cause) {
      setDetailError(message(cause));
      // A failed response may hide a successful write. Require a fresh read before retrying.
      setNeedsRefresh(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Review moderation</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Review visitor feedback and resolve designer disputes. All times are in IST.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refreshQueue()}>
          Refresh queue
        </Button>
      </div>
      <nav aria-label="Review queues" className="flex gap-2">
        {(['pending', 'disputed'] as const).map((tab) => (
          <Button key={tab} asChild variant={status === tab ? 'default' : 'outline'}>
            <Link aria-current={status === tab ? 'page' : undefined} href={queueUrl(tab, 1)}>
              {tab === 'pending' ? 'Pending' : 'Disputed'}
            </Link>
          </Button>
        ))}
      </nav>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {queue.total} {status} reviews
      </p>
      {queue.items.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reviewer</TableHead>
              <TableHead>Rating / project</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>
                <span className="sr-only">Action</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.items.map((review) => (
              <TableRow key={review.id}>
                <TableCell>
                  <p>{review.author.name}</p>
                  <p className="max-w-xs truncate text-muted-foreground">
                    {review.body ?? 'Rating only'}
                  </p>
                </TableCell>
                <TableCell>
                  {review.rating} / 5
                  <p className="text-muted-foreground">
                    {review.project?.title ?? 'Designer review'}
                  </p>
                </TableCell>
                <TableCell>{date(review.updatedAt)}</TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    onClick={() => void loadDetail(review.id)}
                    aria-label={`Review feedback by ${review.author.name}`}
                  >
                    Review
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : !error ? (
        <EmptyState
          icon={<MessageSquare />}
          title={`No ${status} reviews`}
          description="New reviews will appear here when they need your attention."
        />
      ) : null}
      <nav aria-label="Review pagination" className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          disabled={queue.page <= 1}
          onClick={() => router.push(queueUrl(status, queue.page - 1))}
        >
          Previous
        </Button>
        <p className="text-sm">
          Page {queue.page} of {Math.max(1, queue.totalPages)}
        </p>
        <Button
          variant="outline"
          disabled={queue.page >= queue.totalPages}
          onClick={() => router.push(queueUrl(status, queue.page + 1))}
        >
          Next
        </Button>
      </nav>
      <Dialog
        open={openId !== null}
        onOpenChange={(open) => {
          if (!open && !saving) {
            ++request.current;
            setOpenId(null);
            setDetail(null);
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review feedback</DialogTitle>
            <DialogDescription>
              Check the review and private history before making a decision.
            </DialogDescription>
          </DialogHeader>
          {loading ? <p role="status">Loading review…</p> : null}
          {detailError ? (
            <Alert variant="destructive">
              <AlertDescription>{detailError}</AlertDescription>
            </Alert>
          ) : null}
          {!loading && openId ? (
            <Button variant="outline" disabled={saving} onClick={() => void loadDetail(openId)}>
              Refresh details
            </Button>
          ) : null}
          {detail ? (
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{detail.review.status}</Badge>
                <span>{detail.review.rating} / 5</span>
                {detail.review.verifiedConsultation ? (
                  <Badge variant="secondary">Verified consultation</Badge>
                ) : null}
              </div>
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Reviewer</dt>
                  <dd>{detail.review.author.name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Designer</dt>
                  <dd>{detail.designer.name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Project</dt>
                  <dd>{detail.review.project?.title ?? 'No linked project'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Submitted</dt>
                  <dd>{date(detail.review.createdAt)}</dd>
                </div>
                {detail.review.bookingId ? (
                  <div>
                    <dt className="text-muted-foreground">Consultation reference</dt>
                    <dd className="break-all">{detail.review.bookingId}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="whitespace-pre-wrap break-words">
                {detail.review.body ?? 'The visitor submitted a rating without a written review.'}
              </p>
              <section className="flex flex-col gap-3">
                <h2 className="font-semibold">Private moderation history</h2>
                {detail.history.length ? (
                  <ol className="flex flex-col gap-3">
                    {detail.history.map((event) => (
                      <li key={event.id} className="rounded-lg border p-3 text-sm">
                        <p className="font-medium">
                          {event.action.replaceAll('_', ' ')} → {event.toStatus}
                        </p>
                        <p className="text-muted-foreground">{date(event.createdAt)}</p>
                        {event.reasonCode ? <p>Reason: {event.reasonCode}</p> : null}
                        {event.note ? (
                          <p className="mt-2 whitespace-pre-wrap break-words">{event.note}</p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">No history recorded.</p>
                )}
              </section>
              {detail.review.status === 'pending' || detail.review.status === 'disputed' ? (
                <fieldset disabled={saving || needsRefresh} className="flex flex-col gap-3">
                  <legend className="mb-3 font-semibold">Decision</legend>
                  {detail.review.status === 'pending' ? (
                    <>
                      <Label htmlFor="review-reason">Rejection reason code</Label>
                      <Input
                        id="review-reason"
                        value={reasonCode}
                        onChange={(event) => setReasonCode(event.target.value)}
                        maxLength={80}
                        placeholder="e.g. inappropriate-content"
                      />
                    </>
                  ) : null}
                  <Label htmlFor="review-note">
                    {detail.review.status === 'pending'
                      ? 'Rejection note (required to reject)'
                      : 'Resolution note (required)'}
                  </Label>
                  <Textarea
                    id="review-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={2000}
                  />
                  <p className="text-sm text-muted-foreground">
                    Notes are recorded in the private moderation history.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={saving || needsRefresh}
                      onClick={() => void decide('publish')}
                    >
                      {detail.review.status === 'pending'
                        ? 'Publish review'
                        : 'Resolve and publish'}
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={saving || needsRefresh}
                      onClick={() =>
                        void decide(detail.review.status === 'pending' ? 'reject' : 'remove')
                      }
                    >
                      {detail.review.status === 'pending' ? 'Reject review' : 'Resolve and remove'}
                    </Button>
                  </div>
                  {saving ? <p role="status">Saving decision…</p> : null}
                </fieldset>
              ) : (
                <p role="status">
                  This review has already been moderated. Refresh the queue to see current work.
                </p>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
