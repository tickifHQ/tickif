import { z } from 'zod';

const billingMatrixEntries = ['overview', 'subscribe'].flatMap((entry) =>
  ['Hobby', 'Professional+', 'Corporate'].flatMap((current) =>
    ['Hobby', 'Professional+', 'Corporate'].map((target): [string, string] => {
      const semantics =
        current === target
          ? 'no-op'
          : current === 'Hobby'
            ? 'checkout activation'
            : target === 'Hobby'
              ? 'cycle-end cancellation'
              : current === 'Professional+'
                ? 'immediate paid upgrade'
                : 'scheduled paid downgrade';
      return ['billing-plan-matrix.spec.ts', `${entry}: ${current} -> ${target}: ${semantics}`];
    }),
  ),
);

const requiredEntries: [file: string, title: string][] = [
  ...[
    'account menu uses real personal data, working destinations, and resilient logout on desktop and mobile',
    'saved projects requires authentication',
    'saved projects keeps failed removals retryable and corrects pagination without a reload',
    'phone-auth placeholder names use a safe menu label before onboarding',
  ].map((title): [string, string] => ['account-menu.spec.ts', title]),
  ['shared-ui.spec.ts', 'shared typography uses loaded brand fonts instead of the system fallback'],
  ['shared-ui.spec.ts', 'button and badge labels share a tight centered line box at every size'],
  ['shared-ui.spec.ts', 'shared form controls reset native and controlled values together'],
  ['shared-ui.spec.ts', 'select opens a themed popup with keyboard selection and dismissal'],
  ['shared-ui.spec.ts', 'a select inside a dialog keeps both focus scopes usable'],
  ['shared-ui.spec.ts', 'month selection can be cleared with a pointer and selected again'],
  ['shared-ui.spec.ts', 'shared overlays respect reduced motion and preserve keyboard dismissal'],
  [
    'public-profile-ratings-mobile.spec.ts',
    'Google rating summary and review carousel fit narrow profile screens',
  ],
  ['project-photo-reorder.spec.ts', 'photo ordering persists with desktop mouse and keyboard'],
  ['project-photo-reorder.spec.ts', 'photo ordering persists with phone touch'],
  [
    'project-feedback.spec.ts',
    'project budget choices persist and room descriptions are absent from the editor',
  ],
  ...[1440, 390].map((width): [string, string] => [
    'team-size.spec.ts',
    `company team-size ranges resume and persist through profile editing at ${width}px`,
  ]),
  [
    'profile-completion-stepper.spec.ts',
    'profile completion steps guide designers to missing fields on desktop and mobile',
  ],
  [
    'social-links.spec.ts',
    'social profile confirmations match saved public links on desktop and mobile',
  ],
  [
    'portfolio-accent.spec.ts',
    'custom portfolio accent previews validates saves reloads and discards on desktop and mobile',
  ],
  [
    'portfolio-details.spec.ts',
    'portfolio details persist from editor to public studio on desktop and mobile',
  ],
  [
    'admin-summary.spec.ts',
    'admin summary matches live totals on desktop and mobile and excludes anonymous visitors',
  ],
  ...billingMatrixEntries,
  ...[1412, 390].flatMap((width): [string, string][] => [
    [
      'billing-checkout-return.spec.ts',
      `checkout loader, close, resume and verified success at ${width}px`,
    ],
    [
      'billing-checkout-return.spec.ts',
      `upgrade resumes the same adjustment after mandate authorization at ${width}px`,
    ],
  ]),
  ...['Upgrade to Corporate', 'Downgrade to Professional+'].flatMap((action) =>
    [false, true].map((cancelled): [string, string] => [
      'billing-same-cycle.spec.ts',
      `Hobby purchase then ${action} uses the original paid cycle with cancellation ${cancelled}`,
    ]),
  ),
  ...[
    'preview authorization rejects tampering, expiry and a different target or organization before provider mutation',
    'simultaneous submissions and completed-operation replay create exactly one provider checkout',
    'recovery revisions protect replacement and dismissal never reverses provider cancellation',
    'choosing another eligible saved plan requires confirmation before its replacement checkout',
    'revoked billing permission blocks saved preview execution and billing reads',
  ].map((title): [string, string] => ['billing-boundaries.spec.ts', title]),
  ...[
    'provider outage blocks a paid change preview without mutating billing',
    'lost checkout creation response remains uncertain across reload and cannot create twice',
    'lost cancellation response reconciles from live provider state without a second cancellation',
    'invalid duplicate and stale signed webhooks cannot grant or roll back a paid tier',
    'lost recovery cancellation retains the accepted target and reconciles without cancelling twice',
    'unfinished checkout rejects another tier and resumes the same provider subscription',
    'authenticated checkout waits for activation and cannot create a second subscription',
    'pending mandate requires payment recovery and blocks a replacement purchase',
    'halted mandate requires payment recovery and blocks a replacement purchase',
    'scheduled provider plan update retains current access and blocks conflicting selections',
  ].map((title): [string, string] => ['billing-provider-failures.spec.ts', title]),
  [
    'admin-user-activity.spec.ts',
    'E-340 and E-341 admin directory filters users and shows their recent history',
  ],
  ['admin-user-activity.spec.ts', 'E-340 users directory rejects unauthenticated visitors'],
  [
    'authentication.spec.ts',
    'anonymous designer routes never paint protected workspace content and retain the callback',
  ],
  [
    'authentication.spec.ts',
    'phone OTP creates a visitor session, completes onboarding, and opens personal settings',
  ],
  [
    'authentication.spec.ts',
    'visitor personal settings keep client validation local and persist details after onboarding',
  ],
  [
    'visitor-feed-preferences.spec.ts',
    'visitor welcome saves matching feed, restores choices and clears filters on desktop',
  ],
  [
    'visitor-feed-preferences.spec.ts',
    'visitor welcome saves matching feed, restores choices and clears filters on mobile',
  ],
  [
    'visitor-feed-preferences.spec.ts',
    'direct onboarding Skip completes a pending account and returns to the original page',
  ],
  [
    'visitor-feed-preferences.spec.ts',
    'small phone can select Villa and reach every welcome control without horizontal scrolling',
  ],
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
    'billing-management.spec.ts',
    'fresh Hobby organization shows actual seat and branch usage without a subscription',
  ],
  ...(['Hobby', 'Professional+', 'Corporate'] as const).map((label): [string, string] => [
    'billing-management.spec.ts',
    `${label} owner opens comparison from billing or directly at desktop and mobile widths`,
  ]),
  [
    'billing-management.spec.ts',
    'direct Corporate checkout survives provider dismissal and reload, then activates only from provider evidence',
  ],
  [
    'billing-management.spec.ts',
    'paid recovery preserves the accepted downgrade across session loss and cancellation requires a fresh preview',
  ],
  [
    'consultation-participants.spec.ts',
    'disabled consultations route public requests through enquiries and hide legacy surfaces',
  ],
  [
    'designer-discovery.spec.ts',
    'searches real indexed designers, pages with keyboard, and preserves browser history',
  ],
  [
    'designer-discovery.spec.ts',
    'applies combined filters at page one, and can recover from empty results',
  ],
  ['designer-discovery.spec.ts', 'applies draft designer types at 1440px'],
  ['designer-discovery.spec.ts', 'applies draft designer types at 390px'],
  [
    'designer-discovery.spec.ts',
    'is reachable on mobile and contains cards and filters without horizontal overflow',
  ],
  [
    'designer-explore-public-ui.spec.ts',
    'designer workspace opens discovery via Explore Tickif and empty public review sections stay hidden',
  ],
  ...(['owner', 'admin', 'billing_admin', 'member', 'viewer'] as const).map(
    (role): [string, string] => [
      'designer-explore-public-ui.spec.ts',
      `designer ${role} can explore via CTA while brand stays in workspace`,
    ],
  ),
  ['homepage-feed.spec.ts', 'searches from suggestions and loads the next result page'],
  ['homepage-feed.spec.ts', 'keeps a deep-linked result page in the infinite feed model'],
  ...[1440, 390].map((width): [string, string] => [
    'homepage-wording.spec.ts',
    `homepage wording and discovery controls at ${width}px`,
  ]),
  ...['desktop', 'mobile'].map((viewport): [string, string] => [
    'homepage-feed.spec.ts',
    `shows custom cities in suggestions and search cards on ${viewport}`,
  ]),
  [
    'marketplace-journey.spec.ts',
    'designer onboarding and media processing connects to visitor onboarding and discovery, enquiry and lead management',
  ],
  [
    'admin-enquiries.spec.ts',
    'admin enquiries filter and paginate while non-admin accounts stay denied',
  ],
  [
    'organization-access.spec.ts',
    'invitation acceptance, role changes and studio switching preserve organization boundaries',
  ],
  [
    'organization-access.spec.ts',
    'a designer recovers a branchless organization session by reselecting the studio',
  ],
  [
    'organization-workflows.spec.ts',
    'studio workspaces isolate all business surfaces and enforce owner, admin and member capabilities',
  ],
  [
    'corporate-branches.spec.ts',
    'Corporate branch management enforces roles and preserves operational data',
  ],
  ...(['owner', 'admin', 'member', 'billing_admin', 'viewer'] as const).map(
    (role): [string, string] => [
      'corporate-role-navigation.spec.ts',
      `Corporate ${role} navigation and direct project creation enforce permissions`,
    ],
  ),
  [
    'personal-settings.spec.ts',
    'edits personal details from My Tickif, survives reload, and detects another tab save',
  ],
  ['personal-settings.spec.ts', 'redirects an anonymous visitor to login'],
  [
    'phone-focus-ring.spec.ts',
    'composite fields show one visible focus indicator across login and designer workflows',
  ],
  [
    'project-details-cards.spec.ts',
    'project preview and status cards support hover, keyboard and mobile touch',
  ],
  [
    'project-view-action.spec.ts',
    'project view action opens the live version while submitted edits remain private',
  ],
  [
    'project-likes.spec.ts',
    'visitor likes persist across project and portfolio views independently of bookmarks',
  ],
  [
    'project-moderation.spec.ts',
    'E-254 categories persist and reach designer feedback on desktop and mobile',
  ],
  [
    'project-moderation.spec.ts',
    'project moderation lifecycle: admin paginates, claims, comments, resolves and completes decisions',
  ],
  [
    'project-versions.spec.ts',
    'published project edits keep live content through rejection and replace it only on approval',
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
  // E-278: designer onboarding completion + portfolio publication readiness.
  [
    'founding-year.spec.ts',
    'older founding year resumes in onboarding and persists through profile editing',
  ],
  [
    'designer-onboarding.spec.ts',
    'company designer completes onboarding and can proceed to portfolio settings',
  ],
  [
    'portfolio-publication.spec.ts',
    'an incomplete portfolio never exposes an actionable public URL (state D)',
  ],
  [
    'portfolio-publication.spec.ts',
    'a complete portfolio with the public link off stays private (state E)',
  ],
  [
    'portfolio-publication.spec.ts',
    'a published portfolio exposes the canonical URL everywhere and resolves publicly (state F + regression G)',
  ],
  [
    'portfolio-publication.spec.ts',
    'a saved experience center appears on the published portfolio and remains mobile-safe',
  ],
  [
    'portfolio-publication.spec.ts',
    'uploading the final required cover publishes the portfolio and renders responsively',
  ],
  [
    'social-metadata.spec.ts',
    'anonymous social cards cover public routes and disappear immediately when unpublished',
  ],
  [
    'visitor-role-boundaries.spec.ts',
    'visitor settings and designer role boundaries are enforced in the UI and API',
  ],
  // E-298: account-level onboarding draft — resume across leave/re-entry, resume
  // in a fresh browser context (proves it is account-level, not browser-local),
  // and mid-onboarding refresh recovery.
  [
    'onboarding-resume.spec.ts',
    'designer onboarding progress resumes across leave/re-entry, then completes and clears the draft',
  ],
  [
    'onboarding-resume.spec.ts',
    'same account resumes the draft in a FRESH browser context (account-level, not browser-local)',
  ],
  ['onboarding-resume.spec.ts', 'a refresh mid-onboarding preserves progress'],
  ['sign-in-modal.spec.ts', 'public sign-in opens over the current page and closes back to it'],
  ['sign-in-modal.spec.ts', 'designer sign-in opens in designer mode over the current page'],
  [
    'sign-in-modal.spec.ts',
    'a protected public navigation action opens sign-in over the current page',
  ],
  ['sign-in-modal.spec.ts', 'a direct login visit retains its standalone fallback'],
  [
    'sign-in-modal.spec.ts',
    'mobile designer directory keeps its content behind the sign-in dialog',
  ],
  [
    'sign-in-modal.spec.ts',
    'phone OTP in the dialog rejects a wrong code then completes visitor sign-in',
  ],
];

