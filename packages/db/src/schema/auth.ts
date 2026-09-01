import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  integer,
  check,
} from 'drizzle-orm/pg-core';
import {
  PLATFORM_ROLE,
  PLATFORM_ROLE_VALUES,
  type AccountStatus,
  type OrganizationMemberRole,
} from '@repo/contracts';

/**
 * better-auth tables (the committed source of truth).
 *
 * Property keys (camelCase) MUST match better-auth's model field names so the
 * drizzleAdapter can auto-discover them; DB column names are snake_cased via the
 * `casing: 'snake_case'` option on the drizzle client + drizzle-kit config.
 *
 * Plugin fields included:
 *   - phoneNumber plugin  -> user.phoneNumber / user.phoneNumberVerified
 *   - admin plugin        -> user.role / banned / banReason / banExpires, session.impersonatedBy
 *   - organization plugin -> organization/member/invitation + team/teamMember
 *                            + session active organization/team context
 *
 * App-owned extension: user.status (registered as a better-auth additionalField in
 * packages/auth/src/index.ts so it rides on the session user).
 *
 * Canonical source is `pnpm auth:generate` (npx @better-auth/cli generate). After
 * changing auth plugins/fields, regenerate, reconcile THIS file, then
 * `pnpm db:generate && pnpm db:migrate`.
 */

/** Account lifecycle. 'pending' until profile completion; 'suspended' reserved for Epic-3 bans. */
export type UserStatus = AccountStatus;

/** Platform authorization roles (E-86). Postgres enum order is part of the schema contract — append new roles, never reorder (pinned by role.test.ts). */
export const userRole = pgEnum('user_role', PLATFORM_ROLE_VALUES);

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  // phoneNumber plugin
  phoneNumber: text('phone_number').unique(),
  phoneNumberVerified: boolean('phone_number_verified'),
  // admin plugin
  role: userRole('role').default(PLATFORM_ROLE.VISITOR).notNull(),
  banned: boolean('banned').default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires'),
  // app-owned account lifecycle (see UserStatus). text + $type for zero generator drift.
  status: text('status').$type<UserStatus>().default('pending').notNull(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // admin plugin
    impersonatedBy: text('impersonated_by'),
    // organization plugin
    activeOrganizationId: text('active_organization_id'),
    activeTeamId: text('active_team_id'),
  },
  (t) => [index('session_userId_idx').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('account_userId_idx').on(t.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

// --- organization plugin (kept wired; Epic-3 RBAC builds on these — see plan note) ---
export const organization = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  createdAt: timestamp('created_at').notNull(),
  metadata: text('metadata'),
});

/** Better Auth team. Tickif exposes a team as a billing organization's branch. */
export const team = pgTable(
  'team',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    frozen: boolean('frozen').default(false).notNull(),
    frozenAt: timestamp('frozen_at'),
    freezeRank: integer('freeze_rank'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('team_organizationId_idx').on(t.organizationId),
    index('team_organizationId_frozen_idx').on(t.organizationId, t.frozen),
    uniqueIndex('team_organizationId_name_uniq').on(t.organizationId, sql`lower(${t.name})`),
    check(
      'team_freeze_state_check',
      sql`(${t.frozen} = false and ${t.frozenAt} is null and ${t.freezeRank} is null) or (${t.frozen} = true and ${t.frozenAt} is not null and ${t.freezeRank} > 0)`,
    ),
  ],
);

/** Better Auth team membership. Organization membership remains the billing/role boundary. */
export const teamMember = pgTable(
  'team_member',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('teamMember_teamId_idx').on(t.teamId),
    index('teamMember_userId_idx').on(t.userId),
    uniqueIndex('teamMember_teamId_userId_uniq').on(t.teamId, t.userId),
  ],
);

export const member = pgTable(
  'member',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').$type<OrganizationMemberRole>().default('member').notNull(),
    frozen: boolean('frozen').default(false).notNull(),
    frozenAt: timestamp('frozen_at'),
    freezeRank: integer('freeze_rank'),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    index('member_organizationId_idx').on(t.organizationId),
    index('member_userId_idx').on(t.userId),
    index('member_organizationId_frozen_idx').on(t.organizationId, t.frozen),
    uniqueIndex('member_one_owner_per_organization_uniq')
      .on(t.organizationId)
      .where(sql`${t.role} = 'owner'`),
    check(
      'member_role_check',
      sql`${t.role} in ('owner', 'admin', 'billing_admin', 'member', 'viewer')`,
    ),
    check(
      'member_freeze_state_check',
      sql`(${t.frozen} = false and ${t.frozenAt} is null and ${t.freezeRank} is null) or (${t.frozen} = true and ${t.frozenAt} is not null and ${t.freezeRank} > 0)`,
    ),
  ],
);

export const invitation = pgTable(
  'invitation',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role'),
    status: text('status').default('pending').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Better Auth may encode multiple invited team ids as a comma-separated value.
    teamId: text('team_id'),
  },
  (t) => [
    index('invitation_organizationId_idx').on(t.organizationId),
    index('invitation_inviterId_idx').on(t.inviterId),
    index('invitation_email_idx').on(t.email),
    index('invitation_teamId_idx').on(t.teamId),
    uniqueIndex('invitation_pending_organization_email_uniq')
      .on(t.organizationId, sql`lower(${t.email})`)
      .where(sql`${t.status} = 'pending'`),
  ],
);
