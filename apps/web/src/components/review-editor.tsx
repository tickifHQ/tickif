'use client';

import { useState, type FormEvent } from 'react';
import {
  createReviewSchema,
  updateReviewSchema,
  type ParticipantReview,
  type ReviewResponse,
} from '@repo/contracts';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import { Label } from '@repo/ui/components/label';
import { Textarea } from '@repo/ui/components/textarea';
import { SelectField } from '@repo/ui/components/select-field';
import { editReview, submitReview } from '@/lib/reviews-api';
import { userFacingErrorMessage } from '@/lib/user-facing-error';

export function ReviewEditor({
  designerProfileId,
  bookingId,
  existing,
  onSaved,
  onCancel,
}: {
  designerProfileId: string;
  bookingId?: string;
  existing?: ParticipantReview;
  onSaved: (review: ReviewResponse) => Promise<void>;
  onCancel?: () => void;
}) {
  const [rating, setRating] = useState(String(existing?.review.rating ?? 5));
  const [body, setBody] = useState(existing?.review.body ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const input = { rating: Number(rating), body: body.trim() || null };
    const valid = updateReviewSchema.safeParse(input);
    if (!valid.success) {
      setError(
        'Choose 1–5 stars. A written review is optional; if included, use 30–2,000 characters.',
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      let saved: ReviewResponse;
      if (existing) {
        saved = await editReview(
          existing.review.id,
          existing.review.moderationRevision,
          valid.data,
        );
      } else {
        const create = createReviewSchema.safeParse({ ...input, designerProfileId, bookingId });
        if (!create.success) {
          setError('This review link is invalid. Open the studio profile and try again.');
          return;
        }
        saved = await submitReview(create.data);
      }
      await onSaved(saved);
    } catch (cause) {
      setError(
        userFacingErrorMessage(cause, 'Could not save your review. Your edits are still here.'),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={save}
      className="flex flex-col gap-4"
      aria-label={existing ? 'Edit your review' : 'Write a review'}
    >
      <fieldset disabled={busy} className="flex flex-col gap-4">
        <legend className="text-sm font-medium">Your rating</legend>
        <SelectField
          label="Your rating"
          value={rating}
          onValueChange={setRating}
          placeholder="Choose stars"
          options={[1, 2, 3, 4, 5].map((value) => ({
            value: String(value),
            label: `${value} ${value === 1 ? 'star' : 'stars'}`,
          }))}
        />
        <Label htmlFor="review-body">Your experience (optional)</Label>
        <Textarea
          id="review-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          minLength={30}
          maxLength={2000}
          rows={5}
          aria-describedby="review-body-help"
        />
        <p id="review-body-help" className="text-sm text-muted-foreground">
          30–2,000 characters when provided. Reviews are checked before publication. You can edit a
          pending review or a published review within 24 hours.
        </p>
        {bookingId && !existing ? (
          <p className="text-sm text-muted-foreground">
            Your completed consultation will be checked when you submit.
          </p>
        ) : null}
      </fieldset>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : existing ? 'Save review changes' : 'Submit review'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
