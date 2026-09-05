import { readFile } from 'node:fs/promises';
import { z } from 'zod';

// Fail closed on missing, skipped, flaky or failed journeys. A subset run is not readiness.
const expected = [
  'phone OTP',
  'email OTP',
  'Google authorization',
  'project moderation lifecycle',
  'verification lifecycle',
  'review lifecycle',
  'consultation lifecycle',
  'visitor onboarding and discovery',
  'designer onboarding and media processing',
  'invitation acceptance, role changes and studio switching',
  'studio workspaces isolate all business surfaces',
  'billing owner sees real payments',
];
const resultSchema = z.object({ suites: z.array(z.unknown()) });
const testSchema = z.object({
  title: z.string(),
  tests: z.array(
    z.object({ results: z.array(z.object({ status: z.string() })), status: z.string() }),
  ),
});
const suiteSchema: z.ZodType<{ suites?: unknown[]; specs?: unknown[] }> = z.object({
  suites: z.array(z.unknown()).optional(),
  specs: z.array(z.unknown()).optional(),
});
const report = resultSchema.parse(
  JSON.parse(await readFile('../test-results/e2e-results.json', 'utf8')),
);
const specs: z.infer<typeof testSchema>[] = [];
function visit(input: unknown) {
  const suite = suiteSchema.parse(input);
  for (const spec of suite.specs ?? []) specs.push(testSchema.parse(spec));
  for (const child of suite.suites ?? []) visit(child);
}
report.suites.forEach(visit);
const missing = expected.filter(
  (name) =>
    !specs.some(
      (spec) =>
        spec.title.includes(name) &&
        spec.tests.length > 0 &&
        spec.tests.every(
          (test) =>
            test.status === 'expected' &&
            test.results.length === 1 &&
            test.results[0]?.status === 'passed',
        ),
    ),
);
if (missing.length)
  throw new Error(`Critical journeys missing or not green: ${missing.join(', ')}`);
console.log(`All ${expected.length} critical journey groups executed and passed.`);
