import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { visitorProfile } from '../src/schema/domain.js';

describe('visitor profile schema', () => {
  const config = getTableConfig(visitorProfile);

  it('uses the user foreign key as the one-to-one primary key', () => {
    const userId = config.columns.find((column) => column.name === 'user_id');
    const userForeignKey = config.foreignKeys.find((foreignKey) =>
      foreignKey.reference().columns.some((column) => column.name === 'user_id'),
    );

    expect(userId).toMatchObject({ primary: true, notNull: true });
    expect(userForeignKey?.onDelete).toBe('cascade');
  });

  it('constrains address length and WhatsApp E.164 formatting at the database boundary', () => {
    expect(config.checks.map((tableCheck) => tableCheck.name)).toEqual([
      'visitor_profile_address_length_check',
      'visitor_profile_whatsapp_e164_check',
    ]);
  });

  it('uses timezone-aware lifecycle timestamps', () => {
    const timestamps = config.columns.filter((column) =>
      ['onboarding_completed_at', 'created_at', 'updated_at'].includes(column.name),
    );

    expect(timestamps).toHaveLength(3);
    expect(timestamps.every((column) => column.columnType === 'PgTimestamp')).toBe(true);
    expect(timestamps.every((column) => 'withTimezone' in column && column.withTimezone)).toBe(
      true,
    );
    expect(
      timestamps.find((column) => column.name === 'onboarding_completed_at')?.notNull,
    ).toBe(false);
  });
});
