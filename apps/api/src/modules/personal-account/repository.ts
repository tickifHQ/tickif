import { createHash } from 'node:crypto';
import { and, db, eq, schema, sql } from '@repo/db';
import type { PersonalAccount, UpdatePersonalAccountInput } from '@repo/contracts';

export type PersonalAccountResult =
  { kind: 'ok'; account: PersonalAccount } | { kind: 'forbidden' | 'conflict' };

/** Both reads and writes recheck live scope/lifecycle within the same transaction. */
async function access(
  userId: string,
  sessionId: string,
  input?: UpdatePersonalAccountInput,
): Promise<PersonalAccountResult> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select({
        organizationId: schema.session.activeOrganizationId,
        teamId: schema.session.activeTeamId,
        expiresAt: schema.session.expiresAt,
      })
      .from(schema.session)
      .where(and(eq(schema.session.id, sessionId), eq(schema.session.userId, userId)))
      .for('update');
    if (!session || session.organizationId || session.teamId || session.expiresAt <= new Date()) {
      return { kind: 'forbidden' };
    }
    const [user] = await tx
      .select({
        name: schema.user.name,
        email: schema.user.email,
        emailVerified: schema.user.emailVerified,
        phoneNumber: schema.user.phoneNumber,
        phoneNumberVerified: schema.user.phoneNumberVerified,
        role: schema.user.role,
        status: schema.user.status,
        banned: schema.user.banned,
        banExpires: schema.user.banExpires,
        // PostgreSQL's full timestamp precision must survive round trips through JavaScript.
        version: sql<string>`${schema.user.updatedAt}::text`,
      })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .for('update');
    if (
      !user ||
      !['visitor', 'designer'].includes(user.role) ||
      user.status !== 'active' ||
      (user.banned && (!user.banExpires || user.banExpires > new Date()))
    ) {
      return { kind: 'forbidden' };
    }
    const [profile] = await tx
      .select({
        address: schema.visitorProfile.address,
        whatsappNumber: schema.visitorProfile.whatsappNumber,
        version: sql<string>`${schema.visitorProfile.updatedAt}::text`,
      })
      .from(schema.visitorProfile)
      .where(eq(schema.visitorProfile.userId, userId))
      .for('update');

    const account = {
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      phoneNumber: user.phoneNumber,
      phoneNumberVerified: user.phoneNumberVerified ?? false,
      address: profile?.address ?? null,
      whatsappNumber: profile?.whatsappNumber ?? null,
    };
    const revision = createHash('sha256')
      .update(JSON.stringify([userId, account, user.version, profile?.version ?? null]))
      .digest('hex');
    if (!input) return { kind: 'ok', account: { ...account, revision } };
    if (input.revision !== revision) return { kind: 'conflict' };

    // Use the database clock so even consecutive saves in the same JS millisecond advance.
    await tx
      .update(schema.user)
      .set({ name: input.name, updatedAt: sql`clock_timestamp()` })
      .where(eq(schema.user.id, userId));
    await tx
      .insert(schema.visitorProfile)
      .values({
        userId,
        address: input.address,
        whatsappNumber: input.whatsappNumber,
        updatedAt: sql`clock_timestamp()`,
      })
      .onConflictDoUpdate({
        target: schema.visitorProfile.userId,
        set: {
          address: input.address,
          whatsappNumber: input.whatsappNumber,
          updatedAt: sql`clock_timestamp()`,
        },
      });
    const [updatedUser] = await tx
      .select({ version: sql<string>`${schema.user.updatedAt}::text` })
      .from(schema.user)
      .where(eq(schema.user.id, userId));
    const [updatedProfile] = await tx
      .select({ version: sql<string>`${schema.visitorProfile.updatedAt}::text` })
      .from(schema.visitorProfile)
      .where(eq(schema.visitorProfile.userId, userId));
    const saved = {
      ...account,
      name: input.name,
      address: input.address,
      whatsappNumber: input.whatsappNumber,
    };
    return {
      kind: 'ok',
      account: {
        ...saved,
        revision: createHash('sha256')
          .update(JSON.stringify([userId, saved, updatedUser?.version, updatedProfile?.version]))
          .digest('hex'),
      },
    };
  });
}

export const personalAccountRepository = { access };
