import Image from 'next/image';
import type { ReactNode } from 'react';
import { ArrowUpRight, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/avatar';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/card';
import { ModeToggle } from '@repo/ui/components/mode-toggle';
import { RecognitionBadge } from '@repo/ui/components/recognition-badge';
import { Rating } from '@repo/ui/components/reui/rating';
import { Separator } from '@repo/ui/components/separator';
import { Skeleton } from '@repo/ui/components/skeleton';
import { TipCallout } from '@repo/ui/components/tip-callout';
import {
  ButtonDemos,
  FormDemos,
  MediaDemos,
  NavigationDemos,
  OverlayDemos,
} from '@/components/design-system-demos';

const sections = [
  ['foundations', 'Theme & type'],
  ['buttons', 'Buttons'],
  ['badges', 'Badges & crowns'],
  ['surfaces', 'Cards & feedback'],
  ['forms', 'Form controls'],
  ['overlays', 'Overlays'],
  ['navigation', 'Tabs & tables'],
  ['media', 'Media & empty states'],
] as const;
const swatches = [
  ['Background', 'bg-background border'],
  ['Foreground', 'bg-foreground'],
  ['Primary', 'bg-primary'],
  ['Soft primary', 'bg-primary-soft'],
  ['Secondary', 'bg-secondary'],
  ['Muted', 'bg-muted'],
  ['Inverse', 'bg-surface-inverse'],
  ['Rating', 'bg-rating'],
] as const;
const badgeVariants = [
  'default',
  'soft',
  'secondary',
  'outline',
  'neutral',
  'inverse',
  'success',
  'warning',
  'info',
  'destructive',
] as const;
const recognition = [
  ['verified', 'Verified Studio'],
  ['top-performer', 'Top Performer'],
  ['client-favourite', 'Client favourite'],
  ['established', 'Established'],
  ['projects-published', 'Projects published'],
  ['fast-reply', 'Fast reply'],
] as const;
const alerts = [
  {
    variant: 'default',
    title: 'Draft saved',
    description: 'Continue editing when you are ready.',
    icon: Info,
  },
  {
    variant: 'success',
    title: 'Project published',
    description: 'Your work is ready to be discovered.',
    icon: CheckCircle2,
  },
  {
    variant: 'info',
    title: 'Review in progress',
    description: 'We will update you when the review is complete.',
    icon: Info,
  },
  {
    variant: 'warning',
    title: 'One more detail',
    description: 'Add a location before publishing.',
    icon: TriangleAlert,
  },
  {
    variant: 'destructive',
    title: 'Upload failed',
    description: 'Choose an image within the size limit.',
    icon: TriangleAlert,
  },
] as const;

function Section({
  index,
  children,
  description,
}: {
  index: number;
  children: ReactNode;
  description: string;
}) {
  const section = sections[index]!;
  return (
    <section id={section[0]} className="flex scroll-mt-8 flex-col gap-7">
      <div className="flex flex-col gap-3">
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {String(index + 1).padStart(2, '0')} / shared elements
        </span>
        <h2 className="font-display text-section font-medium">{section[1]}</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  return (
    <main className="mx-auto flex max-w-[1328px] flex-col gap-16 px-5 py-10 sm:px-8 sm:py-14 lg:gap-24">
      <header className="flex flex-col gap-8">
        <div className="flex items-center justify-between gap-4">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            tickif / shared UI review
          </span>
          <ModeToggle />
        </div>
        <div className="grid items-end gap-8 lg:grid-cols-[1.5fr_1fr]">
          <h1 className="max-w-3xl font-display text-display font-medium">
            Designed for
            <br />
            the way you <span className="text-primary">work.</span>
          </h1>
          <div className="flex flex-col gap-5">
            <p className="max-w-md text-lg leading-relaxed text-foreground-secondary">
              A green and warm neutral design system, drawn from the new designer profile. Review
              every shared component below.
            </p>
            <Badge variant="secondary" className="self-start" textStyle="code">
              Local component preview
            </Badge>
          </div>
        </div>
        <nav
          aria-label="Component sections"
          className="flex flex-wrap gap-x-6 gap-y-3 border-y py-5"
        >
          {sections.map(([id, name]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-sm text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {name}
            </a>
          ))}
        </nav>
      </header>

      <Section
        index={0}
        description="Light and dark themes share semantic roles. Inter provides the available heading fallback; body text uses Inter and metadata uses JetBrains Mono."
      >
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4 lg:grid-cols-8">
          {swatches.map(([name, color]) => (
            <div key={name} className="flex flex-col gap-3">
              <div className={`h-20 rounded-popover ${color}`} />
              <span className="font-mono text-xs text-muted-foreground">{name}</span>
            </div>
          ))}
        </div>
        <div className="grid gap-8 border-t pt-7 md:grid-cols-2">
          <p className="font-display text-section">
            A home with room
            <br />
            for your next chapter.
          </p>
          <div className="flex flex-col gap-4">
            <p className="text-lg leading-relaxed text-foreground-secondary">
              Thoughtful spaces. Meaningful details. Work that speaks for itself.
            </p>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Selected work · Bengaluru · 2026
            </p>
          </div>
        </div>
      </Section>

      <Section
        index={1}
        description="All existing variants and compact sizes remain available. Default buttons use a pill shape; the new soft, 50px, and 64px options match the profile CTAs. Click to test each action, or Tab to inspect focus."
      >
        <ButtonDemos />
      </Section>

      <Section
        index={2}
        description="Status badges remain compact semantic chips. Recognition uses the exact exported crown and laurel artwork in a separate shared component. These are artwork samples, not earned profile awards."
      >
        <div className="flex flex-wrap gap-3">
          {badgeVariants.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
          <Badge shape="square" size="compact" textStyle="code">
            Compact / code
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 rounded-feature bg-muted px-4 py-8 sm:grid-cols-3 lg:grid-cols-6">
          {recognition.map(([key, label]) => (
            <RecognitionBadge
              key={key}
              label={label}
              eyebrow="Tickif"
              detail="Sample"
              description="Artwork sample"
              artwork={
                <Image
                  src={`/ui/recognition/recognition-${key}.svg`}
                  width={150}
                  height={132}
                  alt=""
                  unoptimized
                />
              }
            />
          ))}
        </div>
      </Section>

      <Section
        index={3}
        description="Cards have 22px corners and quiet shadows; feature surfaces use 36px corners. Intent colors distinguish information, success, warnings, and errors. Ratings remain accessible, read-only displays."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Card variant="subtle" radius="feature">
            <CardHeader>
              <Badge variant="outline" textStyle="code">
                Selected work
              </Badge>
              <CardTitle className="mt-4 text-section">Made for the everyday.</CardTitle>
              <CardDescription>Soft surfaces keep the focus on the work.</CardDescription>
            </CardHeader>
            <CardContent>
              <Rating rating={4.8} showValue size="lg" />
            </CardContent>
            <CardFooter>
              <Button asChild variant="outline">
                <a href="#media">
                  Explore card behavior <ArrowUpRight aria-hidden="true" />
                </a>
              </Button>
            </CardFooter>
          </Card>
          <Card
            variant="inverse"
            radius="feature"
            className="flex flex-col justify-center p-8 sm:p-10"
          >
            <p className="font-mono text-xs uppercase tracking-widest">Let’s create something</p>
            <p className="my-6 font-display text-4xl font-medium tracking-tight">
              Your space.
              <br />
              Our next conversation.
            </p>
            <Button asChild variant="soft" size="xl" className="self-start">
              <a href="#overlays">
                Preview a consultation <ArrowUpRight aria-hidden="true" />
              </a>
            </Button>
          </Card>
        </div>
        <div className="grid items-start gap-4 md:grid-cols-2">
          {alerts.map(({ variant, title, description, icon: Icon }) => (
            <Alert key={variant} variant={variant}>
              <Icon aria-hidden="true" />
              <AlertTitle>{title}</AlertTitle>
              <AlertDescription>{description}</AlertDescription>
            </Alert>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <TipCallout>Add the story behind your project.</TipCallout>
          <TipCallout variant="info">
            Keep the details up to date so people can reach you.
          </TipCallout>
        </div>
        <div className="flex flex-wrap items-center gap-8">
          <Rating rating={3.5} size="sm" showValue />
          <Rating rating={0} aria-label="No client ratings yet" />
          <Rating rating={5} showValue />
        </div>
      </Section>

      <Section
        index={4}
        description="Input, textarea, select, number, month, tags, checkbox, switch, slider, labels, field groups, required indicators, and errors. Try typing, selection, keyboard arrows, submit, and reset. Empty, invalid, read-only, and disabled states are shown alongside the form."
      >
        <FormDemos />
      </Section>

      <Section
        index={5}
        description="Dialog, dropdown, tooltip, and animated collapsible content retain their existing behavior. Try keyboard navigation, focus trapping, Escape, outside click, checked/radio menu items, and reduced motion."
      >
        <OverlayDemos />
      </Section>

      <Section
        index={6}
        description="Segmented and underlined tabs share Radix keyboard navigation. Arrow keys skip disabled tabs. Tables retain horizontal scrolling; pagination changes the displayed example rows and exposes the current page to assistive technology."
      >
        <NavigationDemos />
      </Section>

      <Section
        index={7}
        description="Carousel controls change slides. Empty states reuse the installed ReUI Icon Stack. Avatars show images or initials; skeletons preview loading and respect reduced motion. Separators follow the shared border token."
      >
        <MediaDemos />
        <div className="flex items-center gap-5 rounded-card border p-6">
          <Avatar>
            <AvatarImage
              src="/ui/recognition/recognition-verified.svg"
              alt="Artwork avatar example"
            />
            <AvatarFallback>TK</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback aria-label="Initials avatar example">TK</AvatarFallback>
          </Avatar>
          <Separator orientation="vertical" className="h-10" />
          <div
            role="status"
            aria-label="Loading preview"
            className="flex min-w-0 flex-1 flex-col gap-3"
          >
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      </Section>

      <footer className="border-t py-6">
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Review the shared foundation here before applying it to the designer profile and the
          remaining designer, visitor, and admin pages. Controls missing from Figma and dark mode
          are styled inferences; mobile profile layout verification remains a later step.
        </p>
      </footer>
    </main>
  );
}
