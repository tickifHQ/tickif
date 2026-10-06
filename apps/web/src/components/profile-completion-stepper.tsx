import type { CSSProperties, MouseEvent } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import type { ProfileCompletionResponse } from '@repo/contracts';
import { Card, CardContent } from '@repo/ui/components/card';
import { cn } from '@repo/ui/lib/utils';

type RequirementAction = { label: string; action: string; href: string };

export function ProfileCompletionStepper({
  completion,
  actions,
  onRequirementClick,
}: {
  completion: ProfileCompletionResponse;
  actions: Readonly<Record<string, RequirementAction>>;
  onRequirementClick: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  const missing = new Set(completion.missing);
  const steps = [...Object.keys(actions).filter((key) => !missing.has(key)), ...completion.missing];
  const nextStep = completion.missing[0];

  return (
    <Card>
      <CardContent className="grid gap-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Profile completion</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {completion.missing.length > 0
                ? `${completion.missing.length} item${completion.missing.length === 1 ? '' : 's'} remaining`
                : 'Your profile is complete'}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
            {completion.score}% complete
          </span>
        </div>
        <div
          className="relative"
          style={
            {
              '--step-count': steps.length,
              '--profile-progress': `${completion.score}%`,
            } as CSSProperties
          }
        >
          <div
            className="pointer-events-none absolute bottom-4 left-4 top-4 w-0.5 overflow-hidden rounded-full bg-border sm:inset-x-[calc(100%/var(--step-count)/2)] sm:bottom-auto sm:h-0.5 sm:w-auto"
            role="progressbar"
            aria-label="Profile completion"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completion.score}
          >
            <div className="h-[var(--profile-progress)] w-full bg-primary sm:h-full sm:w-[var(--profile-progress)]" />
          </div>
          <ol
            aria-label="Profile completion steps"
            className="relative grid gap-4 sm:grid-cols-[repeat(var(--step-count),minmax(0,1fr))] sm:gap-0"
          >
            {steps.map((key, index) => {
              const done = !missing.has(key);
              const next = key === nextStep;
              const action = actions[key] ?? {
                label: key,
                action: 'Review this requirement',
                href: '/designer/profile',
              };
              const content = (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'relative flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold',
                      done
                        ? 'border-primary bg-primary text-primary-foreground'
                        : next
                          ? 'border-primary bg-background text-primary ring-4 ring-primary/10'
                          : 'border-border bg-background text-muted-foreground',
                    )}
                  >
                    {done ? <Check className="size-4" /> : index + 1}
                  </span>
                  <span className="min-w-0 pt-0.5 sm:px-1">
                    <span
                      className={cn(
                        'block break-words text-xs font-medium',
                        next ? 'text-primary' : done ? 'text-muted-foreground' : 'text-foreground',
                      )}
                    >
                      {action.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {done ? 'Complete' : next ? 'Next step' : 'To do'}
                    </span>
                  </span>
                </>
              );
              const stepClassName =
                'flex min-w-0 items-start gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center';
              return (
                <li key={key}>
                  {done ? (
                    <div className={stepClassName}>{content}</div>
                  ) : (
                    <Link
                      href={action.href}
                      aria-label={action.action}
                      aria-current={next ? 'step' : undefined}
                      onClick={(event) => onRequirementClick(event, action.href)}
                      className={cn(
                        stepClassName,
                        'rounded-md outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4',
                      )}
                    >
                      {content}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
