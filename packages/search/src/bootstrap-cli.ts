import { pathToFileURL } from 'node:url';
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
  (dependencies.log ?? console.log)(`[search] Bootstrap complete: ${JSON.stringify(result)}`);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  runBootstrapCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[search] Bootstrap failed: ${message}`);
    process.exitCode = 1;
  });
}
