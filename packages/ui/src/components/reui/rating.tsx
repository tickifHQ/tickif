import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { StarIcon } from 'lucide-react';
import { cn } from '@repo/ui/lib/utils';

const ratingVariants = cva('flex items-center gap-2', {
  variants: {
    size: {
      sm: '',
      default: '',
      lg: '',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

const starsVariants = cva('flex items-center', {
  variants: {
    size: {
      sm: 'gap-0.5',
      default: 'gap-0.5',
      lg: 'gap-1',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

const starVariants = cva('', {
  variants: {
    size: {
      sm: 'size-4',
      default: 'size-5',
      lg: 'size-6',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

const valueVariants = cva('w-5 text-muted-foreground', {
  variants: {
    size: {
      sm: 'text-xs',
      default: 'text-sm',
      lg: 'text-base',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

type RatingProps = ComponentProps<'div'> &
  VariantProps<typeof ratingVariants> & {
    rating: number;
    maxRating?: number;
    showValue?: boolean;
    valueClassName?: string;
  };

function Rating({
  rating,
  maxRating = 5,
  size,
  className,
  showValue = false,
  valueClassName,
  'aria-label': ariaLabel,
  ...props
}: RatingProps) {
  const safeMaxRating = Number.isFinite(maxRating) ? Math.max(0, Math.floor(maxRating)) : 5;
  const safeRating = Number.isFinite(rating) ? Math.min(safeMaxRating, Math.max(0, rating)) : 0;

  return (
    <div
      data-slot="rating"
      role="img"
      aria-label={ariaLabel ?? `${safeRating} out of ${safeMaxRating} stars`}
      className={cn(ratingVariants({ size }), className)}
      {...props}
    >
      <div className={starsVariants({ size })}>
        {Array.from({ length: safeMaxRating }, (_, index) => {
          const starRating = index + 1;
          const filled = safeRating >= starRating;
          const partiallyFilled = safeRating > index && safeRating < starRating;
          const fillPercentage = partiallyFilled ? (safeRating - index) * 100 : 0;

          return (
            <span key={starRating} className="relative">
              <StarIcon
                data-slot="rating-star-empty"
                className={cn(starVariants({ size }), 'text-warning/30')}
                aria-hidden="true"
              />
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: filled ? '100%' : `${fillPercentage}%` }}
              >
                <StarIcon
                  data-slot="rating-star-filled"
                  className={cn(starVariants({ size }), 'fill-warning text-warning')}
                  aria-hidden="true"
                />
              </span>
            </span>
          );
        })}
      </div>
      {showValue && (
        <span data-slot="rating-value" className={cn(valueVariants({ size }), valueClassName)}>
          {safeRating.toFixed(1)}
        </span>
      )}
    </div>
  );
}

export { Rating };
