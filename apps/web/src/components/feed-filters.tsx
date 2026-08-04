import { Funnel } from 'lucide-react';

const filters = [
  'Affordable modular kitchens',
  'Modern 2BHK interiors',
  'Scandinavian-style apartments',
  'Cozy bedroom ideas',
  'warm living room ideas',
  'Industrial loft apartments',
  '3BHK homes under ₹15L',
  'Walnut & cane interiors',
];

/** Filters button + category chips row shared by both home states (Figma "pins" filter bar). */
export function FeedFilters() {
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Funnel className="size-3.5" aria-hidden />
        Filters
      </button>
      <span className="h-6 w-px shrink-0 bg-border" />
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          className="shrink-0 rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
        >
          All
        </button>
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            className="shrink-0 whitespace-nowrap rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {filter}
          </button>
        ))}
      </div>
    </div>
  );
}
