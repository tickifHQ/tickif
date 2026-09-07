import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('@repo/config', () => ({ config: { SYSTEM_ADMIN_EMAIL: undefined } }));
vi.mock('../../../src/modules/system-admin/repository.js', () => ({
  systemAdminRepository: { seed: vi.fn() },
}));
import { config } from '@repo/config';
import { systemAdminRepository } from '../../../src/modules/system-admin/repository.js';
import { seedSystemAdmin } from '../../../src/modules/system-admin/service.js';

beforeEach(() => {
  vi.clearAllMocks();
  config.SYSTEM_ADMIN_EMAIL = undefined;
});

it('does not provision an account without operator configuration', async () => {
  await seedSystemAdmin();
  expect(systemAdminRepository.seed).not.toHaveBeenCalled();
});

it('fails startup when configured provisioning fails', async () => {
  config.SYSTEM_ADMIN_EMAIL = 'admin@example.com';
  vi.mocked(systemAdminRepository.seed).mockRejectedValueOnce(new Error('database unavailable'));
  await expect(seedSystemAdmin()).rejects.toThrow('database unavailable');
});
