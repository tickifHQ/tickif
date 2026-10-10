'use client';

import { useEffect, useState } from 'react';
import {
  listTaxonomyResponseSchema,
  searchProjectsResponseSchema,
  visitorFeedFilters,
  visitorFeedPreferencesResponseSchema,
  type SearchProjectsResponse,
  type TaxonomyTerm,
  type VisitorFeedPreferences,
  type VisitorHomeType,
} from '@repo/contracts';
import { ArrowRight, LoaderCircle, X } from 'lucide-react';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { SelectField } from '@repo/ui/components/select-field';
import { api } from '@/lib/api';
import { readApiErrorMessage } from '@/lib/api-response';
import { authClient } from '@/lib/auth-client';
import { visitorFeedHref } from '@/lib/visitor-feed';

const EMPTY_PREFERENCES: VisitorFeedPreferences = {
  homeType: null,
  citySlug: null,
  localitySlug: null,
};
const HOME_OPTIONS: { value: VisitorHomeType; label: string }[] = [
  { value: '1-bhk', label: '1 BHK' },
  { value: '2-bhk', label: '2 BHK' },
  { value: '3-bhk', label: '3 BHK' },
  { value: '4-plus-bhk', label: '4 BHK+' },
  { value: 'villa', label: 'Villa' },
];

