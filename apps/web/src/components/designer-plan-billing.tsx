import Link from 'next/link';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  CreditCard,
  Crown,
  Eye,
  Globe,
  Lock,
  Receipt,
  Search,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Users,
} from 'lucide-react';
import type { BillingState, FrozenResource, PlanTier } from '@/lib/billing-types';
import { PLAN_TIER_LABELS, PLAN_TIER_PRICES } from '@/lib/billing-types';
import type { OrgRole } from '@/lib/billing-fixtures';
import { CopyButton } from '@/components/copy-button';
import { BillingStatusBanner } from '@/components/billing-status-banner';

interface DesignerPlanBillingProps {
  billing: BillingState;
  role: OrgRole;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateStr));
}

function lifecycleCta(state: BillingState): { label: string; href: string } | null {
  switch (state.lifecycle) {
    case 'active':
      return { label: 'Manage Subscription', href: '#manage' };
    case 'payment_failed':
      return { label: 'Update Payment Method', href: '#payment' };
    case 'grace':
      return { label: 'Make Payment', href: '#payment' };
    case 'locked':
      return { label: 'Reactivate Subscription', href: '#reactivate' };
    case 'downgraded':
      return { label: 'Upgrade to Restore', href: '#upgrade' };
    default:
      return null;
  }
}

// ─── Current Plan Card ───────────────────────────────────────────────────────

function CurrentPlanCard({ billing }: { billing: BillingState }) {
  const tierLabel = PLAN_TIER_LABELS[billing.tier];
  const cta = lifecycleCta(billing);
  const price = billing.billing?.planAmount ?? PLAN_TIER_PRICES[billing.tier];

  return (
    <Card radius="2xl">
      <div className="flex flex-col gap-5 p-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-stretch gap-5">
          <span className="flex w-36 shrink-0 items-center justify-center self-stretch rounded-2xl bg-primary/10 text-primary">
            <Crown className="size-9" />
          </span>
          <div>
            <p className="text-sm font-bold text-muted-foreground">Current Plan</p>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="text-2xl font-bold text-foreground">{tierLabel}</h2>
              {billing.lifecycle === 'active' && billing.tier !== 'hobby' && (
                <Badge variant="default">Popular</Badge>
              )}
              {billing.lifecycle === 'active' && billing.tier === 'hobby' && (
                <Badge variant="secondary">Free</Badge>
              )}
              {billing.lifecycle === 'locked' && (
                <Badge variant="destructive">Locked</Badge>
              )}
              {billing.lifecycle === 'downgraded' && (
                <Badge variant="warning">Downgraded</Badge>
              )}
              {billing.lifecycle === 'grace' && (
                <Badge variant="warning">Payment Due</Badge>
              )}
              {billing.lifecycle === 'payment_failed' && (
                <Badge variant="destructive">Payment Failed</Badge>
              )}
            </div>
            <p className="mt-2 text-sm text-foreground">
              <span className="font-semibold">
                ₹{price.toLocaleString('en-IN')} / month
              </span>
              {billing.usage.seats.limit && (
                <>
                  <span className="mx-2">·</span>
                  <span className="font-semibold">
                    {billing.usage.seats.current} seat{billing.usage.seats.current !== 1 ? 's' : ''}
                  </span>
                </>
              )}
            </p>
            {billing.tier === 'hobby' && (
              <p className="mt-2 text-xs text-muted-foreground">
                No paid subscription required. Upgrade anytime for more features.
              </p>
            )}
            {billing.renewalDate && billing.lifecycle === 'active' && billing.tier !== 'hobby' && (
              <p className="mt-3 text-sm text-muted-foreground">
                Your plan renews on {formatDate(billing.renewalDate)}
              </p>
            )}
            {billing.subscriptionId && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                Subscription ID: <span className="font-mono">{billing.subscriptionId}</span>
                <CopyButton value={billing.subscriptionId ?? ''} />
              </p>
            )}
          </div>
        </div>
        {cta && (
          <Button variant="outline" className="shrink-0">
            {cta.label}
          </Button>
        )}
      </div>
    </Card>
  );
}

// ─── Usage Summary ───────────────────────────────────────────────────────────

