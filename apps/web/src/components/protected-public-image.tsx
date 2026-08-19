'use client';

import type { ComponentProps } from 'react';

type ProtectedPublicImageProps = Omit<ComponentProps<'img'>, 'draggable' | 'onContextMenu'>;

export function ProtectedPublicImage(props: ProtectedPublicImageProps) {
  return <img {...props} draggable={false} onContextMenu={(event) => event.preventDefault()} />;
}
