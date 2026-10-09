'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import {
  earlyBirdStatusSchema,
  type EarlyBirdTrial,
  type EarlyBirdStatus,
  type BillingCatalogPlan,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/plan-config';

export function EarlyBirdActive({ trial }: { trial: EarlyBirdTrial }) {
  const date = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'long',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(trial.endsAt));
  return (
    <Card className="mx-auto max-w-2xl p-8" role="status">
      <p className="text-sm font-medium text-primary">Early-bird trial active</p>
      <h2 className="mt-3 font-display text-3xl">
        {trial.tier === 'corporate' ? 'Corporate' : 'Professional+'} at ₹0 until {date}
      </h2>
      <p className="mt-4 leading-7 text-muted-foreground">
        No card is required and no automatic charge is scheduled. After your trial, your
        organization returns to Hobby. You can choose a paid subscription then.
      </p>
      <Button asChild className="mt-6">
        <Link href="/designer/projects">Go to your projects</Link>
      </Button>
    </Card>
  );
}

export function EarlyBirdClaim({ plan }: { plan: BillingCatalogPlan }) {
  const [status, setStatus] = useState<EarlyBirdStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError(null);
    void api.api.billing['early-bird']
      .$get()
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Could not check your offer eligibility. Please try again.');
        const parsed = earlyBirdStatusSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('Could not verify your offer eligibility.');
        if (active) setStatus(parsed.data);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Could not load offer.');
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  async function claim() {
    if (plan.tier === 'hobby' || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await api.api.billing['early-bird'].$post({
        json: { targetTier: plan.tier },
      });
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'This offer has ended or has already been used by your organization.'
            : 'Could not start your trial. Please try again.',
        );
      const parsed = earlyBirdStatusSchema.safeParse(await response.json());
      if (!parsed.success || !parsed.data.trial)
        throw new Error('Could not confirm activation. Please retry to check your trial.');
      setStatus(parsed.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start trial.');
    } finally {
      setPending(false);
    }
  }

  if (status?.trial) return <EarlyBirdActive trial={status.trial} />;
  return (
    <Card className="mx-auto max-w-2xl p-8">
      <p className="text-sm font-medium text-primary">Early bird · No card needed</p>
      <h1 className="mt-3 font-display text-3xl">Try {plan.name} for 3 months</h1>
      <p className="mt-4 leading-7 text-muted-foreground">
        Your trial starts when you confirm below. Pay ₹0 for three calendar months. After that,
        return to Hobby or subscribe for {formatCurrency(plan.amountPaise / 100)} per month. We will
        never charge automatically for this trial.
      </p>
      <ul className="my-6 space-y-2 text-sm">
        {plan.features.map((feature) => (
          <li key={feature}>✓ {feature}</li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="mb-4 text-destructive">
          {error}
        </p>
      ) : null}
      {!status && !error ? <p role="status">Checking eligibility…</p> : null}
      {!status && error ? (
        <Button onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
      ) : null}
      {status?.eligible ? (
        <Button disabled={pending} onClick={() => void claim()}>
          {pending ? 'Starting your trial…' : `Start my ${plan.name} trial`}
        </Button>
      ) : status ? (
        <p>
          This organization is not eligible for a new trial.{' '}
          <Link className="text-primary underline" href="/designer/plan-billing/subscribe">
            View billing plans
          </Link>
        </p>
      ) : null}
      <p className="mt-5 text-xs leading-5 text-muted-foreground">
        One trial per organization for new paid customers. Available until 31 December 2026, 11:59
        pm IST. No city or availability cap.
      </p>
    </Card>
  );
}
