import { describe, expect, it } from 'vitest';
import { assertCompleteCoverage, requiredTests } from './coverage';

function report(
  overrides: {
    omittedTitle?: string;
    skippedTitle?: string;
    flaky?: number;
  } = {},
) {
  const specs = requiredTests
    .filter(({ title }) => title !== overrides.omittedTitle)
    .map(({ file, title }) => ({
      file,
      title,
      tests: [
        {
          status: overrides.skippedTitle === title ? 'skipped' : 'expected',
          results: [{ status: overrides.skippedTitle === title ? 'skipped' : 'passed' }],
        },
      ],
    }));
  const skipped = overrides.skippedTitle ? 1 : 0;
  return {
    suites: [{ specs }],
    stats: {
      expected: requiredTests.length - skipped,
      skipped,
      unexpected: 0,
      flaky: overrides.flaky ?? 0,
    },
  };
}

describe('critical E2E coverage gate', () => {
  it('requires every account-menu journey without omissions or skips', () => {
    const titles = [
      'account menu uses real personal data, working destinations, and resilient logout on desktop and mobile',
      'saved projects requires authentication',
      'saved projects keeps failed removals retryable and corrects pagination without a reload',
      'phone-auth placeholder names use a safe menu label before onboarding',
    ];
    expect(requiredTests.filter(({ file }) => file === 'account-menu.spec.ts')).toHaveLength(4);
    for (const title of titles) {
      expect(requiredTests).toContainEqual({ file: 'account-menu.spec.ts', title });
      expect(() => assertCompleteCoverage(report({ omittedTitle: title }))).toThrow(/Critical E2E/);
      expect(() => assertCompleteCoverage(report({ skippedTitle: title }))).toThrow(/Critical E2E/);
    }
  });

  it('requires the public profile mobile rating regression without omission or skip', () => {
    const title = 'Google rating summary and review carousel fit narrow profile screens';
    expect(requiredTests).toContainEqual({ file: 'public-profile-ratings-mobile.spec.ts', title });
    expect(() => assertCompleteCoverage(report({ omittedTitle: title }))).toThrow(/Critical E2E/);
    expect(() => assertCompleteCoverage(report({ skippedTitle: title }))).toThrow(/Critical E2E/);
  });
  it('requires all shared UI journeys without omissions or skips', () => {
    const sharedUi = requiredTests.filter(({ file }) => file === 'shared-ui.spec.ts');
    expect(sharedUi).toHaveLength(7);
    expect(sharedUi).toContainEqual({
      file: 'shared-ui.spec.ts',
      title: 'select opens a themed popup with keyboard selection and dismissal',
    });
    for (const { title } of sharedUi) {
      expect(() => assertCompleteCoverage(report({ omittedTitle: title }))).toThrow(/Critical E2E/);
      expect(() => assertCompleteCoverage(report({ skippedTitle: title }))).toThrow(/Critical E2E/);
    }
  });

  it('requires every billing matrix and failure journey without omissions or skips', () => {
    const billing = requiredTests.filter(({ file }) => file.startsWith('billing-'));
    expect(billing).toHaveLength(48);
    expect(billing.filter(({ file }) => file === 'billing-plan-matrix.spec.ts')).toHaveLength(18);
    expect(billing.filter(({ file }) => file === 'billing-same-cycle.spec.ts')).toHaveLength(4);
    for (const { title } of billing) {
      expect(() => assertCompleteCoverage(report({ omittedTitle: title }))).toThrow(/Critical E2E/);
      expect(() => assertCompleteCoverage(report({ skippedTitle: title }))).toThrow(/Critical E2E/);
    }
  });

  it('requires the designer auth-wall regression journey', () => {
    const title =
      'anonymous designer routes never paint protected workspace content and retain the callback';
    expect(requiredTests).toContainEqual({ file: 'authentication.spec.ts', title });
    expect(() => assertCompleteCoverage(report({ omittedTitle: title }))).toThrow(
      /anonymous designer routes/,
    );
  });

  it('requires the fresh Hobby usage journey independently of mandate recovery', () => {
    const title =
      'fresh Hobby organization shows actual seat and branch usage without a subscription';
    expect(requiredTests).toContainEqual({ file: 'billing-management.spec.ts', title });
    expect(() => assertCompleteCoverage(report({ omittedTitle: title }))).toThrow(/fresh Hobby/);
  });

  it('requires Corporate branch management and every role navigation journey', () => {
    expect(requiredTests).toContainEqual({
      file: 'corporate-branches.spec.ts',
      title: 'Corporate branch management enforces roles and preserves operational data',
    });
    for (const role of ['owner', 'admin', 'member', 'billing_admin', 'viewer']) {
      expect(requiredTests).toContainEqual({
        file: 'corporate-role-navigation.spec.ts',
        title: `Corporate ${role} navigation and direct project creation enforce permissions`,
      });
    }
  });

  it('requires the published-project version review journey', () => {
    const title =
      'published project edits keep live content through rejection and replace it only on approval';
    expect(requiredTests).toContainEqual({ file: 'project-versions.spec.ts', title });
    expect(() => assertCompleteCoverage(report({ omittedTitle: title }))).toThrow(
      /project-versions/,
    );
  });

  it('requires the moderation categories and designer feedback journey', () => {
    const title = 'E-254 categories persist and reach designer feedback on desktop and mobile';
    expect(requiredTests).toContainEqual({ file: 'project-moderation.spec.ts', title });
    expect(() => assertCompleteCoverage(report({ omittedTitle: title }))).toThrow(/E-254/);
  });

  it('accepts one clean execution of the complete manifest', () => {
    expect(() => assertCompleteCoverage(report())).not.toThrow();
  });

  it('rejects a filtered run that omits a test outside the old title-fragment gate', () => {
    expect(() =>
      assertCompleteCoverage(report({ omittedTitle: 'redirects an anonymous visitor to login' })),
    ).toThrow(/redirects an anonymous visitor to login/);
  });

  it('rejects skipped and flaky results', () => {
    expect(() =>
      assertCompleteCoverage(
        report({
          skippedTitle:
            'Google denial creates no session and does not lose the local callback boundary',
        }),
      ),
    ).toThrow(/Google denial/);
    expect(() => assertCompleteCoverage(report({ flaky: 1 }))).toThrow(/flaky/);
  });
});
