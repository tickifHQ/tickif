import { runBootstrapCli } from './bootstrap-cli-runner.js';

runBootstrapCli(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[search] Bootstrap failed: ${message}`);
  process.exitCode = 1;
});
