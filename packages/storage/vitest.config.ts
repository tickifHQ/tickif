import { nodePreset } from '@repo/vitest-config/node';

// getSignedUrl signs locally (no network), so dummy R2 creds are enough to exercise presign.
export default nodePreset({
  env: {
    R2_ENDPOINT: 'http://localhost:9000',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
    R2_BUCKET: 'test-bucket',
  },
});
