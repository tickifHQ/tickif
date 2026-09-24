import { replacementProvider as provider } from './provider.js';
import {
  replacementRepository as repository,
  type NewReplacement,
  type Replacement,
} from './repository.js';

const terminal = (status: string) => ['cancelled', 'completed', 'expired'].includes(status);

/** Reserve before external creates. Unknown create outcomes are never blindly retried. */
export async function createReplacement(input: NewReplacement) {
  await repository.insert(input);
  const remote = await provider.create(
    input.targetPlanId,
    Math.floor(input.periodEnd.getTime() / 1000),
    Math.floor(input.expiresAt.getTime() / 1000),
    input.id,
  );
  await repository.update(input.id, { replacementSubscriptionId: remote.id });
  if (input.amount > 0) {
    const order = await provider.createOrder(input.amount, input.currency, input.id);
    if (
      order.amount !== input.amount ||
      order.currency !== input.currency ||
      order.receipt !== input.id
    )
      throw new Error('Unexpected billing order');
    await repository.update(input.id, { orderId: order.id });
  }
  await repository.update(input.id, { status: 'checkout' });
  return repository.current(input.organizationId);
}

/** Same state machine for callbacks, page refreshes, webhooks and the lifecycle worker. */
export async function reconcileReplacement(org: string, now = new Date()) {
  const previous = await repository.current(org);
  // Commit the promised access boundary even when Razorpay is temporarily unavailable.
  await applyReplacementSchedule(org, now);
  if (previous?.status === 'confirmed' && (await repository.cancellationPending(org)))
    await cancelReplacementRenewal(org);
  const result = await repository.locked(org, async (candidate, repo) => {
    if (!candidate || !candidate.replacementSubscriptionId) return false;
    let row = candidate;
    if (row.status === 'confirmed' && row.targetTier === 'hobby') return false;
    const local = await repo.subscription(org);
    if (
      !local ||
      ![row.sourceSubscriptionId, row.replacementSubscriptionId].includes(
        local.razorpaySubscriptionId ?? '',
      )
    )
      return false;
    const replacement = await provider.subscription(candidate.replacementSubscriptionId);
    if (
      replacement.plan_id !== row.targetPlanId ||
      (replacement.start_at != null &&
        replacement.start_at !== Math.floor(row.periodEnd.getTime() / 1000))
    )
      throw new Error('Replacement mandate changed');
    const source = await provider.subscription(row.sourceSubscriptionId);
    const payments = row.orderId ? await provider.payments(row.orderId) : [];
    let payment = row.orderId
      ? payments.find(
          (p) =>
            p.order_id === row.orderId &&
            p.status === 'captured' &&
            p.amount === row.amount &&
            p.currency === row.currency &&
            p.amount_refunded === 0,
        )
      : undefined;
    const authorized = ['authenticated', 'active'].includes(replacement.status);
    if (!payment && authorized && row.status === 'checkout' && now < row.expiresAt) {
      const pending = payments.find(
        (p) =>
          p.order_id === row.orderId &&
          p.status === 'authorized' &&
          p.amount === row.amount &&
          p.currency === row.currency,
      );
      if (pending) {
        const captured = await provider.capture(pending.id, row.amount, row.currency);
        if (
          captured.id === pending.id &&
          captured.order_id === row.orderId &&
          captured.status === 'captured' &&
          captured.amount === row.amount &&
          captured.currency === row.currency &&
          captured.amount_refunded === 0
        )
          payment = captured;
      }
    }
    const paid = row.amount === 0 || !!payment;
    if (payment) await repo.payment(org, payment);

    if (row.status !== 'confirmed') {
      // An authenticated mandate must not start billing after an abandoned upgrade checkout.
      if (
        row.status === 'aborting' ||
        (payment && payment.created_at * 1000 > row.expiresAt.getTime()) ||
        terminal(replacement.status) ||
        ((!paid || !authorized) && now >= row.expiresAt)
      ) {
        if (!terminal(replacement.status) && replacement.status !== 'created') {
          await provider.cancel(replacement.id, false);
          if (!terminal((await provider.subscription(replacement.id)).status)) return false;
        }
        // Created mandates expire at expire_by; do not release the reservation before then.
        if (replacement.status === 'created') return false;
        if (payment) {
          await provider.refund(payment.id, row.amount, row.id);
          // Remain open until a later provider read confirms the refund.
          await repo.update(row.id, { status: 'aborting' });
          return false;
        }
        await repo.update(row.id, { status: 'failed' });
        await repo.operation(row, 'failed');
        return true;
      }
      if (!paid || !authorized || row.status === 'creating') return false;
      // Never reuse an old quote after the source has renewed. Compensate instead.
      if (
        source.current_end &&
        source.current_end * 1000 !== row.periodEnd.getTime() &&
        !terminal(source.status)
      ) {
        await repo.update(row.id, { status: 'aborting' });
        return false;
      }
      const sourceCancellationAccepted =
        source.cancel_at_cycle_end ||
        (local.razorpaySubscriptionId === source.id && local.cancelAtPeriodEnd);
      if (!sourceCancellationAccepted && !terminal(source.status)) {
        // The acknowledged cancel response is authoritative. Razorpay does not
        // document cancel_at_cycle_end on subsequent subscription fetches.
        const checked = await provider.cancel(source.id, true);
        if (
          checked.current_end &&
          checked.current_end * 1000 !== row.periodEnd.getTime() &&
          !terminal(checked.status)
        ) {
          await repo.update(row.id, { status: 'aborting' });
          return false;
        }
      }
      await repo.update(row.id, {
        status: 'confirmed',
        sourceStoppedAt: now,
        paymentId: payment?.id ?? null,
      });
      row = { ...row, status: 'confirmed', sourceStoppedAt: now, paymentId: payment?.id ?? null };
    }

    const due = now >= row.periodEnd;
    const upgrade = row.targetTier === 'corporate';
    let renewed = false;
    if (
      due &&
      replacement.status === 'active' &&
      replacement.current_end &&
      replacement.current_end * 1000 > row.periodEnd.getTime()
    ) {
      const invoices = await provider.invoices(replacement.id);
      const invoice = invoices.find(
        (invoice) =>
          invoice.subscription_id === replacement.id &&
          invoice.status === 'paid' &&
          invoice.billing_start !== null &&
          invoice.billing_start * 1000 >= row.periodEnd.getTime() &&
          invoice.payment_id &&
          invoice.currency === row.currency &&
          invoice.amount_paid >= row.recurringAmount,
      );
      if (invoice?.payment_id) {
        const renewal = await provider.payment(invoice.payment_id);
        renewed =
          renewal.status === 'captured' &&
          renewal.amount_refunded === 0 &&
          renewal.currency === row.currency &&
          renewal.amount >= row.recurringAmount;
        if (renewed) await repo.payment(org, renewal);
      }
    }
    // A mandate being authenticated isn't a paid renewal. Grace is bounded by the existing lifecycle.
    const state = due && !renewed ? ('grace' as const) : ('active' as const);
    const tier = upgrade || due ? row.targetTier : row.sourceTier;
    if (!due || !['locked', 'downgraded'].includes(local.subscriptionState) || renewed) {
      await repo.apply(row, {
        planTier: tier,
        subscriptionState: state,
        razorpaySubscriptionId: replacement.id,
        razorpayStatus: replacement.status,
        currentPeriodEnd:
          (renewed || replacement.cancel_at_cycle_end) && replacement.current_end
            ? new Date(replacement.current_end * 1000)
            : row.periodEnd,
        cancelAtPeriodEnd:
          replacement.cancel_at_cycle_end ||
          (local.razorpaySubscriptionId === replacement.id && local.cancelAtPeriodEnd) ||
          false,
        graceStartedAt: state === 'grace' ? (local.graceStartedAt ?? row.periodEnd) : null,
        preLapseTier: state === 'grace' ? tier : null,
        lockedAt: null,
        downgradedAt: null,
      });
    }
    await repo.operation(row, upgrade || due ? 'activated' : 'scheduled');
    if (renewed) await repo.update(row.id, { status: 'completed' });
    else await repo.update(row.id, {});
    return true;
  });
  if (previous && now >= previous.periodEnd) await auditSupersededAgreement(previous);
  return result;
}

