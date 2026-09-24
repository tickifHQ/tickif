import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';

const subscriptionSchema = z.object({
  id: z.string().startsWith('sub_e2e_'),
  entity: z.literal('subscription').default('subscription'),
  plan_id: z.enum(['plan_e2e_professional', 'plan_e2e_corporate']),
  status: z.string(),
  current_start: z.number().nullable().default(null),
  current_end: z.number().nullable().default(null),
  created_at: z.number().default(1_790_000_000),
  short_url: z.null().default(null),
  notes: z.record(z.string(), z.string()).default({}),
  cancel_at_cycle_end: z.boolean().optional(),
  payment_method: z.string().default('card'),
  quantity: z.number().default(1),
  has_scheduled_changes: z.boolean().default(false),
  change_scheduled_at: z.number().nullable().default(null),
  scheduled_plan_id: z.string().optional(),
});
const subscriptions = new Map<string, z.infer<typeof subscriptionSchema>>();
const requests: Array<{ method: string; path: string; body: unknown }> = [];
const faultSchema = z.object({
  method: z.enum(['GET', 'POST', 'PATCH']),
  path: z.string().regex(/^\/(subscriptions|plans)(\/|$)/),
  mode: z.enum(['unavailable', 'drop_after_accept']),
  organizationId: z.string().optional(),
});
const faults = new Map<string, z.infer<typeof faultSchema>>();
const organizationSchema = z.object({
  notes: z.object({ organizationId: z.string().optional() }).optional(),
});

async function readBody(request: IncomingMessage): Promise<unknown> {
  let body = '';
  for await (const chunk of request) {
    body += String(chunk);
    if (body.length > 100_000) throw new Error('Fixture request too large');
  }
  return body ? JSON.parse(body) : {};
}

/** Local deterministic provider boundary; never mounted by application code. */
export async function handleBillingProvider(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> {
  const reply = (body: unknown, status = 200) =>
    response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  try {
    if (url.pathname === '/billing-fixture/faults' && request.method === 'POST') {
      const fault = faultSchema.parse(await readBody(request));
      const id = randomUUID();
      faults.set(id, fault);
      reply({ id });
      return;
    }
    if (url.pathname.startsWith('/billing-fixture/faults/') && request.method === 'DELETE') {
      faults.delete(url.pathname.slice('/billing-fixture/faults/'.length));
      reply({ removed: true });
      return;
    }
    if (url.pathname === '/billing-fixture/subscriptions' && request.method === 'POST') {
      const subscription = subscriptionSchema.parse(await readBody(request));
      subscriptions.set(subscription.id, subscription);
      reply(subscription);
      return;
    }
    if (url.pathname === '/billing-fixture/requests') {
      reply(requests);
      return;
    }
    const path = url.pathname.replace(/^\/razorpay\/v1/, '');
    const body = await readBody(request);
    requests.push({ method: request.method ?? 'GET', path, body });
    const organization = organizationSchema.safeParse(body);
    const faultEntry = [...faults].find(
      ([, fault]) =>
        fault.method === request.method &&
        fault.path === path &&
        (!fault.organizationId ||
          (organization.success &&
            organization.data.notes?.organizationId === fault.organizationId)),
    );
    if (faultEntry) faults.delete(faultEntry[0]);
    const fault = faultEntry?.[1];
    if (fault?.mode === 'unavailable') {
      reply({ error: { description: 'Synthetic one-shot provider outage' } }, 503);
      return;
    }
    if (path.startsWith('/plans/')) {
      const id = path.slice('/plans/'.length);
      if (!['plan_e2e_professional', 'plan_e2e_corporate'].includes(id)) {
        reply({ error: { description: 'Unknown synthetic plan' } }, 404);
        return;
      }
      reply({
        id,
        entity: 'plan',
        interval: 1,
        period: 'monthly',
        created_at: 1_790_000_000,
        item: {
          id: `item_${id}`,
          name: id,
          amount: id === 'plan_e2e_corporate' ? 799900 : 299900,
          currency: 'INR',
        },
      });
      return;
    }
    if (path === '/subscriptions' && request.method === 'POST') {
      const input = z
        .object({
          plan_id: subscriptionSchema.shape.plan_id,
          notes: z.record(z.string(), z.string()),
        })
        .parse(body);
      const subscription = subscriptionSchema.parse({
        ...input,
        id: `sub_e2e_${randomUUID()}`,
        status: 'created',
      });
      subscriptions.set(subscription.id, subscription);
      if (fault?.mode === 'drop_after_accept') {
        response.destroy();
        return;
      }
      reply(subscription);
      return;
    }
    const match =
      /^\/subscriptions\/(sub_e2e_[\w-]+)(\/cancel|\/retrieve_scheduled_changes)?$/.exec(path);
    const subscription = match?.[1] ? subscriptions.get(match[1]) : undefined;
    if (!subscription) {
      reply({ error: { description: 'Unknown synthetic subscription' } }, 404);
      return;
    }
    if (match?.[2] === '/cancel' && request.method === 'POST') {
      // This is a request parameter, not a documented subscription response field.
      delete subscription.cancel_at_cycle_end;
    } else if (request.method === 'PATCH') {
      const update = z
        .object({
          plan_id: subscriptionSchema.shape.plan_id,
          schedule_change_at: z.literal('cycle_end'),
        })
        .parse(body);
      subscription.scheduled_plan_id = update.plan_id;
      subscription.has_scheduled_changes = true;
      subscription.change_scheduled_at = subscription.current_end;
    }
    if (fault?.mode === 'drop_after_accept') {
      response.destroy();
      return;
    }
    reply(
      match?.[2] === '/retrieve_scheduled_changes'
        ? { ...subscription, plan_id: subscription.scheduled_plan_id ?? subscription.plan_id }
        : subscription,
    );
  } catch {
    reply({ error: { description: 'Invalid deterministic provider fixture request' } }, 400);
  }
}
