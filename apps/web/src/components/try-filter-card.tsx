import Link from 'next/link';

export type FeedFilterSuggestion = {
  href: string;
  label: string;
};

/** Taxonomy-driven filter suggestions slotted into the masonry feed. */
export function TryFilterCard({ suggestions }: { suggestions: FeedFilterSuggestion[] }) {
  return (
    <div className="mb-4 break-inside-avoid rounded-xl bg-primary/10 px-[22px] py-[26px]">
      <h3 className="text-lg font-medium leading-tight text-primary">Try a filter</h3>
      <p className="mt-1.5 text-[11px] font-medium leading-relaxed text-muted-foreground">
        Narrow the feed using a popular budget range.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {suggestions.map((suggestion) => (
          <Link
            key={suggestion.href}
            href={suggestion.href}
            className="rounded-full border border-primary/25 bg-background px-3.5 py-2 text-xs font-medium text-primary transition-colors hover:bg-accent"
          >
            {suggestion.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
