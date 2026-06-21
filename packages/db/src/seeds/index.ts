/**
 * Seed runner — executes all seed modules in dependency order.
 * Run: pnpm db:seed
 */

import { seedTaxonomy } from './taxonomy.js';

async function main() {
  console.log('[seed] Starting...\n');
  await seedTaxonomy();
  console.log('\n[seed] Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] FAILED:', err);
  process.exit(1);
});
