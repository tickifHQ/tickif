'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ParticipantReview, PublishedReviewsResponse } from '@repo/contracts';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { ReviewEditor } from '@/components/review-editor';
import { fetchOwnReview, fetchTickifReviews } from '@/lib/reviews-api';
import { userFacingErrorMessage } from '@/lib/user-facing-error';

export function TickifReviews({
  designerProfileId,
  bookingId,
  initialPage,
  initialOwn,
  canWrite,
  loginHref,
  viewerMessage,
  initialError,
}: {
  designerProfileId: string;
  bookingId?: string;
  initialPage: PublishedReviewsResponse | null;
  initialOwn: ParticipantReview | null;
  canWrite: boolean;
  loginHref?: string;
  viewerMessage?: string;
  initialError?: string;
}) {
  const [page, setPage] = useState(initialPage);
  const [own, setOwn] = useState(initialOwn);
  const [error, setError] = useState(initialError ?? '');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  async function reload(targetPage = page?.page ?? 1) {
    setBusy(true);
    setError('');
    try {
      const [published, mine] = await Promise.all([
        fetchTickifReviews(designerProfileId, targetPage),
        canWrite ? fetchOwnReview(designerProfileId) : Promise.resolve(null),
      ]);
      setPage(published);
      if (mine) setOwn(mine.item);
      const url = new URL(window.location.href);
      url.searchParams.set('reviewsPage', String(targetPage));
      window.history.replaceState(null, '', url);
    } catch (cause) {
      setError(userFacingErrorMessage(cause, 'Could not load reviews. Please try again.'));
      throw cause;
    } finally {
      setBusy(false);
    }
  }
  async function onSaved() {
    await reload(1);
    setEditing(false);
    setSaved(true);
  }
  return (
    <section
      id="tickif-reviews"
      className="border-t border-border px-5 py-12 sm:px-8"
      aria-labelledby="tickif-reviews-title"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header>
          <h2 id="tickif-reviews-title" className="font-display text-2xl font-medium">
            Tickif community reviews
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ratings from Tickif members. Google reviews are attributed separately above.
          </p>
        </header>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            void reload()
              .then(() => setEditing(false))
              .catch(() => undefined);
          }}
        >
          Refresh reviews
        </Button>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error}
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  void reload().catch(() => undefined);
                }}
              >
                Reload reviews
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {page ? (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-10">
              <p className="text-lg">
                <strong>
                  {page.reviewCount ? page.averageRating.toFixed(1) : 'No ratings yet'}
                </strong>
                {page.reviewCount ? ` / 5 · ${page.reviewCount} Tickif reviews` : null}
              </p>
              <dl className="flex flex-1 flex-col gap-2" aria-label="Tickif rating distribution">
                {([5, 4, 3, 2, 1] as const).map((rating) => (
                  <div key={rating} className="flex items-center gap-3 text-sm">
                    <dt className="w-14">{rating} stars</dt>
                    <dd className="flex flex-1 items-center gap-3">
                      <meter
                        aria-label={`${rating} star reviews`}
                        min={0}
                        max={Math.max(page.reviewCount, 1)}
                        value={page.histogram[rating]}
                        className="w-full"
                      />
                      {page.histogram[rating]}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="flex flex-col gap-4">
              {page.items.map((review) => (
                <article
                  key={review.id}
                  className="flex flex-col gap-2 rounded-lg border border-border p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{review.author.name}</h3>
                    <span className="text-sm">{review.rating} / 5 stars</span>
                    {review.verifiedConsultation ? (
                      <Badge variant="secondary">Verified consultation</Badge>
                    ) : null}
                  </div>
                  {review.body ? (
                    <p className="whitespace-pre-wrap break-words text-sm">{review.body}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Rating only</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Published {review.publishedAt?.slice(0, 10)}
                  </p>
                </article>
              ))}
            </div>
            <nav aria-label="Tickif reviews pages" className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={busy || page.page <= 1}
                onClick={() => {
                  void reload(page.page - 1).catch(() => undefined);
                }}
              >
                Previous reviews
              </Button>
              <span className="text-sm">
                Page {page.page} of {Math.max(page.totalPages, 1)}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={busy || page.page >= page.totalPages}
                onClick={() => {
                  void reload(page.page + 1).catch(() => undefined);
                }}
              >
                Next reviews
              </Button>
            </nav>
          </>
        ) : null}
        {saved ? (
          <p role="status" className="text-sm">
            Your review was saved and is awaiting moderation.
          </p>
        ) : null}
        {loginHref ? (
          <Button asChild>
            <Link href={loginHref}>Sign in to write a review</Link>
          </Button>
        ) : null}
        {viewerMessage ? <p className="text-sm text-muted-foreground">{viewerMessage}</p> : null}
        {own ? (
          <section
            className="flex flex-col gap-3 rounded-lg border border-border p-4"
            aria-label="Your review"
          >
            <h3 className="font-medium">Your review</h3>
            <p className="text-sm">
              {own.review.rating} / 5 · <Badge variant="secondary">{own.review.status}</Badge>
            </p>
            {own.review.body ? (
              <p className="whitespace-pre-wrap break-words text-sm">{own.review.body}</p>
            ) : null}
            {own.review.status === 'pending' ? (
              <p className="text-sm text-muted-foreground">
                Only you and the moderation team can see your review before publication.
              </p>
            ) : null}
            {own.editableUntil ? (
              <p className="text-sm text-muted-foreground">
                Editing closes {own.editableUntil.slice(0, 16).replace('T', ' ')} UTC.
              </p>
            ) : null}
            {own.resolution ? (
              <p className="text-sm">
                Dispute resolved:{' '}
                {own.resolution.decision === 'publish' ? 'Review published' : 'Review removed'}.{' '}
                {own.resolution.note}
              </p>
            ) : null}
            {canWrite && own.canEdit && !editing ? (
              <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                Edit your review
              </Button>
            ) : null}
            {editing ? (
              <ReviewEditor
                key={own.review.moderationRevision}
                designerProfileId={designerProfileId}
                existing={own}
                onSaved={onSaved}
                onCancel={() => setEditing(false)}
              />
            ) : null}
          </section>
        ) : canWrite && !error ? (
          <ReviewEditor
            designerProfileId={designerProfileId}
            bookingId={bookingId}
            onSaved={onSaved}
          />
        ) : null}
      </div>
    </section>
  );
}
