const budgets = ['₹3–5L', '₹5–10L', '₹10–20L', '₹20–50L', '₹50L+'];

/** "Try a filter" budget-suggestion card slotted into the masonry feed (Figma grid CTA). */
export function TryFilterCard() {
  return (
    <div className="mb-4 break-inside-avoid rounded-xl bg-[#dbe5df]/60 px-[22px] py-[26px]">
      <h3 className="text-lg font-medium leading-tight text-[#2d5a3d]">💡 Try a filter</h3>
      <p className="mt-1.5 text-[11px] font-medium leading-relaxed text-[#6a8975]/80">
        These came up for explorers with your budget but a different style.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {budgets.map((budget) => (
          <button
            key={budget}
            type="button"
            className="rounded-full border border-[#2d5a3d]/25 bg-[#fafafa] px-3.5 py-2 text-xs font-medium text-primary transition-colors hover:bg-white"
          >
            {budget}
          </button>
        ))}
      </div>
    </div>
  );
}
