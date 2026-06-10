import { describe, it, expect } from 'vitest';
import { schema } from '@repo/db';

describe('user_role enum (E-86)', () => {
  it('is exactly the four platform roles in order', () => {
    expect(schema.userRole.enumValues).toEqual([
      'visitor',
      'designer',
      'admin',
      'superadmin',
    ]);
  });
});
