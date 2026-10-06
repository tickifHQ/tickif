import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cleanup from './scroll-gate-evidence-cleanup';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'apps/web');
const route = path.join(web, 'app/scroll-gate-evidence');
// This synthetic route exists only while the component evidence server runs.
const fixture = path.join(root, 'e2e/visual/scroll-gate-page.tsx.fixture');
const page = path.join(route, 'page.tsx');
if (
  existsSync(route) &&
  (!existsSync(page) || readFileSync(page, 'utf8') !== readFileSync(fixture, 'utf8'))
) {
  throw new Error(`Refusing to overwrite existing route: ${route}`);
}
mkdirSync(route, { recursive: true });
copyFileSync(fixture, page);
const require = createRequire(path.join(web, 'package.json'));
const child = spawn(
  process.execPath,
  [require.resolve('next/dist/bin/next'), 'dev', '--port', '3118'],
  {
    cwd: web,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, NEXT_PUBLIC_SCROLL_GATE_LIMIT: '1' },
  },
);

process.on('exit', cleanup);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    child.kill(signal);
    cleanup();
    process.exit(0);
  });
}
child.on('exit', (code) => {
  cleanup();
  process.exit(code ?? 1);
});
