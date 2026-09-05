import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { apiUrl, webUrl, environment } from '../lib/environment.js';

// Preparation completes before the API/web readiness probes can hit an unmigrated schema.
await import('./prepare.js');
const require = createRequire(import.meta.url);
const children: ChildProcess[] = [];
let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 1000).unref();
}
function start(args: string[], cwd: string, extra: NodeJS.ProcessEnv = {}) {
  const child = spawn(process.execPath, args, { cwd, env: { ...environment, ...extra }, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.once('error', (error) => { console.error(error.message); shutdown(1); });
  child.once('exit', (code) => { if (!stopping) shutdown(code || 1); });
  return child;
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => shutdown());
start(['--import', require.resolve('tsx'), 'scripts/start-api.ts'], resolve('.'), { PORT: new URL(apiUrl).port });
start(['dist/index.js'], resolve('../apps/worker'));
const nextRequire = createRequire(resolve('../apps/web/package.json'));
start([nextRequire.resolve('next/dist/bin/next'), 'dev', '--port', new URL(webUrl).port], resolve('../apps/web'), { NODE_ENV: 'development' });
