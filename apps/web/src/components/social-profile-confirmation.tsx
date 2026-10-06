'use client';

import { useState, type ComponentProps, type ReactNode } from 'react';
import { socialProfileHref, socialProfileValueSchema, type SocialPlatform } from '@repo/contracts';
import { AlertCircle, ExternalLink } from 'lucide-react';
import { Input } from '@repo/ui/components/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@repo/ui/components/tooltip';
import { cn } from '@repo/ui/lib/utils';

const schemas = {
  instagram: socialProfileValueSchema('instagram'),
  linkedin: socialProfileValueSchema('linkedin'),
  youtube: socialProfileValueSchema('youtube'),
};
const names = { instagram: 'Instagram', linkedin: 'LinkedIn', youtube: 'YouTube' };

export function socialProfileError(platform: SocialPlatform, value: string): string | undefined {
  const result = schemas[platform].safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

type SocialProfileInputProps = Omit<ComponentProps<typeof Input>, 'id' | 'value' | 'onChange'> & {
  id: string;
  platform: SocialPlatform;
  value: string;
  onValueChange: (value: string) => void;
  startAdornment?: ReactNode;
  errorMessage?: string;
};

/** A compact input action; valid links share the public portfolio resolver. */
export function SocialProfileInput({
  id,
  platform,
  value,
  onValueChange,
  startAdornment,
  errorMessage,
  className,
  'aria-describedby': describedBy,
  ...props
}: SocialProfileInputProps) {
  const [errorOpen, setErrorOpen] = useState(false);
  const error = socialProfileError(platform, value) ?? errorMessage;
  const href = error ? null : socialProfileHref(platform, value);
  const errorId = `${id}-error`;
  const actionClassName =
    'absolute inset-y-0 right-1 my-auto flex size-8 items-center justify-center rounded-sm focus-visible:bg-muted focus-visible:outline-none';

  return (
    <div className="relative min-w-0 rounded-md transition-[box-shadow] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      <Input
        {...props}
        id={id}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        maxLength={60}
        aria-label={props['aria-label'] ?? names[platform]}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined
        }
        className={cn(
          'pr-10 focus-visible:ring-0 focus-visible:ring-offset-0',
          startAdornment ? 'pl-12' : undefined,
          className,
        )}
      />
      {startAdornment ? (
        <span
          className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center border-r border-input"
          aria-hidden="true"
        >
          {startAdornment}
        </span>
      ) : null}
      {error ? (
        <>
          <span id={errorId} className="sr-only" aria-live="polite">
            {error}
          </span>
          <Tooltip open={errorOpen} onOpenChange={setErrorOpen}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(actionClassName, 'text-destructive')}
                aria-label={`${names[platform]} link error`}
                onClick={(event) => {
                  // Radix closes on trigger click unless the controlled action
                  // prevents its default handler. Keep tap/Enter toggling usable.
                  event.preventDefault();
                  setErrorOpen((open) => !open);
                }}
              >
                <AlertCircle className="size-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{error}</TooltipContent>
          </Tooltip>
        </>
      ) : href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(actionClassName, 'text-muted-foreground hover:text-foreground')}
          aria-label={`Open ${names[platform]} profile (opens in a new tab)`}
        >
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
}
