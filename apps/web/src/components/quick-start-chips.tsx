'use client';

import { useRouter } from 'next/navigation';

const quickStarts = [
  'Scandinavian apartment',
  'Traditional bedroom',
  'Pooja room',
  '3BHK under 15L',
  'Walnut & cane',
  'Industrial loft',
  'Maximalist colour',
];

/** Quick-start search chips that navigate to search results with a pre-filled query. */
export function QuickStartChips() {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-mono text-xs uppercase tracking-[0.04em] text-primary/70">
        Start with
      </span>
      {quickStarts.map((label) => (
        <button
          key={label}
          type="button"
          onClick={() => router.push(`/search?q=${encodeURIComponent(label)}&scope=projects`)}
          className="rounded-full border border-surface-subtle-border bg-card/70 px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
