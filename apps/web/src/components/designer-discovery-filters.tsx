'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { designerSortOption, type SearchDesignersQuery } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { SelectField } from '@repo/ui/components/select-field';
import { TagCombobox } from '@repo/ui/components/tag-combobox';
import {
  DESIGNER_FACETS,
  designerPageHref,
  facetValues,
  parseDesignerParams,
  type DesignerFacetOptions,
} from '@/lib/designer-discovery-params';

export function DesignerDiscoveryFilters({
  query,
  options,
}: {
  query: SearchDesignersQuery;
  options: DesignerFacetOptions;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(query);
  const [pending, startTransition] = useTransition();
  const [terms, setTerms] = useState({
    citySlugs: '',
    localitySlugs: '',
    scopeSlugs: '',
    themeSlugs: '',
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(() => router.push(designerPageHref({ ...draft, q: draft.q.trim(), page: 1 })));
  }
  return (
    <form
      role="search"
      aria-label="Find designers"
      onSubmit={submit}
      className="flex flex-col gap-4"
      aria-busy={pending}
    >
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4">
        <legend className="sr-only">Designer search and filters</legend>
        <Label htmlFor="designer-query">Search designers</Label>
        <Input
          id="designer-query"
          type="search"
          maxLength={200}
          value={draft.q}
          onChange={(event) => setDraft({ ...draft, q: event.target.value })}
          placeholder="Name, studio or style"
        />
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DESIGNER_FACETS.map(({ key, label }) => (
            <TagCombobox
              key={key}
              label={label}
              allowCreate={false}
              options={options[key]}
              value={terms[key]}
              tags={facetValues(draft[key])}
              placeholder={`Any ${label.toLowerCase()}`}
              labelHint="Optional"
              className="min-w-0"
              onValueChange={(value) => setTerms({ ...terms, [key]: value })}
              onAddTag={(value) => {
                setDraft({
                  ...draft,
                  [key]: [...new Set([...facetValues(draft[key]), value])].slice(0, 20),
                });
                setTerms({ ...terms, [key]: '' });
              }}
              onRemoveTag={(value) =>
                setDraft({
                  ...draft,
                  [key]: facetValues(draft[key]).filter((entry) => entry !== value),
                })
              }
            />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Designer type"
            placeholder="All designers"
            allowEmpty
            value={draft.entityType ?? ''}
            options={[
              { value: 'individual', label: 'Individual' },
              { value: 'company', label: 'Company' },
            ]}
            onValueChange={(value) =>
              setDraft({
                ...draft,
                entityType: value === 'individual' || value === 'company' ? value : undefined,
              })
            }
          />
          <SelectField
            label="Sort by"
            placeholder="Relevance"
            value={draft.sort}
            options={[
              { value: 'relevance', label: 'Relevance' },
              { value: 'avgRating:desc', label: 'Highest rated' },
              { value: 'projectCount:desc', label: 'Most projects' },
              { value: 'reviewCount:desc', label: 'Most reviewed' },
              { value: 'yearsExperience:desc', label: 'Most experienced' },
            ]}
            onValueChange={(value) => {
              const parsed = designerSortOption.safeParse(value);
              if (parsed.success) setDraft({ ...draft, sort: parsed.data });
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit">
            <Search data-icon="inline-start" aria-hidden />
            {pending ? 'Searching…' : 'Find designers'}
          </Button>
          <Button asChild variant="outline">
            <Link
              href="/designers"
              onClick={() => {
                setDraft(parseDesignerParams({}));
                setTerms({ citySlugs: '', localitySlugs: '', scopeSlugs: '', themeSlugs: '' });
              }}
            >
              Clear filters
            </Link>
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
