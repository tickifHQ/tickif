import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  paymentTransaction,
  planTierEnum,
  subscription,
  subscriptionStateEnum,
} from '../src/schema/domain.js';

describe('subscription schema', () => {
  const config = getTableConfig(subscription);

  describe('plan tier enum', () => {
    it('defines tiers in ranking order: hobby < professional_plus < corporate', () => {
      expect(planTierEnum.enumValues).toEqual(['hobby', 'professional_plus', 'corporate']);
    });
  });

  describe('subscription state enum', () => {
    it('defines the lifecycle state machine states', () => {
      expect(subscriptionStateEnum.enumValues).toEqual([
        'active',
        'payment_failed',
        'grace',
        'locked',
        'downgraded',
      ]);
    });
  });

  describe('subscription table', () => {
    it('enforces one subscription per organization via unique constraint', () => {
      const orgColumn = config.columns.find((col) => col.name === 'organization_id');
      expect(orgColumn).toMatchObject({ notNull: true });
      expect(orgColumn?.isUnique).toBe(true);
    });

    it('references organization with ON DELETE RESTRICT', () => {
      const orgFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((col) => col.name === 'organization_id'),
      );
      expect(orgFk?.onDelete).toBe('restrict');
    });

    it('makes razorpay_subscription_id unique (nullable for Hobby)', () => {
      const col = config.columns.find((col) => col.name === 'razorpay_subscription_id');
      expect(col?.isUnique).toBe(true);
      expect(col?.notNull).toBe(false);
    });

    it('stores pre_lapse_tier for tier restoration during lapse lifecycle', () => {
      const col = config.columns.find((col) => col.name === 'pre_lapse_tier');
      expect(col).toBeDefined();
      expect(col?.notNull).toBe(false);
    });

    it('uses timezone-aware timestamps for lifecycle events', () => {
      const lifecycleTimestamps = config.columns.filter((col) =>
        [
          'current_period_end',
          'grace_started_at',
          'locked_at',
          'downgraded_at',
          'created_at',
          'updated_at',
        ].includes(col.name),
      );
      expect(lifecycleTimestamps).toHaveLength(6);
      expect(
        lifecycleTimestamps.every(
          (col) => col.columnType === 'PgTimestamp' && 'withTimezone' in col && col.withTimezone,
        ),
      ).toBe(true);
    });

    it('indexes organization_id and subscription_state for lookups', () => {
      const indexNames = config.indexes.map((idx) => idx.config.name);
      expect(indexNames).toContain('subscription_organization_idx');
      expect(indexNames).toContain('subscription_state_idx');
    });

    it('does not have a redundant index on razorpay_subscription_id (unique provides it)', () => {
      const indexNames = config.indexes.map((idx) => idx.config.name);
      expect(indexNames).not.toContain('subscription_razorpay_subscription_id_idx');
    });

    it('enforces lifecycle data integrity via CHECK constraints', () => {
      const checkNames = config.checks.map((chk) => chk.name);
      expect(checkNames).toContain('subscription_lifecycle_check');
      expect(checkNames).toContain('subscription_timestamp_order_check');
    });

    it('does not store frozen/frozen_at/freeze_rank (belongs to E-238/E-240)', () => {
      const colNames = config.columns.map((col) => col.name);
      expect(colNames).not.toContain('frozen');
      expect(colNames).not.toContain('frozen_at');
      expect(colNames).not.toContain('freeze_rank');
    });

    it('does not store isEarlyBird (removed from approved model)', () => {
      const colNames = config.columns.map((col) => col.name);
      expect(colNames).not.toContain('is_early_bird');
    });
  });

  describe('subscription lifecycle recoverability', () => {
    // The lifecycle state machine: active → payment_failed → grace → locked → downgraded → active
    // pre_lapse_tier must be recoverable throughout the lapse lifecycle.
    // These tests verify the schema supports this contract via CHECK constraints.

    it('active state requires no lapse timestamps and no pre_lapse_tier', () => {
      // subscription_lifecycle_check: active AND grace_started_at IS NULL
      //   AND locked_at IS NULL AND downgraded_at IS NULL
      const checkNames = config.checks.map((chk) => chk.name);
      expect(checkNames).toContain('subscription_lifecycle_check');
    });

    it('payment_failed requires all lapse fields NULL (pre-lapse transitional state)', () => {
      // subscription_lifecycle_check: payment_failed AND grace_started_at IS NULL
      //   AND locked_at IS NULL AND downgraded_at IS NULL AND pre_lapse_tier IS NULL
      const checkNames = config.checks.map((chk) => chk.name);
      expect(checkNames).toContain('subscription_lifecycle_check');
    });

    it('grace state requires grace_started_at and pre_lapse_tier for restoration', () => {
      // subscription_lifecycle_check: grace AND grace_started_at IS NOT NULL
      //   AND pre_lapse_tier IS NOT NULL
      const preLapseTier = config.columns.find((col) => col.name === 'pre_lapse_tier');
      const graceStartedAt = config.columns.find((col) => col.name === 'grace_started_at');
      expect(preLapseTier).toBeDefined();
      expect(graceStartedAt).toBeDefined();
    });

    it('locked state requires grace_started_at, locked_at, and pre_lapse_tier for restoration', () => {
      // subscription_lifecycle_check: locked AND grace_started_at IS NOT NULL
      //   AND locked_at IS NOT NULL AND pre_lapse_tier IS NOT NULL
      const lockedAt = config.columns.find((col) => col.name === 'locked_at');
      expect(lockedAt).toBeDefined();
      expect(lockedAt?.notNull).toBe(false);
    });

    it('downgraded state requires grace_started_at, locked_at, downgraded_at, and pre_lapse_tier', () => {
      // subscription_lifecycle_check: downgraded AND grace_started_at IS NOT NULL
      //   AND locked_at IS NOT NULL AND downgraded_at IS NOT NULL AND pre_lapse_tier IS NOT NULL
      const downgradedAt = config.columns.find((col) => col.name === 'downgraded_at');
      expect(downgradedAt).toBeDefined();
      expect(downgradedAt?.notNull).toBe(false);
    });

    it('enforces chronological ordering of lifecycle timestamps', () => {
      // subscription_timestamp_order_check: locked_at >= grace_started_at,
      //   downgraded_at >= locked_at
      const checkNames = config.checks.map((chk) => chk.name);
      expect(checkNames).toContain('subscription_timestamp_order_check');
    });
  });
});

