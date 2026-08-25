import { describe, expect, it } from 'vitest';
import {
  seatLimit,
  branchLimit,
  rbacEnabled,
  analyticsScope,
  rankingTier,
  directoryTopPlacement,
  canDisplayVerifiedBadge,
  resolveEntitlements,
  ANALYTICS_SCOPE,
} from '@repo/contracts';
import type { PlanTier, SubscriptionState } from '@repo/contracts';

/**
 * E-119 Entitlement matrix tests — 15-cell table-driven.
 *
 * Source of truth: Phase 2 Plans/Entitlements/RBAC v2 implementation spec.
 * Tests every (tier, lifecycleState) combination including impossible ones
 * constrained by the E-114 schema.
 *
 * Tier values from spec:
 *   seatLimit:    Hobby 1, Professional+ 1, Corporate Infinity(-1)
 *   branchLimit:  Hobby 1, Professional+ 1, Corporate Infinity(-1)
 *   rbacEnabled:  Hobby false, Pro+ false, Corporate true
 *   analyticsScope: Hobby basic, Pro+ basic, Corporate branch
 *   rankingTier:  Hobby 0, Pro+ 1, Corporate 2
 *   directoryTopPlacement: Corporate only
 *   canDisplayVerifiedBadge: isVerified && tier >= pro+ && state NOT IN {locked, downgraded}
 *
 * Lifecycle rules:
 *   active/payment_failed/grace: full tier entitlements
 *   locked: suspend to hobby-equivalent
 *   downgraded: planTier is already 'hobby' in schema
 */

