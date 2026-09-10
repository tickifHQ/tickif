import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { team, teamMember } from '../src/schema/auth.js';

describe('Better Auth organization team upgrade', () => {
  it('provides the required seat counter without rejecting existing teams', () => {
    const counter = getTableConfig(team).columns.find((column) => column.name === 'member_count');

    expect(counter).toBeDefined();
    expect(counter?.dataType).toBe('number');
    expect(counter?.notNull).toBe(true);
    expect(counter?.default).toBe(0);
  });

  it('accepts legacy memberships while enforcing uniqueness for new auth membership keys', () => {
    const key = getTableConfig(teamMember).columns.find(
      (column) => column.name === 'membership_key',
    );

    expect(key).toBeDefined();
    expect(key?.dataType).toBe('string');
    expect(key?.notNull).toBe(false);
    expect(key?.isUnique).toBe(true);
    expect(getTableConfig(teamMember).indexes.map((index) => index.config.name)).toContain(
      'teamMember_teamId_userId_uniq',
    );
  });
});
