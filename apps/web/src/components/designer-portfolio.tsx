'use client';

import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Globe,
  Instagram,
  Linkedin,
  Link2,
  MapPin,
  Palette,
  Sparkles,
  Youtube,
} from 'lucide-react';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { Switch } from '@repo/ui/components/switch';
import { Textarea } from '@repo/ui/components/textarea';
import { Badge } from '@repo/ui/components/badge';

type SectionKey =
  | 'hero'
  | 'trust'
  | 'testimonial'
  | 'reviews'
  | 'socialLinks'
  | 'shareBlock';

type SectionState = Record<SectionKey, boolean>;

export function DesignerPortfolio() {
  // Link & URL
  const [publicLinkEnabled, setPublicLinkEnabled] = useState(true);
  const [portfolioSlug, setPortfolioSlug] = useState('livspace');

  // Customizations
  const [accentColor, setAccentColor] = useState('#FF8F73');

  // Section toggles
  const [sectionEnabled, setSectionEnabled] = useState<SectionState>({
    hero: true,
    trust: true,
    testimonial: true,
    reviews: true,
    socialLinks: true,
    shareBlock: true,
  });

  // Section expanded states
  const [sectionExpanded, setSectionExpanded] = useState<SectionState>({
    hero: true,
    trust: false,
    testimonial: false,
    reviews: false,
    socialLinks: false,
    shareBlock: false,
  });

  // Hero section fields
  const [studioName, setStudioName] = useState('Livspace');
  const [tagline, setTagline] = useState(
    'Quiet, light-filled homes with timeless materials',
  );
  const [bio, setBio] = useState(
    'We design calm, light-filled interiors using honest materials — wood, stone, linen — so every room feels both considered and effortless.',
  );

  // Testimonial fields
  const [testimonialWords, setTestimonialWords] = useState('');
  const [testimonialAuthor, setTestimonialAuthor] = useState('');
  const [testimonialProject, setTestimonialProject] = useState('');

  // Reviews
  const [showOverallRatings, setShowOverallRatings] = useState(true);
  const [showOnlyHighRatings, setShowOnlyHighRatings] = useState(false);

  // Social links
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [linkedinHandle, setLinkedinHandle] = useState('');
  const [youtubeHandle, setYoutubeHandle] = useState('');

  // Share block
  const [showTickifBadge, setShowTickifBadge] = useState(true);

  function toggleSection(key: SectionKey) {
    setSectionEnabled((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleExpanded(key: SectionKey) {
    setSectionExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center gap-2">
          <Link2 className="size-5 text-foreground" />
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Portfolio
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your public link, customize the look, and configure each section
          visitors see.
        </p>
      </div>

      {/* Main content */}
      <div className="flex min-h-0 flex-1">
        {/* Left panel — form */}
        <div className="flex-1 overflow-y-auto border-r border-border p-6 lg:max-w-[65%]">
          <div className="space-y-8">
            {/* Link & URL */}
            <FormSection title="Link & URL">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Public link</Label>
                  <Switch
                    checked={publicLinkEnabled}
                    onCheckedChange={setPublicLinkEnabled}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Portfolio url</Label>
                  <div className="flex items-center gap-0">
                    <span className="flex h-9 items-center rounded-l-md border border-r-0 border-border bg-muted px-3 text-sm text-muted-foreground">
                      tickif.in/
                    </span>
                    <Input
                      value={portfolioSlug}
                      onChange={(e) => setPortfolioSlug(e.target.value)}
                      className="rounded-l-none"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Lowercase letters and hyphens only
                  </p>
                </div>
              </div>
            </FormSection>

            {/* Customizations */}
            <FormSection title="Customizations">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Accent colour</Label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="size-9 shrink-0 rounded-md border border-border shadow-sm"
                      style={{ backgroundColor: accentColor }}
                      aria-label="Pick accent colour"
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">
                        Coral red
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {accentColor}
                      </span>
                    </div>
                    <Input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="ml-auto size-9 cursor-pointer p-0.5"
                    />
                  </div>
                </div>

                <Card className="border-dashed bg-muted/30 p-4">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      <span className="font-medium text-foreground">Tip:</span>{' '}
                      Pair with a cool page art for more enquiries
                    </p>
                  </div>
                </Card>
              </div>
            </FormSection>

            {/* Page sections */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Page sections
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Toggle each section on or off. Configure content below the
                  toggle — some items are pulled from settings page.
                </p>
              </div>

              {/* Hero */}
              <CollapsibleSection
                title="Hero"
                subtitle="Name, tagline, location, logo"
                expanded={sectionExpanded.hero}
                onToggleExpanded={() => toggleExpanded('hero')}
              >
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Studio name</Label>
                    <Input
                      value={studioName}
                      onChange={(e) => setStudioName(e.target.value)}
                      placeholder="Your studio name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Tagline</Label>
                    <Input
                      value={tagline}
                      onChange={(e) => setTagline(e.target.value)}
                      placeholder="A short tagline for your portfolio"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Bio</Label>
                    <Textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Tell visitors about your design philosophy..."
                      rows={4}
                    />
                  </div>
                </div>
              </CollapsibleSection>

              {/* Trust & credentials */}
              <ToggleableSection
                title="Trust & credentials"
                subtitle="Showcase your trust signal here"
                enabled={sectionEnabled.trust}
                onToggle={() => toggleSection('trust')}
                expanded={sectionExpanded.trust}
                onToggleExpanded={() => toggleExpanded('trust')}
              >
                <div className="grid grid-cols-6 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex size-12 items-center justify-center rounded-full border border-dashed border-border bg-muted/30"
                    >
                      <Palette className="size-4 text-muted-foreground/50" />
                    </div>
                  ))}
                </div>
              </ToggleableSection>

              {/* Featured testimonial */}
              <ToggleableSection
                title="Featured testimonial"
                subtitle="Their words — one client quote"
                enabled={sectionEnabled.testimonial}
                onToggle={() => toggleSection('testimonial')}
                expanded={sectionExpanded.testimonial}
                onToggleExpanded={() => toggleExpanded('testimonial')}
              >
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Their words</Label>
                    <Textarea
                      value={testimonialWords}
                      onChange={(e) => setTestimonialWords(e.target.value)}
                      placeholder="What did your client say about working with you?"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Author</Label>
                    <Input
                      value={testimonialAuthor}
                      onChange={(e) => setTestimonialAuthor(e.target.value)}
                      placeholder="Client name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Project</Label>
                    <Input
                      value={testimonialProject}
                      onChange={(e) => setTestimonialProject(e.target.value)}
                      placeholder="Select a project"
                    />
                  </div>
                </div>
              </ToggleableSection>

              {/* Reviews */}
              <ToggleableSection
                title="Reviews"
                subtitle="What it's like to work with us"
                enabled={sectionEnabled.reviews}
                onToggle={() => toggleSection('reviews')}
                expanded={sectionExpanded.reviews}
                onToggleExpanded={() => toggleExpanded('reviews')}
              >
                <div className="space-y-4">
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                          <Globe className="size-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Google
                          </p>
                          <p className="text-xs text-muted-foreground">
                            4.8+ · 42 reviews
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        Connected
                      </Badge>
                    </div>
                  </Card>

                  <div className="flex items-center justify-between">
                    <Label className="text-sm">
                      Show overall ratings on your profile
                    </Label>
                    <Switch
                      checked={showOverallRatings}
                      onCheckedChange={setShowOverallRatings}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">
                      Show only reviews with over 4+ star ratings
                    </Label>
                    <Switch
                      checked={showOnlyHighRatings}
                      onCheckedChange={setShowOnlyHighRatings}
                    />
                  </div>
                </div>
              </ToggleableSection>

              {/* Social links */}
              <ToggleableSection
                title="Social links"
                subtitle="Showcase your social links here"
                enabled={sectionEnabled.socialLinks}
                onToggle={() => toggleSection('socialLinks')}
                expanded={sectionExpanded.socialLinks}
                onToggleExpanded={() => toggleExpanded('socialLinks')}
              >
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Website</Label>
                    <Input
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      placeholder="https://"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Social links</Label>
                    <div className="flex items-center gap-2">
                      <Instagram className="size-4 shrink-0 text-muted-foreground" />
                      <Input
                        value={instagramHandle}
                        onChange={(e) => setInstagramHandle(e.target.value)}
                        placeholder="Instagram handle"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Linkedin className="size-4 shrink-0 text-muted-foreground" />
                      <Input
                        value={linkedinHandle}
                        onChange={(e) => setLinkedinHandle(e.target.value)}
                        placeholder="LinkedIn handle"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Youtube className="size-4 shrink-0 text-muted-foreground" />
                      <Input
                        value={youtubeHandle}
                        onChange={(e) => setYoutubeHandle(e.target.value)}
                        placeholder="YouTube handle"
                      />
                    </div>
                  </div>
                </div>
              </ToggleableSection>

              {/* Share block */}
              <ToggleableSection
                title="Share block"
                subtitle="A portfolio worth sharing"
                enabled={sectionEnabled.shareBlock}
                onToggle={() => toggleSection('shareBlock')}
                expanded={sectionExpanded.shareBlock}
                onToggleExpanded={() => toggleExpanded('shareBlock')}
              >
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    A small branded card at the bottom of your portfolio that
                    makes it easy for visitors to share your work with friends.
                  </p>

                  <Card className="overflow-hidden p-4">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <p className="text-sm font-medium text-foreground">
                        A portfolio worth sharing
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Know someone who&apos;d love this work? Pass it along.
                      </p>
                      <Button variant="outline" size="sm" className="mt-2 gap-1.5">
                        <Copy className="size-3.5" />
                        Copy link
                      </Button>
                    </div>
                  </Card>

                  <div className="flex items-center justify-between">
                    <Label className="text-sm">
                      Show Made with Tickif badge
                    </Label>
                    <Switch
                      checked={showTickifBadge}
                      onCheckedChange={setShowTickifBadge}
                    />
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
              <Badge
                variant="outline"
                className="gap-1 text-xs font-medium uppercase tracking-wider"
              >
                <span className="size-1.5 rounded-full bg-green-500" />
                Live preview
              </Badge>
              <button
                type="button"
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Open full
                <ChevronRight className="size-3" />
              </button>
            </div>

            {/* Phone frame mockup */}
            <div className="w-full max-w-[280px] rounded-[2.5rem] border-[8px] border-foreground/10 bg-background p-2 shadow-xl">
              <div className="overflow-hidden rounded-[2rem] border border-border bg-card">
                {/* Status bar mockup */}
                <div className="flex h-6 items-center justify-center">
                  <div className="h-1 w-16 rounded-full bg-foreground/20" />
                </div>

                {/* Preview content */}
                <div className="space-y-3 p-4">
                  {/* Cover images placeholder */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="aspect-square rounded-lg bg-muted" />
                    <div className="aspect-square rounded-lg bg-muted" />
                    <div className="aspect-square rounded-lg bg-muted" />
                    <div className="aspect-square rounded-lg bg-muted" />
                  </div>

                  {/* Studio info */}
                  <div className="space-y-2 pt-2">
                    <h4 className="text-sm font-semibold text-foreground">
                      {studioName || 'Your Studio'}
                    </h4>
                    <div className="flex items-center gap-1">
                      <MapPin className="size-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">
                        Bangalore, IN
                      </span>
                    </div>
                    {tagline && (
                      <p className="text-[10px] leading-relaxed text-muted-foreground">
                        {tagline}
                      </p>
                    )}
                  </div>

                  {/* Share section */}
                  {sectionEnabled.shareBlock && (
                    <div className="space-y-2 border-t border-border pt-3">
                      <p className="text-[10px] font-medium text-foreground">
                        A portfolio worth sharing
                      </p>
                      <button
                        type="button"
                        className="flex w-full items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-[10px] font-medium text-foreground"
                      >
                        <Copy className="size-2.5" />
                        Copy link
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-6 py-4">
        <button
          type="button"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Discard changes
        </button>
        <Button className="gap-1.5">
          <Check className="size-4" />
          Save changes
        </Button>
      </div>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────────── */

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function CollapsibleSection({
  title,
  subtitle,
  expanded,
  onToggleExpanded,
  children,
}: {
  title: string;
  subtitle: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between p-4"
        onClick={onToggleExpanded}
      >
        <div className="text-left">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && <div className="border-t border-border p-4">{children}</div>}
    </Card>
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
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between p-4">
        <button
          type="button"
          className="flex flex-1 items-center gap-3 text-left"
          onClick={onToggleExpanded}
        >
          <div>
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </button>
        <div className="flex items-center gap-3">
          <Switch checked={enabled} onCheckedChange={onToggle} />
          <button type="button" onClick={onToggleExpanded}>
            <ChevronDown
              className={`size-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>
      {expanded && <div className="border-t border-border p-4">{children}</div>}
    </Card>
  );
}
