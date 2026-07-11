import Link from 'next/link';
import Image from 'next/image';
import type { CompletionStep, ProfileCompletionResponse, ProfileDashboardResponse } from '@repo/contracts';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Card, CardContent } from '@repo/ui/components/card';
import { CopyLinkButton } from '@/components/copy-link-button';
import { InitialsAvatar } from '@/components/initials-avatar';
import {
  ArrowRight,
  Check,
  ClipboardCheck,
  Copy,
  Plus,
  ShieldCheck,
  ShieldPlus,
  UserRoundCheck,
} from 'lucide-react';

type OverviewChecklistItem = {
  key: string;
  title: string;
  description: string;
  done: boolean;
  action?: React.ReactNode;
};

function ChecklistStep({
  item,
  isLast,
}: {
  item: OverviewChecklistItem;
  isLast: boolean;
}) {
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-4 py-5 last:pb-0">
      <div className="relative flex justify-center">
        {!isLast ? (
          <span
            aria-hidden="true"
            className="absolute top-[calc(0.125rem+1.75rem)] bottom-[-2.5rem] left-1/2 w-px -translate-x-1/2 bg-border"
          />
        ) : null}
        <span className="relative z-10 mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-border bg-background">
          {item.done ? (
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-[#77DB89] text-white">
              <Check className="size-3" />
            </span>
          ) : <span className="size-2 rounded-full bg-muted-foreground/30" />}
        </span>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        <div className="min-w-0 flex-1">
          <div
            className={
              item.done
                ? 'text-lg font-semibold text-muted-foreground line-through'
                : 'text-lg font-semibold text-foreground'
            }
          >
            {item.title}
          </div>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
            {item.description}
          </p>
        </div>
        {item.action ? <div className="sm:ml-auto sm:pt-1">{item.action}</div> : null}
      </div>
    </li>
  );
}

function RightRailInfoRow({
  icon,
  title,
  description,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="text-[13px] leading-4 text-muted-foreground">{description}</div>
      </div>
      {href ? <ArrowRight className="size-4 shrink-0 text-muted-foreground" /> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="flex items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/50"
      >
        {content}
      </Link>
    );
  }

  return <div className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">{content}</div>;
}

