'use client';

import { useState } from 'react';
import type { ParticipantReview, PublishedReviewsResponse, ReviewResponse } from '@repo/contracts';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { ReviewEditor } from '@/components/review-editor';
import { fetchOwnReview, fetchTickifReviews } from '@/lib/reviews-api';
import { userFacingErrorMessage } from '@/lib/user-facing-error';
import { ActionLoginDialog } from '@/components/action-login-dialog';
import { ProfileRatingSummary } from '@/components/profile-rating-summary';
import { ProfileReviewCard } from '@/components/profile-review-card';

export function TickifReviews({
  designerProfileId,
  bookingId,
  initialPage,
  initialOwn,
  canWrite,
  loginHref,
  viewerMessage,
  initialError,
  pageSize = 10,
  embedded = false,
  showOverallRating = true,
}: {
  designerProfileId: string;
  bookingId?: string;
  initialPage: PublishedReviewsResponse | null;
  initialOwn: ParticipantReview | null;
  canWrite: boolean;
  loginHref?: string;
  viewerMessage?: string;
  initialError?: string;
  pageSize?: number;
  embedded?: boolean;
  showOverallRating?: boolean;
}) {
  const [page, setPage] = useState(initialPage);
  const [own, setOwn] = useState(initialOwn);
  const [error, setError] = useState(initialError ?? '');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  async function reload(targetPage = page?.page ?? 1) {
    setBusy(true);
    setError('');
    try {
      const [requestedPage, mine] = await Promise.all([
        pageSize === 10
          ? fetchTickifReviews(designerProfileId, targetPage)
          : fetchTickifReviews(designerProfileId, targetPage, pageSize),
        canWrite ? fetchOwnReview(designerProfileId) : Promise.resolve(null),
      ]);
      const resolvedPage = Math.min(targetPage, Math.max(requestedPage.totalPages, 1));
      const published =
        resolvedPage === targetPage
          ? requestedPage
          : pageSize === 10
            ? await fetchTickifReviews(designerProfileId, resolvedPage)
            : await fetchTickifReviews(designerProfileId, resolvedPage, pageSize);
      setPage(published);
      if (mine) setOwn(mine.item);
      const url = new URL(window.location.href);
      url.searchParams.set('reviewsPage', String(resolvedPage));
      window.history.replaceState(null, '', url);
    } catch (cause) {
      setError(userFacingErrorMessage(cause, 'Could not load reviews. Please try again.'));
      throw cause;
    } finally {
      setBusy(false);
    }
  }
  async function onSaved(review: ReviewResponse) {
    const previous = own?.review.id === review.id ? own : null;
    setOwn({
      review,
      canEdit: true,
      editableUntil: null,
      dispute: previous?.dispute ?? null,
      resolution: previous?.resolution ?? null,
    });
    if (previous?.review.status === 'published') setPage(null);
    setEditing(false);
    setSaved(true);
    try {
      await reload(1);
    } catch {
      // The mutation already committed. `reload` displays the refresh failure separately.
    }
  }
  const hasPublishedReviews = !!page && (page.reviewCount > 0 || page.items.length > 0);
  if (!hasPublishedReviews && !own && !canWrite && !error && !saved) return null;

  return (
    <section
      id="tickif-reviews"
      className={embedded ? 'profile-tickif-reviews' : 'profile-shell profile-section'}
      aria-label={embedded ? 'Tickif client reviews' : undefined}
      aria-labelledby={embedded ? undefined : 'tickif-reviews-title'}
    >
      <div className="mx-auto flex w-full flex-col gap-6">
        {!embedded ? (
          <header className="border-b pb-6">
            <h2 id="tickif-reviews-title" className="profile-heading">
              Tickif community reviews
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Ratings from Tickif members. Google reviews are attributed separately above.
            </p>
          </header>
        ) : null}
        {!embedded ? (
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
        ) : null}
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
            {embedded && page.reviewCount === 0 ? (
              <p className="py-7 text-sm text-muted-foreground">No published Tickif reviews yet.</p>
            ) : null}
            {embedded ? (
              showOverallRating && page.reviewCount > 0 ? (
                <ProfileRatingSummary
                  source="tickif"
                  rating={page.averageRating}
                  reviewCount={page.reviewCount}
                  histogram={page.histogram}
                />
              ) : null
            ) : showOverallRating ? (
              <div className="flex flex-col gap-6 rounded-card border p-7 md:flex-row md:items-center md:gap-10">
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
            ) : null}
            {embedded && page.items.length > 0 ? (
              <div className="profile-review-caption">
                <span>Client reviews</span>
                <span aria-live="polite">
                  {(page.page - 1) * pageSize + 1}–
                  {(page.page - 1) * pageSize + Math.min(page.items.length, pageSize)} of{' '}
                  {page.reviewCount}
                </span>
              </div>
            ) : null}
            <div
              data-testid={embedded ? 'profile-review-cards' : undefined}
              className={embedded ? 'profile-review-cards' : 'grid gap-4 md:grid-cols-2'}
            >
              {page.items.slice(0, pageSize).map((review) =>
                embedded ? (
                  <ProfileReviewCard
                    key={review.id}
                    review={{
                      id: review.id,
                      author: review.author.name,
                      avatarUrl: review.author.avatarUrl,
                      rating: review.rating,
                      text: review.body,
                      source: 'tickif',
                      relativeTime: review.publishedAt?.slice(0, 10) ?? '',
                      verifiedConsultation: review.verifiedConsultation,
                    }}
                  />
                ) : (
                  <article
                    key={review.id}
                    className="flex flex-col gap-3 rounded-card bg-muted p-6"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{review.author.name}</h3>
                      <span className="text-sm">{review.rating} / 5 stars</span>
                      {review.verifiedConsultation ? (
                        <Badge variant="secondary">Verified client</Badge>
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
                ),
              )}
            </div>
            <nav
              aria-label="Tickif reviews pages"
              className={
                embedded ? 'profile-review-pagination' : 'flex flex-wrap items-center gap-3'
              }
            >
              <Button
                type="button"
                variant={embedded ? 'ghost' : 'outline'}
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
                variant={embedded ? 'ghost' : 'outline'}
                disabled={busy || page.page >= page.totalPages}
                onClick={() => {
                  void reload(page.page + 1).catch(() => undefined);
                }}
              >
                Next reviews
              </Button>
            </nav>
            {embedded ? (
              <Button
                type="button"
                variant="ghost"
                className="self-end"
                disabled={busy}
                onClick={() => {
                  void reload().catch(() => undefined);
                }}
              >
                Refresh reviews
              </Button>
            ) : null}
          </>
        ) : null}
        {saved ? (
          <p role="status" className="text-sm">
            Your review was saved and is awaiting moderation.
          </p>
        ) : null}
        {loginHref ? (
          <Button type="button" onClick={() => setLoginOpen(true)}>
            Sign in to write a review
          </Button>
        ) : null}
        {loginHref ? (
          <ActionLoginDialog open={loginOpen} onOpenChange={setLoginOpen} loginHref={loginHref} />
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