export async function applyReplacementSchedule(org: string, now = new Date()) {
  return repository.locked(org, async (row, repo) => {
    if (!row || row.status !== 'confirmed' || now < row.periodEnd) return false;
    const local = await repo.subscription(org);
    if (
      !local ||
      local.razorpaySubscriptionId !== row.replacementSubscriptionId ||
      (local.subscriptionState !== 'active' && row.targetTier !== 'hobby')
    )
      return false;
    if (row.targetTier === 'hobby') {
      await repo.apply(row, {
        planTier: 'hobby',
        subscriptionState: 'active',
        razorpaySubscriptionId: null,
        razorpayStatus: 'cancelled',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        graceStartedAt: null,
        preLapseTier: null,
        lockedAt: null,
        downgradedAt: null,
      });
      await repo.update(row.id, { status: 'completed' });
      return true;
    }
    await repo.apply(row, {
      planTier: row.targetTier,
      subscriptionState: 'grace',
      graceStartedAt: row.periodEnd,
      preLapseTier: row.targetTier,
    });
    return true;
  });
}

export async function cancelReplacementRenewal(org: string) {
  return repository.locked(org, async (row, repo) => {
    if (!row || row.status !== 'confirmed' || !row.replacementSubscriptionId)
      throw new Error('No confirmed replacement');
    const local = await repo.subscription(org);
    if (!local || local.razorpaySubscriptionId !== row.replacementSubscriptionId)
      throw new Error('Subscription changed');
    const mandate = await provider.subscription(row.replacementSubscriptionId);
    // The scheduled mandate may have begun renewing while cancellation was pending.
    // Preserve that cycle and let the existing renewal lifecycle settle its payment.
    if (
      mandate.status === 'active' &&
      mandate.current_end &&
      mandate.current_end * 1000 > row.periodEnd.getTime()
    ) {
      const alreadyCancelled = !!mandate.cancel_at_cycle_end || local.cancelAtPeriodEnd;
      const checked = alreadyCancelled ? mandate : await provider.cancel(mandate.id, true);
      const currentPeriodEnd = new Date((checked.current_end ?? mandate.current_end) * 1000);
      await repo.apply(row, {
        cancelAtPeriodEnd: true,
        currentPeriodEnd,
        razorpayStatus: checked.status,
      });
      await repo.finishCancellation({ ...row, periodEnd: currentPeriodEnd });
      return {
        razorpaySubscriptionId: mandate.id,
        alreadyCancelled: !!alreadyCancelled,
        currentPeriodEnd: currentPeriodEnd.toISOString(),
      };
    }
    if (!terminal(mandate.status)) {
      await provider.cancel(mandate.id, false);
      if (!terminal((await provider.subscription(mandate.id)).status))
        throw new Error('Cancellation is pending');
    }
    await repo.update(row.id, { targetTier: 'hobby', sourceTier: local.planTier });
    await repo.apply(row, { cancelAtPeriodEnd: true, razorpayStatus: 'cancelled' });
    await repo.finishCancellation(row);
    return {
      razorpaySubscriptionId: mandate.id,
      alreadyCancelled: row.targetTier === 'hobby',
      currentPeriodEnd: row.periodEnd.toISOString(),
    };
  });
}

