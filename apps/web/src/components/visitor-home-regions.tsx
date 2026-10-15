import Link from 'next/link';
import { Bookmark, ChevronRight, MessageSquareMore } from 'lucide-react';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/card';
import { Skeleton } from '@repo/ui/components/skeleton';
import { typography } from '@repo/ui/lib/typography';
import { cn } from '@repo/ui/lib/utils';
import { DesignerLogoAvatar } from '@/components/designer-logo-avatar';
import { InitialsAvatar } from '@/components/initials-avatar';
import { EnquiryProgress } from '@/components/enquiry-progress';
import { enquiryActivityAge } from '@/lib/visitor-home';
import { ShowcaseCard } from '@/components/showcase-card';
import { VisitorSavedCount, VisitorSavedCountRetry } from '@/components/visitor-saved-count';
import { VisitorHomeLoadError } from '@/components/visitor-home-load-error';
import type { EnquiryCounts } from '@repo/contracts';
import { VisitorEnquiryCount, VisitorEnquiryCountRetry } from '@/components/visitor-enquiry-count';
import {
  getSavedProjectSuggestions,
  type getVisitorHomeActivity,
} from '@/lib/visitor-home-data.server';

type ActivityPromise = Promise<Awaited<ReturnType<typeof getVisitorHomeActivity>>>;

export async function VisitorActivityLinks({
  activity,
  counts = Promise.resolve(null),
  navigation = false,
}: {
  activity: ActivityPromise;
  counts?: Promise<EnquiryCounts | null>;
  navigation?: boolean;
}) {
  const data = await activity;
  const enquiryCounts = await counts;
  return (
    <nav
      aria-label="Your activity"
      className={cn(
        'flex min-w-0 flex-wrap items-center',
        navigation ? 'gap-2' : 'gap-1 max-[359px]:flex-col max-[359px]:items-start',
      )}
    >
      <Button asChild variant="ghost" size={navigation ? 'navigation' : 'compact'}>
        <Link href="/saved-projects">
          <Bookmark aria-hidden data-icon="inline-start" />
          Saved
          <VisitorSavedCount initialTotal={data.saved?.total ?? null} navigation={navigation} />
        </Link>
      </Button>
      <VisitorSavedCountRetry />
      <Button asChild variant="ghost" size={navigation ? 'navigation' : 'compact'}>
        <Link href="/enquiries">
          <MessageSquareMore aria-hidden data-icon="inline-start" />
          Enquiries
          <VisitorEnquiryCount initialCounts={enquiryCounts} navigation={navigation} />
        </Link>
      </Button>
      <VisitorEnquiryCountRetry />
    </nav>
  );
}

export function VisitorActivitySkeleton({ navigation = false }: { navigation?: boolean }) {
  return (
    <div className="flex gap-2" aria-label="Loading your activity" role="status">
      <Skeleton className={cn('w-24', navigation ? 'h-10' : 'h-9')} />
      <Skeleton className={cn('w-28', navigation ? 'h-10' : 'h-9')} />
    </div>
  );
}

