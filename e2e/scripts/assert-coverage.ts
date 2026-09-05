import { readFile } from 'node:fs/promises';
import { assertCompleteCoverage, requiredTests } from './coverage.js';

const report = JSON.parse(await readFile('../test-results/e2e-results.json', 'utf8')) as unknown;
assertCompleteCoverage(report);
console.log(`All ${requiredTests.length} critical E2E tests executed exactly once and passed.`);
