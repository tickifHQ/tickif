'use client';

import { useCallback, useState } from 'react';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import {
  ArrowRight,
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
import { CopyLinkButton } from '@/components/copy-link-button';
import { BillingStatusBanner } from '@/components/billing-status-banner';
import { SubscribeFlowDialog } from '@/components/subscribe/subscribe-flow-dialog';

interface DesignerPlanBillingProps {
  billing: BillingState;
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

const BILLING_CTA_PENDING = 'Coming soon — billing integration pending';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    const parsed = dateStr.includes('T') ? new Date(dateStr) : new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return '—';
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }).format(parsed);
  } catch {
    return '—';
  }
}

function lifecycleCta(state: BillingState): { label: string; kind: 'subscribe' | 'payment' } | null {
  switch (state.lifecycle) {
    case 'active':
      return { label: 'Manage Subscription', kind: 'subscribe' };
    case 'payment_failed':
      return { label: 'Update Payment Method', kind: 'payment' };
    case 'grace':
      return { label: 'Make Payment', kind: 'payment' };
    case 'locked':
      return { label: 'Reactivate Subscription', kind: 'subscribe' };
    case 'downgraded':
      return { label: 'Upgrade to Restore', kind: 'subscribe' };
    default:
      return null;
  }
}

/** Whether the subscription is in an impaired lifecycle state. */
function isImpaired(lifecycle: BillingState['lifecycle']): boolean {
  return lifecycle === 'locked' || lifecycle === 'downgraded';
}

// ─── Current Plan Card ───────────────────────────────────────────────────────

