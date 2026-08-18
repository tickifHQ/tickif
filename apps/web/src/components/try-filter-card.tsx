import Link from 'next/link';
import { Lightbulb } from 'lucide-react';
import { formatCompactBudgetLabel } from '../lib/format-budget-label';

export type FeedFilterSuggestion = {
  href: string;
  label: string;
};

/** Taxonomy-driven filter suggestions slotted into the masonry feed. */
export function TryFilterCard({ suggestions }: { suggestions: FeedFilterSuggestion[] }) {
  return (
    <div className="mb-4 flex break-inside-avoid flex-col gap-[5px] rounded-xl bg-surface-subtle px-[22px] py-[26px]">
      <h3 className="flex items-center gap-1.5 text-lg font-medium leading-[1.1] text-primary">
        <Lightbulb aria-hidden className="size-4 shrink-0" />
        Try a filter
      </h3>
      <p className="text-[11px] font-medium leading-[1.6] text-muted-foreground">
        These came up for explorers with your budget but a different style.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((suggestion) => (
          <Link
            key={suggestion.href}
            href={suggestion.href}
            className="rounded-full border border-primary/25 bg-background px-[15px] py-[9px] text-xs font-medium leading-[1.1] text-primary transition-colors hover:bg-accent"
          >
            {formatCompactBudgetLabel(suggestion.label)}
          </Link>
        ))}
      </div>
    </div>
  );
}
