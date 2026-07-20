import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
import { IconStack } from './reui/icon-stack';

type EmptyStateProps = {
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  icon: ReactNode;
  title: ReactNode;
};

export function EmptyState({
  action,
  children,
  className,
  description,
  icon,
  title,
}: EmptyStateProps) {
  return (
    <div className={cn('mx-auto flex max-w-sm flex-col items-center text-center', className)}>
      <IconStack>{icon}</IconStack>
      <h2 className="mt-4 text-sm font-medium text-foreground">{title}</h2>
      {description ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      ) : null}
      {children}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
