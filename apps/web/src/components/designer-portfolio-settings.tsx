'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import {
  AlertCircle,
  Check,
  ExternalLink,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { PortfolioResponse, UpdatePortfolioInput } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/card';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { Skeleton } from '@repo/ui/components/skeleton';
import { Switch } from '@repo/ui/components/switch';
import { Textarea } from '@repo/ui/components/textarea';
import {
  checkSlugAvailability,
  deleteLogo,
  fetchPortfolio,
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

type SlugStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'error';

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

  // Slug check
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle');
  const slugDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Logo
  const [isUploadingLogo, startLogoUploadTransition] = useTransition();
  const [isDeletingLogo, startLogoDeleteTransition] = useTransition();
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setSaveSuccess(false);
    setSaveError(null);
  }

  // -------------------------------------------------------------------------
  // Slug debounce
  // -------------------------------------------------------------------------

  const handleSlugChange = useCallback(
    (value: string) => {
      const slug = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
      updateField('portfolioSlug', slug);

      if (slugDebounceRef.current) {
        clearTimeout(slugDebounceRef.current);
      }

      if (!slug || slug.length < 3) {
        setSlugStatus('idle');
        return;
      }

      setSlugStatus('checking');
      slugDebounceRef.current = setTimeout(async () => {
        try {
          const result = await checkSlugAvailability(slug);
          setSlugStatus(result.available ? 'available' : 'unavailable');
        } catch {
          setSlugStatus('error');
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

    startSaveTransition(async () => {
      setSaveError(null);
      setSaveSuccess(false);
      try {
        const updated = await updatePortfolio(patch);
        setPortfolio(updated);
        const newForm = portfolioToForm(updated);
        setForm(newForm);
        setSavedForm(newForm);
        setSaveSuccess(true);
        setSlugStatus('idle');
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
        // Refresh portfolio to get new logoUrl
        setPortfolio((prev) =>
          prev ? { ...prev, logoUrl: result.logoUrl } : prev,
        );
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
        setPortfolio((prev) => (prev ? { ...prev, logoUrl: null } : prev));
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
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="grid gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent className="grid gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  if (error) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
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
        </CardContent>
      </Card>
    );
  }

  if (!form || !portfolio) return null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="grid gap-6">
      {/* Save / Discard bar */}
      {(isDirty || saveSuccess || saveError) && (
        <div className="sticky top-4 z-10 flex items-center gap-3 rounded-xl border border-border bg-background/95 px-4 py-3 shadow-md backdrop-blur-sm">
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
          <div className="ml-auto flex items-center gap-2">
            {isDirty && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDiscard}
                  disabled={isSaving}
                >
                  Discard
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving}>
                  {isSaving && <Loader2 className="size-4 animate-spin" />}
                  Save changes
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Portfolio URL */}
      <Card>
        <CardHeader>
          <CardTitle>Portfolio link</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="public-link-toggle">Public link enabled</Label>
              <p className="text-sm text-muted-foreground">
                Your portfolio is{' '}
                {form.publicLinkEnabled ? 'visible' : 'hidden'} to the public.
              </p>
            </div>
            <Switch
              id="public-link-toggle"
              checked={form.publicLinkEnabled}
              onCheckedChange={(checked) =>
                updateField('publicLinkEnabled', checked)
              }
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="portfolio-slug">Custom slug</Label>
            <div className="flex items-center gap-2">
              <Input
                id="portfolio-slug"
                value={form.portfolioSlug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="my-studio"
                className="flex-1"
              />
              {slugStatus === 'checking' && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
              {slugStatus === 'available' && (
                <span className="flex items-center gap-1 text-sm font-medium text-primary">
                  <Check className="size-4" />
                  Available
                </span>
              )}
              {slugStatus === 'unavailable' && (
                <span className="flex items-center gap-1 text-sm font-medium text-destructive">
                  <X className="size-4" />
                  Taken
                </span>
              )}
            </div>
            {portfolio.portfolioUrl && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <ExternalLink className="size-3" />
                {portfolio.portfolioUrl}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="accent-color">Accent color</Label>
            <div className="flex items-center gap-3">
              <input
                id="accent-color"
                type="color"
                value={form.accentColor}
                onChange={(e) => updateField('accentColor', e.target.value)}
                className="size-10 cursor-pointer rounded-md border border-input bg-background p-1"
              />
              <Input
                value={form.accentColor}
                onChange={(e) => updateField('accentColor', e.target.value)}
                placeholder="#FF8F73"
                className="w-32"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logo */}
      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center gap-4">
            {portfolio.logoUrl ? (
              <div className="relative size-16 overflow-hidden rounded-lg border bg-muted">
                <Image
                  src={portfolio.logoUrl}
                  alt="Portfolio logo"
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="flex size-16 items-center justify-center rounded-lg border border-dashed bg-muted/30 text-muted-foreground">
                <Upload className="size-5" />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogoUploadClick}
                  disabled={isUploadingLogo}
                >
                  {isUploadingLogo ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  {portfolio.logoUrl ? 'Replace' : 'Upload'}
                </Button>
                {portfolio.logoUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogoDelete}
                    disabled={isDeletingLogo}
                    className="text-destructive hover:text-destructive"
                  >
                    {isDeletingLogo ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                    Delete
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                JPEG, PNG, WebP, or AVIF. Max 5 MB.
              </p>
            </div>
          </div>
          {logoError && (
            <p className="text-sm font-medium text-destructive">{logoError}</p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="hidden"
            onChange={handleFileSelected}
          />
        </CardContent>
      </Card>

      {/* Profile info */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              value={form.displayName}
              onChange={(e) => updateField('displayName', e.target.value)}
              placeholder="Your Studio Name"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              value={form.tagline}
              onChange={(e) => updateField('tagline', e.target.value)}
              placeholder="A short tagline for your portfolio"
              maxLength={200}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={form.bio}
              onChange={(e) => updateField('bio', e.target.value)}
              placeholder="Tell homeowners about your design philosophy"
              maxLength={2000}
              rows={4}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="website-url">Website</Label>
              <Input
                id="website-url"
                value={form.websiteUrl}
                onChange={(e) => updateField('websiteUrl', e.target.value)}
                placeholder="https://yourstudio.com"
                type="url"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="instagram">Instagram</Label>
              <Input
                id="instagram"
                value={form.instagramHandle}
                onChange={(e) =>
                  updateField('instagramHandle', e.target.value)
                }
                placeholder="@yourstudio"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="linkedin">LinkedIn</Label>
              <Input
                id="linkedin"
                value={form.linkedinHandle}
                onChange={(e) =>
                  updateField('linkedinHandle', e.target.value)
                }
                placeholder="/company/yourstudio"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="youtube">YouTube</Label>
              <Input
                id="youtube"
                value={form.youtubeHandle}
                onChange={(e) =>
                  updateField('youtubeHandle', e.target.value)
                }
                placeholder="@yourstudio"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section visibility toggles */}
      <Card>
        <CardHeader>
          <CardTitle>Section visibility</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ToggleRow
            id="show-hero"
            label="Hero section"
            checked={form.showHero}
            onChange={(v) => updateField('showHero', v)}
          />
          <ToggleRow
            id="show-trust"
            label="Trust credentials"
            checked={form.showTrustCredentials}
            onChange={(v) => updateField('showTrustCredentials', v)}
          />
          <ToggleRow
            id="show-testimonial"
            label="Featured testimonial"
            checked={form.showFeaturedTestimonial}
            onChange={(v) => updateField('showFeaturedTestimonial', v)}
          />
          <ToggleRow
            id="show-reviews"
            label="Reviews"
            checked={form.showReviews}
            onChange={(v) => updateField('showReviews', v)}
          />
          <ToggleRow
            id="show-social"
            label="Social links"
            checked={form.showSocialLinks}
            onChange={(v) => updateField('showSocialLinks', v)}
          />
          <ToggleRow
            id="show-share"
            label="Share block"
            checked={form.showShareBlock}
            onChange={(v) => updateField('showShareBlock', v)}
          />
        </CardContent>
      </Card>

      {/* Testimonial settings */}
      <Card>
        <CardHeader>
          <CardTitle>Featured testimonial</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="testimonial-words">Testimonial text</Label>
            <Textarea
              id="testimonial-words"
              value={form.testimonialWords}
              onChange={(e) =>
                updateField('testimonialWords', e.target.value)
              }
              placeholder="What did your client say?"
              maxLength={500}
              rows={3}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="testimonial-author">Author</Label>
            <Input
              id="testimonial-author"
              value={form.testimonialAuthor}
              onChange={(e) =>
                updateField('testimonialAuthor', e.target.value)
              }
              placeholder="Client name"
              maxLength={100}
            />
          </div>
        </CardContent>
      </Card>

      {/* Review settings */}
      <Card>
        <CardHeader>
          <CardTitle>Review display</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ToggleRow
            id="show-overall-rating"
            label="Show overall rating"
            checked={form.showOverallRating}
            onChange={(v) => updateField('showOverallRating', v)}
          />
          <ToggleRow
            id="show-positive-only"
            label="Show positive reviews only"
            description="Only display reviews with 4+ stars"
            checked={form.showPositiveReviewsOnly}
            onChange={(v) => updateField('showPositiveReviewsOnly', v)}
          />
          <ToggleRow
            id="show-tickif-badge"
            label="Show Tickif badge"
            checked={form.showTickifBadge}
            onChange={(v) => updateField('showTickifBadge', v)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
