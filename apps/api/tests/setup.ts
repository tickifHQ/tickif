import { beforeEach } from 'vitest';
import { truncateAll } from '@repo/db/testing';

// Each integration test starts from a clean (but migrated) database.
beforeEach(async () => {
  await truncateAll();
});
