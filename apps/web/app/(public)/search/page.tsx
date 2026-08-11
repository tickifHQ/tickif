import { Suspense } from 'react';
import { SearchCombobox } from '@/components/search-combobox';
import { SearchResults } from '@/components/search-results';

export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    scope?: string;
    page?: string;
    budgetBandSlug?: string;
    citySlug?: string;
    bhkSlug?: string;
  }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? '';
  const scope = params.scope === 'designers' ? 'designers' : 'projects';
  const page = Math.max(1, Number(params.page) || 1);
  const filters = {
    budgetBandSlug: params.budgetBandSlug,
    citySlug: params.citySlug,
    bhkSlug: params.bhkSlug,
  };
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="bg-background">
      <section className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-6">
        <div className="mb-6">
          <SearchCombobox variant="bar" placeholder="Search by city, style, budget, room type…" />
        </div>

        {query || hasFilters ? (
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-20">
                <p className="text-sm text-muted-foreground">Searching…</p>
              </div>
            }
          >
            <SearchResults query={query} scope={scope} page={page} filters={filters} />
          </Suspense>
        ) : (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-muted-foreground">
              Type something to search projects and designers.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
