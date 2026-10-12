'use client';

import Image from 'next/image';
import { ArrowUpRight, Star } from 'lucide-react';
import type { PublicPortfolioResponse, PublicPortfolioReview } from '@repo/contracts';
import { GoogleBrandIcon } from '@/components/brand-icons';
import { formatRating, studioInitials } from '@/lib/public-portfolio-view';

const REVIEW_LIMIT = 3;

function ReviewStars({ rating }: { rating: number }) {
  return (
    <span className="profile-google-review-stars" aria-label={`${formatRating(rating)} out of 5`}>
      {Array.from({ length: 5 }, (_, index) => {
        const filled = index < Math.round(rating);
        return (
          <Star
            key={index}
            aria-hidden="true"
            className={filled ? 'profile-star-filled' : undefined}
          />
        );
      })}
    </span>
  );
}

function ReviewerAvatar({ review }: { review: PublicPortfolioReview }) {
  if (review.avatarUrl) {
    return (
      <Image
        src={review.avatarUrl}
        alt=""
        width={40}
        height={40}
        unoptimized
        className="profile-google-review-avatar"
      />
    );
  }
  return <span className="profile-google-review-avatar">{studioInitials(review.author)}</span>;
}

function GoogleReviewCard({ review }: { review: PublicPortfolioReview }) {
  return (
    <article className="profile-google-review-card">
      <header className="profile-google-review-head">
        <ReviewerAvatar review={review} />
        <div className="profile-google-review-author">
          <p>
            <span>{review.author}</span>
            <GoogleBrandIcon className="profile-google-inline-icon" />
          </p>
          <span>Google review · {review.relativeTime}</span>
        </div>
        <ReviewStars rating={review.rating} />
      </header>
      <p className="profile-google-review-copy">{review.text ? `“${review.text}”` : 'Rating only'}</p>
    </article>
  );
}

/** Google-only composition matching the public portfolio Figma review section. */
export function ProfileClientRatings({ portfolio }: { portfolio: PublicPortfolioResponse }) {
  const reviews = portfolio.reviewVisibility.google.reviews
    ? portfolio.reviews.filter((review) => review.source === 'google')
    : [];
  const aggregate =
    portfolio.sections.overallRating && portfolio.reviewVisibility.google.overallRating
      ? portfolio.stats.google
      : null;
  const visibleReviews = reviews.slice(0, REVIEW_LIMIT);
  const rating = aggregate?.rating ?? visibleReviews[0]?.rating ?? 0;
  const reviewCount = aggregate?.reviewCount ?? reviews.length;
  const location = portfolio.cities[0] ? `${portfolio.displayName} · ${portfolio.cities[0]}` : portfolio.displayName;

  return (
    <div className="profile-client-ratings">
      {aggregate && aggregate.reviewCount > 0 ? (
        <aside className="profile-google-summary" aria-label="Google rating summary">
          <div className="profile-google-summary-score">
            <strong>{formatRating(rating)}</strong>
            <div>
              <ReviewStars rating={rating} />
              <p>{reviewCount} reviews on Google</p>
            </div>
          </div>
          <div className="profile-google-business">
            <GoogleBrandIcon className="profile-google-business-icon" />
            <div>
              <p>{location}</p>
              <span>Google Business Profile</span>
            </div>
          </div>
          <p className="profile-google-disclaimer">
            Reviews are pulled directly from Google and shown unedited. tickif can&apos;t remove or
            reorder them.
          </p>
          <div className="profile-google-actions">
            {portfolio.googleActions ? (
              <a href={portfolio.googleActions.readAllUrl} target="_blank" rel="noopener noreferrer">
                Read all {reviewCount} on Google
                <ArrowUpRight aria-hidden="true" />
              </a>
            ) : (
              <button type="button" disabled>
                Read all {reviewCount} on Google
                <ArrowUpRight aria-hidden="true" />
              </button>
            )}
            {portfolio.googleActions ? (
              <a
                href={portfolio.googleActions.writeReviewUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Worked with them? Write a review
              </a>
            ) : (
              <button type="button" disabled>
                Worked with them? Write a review
              </button>
            )}
          </div>
        </aside>
      ) : null}
      {visibleReviews.length ? (
        <div className="profile-google-reviews">
          <div className="profile-google-review-caption">
            <span>Most recent</span>
            <span>
              {visibleReviews.length} of {reviewCount || visibleReviews.length}
            </span>
          </div>
          <div data-testid="profile-review-cards" className="profile-review-cards">
            {visibleReviews.map((review) => (
              <GoogleReviewCard key={review.id} review={review} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
