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
