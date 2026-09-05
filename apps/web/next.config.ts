import type { NextConfig } from 'next';
import path from 'node:path';
// Import order matters: load the monorepo-root .env first, then validate.
// ESM evaluates static imports in declaration order.
import './load-root-env';
// Validate env vars at build time — fails fast on bad values.
import './src/env';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  // Transpile workspace packages consumed directly as TS source.
  transpilePackages: ['@repo/contracts', '@repo/ui'],
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
