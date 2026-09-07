import { config } from '@repo/config';
import { systemAdminRepository } from './repository.js';

export async function seedSystemAdmin(): Promise<void> {
  if (!config.SYSTEM_ADMIN_EMAIL) return;
  await systemAdminRepository.seed(config.SYSTEM_ADMIN_EMAIL);
}
