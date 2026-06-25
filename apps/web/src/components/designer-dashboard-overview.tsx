import Link from 'next/link';
import Image from 'next/image';
import type { ProfileCompletionResponse } from '@repo/contracts';
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
  UserRoundCheck,
} from 'lucide-react';

type OverviewChecklistItem = {
  key: string;
  title: string;
  description: string;
  done: boolean;
  action?: React.ReactNode;
};

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function findStep(steps: ProfileCompletionResponse['steps'], key: string) {
  return steps.find((step) => step.key === key);
}

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
            className="absolute top-8 bottom-[-1.25rem] left-1/2 w-px -translate-x-1/2 bg-border"
          />
        ) : null}
        <span
          className={
            item.done
              ? 'relative z-10 mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/15 text-primary'
              : 'relative z-10 mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-background'
          }
        >
          {item.done ? <Check className="size-4" /> : <span className="size-2.5 rounded-full border border-muted-foreground/50" />}
        </span>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        <div className="min-w-0 flex-1">
          <div
            className={
              item.done
                ? 'text-base font-medium text-muted-foreground line-through'
                : 'text-base font-medium text-foreground'
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
        <div className="mt-1 text-sm leading-5 text-muted-foreground">{description}</div>
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
  completion,
}: {
  studioName: string;
  studioLocation: string;
  completion: ProfileCompletionResponse;
}) {
  const portfolioUrl = `https://tickif.in/d/${slugify(studioName) || 'studio'}`;
  const googleDone = findStep(completion.steps, 'signed-in-with-google')?.done ?? false;
  const orgDone = findStep(completion.steps, 'org-created')?.done ?? false;
  const projectDone = findStep(completion.steps, 'first-project-uploaded')?.done ?? false;
  const profileDone = findStep(completion.steps, 'profile-completed')?.done ?? false;

  const checklistItems: OverviewChecklistItem[] = [
    {
      key: 'account-creation',
      title: 'Account creation',
      description: 'Set up your workspace on Tickif.',
      done: googleDone && orgDone,
    },
    {
      key: 'first-project',
      title: 'Upload your first project',
      description: 'Upload your first project to Tickif to make your profile live and present it as a portfolio.',
      done: projectDone,
      action: projectDone ? null : (
        <Button asChild variant="outline">
          <Link href="/designer/projects/upload">
            <Plus className="size-4" />
            Add new project
          </Link>
        </Button>
      ),
    },
    {
      key: 'kyc',
      title: 'Complete KYC',
      description: 'Complete KYC process to get the verified badge and build trust among users.',
      done: false,
      action: (
        <Button type="button" variant="outline" disabled>
          <ShieldCheck className="size-4" />
          Complete KYC
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
    {
      key: 'share-link',
      title: 'Share the portfolio link in socials',
      description: 'Use this portfolio link to share your work in socials and on your website.',
      done: false,
      action: <CopyLinkButton value={portfolioUrl} variant="link" className="h-auto px-0 text-sm text-foreground no-underline hover:no-underline" />,
    },
  ];

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
          <Card className="overflow-hidden rounded-2xl">
            <CardContent className="px-6 pt-6 pb-6">
              <div className="flex items-end justify-between gap-4">
                <div className="text-[1.75rem] font-medium tracking-tight text-foreground">
                  Complete profile
                </div>
                <div className="text-[1.75rem] font-medium tracking-tight text-primary">
                  {completion.score}%
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${completion.score}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="px-6 pt-4 pb-6">
              <ol aria-label="Profile setup steps">
                {checklistItems.map((item, index) => (
                  <ChecklistStep
                    key={item.key}
                    item={item}
                    isLast={index === checklistItems.length - 1}
                  />
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="relative overflow-visible rounded-2xl bg-primary/5">
            <CardContent className="relative px-4 pt-4 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 pr-24">
                  <Badge variant="outline" className="font-mono text-xs font-medium border-primary/20 bg-background/70 text-primary">
                    Complete setup
                  </Badge>
                  <div className="mt-4 text-sm font-medium tracking-normal text-foreground">
                    Add your first project
                  </div>
                  <p className="mt-2 text-xs leading-5 font-medium text-muted-foreground">
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
              <Button asChild className="mt-4 w-full text-sm font-medium">
                <Link href="/designer/projects/upload">
                  <Plus className="size-4" />
                  Add first project
                </Link>
              </Button>
            </CardContent>
          </Card>

          <div>
            <div className="mb-3 px-3 text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
              What happens next
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
              <div className="text-xs tracking-[0.22em] text-muted-foreground uppercase">
                One link. Everywhere.
              </div>
              <div className="mt-3 text-3xl font-medium tracking-tight text-foreground">
                A portfolio worth <span className="text-primary">sharing.</span>
              </div>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Send it on WhatsApp, drop it in your Instagram bio, or print it on a card.
              </p>
              <CopyLinkButton
                value={portfolioUrl}
                variant="default"
                className="mt-6 w-full cursor-pointer border border-white/10 bg-[#0e121b] text-white shadow-[0px_1px_2px_0px_rgba(27,28,29,0.48),0px_0px_0px_1px_#242628] [background-image:linear-gradient(180deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_100%)] hover:bg-[#0e121b]/90"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
