import { beforeEach } from 'vitest';
import { truncateAll } from '@repo/db/testing';

beforeEach(async () => {
  await truncateAll();
});
