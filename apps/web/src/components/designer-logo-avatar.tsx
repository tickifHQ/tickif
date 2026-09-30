import Image from 'next/image';
import type { ReactNode } from 'react';
import { cn } from '@repo/ui/lib/utils';

/**
 * Canonical designer/studio logo display.
 *
 * Circle is the standard shape for a designer logo across every public and
 * dashboard surface. This component only standardizes the *display* container
 * (circular, `object-cover`, cropped-square logo shown without distortion) — it
 * does not touch the upload/crop pipeline or the stored `logoUrl`, which is
 * already a square image.
 *
 * Sizing stays with the caller via `className` (e.g. `size-10`) so each surface
 * keeps its existing dimensions. When no logo exists, the caller-provided
 * `fallback` (initials monogram, plain-text initials, etc.) is rendered inside
 * the same circular frame.
 */
export function DesignerLogoAvatar({
  logoUrl,
  alt,
  sizePx,
  className,
  fallback,
  testId,
}: {
  /** Presigned logo URL, or null/undefined to show the fallback. */
  logoUrl: string | null | undefined;
  alt: string;
  /** Pixel size handed to next/image (should match the `className` box size). */
  sizePx: number;
  /** Box size + any extra classes for the circular frame (e.g. `size-10`). */
  className?: string;
  /** Rendered inside the circular frame when there is no logo. */
  fallback: ReactNode;
  /** Optional test hook applied to the circular frame. */
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-full',
        className,
      )}
    >
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={alt}
          width={sizePx}
          height={sizePx}
          // Presigned storage URL: the signature rotates hourly, so the Next.js
          // optimizer could never reuse a cache entry. Matches every other logo
          // render surface.
          unoptimized
          className="size-full object-cover"
        />
      ) : (
        fallback
      )}
    </span>
  );
}
