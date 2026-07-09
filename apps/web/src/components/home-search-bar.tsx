/** Prominent search bar shown to authenticated users in place of the hero (Figma "HOME [Logged in]"). */
export function HomeSearchBar() {
  return (
    <form role="search">
      <div className="flex items-center gap-3 rounded-[14px] border border-[#e9e9e9] bg-white py-1.5 pl-[22px] pr-1.5 shadow-[0_0_0_4px_rgba(240,250,243,1),0_16px_48px_-10px_rgba(45,90,61,0.15)]">
        <svg
          className="size-4 shrink-0 text-muted-foreground"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <circle cx="7" cy="7" r="5" />
          <path d="m11 11 3 3" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          placeholder="Search by city, style, budget, room type…"
          aria-label="Search homes"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-[#6b756f]"
        />
        <div className="hidden shrink-0 items-center gap-3 sm:flex">
          <button
            type="button"
            className="rounded-md border border-[#ede9e1] px-[13px] py-[5px] text-[12.5px] text-[#3d3a34] transition-colors hover:bg-accent"
          >
            Projects
          </button>
          <button
            type="button"
            className="rounded-md border border-[#ede9e1] px-[13px] py-[5px] text-[12.5px] text-[#3d3a34] transition-colors hover:bg-accent"
          >
            Designers
          </button>
        </div>
        <button
          type="submit"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-[#27272a] px-2.5 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-[#27272a]/90"
        >
          Explore
          <svg viewBox="0 0 24 24" className="size-[15px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M4 12h16m0 0-6-6m6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </form>
  );
}
