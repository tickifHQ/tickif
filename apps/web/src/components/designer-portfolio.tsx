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
  const [linkUrlExpanded, setLinkUrlExpanded] = useState(true);

  // Customizations
  const [accentColor, setAccentColor] = useState('#FF8F73');
  const [customizationsExpanded, setCustomizationsExpanded] = useState(true);

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
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-6 py-5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Portfolio
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your public link, customize the look, and configure
          <br />
          each section visitors see.
        </p>
      </div>

      {/* Main content */}
      <div className="flex flex-1 -mt-2">
        {/* Left panel — form */}
        <div className="flex-1 p-6 lg:max-w-[65%]">
          <div className="space-y-6">
            {/* Link & URL */}
            <div className="rounded-xl bg-muted/70 p-5">
              <div className="space-y-4">
                <button type="button" onClick={() => setLinkUrlExpanded(!linkUrlExpanded)} className="flex w-full items-center justify-between">
                  <div className="text-left">
                    <h3 className="text-lg font-semibold text-foreground">Link & URL</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Send it on WhatsApp, drop it in your Instagram bio, or print a card
                    </p>
                  </div>
                  <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" />
                  </svg>
                </button>

                {linkUrlExpanded && (
                <Card className="bg-background p-4 shadow-sm -m-4 mt-2">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className='ml-3 mt-2'>
                        <Label className="text-[15px] font-normal text-muted-foreground text-black">Public link</Label>
                        <p className="text-[14px] text-muted-foreground">Anyone with the link can view your portfolio</p>
                      </div>
                      <Switch
                        checked={publicLinkEnabled}
                        onCheckedChange={setPublicLinkEnabled}
                      />
                    </div>

                    <div className="-mx-4 h-px w-[calc(100%+2rem)] bg-border" />

                    <div className="space-y-1.5 ml-3">
                      <Label className="text-[15px] font-normal text-muted-foreground text-black">Portfolio URL</Label>
                      <div className="flex items-center gap-0 shadow-sm rounded-md">
                        <span className="flex h-9 items-center gap-1.5 rounded-l-md border border-r-0 border-border bg-muted px-3 text-[15px] text-muted-foreground font-medium">
                          <Globe className="size-4.5" />
                          tickif.in/
                        </span>
                        <Input
                          value={portfolioSlug}
                          onChange={(e) => setPortfolioSlug(e.target.value)}
                          className="rounded-l-none h-9"
                        />
                      </div>
                      <p className="flex items-center gap-1 text-[13px] text-muted-foreground">
                        <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                        </svg>
                        Lowercase letters and hyphens only
                      </p>
                    </div>
                  </div>
                </Card>
                )}
              </div>
            </div>

            {/* Customizations */}
            <div className="rounded-xl bg-muted/70 p-5">
              <div className="space-y-4">
                <button type="button" onClick={() => setCustomizationsExpanded(!customizationsExpanded)} className="flex w-full items-center justify-between">
                  <div className="text-left">
                    <h3 className="text-lg font-semibold text-foreground">Customizations</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Visual tweaks that apply across the whole portfolio.
                    </p>
                  </div>
                  <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" />
                  </svg>
                </button>

                {customizationsExpanded && (
                <Card className="bg-background p-4 shadow-sm -m-4 mt-2">
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium mt-2 text-gray-700">Accent colour</Label>
                      <AccentColorDropdown value={accentColor} onChange={setAccentColor} />
                    </div>
                    
                    <div className='mt-7'>
                    <div className="flex items-center gap-2 border-l-4 border-primary bg-primary/5 px-4 py-1.5 ml-1">
                      <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-yellow-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" />
                      </svg>
                      <span className="text-sm font-medium text-green-900 ">Tip</span>
                      <span className="text-sm text-green-900">Project with a cost range get 3x more enquires</span>
                    </div>
                    </div>
                  </div>
                </Card>
                )}
              </div>
            </div>

            {/* Page sections */}
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold text-foreground">
                  Page sections
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                     Toggle each section on or off. Configure content below the toggle — same 
                  <br />
                     items are pulled from settings page.
                </p>
              </div>

              {/* Hero */}
              <div className="rounded-xl bg-muted/70 p-5">
                <div className="space-y-4">
                  <button type="button" onClick={() => toggleExpanded('hero')} className="flex w-full items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-foreground">Hero</h3>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        Name, tagline, location, stats
                      </p>
                    </div>
                    <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" />
                    </svg>
                  </button>

                  {sectionExpanded.hero && (
                  <Card className="bg-background p-4 shadow-sm -m-4 mt-2">
                    <div className="space-y-4">
                      {/* Logo upload + Studio name */}
                      <div className="flex items-start gap-3">
                        <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-dashed border-border bg-muted/50">
                          <div className="flex size-full items-center justify-center text-muted-foreground">
                            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                            </svg>
                          </div>
                          <button type="button" className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-muted-foreground/80 text-white" aria-label="Remove">
                            <svg viewBox="0 0 24 24" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12" /></svg>
                          </button>
                        </div>
                        <div className="flex-1 space-y-1.5">
                          <Label className="text-sm font-medium text-muted-foreground">Studio name</Label>
                          <Input
                            value={studioName}
                            onChange={(e) => setStudioName(e.target.value)}
                            placeholder="Your studio name"
                            className="shadow-sm"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-muted-foreground">Tagline</Label>
                        <Input
                          value={tagline}
                          onChange={(e) => setTagline(e.target.value)}
                          placeholder="A short tagline for your portfolio"
                          className="shadow-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-muted-foreground">Bio</Label>
                        <Textarea
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          placeholder="Tell visitors about your design philosophy..."
                          rows={4}
                          className="resize-y shadow-sm"
                        />
                      </div>
                    </div>
                  </Card>
                  )}
                </div>
              </div>

              {/* Trust & credentials */}
              <div className="rounded-xl bg-muted/70 p-5">
                <div className="space-y-4">
                  <button type="button" onClick={() => toggleExpanded('trust')} className="flex w-full items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-foreground">Trust & credentials</h3>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        Showcase your trust signals here
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={sectionEnabled.trust}
                        onCheckedChange={() => toggleSection('trust')}
                      />
                      <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" />
                      </svg>
                    </div>
                  </button>

                  {sectionExpanded.trust && (
                  <Card className="bg-background p-4 shadow-sm -m-4 mt-2">
                    <div className="flex flex-wrap gap-4">
                      {[
                        { label: 'Verified', src: '/illustrations/badges/verified.svg' },
                        { label: 'New', src: '/illustrations/badges/new.svg' },
                        { label: 'Top Performer', src: '/illustrations/badges/top-performer.svg' },
                        { label: 'Established', src: '/illustrations/badges/established.svg' },
                        { label: '28+ Projects', src: '/illustrations/badges/projects-published.svg' },
                      ].map((badge) => (
                        <div key={badge.label} className="flex flex-col items-center">
                          <img
                            src={badge.src}
                            alt={badge.label}
                            className="h-20 w-auto"
                          />
                        </div>
                      ))}
                    </div>
                  </Card>
                  )}
                </div>
              </div>

              {/* Featured testimonial */}
              <div className="rounded-xl bg-muted/70 p-5">
                <div className="space-y-4">
                  <button type="button" onClick={() => toggleExpanded('testimonial')} className="flex w-full items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-foreground">Featured testimonial</h3>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        Their words – one client quote
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={sectionEnabled.testimonial}
                        onCheckedChange={() => toggleSection('testimonial')}
                      />
                      <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" />
                      </svg>
                    </div>
                  </button>

                  {sectionExpanded.testimonial && (
                  <Card className="bg-background p-6 shadow-sm -m-4 mt-2">
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-gray-600">Their words</Label>
                        <Textarea
                          value={testimonialWords}
                          onChange={(e) => setTestimonialWords(e.target.value)}
                          placeholder="A line from a happy client..."
                          rows={3}
                          className="resize-y shadow-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium text-gray-600">Author</Label>
                          <Input
                            value={testimonialAuthor}
                            onChange={(e) => setTestimonialAuthor(e.target.value)}
                            placeholder="Client"
                            className="shadow-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium text-gray-600">Project</Label>
                          <div className="relative">
                            <Input
                              value={testimonialProject}
                              onChange={(e) => setTestimonialProject(e.target.value)}
                              placeholder="Select a project"
                              className="pr-8 shadow-sm"
                            />
                            <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                              <path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                  )}
                </div>
              </div>

              {/* Reviews */}
              <div className="rounded-xl bg-muted/70 p-5">
                <div className="space-y-4">
                  <button type="button" onClick={() => toggleExpanded('reviews')} className="flex w-full items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-foreground">Reviews</h3>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        What it&apos;s like to work with us
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={sectionEnabled.reviews}
                        onCheckedChange={() => toggleSection('reviews')}
                      />
                      <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" />
                      </svg>
                    </div>
                  </button>

                  {sectionExpanded.reviews && (
                  <Card className="bg-background p-4 shadow-sm -m-4 mt-2">
                    <div className="space-y-5">
                      {/* Google card */}
                      <div className="flex items-center justify-between rounded-2xl border border-border p-3 bg-gray-50">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-gray-200">
                            <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
                              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">Google</p>
                            <p className="text-[13px] text-muted-foreground">For fetching reviews from your google maps locations.</p>
                          </div>
                        </div>
                        <Badge className="gap-2 bg-green-100 text-green-700 rounded-sm p-1 font-normal">
                          <svg viewBox="0 0 24 24" className="size-3.5 text-green-600" fill="currentColor" aria-hidden><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          Connected
                        </Badge>
                      </div>

                      {/* Connected status */}
                      <div className="flex items-center gap-2 text-sm">
                        <span className="flex items-center gap-2 text-green-600 font-normal bg-green-100 p-1 rounded-sm">
                          <svg viewBox="0 0 24 24" className="size-3.5 text-green-600" fill="currentColor" aria-hidden><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          Connected
                        </span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-foreground">4.8 ★ · 42 reviews</span>
                      </div>

                      <div className="h-px w-full bg-border" />

                      {/* Toggle options */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground text-gray-600">Show overall ratings on your profile</p>
                            <p className="text-[13px] text-muted-foreground ">Show Google rating in trust strip</p>
                          </div>
                          <Switch
                            checked={showOverallRatings}
                            onCheckedChange={setShowOverallRatings}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground text-gray-600">Show only reviews with over 4+ star ratings</p>
                            <p className="text-[13px] text-muted-foreground">Show positive testimonials on your portfolio</p>
                          </div>
                          <Switch
                            checked={showOnlyHighRatings}
                            onCheckedChange={setShowOnlyHighRatings}
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                  )}
                </div>
              </div>

              {/* Social links */}
              <div className="rounded-xl bg-muted/70 p-5">
                <div className="space-y-4">
                  <button type="button" onClick={() => toggleExpanded('socialLinks')} className="flex w-full items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-foreground">Social links</h3>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        Showcase your social links here
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={sectionEnabled.socialLinks}
                        onCheckedChange={() => toggleSection('socialLinks')}
                      />
                      <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" />
                      </svg>
                    </div>
                  </button>

                  {sectionExpanded.socialLinks && (
                  <Card className="bg-background p-4 shadow-sm -m-4 mt-2">
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-muted-foreground">Website</Label>
                        <Input
                          value={websiteUrl}
                          onChange={(e) => setWebsiteUrl(e.target.value)}
                          placeholder="https://"
                          className="shadow-sm"
                        />
                      </div>

                      <div className="-mx-4 h-px w-[calc(100%+2rem)] bg-border" />

                      <div className="space-y-3">
                        <Label className="text-sm font-medium text-muted-foreground">Social links</Label>
                        <div className="flex items-center gap-0 overflow-hidden rounded-md border border-border shadow-sm">
                          <span className="flex h-9 w-10 shrink-0 items-center justify-center border-r border-border bg-background">
                            <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                              <defs><linearGradient id="ig" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#FFDC80"/><stop offset="50%" stopColor="#F56040"/><stop offset="100%" stopColor="#833AB4"/></linearGradient></defs>
                              <rect x="2" y="2" width="20" height="20" rx="5" fill="none" stroke="url(#ig)" strokeWidth="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="url(#ig)" strokeWidth="2"/><circle cx="17.5" cy="6.5" r="1" fill="url(#ig)"/>
                            </svg>
                          </span>
                          <Input
                            value={instagramHandle}
                            onChange={(e) => setInstagramHandle(e.target.value)}
                            placeholder="Instagram handle"
                            className="border-0 shadow-none focus-visible:ring-0"
                          />
                        </div>
                        <div className="flex items-center gap-0 overflow-hidden rounded-md border border-border shadow-sm">
                          <span className="flex h-9 w-10 shrink-0 items-center justify-center border-r border-border bg-background">
                            <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                              <rect x="2" y="2" width="20" height="20" rx="3" fill="#0A66C2"/><path d="M7 10v7M7 7v.01M10 17v-4a2 2 0 0 1 4 0v4M14 10v7" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                          </span>
                          <Input
                            value={linkedinHandle}
                            onChange={(e) => setLinkedinHandle(e.target.value)}
                            placeholder="Linkedin handle..."
                            className="border-0 shadow-none focus-visible:ring-0"
                          />
                        </div>
                        <div className="flex items-center gap-0 overflow-hidden rounded-md border border-border shadow-sm">
                          <span className="flex h-9 w-10 shrink-0 items-center justify-center border-r border-border bg-background">
                            <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                              <rect x="2" y="4" width="20" height="16" rx="3" fill="white" stroke="#ccc" strokeWidth="1"/><path d="M10 9l5 3-5 3V9z" fill="#FF0000"/>
                            </svg>
                          </span>
                          <Input
                            value={youtubeHandle}
                            onChange={(e) => setYoutubeHandle(e.target.value)}
                            placeholder="YouTube handle..."
                            className="border-0 shadow-none focus-visible:ring-0"
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                  )}
                </div>
              </div>

              {/* Share block */}
              <div className="rounded-xl bg-muted/70 p-5">
                <div className="space-y-4">
                  <button type="button" onClick={() => toggleExpanded('shareBlock')} className="flex w-full items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-foreground">Share block</h3>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        A portfolio worth sharing
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={sectionEnabled.shareBlock}
                        onCheckedChange={() => toggleSection('shareBlock')}
                      />
                      <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" />
                      </svg>
                    </div>
                  </button>

                  {sectionExpanded.shareBlock && (
                  <Card className="bg-background p-4 shadow-sm -m-4 mt-2">
                    <div className="space-y-4">
                      <p className="text-[15px] text-muted-foreground font-medium mt-1.5">
                        Encourages visitors to copy and share your portfolio link. Uses your studio name, cover, and accent colour.
                      </p>

                      <div className="rounded-lg bg-gray-100 p-4">
                        <p className="text-lg font-medium text-foreground">
                          A portfolio worth <span className="italic text-primary">sharing</span>.
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          tickif.in/{portfolioSlug}
                        </p>
                      </div>

                      <div className="-mx-4 h-px w-[calc(100%+2rem)] bg-border" />

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground text-gray-600">Show Made with Tickif badge</p>
                          <p className="text-[13px] text-muted-foreground">Show Made with Tickif badge on your profile</p>
                        </div>
                        <Switch
                          checked={showTickifBadge}
                          onCheckedChange={setShowTickifBadge}
                        />
                      </div>
                    </div>
                  </Card>
                  )}
                </div>
              </div>
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
                className="flex items-center gap-1 text-sm font-medium text-foreground transition-colors hover:text-primary"
              >
                Open full
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* URL bar */}
            <div className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-2.5">
              <span className="text-sm text-foreground">tickif.in/{portfolioSlug}</span>
              <Badge variant="outline" className="border-primary/30 text-xs font-medium text-primary">
                Live
              </Badge>
            </div>

            {/* Portfolio preview card */}
            <Card className="w-full overflow-hidden rounded-3xl bg-primary/5">
              <div className="px-4 pt-4">
                <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-lg -rotate-2">
                  <div className="h-24 bg-[linear-gradient(135deg,var(--muted),var(--background))]" />
                  <div className="space-y-3 px-5 py-4 text-center">
                    <div className="mx-auto -mt-10 flex size-14 items-center justify-center overflow-hidden rounded-2xl border border-border bg-amber-700 shadow-sm">
                      <span className="text-lg font-bold text-white">
                        {studioName ? studioName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'SM'}
                      </span>
                    </div>
                    <div>
                      <div className="text-base font-semibold text-foreground">{studioName || 'Studio Meraki'}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{studioName || 'Studio Meraki'}</div>
                    </div>
                    <div className="mx-auto inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
                      <Copy className="size-3 shrink-0" />
                      <span className="truncate">tickif.com/d/{portfolioSlug}</span>
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
                <button
                  type="button"
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#363940] to-[#1a1d23] py-3 text-sm font-medium text-white/90 shadow-[0_3px_10px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors hover:from-[#3e4148] hover:to-[#1f2228]"
                >
                  <Copy className="size-4" />
                  Copy link
                </button>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mx-6 mb-6 flex items-center justify-between rounded-xl border border-border bg-background px-6 py-4 shadow-md">
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
  const [open, setOpen] = useState(false);
  const selected = accentColors.find((c) => c.hex === value) ?? accentColors[0]!;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2.5 shadow-md transition-colors hover:bg-accent/50"
      >
        <div className="flex items-center gap-2.5">
          <span
            className="size-5 shrink-0 rounded-full border border-border"
            style={{ backgroundColor: selected.hex }}
          />
          <span className="text-sm font-medium text-foreground">{selected.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{selected.hex}</span>
          <svg viewBox="0 0 24 24" className="size-4 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-background p-1 shadow-lg">
          {accentColors.map((color) => (
            <button
              key={color.hex}
              type="button"
              onClick={() => { onChange(color.hex); setOpen(false); }}
              className={`flex w-full items-center justify-between rounded-sm px-3 py-2 text-left transition-colors hover:bg-accent/50 ${color.hex === value ? 'bg-accent/30' : ''}`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="size-5 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: color.hex }}
                />
                <span className="text-sm text-foreground">{color.name}</span>
              </div>
              <span className="text-xs text-muted-foreground">{color.hex}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