function UsageMetricCard({
  label,
  current,
  limit,
  unit,
  frozen,
}: {
  label: string;
  current: number;
  limit: number | null;
  unit: string;
  frozen?: boolean;
}) {
  const percentage = limit ? Math.min((current / limit) * 100, 100) : null;

  return (
    <Card radius="2xl">
      <div className="px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="size-5" />
          </span>
          <div>
            <span className="text-sm font-bold text-foreground">{label}</span>
            {frozen && (
              <Badge variant="warning" className="ml-2 text-[10px]">
                <Snowflake className="size-3" /> Frozen
              </Badge>
            )}
            <div className="mt-1">
              <span className="text-2xl font-semibold text-foreground">{current}</span>
              {limit !== null && (
                <span className="text-base text-muted-foreground"> / {limit}</span>
              )}
              {limit === null && (
                <span className="text-base text-muted-foreground"> (unlimited)</span>
              )}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {current} active {unit}
        </p>
        {percentage !== null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}
      </div>
    </Card>
  );
}

function UsageSummary({ billing }: { billing: BillingState }) {
  const hasBranches = billing.tier === 'corporate' && billing.usage.branches;

  return (
    <Card radius="2xl">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-foreground">Usage Summary</h2>
        <div className={`mt-4 grid gap-4 ${hasBranches ? 'sm:grid-cols-2' : 'sm:grid-cols-1 max-w-sm'}`}>
          <UsageMetricCard
            label={billing.usage.seats.label}
            current={billing.usage.seats.current}
            limit={billing.usage.seats.limit}
            unit={billing.usage.seats.unit}
          />
          {hasBranches && billing.usage.branches && (
            <UsageMetricCard
              label={billing.usage.branches.label}
              current={billing.usage.branches.current}
              limit={billing.usage.branches.limit}
              unit={billing.usage.branches.unit}
            />
          )}
        </div>
        {billing.tier === 'professional_plus' && (
          <p className="mt-4 text-xs text-muted-foreground">
            Professional+ includes 1 seat. For additional team members and branches, upgrade to Corporate.
          </p>
        )}
        {billing.tier === 'hobby' && (
          <p className="mt-4 text-xs text-muted-foreground">
            Hobby includes 1 seat and 1 studio. Upgrade to Professional+ for verified badge and discovery priority.
          </p>
        )}
      </div>
    </Card>
  );
}

// ─── Billing Summary ─────────────────────────────────────────────────────────

