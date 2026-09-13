import Link from 'next/link';
import { Lightbulb } from 'lucide-react';
import { formatCompactBudgetLabel } from '../lib/format-budget-label';
import type { FeedFilterKey } from '../lib/feed-params';

export type FeedFilterSuggestion = {
  href: string;
  label: string;
  facet: FeedFilterKey;
  facetLabel: string;
  resultCount?: number;
};

/** Taxonomy-driven filter suggestions slotted into the masonry feed. */
export function TryFilterCard({
  suggestions,
  hasActiveCriteria = false,
}: {
  suggestions: FeedFilterSuggestion[];
  hasActiveCriteria?: boolean;
}) {
  return (
    <div
      data-try-filter-card
      className="mb-4 flex break-inside-avoid flex-col gap-[5px] rounded-xl bg-surface-subtle px-[22px] py-[26px]"
    >
      <h3 className="flex items-center gap-1.5 text-lg font-medium leading-[1.1] text-primary">
        <Lightbulb aria-hidden className="size-4 shrink-0" />
        Try a filter
      </h3>
      <p className="text-[11px] font-medium leading-[1.6] text-muted-foreground">
        {hasActiveCriteria
          ? 'Keep your current search and filters, then try another available option.'
          : 'Explore projects by budget, theme, room, and more.'}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((suggestion) => {
          const label =
            suggestion.facet === 'budgetBand'
              ? formatCompactBudgetLabel(suggestion.label)
              : suggestion.label;
          const accessibleLabel =
            suggestion.resultCount === undefined
              ? undefined
              : `${label}, ${suggestion.facetLabel} filter, ${suggestion.resultCount} ${suggestion.resultCount === 1 ? 'project' : 'projects'}`;

          return (
            <Link
              key={suggestion.href}
              href={suggestion.href}
              prefetch={false}
              aria-label={accessibleLabel}
              className="rounded-full border border-primary/25 bg-background px-[15px] py-[9px] text-xs font-medium leading-[1.1] text-primary transition-colors hover:bg-accent"
            >
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
