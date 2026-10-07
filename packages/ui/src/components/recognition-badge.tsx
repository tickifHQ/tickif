import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/utils';

type RecognitionBadgeProps = ComponentProps<'figure'> & {
  artwork: ReactNode;
  label: ReactNode;
  eyebrow?: ReactNode;
  detail?: ReactNode;
  description?: ReactNode;
};

/** Presentation only: the caller supplies artwork and determines eligibility. */
export function RecognitionBadge({
  artwork,
  label,
  eyebrow,
  detail,
  description,
  className,
  ...props
}: RecognitionBadgeProps) {
  return (
    <figure
      data-slot="recognition-badge"
      className={cn('relative flex flex-col items-center text-center', className)}
      {...props}
    >
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-0 flex h-33 w-37.5 -translate-x-1/2 items-center justify-center"
      >
        {artwork}
      </div>
      <figcaption className="relative flex flex-col items-center gap-3">
        <div className="flex h-33 w-37.5 flex-col items-center justify-center gap-1">
          {eyebrow ? (
            <span className="font-mono text-metadata uppercase text-muted-foreground">
              {eyebrow}
            </span>
          ) : null}
          <span className="max-w-20 font-display text-sm font-semibold leading-tight text-foreground">
            {label}
          </span>
          {detail ? (
            <span className="font-mono text-metadata uppercase text-muted-foreground">
              {detail}
            </span>
          ) : null}
        </div>
        {description ? (
          <span className="max-w-37.5 text-xs leading-relaxed text-muted-foreground">
            {description}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