function BillingSummary({ billing }: { billing: BillingState }) {
  if (!billing.billing) return null;
  const info = billing.billing;

  return (
    <Card radius="2xl">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-foreground">Billing Summary</h2>
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground">Next Billing Date</p>
              <p className="mt-0.5 text-lg font-semibold text-foreground">
                {formatDate(info.nextBillingDate)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Billing Cycle</p>
              <p className="mt-0.5 text-sm font-medium text-foreground capitalize">
                {info.billingCycle ?? '—'}
              </p>
            </div>
            {info.paymentMethodLast4 && (
              <div>
                <p className="text-xs text-muted-foreground">Payment Method</p>
                <div className="mt-1 flex items-center gap-2">
                  <CreditCard className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {info.paymentMethodBrand} •••• {info.paymentMethodLast4}
                  </span>
                </div>
              </div>
            )}
            <Button variant="outline" size="sm">
              Update Payment Method
            </Button>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Plan Amount</span>
              <span className="font-medium text-foreground">{formatCurrency(info.planAmount)}</span>
            </div>
            {info.tax > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tax (18%)</span>
                <span className="font-medium text-foreground">{formatCurrency(info.tax)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
              <span className="font-semibold text-foreground">Total</span>
              <span className="font-semibold text-foreground">{formatCurrency(info.total)}</span>
            </div>
            <Button asChild variant="link" size="sm" className="mt-2 px-0">
              <Link href="/designer/plan-billing/invoices">
                View Invoices <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── Upgrade Card (sidebar) ──────────────────────────────────────────────────

function UpgradeCard({ currentTier }: { currentTier: PlanTier }) {
  if (currentTier === 'corporate') return null;

  // Hobby sees two upgrade cards: Professional+ and Corporate
  // Professional+ sees one: Corporate
  const cards: { tier: PlanTier; label: string; price: number; description: string; benefits: string[] }[] = [];

  if (currentTier === 'hobby') {
    cards.push({
      tier: 'professional_plus',
      label: 'Professional+',
      price: PLAN_TIER_PRICES.professional_plus,
      description: 'Stand out with a verified badge and get discovered faster by homeowners.',
      benefits: [
        'Verified-business badge',
        'Search & discovery ranking priority',
        'Priority support',
        'Advanced analytics',
      ],
    });
    cards.push({
      tier: 'corporate',
      label: 'Corporate',
      price: PLAN_TIER_PRICES.corporate,
      description: 'Unlock unlimited team collaboration, branches, and advanced organization features.',
      benefits: [
        'Unlimited team members',
        'Unlimited branches',
        'Branch dashboards & analytics',
        'Full RBAC & collaboration',
      ],
    });
  } else {
    cards.push({
      tier: 'corporate',
      label: 'Corporate',
      price: PLAN_TIER_PRICES.corporate,
      description: 'Unlock unlimited team collaboration, branches, and advanced organization features.',
      benefits: [
        'Unlimited team members',
        'Unlimited branches',
        'Branch dashboards & analytics',
        'Full RBAC & collaboration',
        'Top listing placement',
        'Prime badging',
      ],
    });
  }

  return (
    <>
      {cards.map((card) => (
        <Card key={card.tier} variant="accent" radius="2xl">
          <div className="p-5">
            <h2 className="text-base font-semibold text-foreground">Upgrade to {card.label}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              ₹{card.price.toLocaleString('en-IN')} / month
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</p>
            <ul className="mt-4 space-y-2">
              {card.benefits.map((benefit) => (
                <li key={benefit} className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="size-4 shrink-0 text-primary" />
                  {benefit}
                </li>
              ))}
            </ul>
            <Button className="mt-5 w-full">
              Upgrade Now
              <ArrowRight className="size-4" />
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Learn more →
            </p>
          </div>
        </Card>
      ))}
    </>
  );
}

// ─── Frozen Resources (Downgraded) ───────────────────────────────────────────

function FrozenResourcesCard({ resources }: { resources: FrozenResource[] }) {
  if (resources.length === 0) return null;

  return (
    <Card radius="2xl">
      <div className="p-6">
        <div className="flex items-center gap-2">
          <Snowflake className="size-5 text-warning-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Frozen Resources</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          These resources are preserved and will be restored when you upgrade. Nothing has been
          deleted.
        </p>
        <div className="mt-4 space-y-3">
          {resources.map((resource) => (
            <div
              key={resource.label}
              className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Lock className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{resource.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{resource.quantity}</span>
                {resource.recoverable && (
                  <Badge variant="success" className="text-[10px]">Recoverable</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
        <Button className="mt-5 w-full">
          Upgrade to Restore
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </Card>
  );
}

// ─── Locked State Details ────────────────────────────────────────────────────

function LockedAccessCard({ access }: { access: NonNullable<BillingState['lockedAccess']> }) {
  return (
    <Card radius="2xl">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-foreground">Account Access</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-destructive">
              Suspended
            </p>
            <ul className="mt-2 space-y-1.5">
              {access.suspended.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Lock className="size-3.5 text-destructive" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-success">
              Still Available
            </p>
            <ul className="mt-2 space-y-1.5">
              {access.available.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="size-3.5 text-success" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── Plan Includes Card ──────────────────────────────────────────────────────

type PlanFeature = {
  icon: typeof Users;
  title: string;
  description: string;
};

const PLAN_FEATURES: Record<PlanTier, PlanFeature[]> = {
  hobby: [
    { icon: Users, title: '1 User', description: 'Single studio operator' },
    { icon: Sparkles, title: 'Unlimited Projects', description: 'Publish your full portfolio' },
    { icon: Eye, title: 'Full Enquiry Visibility', description: 'See all homeowner details' },
    { icon: Globe, title: '1 Studio', description: 'Your public portfolio page' },
  ],
  professional_plus: [
    { icon: Users, title: '1 Seat', description: 'Single team member' },
    { icon: Sparkles, title: 'Unlimited Projects', description: 'Publish your full portfolio' },
    { icon: ShieldCheck, title: 'Verified Badge', description: 'Trusted business signal' },
    { icon: Search, title: 'Discovery Priority', description: 'Higher search ranking' },
    { icon: Receipt, title: 'Priority Support', description: 'Faster response times' },
  ],
  corporate: [
    { icon: Users, title: 'Unlimited Members', description: 'Full team collaboration' },
    { icon: Building2, title: 'Unlimited Branches', description: 'Multi-location management' },
    { icon: Sparkles, title: 'Branch Dashboards', description: 'Per-branch analytics' },
    { icon: ShieldCheck, title: 'Full RBAC', description: 'Granular role permissions' },
    { icon: Crown, title: 'Prime Badging', description: 'Top listing placement' },
  ],
};

function PlanIncludesCard({ tier }: { tier: PlanTier }) {
  const features = PLAN_FEATURES[tier];
  const nextTier = tier === 'hobby' ? 'Professional+' : tier === 'professional_plus' ? 'Corporate' : null;

  return (
    <Card radius="2xl">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-foreground">Your Plan Includes</h2>
        <div className="mt-5 grid gap-6 sm:grid-cols-3 lg:grid-cols-5">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{feature.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            );
          })}
        </div>
        {nextTier && (
          <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
            <p className="text-sm font-medium text-foreground">
              {tier === 'hobby' ? 'Want verified status and priority ranking?' : 'Need more team members or branches?'}
            </p>
            <Button variant="outline" size="sm">
              Upgrade to {nextTier}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Help Card (sidebar) ─────────────────────────────────────────────────────

function HelpCard() {
  return (
    <Card radius="2xl">
      <div className="p-5">
        <h2 className="text-base font-semibold text-foreground">Need Help?</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Our support team is here to help you with any billing queries.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4 w-full">
          <a href="mailto:support@tickif.in">
            <Receipt className="size-4" />
            Contact Support
          </a>
        </Button>
      </div>
    </Card>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function DesignerPlanBilling({ billing, role }: DesignerPlanBillingProps) {
  // Determine if the payment-due sidebar card should show:
  // Only in grace or payment_failed lifecycle for paid plans.
  const showPaymentDueCard =
    billing.tier !== 'hobby' &&
    (billing.lifecycle === 'grace' || billing.lifecycle === 'payment_failed');

  return (
    <div className="p-6 md:p-8 xl:p-10">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Plan & Billing
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Manage your subscription, billing details and usage.
          </p>
        </div>
        {role === 'billing_admin' && (
          <Badge variant="outline" className="shrink-0">Billing Admin</Badge>
        )}
      </div>

      {/* Status Banner — only for non-active lifecycle */}
      {billing.lifecycle !== 'active' && (
        <div className="mt-6">
          <BillingStatusBanner
            lifecycle={billing.lifecycle}
            graceDaysRemaining={billing.graceDaysRemaining}
          />
        </div>
      )}

      {/* Main content */}
      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <CurrentPlanCard billing={billing} />
          <UsageSummary billing={billing} />

          {billing.lifecycle === 'locked' && billing.lockedAccess && (
            <LockedAccessCard access={billing.lockedAccess} />
          )}

          {billing.lifecycle === 'downgraded' && billing.frozenResources.length > 0 && (
            <FrozenResourcesCard resources={billing.frozenResources} />
          )}

          {billing.billing && <BillingSummary billing={billing} />}

          <PlanIncludesCard tier={billing.tier} />
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          {/* Payment Due card — only when lifecycle demands it */}
          {showPaymentDueCard && billing.billing && (
            <Card radius="2xl" className="border-amber-300 bg-amber-50">
              <div className="p-5">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-full bg-amber-100">
                    <CreditCard className="size-4 text-amber-500" />
                  </span>
                  <h2 className="text-base font-bold text-amber-600">
                    {billing.lifecycle === 'payment_failed' ? 'Payment Failed' : 'Payment Due Soon'}
                  </h2>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Your payment of{' '}
                  <span className="font-semibold text-foreground">
                    {formatCurrency(billing.billing.total)}
                  </span>{' '}
                  is due on {formatDate(billing.billing.nextBillingDate)}.
                </p>
                <Button variant="outline" size="sm" className="mt-4 w-full border-amber-300 text-amber-600 hover:bg-amber-100">
                  {billing.lifecycle === 'payment_failed' ? 'Update Payment Method' : 'Make Payment'}
                </Button>
              </div>
            </Card>
          )}

          <UpgradeCard currentTier={billing.tier} />
          <HelpCard />
        </aside>
      </div>
    </div>
  );
}
