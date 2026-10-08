import Image from 'next/image';
import { BadgeCheck } from 'lucide-react';
import type { PublicPortfolioReview } from '@repo/contracts';
import { Card } from '@repo/ui/components/card';
import { Rating } from '@repo/ui/components/reui/rating';
import { GoogleBrandIcon, TickifBrandIcon } from '@/components/brand-icons';
import { studioInitials } from '@/lib/public-portfolio-view';

/** The profile's attributed review card, shared by both review sources. */
export function ProfileReviewCard({ review }: { review: PublicPortfolioReview }) {
  return (
    <Card role="article" className="profile-review-card">
      <Rating rating={review.rating} size="sm" />
      <p className="profile-review-quote">{review.text ? `“${review.text}”` : 'Rating only'}</p>
      <footer className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {review.avatarUrl ? (
            <Image
              src={review.avatarUrl}
              alt=""
              width={32}
              height={32}
              unoptimized
              className="size-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs">
              {studioInitials(review.author)}
            </span>
          )}
          <p className="flex min-w-0 items-center gap-1 text-sm">
            <span className="break-words">{review.author}</span>
            {review.verifiedConsultation ? (
              <BadgeCheck
                aria-label="Verified client"
                className="size-4 shrink-0 fill-primary text-primary-foreground"
              />
            ) : null}
          </p>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {review.relativeTime} ·{' '}
          {review.source === 'google' ? (
            <GoogleBrandIcon className="size-3" />
          ) : (
            <TickifBrandIcon className="size-3" />
          )}
          {review.source === 'google' ? 'Google' : 'Tickif'}
        </p>
      </footer>
    </Card>
  );
}
