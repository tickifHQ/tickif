'use client';

import { useRouter } from 'next/navigation';
import type { FilterChip } from '@/components/feed-filters';

interface TryFilterCardProps {
  /** Budget band chips from taxonomy, passed from the parent server component. */
  budgetChips?: FilterChip[];
}

/**
 * "Try a filter" budget-suggestion card slotted into the masonry feed.
 * Uses taxonomy-driven budget band data when available; hidden when no data.
 */
export function TryFilterCard({ budgetChips }: TryFilterCardProps) {
  const router = useRouter();

  if (!budgetChips || budgetChips.length === 0) return null;

  return (
    <div className="mb-4 break-inside-avoid rounded-xl bg-[#dbe5df]/60 px-[22px] py-[26px]">
      <h3 className="text-lg font-medium leading-tight text-[#2d5a3d]">💡 Try a filter</h3>
      <p className="mt-1.5 text-[11px] font-medium leading-relaxed text-[#6a8975]/80">
        These came up for explorers with your budget but a different style.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {budgetChips.map((chip) => (
          <button
            key={chip.slug}
            type="button"
            onClick={() =>
              router.push(`/search?scope=projects&budgetBandSlug=${encodeURIComponent(chip.slug)}`)
            }
            className="rounded-full border border-[#2d5a3d]/25 bg-[#fafafa] px-3.5 py-2 text-xs font-medium text-primary transition-colors hover:bg-white"
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
