'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  disputeReviewSchema,
  type OrganizationReviewsResponse,
  type ParticipantReview,
} from '@repo/contracts';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Label } from '@repo/ui/components/label';
import { Textarea } from '@repo/ui/components/textarea';
import { disputeReview } from '@/lib/reviews-api';
import { userFacingErrorMessage } from '@/lib/user-facing-error';

function ManagedReview({ item }: { item: ParticipantReview }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const review = item.review;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = disputeReviewSchema.safeParse({ note });
    if (!parsed.success) {
      setError('Provide a dispute reason of up to 2,000 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await disputeReview(review.id, review.moderationRevision, parsed.data);
      setSubmitted(true);
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(userFacingErrorMessage(cause, 'Could not send the dispute. Please try again.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">{review.author.name}</h2>
        <Badge variant="secondary">{submitted ? 'disputed' : review.status}</Badge>
      </header>
      <p className="text-sm">
        {review.rating} / 5 stars{review.verifiedConsultation ? ' · Verified consultation' : ''}
      </p>
      {review.body ? (
        <p className="whitespace-pre-wrap break-words text-sm">{review.body}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Rating only</p>
      )}
      <p className="text-xs text-muted-foreground">Submitted {review.createdAt.slice(0, 10)}</p>
      {item.dispute ? (
        <p className="text-sm">
          <strong>Dispute reason:</strong> {item.dispute.note}
        </p>
      ) : null}
      {item.resolution ? (
        <p className="text-sm">
          <strong>Resolution:</strong>{' '}
          {item.resolution.decision === 'publish' ? 'Published' : 'Removed'}. {item.resolution.note}
        </p>
      ) : null}
      {submitted ? (
        <p role="status" className="text-sm">
          Dispute submitted for moderation. The review is hidden from public ratings until resolved.
        </p>
      ) : null}
      {review.status === 'published' && !open && !submitted ? (
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          Dispute review
        </Button>
      ) : null}
      {open ? (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Label htmlFor={`dispute-${review.id}`}>Dispute reason</Label>
          <Textarea
            id={`dispute-${review.id}`}
            value={note}
            required
            maxLength={2000}
            disabled={busy}
            onChange={(event) => setNote(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Explain the specific issue. The review is hidden while the moderation team decides.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Submit dispute'}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            <Button type="button" variant="outline" onClick={() => router.refresh()}>
              Reload reviews
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
    </article>
  );
}

export function DesignerReviews({ data }: { data: OrganizationReviewsResponse }) {
  return (
    <div className="flex flex-col gap-4">
      {data.items.length ? (
        data.items.map((item) => (
          <ManagedReview key={`${item.review.id}:${item.review.moderationRevision}`} item={item} />
        ))
      ) : (
        <p className="text-sm text-muted-foreground">No reviews match this view.</p>
      )}
    </div>
  );
}
