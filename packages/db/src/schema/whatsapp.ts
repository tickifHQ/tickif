import { pgTable, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { user } from './auth.js';

/** A challenge becomes a short-lived, single-use proof after verification. */
export const whatsappChallenge = pgTable(
  'whatsapp_challenge',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    target: text('target').notNull(),
    phoneNumber: text('phone_number').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
    verifiedAt: timestamp('verified_at'),
    consumedAt: timestamp('consumed_at'),
  },
  (t) => [
    index('whatsapp_challenge_user_created_idx').on(t.userId, t.createdAt),
    index('whatsapp_challenge_expiry_idx').on(t.expiresAt),
  ],
);
