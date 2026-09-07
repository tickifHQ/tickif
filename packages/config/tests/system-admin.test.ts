import { expect, it } from 'vitest';
import { parseConfig } from '../src/index.js';

const environment = {
  NODE_ENV: 'test',
  BETTER_AUTH_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'test-only-secret-0000000000000000',
};

it('requires a valid explicit email and normalizes its case', () => {
  expect(parseConfig(environment).SYSTEM_ADMIN_EMAIL).toBeUndefined();
  expect(
    parseConfig({ ...environment, SYSTEM_ADMIN_EMAIL: '' }).SYSTEM_ADMIN_EMAIL,
  ).toBeUndefined();
  expect(
    parseConfig({ ...environment, SYSTEM_ADMIN_EMAIL: 'Admin@example.com' }).SYSTEM_ADMIN_EMAIL,
  ).toBe('admin@example.com');
  expect(() => parseConfig({ ...environment, SYSTEM_ADMIN_EMAIL: 'not-an-email' })).toThrow();
});
