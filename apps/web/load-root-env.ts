import path from 'node:path';
import { loadEnvConfig } from '@next/env';

/**
 * Next.js only reads .env files from the app directory (apps/web), but this
 * repo keeps its single .env at the monorepo root (see .env.example). Load it
 * before src/env.ts validates, so configured NEXT_PUBLIC_* values actually
 * reach the build and dev server. Vars already set in the shell win.
 *
 * forceReload is required: Next sets __NEXT_PROCESSED_ENV=true after its own
 * (app-dir) env pass, which makes a plain loadEnvConfig call a silent no-op.
 *
 * next dev/build always run with cwd = apps/web (package.json scripts).
 */
loadEnvConfig(
  path.resolve(process.cwd(), '../..'),
  process.env.NODE_ENV !== 'production',
  console,
  true,
);
