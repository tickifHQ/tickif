'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { Avatar, Style } from '@dicebear/core';
import initialsDefinition from '@dicebear/styles/initials.json' with { type: 'json' };

type InitialsAvatarProps = {
  seed: string;
  fallbackSeed: string;
  alt: string;
  size?: number;
};

const initialsStyle = new Style(initialsDefinition);

export function InitialsAvatar({
  seed,
  fallbackSeed,
  alt,
  size = 60,
}: InitialsAvatarProps) {
  const avatarUri = useMemo(() => {
    const normalizedSeed = seed.trim() || fallbackSeed.trim() || 'Tickif Designer';
    return new Avatar(initialsStyle, {
      seed: normalizedSeed,
      size,
      borderRadius: 12,
      fontWeight: 500,
    }).toDataUri();
  }, [fallbackSeed, seed, size]);

  return (
    <Image
      src={avatarUri}
      alt={alt}
      width={size}
      height={size}
      unoptimized
      className="size-full object-cover"
    />
  );
}