export function DesignerDashboardOverview({
  studioName,
  studioLocation,
  portfolioUrl,
  dashboard,
  completion,
  dashboardError,
}: {
  studioName: string;
  studioLocation: string;
  portfolioUrl: string;
  dashboard: ProfileDashboardResponse;
  completion?: ProfileCompletionResponse | null;
  dashboardError?: string | null;
}) {
  const profileDone = completion
    ? completion.steps.some((step) => step.key === 'profile-completed' && step.done)
    : dashboard.profileCompletion.missing.length === 0;
  const projectDone = completion
    ? completion.steps.some((step) => step.key === 'first-project-uploaded' && step.done)
    : dashboard.projects.total > 0;

  function checklistDescription(step: CompletionStep) {
    if (step.key === 'signed-in-with-google') return 'Use Google SSO so your designer workspace stays secure.';
    if (step.key === 'org-created') return 'Set up your workspace on Tickif.';
    if (step.key === 'profile-completed') return 'Add your profile tags, social links, short bio, and customize your portfolio.';
    if (step.key === 'first-project-uploaded') return 'Upload your first project to make your profile live and present it as a portfolio.';
    return 'Complete this step to keep your designer workspace moving.';
  }

  function checklistAction(step: CompletionStep) {
    if (step.done) return null;
    if (step.key === 'profile-completed') {
      return (
        <Button asChild variant="outline">
          <Link href="/designer/profile">
            Manage portfolio
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      );
    }
    if (step.key === 'first-project-uploaded') {
      return (
        <Button asChild variant="outline">
          <Link href="/designer/projects/new">
            <Plus className="size-4" />
            Add new project
          </Link>
        </Button>
      );
    }
    return null;
  }

  const trackedChecklistItems: OverviewChecklistItem[] = completion
    ? completion.steps.map((step) => ({
        key: step.key,
        title: step.label,
        description: checklistDescription(step),
        done: step.done,
        action: checklistAction(step),
      }))
    : [
        {
          key: 'account-creation',
          title: 'Account creation',
          description: 'Set up your workspace on Tickif.',
          done: true,
        },
        {
          key: 'first-project',
          title: 'Upload your first project',
          description: 'Upload your first project to Tickif to make your profile live and present it as a portfolio.',
          done: projectDone,
          action: projectDone ? null : (
            <Button asChild variant="outline">
              <Link href="/designer/projects/new">
                <Plus className="size-4" />
                Add new project
              </Link>
            </Button>
          ),
        },
        {
          key: 'profile',
          title: 'Complete profile',
          description: 'Add your profile tags, social links, short bio, and customize your portfolio.',
          done: profileDone,
          action: profileDone ? null : (
            <Button asChild variant="outline">
              <Link href="/designer/profile">
                Manage portfolio
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          ),
        },
      ];
  const hasTrackedSteps = trackedChecklistItems.length > 0;
  const trackedChecklistComplete = hasTrackedSteps && trackedChecklistItems.every((item) => item.done);
  const checklistProgressScore = hasTrackedSteps
    ? Math.round((trackedChecklistItems.filter((item) => item.done).length / trackedChecklistItems.length) * 100)
    : dashboard.profileCompletion.score;

  return (
    <div className="p-6 md:p-8 xl:p-10">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">
          Welcome, <span className="text-muted-foreground">{studioName}</span>
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Let&apos;s get your profile ready to go live.
        </p>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_23.5rem]">
        <div className="space-y-5">
          {dashboardError ? (
            <Card className="rounded-2xl border-destructive/30 bg-destructive/5">
              <CardContent className="px-6 py-5">
                <div className="text-base font-medium text-foreground">Could not load dashboard summary</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Refresh the page in a moment. Your dashboard and project upload actions are still available.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <div className="overflow-hidden rounded-2xl">
            <div className="px-6 pt-6 pb-6">
              <div className="flex items-end justify-between gap-4">
                <div className="text-base font-medium text-muted-foreground">
                  Complete profile
                </div>
                <div className="text-base font-medium text-primary">
                  {checklistProgressScore}%
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${checklistProgressScore}%` }}
                />
              </div>
            </div>
          </div>

          <Card className="rounded-2xl shadow-md">
            <CardContent className="px-6 pt-4 pb-6">
              {trackedChecklistComplete ? (
                <div className="flex items-start gap-4 py-4">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/15 text-primary">
                    <Check className="size-5" />
                  </span>
                  <div>
                    <div className="text-base font-medium text-foreground">Setup complete</div>
                    <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                      Your core workspace setup is done. Keep your portfolio fresh by adding more projects and sharing your link.
                    </p>
                  </div>
                </div>
              ) : (
                <ol aria-label="Profile setup steps">
                  {trackedChecklistItems.map((item, index) => (
                    <ChecklistStep
                      key={item.key}
                      item={item}
                      isLast={index === trackedChecklistItems.length - 1}
                    />
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="relative overflow-visible rounded-2xl bg-primary/5">
            <CardContent className="relative px-4 pt-4 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Badge variant="outline" className="text-xs font-medium border-primary/20 bg-background/70 text-primary">
                    COMPLETE SETUP
                  </Badge>
                  <div className="mt-3 text-base font-semibold tracking-normal text-foreground">
                    Add your first project
                  </div>
                  <p className="mt-1.5 text-sm font-medium leading-5 text-gray-400">
                    It goes public and gets indexed the moment your first project is approved. Usually 24–48 hours.
                  </p>
                </div>
                <Image
                  src="/illustrations/onboarding-workspace-desk.svg"
                  alt=""
                  width={95}
                  height={95}
                  className="absolute -top-[4.25rem] right-3 hidden h-auto w-28 sm:block"
                />
              </div>
              <Button asChild className="mt-4 w-full rounded-xl text-sm font-medium shadow-md">
                <Link href="/designer/projects/new">
                  <Plus className="size-4" />
                  Add first project
                </Link>
              </Button>
            </CardContent>
          </Card>

          <div>
            <div className="mb-3 flex items-center gap-2 px-3 text-xs font-medium tracking-normal text-muted-foreground">
              <ShieldPlus className="size-4" />
              WHAT HAPPENS NEXT
            </div>
            <Card className="overflow-hidden rounded-2xl">
              <RightRailInfoRow
                icon={<ClipboardCheck className="size-4" />}
                title="We review your project"
                description="A human check, usually within 24–48 hours."
              />
              <RightRailInfoRow
                icon={<UserRoundCheck className="size-4" />}
                title="Round out your profile"
                description="Add a bio and tags while you wait."
                href="/designer/profile"
              />
              <RightRailInfoRow
                icon={<ShieldCheck className="size-4" />}
                title="Start verification"
                description="Get a head start on your KYC."
                href="/designer/profile"
              />
            </Card>
          </div>

          <Card className="overflow-hidden rounded-3xl bg-primary/5">
            <div className="px-4 pt-4">
              <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm -rotate-2">
                <div className="h-32 bg-[linear-gradient(135deg,var(--muted),var(--background))]" />
                <div className="space-y-3 px-5 py-4 text-center">
                  <div className="mx-auto -mt-10 size-16 overflow-hidden rounded-2xl border border-border bg-primary/10 shadow-sm">
                    <InitialsAvatar
                      seed={studioName}
                      fallbackSeed={studioLocation}
                      alt={`${studioName} generated profile initials`}
                      size={64}
                    />
                  </div>
                  <div>
                    <div className="text-lg font-medium text-foreground">{studioName}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{studioLocation}</div>
                  </div>
                  <div className="mx-auto inline-flex max-w-full items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
                    <Copy className="size-3.5 shrink-0" />
                    <span className="truncate">{portfolioUrl.replace('https://', '')}</span>
                  </div>
                </div>
              </div>
            </div>
            <CardContent className="px-5 pt-6 pb-5">
              <div className="text-xs tracking-normal text-muted-foreground">
                ONE LINK. EVERYWHERE.
              </div>
              <div className="mt-3 text-3xl font-medium tracking-tight text-foreground">
                A portfolio worth <span className="text-primary">sharing.</span>
              </div>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Send it on WhatsApp, drop it in your Instagram bio, or print it on a card.
              </p>
              <CopyLinkButton
                value={portfolioUrl}
                variant="emphasis"
                className="mt-6 w-full cursor-pointer rounded-xl bg-gradient-to-b from-[#363940] to-[#1a1d23] text-white/90 shadow-[0_3px_10px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)] hover:from-[#3e4148] hover:to-[#1f2228]"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
