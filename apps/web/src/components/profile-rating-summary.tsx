import type { PublishedReviewsResponse } from '@repo/contracts';
import { Rating } from '@repo/ui/components/reui/rating';
import { TickifBrandIcon } from '@/components/brand-icons';
import { formatRating } from '@/lib/public-portfolio-view';

export function ProfileRatingSummary({
  source,
  rating,
  reviewCount,
  histogram,
  histogramCount = reviewCount,
}: {
  source: 'tickif' | 'google';
  rating: number;
  reviewCount: number;
  histogram?: PublishedReviewsResponse['histogram'];
  histogramCount?: number;
}) {
  return (
    <div className="profile-review-summary">
      <div className="profile-review-aggregate">
        <div className="profile-rating-wreath">
          <img
            src="/ui/profile/ratings-container.svg"
            alt=""
            aria-hidden="true"
            className="max-w-none"
          />
          <div>
            <span className="font-display text-[44px] leading-none tracking-tight">
              {formatRating(rating)}
            </span>
            <span className="mt-2 font-mono text-2xs uppercase tracking-widest text-muted-foreground">
              Out of 5
            </span>
          </div>
        </div>
        <div className="min-w-0">
          <Rating rating={rating} />
          <p className="mt-2 font-display text-lg leading-snug">
            {source === 'tickif' ? 'Based on ' : ''}
            {reviewCount} {source === 'tickif' ? 'Tickif reviews' : 'Google reviews'}
          </p>
          {source === 'tickif' ? (
            <TickifBrandIcon
              role="img"
              aria-label="Tickif"
              className="mt-2 size-4 text-foreground"
            />
          ) : histogram && histogramCount > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {Math.round(((histogram[4] + histogram[5]) / histogramCount) * 100)}%{' '}
              {histogramCount < reviewCount ? 'of available reviews ' : ''}rated 4 stars or above
            </p>
          ) : null}
        </div>
      </div>
      {histogram ? (
        <dl
          className="profile-rating-distribution"
          aria-label={
            source === 'google'
              ? 'Available Google review distribution'
              : 'Tickif rating distribution'
          }
        >
          {([5, 4, 3, 2, 1] as const).map((rating) => (
            <div key={rating} className="profile-rating-row">
              <dt>{rating} ★</dt>
              <dd
                className="profile-rating-track"
                role="meter"
                aria-label={`${rating} star reviews`}
                aria-valuemin={0}
                aria-valuemax={Math.max(histogramCount, 1)}
                aria-valuenow={histogram[rating]}
              >
                <span
                  style={{
                    width: `${Math.min(100, (histogram[rating] / Math.max(histogramCount, 1)) * 100)}%`,
                  }}
                />
              </dd>
              <dd>{histogram[rating]}</dd>
            </div>
          ))}
          {histogramCount < reviewCount ? (
            <div className="text-xs text-muted-foreground">
              <dt className="sr-only">Sample size</dt>
              <dd>Distribution of {histogramCount} available Google reviews</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
