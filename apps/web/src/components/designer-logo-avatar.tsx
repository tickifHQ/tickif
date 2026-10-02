'use client';

import Image from 'next/image';
import { useState, type ReactNode } from 'react';
import { cn } from '@repo/ui/lib/utils';

type DesignerLogoAvatarProps = {
  logoUrl: string | null | undefined;
  alt: string;
  sizePx: number;
  className?: string;
  fallback: ReactNode;
  testId?: string;
};

/** Studio-only display: preserve saved square crops and fit legacy artwork in a stable frame. */
export function DesignerLogoAvatar({
  logoUrl,
  alt,
  sizePx,
  className,
  fallback,
  testId,
}: DesignerLogoAvatarProps) {
  return (
    <span
      data-testid={testId}
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-muted',
        className,
      )}
    >
      {logoUrl ? (
        <LogoImage key={logoUrl} logoUrl={logoUrl} alt={alt} sizePx={sizePx} fallback={fallback} />
      ) : (
        fallback
      )}
    </span>
  );
}

/** A new URL remounts image state, allowing replacements to recover from a failed load. */
function LogoImage({
  logoUrl,
  alt,
  sizePx,
  fallback,
}: Pick<DesignerLogoAvatarProps, 'alt' | 'sizePx' | 'fallback'> & { logoUrl: string }) {
  const [failed, setFailed] = useState(false);
  const [scale, setScale] = useState(1);
  if (failed) return fallback;

  return (
    <Image
      src={logoUrl}
      alt={alt}
      width={sizePx}
      height={sizePx}
      // Signed URLs rotate; skip the optimizer without changing the stored source or crop.
      unoptimized
      className="absolute inset-0 size-full object-contain"
      style={scale === 1 ? undefined : { transform: `scale(${scale})` }}
      onError={() => setFailed(true)}
      onLoad={(event) => {
        const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
        // Square files are the saved crop. Non-square legacy artwork fits inside
        // the circle, including its corners, rather than being clipped at the rim.
        setScale(
          width > 0 && height > 0 && width !== height
            ? Math.max(width, height) / Math.hypot(width, height)
            : 1,
        );
      }}
    />
  );
}
