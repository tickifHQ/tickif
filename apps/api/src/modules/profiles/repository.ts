import { db, schema, eq } from '@repo/db';

/**
 * Data-access for profiles. Joins designer_profile + user to build the
 * full profile view. This is the ONLY layer that imports Drizzle.
 */

export type ProfileRecord = {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  bio: string | null;
  studioName: string;
  citySlug: string | null;
  isVerified: boolean;
  role: string | null;
  createdAt: Date;
};

export type ProfileUpdateData = {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  studioName?: string;
  citySlug?: string;
};

export const profilesRepository = {
  /**
   * Find a profile by designer_profile.id, joining user data.
   */
  async findById(id: string): Promise<ProfileRecord | null> {
    const [row] = await db
      .select({
        id: schema.designerProfile.id,
        userId: schema.designerProfile.userId,
        displayName: schema.user.name,
        email: schema.user.email,
        phone: schema.user.phoneNumber,
        avatarUrl: schema.user.image,
        bio: schema.designerProfile.bio,
        studioName: schema.designerProfile.studioName,
        citySlug: schema.designerProfile.citySlug,
        isVerified: schema.designerProfile.isVerified,
        role: schema.user.role,
        createdAt: schema.designerProfile.createdAt,
      })
      .from(schema.designerProfile)
      .innerJoin(schema.user, eq(schema.designerProfile.userId, schema.user.id))
      .where(eq(schema.designerProfile.id, id))
      .limit(1);
    return row ?? null;
  },

  /**
   * Find a profile by the owning user's id.
   */
  async findByUserId(userId: string): Promise<ProfileRecord | null> {
    const [row] = await db
      .select({
        id: schema.designerProfile.id,
        userId: schema.designerProfile.userId,
        displayName: schema.user.name,
        email: schema.user.email,
        phone: schema.user.phoneNumber,
        avatarUrl: schema.user.image,
        bio: schema.designerProfile.bio,
        studioName: schema.designerProfile.studioName,
        citySlug: schema.designerProfile.citySlug,
        isVerified: schema.designerProfile.isVerified,
        role: schema.user.role,
        createdAt: schema.designerProfile.createdAt,
      })
      .from(schema.designerProfile)
      .innerJoin(schema.user, eq(schema.designerProfile.userId, schema.user.id))
      .where(eq(schema.designerProfile.userId, userId))
      .limit(1);
    return row ?? null;
  },

  /**
   * Update profile fields. Splits updates across user + designer_profile tables.
   */
  async updateByUserId(userId: string, data: ProfileUpdateData): Promise<void> {
    const userUpdates: Record<string, string> = {};
    const profileUpdates: Record<string, string> = {};

    if (data.displayName !== undefined) userUpdates.name = data.displayName;
    if (data.avatarUrl !== undefined) userUpdates.image = data.avatarUrl;
    if (data.bio !== undefined) profileUpdates.bio = data.bio;
    if (data.studioName !== undefined) profileUpdates.studioName = data.studioName;
    if (data.citySlug !== undefined) profileUpdates.citySlug = data.citySlug;

    const promises: Promise<unknown>[] = [];

    if (Object.keys(userUpdates).length > 0) {
      promises.push(
        db
          .update(schema.user)
          .set(userUpdates)
          .where(eq(schema.user.id, userId)),
      );
    }

    if (Object.keys(profileUpdates).length > 0) {
      promises.push(
        db
          .update(schema.designerProfile)
          .set(profileUpdates)
          .where(eq(schema.designerProfile.userId, userId)),
      );
    }

    await Promise.all(promises);
  },
};