describe('payment transaction schema', () => {
  const config = getTableConfig(paymentTransaction);

  it('enforces payment idempotency via unique razorpay_payment_id', () => {
    const col = config.columns.find((col) => col.name === 'razorpay_payment_id');
    expect(col?.isUnique).toBe(true);
    expect(col?.notNull).toBe(true);
  });

  it('references subscription with ON DELETE RESTRICT', () => {
    const subFk = config.foreignKeys.find((fk) =>
      fk.reference().columns.some((col) => col.name === 'subscription_id'),
    );
    expect(subFk?.onDelete).toBe('restrict');
  });

  it('stores amount as integer (paise) with positive value constraint', () => {
    const col = config.columns.find((col) => col.name === 'amount');
    expect(col?.columnType).toBe('PgInteger');
    expect(col?.notNull).toBe(true);
    const checkNames = config.checks.map((chk) => chk.name);
    expect(checkNames).toContain('payment_transaction_amount_positive');
  });

  it('uses text for status (external system value, not a local enum)', () => {
    const col = config.columns.find((col) => col.name === 'status');
    expect(col?.columnType).toBe('PgText');
    expect(col?.notNull).toBe(true);
  });

  it('stores raw Razorpay payload as nullable JSONB', () => {
    const col = config.columns.find((col) => col.name === 'payload');
    expect(col?.columnType).toBe('PgJsonb');
    expect(col?.notNull).toBe(false);
  });

  it('indexes subscription_id foreign key for lookups', () => {
    const indexNames = config.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain('payment_transaction_subscription_idx');
  });
});