requiredEntries.push([
  'portfolio-publication.spec.ts',
  'custom cities can be typed, saved, reloaded, and removed on desktop and mobile',
]);

requiredEntries.push(
  ...[852, 516, 489, 390, 320].map((width): [string, string] => [
    'sign-in-modal.spec.ts',
    `sign-in fits ${width}px without shifting the page or reserving inactive form space`,
  ]),
  [
    'sign-in-modal.spec.ts',
    'a short mobile viewport scrolls only the dialog and preserves the underlying page position',
  ],
  ...[1512, 390].flatMap((width): [string, string][] => [
    [
      'login-scroll-lock.spec.ts',
      `scroll-revealed login locks the page until dismissal at ${width}px`,
    ],
    [
      'login-scroll-lock.spec.ts',
      `explicit login locks the page and restores scrolling at ${width}px`,
    ],
  ]),
  ['homepage-typography.spec.ts', 'homepage and sign-in use the measured Figma text styles'],
  [
    'homepage-typography.spec.ts',
    'a loaded display font reaches both the homepage and its portalled sign-in',
  ],
  ...[320, 390, 489].map((width): [string, string] => [
    'homepage-typography.spec.ts',
    `mobile sign-in retains readable typography and touch targets at ${width}px`,
  ]),
  [
    'company-pages.spec.ts',
    'every Company footer link opens its Markdown document with an honest publication status',
  ],
  ...[1512, 390, 320].map((width): [string, string] => [
    'company-pages.spec.ts',
    `policy sections stay readable and navigable at ${width}px`,
  ]),
  [
    'company-pages.spec.ts',
    'drafts expose official sources without inventing a reporting endpoint',
  ],
  [
    'company-pages.spec.ts',
    'reading login policies keeps entered authentication data in the original tab',
  ],
);

export const requiredTests = requiredEntries.map(([file, title]) => ({ file, title }));

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