describe('E-119: 15-cell entitlement matrix', () => {
  // ─── Full entitlement states (active, payment_failed, grace) ─────────────

  describe.each<[PlanTier, SubscriptionState]>([
    ['hobby', 'active'],
    ['professional_plus', 'active'],
    ['professional_plus', 'payment_failed'],
    ['professional_plus', 'grace'],
    ['corporate', 'active'],
    ['corporate', 'payment_failed'],
    ['corporate', 'grace'],
  ])('full entitlements: %s + %s', (tier, state) => {
    it('seatLimit', () => {
      const expected = tier === 'corporate' ? -1 : 1;
      expect(seatLimit(tier, state)).toBe(expected);
    });

    it('branchLimit', () => {
      const expected = tier === 'corporate' ? -1 : 1;
      expect(branchLimit(tier, state)).toBe(expected);
    });

    it('rbacEnabled', () => {
      expect(rbacEnabled(tier, state)).toBe(tier === 'corporate');
    });

    it('analyticsScope', () => {
      const expected = tier === 'corporate' ? ANALYTICS_SCOPE.BRANCH : ANALYTICS_SCOPE.BASIC;
      expect(analyticsScope(tier, state)).toBe(expected);
    });

    it('rankingTier', () => {
      const expected = tier === 'hobby' ? 0 : tier === 'professional_plus' ? 1 : 2;
      expect(rankingTier(tier, state)).toBe(expected);
    });

    it('directoryTopPlacement', () => {
      expect(directoryTopPlacement(tier, state)).toBe(tier === 'corporate');
    });
  });

  // ─── Locked state (suspended to hobby-equivalent) ────────────────────────

  describe.each<[PlanTier, SubscriptionState]>([
    ['professional_plus', 'locked'],
    ['corporate', 'locked'],
  ])('locked (suspended): %s + %s', (tier, state) => {
    it('seatLimit = hobby', () => {
      expect(seatLimit(tier, state)).toBe(1);
    });

    it('branchLimit = hobby', () => {
      expect(branchLimit(tier, state)).toBe(1);
    });

    it('rbacEnabled = false', () => {
      expect(rbacEnabled(tier, state)).toBe(false);
    });

    it('analyticsScope = basic', () => {
      expect(analyticsScope(tier, state)).toBe(ANALYTICS_SCOPE.BASIC);
    });

    it('rankingTier = 0', () => {
      expect(rankingTier(tier, state)).toBe(0);
    });

    it('directoryTopPlacement = false', () => {
      expect(directoryTopPlacement(tier, state)).toBe(false);
    });
  });

  // ─── Downgraded (planTier is hobby in schema) ────────────────────────────

  describe('downgraded (schema enforces planTier=hobby)', () => {
    it('hobby + downgraded has hobby entitlements', () => {
      // E-114 CHECK: downgraded requires planTier = 'hobby'
      const ent = resolveEntitlements('hobby', 'downgraded', false);
      expect(ent.seatLimit).toBe(1);
      expect(ent.branchLimit).toBe(1);
      expect(ent.rbacEnabled).toBe(false);
      expect(ent.analyticsScope).toBe(ANALYTICS_SCOPE.BASIC);
      expect(ent.rankingTier).toBe(0);
      expect(ent.directoryTopPlacement).toBe(false);
      expect(ent.canDisplayVerifiedBadge).toBe(false);
    });
  });

  // ─── Schema-impossible combinations (documented) ──────────────────────────

  describe('schema-impossible combinations (E-114 CHECK prevents these)', () => {
    // hobby cannot enter payment_failed/grace/locked/downgraded because
    // there's no Razorpay subscription to fail. But the entitlement functions
    // should still produce sensible values if called defensively.
    it.each<SubscriptionState>(['payment_failed', 'grace', 'locked', 'downgraded'])(
      'hobby + %s (impossible) still returns hobby values',
      (state) => {
        expect(seatLimit('hobby', state)).toBe(1);
        expect(branchLimit('hobby', state)).toBe(1);
        expect(rbacEnabled('hobby', state)).toBe(false);
      },
    );
  });

  // ─── canDisplayVerifiedBadge (special rule) ───────────────────────────────

  describe('canDisplayVerifiedBadge', () => {
    it('requires isVerified = true', () => {
      expect(canDisplayVerifiedBadge('corporate', 'active', false)).toBe(false);
    });

    it('requires tier >= professional_plus', () => {
      expect(canDisplayVerifiedBadge('hobby', 'active', true)).toBe(false);
    });

    it('professional_plus + active + verified = true', () => {
      expect(canDisplayVerifiedBadge('professional_plus', 'active', true)).toBe(true);
    });

    it('corporate + active + verified = true', () => {
      expect(canDisplayVerifiedBadge('corporate', 'active', true)).toBe(true);
    });

    it('locked disqualifies even with verified + paid tier', () => {
      expect(canDisplayVerifiedBadge('corporate', 'locked', true)).toBe(false);
    });

    it('downgraded disqualifies even with verified + paid tier', () => {
      expect(canDisplayVerifiedBadge('professional_plus', 'downgraded', true)).toBe(false);
    });

    it('grace preserves badge eligibility', () => {
      expect(canDisplayVerifiedBadge('professional_plus', 'grace', true)).toBe(true);
    });

    it('payment_failed preserves badge eligibility', () => {
      expect(canDisplayVerifiedBadge('corporate', 'payment_failed', true)).toBe(true);
    });
  });

  // ─── resolveEntitlements integration ──────────────────────────────────────

  describe('resolveEntitlements', () => {
    it('hobby + active returns all hobby values', () => {
      const ent = resolveEntitlements('hobby', 'active');
      expect(ent).toEqual({
        seatLimit: 1,
        branchLimit: 1,
        rbacEnabled: false,
        analyticsScope: 'basic',
        rankingTier: 0,
        directoryTopPlacement: false,
        canDisplayVerifiedBadge: false,
      });
    });

    it('corporate + active returns full corporate values', () => {
      const ent = resolveEntitlements('corporate', 'active', true);
      expect(ent).toEqual({
        seatLimit: -1,
        branchLimit: -1,
        rbacEnabled: true,
        analyticsScope: 'branch',
        rankingTier: 2,
        directoryTopPlacement: true,
        canDisplayVerifiedBadge: true,
      });
    });

    it('professional_plus + locked = hobby-equivalent', () => {
      const ent = resolveEntitlements('professional_plus', 'locked', true);
      expect(ent).toEqual({
        seatLimit: 1,
        branchLimit: 1,
        rbacEnabled: false,
        analyticsScope: 'basic',
        rankingTier: 0,
        directoryTopPlacement: false,
        canDisplayVerifiedBadge: false,
      });
    });
  });
});
