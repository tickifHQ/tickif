'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@repo/ui/components/tooltip';

export function RequiredFieldIndicator() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <sup
          tabIndex={0}
          aria-label="Required"
          className="ml-0.5 inline-flex cursor-default align-super font-semibold leading-none text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          *
        </sup>
      </TooltipTrigger>
      <TooltipContent side="top">Required</TooltipContent>
    </Tooltip>
  );
}
