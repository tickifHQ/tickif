import { describe, expect, it } from 'vitest';
import { updatePersonalAccountSchema } from '../src/personal-account';

describe('updatePersonalAccountSchema', () => {
  const input = {
    name: '  Personal Name  ',
    address: null,
    whatsappNumber: null,
    revision: 'a'.repeat(64),
  };
  it('normalizes the personal name and allows clearing optional preferences', () => {
    expect(updatePersonalAccountSchema.parse(input)).toEqual({ ...input, name: 'Personal Name' });
  });
  it.each([
    'role',
    'status',
    'organizationId',
    'userId',
    'email',
    'emailVerified',
    'phoneNumber',
    'phoneNumberVerified',
  ])('rejects privileged/identity field %s', (field) => {
    expect(updatePersonalAccountSchema.safeParse({ ...input, [field]: 'anything' }).success).toBe(
      false,
    );
  });
  it('requires a valid revision and validates normalized values', () => {
    expect(updatePersonalAccountSchema.safeParse({ ...input, revision: undefined }).success).toBe(
      false,
    );
    expect(updatePersonalAccountSchema.safeParse({ ...input, name: '  ' }).success).toBe(false);
    expect(
      updatePersonalAccountSchema.safeParse({ ...input, whatsappNumber: '9876543210' }).success,
    ).toBe(false);
  });
});
