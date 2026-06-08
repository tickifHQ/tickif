import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Transpile workspace packages consumed directly as TS source.
  transpilePackages: ['@repo/contracts', '@repo/ui'],
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
