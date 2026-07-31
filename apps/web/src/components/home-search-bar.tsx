import { ArrowRight, Search } from 'lucide-react';

/** Prominent search bar shown to authenticated users in place of the hero (Figma "HOME [Logged in]"). */
export function HomeSearchBar() {
  return (
    <form role="search">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-background py-1.5 pl-5 pr-1.5 shadow-home-search">
        <Search className="size-4 shrink-0 text-primary" aria-hidden />
        <input
          type="search"
          placeholder="Search by city, style, budget, room type…"
          aria-label="Search homes"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <div className="hidden shrink-0 items-center gap-3 sm:flex">
          <button
            type="button"
            className="rounded-md border border-border px-3.5 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
          >
            Projects
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-3.5 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
          >
            Designers
          </button>
        </div>
        <button
          type="submit"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-foreground px-3 text-sm font-medium text-background shadow-sm transition-colors hover:bg-foreground/90"
        >
          Explore
          <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
    </form>
  );
}
