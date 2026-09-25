import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organization, user } from './auth.js';
import { planTierEnum } from './domain.js';

export const billingRecoveryStatusEnum = pgEnum('billing_recovery_status', [
  'requested',
  'waiting_for_expiry',
  'eligible',
  'checkout_pending',
  'completed',
  'dismissed',
  'superseded',
]);
export const billingOperationStatusEnum = pgEnum('billing_operation_status', [
  'requested',
  'processing',
  'reconciliation_pending',
  'scheduled',
  'activated',
  'failed',
]);
export const billingOperationKindEnum = pgEnum('billing_operation_kind', [
  'subscribe',
  'change_plan',
  'cancel',
  'recover',
]);

export const billingReplacementStatusEnum = pgEnum('billing_replacement_status', [
  'creating',
  'checkout',
  'confirmed',
  'completed',
  'aborting',
  'failed',
]);

/** Retains both mandate identities after rollover; provider events never define access alone. */
export const billingReplacement = pgTable(
  'billing_replacement',
  {
    id: uuid().primaryKey(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    sourceSubscriptionId: text().notNull(),
    replacementSubscriptionId: text().unique(),
    orderId: text().unique(),
    paymentId: text().unique(),
    targetTier: planTierEnum().notNull(),
    sourceTier: planTierEnum().notNull(),
    targetPlanId: text().notNull(),
    amount: integer().notNull(),
    recurringAmount: integer().notNull(),
    currency: text().notNull(),
    periodEnd: timestamp({ withTimezone: true }).notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    status: billingReplacementStatusEnum().notNull().default('creating'),
    sourceStoppedAt: timestamp({ withTimezone: true }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('billing_replacement_org_idx').on(t.organizationId),
    index('billing_replacement_source_idx').on(t.sourceSubscriptionId),
    index('billing_replacement_sweep_idx').on(t.updatedAt),
    uniqueIndex('billing_replacement_open_org_unique')
      .on(t.organizationId)
      .where(sql`${t.status} not in ('completed', 'failed')`),
  ],
);

export const billingRecovery = pgTable(
  'billing_recovery',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    actorId: text().references(() => user.id, { onDelete: 'set null' }),
    targetTier: planTierEnum().notNull(),
    sourceSubscriptionId: text().notNull(),
    status: billingRecoveryStatusEnum().notNull().default('requested'),
    eligibleAt: timestamp({ withTimezone: true }),
    reason: text(),
    revision: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('billing_recovery_open_org_unique')
      .on(t.organizationId)
      .where(
        sql`${t.status} in ('requested', 'waiting_for_expiry', 'eligible', 'checkout_pending')`,
      ),
    index('billing_recovery_org_idx').on(t.organizationId),
    index('billing_recovery_actor_idx').on(t.actorId),
    index('billing_recovery_sweep_idx')
      .on(t.updatedAt)
      .where(
        sql`${t.status} in ('requested', 'waiting_for_expiry', 'eligible', 'checkout_pending')`,
      ),
  ],
);

export const billingOperation = pgTable(
  'billing_operation',
  {
    operationId: uuid().primaryKey(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    actorId: text().references(() => user.id, { onDelete: 'set null' }),
    targetTier: planTierEnum().notNull(),
    kind: billingOperationKindEnum().notNull(),
    sourceSubscriptionId: text(),
    stateRevision: text().notNull(),
    status: billingOperationStatusEnum().notNull().default('processing'),
    result: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('billing_operation_org_idx').on(t.organizationId),
    index('billing_operation_actor_idx').on(t.actorId),
    uniqueIndex('billing_operation_open_org_unique')
      .on(t.organizationId)
      .where(sql`${t.status} in ('requested', 'processing', 'reconciliation_pending')`),
  ],
);
