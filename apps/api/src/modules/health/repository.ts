import { closeDatabase, isDatabaseReady } from '@repo/db';

export async function postgresIsReady(): Promise<boolean> {
  return isDatabaseReady();
}

export async function closePostgres(): Promise<void> {
  await closeDatabase();
}
