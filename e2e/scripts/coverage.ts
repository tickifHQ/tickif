import { z } from 'zod';

export const requiredTests = [
  ['authentication.spec.ts', 'phone OTP creates a real visitor session and rejects a wrong code'],
  [
    'authentication.spec.ts',
    'email OTP creates a real session through a local Resend delivery double',
  ],
  [
    'authentication.spec.ts',
    'Google authorization creates a session through the real callback with a local token double',
  ],
  [
    'authentication.spec.ts',
    'Google denial creates no session and does not lose the local callback boundary',
  ],
  [
    'billing-management.spec.ts',
    'billing owner sees real payments, recovers an existing mandate, and gets honest refresh errors',
  ],
  [
    'consultation-participants.spec.ts',
    'consultation lifecycle: visitor books, studio confirms and completes, visitor reviews and cancels another request',
  ],
  [
    'designer-discovery.spec.ts',
    'searches real indexed designers, pages with keyboard, and preserves browser history',
  ],
  [
    'designer-discovery.spec.ts',
    'applies combined filters at page one, and can recover from empty results',
  ],
  [
    'designer-discovery.spec.ts',
    'is reachable on mobile and contains cards and filters without horizontal overflow',
  ],
  ['homepage-feed.spec.ts', 'searches from suggestions and loads the next result page'],
  [
    'homepage-feed.spec.ts',
    'walks back from a deep-linked result page with the pagination control',
  ],
  [
    'marketplace-journey.spec.ts',
    'designer onboarding and media processing connects to visitor onboarding and discovery, enquiry and lead management',
  ],
  [
    'organization-access.spec.ts',
    'invitation acceptance, role changes and studio switching preserve organization boundaries',
  ],
  [
    'organization-workflows.spec.ts',
    'studio workspaces isolate all business surfaces and enforce owner, admin and member capabilities',
  ],
  [
    'personal-settings.spec.ts',
    'edits personal details from My Tickif, survives reload, and detects another tab save',
  ],
  ['personal-settings.spec.ts', 'redirects an anonymous visitor to login'],
  [
    'project-likes.spec.ts',
    'visitor likes persist across project and portfolio views independently of bookmarks',
  ],
  [
    'project-moderation.spec.ts',
    'project moderation lifecycle: admin paginates, claims, comments, resolves and completes decisions',
  ],
  [
    'review-moderation.spec.ts',
    'review moderation requires a session and retains the selected queue on login',
  ],
  [
    'review-participants.spec.ts',
    'review lifecycle: visitor edits, admin rejects and publishes, designer disputes, admin publishes and removes',
  ],
  ['smoke.spec.ts', 'home page renders'],
  ['smoke.spec.ts', 'api is healthy and protects the projects endpoint'],
  ['smoke.spec.ts', 'admin verification review requires an authenticated admin session'],
  ['smoke.spec.ts', 'OpenAPI spec and Scalar docs are served'],
  [
    'verification-lifecycle.spec.ts',
    'verification lifecycle: rejected documents are resubmitted, approved and renewed',
  ],
].map(([file, title]) => ({ file: file!, title: title! }));

const testSchema = z.object({
  status: z.string(),
  results: z.array(z.object({ status: z.string() })),
});
const specSchema = z.object({
  file: z.string(),
  title: z.string(),
  tests: z.array(testSchema),
});
const suiteSchema: z.ZodType<{ suites?: unknown[]; specs?: unknown[] }> = z.object({
  suites: z.array(z.unknown()).optional(),
  specs: z.array(z.unknown()).optional(),
});
const reportSchema = z.object({
  suites: z.array(z.unknown()),
  stats: z.object({
    expected: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    unexpected: z.number().int().nonnegative(),
    flaky: z.number().int().nonnegative(),
  }),
});

export function assertCompleteCoverage(input: unknown) {
  const report = reportSchema.parse(input);
  const specs: z.infer<typeof specSchema>[] = [];
  function visit(value: unknown) {
    const suite = suiteSchema.parse(value);
    for (const spec of suite.specs ?? []) specs.push(specSchema.parse(spec));
    for (const child of suite.suites ?? []) visit(child);
  }
  report.suites.forEach(visit);

  const passed = (test: z.infer<typeof testSchema>) =>
    test.status === 'expected' && test.results.length === 1 && test.results[0]?.status === 'passed';
  const missing = requiredTests.filter(
    (required) =>
      !specs.some(
        (spec) =>
          spec.file === required.file &&
          spec.title === required.title &&
          spec.tests.length > 0 &&
          spec.tests.every(passed),
      ),
  );
  if (missing.length)
    throw new Error(
      `Critical E2E tests missing or not green: ${missing.map(({ file, title }) => `${file}: ${title}`).join('; ')}`,
    );
  if (report.stats.expected !== requiredTests.length)
    throw new Error(
      `Critical E2E report expected ${report.stats.expected} passing tests; manifest requires ${requiredTests.length}`,
    );
  for (const status of ['skipped', 'unexpected', 'flaky'] as const) {
    if (report.stats[status] !== 0)
      throw new Error(`Critical E2E report contains ${report.stats[status]} ${status} test(s)`);
  }
}
