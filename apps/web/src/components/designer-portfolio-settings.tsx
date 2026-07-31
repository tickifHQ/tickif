'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronsUpDown,
  Copy,
  ExternalLink,
  Globe,
  Info,
  Lightbulb,
  Loader2,
  RefreshCw,
  Star,
  X,
} from 'lucide-react';
import type {
  PortfolioResponse,
  RequiredPortfolioField,
  UpdatePortfolioInput,
  GoogleReviewsResponse,
} from '@repo/contracts';
import { AnimatedCollapsibleContent } from '@repo/ui/components/animated-collapsible-content';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { Skeleton } from '@repo/ui/components/skeleton';
import { Switch } from '@repo/ui/components/switch';
import { Textarea } from '@repo/ui/components/textarea';
import {
  GoogleBrandIcon,
  InstagramBrandIcon,
  LinkedInBrandIcon,
  YouTubeBrandIcon,
} from '@/components/brand-icons';
import { CopyLinkButton } from '@/components/copy-link-button';
import { env } from '@/env';
import {
  checkSlugAvailability,
  connectGoogleReviews,
  deleteLogo,
  disconnectGoogleReviews,
  fetchGoogleReviews,
  fetchPortfolio,
  refreshGoogleReviews,
  updatePortfolio,
  uploadLogo,
} from '@/lib/portfolio-api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormState = {
  publicLinkEnabled: boolean;
  portfolioSlug: string;
  accentColor: string;
  showHero: boolean;
  showTrustCredentials: boolean;
  showFeaturedTestimonial: boolean;
  showReviews: boolean;
  showSocialLinks: boolean;
  showShareBlock: boolean;
  tagline: string;
  displayName: string;
  bio: string;
  websiteUrl: string;
  instagramHandle: string;
  linkedinHandle: string;
  youtubeHandle: string;
  testimonialWords: string;
  testimonialAuthor: string;
  showOverallRating: boolean;
  showPositiveReviewsOnly: boolean;
  showTickifBadge: boolean;
};

type SlugStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'invalid' | 'error';

/** Mirrors the contract's portfolioSlugSchema regex (packages/contracts/src/profiles.ts). */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const portfolioWebUrl = new URL(env.NEXT_PUBLIC_WEB_URL);
const PORTFOLIO_URL_BASE = portfolioWebUrl.host;

/** Toggleable page sections (Hero has no visibility toggle in the design). */
type ToggleableSectionKey =
  | 'trust'
  | 'testimonial'
  | 'reviews'
  | 'socialLinks'
  | 'shareBlock';

type SectionKey = 'linkUrl' | 'customizations' | 'hero' | ToggleableSectionKey;

/** Hero fields that have to be filled before the public page goes live. */
const REQUIRED_FIELD_LABELS: Record<RequiredPortfolioField, string> = {
  logo: 'a logo',
  displayName: 'a studio name',
  tagline: 'a tagline',
  bio: 'a bio',
};

