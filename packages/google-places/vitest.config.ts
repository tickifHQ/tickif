import { nodePreset } from '@repo/vitest-config/node';

// The client reads GOOGLE_PLACES_API_KEY from config; a dummy key is enough since
// tests stub global fetch and never hit the network.
export default nodePreset({
  env: {
    GOOGLE_PLACES_API_KEY: 'test-places-key',
  },
});
