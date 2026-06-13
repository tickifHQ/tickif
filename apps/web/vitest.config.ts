import path from 'node:path';
import { reactPreset } from '@repo/vitest-config/react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  ...reactPreset(),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