/** "a logo and a bio" — the missing fields as a readable list. */
function formatMissingFields(fields: RequiredPortfolioField[]): string {
  const labels = fields.map((field) => REQUIRED_FIELD_LABELS[field]);
  if (labels.length < 2) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** Maps a portfolio badge enum to its display label and illustration. */
const BADGE_META: Record<string, { label: string; src: string }> = {
  verified: { label: 'Verified', src: '/illustrations/badges/verified.svg' },
  new: { label: 'New', src: '/illustrations/badges/new.svg' },
  'top-performer': { label: 'Top Performer', src: '/illustrations/badges/top-performer.svg' },
  established: { label: 'Established', src: '/illustrations/badges/established.svg' },
  'projects-published': { label: 'Projects', src: '/illustrations/badges/projects-published.svg' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function portfolioToForm(data: PortfolioResponse): FormState {
  return {
    publicLinkEnabled: data.publicLinkEnabled,
    portfolioSlug: data.portfolioSlug ?? '',
    accentColor: data.accentColor,
    showHero: data.showHero,
    showTrustCredentials: data.showTrustCredentials,
    showFeaturedTestimonial: data.showFeaturedTestimonial,
    showReviews: data.showReviews,
    showSocialLinks: data.showSocialLinks,
    showShareBlock: data.showShareBlock,
    tagline: data.tagline ?? '',
    displayName: data.displayName,
    bio: data.bio ?? '',
    websiteUrl: data.websiteUrl ?? '',
    instagramHandle: data.instagramHandle ?? '',
    linkedinHandle: data.linkedinHandle ?? '',
    youtubeHandle: data.youtubeHandle ?? '',
    testimonialWords: data.testimonialWords ?? '',
    testimonialAuthor: data.testimonialAuthor ?? '',
    showOverallRating: data.showOverallRating,
    showPositiveReviewsOnly: data.showPositiveReviewsOnly,
    showTickifBadge: data.showTickifBadge,
  };
}

function computeChangedFields(
  current: FormState,
  saved: FormState,
): UpdatePortfolioInput | null {
  const patch: Record<string, unknown> = {};

  for (const key of Object.keys(current) as Array<keyof FormState>) {
    if (current[key] !== saved[key]) {
      const value = current[key];
      // displayName is required server-side (min 2 chars, not nullable):
      // omit it from the patch when cleared instead of sending a value that
      // is guaranteed to fail validation.
      if (key === 'displayName' && typeof value === 'string' && value.trim() === '') {
        continue;
      }
      // Convert empty strings to null for nullable text fields
      if (
        typeof value === 'string' &&
        value === '' &&
        ['portfolioSlug', 'tagline', 'bio', 'websiteUrl', 'instagramHandle', 'linkedinHandle', 'youtubeHandle', 'testimonialWords', 'testimonialAuthor'].includes(key)
      ) {
        patch[key] = null;
      } else {
        patch[key] = value;
      }
    }
  }

  return Object.keys(patch).length > 0 ? (patch as UpdatePortfolioInput) : null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DesignerPortfolioSettings() {
  // Data states
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState<FormState | null>(null);
  const [savedForm, setSavedForm] = useState<FormState | null>(null);

  // Save / discard
  const [isSaving, startSaveTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const formRevisionRef = useRef(0);

  // Slug check
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle');
  const slugDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSlugRef = useRef<string>('');

  // Logo
  const [isUploadingLogo, startLogoUploadTransition] = useTransition();
  const [isDeletingLogo, startLogoDeleteTransition] = useTransition();
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Google reviews connection (fetched separately from portfolio settings)
  const [googleReviews, setGoogleReviews] = useState<GoogleReviewsResponse | null>(null);
  const [googleRef, setGoogleRef] = useState('');
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [isConnectingGoogle, startGoogleConnectTransition] = useTransition();
  const [isRefreshingGoogle, setIsRefreshingGoogle] = useState(false);
  const googlePollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Collapsible/expanded UI state (local only — presentation, not persisted)
  const [sectionExpanded, setSectionExpanded] = useState<Record<SectionKey, boolean>>({
    linkUrl: true,
    customizations: true,
    hero: true,
    trust: false,
    testimonial: false,
    reviews: false,
    socialLinks: false,
    shareBlock: false,
  });

  // Featured-testimonial project selector is not persisted yet — the contract
  // exposes testimonialProjectId, but wiring it needs a project picker (list of
  // the designer's projects). Kept local so the section matches the design.
  const [testimonialProject, setTestimonialProject] = useState('');

  function toggleExpanded(key: SectionKey) {
    setSectionExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const loadPortfolio = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPortfolio();
      setPortfolio(data);
      const formData = portfolioToForm(data);
      setForm(formData);
      setSavedForm(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load portfolio settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  // -------------------------------------------------------------------------
  // Google reviews
  // -------------------------------------------------------------------------

  const loadGoogleReviews = useCallback(async () => {
    try {
      setGoogleReviews(await fetchGoogleReviews());
      setGoogleError(null);
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : 'Could not load Google reviews.');
    }
  }, []);

  useEffect(() => {
    void loadGoogleReviews();
    // Cancel any in-flight poll on unmount.
    return () => {
      if (googlePollRef.current) clearTimeout(googlePollRef.current);
    };
  }, [loadGoogleReviews]);

  /**
   * Connect/refresh persist a `pending` row and enqueue a background fetch, so
   * poll a few times to surface the worker's result without a manual reload.
   */
  const pollGoogleReviews = useCallback((attempt = 0) => {
    // Drop any timer still pending from an earlier connect/refresh so overlapping
    // actions can't orphan a timer that later fires on an unmounted component.
    if (googlePollRef.current) clearTimeout(googlePollRef.current);
    googlePollRef.current = setTimeout(() => {
      void (async () => {
        const data = await fetchGoogleReviews().catch(() => null);
        if (data) {
          setGoogleReviews(data);
          setGoogleError(null);
        }
        if (data?.connection?.status === 'pending' && attempt < 4) {
          pollGoogleReviews(attempt + 1);
        } else {
          googlePollRef.current = null;
          setIsRefreshingGoogle(false);
        }
      })();
    }, 2000);
  }, []);

  function handleConnectGoogle() {
    const reference = googleRef.trim();
    if (!reference) return;
    setGoogleError(null);
    startGoogleConnectTransition(async () => {
      try {
        const data = await connectGoogleReviews(reference);
        setGoogleReviews(data);
        setGoogleRef('');
        setIsRefreshingGoogle(true);
        pollGoogleReviews();
      } catch (err) {
        setGoogleError(err instanceof Error ? err.message : 'Could not connect that location.');
      }
    });
  }

  function handleRefreshGoogle() {
    setGoogleError(null);
    setIsRefreshingGoogle(true);
    void (async () => {
      try {
        const data = await refreshGoogleReviews();
        setGoogleReviews(data);
        pollGoogleReviews();
      } catch (err) {
        setGoogleError(err instanceof Error ? err.message : 'Could not refresh Google reviews.');
        setIsRefreshingGoogle(false);
      }
    })();
  }

  function handleDisconnectGoogle() {
    setGoogleError(null);
    void (async () => {
      try {
        await disconnectGoogleReviews();
        await loadGoogleReviews();
      } catch (err) {
        setGoogleError(err instanceof Error ? err.message : 'Could not disconnect.');
      }
    })();
  }

  // -------------------------------------------------------------------------
  // Dirty state
  // -------------------------------------------------------------------------

  const isDirty =
    form !== null &&
    savedForm !== null &&
    JSON.stringify(form) !== JSON.stringify(savedForm);

  // -------------------------------------------------------------------------
  // Form handlers
  // -------------------------------------------------------------------------

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    formRevisionRef.current += 1;
    setSaveSuccess(false);
    setSaveError(null);
  }

  // -------------------------------------------------------------------------
  // Slug debounce
  // -------------------------------------------------------------------------

  const handleSlugChange = useCallback(
    (value: string) => {
      // Sanitize toward the contract's slug shape: lowercase alphanumerics
      // and hyphens, no consecutive hyphens, no leading hyphen. A trailing
      // hyphen is allowed while typing and caught by the pattern check below.
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-{2,}/g, '-')
        .replace(/^-+/, '');
      updateField('portfolioSlug', slug);

      if (slugDebounceRef.current) {
        clearTimeout(slugDebounceRef.current);
      }

      if (!slug || slug.length < 3) {
        setSlugStatus('idle');
        latestSlugRef.current = '';
        return;
      }

      // Validate the final value against the contract regex before hitting
      // the API — the server would reject it with a 422 anyway.
      if (!SLUG_PATTERN.test(slug)) {
        setSlugStatus('invalid');
        latestSlugRef.current = '';
        return;
      }

      setSlugStatus('checking');
      latestSlugRef.current = slug;
      slugDebounceRef.current = setTimeout(async () => {
        try {
          const result = await checkSlugAvailability(slug);
          // Only update if this slug is still the latest request (prevents stale race)
          if (latestSlugRef.current === slug) {
            setSlugStatus(result.available ? 'available' : 'unavailable');
          }
        } catch {
          if (latestSlugRef.current === slug) {
            setSlugStatus('error');
          }
        }
      }, 500);
    },
    [],
  );

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (slugDebounceRef.current) {
        clearTimeout(slugDebounceRef.current);
      }
    };
  }, []);

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  function handleSave() {
    if (!form || !savedForm) return;
    const patch = computeChangedFields(form, savedForm);
    if (!patch) return;

    const revisionAtSave = formRevisionRef.current;

    startSaveTransition(async () => {
      setSaveError(null);
      setSaveSuccess(false);
      try {
        const updated = await updatePortfolio(patch);
        // Only apply server response if no edits were made during the request
        if (formRevisionRef.current === revisionAtSave) {
          setPortfolio(updated);
          const newForm = portfolioToForm(updated);
          setForm(newForm);
          setSavedForm(newForm);
          setSaveSuccess(true);
          setSlugStatus('idle');
        } else {
          // Edits happened during save — update savedForm (server state) but keep user's edits
          setPortfolio(updated);
          setSavedForm(portfolioToForm(updated));
          setSaveSuccess(true);
        }
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Could not save settings.');
      }
    });
  }

  // -------------------------------------------------------------------------
  // Discard
  // -------------------------------------------------------------------------

  function handleDiscard() {
    if (savedForm) {
      setForm(savedForm);
      setSaveError(null);
      setSaveSuccess(false);
      setSlugStatus('idle');
    }
  }

  // -------------------------------------------------------------------------
  // Logo upload
  // -------------------------------------------------------------------------

  function handleLogoUploadClick() {
    fileInputRef.current?.click();
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be re-selected
    event.target.value = '';

    startLogoUploadTransition(async () => {
      setLogoError(null);
      try {
        const result = await uploadLogo(file);
        // Refresh portfolio to get new logoUrl and all server-derived fields
        try {
          const refreshed = await fetchPortfolio();
          setPortfolio(refreshed);
        } catch {
          setPortfolio((prev) => prev ? { ...prev, logoUrl: result.logoUrl } : prev);
          setLogoError('Logo updated successfully. We couldn\'t refresh your portfolio status — please refresh the page to see the latest publish status.');
        }
      } catch (err) {
        setLogoError(err instanceof Error ? err.message : 'Could not upload logo.');
      }
    });
  }

  function handleLogoDelete() {
    startLogoDeleteTransition(async () => {
      setLogoError(null);
      try {
        await deleteLogo();
        try {
          const refreshed = await fetchPortfolio();
          setPortfolio(refreshed);
        } catch {
          setPortfolio((prev) => (prev ? { ...prev, logoUrl: null } : prev));
          setLogoError('Logo removed successfully. We couldn\'t refresh your portfolio status — please refresh the page to see the latest publish status.');
        }
      } catch (err) {
        setLogoError(err instanceof Error ? err.message : 'Could not delete logo.');
      }
    });
  }

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex flex-col">
        <div className="px-6 py-5">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-2 h-4 w-80" />
        </div>
        <div className="flex flex-1 gap-6 p-6">
          <div className="flex-1 space-y-6 lg:max-w-[65%]">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
          <div className="hidden lg:block lg:w-[35%]">
            <Skeleton className="h-96 w-full rounded-3xl" />
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  if (error) {
    return (
      <Card className="m-6 border-destructive/30 bg-destructive/5">
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <AlertCircle className="size-10 text-destructive" />
          <div>
            <p className="text-base font-medium text-foreground">
              Could not load portfolio settings
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" onClick={() => void loadPortfolio()}>
            <RefreshCw className="size-4" />
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  if (!form || !portfolio) return null;

  const initials = form.displayName
    ? form.displayName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'SM';
  const portfolioPath = `/d/${form.portfolioSlug || 'your-studio'}`;
  const copyUrl =
    portfolio.portfolioUrl ??
    new URL(portfolioPath, portfolioWebUrl).toString();
  // Derive the on-screen preview from the copy target so the displayed link
  // and the copied link never diverge once the backend populates portfolioUrl.
  const previewUrl = copyUrl.replace(/^https?:\/\//, '');

  // Google connection derived state (default `available` true until first load,
  // so the Connect UI doesn't flicker to "unavailable" on mount).
  const googleConnection = googleReviews?.connection ?? null;
  const googleAvailable = googleReviews?.available ?? true;
  const googleStatus = googleConnection?.status ?? null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-6 py-5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Portfolio
        </h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Manage your public link, customize the look, and configure each
          section visitors see.
        </p>
      </div>

      {/* Main content */}
      <div className="flex flex-1 -mt-2">
        {/* Left panel — form */}
        <div className="flex-1 p-6 lg:max-w-[65%]">
          <div className="space-y-6">
            {/* Link & URL */}
            <CollapsibleSection
              title="Link & URL"
              subtitle="Send it on WhatsApp, drop it in your Instagram bio, or print it on a card."
              expanded={sectionExpanded.linkUrl}
              onToggleExpanded={() => toggleExpanded('linkUrl')}
              compact
            >
              <div
                data-slot="portfolio-section-content"
                className="mt-0.5 overflow-hidden rounded-xl border border-border bg-background shadow-sm"
              >
                <div className="flex items-start justify-between gap-5 border-b border-border p-5">
                  <div>
                    <Label className="text-sm font-medium text-foreground">Public link</Label>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Anyone with the link can view your portfolio
                    </p>
                  </div>
                  <Switch
                    checked={form.publicLinkEnabled}
                    onCheckedChange={(checked) => updateField('publicLinkEnabled', checked)}
                  />
                </div>

                {/* Completeness gate — the switch alone does not make a page live. */}
                {portfolio.missingRequiredFields.length > 0 && (
                  <div
                    data-slot="portfolio-visibility-notice"
                    className="flex items-start gap-2 border-b border-border bg-muted/40 px-5 py-3"
                    role="status"
                  >
                    <AlertCircle className="mt-px size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Your portfolio isn&apos;t public yet. Add{' '}
                      <span className="font-medium text-foreground">
                        {formatMissingFields(portfolio.missingRequiredFields)}
                      </span>{' '}
                      in the Hero section and save to publish it.
                    </p>
                  </div>
                )}

                <div className="space-y-2 p-5">
                  <Label className="text-sm font-medium text-foreground">Portfolio URL</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 min-w-0 flex-1 overflow-hidden rounded-md border border-input bg-background shadow-xs focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                      <span className="flex shrink-0 items-center gap-1 bg-muted/50 px-2 text-sm font-medium text-muted-foreground">
                        <Globe className="size-4" aria-hidden />
                        {PORTFOLIO_URL_BASE}/d/
                      </span>
                      <Input
                        value={form.portfolioSlug}
                        onChange={(e) => handleSlugChange(e.target.value)}
                        placeholder="your-studio"
                        className="h-full rounded-none border-0 px-2 py-1 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                    {slugStatus === 'checking' && (
                      <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    )}
                    {slugStatus === 'available' && (
                      <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
                        <Check className="size-4" />
                        Available
                      </span>
                    )}
                    {slugStatus === 'unavailable' && (
                      <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-destructive">
                        <X className="size-4" />
                        Taken
                      </span>
                    )}
                    {(slugStatus === 'invalid' || slugStatus === 'error') && (
                      <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-destructive">
                        <AlertCircle className="size-4" />
                        {slugStatus === 'invalid' ? 'Invalid' : 'Check failed'}
                      </span>
                    )}
                  </div>
                  {slugStatus === 'invalid' ? (
                    <p className="text-xs text-destructive">
                      Use lowercase letters and numbers separated by single hyphens (no leading or
                      trailing hyphen).
                    </p>
                  ) : slugStatus === 'error' ? (
                    <p className="text-xs text-destructive">
                      Could not check slug availability. Check your connection and try again.
                    </p>
                  ) : (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Info className="size-4 shrink-0" aria-hidden />
                      Lowercase letters, numbers, and hyphens only
                    </p>
                  )}
                  {portfolio.portfolioUrl && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ExternalLink className="size-4 shrink-0" />
                      {portfolio.portfolioUrl}
                    </p>
                  )}
                </div>
              </div>
            </CollapsibleSection>

            {/* Customizations */}
            <CollapsibleSection
              title="Customizations"
              subtitle="Visual tweaks that apply across the whole portfolio."
              expanded={sectionExpanded.customizations}
              onToggleExpanded={() => toggleExpanded('customizations')}
              compact
            >
              <div
                data-slot="portfolio-section-content"
                className="mt-0.5 rounded-xl border border-border bg-background p-4 shadow-sm"
              >
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium mt-2 text-muted-foreground">Accent colour</Label>
                    <AccentColorDropdown
                      value={form.accentColor}
                      onChange={(hex) => updateField('accentColor', hex)}
                    />
                  </div>

                  <div className="mt-7">
                    <div className="flex items-center gap-2 rounded-xl border-l-4 border-primary bg-primary/5 px-4 py-3 ml-1">
                      <Lightbulb className="size-4 shrink-0 text-primary" />
                      <span className="text-sm font-semibold text-primary">Tip</span>
                      <span className="text-[13px] text-muted-foreground">Your accent colour is used across buttons and highlights on your public portfolio.</span>
                    </div>
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            {/* Page sections */}
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold text-foreground">
                  Page sections
                </h3>
                <p className="mt-1.5 max-w-lg text-sm text-muted-foreground">
                  Toggle each section on or off. Configure content below the
                  toggle — same items are pulled from settings page.
                </p>
              </div>

              {/* Hero */}
              <CollapsibleSection
                title="Hero"
                subtitle="Name, tagline, location, stats"
                expanded={sectionExpanded.hero}
                onToggleExpanded={() => toggleExpanded('hero')}
                compact
              >
                <div
                  data-slot="portfolio-section-content"
                  className="mt-0.5 rounded-xl border border-border bg-background p-4 shadow-sm"
                >
                  <div className="space-y-4">
                    {/* Logo upload + Studio name */}
                    <div className="flex items-start gap-3">
                      <div className="relative size-16.5 shrink-0">
                        <div className="relative size-full overflow-hidden rounded-lg border border-dashed border-border bg-muted/50">
                          {portfolio.logoUrl ? (
                            <Image
                              src={portfolio.logoUrl}
                              alt="Portfolio logo"
                              fill
                              unoptimized
                              className="object-cover"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={handleLogoUploadClick}
                              disabled={isUploadingLogo}
                              className="flex size-full items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                              aria-label="Upload logo"
                            >
                              {isUploadingLogo ? (
                                <Loader2 className="size-6 animate-spin" />
                              ) : (
                                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                                </svg>
                              )}
                            </button>
                          )}
                        </div>
                        {portfolio.logoUrl && (
                          <button
                            type="button"
                            onClick={handleLogoDelete}
                            disabled={isDeletingLogo}
                            className="absolute -right-1 -top-1 z-10 flex size-4 items-center justify-center rounded-full bg-muted-foreground/80 text-white disabled:opacity-50"
                            aria-label="Remove logo"
                          >
                            {isDeletingLogo ? (
                              <Loader2 className="size-2.5 animate-spin" />
                            ) : (
                              <svg viewBox="0 0 24 24" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12" /></svg>
                            )}
                          </button>
                        )}
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <Label className="text-sm font-medium text-muted-foreground">Studio name</Label>
                        <Input
                          value={form.displayName}
                          onChange={(e) => updateField('displayName', e.target.value)}
                          placeholder="Your studio name"
                          className="shadow-sm"
                        />
                      </div>
                    </div>
                    {logoError && (
                      <p className="text-[13px] font-medium text-destructive">{logoError}</p>
                    )}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-muted-foreground">Tagline</Label>
                      <Input
                        value={form.tagline}
                        onChange={(e) => updateField('tagline', e.target.value)}
                        placeholder="A short tagline for your portfolio"
                        maxLength={200}
                        className="shadow-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-muted-foreground">Bio</Label>
                      <Textarea
                        value={form.bio}
                        onChange={(e) => updateField('bio', e.target.value)}
                        placeholder="Tell visitors about your design philosophy..."
                        maxLength={500}
                        rows={4}
                        className="resize-y shadow-sm"
                      />
                    </div>
                  </div>
                </div>
              </CollapsibleSection>

              {/* Trust & credentials */}
              <ToggleableSection
                title="Trust & credentials"
                subtitle="Showcase your trust signals here"
                enabled={form.showTrustCredentials}
                onToggle={() => updateField('showTrustCredentials', !form.showTrustCredentials)}
                expanded={sectionExpanded.trust}
                onToggleExpanded={() => toggleExpanded('trust')}
              >
                <div
                  data-slot="portfolio-section-content"
                  className="mt-0.5 rounded-xl border border-border bg-background p-4 shadow-sm"
                >
                  {portfolio.badges.length > 0 ? (
                    <div className="flex flex-wrap gap-4">
                      {portfolio.badges.map((badge) => {
                        const meta = BADGE_META[badge];
                        if (!meta) return null;
                        return (
                          <div key={badge} className="flex flex-col items-center">
                            <img src={meta.src} alt={meta.label} className="h-22 w-auto" />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Trust badges are awarded automatically as you publish projects and complete milestones.
                    </p>
                  )}
                </div>
              </ToggleableSection>

              {/* Featured testimonial */}
              <ToggleableSection
                title="Featured testimonial"
                subtitle="Their words – one client quote"
                enabled={form.showFeaturedTestimonial}
                onToggle={() => updateField('showFeaturedTestimonial', !form.showFeaturedTestimonial)}
                expanded={sectionExpanded.testimonial}
                onToggleExpanded={() => toggleExpanded('testimonial')}
              >
                <div
                  data-slot="portfolio-section-content"
                  className="mt-0.5 rounded-xl border border-border bg-background p-6 shadow-sm"
                >
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-muted-foreground">Their words</Label>
                      <Textarea
                        value={form.testimonialWords}
                        onChange={(e) => updateField('testimonialWords', e.target.value)}
                        placeholder="A line from a happy client..."
                        maxLength={500}
                        rows={3}
                        className="resize-y shadow-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-muted-foreground">Author</Label>
                        <Input
                          value={form.testimonialAuthor}
                          onChange={(e) => updateField('testimonialAuthor', e.target.value)}
                          placeholder="Client"
                          maxLength={100}
                          className="shadow-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-muted-foreground">Project</Label>
                        {/* TODO(E-195 follow-up): wire to testimonialProjectId with a project picker */}
                        <div className="relative">
                          <Input
                            value={testimonialProject}
                            onChange={(e) => setTestimonialProject(e.target.value)}
                            placeholder="Select a project"
                            className="pr-8 shadow-sm"
                          />
                          <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </ToggleableSection>

              {/* Reviews */}
              <ToggleableSection
                title="Reviews"
                subtitle="What it's like to work with us"
                enabled={form.showReviews}
                onToggle={() => updateField('showReviews', !form.showReviews)}
                expanded={sectionExpanded.reviews}
                onToggleExpanded={() => toggleExpanded('reviews')}
              >
                <div
                  data-slot="portfolio-section-content"
                  className="mt-0.5 overflow-hidden rounded-xl border border-border bg-background shadow-sm"
                >
                  <div
                    className="space-y-5 border-b border-border p-5"
                    data-testid="reviews-integration"
                  >
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 p-3 shadow-sm">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                          <GoogleBrandIcon className="size-6" aria-hidden />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">Google</p>
                          <p className="text-xs text-muted-foreground">
                            For fetching reviews from your google maps locations.
                          </p>
                        </div>
                        {googleStatus === 'connected' ? (
                          <Badge
                            variant="success"
                            className="shrink-0 gap-1.5 rounded-md bg-success/15 px-2 py-1 font-normal text-success"
                          >
                            <span className="flex size-4 items-center justify-center rounded-full bg-success text-success-foreground">
                              <Check aria-hidden />
                            </span>
                            Connected
                          </Badge>
                        ) : googleStatus === 'pending' ? (
                          <Badge
                            variant="secondary"
                            className="shrink-0 gap-1.5 rounded-md bg-muted px-2 py-1 font-normal text-muted-foreground"
                          >
                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                            Connecting
                          </Badge>
                        ) : googleStatus === 'error' ? (
                          <Badge
                            variant="destructive"
                            className="shrink-0 gap-1.5 rounded-md bg-destructive/15 px-2 py-1 font-normal text-destructive"
                          >
                            <AlertCircle className="size-3.5" aria-hidden />
                            Needs attention
                          </Badge>
                        ) : googleStatus === 'stale' ? (
                          <Badge
                            variant="secondary"
                            className="shrink-0 gap-1.5 rounded-md bg-muted px-2 py-1 font-normal text-muted-foreground"
                          >
                            <RefreshCw className="size-3.5" aria-hidden />
                            Needs refresh
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    {!googleAvailable ? (
                      <p className="text-[13px] text-muted-foreground">
                        Google review fetching isn&rsquo;t enabled on this workspace yet.
                      </p>
                    ) : googleConnection ? (
                      <div className="space-y-3">
                        {googleStatus === 'connected' ? (
                          <div
                            className="flex items-center gap-2.5 text-sm font-medium text-muted-foreground"
                            data-testid="reviews-summary"
                          >
                            <Badge
                              variant="success"
                              className="gap-1.5 rounded-md bg-success/15 px-2 py-1 font-normal text-success"
                            >
                              <span className="flex size-4 items-center justify-center rounded-full bg-success text-success-foreground">
                                <Check aria-hidden />
                              </span>
                              Connected
                            </Badge>
                            <span aria-hidden>·</span>
                            <span className="flex items-center gap-1">
                              <span>{(googleConnection.rating ?? 0).toFixed(1)}</span>
                              <Star
                                className="size-3.5 fill-current"
                                data-testid="review-rating-star"
                                aria-hidden
                              />
                            </span>
                            <span aria-hidden>·</span>
                            <span>{googleConnection.userRatingsTotal ?? 0} reviews</span>
                          </div>
                        ) : googleStatus === 'pending' ? (
                          <p className="text-[13px] text-muted-foreground">
                            Fetching your reviews from Google&hellip;
                          </p>
                        ) : googleStatus === 'stale' ? (
                          <p className="text-[13px] text-muted-foreground">
                            These reviews are older than 30 days &mdash; refresh to update them.
                          </p>
                        ) : googleStatus === 'error' ? (
                          <p className="text-[13px] text-destructive">
                            We couldn&rsquo;t fetch reviews for this location. Try refreshing, or
                            disconnect and reconnect.
                          </p>
                        ) : null}
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleRefreshGoogle}
                            disabled={isRefreshingGoogle}
                          >
                            <RefreshCw className={`size-3.5 ${isRefreshingGoogle ? 'animate-spin' : ''}`} />
                            Refresh
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={handleDisconnectGoogle}>
                            Disconnect
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          value={googleRef}
                          onChange={(e) => setGoogleRef(e.target.value)}
                          placeholder="Google Maps link or business name"
                          className="shadow-sm"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleConnectGoogle}
                          disabled={isConnectingGoogle || !googleRef.trim()}
                        >
                          {isConnectingGoogle ? <Loader2 className="size-3.5 animate-spin" /> : null}
                          Connect
                        </Button>
                      </div>
                    )}

                    {googleError ? <p className="text-xs text-destructive">{googleError}</p> : null}
                  </div>

                  <div className="p-5">
                    <div className="space-y-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">Show overall ratings on your profile</p>
                          <p className="text-[13px] text-muted-foreground">Show Google rating in trust strip</p>
                        </div>
                        <Switch
                          checked={form.showOverallRating}
                          onCheckedChange={(checked) => updateField('showOverallRating', checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">Show only reviews with over 4+ star ratings</p>
                          <p className="text-[13px] text-muted-foreground">Show positive testimonials on your portfolio</p>
                        </div>
                        <Switch
                          checked={form.showPositiveReviewsOnly}
                          onCheckedChange={(checked) => updateField('showPositiveReviewsOnly', checked)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </ToggleableSection>

              {/* Social links */}
              <ToggleableSection
                title="Social links"
                subtitle="Showcase your social links here"
                enabled={form.showSocialLinks}
                onToggle={() => updateField('showSocialLinks', !form.showSocialLinks)}
                expanded={sectionExpanded.socialLinks}
                onToggleExpanded={() => toggleExpanded('socialLinks')}
              >
                <div
                  data-slot="portfolio-section-content"
                  className="mt-0.5 rounded-xl border border-border bg-background p-4 shadow-sm"
                >
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-muted-foreground">Website</Label>
                      <Input
                        value={form.websiteUrl}
                        onChange={(e) => updateField('websiteUrl', e.target.value)}
                        placeholder="https://"
                        type="url"
                        className="shadow-sm"
                      />
                    </div>

                    <div className="-mx-4 h-px w-[calc(100%+2rem)] bg-border" />

                    <div className="space-y-3">
                      <Label className="text-sm font-medium text-muted-foreground">Social links</Label>
                      <div className="flex items-center gap-0 overflow-hidden rounded-md border border-border shadow-sm">
                        <span className="flex h-9 w-10 shrink-0 items-center justify-center border-r border-border bg-background">
                          <InstagramBrandIcon className="size-4" />
                        </span>
                        <Input
                          value={form.instagramHandle}
                          onChange={(e) => updateField('instagramHandle', e.target.value)}
                          placeholder="Instagram handle"
                          className="border-0 shadow-none focus-visible:ring-0"
                        />
                      </div>
                      <div className="flex items-center gap-0 overflow-hidden rounded-md border border-border shadow-sm">
                        <span className="flex h-9 w-10 shrink-0 items-center justify-center border-r border-border bg-background">
                          <LinkedInBrandIcon className="size-4" />
                        </span>
                        <Input
                          value={form.linkedinHandle}
                          onChange={(e) => updateField('linkedinHandle', e.target.value)}
                          placeholder="Linkedin handle..."
                          className="border-0 shadow-none focus-visible:ring-0"
                        />
                      </div>
                      <div className="flex items-center gap-0 overflow-hidden rounded-md border border-border shadow-sm">
                        <span className="flex h-9 w-10 shrink-0 items-center justify-center border-r border-border bg-background">
                          <YouTubeBrandIcon className="size-4" />
                        </span>
                        <Input
                          value={form.youtubeHandle}
                          onChange={(e) => updateField('youtubeHandle', e.target.value)}
                          placeholder="YouTube handle..."
                          className="border-0 shadow-none focus-visible:ring-0"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </ToggleableSection>

              {/* Share block */}
              <ToggleableSection
                title="Share block"
                subtitle="A portfolio worth sharing"
                enabled={form.showShareBlock}
                onToggle={() => updateField('showShareBlock', !form.showShareBlock)}
                expanded={sectionExpanded.shareBlock}
                onToggleExpanded={() => toggleExpanded('shareBlock')}
              >
                <div
                  data-slot="portfolio-section-content"
                  className="mt-0.5 rounded-xl border border-border bg-background p-4 shadow-sm"
                >
                  <div className="space-y-4">
                    <p className="text-[15px] text-muted-foreground font-medium mt-1.5">
                      Encourages visitors to copy and share your portfolio link. Uses your studio name, cover, and accent colour.
                    </p>

                    <div className="rounded-lg bg-muted p-4">
                      <p className="text-lg font-medium text-foreground">
                        A portfolio worth <span className="italic text-primary">sharing</span>.
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{previewUrl}</p>
                    </div>

                    <div className="-mx-4 h-px w-[calc(100%+2rem)] bg-border" />

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">Show Made with Tickif badge</p>
                        <p className="text-[13px] text-muted-foreground">Show Made with Tickif badge on your profile</p>
                      </div>
                      <Switch
                        checked={form.showTickifBadge}
                        onCheckedChange={(checked) => updateField('showTickifBadge', checked)}
                      />
                    </div>
                  </div>
                </div>
              </ToggleableSection>
            </div>
          </div>
        </div>

        {/* Right panel — live preview */}
        <div className="hidden flex-col items-center p-6 lg:flex lg:w-[35%]">
          <div className="sticky top-6 flex w-full flex-col items-center gap-4">
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="size-4 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 4h7M14 9h7M14 15h7M14 20h7" />
                </svg>
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Live preview</span>
              </div>
              <button
                type="button"
                disabled
                className="flex cursor-not-allowed items-center gap-1.5 text-sm font-medium text-foreground transition-colors"
              >
                Open full
                <ArrowRight className="size-3.5" aria-hidden />
              </button>
            </div>

            {/* URL bar */}
            <div className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-2.5">
              <span className="text-sm text-foreground">{previewUrl}</span>
              <Badge
                variant="outline"
                className={
                  form.publicLinkEnabled
                    ? 'border-primary/30 text-xs font-medium text-primary'
                    : 'text-xs font-medium text-muted-foreground'
                }
              >
                {form.publicLinkEnabled ? 'Live' : 'Hidden'}
              </Badge>
            </div>

            {/* Portfolio preview card */}
            <Card className="w-full overflow-hidden rounded-3xl bg-primary/5">
              <div className="px-4 pt-4">
                <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-lg -rotate-2">
                  <div className="h-24 bg-[linear-gradient(135deg,var(--muted),var(--background))]" />
                  <div className="space-y-3 px-5 py-4 text-center">
                    <div className="mx-auto -mt-10 flex size-14 items-center justify-center overflow-hidden rounded-2xl border border-border bg-amber-700 shadow-sm">
                      {portfolio.logoUrl ? (
                        <Image
                          src={portfolio.logoUrl}
                          alt="Portfolio logo"
                          width={56}
                          height={56}
                          unoptimized
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="text-lg font-bold text-white">{initials}</span>
                      )}
                    </div>
                    <div>
                      <div className="text-base font-semibold text-foreground">{form.displayName || 'Studio Meraki'}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {form.tagline || previewUrl}
                      </div>
                    </div>
                    <div className="mx-auto inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
                      <Copy className="size-3 shrink-0" />
                      <span className="truncate">{previewUrl}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-5 pt-5 pb-5">
                <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  One link. Everywhere.
                </div>
                <div className="mt-2 text-2xl font-medium tracking-tight text-foreground">
                  A portfolio worth <span className="text-primary">sharing.</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Send it on WhatsApp, drop it in your Instagram bio, or print it on a card.
                </p>
                <CopyLinkButton
                  value={copyUrl}
                  variant="emphasis"
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#363940] to-[#1a1d23] py-3 text-sm font-medium text-white/90 shadow-[0_3px_10px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors hover:from-[#3e4148] hover:to-[#1f2228]"
                />
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        data-testid="portfolio-action-bar"
        className="sticky bottom-6 z-10 mx-6 mb-6 flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-6 py-4 shadow-md"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDiscard}
            disabled={!isDirty || isSaving}
            className="text-sm font-medium text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            Discard changes
          </button>
          {saveSuccess && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-primary">
              <Check className="size-4" />
              Saved
            </span>
          )}
          {saveError && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-destructive">
              <AlertCircle className="size-4" />
              {saveError}
            </span>
          )}
        </div>
        <Button className="gap-1.5" onClick={handleSave} disabled={!isDirty || isSaving}>
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Save changes
        </Button>
      </div>

      {/* Hidden file input for logo upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={handleFileSelected}
      />
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────────── */

const accentColors = [
  { name: 'Coral red', hex: '#FF8F73' },
  { name: 'Ocean blue', hex: '#4A90D9' },
  { name: 'Forest green', hex: '#2D8659' },
  { name: 'Sunset orange', hex: '#F5A623' },
  { name: 'Lavender', hex: '#9B59B6' },
  { name: 'Slate grey', hex: '#6B7B8D' },
  { name: 'Mint', hex: '#50C9A8' },
  { name: 'Rose pink', hex: '#E84393' },
];

function AccentColorDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const selected =
    accentColors.find((c) => c.hex.toLowerCase() === value.toLowerCase()) ?? {
      name: 'Custom',
      hex: value || '#FF8F73',
    };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2.5 shadow-md transition-colors hover:bg-accent/50">
        <div className="flex items-center gap-2.5">
          <span
            className="size-5 shrink-0 rounded-full border border-border"
            style={{ backgroundColor: selected.hex }}
          />
          <span className="text-sm font-medium text-foreground">{selected.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{selected.hex}</span>
          <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={4}
        className="w-[var(--radix-dropdown-menu-trigger-width)]"
      >
        {accentColors.map((color) => (
          <DropdownMenuItem
            key={color.hex}
            onSelect={() => onChange(color.hex)}
            className={`justify-between px-3 py-2 ${color.hex.toLowerCase() === value.toLowerCase() ? 'bg-accent/30' : ''}`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="size-5 shrink-0 rounded-full border border-border"
                style={{ backgroundColor: color.hex }}
              />
              <span className="text-sm text-foreground">{color.name}</span>
            </div>
            <span className="text-xs text-muted-foreground">{color.hex}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CollapsibleSection({
  title,
  subtitle,
  expanded,
  onToggleExpanded,
  children,
  compact = false,
}: {
  title: string;
  subtitle: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      data-slot="portfolio-section"
      className={compact ? 'rounded-2xl bg-muted/30 p-1' : 'rounded-xl bg-muted/70 p-5'}
    >
      <div className={compact ? undefined : 'space-y-4'}>
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className={
            compact
              ? 'flex w-full items-start justify-between gap-1 p-2'
              : 'flex w-full items-center justify-between'
          }
        >
          <div className="text-left">
            <h3
              className={
                compact
                  ? 'text-lg font-medium leading-relaxed text-foreground'
                  : 'text-lg font-semibold text-foreground'
              }
            >
              {title}
            </h3>
            <p
              className={
                compact
                  ? 'text-xs leading-relaxed text-muted-foreground'
                  : 'mt-0.5 text-sm text-muted-foreground'
              }
            >
              {subtitle}
            </p>
          </div>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
        <AnimatedCollapsibleContent open={expanded}>{children}</AnimatedCollapsibleContent>
      </div>
    </div>
  );
}

function ToggleableSection({
  title,
  subtitle,
  enabled,
  onToggle,
  expanded,
  onToggleExpanded,
  children,
}: {
  title: string;
  subtitle: string;
  enabled: boolean;
  onToggle: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  children: React.ReactNode;
}) {
  return (
    <div data-slot="portfolio-section" className="rounded-2xl bg-muted/30 p-1">
      <div>
        <div className="flex w-full items-start justify-between gap-1 p-2">
          <button
            type="button"
            onClick={onToggleExpanded}
            aria-expanded={expanded}
            className="flex-1 text-left"
          >
            <h3 className="text-lg font-medium leading-relaxed text-foreground">{title}</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
          </button>
          <div className="flex items-center gap-3">
            <Switch checked={enabled} onCheckedChange={onToggle} />
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-expanded={expanded}
              aria-label={`Toggle ${title} details`}
            >
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </div>
        </div>
        <AnimatedCollapsibleContent open={expanded}>{children}</AnimatedCollapsibleContent>
      </div>
    </div>
  );
}
