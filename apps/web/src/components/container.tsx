import type { ElementType, ReactNode } from 'react';

/**
 * Mobile-first centered content container with responsive horizontal padding
 * and a max width. Renders a `<div>` by default; pass `as` to use a semantic
 * element (e.g. `main`, `section`).
 */
export function Container({
  as: Tag = 'div',
  className = '',
  children,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={`mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 ${className}`.trim()}>
      {children}
    </Tag>
  );
}
