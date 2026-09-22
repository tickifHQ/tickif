import { GoogleBrandIcon } from '@/components/brand-icons';

/** Public, non-interactive aggregate only; never exposes a Google review URL. */
export function PublicGoogleRating({
  rating,
  reviewCount,
}: {
  rating: number;
  reviewCount: number;
}) {
  return (
    <p
      className="flex items-center gap-1.5"
      aria-label={`Google rating ${rating.toFixed(1)} out of 5 from ${reviewCount} ratings`}
    >
      <GoogleBrandIcon aria-hidden className="size-3.5 shrink-0" />
      <span className="text-foreground">{rating.toFixed(1)}</span>
      <span className="text-foreground-disabled">({reviewCount})</span>
    </p>
  );
}