/** Orders cannot be expired: a late capture after an abandoned checkout is refunded, never fulfilled. */
export async function refundAbandonedReplacement(row: Replacement) {
  if (row.status !== 'failed' || !row.orderId) return;
  await repository.locked(row.organizationId, async (_current, repo) => {
    for (const payment of await provider.payments(row.orderId!)) {
      if (
        payment.order_id !== row.orderId ||
        payment.amount !== row.amount ||
        payment.currency !== row.currency
      )
        continue;
      if (payment.status === 'captured' && payment.amount_refunded < row.amount)
        await provider.refund(payment.id, row.amount, row.id);
      await repo.payment(row.organizationId, payment);
    }
    await repo.update(row.id, {});
  });
}

/** A debit already in flight can arrive after cancellation; refund only a superseded renewal. */
export async function auditSupersededAgreement(row: Replacement) {
  if (!row.sourceStoppedAt || !['confirmed', 'completed'].includes(row.status)) return;
  const agreements = [
    row.sourceSubscriptionId,
    ...(row.targetTier === 'hobby' && row.replacementSubscriptionId
      ? [row.replacementSubscriptionId]
      : []),
  ];
  const invoices = (await Promise.all(agreements.map((id) => provider.invoices(id)))).flat();
  await repository.locked(row.organizationId, async (_current, repo) => {
    for (const invoice of invoices) {
      if (
        !agreements.includes(invoice.subscription_id ?? '') ||
        invoice.status !== 'paid' ||
        !invoice.payment_id ||
        invoice.billing_start === null ||
        invoice.billing_start * 1000 < row.periodEnd.getTime()
      )
        continue;
      const payment = await provider.payment(invoice.payment_id);
      if (payment.status === 'captured' && payment.amount_refunded < payment.amount)
        await provider.refund(payment.id, payment.amount, row.id);
      await repo.payment(row.organizationId, payment);
    }
  });
}
