import type { Metadata } from 'next';
import { DesignerDiscoveryFilters } from '@/components/designer-discovery-filters';
import { DesignerDiscoveryResults } from '@/components/designer-discovery-results';
import { fetchDesignerFacetOptions, fetchDesignerSearch } from '@/lib/designer-discovery-api';
import {
  DESIGNER_FACETS,
  designerFacetLabel,
  designerPageHref,
  facetValues,
  parseDesignerParams,
} from '@/lib/designer-discovery-params';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = parseDesignerParams(await searchParams);
  return {
    title: 'Find interior designers | Tickif',
    description:
      'Discover designers and studios by city, style and experience. Explore their published portfolios on Tickif.',
    alternates: { canonical: designerPageHref(query) },
  };
}

export default async function DesignersPage({ searchParams }: Props) {
  const query = parseDesignerParams(await searchParams);
  const [result, options] = await Promise.all([
    fetchDesignerSearch(query),
    fetchDesignerFacetOptions(),
  ]);
  for (const { key } of DESIGNER_FACETS) {
    const values = new Set(options[key].map((option) => option.value));
    for (const value of [
      ...Object.keys(result.facetDistribution[key] ?? {}),
      ...facetValues(query[key]),
    ]) {
      if (!values.has(value)) {
        options[key].push({ value, label: designerFacetLabel(value) });
        values.add(value);
      }
    }
    options[key].sort((a, b) => a.label.localeCompare(b.label));
  }
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Find your designer</h1>
        <p className="mt-2 text-muted-foreground">
          Discover designers and studios for your next space.
        </p>
      </div>
      <DesignerDiscoveryFilters key={designerPageHref(query)} query={query} options={options} />
      <DesignerDiscoveryResults result={result} query={query} />
    </div>
  );
}
