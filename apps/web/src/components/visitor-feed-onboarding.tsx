'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Bookmark, MapPin, MessageSquareMore, Users, X } from 'lucide-react';
import {
  VISITOR_HOME_TYPES,
  listTaxonomyResponseSchema,
  searchProjectsResponseSchema,
  visitorFeedPreferencesInputSchema,
  visitorFeedPreferencesResponseSchema,
  type SearchProjectsResponse,
  type TaxonomyTerm,
  type VisitorHomeType,
} from '@repo/contracts';
import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/avatar';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@repo/ui/components/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/select';
import { ToggleGroup, ToggleGroupItem } from '@repo/ui/components/toggle-group';
import { api } from '@/lib/api';
import { readApiErrorMessage } from '@/lib/api-response';
import { authClient } from '@/lib/auth-client';
import {
  VISITOR_HOME_LABELS,
  visitorFeedHref,
  visitorSearchFilters,
} from '@/lib/visitor-feed-preferences';

const features = [
  { icon: Bookmark, text: 'Save what you love' },
  { icon: Users, text: 'Connect with designers' },
  { icon: MessageSquareMore, text: 'Send enquiries directly' },
] as const;

export function VisitorFeedOnboarding({ onComplete }: { onComplete: (href: string) => void }) {
  const id = useId();
  const [homeType, setHomeType] = useState<VisitorHomeType | null>(null);
  const [cities, setCities] = useState<TaxonomyTerm[]>([]);
  const [cityId, setCityId] = useState('');
  const [localities, setLocalities] = useState<TaxonomyTerm[]>([]);
  const [localityId, setLocalityId] = useState('');
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState('');
  const [retry, setRetry] = useState(0);
  const [preview, setPreview] = useState<SearchProjectsResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const savingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const city = cities.find((term) => term.id === cityId) ?? null;
  const locality = localities.find((term) => term.id === localityId) ?? null;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLocationLoading(true);
    setLocationError('');
    async function load() {
      try {
        const response = await api.api.taxonomy.terms.$get(
          {
            query: { kind: cityId ? 'locality' : 'city', ...(cityId ? { parentId: cityId } : {}) },
          },
          { init: { signal: controller.signal } },
        );
        if (!response.ok) throw new Error('Location lookup failed');
        const parsed = listTaxonomyResponseSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('Invalid locations');
        if (!controller.signal.aborted) {
          if (cityId) setLocalities(parsed.data.terms);
          else setCities(parsed.data.terms);
        }
      } catch {
        if (!controller.signal.aborted)
          setLocationError('Could not load locations. Try again or skip for now.');
      } finally {
        if (!controller.signal.aborted) setLocationLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [cityId, retry]);

  useEffect(() => {
    const controller = new AbortController();
    setPreview(null);
    if (!homeType || !city) {
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    async function load() {
      try {
        const response = await api.api.search.$get(
          { query: { q: '', limit: 3, ...visitorSearchFilters({ homeType, city, locality }) } },
          { init: { signal: controller.signal } },
        );
        if (!response.ok) return;
        const parsed = searchProjectsResponseSchema.safeParse(await response.json());
        if (parsed.success && !controller.signal.aborted) setPreview(parsed.data);
      } catch {
        // Search availability never prevents saving preferences or skipping.
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [homeType, city, locality]);

  async function complete(skip: boolean) {
    if (savingRef.current) return;
    const input = visitorFeedPreferencesInputSchema.safeParse(
      skip
        ? { homeType: null, cityId: null, localityId: null }
        : { homeType, cityId: cityId || null, localityId: localityId || null },
    );
    if (!input.success || (!skip && (!homeType || !city))) {
      setError('Choose your home type and city, or skip for now.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError('');
    setSessionExpired(false);
    try {
      const response = await api.api.visitors.me['feed-preferences'].$put({ json: input.data });
      if (!response.ok) {
        setSessionExpired(response.status === 401);
        setError(
          await readApiErrorMessage(response, 'Could not save your preferences. Please try again.'),
        );
        return;
      }
      const parsed = visitorFeedPreferencesResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        setError('Could not confirm your preferences. Please try again.');
        return;
      }
      // Persistence succeeded. A temporary session-refresh outage must not make
      // the successful write appear to fail; the destination rechecks server auth.
      await authClient.getSession({ query: { disableCookieCache: true } }).catch(() => null);
      onComplete(visitorFeedHref(parsed.data));
    } catch {
      setError('Could not save your preferences. Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const matching = preview?.fallback === 'none' ? preview : null;
  const previewMessage = previewLoading
    ? 'Finding homes like yours...'
    : matching && matching.estimatedTotalHits > 0
      ? `${matching.estimatedTotalHits} published ${homeType ? VISITOR_HOME_LABELS[homeType] : ''} projects ${locality ? `in ${locality.label}` : city ? `in ${city.label}` : ''}`
      : 'Your feed will help you discover homes and fresh ideas.';

  return (
    <Card
      data-testid="visitor-feed-onboarding"
      className="mx-auto w-full max-w-4xl overflow-hidden p-2 shadow-floating-card"
    >
      <div className="flex min-w-0 flex-col md:flex-row">
        <aside className="relative hidden w-5/12 shrink-0 flex-col gap-6 overflow-hidden rounded-card bg-visitor-welcome p-8 text-surface-inverse-foreground md:flex">
          <Badge variant="soft" className="w-fit bg-primary/15 text-primary-soft">
            <Users className="size-3.5" aria-hidden /> Make room for inspiration
          </Badge>
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-section">Welcome to Tickif</h2>
            <p className="text-sm leading-relaxed text-surface-inverse-foreground/70">
              Save the homes you love, connect with the designers behind them, and enquire when
              you&apos;re ready.
            </p>
          </div>
          <ul className="flex flex-col gap-5 py-2">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm">
                <Icon className="size-4 shrink-0 text-primary-soft" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
          <div className="mt-auto flex items-center gap-3 pt-10">
            <div className="flex -space-x-2" aria-hidden>
              {[1, 2, 3, 1].map((image, index) => (
                <Avatar key={index} className="size-9 ring-2 ring-surface-inverse">
                  <AvatarImage src={`/ui/visitor-onboarding/homeowner-${image}.jpg`} alt="" />
                  <AvatarFallback>
                    <Users className="size-4" />
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            <div className="text-sm">
              <p>12,400+ verified homes</p>
              <p className="text-surface-inverse-foreground/70">Find inspiration on Tickif</p>
            </div>
          </div>
        </aside>
        <section
          className="flex min-w-0 flex-1 flex-col gap-6 p-4 sm:p-6 md:p-8"
          aria-labelledby={`${id}-heading`}
        >
          <header className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2
                id={`${id}-heading`}
                ref={headingRef}
                tabIndex={-1}
                className="font-display text-lg font-medium outline-none"
              >
                You&apos;re in, welcome!
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close onboarding"
                disabled={saving}
                onClick={() => void complete(true)}
              >
                <X aria-hidden />
              </Button>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Two quick answers and your feed starts showing homes like yours.
            </p>
          </header>
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              void complete(false);
            }}
            aria-busy={saving}
          >
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel id={`${id}-home`}>What&apos;s your home?</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="lg"
                  spacing={2}
                  value={homeType ?? ''}
                  disabled={saving}
                  aria-labelledby={`${id}-home`}
                  onValueChange={(value) => {
                    setHomeType(VISITOR_HOME_TYPES.find((type) => type === value) ?? null);
                    setError('');
                  }}
                  className="grid w-full grid-cols-3 sm:grid-cols-5"
                >
                  {VISITOR_HOME_TYPES.map((type) => (
                    <ToggleGroupItem key={type} type="button" value={type}>
                      {VISITOR_HOME_LABELS[type]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-city`}>Where is it?</FieldLabel>
                <Select
                  value={cityId}
                  onValueChange={(value) => {
                    setCityId(value);
                    setLocalityId('');
                    setLocalities([]);
                    setError('');
                  }}
                  disabled={saving || !cities.length}
                >
                  <SelectTrigger id={`${id}-city`} className="h-12 w-full">
                    <span className="flex min-w-0 items-center gap-2">
                      <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
                      <SelectValue
                        placeholder={
                          locationLoading && !cityId ? 'Loading cities...' : 'Choose your city'
                        }
                      />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {cities.map((term) => (
                        <SelectItem key={term.id} value={term.id} data-testid={`city-${term.slug}`}>
                          {term.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {city && localities.length ? (
                  <Select
                    value={localityId || 'all'}
                    disabled={saving || locationLoading}
                    onValueChange={(value) => setLocalityId(value === 'all' ? '' : value)}
                  >
                    <SelectTrigger aria-label="Locality (optional)" className="h-12 w-full">
                      <SelectValue placeholder="Locality (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all">All areas in {city.label}</SelectItem>
                        {localities.map((term) => (
                          <SelectItem key={term.id} value={term.id}>
                            {term.label}, {city.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : null}
                {!cities.length && !locationLoading && !locationError ? (
                  <FieldDescription>
                    No cities are available yet. Skip to explore all projects.
                  </FieldDescription>
                ) : null}
                {locationLoading ? (
                  <p role="status" className="text-xs text-muted-foreground">
                    Loading locations...
                  </p>
                ) : null}
                {locationError ? (
                  <div
                    role="alert"
                    className="flex flex-wrap items-center gap-2 text-sm text-destructive"
                  >
                    {locationError}
                    <Button
                      type="button"
                      variant="link"
                      disabled={saving}
                      onClick={() => setRetry((value) => value + 1)}
                    >
                      Retry
                    </Button>
                  </div>
                ) : null}
              </Field>
            </FieldGroup>
            {city && localities.length ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-metadata text-muted-foreground">
                  IN {city.label}:
                </span>
                {localities
                  .filter((term) => term.id !== localityId)
                  .slice(0, 3)
                  .map((term) => (
                    <Button
                      key={term.id}
                      type="button"
                      variant="neutral"
                      size="sm"
                      disabled={saving || locationLoading}
                      onClick={() => setLocalityId(term.id)}
                    >
                      {term.label}
                    </Button>
                  ))}
              </div>
            ) : null}
            <div
              role="status"
              className="flex items-center gap-3 rounded-popover bg-surface-subtle p-3 text-sm text-secondary-foreground"
            >
              {matching?.hits.some((hit) => hit.coverImageUrl) ? (
                <div className="flex shrink-0 -space-x-4">
                  {matching.hits
                    .filter((hit) => hit.coverImageUrl)
                    .slice(0, 3)
                    .map((hit) => (
                      <img
                        key={hit.id}
                        src={hit.coverImageUrl!}
                        alt=""
                        width={32}
                        height={32}
                        className="size-8 rounded-lg border-2 border-card object-cover"
                      />
                    ))}
                </div>
              ) : null}
              <p>{previewMessage}</p>
            </div>
            {error ? (
              <div role="alert" className="text-sm text-destructive">
                {error}
                {sessionExpired ? (
                  <Button asChild variant="link">
                    <Link href="/login">Sign in again</Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                className="px-3"
                disabled={saving}
                onClick={() => void complete(true)}
              >
                Skip
              </Button>
              <Button type="submit" disabled={saving || !homeType || !city || locationLoading}>
                {saving ? 'Saving...' : 'Show my feed'}
                <ArrowRight data-icon="inline-end" aria-hidden />
              </Button>
            </div>
          </form>
        </section>
      </div>
    </Card>
  );
}
