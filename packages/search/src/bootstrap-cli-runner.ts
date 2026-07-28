import { bootstrapSearch } from './bootstrap.js';

type Bootstrap = typeof bootstrapSearch;

export async function runBootstrapCli(
  args: string[],
  dependencies: {
    bootstrap?: Bootstrap;
    log?: (message: string) => void;
  } = {},
): Promise<void> {
  const check = args.includes('--check');
  const applyUpdates = args.includes('--apply-updates');
  if (check && applyUpdates) {
    throw new Error('--check and --apply-updates cannot be used together');
  }

  const result = await (dependencies.bootstrap ?? bootstrapSearch)({
    applyUpdates,
    check,
  });
  const log = dependencies.log ?? console.log;
  if (check) {
    log('[search] Typesense collections match checked-in configuration');
    return;
  }

  log(
    `[search] Bootstrap complete: ${result.createdCollections.length} collections created, ${result.updatedCollections.length} collections updated, ${result.createdAliases.length} aliases created, synonym set ${result.updatedSynonymSet ? 'updated' : 'unchanged'}`,
  );
}