function CurrentPlanCard({
  billing,
  onSubscribe,
}: {
  billing: BillingState;
  onSubscribe: (targetTier?: PlanTier) => void;
}) {
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
              {billing.lifecycle === 'active' && billing.tier === 'hobby' && (
                <Badge variant="secondary">Free</Badge>
              )}
              {billing.lifecycle === 'locked' && (
                <Badge variant="destructive">Locked</Badge>
              )}
              {billing.lifecycle === 'downgraded' && (
                <Badge variant="warning">Downgraded</Badge>
              )}
              {billing.lifecycle === 'downgraded' && billing.preLapseTier && (
                <span className="text-sm font-normal text-muted-foreground">
                  from {PLAN_TIER_LABELS[billing.preLapseTier]}
                </span>
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
              {billing.usage.seats.limit != null && (
                <>
                  <span className="mx-2">·</span>
                  <span className="font-semibold">
                    {billing.usage.seats.current} seat{billing.usage.seats.current !== 1 ? 's' : ''}
                  </span>
                </>
              )}
              {billing.usage.seats.limit === null && (
                <>
                  <span className="mx-2">·</span>
                  <span className="font-semibold">Unlimited seats</span>
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
                <CopyLinkButton
                  value={billing.subscriptionId}
                  variant="ghost"
                  size="icon"
                  label="Copy subscription ID"
                  icon="copy"
                />
              </p>
            )}
          </div>
        </div>
        {cta && (
          <Button
            variant="outline"
            className="shrink-0"
            disabled={cta.kind === 'payment'}
            title={cta.kind === 'payment' ? BILLING_CTA_PENDING : undefined}
            onClick={cta.kind === 'subscribe' ? () => onSubscribe() : undefined}
          >
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
  icon: Icon,
}: {
  label: string;
  current: number;
  limit: number | null;
  unit: string;
  frozen?: boolean;
  icon: typeof Users;
}) {
  const percentage = limit ? Math.min((current / limit) * 100, 100) : null;

  return (
    <Card radius="2xl">
      <div className="px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" />
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
              {limit != null && (
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
        {percentage != null && (
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
  return (
    <Card radius="2xl">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-foreground">Usage Summary</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <UsageMetricCard
            label={billing.usage.seats.label}
            current={billing.usage.seats.current}
            limit={billing.usage.seats.limit}
            unit={billing.usage.seats.unit}
            icon={Users}
            frozen={billing.lifecycle === 'downgraded'}
          />
          <UsageMetricCard
            label={billing.usage.branches.label}
            current={billing.usage.branches.current}
            limit={billing.usage.branches.limit}
            unit={billing.usage.branches.unit}
            icon={Building2}
            frozen={billing.lifecycle === 'downgraded'}
          />
        </div>
        {billing.tier === 'professional_plus' && (
          <p className="mt-4 text-xs text-muted-foreground">
            Professional+ includes 1 seat. For additional team members and branches, upgrade to
            Corporate.
          </p>
        )}
        {billing.tier === 'hobby' && (
          <p className="mt-4 text-xs text-muted-foreground">
            Hobby includes 1 seat and 1 studio. Upgrade to Professional+ for verified badge and
            discovery priority.
          </p>
        )}
      </div>
    </Card>
  );
}

// ─── Billing Summary ─────────────────────────────────────────────────────────

function BillingSummary({ billing }: { billing: BillingState }) {
  if (!billing.billing) return null;
  if (isImpaired(billing.lifecycle)) return null;

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
              <p className="mt-0.5 text-sm font-medium capitalize text-foreground">
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
            <Button variant="outline" size="sm" disabled title={BILLING_CTA_PENDING}>
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
                <span className="text-muted-foreground">Tax</span>
                <span className="font-medium text-foreground">{formatCurrency(info.tax)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
              <span className="font-semibold text-foreground">Total</span>
              <span className="font-semibold text-foreground">{formatCurrency(info.total)}</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── Upgrade Card (sidebar) ──────────────────────────────────────────────────

function UpgradeCard({
  billing,
  onSubscribe,
}: {
  billing: BillingState;
  onSubscribe: (targetTier?: PlanTier) => void;
}) {
  if (billing.tier === 'corporate') return null;
  // Upgrade offers only while active. Locked/downgraded use restore CTAs;
  // grace/payment_failed must pay the current plan, not switch.
  if (billing.lifecycle !== 'active') return null;

  const cards: {
    tier: PlanTier;
    label: string;
    price: number;
    description: string;
    benefits: string[];
  }[] = [];

  if (billing.tier === 'hobby') {
    cards.push({
      tier: 'professional_plus',
      label: 'Professional+',
      price: PLAN_TIER_PRICES.professional_plus,
      description: 'Stand out with a verified badge and get discovered faster by homeowners.',
      benefits: [
        'Verified-business badge',
        'Search & discovery ranking priority',
      ],
    });
    cards.push({
      tier: 'corporate',
      label: 'Corporate',
      price: PLAN_TIER_PRICES.corporate,
      description:
        'Unlock unlimited team collaboration, branches, and advanced organization features.',
      benefits: [
        'Unlimited team members',
        'Unlimited branches',
        'Branch dashboards & analytics',
        'Full 5-role RBAC',
        'Top-of-directory placement',
      ],
    });
  } else {
    cards.push({
      tier: 'corporate',
      label: 'Corporate',
      price: PLAN_TIER_PRICES.corporate,
      description:
        'Unlock unlimited team collaboration, branches, and advanced organization features.',
      benefits: [
        'Unlimited team members',
        'Unlimited branches',
        'Branch dashboards & analytics',
        'Full 5-role RBAC',
        'Top-of-directory placement',
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
            <Button className="mt-5 w-full" onClick={() => onSubscribe(card.tier)}>
              Upgrade Now
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </Card>
      ))}
    </>
  );
}

// ─── Frozen Resources (Downgraded) ───────────────────────────────────────────

function FrozenResourcesCard({
  resources,
  onSubscribe,
}: {
  resources: FrozenResource[];
  onSubscribe: (targetTier?: PlanTier) => void;
}) {
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
                  <Badge variant="success" className="text-[10px]">
                    Recoverable
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
        <Button className="mt-5 w-full" onClick={() => onSubscribe()}>
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
  /** Features that are suspended in impaired lifecycle states. */
  suspendedWhenImpaired?: boolean;
};

const PLAN_FEATURES: Record<PlanTier, PlanFeature[]> = {
  hobby: [
    { icon: Users, title: '1 Seat', description: 'Single studio operator' },
    { icon: Sparkles, title: 'Unlimited Projects', description: 'Publish your full portfolio' },
    { icon: Eye, title: 'Full Enquiry Visibility', description: 'See all homeowner details' },
    { icon: Globe, title: '1 Studio', description: 'Your public portfolio page' },
  ],
  professional_plus: [
    { icon: Users, title: '1 Seat', description: 'Single team member, by design' },
    { icon: Sparkles, title: 'Unlimited Projects', description: 'Publish your full portfolio' },
    { icon: Eye, title: 'Full Enquiry Visibility', description: 'See all homeowner details' },
    { icon: Globe, title: '1 Studio', description: 'Your public portfolio page' },
    {
      icon: ShieldCheck,
      title: 'Verified Badge',
      description: 'Trusted business signal',
      suspendedWhenImpaired: true,
    },
    {
      icon: Search,
      title: 'Discovery Priority',
      description: 'Higher search ranking',
      suspendedWhenImpaired: true,
    },
  ],
  corporate: [
    { icon: Users, title: 'Unlimited Members', description: 'Full team collaboration' },
    { icon: Sparkles, title: 'Unlimited Projects', description: 'Publish your full portfolio' },
    { icon: Eye, title: 'Full Enquiry Visibility', description: 'See all homeowner details' },
    {
      icon: ShieldCheck,
      title: 'Verified Badge',
      description: 'Trusted business signal',
      suspendedWhenImpaired: true,
    },
    {
      icon: Search,
      title: 'Discovery Priority',
      description: 'Higher search ranking',
      suspendedWhenImpaired: true,
    },
    {
      icon: Building2,
      title: 'Unlimited Branches',
      description: 'Multi-location management',
      suspendedWhenImpaired: true,
    },
    {
      icon: Sparkles,
      title: 'Branch Dashboards',
      description: 'Per-branch analytics',
      suspendedWhenImpaired: true,
    },
    {
      icon: ShieldCheck,
      title: 'Full RBAC',
      description: 'Five-role matrix, Corporate-gated',
      suspendedWhenImpaired: true,
    },
    {
      icon: Crown,
      title: 'Prime Directory Placement',
      description: 'Top-of-directory listing',
      suspendedWhenImpaired: true,
    },
  ],
};

function PlanIncludesCard({
  tier,
  lifecycle,
  onSubscribe,
}: {
  tier: PlanTier;
  lifecycle: BillingState['lifecycle'];
  onSubscribe: (targetTier?: PlanTier) => void;
}) {
  const features = PLAN_FEATURES[tier];
  const impaired = isImpaired(lifecycle);
  const nextTier: PlanTier | null =
    tier === 'hobby' ? 'professional_plus' : tier === 'professional_plus' ? 'corporate' : null;

  return (
    <Card radius="2xl">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-foreground">Your Plan Includes</h2>
        <div className="mt-5 grid gap-6 sm:grid-cols-3 lg:grid-cols-5">
          {features.map((feature) => {
            const Icon = feature.icon;
            const suspended = impaired && feature.suspendedWhenImpaired;
            return (
              <div
                key={feature.title}
                className={`flex items-start gap-3 ${suspended ? 'opacity-50' : ''}`}
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
                    suspended ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
                  }`}
                >
                  <Icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {feature.title}
                    {suspended && (
                      <Badge variant="outline" className="ml-1.5 text-[9px]">
                        Suspended
                      </Badge>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            );
          })}
        </div>
        {nextTier && lifecycle === 'active' && (
          <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
            <p className="text-sm font-medium text-foreground">
              {tier === 'hobby'
                ? 'Want verified status and priority ranking?'
                : 'Need more team members or branches?'}
            </p>
            <Button variant="outline" size="sm" onClick={() => onSubscribe(nextTier)}>
              Upgrade to {PLAN_TIER_LABELS[nextTier]}
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

export function DesignerPlanBilling({ billing }: DesignerPlanBillingProps) {
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [targetTier, setTargetTier] = useState<PlanTier | null>(null);

  const openSubscribe = useCallback((tier?: PlanTier) => {
    setTargetTier(tier ?? null);
    setSubscribeOpen(true);
  }, []);

  const handleSubscribeOpenChange = useCallback((next: boolean) => {
    setSubscribeOpen(next);
    if (!next) setTargetTier(null);
  }, []);

  const showPaymentDueCard =
    billing.tier !== 'hobby' &&
    (billing.lifecycle === 'grace' || billing.lifecycle === 'payment_failed');

  return (
    <div className="p-6 md:p-8 xl:p-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          Plan & Billing
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Manage your subscription, billing details and usage.
        </p>
      </div>

      {/* Status Banner — only for non-active lifecycle */}
      {billing.lifecycle !== 'active' && billing.lifecycle !== 'downgraded' && (
        <div className="mt-6">
          <BillingStatusBanner
            lifecycle={billing.lifecycle}
            graceDaysRemaining={billing.graceDaysRemaining}
            lockedDaysRemaining={billing.lockedDaysRemaining}
          />
        </div>
      )}

      {/* Main content */}
      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <CurrentPlanCard billing={billing} onSubscribe={openSubscribe} />
          <UsageSummary billing={billing} />

          {billing.lifecycle === 'locked' && billing.lockedAccess && (
            <LockedAccessCard access={billing.lockedAccess} />
          )}

          {billing.lifecycle === 'downgraded' && billing.frozenResources.length > 0 && (
            <FrozenResourcesCard
              resources={billing.frozenResources}
              onSubscribe={openSubscribe}
            />
          )}

          <BillingSummary billing={billing} />

          <PlanIncludesCard
            tier={billing.tier}
            lifecycle={billing.lifecycle}
            onSubscribe={openSubscribe}
          />
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          {showPaymentDueCard && billing.billing && (
            <Card radius="2xl" className="border-warning bg-warning/10">
              <div className="p-5">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-full bg-warning/20">
                    <CreditCard className="size-4 text-warning-foreground" />
                  </span>
                  <h2 className="text-base font-bold text-warning-foreground">
                    {billing.lifecycle === 'payment_failed'
                      ? 'Payment Failed'
                      : 'Payment Due Soon'}
                  </h2>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Your payment of{' '}
                  <span className="font-semibold text-foreground">
                    {formatCurrency(billing.billing.total)}
                  </span>{' '}
                  {billing.lastPaymentFailedDate
                    ? `failed on ${formatDate(billing.lastPaymentFailedDate)}.`
                    : `is due on ${formatDate(billing.billing.nextBillingDate)}.`}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 w-full border-warning text-warning-foreground hover:bg-warning/20"
                  disabled
                  title={BILLING_CTA_PENDING}
                >
                  {billing.lifecycle === 'payment_failed'
                    ? 'Update Payment Method'
                    : 'Make Payment'}
                </Button>
              </div>
            </Card>
          )}

          <UpgradeCard billing={billing} onSubscribe={openSubscribe} />
          <HelpCard />
        </aside>
      </div>

      <SubscribeFlowDialog
        open={subscribeOpen}
        onOpenChange={handleSubscribeOpenChange}
        currentTier={billing.tier}
        lifecycle={billing.lifecycle}
        restoreTier={billing.preLapseTier}
        initialTargetTier={targetTier}
      />
    </div>
  );
}
