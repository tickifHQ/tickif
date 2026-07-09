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
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#ede9e1] px-3.5 py-2 text-xs font-medium text-[#52525b] transition-colors hover:bg-accent"
      >
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" />
        </svg>
        Filters
      </button>
      <span className="h-[22px] w-px shrink-0 bg-[#ede9e1]" />
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          className="shrink-0 rounded-full border border-primary bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground"
        >
          All
        </button>
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            className="shrink-0 whitespace-nowrap rounded-full border border-[#ede9e1] px-3.5 py-1.5 text-xs font-medium text-[#52525b] transition-colors hover:bg-accent hover:text-foreground"
          >
            {filter}
          </button>
        ))}
      </div>
    </div>
  );
}
