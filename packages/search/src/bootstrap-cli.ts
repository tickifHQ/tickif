import { bootstrapSearch } from './bootstrap.js';

const check = process.argv.slice(2).includes('--check');
const applyUpdates = process.argv.slice(2).includes('--apply-updates');
const result = await bootstrapSearch({ applyUpdates, check });

if (check) {
  console.log('[search] Typesense collections match checked-in configuration');
} else {
  console.log(
    `[search] bootstrap complete: ${result.createdCollections.length} collections created, ${result.updatedCollections.length} collections updated, ${result.createdAliases.length} aliases created, synonym set ${result.updatedSynonymSet ? 'updated' : 'unchanged'}`,
  );
}
