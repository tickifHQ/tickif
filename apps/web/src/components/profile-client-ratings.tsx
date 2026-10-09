'use client';

import { useEffect, useState } from 'react';
import type { PublicPortfolioResponse, PublishedReviewsResponse } from '@repo/contracts';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from '@repo/ui/components/carousel';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from '@repo/ui/components/pagination';
import { ProfileReviewCard } from '@/components/profile-review-card';
import { ProfileRatingSummary } from '@/components/profile-rating-summary';

const REVIEWS_PER_PAGE = 2;

/** Google-only composition; each carousel slide contains at most two reviews. */
export function ProfileClientRatings({ portfolio }: { portfolio: PublicPortfolioResponse }) {
  const [api, setApi] = useState<CarouselApi>();
  const [page, setPage] = useState(0);
  const reviews = portfolio.reviewVisibility.google.reviews
    ? portfolio.reviews.filter((review) => review.source === 'google')
    : [];
  const aggregate =
    portfolio.sections.overallRating && portfolio.reviewVisibility.google.overallRating
      ? portfolio.stats.google
      : null;
  const histogram: PublishedReviewsResponse['histogram'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const review of reviews) {
    const star = Math.round(review.rating);
    if (star >= 1 && star <= 5) histogram[star as keyof typeof histogram] += 1;
  }
  const pages = Array.from({ length: Math.ceil(reviews.length / REVIEWS_PER_PAGE) }, (_, index) =>
    reviews.slice(index * REVIEWS_PER_PAGE, (index + 1) * REVIEWS_PER_PAGE),
  );

  useEffect(() => {
    if (!api) return;
    const sync = () => setPage(api.selectedScrollSnap());
    api.on('select', sync);
    api.on('reInit', sync);
    return () => {
      api.off('select', sync);
      api.off('reInit', sync);
    };
  }, [api]);

  return (
    <div className="profile-client-ratings">
      {aggregate && aggregate.reviewCount > 0 ? (
        <ProfileRatingSummary
          source="google"
          {...aggregate}
          histogram={reviews.length ? histogram : undefined}
          histogramCount={reviews.length}
        />
      ) : null}
      {pages.length ? (
        <>
          <div className="profile-review-caption">
            <span>Google reviews</span>
            <span aria-live="polite">
              {page * REVIEWS_PER_PAGE + 1}–
              {Math.min((page + 1) * REVIEWS_PER_PAGE, reviews.length)} of {reviews.length}
            </span>
          </div>
          <Carousel
            setApi={setApi}
            opts={{ align: 'start', containScroll: 'trimSnaps' }}
            aria-label="Google client reviews"
            tabIndex={0}
          >
            <CarouselContent>
              {pages.map((items, index) => (
                <CarouselItem
                  key={items[0]!.id}
                  aria-label={`Review page ${index + 1}`}
                  aria-hidden={index !== page}
                  inert={index !== page}
                >
                  <div
                    data-testid={index === page ? 'profile-review-cards' : undefined}
                    className="profile-review-cards"
                  >
                    {items.map((review) => (
                      <ProfileReviewCard key={review.id} review={review} />
                    ))}
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            {pages.length > 1 ? (
              <Pagination aria-label="Google review pages" className="mt-5">
                <PaginationContent>
                  <PaginationItem>
                    <CarouselPrevious className="static m-0" aria-label="Previous client reviews" />
                  </PaginationItem>
                  {pages.map((_, index) => (
                    <PaginationItem key={index}>
                      <PaginationLink asChild isActive={page === index}>
                        <button
                          type="button"
                          aria-label={`Go to review page ${index + 1}`}
                          onClick={() => {
                            setPage(index);
                            api?.scrollTo(index);
                          }}
                        >
                          {index + 1}
                        </button>
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <CarouselNext className="static m-0" aria-label="Next client reviews" />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            ) : null}
          </Carousel>
        </>
      ) : null}
    </div>
  );
}