export function VisitorOnboardingForm({
  initialPreferences = null,
  callbackPath,
}: {
  initialPreferences?: VisitorFeedPreferences | null;
  callbackPath?: string;
}) {
  const [preferences, setPreferences] = useState(initialPreferences ?? EMPTY_PREFERENCES);
  const [locations, setLocations] = useState<{
    cities: TaxonomyTerm[];
    localities: TaxonomyTerm[];
  } | null>(null);
  const [locationError, setLocationError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<SearchProjectsResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { homeType, citySlug, localitySlug } = preferences;

  useEffect(() => {
    const controller = new AbortController();
    setLocationError(false);
    async function load() {
      const [cities, localities] = await Promise.all(
        ['city', 'locality'].map(async (kind) => {
          const response = await api.api.taxonomy.terms.$get(
            { query: { kind } },
            { init: { signal: controller.signal } },
          );
          if (!response.ok) throw new Error('Locations unavailable');
          return listTaxonomyResponseSchema.parse(await response.json()).terms;
        }),
      );
      if (!controller.signal.aborted) setLocations({ cities: cities!, localities: localities! });
    }
    void load().catch(() => {
      if (!controller.signal.aborted) setLocationError(true);
    });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    const controller = new AbortController();
    setPreview(null);
    setPreviewLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await api.api.search.$get(
          {
            query: {
              q: '*',
              page: 1,
              limit: 3,
              ...visitorFeedFilters({ homeType, citySlug, localitySlug }),
            },
          },
          { init: { signal: controller.signal, cache: 'no-store' } },
        );
        if (!response.ok) throw new Error('Preview unavailable');
        const result = searchProjectsResponseSchema.parse(await response.json());
        if (!controller.signal.aborted) setPreview(result);
      } catch {
        // The feed remains available when the optional search preview is unavailable.
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [homeType, citySlug, localitySlug]);

  const city = locations?.cities.find((term) => term.slug === citySlug);
  const localities = locations?.localities.filter((term) => term.parentId === city?.id) ?? [];
  const locationOptions =
    locations?.cities.flatMap((term) => [
      { value: term.id, label: term.label },
      ...locations.localities
        .filter((locality) => locality.parentId === term.id)
        .map((locality) => ({
          value: locality.id,
          label: `${locality.label}, ${term.label}`,
        })),
    ]) ?? [];
  const locationValue = localitySlug
    ? (localities.find((term) => term.slug === localitySlug)?.id ?? '')
    : (city?.id ?? '');
  const matchingPreview = preview?.fallback === 'none' ? preview : null;

  const matchCount = matchingPreview?.estimatedTotalHits ?? 0;
  let previewMessage = 'Your feed will use these choices. You can change them anytime.';
  if (previewLoading) previewMessage = 'Finding homes for you…';
  else if (preview) {
    previewMessage =
      matchCount > 0
        ? `${matchCount.toLocaleString()} ${matchCount === 1 ? 'project matches' : 'projects match'} your home`
        : 'No matching projects yet. Try another home or location.';
  }

  function selectLocation(id: string) {
    const locality = locations?.localities.find((term) => term.id === id);
    const selectedCity = locations?.cities.find((term) => term.id === (locality?.parentId ?? id));
    setPreferences({
      ...preferences,
      citySlug: selectedCity?.slug ?? null,
      localitySlug: locality?.slug ?? null,
    });
  }

  async function save(input: VisitorFeedPreferences) {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await api.api.visitors.me['feed-preferences'].$put({ json: input });
      if (!response.ok)
        throw new Error(
          await readApiErrorMessage(response, 'Could not save your preferences. Please try again.'),
        );
      const saved = visitorFeedPreferencesResponseSchema.parse(await response.json());
      await authClient.getSession({ query: { disableCookieCache: true } });
      window.location.assign(callbackPath ?? visitorFeedHref(saved.filters));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not save your preferences. Please try again.',
      );
      setSaving(false);
    }
  }

  return (
    <Card className="mx-auto grid w-full max-w-[836px] gap-0 rounded-card p-2 shadow-floating-card md:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <aside className="relative flex flex-col overflow-hidden rounded-card bg-linear-to-br from-surface-inverse to-secondary-foreground p-6 text-surface-inverse-foreground md:p-8">
        <img
          src="/ui/visitor-welcome/glow.svg"
          alt=""
          width={420}
          height={420}
          className="pointer-events-none absolute -left-40 -top-44"
        />
        <div className="relative">
          <p className="mb-5 w-fit rounded-lg bg-primary/15 px-3 py-2 text-xs text-primary-soft">
            Your next home starts here
          </p>
          <h2 className="font-display text-2xl font-medium tracking-tight md:text-[32px] md:leading-[38px]">
            Welcome to Tickif
          </h2>
          <p className="mt-3 text-sm leading-5 text-surface-inverse-foreground/65">
            Save the homes you love, follow the designers behind them, and enquire when you’re
            ready.
          </p>
          <ul className="mt-8 hidden space-y-5 text-sm md:block">
            {[
              ['bookmarks', 'Save what you love'],
              ['users', 'Follow designers'],
              ['chat', 'Send enquiries directly'],
            ].map(([icon, label]) => (
              <li key={icon} className="flex items-center gap-3.5">
                <img src={`/ui/visitor-welcome/${icon}.svg`} alt="" width={18} height={18} />
                {label}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-auto hidden pt-12 text-xs text-surface-inverse-foreground/65 md:block">
          Real homes. Ideas for your own.
        </p>
      </aside>
      <form
        className="flex min-w-0 flex-col p-5 sm:p-6 md:min-h-[470px] md:pl-8"
        onSubmit={(event) => {
          event.preventDefault();
          void save(preferences);
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-lg font-medium">You’re in — welcome!</h1>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Skip setup"
            disabled={saving}
            onClick={() => void save(EMPTY_PREFERENCES)}
            className="size-7"
          >
            <X className="size-4" />
          </Button>
        </div>
        <p className="mt-3 text-sm leading-5 text-muted-foreground">
          Two quick answers and your feed starts showing homes like yours.
        </p>
        <fieldset disabled={saving} className="mt-6">
          <legend className="mb-2.5 text-sm font-medium">What’s your home?</legend>
          <div className="grid grid-cols-5 gap-1.5">
            {HOME_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={homeType === option.value ? 'default' : 'outline'}
                aria-pressed={homeType === option.value}
                className="h-10 rounded-lg px-1 text-xs shadow-none"
                onClick={() =>
                  setPreferences({
                    ...preferences,
                    homeType: homeType === option.value ? null : option.value,
                  })
                }
              >
                {option.label}
              </Button>
            ))}
          </div>
        </fieldset>
        <div className="mt-5">
          <div>
            {locations ? (
              <SelectField
                label="Where is it?"
                placeholder="Choose city or locality"
                value={locationValue}
                options={locationOptions}
                onValueChange={selectLocation}
                disabled={saving}
                allowEmpty
              />
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="welcome-location">Where is it?</Label>
                <Input id="welcome-location" disabled placeholder="Loading locations…" />
              </div>
            )}
          </div>
          <div className="mt-2 min-h-7">
            {locationError ? (
              <p className="text-xs text-destructive">
                Could not load locations.{' '}
                <button type="button" className="underline" onClick={() => setAttempt(attempt + 1)}>
                  Retry
                </button>
              </p>
            ) : city && localities.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  In {city.label}:
                </span>
                {localities
                  .filter((term) => term.slug !== localitySlug)
                  .slice(0, 3)
                  .map((term) => (
                    <button
                      key={term.id}
                      type="button"
                      disabled={saving}
                      className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => selectLocation(term.id)}
                    >
                      {term.label}
                    </button>
                  ))}
              </div>
            ) : null}
          </div>
        </div>
        <div
          className="mt-3 flex min-h-14 items-center gap-3 rounded-lg bg-primary/5 px-3 py-2 text-xs text-primary"
          aria-live="polite"
        >
          {matchingPreview?.hits.some((hit) => hit.coverImageUrl) ? (
            <div className="flex shrink-0 -space-x-3">
              {matchingPreview.hits
                .filter((hit) => hit.coverImageUrl)
                .map((hit) => (
                  <img
                    key={hit.id}
                    src={hit.coverImageUrl!}
                    alt=""
                    width={32}
                    height={32}
                    className="size-8 rounded-md border-2 border-card object-cover"
                  />
                ))}
            </div>
          ) : null}
          <p>{previewMessage}</p>
        </div>
        <p role={error ? 'alert' : undefined} className="min-h-12 pt-2 text-xs text-destructive">
          {error}
        </p>
        <div className="mt-auto flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => void save(EMPTY_PREFERENCES)}
          >
            Skip
          </Button>
          <Button type="submit" disabled={saving} className="h-12 px-5">
            Show my feed
            {saving ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <ArrowRight className="size-4" />
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}
