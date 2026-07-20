import { bootstrapSearch } from './bootstrap.js';

const check = process.argv.slice(2).includes('--check');
const result = await bootstrapSearch({ check });

if (check) {
  console.log('[search] settings match checked-in configuration');
} else {
  console.log(
    `[search] bootstrap complete: ${result.createdIndexes.length} created, ${result.updatedIndexes.length} updated`,
  );
}