export async function VisitorEnquirySummary({ activity }: { activity: ActivityPromise }) {
  const { enquiries, saved } = await activity;
  if (!enquiries)
    return (
      <VisitorHomeLoadError
        title="Enquiries unavailable"
        message="We could not load your enquiries. Your projects remain available below."
      />
    );
  const enquiry = enquiries.items[0];
  const savedError = !saved ? (
    <VisitorHomeLoadError
      title="Saved activity unavailable"
      message="We could not load your saved projects. Please try again."
    />
  ) : null;
  if (!enquiry) return savedError;
  const status = { open: 'Sent', responded: 'Responded', closed: 'Closed' } as const;
  return (
    <div className="flex min-w-0 flex-col gap-3 xl:max-w-lg">
      <Link
        href={`/enquiries?enquiryId=${enquiry.id}`}
        aria-label={`Your enquiry to ${enquiry.designerProfile.displayName}: ${enquiry.activity?.contactedAt ? 'Contacted' : enquiry.activity?.viewedAt ? 'Viewed' : status[enquiry.status]}${enquiry.activity?.isNew ? ', new update' : ''}`}
        className="block min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Card
          variant="summary"
          radius="summary"
          size="inline"
          className="flex items-center gap-3.5 transition-colors hover:bg-accent"
        >
          <DesignerLogoAvatar
            logoUrl={enquiry.referredProjectImageUrl ?? enquiry.designerProfile.logoUrl}
            alt=""
            sizePx={52}
            fit={enquiry.referredProjectImageUrl ? 'cover' : 'logo'}
            className="size-13 rounded-xl"
            fallback={
              <InitialsAvatar
                seed={enquiry.designerProfile.displayName}
                fallbackSeed="Studio"
                alt=""
                size={52}
              />
            }
          />
          <div className="min-w-0 flex-1">
            <CardHeader className="p-0">
              <div className="flex min-w-0 items-center gap-2">
                <CardTitle
                  title={`Your enquiry to ${enquiry.designerProfile.displayName}`}
                  className={cn(typography.labelMd, 'truncate')}
                >
                  Your enquiry to {enquiry.designerProfile.displayName}
                </CardTitle>
                {enquiry.activity?.isNew ? (
                  <Badge variant="terracotta" textStyle="code">
                    NEW
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-x-1.5 gap-y-1 p-0 pt-1">
              {enquiry.activity ? (
                <EnquiryProgress enquiry={enquiry} />
              ) : (
                <Badge
                  variant={
                    enquiry.status === 'responded'
                      ? 'warning'
                      : enquiry.status === 'closed'
                        ? 'secondary'
                        : 'soft'
                  }
                >
                  {status[enquiry.status]}
                </Badge>
              )}
              <span className={cn(typography.body2xs, 'text-muted-foreground')}>
                <span aria-hidden>· </span>
                {enquiry.activity?.lastMessageAt ? 'Messaged you ' : 'Updated '}
                {enquiry.activity?.lastMessageAt
                  ? enquiryActivityAge(enquiry.activity.lastMessageAt)
                  : new Intl.DateTimeFormat('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      timeZone: 'Asia/Kolkata',
                    }).format(new Date(enquiry.updatedAt))}
              </span>
            </CardContent>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Card>
      </Link>
      {savedError}
    </div>
  );
}

export async function VisitorSavedSuggestions({ activity }: { activity: ActivityPromise }) {
  const { saved } = await activity;
  const source = saved?.projects[0];
  if (!source) return null;
  let projects;
  try {
    projects = await getSavedProjectSuggestions(source.id);
  } catch {
    return (
      <div className="py-8">
        <VisitorHomeLoadError
          title="Similar projects unavailable"
          message="We could not load recommendations from your saved project."
        />
      </div>
    );
  }
  if (projects.length === 0) return null;
  return (
    <section className="flex flex-col gap-6 py-10" aria-label="Based on your saved project">
      <header className="flex min-w-0 items-center gap-3">
        {source.coverImageUrl ? (
          <img
            src={source.coverImageUrl}
            alt=""
            width={40}
            height={40}
            className="size-10 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <Bookmark className="size-6 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2
            className={cn(
              typography.headingH2,
              'flex flex-wrap items-baseline gap-x-1.5 text-2xl leading-7 sm:text-section sm:leading-9.5',
            )}
          >
            <span className="shrink-0 text-muted-foreground">Because you saved</span>{' '}
            <span className="min-w-0 break-words">{source.title}</span>
          </h2>
          {source.tags.length > 0 || source.budget ? (
            <p className={cn(typography.monoSm, 'break-words uppercase text-primary')}>
              {[...source.tags, source.budget].filter(Boolean).join(' · ')}
            </p>
          ) : null}
        </div>
      </header>
      <div className="grid grid-cols-2 gap-x-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {projects.map((project) => (
          <ShowcaseCard key={project.id} project={project} presentation="visitor" />
        ))}
      </div>
    </section>
  );
}
