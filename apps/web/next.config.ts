import type { NextConfig } from 'next';
// Validate env vars at build time — fails fast on bad or missing values.
import './src/env';

const nextConfig: NextConfig = {
  // Transpile workspace packages consumed directly as TS source.
  transpilePackages: ['@repo/contracts', '@repo/ui'],
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
