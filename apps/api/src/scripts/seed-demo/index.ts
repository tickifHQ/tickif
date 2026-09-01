/**
 * Demo seed: 2 designers × 2 published projects × 4 real images each, with the
 * images processed by the REAL media pipeline. The script plays the client + API
 * role of the upload flow (PUT original to R2, insert `processing` row, enqueue
 * the media job — same effects as media/service.ts createUploadUrl + commitUpload);
 * the running worker generates derivatives and flips rows to `ready`.
 *
 * Run: `pnpm db:seed:demo` (add `--force` to wipe and reseed the demo projects).
 *
 * Requires (see docker-compose.yml + docs/getting-started.md):
 *   - Postgres  (DATABASE_URL / POSTGRES_*)
 *   - MinIO/R2  (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)
 *   - Redis     (REDIS_URL, defaults to redis://localhost:6379)
 *   - the media worker running (`pnpm --filter @repo/worker dev`) — without it,
 *     jobs stay queued and images remain `processing` until the worker starts.
 *   - BETTER_AUTH_SECRET / BETTER_AUTH_URL — required by @repo/config validation
 *     even though this script never touches auth.
 *
 * Idempotent: all ids are fixed constants (see data.ts). A re-run skips projects
 * whose images are all `ready`; `--force` deletes their rows + R2 objects +
 * stale queue jobs and reseeds from scratch.
 *
 * Fixture images are downloaded from Unsplash on first run and cached under
 * apps/api/fixtures/seed-demo/ (gitignored) — see the README there for sources.
 */

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { Queue } from 'bullmq';
import { HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { config } from '@repo/config';
import { db, schema, eq } from '@repo/db';
import { inArray } from 'drizzle-orm';
import { seedTaxonomy } from '@repo/db/seeds/taxonomy';
import { buildOriginalKey, deleteObject, putObject, r2Client } from '@repo/storage';
import { connection, enqueueMedia, closeQueues, QUEUES } from '@repo/queue';
import {
  SEED_DESIGNERS,
  type SeedDesignerSpec,
  type SeedImageSpec,
  type SeedProjectSpec,
} from './data.js';

const FIXTURES_DIR = new URL('../../../fixtures/seed-demo/', import.meta.url);
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 180_000;

type TaxonomyMap = Map<string, { id: string; label: string }>;

function taxKey(kind: string, slug: string): string {
  return `${kind}:${slug}`;
}

/** MinIO (docker-compose) doesn't auto-create the bucket; real R2 must already have it. */
async function ensureBucket(): Promise<void> {
  const bucket = config.R2_BUCKET;
  if (!bucket) throw new Error('R2_BUCKET is required for the demo seed');
  try {
    await r2Client().send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch {
    const endpoint = config.R2_ENDPOINT ?? '';
    const isLocal = /localhost|127\.0\.0\.1|minio/.test(endpoint);
    if (!isLocal) {
      throw new Error(
        `Bucket '${bucket}' not reachable at ${endpoint || 'R2'} — create it first (see docs/getting-started.md)`,
      );
    }
    console.log(`[seed-demo] creating local bucket '${bucket}'...`);
    await r2Client().send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

/** Download any missing fixture JPEGs from Unsplash into the (gitignored) cache dir. */
async function ensureFixtures(specs: SeedDesignerSpec[]): Promise<void> {
  await mkdir(FIXTURES_DIR, { recursive: true });
  const images = specs.flatMap((d) => d.projects.flatMap((p) => p.images));
  const missing: SeedImageSpec[] = [];
  for (const image of images) {
    try {
      await access(new URL(image.file, FIXTURES_DIR));
    } catch {
      missing.push(image);
    }
  }
  if (missing.length === 0) return;

  console.log(`[seed-demo] downloading ${missing.length} fixture image(s) from Unsplash (cached for later runs)...`);
  for (const image of missing) {
    // Same params the originals were committed with (see fixtures/seed-demo/README.md).
    const url = `https://images.unsplash.com/photo-${image.unsplashId}?w=1600&q=78&fm=jpg&fit=max`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fixture download failed (HTTP ${res.status}) for ${image.file}: ${url}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new Error(`fixture download for ${image.file} is not a JPEG: ${url}`);
    }
    await writeFile(new URL(image.file, FIXTURES_DIR), bytes);
    console.log(`[seed-demo]   downloaded ${image.file} (${Math.round(bytes.length / 1024)} kB)`);
  }
}

/** Resolve every taxonomy (kind, slug) the matrix references; hard-fail listing gaps. */
async function resolveTaxonomy(specs: SeedDesignerSpec[]): Promise<TaxonomyMap> {
  const wanted = new Set<string>();
  for (const designer of specs) {
    for (const f of designer.footprint) wanted.add(taxKey(f.kind, f.slug));
    for (const project of designer.projects) {
      for (const slug of project.roomSlugs) wanted.add(taxKey('room', slug));
      for (const image of project.images) {
        for (const slug of image.themeSlugs) wanted.add(taxKey('theme', slug));
        for (const slug of image.materialSlugs) wanted.add(taxKey('material', slug));
        for (const slug of image.finishSlugs) wanted.add(taxKey('finish', slug));
      }
    }
  }

  const slugs = [...new Set([...wanted].map((key) => key.split(':')[1]!))];
  const rows = await db
    .select({
      id: schema.taxonomy.id,
      kind: schema.taxonomy.kind,
      slug: schema.taxonomy.slug,
      label: schema.taxonomy.label,
    })
    .from(schema.taxonomy)
    .where(inArray(schema.taxonomy.slug, slugs));

  const map: TaxonomyMap = new Map();
  for (const row of rows) map.set(taxKey(row.kind, row.slug), { id: row.id, label: row.label });

  const missing = [...wanted].filter((key) => !map.has(key));
  if (missing.length > 0) {
    throw new Error(`Missing taxonomy terms (run pnpm db:seed first): ${missing.join(', ')}`);
  }
  return map;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function upsertFootprint(
  tx: Tx,
  profileId: string,
  spec: SeedDesignerSpec,
  tax: TaxonomyMap,
): Promise<void> {
  const rows = spec.footprint.map((f) => ({
    profileId,
    taxonomyId: tax.get(taxKey(f.kind, f.slug))!.id,
  }));
  if (rows.length > 0) {
    await tx.insert(schema.designerProfileFootprint).values(rows).onConflictDoNothing();
  }
}

/** Mirror of the onboarding transaction (profiles/repository.ts onboard). */
async function upsertDesigner(spec: SeedDesignerSpec, tax: TaxonomyMap): Promise<string> {
  return await db.transaction(async (tx) => {
    // Reuse a user that already signed in with this phone (dev OTP) instead of colliding.
    const [existingUser] = await tx
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.phoneNumber, spec.phone))
      .limit(1);
    const userId = existingUser?.id ?? spec.userId;

    if (!existingUser) {
      await tx
        .insert(schema.user)
        .values({
          id: userId,
          name: spec.name,
          email: spec.email,
          phoneNumber: spec.phone,
          phoneNumberVerified: true,
          role: 'designer',
          status: 'active',
        })
        .onConflictDoNothing({ target: schema.user.id });
    }
    await tx
      .update(schema.user)
      .set({ role: 'designer', status: 'active' })
      .where(eq(schema.user.id, userId));

    // designer_profile has a partial unique index on userId; if this user already
    // onboarded for real (own org + profile), attach the demo projects to that
    // profile instead of inserting a second one and aborting on the index.
    const [ownedProfile] = await tx
      .select({ id: schema.designerProfile.id, orgId: schema.designerProfile.orgId })
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.userId, userId))
      .limit(1);
    if (ownedProfile && ownedProfile.orgId !== spec.orgId) {
      console.warn(
        `[seed-demo] ${spec.phone} already has a designer profile (org ${ownedProfile.orgId}) — ` +
          `reusing it instead of creating '${spec.orgName}'`,
      );
      await upsertFootprint(tx, ownedProfile.id, spec, tax);
      return ownedProfile.id;
    }

    await tx
      .insert(schema.organization)
      .values({ id: spec.orgId, name: spec.orgName, slug: spec.orgSlug, createdAt: new Date() })
      .onConflictDoUpdate({
        target: schema.organization.id,
        set: { name: spec.orgName, slug: spec.orgSlug },
      });

    await tx
      .insert(schema.member)
      .values({
        id: spec.memberId,
        organizationId: spec.orgId,
        userId,
        role: 'owner',
        createdAt: new Date(),
      })
      .onConflictDoNothing({ target: schema.member.id });

    const teamId = `branch-${spec.orgId}`;
    await tx
      .insert(schema.team)
      .values({
        id: teamId,
        organizationId: spec.orgId,
        name: spec.displayName,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.team.id,
        set: { name: spec.displayName, updatedAt: new Date() },
      });
    await tx
      .insert(schema.teamMember)
      .values({
        id: `team-member-${spec.memberId}`,
        teamId,
        userId,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    const [profile] = await tx
      .insert(schema.designerProfile)
      .values({
        orgId: spec.orgId,
        teamId,
        userId,
        displayName: spec.displayName,
        slug: spec.orgSlug,
        entityType: spec.entityType,
        bio: spec.bio,
        status: 'active',
        yearsExperience: spec.yearsExperience,
        projectCount: spec.projects.length,
        phone: spec.phone,
        instagramHandle: spec.instagramHandle,
        foundedYear: spec.foundedYear,
        staffCount: spec.staffCount,
      })
      .onConflictDoUpdate({
        target: schema.designerProfile.teamId,
        set: {
          userId,
          displayName: spec.displayName,
          entityType: spec.entityType,
          bio: spec.bio,
          status: 'active',
          yearsExperience: spec.yearsExperience,
          projectCount: spec.projects.length,
          phone: spec.phone,
          instagramHandle: spec.instagramHandle,
          foundedYear: spec.foundedYear,
          staffCount: spec.staffCount,
          updatedAt: new Date(),
        },
      })
      .returning({ id: schema.designerProfile.id });
    if (!profile) throw new Error(`profile upsert returned no row for ${spec.orgSlug}`);

    await upsertFootprint(tx, profile.id, spec, tax);

    return profile.id;
  });
}

/** Delete a demo project's R2 objects, stale queue jobs and rows so it can reseed cleanly. */
async function cleanupProject(projectId: string): Promise<void> {
  const images = await db
    .select({
      id: schema.projectImage.id,
      originalKey: schema.projectImage.originalKey,
      derivatives: schema.projectImage.derivatives,
    })
    .from(schema.projectImage)
    .where(eq(schema.projectImage.projectId, projectId));

  for (const image of images) {
    const keys = [image.originalKey, ...image.derivatives.map((d) => d.key)];
    for (const key of keys) {
      await deleteObject(key).catch((err: unknown) =>
        console.warn(`[seed-demo] could not delete ${key}:`, err),
      );
    }
  }

  // A retained failed/queued job with the same deterministic jobId would block re-enqueue.
  if (images.length > 0) {
    const mediaQueue = new Queue(QUEUES.media, { connection });
    try {
      for (const image of images) await mediaQueue.remove(`media-${image.id}`);
    } finally {
      await mediaQueue.close();
    }
  }

  await db.delete(schema.project).where(eq(schema.project.id, projectId));
}

/** Seed one project; returns the image ids enqueued for processing (empty when skipped). */
async function seedProject(
  designerId: string,
  spec: SeedProjectSpec,
  tax: TaxonomyMap,
  force: boolean,
): Promise<string[]> {
  // Key the skip/cleanup decision on the project row, not the image rows: a run
  // that crashed after inserting the project (and its rooms) but before any image
  // must still be cleaned up, or re-runs would stack duplicate projectRoom rows.
  const [existingProject] = await db
    .select({ id: schema.project.id })
    .from(schema.project)
    .where(eq(schema.project.id, spec.id))
    .limit(1);
  const existing = await db
    .select({ id: schema.projectImage.id, status: schema.projectImage.status })
    .from(schema.projectImage)
    .where(eq(schema.projectImage.projectId, spec.id));

  const allReady =
    existingProject !== undefined &&
    existing.length === spec.images.length &&
    existing.every((row) => row.status === 'ready');
  if (allReady && !force) {
    console.log(`[seed-demo] '${spec.slug}' already seeded — skipping (use --force to reseed)`);
    return [];
  }
  if (existingProject || force) {
    console.log(`[seed-demo] '${spec.slug}' incomplete or --force — cleaning up before reseed`);
    await cleanupProject(spec.id);
  }

  const now = new Date();
  await db
    .insert(schema.project)
    .values({
      id: spec.id,
      designerId,
      title: spec.title,
      slug: spec.slug,
      description: spec.description,
      status: 'published',
      propertyTypeSlug: spec.propertyTypeSlug,
      propertySubtypeSlug: spec.propertySubtypeSlug,
      scopeSlug: spec.scopeSlug,
      bhkSlug: spec.bhkSlug,
      sizeSqft: spec.sizeSqft,
      citySlug: spec.citySlug,
      localitySlug: spec.localitySlug,
      budgetBandSlug: spec.budgetBandSlug,
      completedMonth: spec.completedMonth,
      durationMonths: spec.durationMonths,
      metadata: { seeded: true },
      submittedAt: now,
      publishedAt: now,
    });

  const roomIdBySlug = new Map<string, string>();
  for (const [index, roomSlug] of spec.roomSlugs.entries()) {
    const term = tax.get(taxKey('room', roomSlug))!;
    const [room] = await db
      .insert(schema.projectRoom)
      .values({ projectId: spec.id, roomTypeId: term.id, name: term.label, sortOrder: index })
      .returning({ id: schema.projectRoom.id });
    roomIdBySlug.set(roomSlug, room!.id);
  }

  // Same effects as the real upload flow: mint `processing` row + PUT original + enqueue.
  for (const image of spec.images) {
    const bytes = await readFile(new URL(image.file, FIXTURES_DIR));
    const originalKey = buildOriginalKey(spec.id);
    await putObject({ key: originalKey, body: bytes, contentType: 'image/jpeg' });

    await db.insert(schema.projectImage).values({
      id: image.id,
      projectId: spec.id,
      roomId: roomIdBySlug.get(image.roomSlug)!,
      originalKey,
      contentType: 'image/jpeg',
      themeSlugs: image.themeSlugs,
      materialSlugs: image.materialSlugs,
      finishSlugs: image.finishSlugs,
      sortOrder: image.sortOrder,
    });
    await enqueueMedia({ imageId: image.id });
    console.log(`[seed-demo]   queued ${image.file} (${image.id})`);
  }

  await db
    .update(schema.project)
    .set({ coverImageId: spec.images[0]!.id })
    .where(eq(schema.project.id, spec.id));

  return spec.images.map((image) => image.id);
}

/**
 * Poll until the worker has processed every enqueued image (or time out gracefully).
 * Returns the ids of images that ended `failed` so main can exit non-zero.
 */
async function waitForProcessing(imageIds: string[]): Promise<string[]> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const rows = await db
      .select({ id: schema.projectImage.id, status: schema.projectImage.status })
      .from(schema.projectImage)
      .where(inArray(schema.projectImage.id, imageIds));
    const ready = rows.filter((row) => row.status === 'ready').length;
    const failed = rows.filter((row) => row.status === 'failed');
    const processing = rows.length - ready - failed.length;

    console.log(`[seed-demo] media: ${ready}/${imageIds.length} ready, ${processing} processing`);
    if (processing === 0) return failed.map((row) => row.id);
    if (Date.now() > deadline) {
      console.warn(
        '[seed-demo] timed out waiting for the worker. Jobs remain queued in Redis; ' +
          'start the worker (`pnpm --filter @repo/worker dev`) and the images will finish processing.',
      );
      return failed.map((row) => row.id);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  console.log(`[seed-demo] starting${force ? ' (force)' : ''}...`);

  await ensureFixtures(SEED_DESIGNERS);
  await seedTaxonomy();
  await ensureBucket();
  const tax = await resolveTaxonomy(SEED_DESIGNERS);

  const enqueued: string[] = [];
  for (const designer of SEED_DESIGNERS) {
    const profileId = await upsertDesigner(designer, tax);
    console.log(`[seed-demo] designer '${designer.displayName}' ready (profile ${profileId})`);
    for (const project of designer.projects) {
      enqueued.push(...(await seedProject(profileId, project, tax, force)));
    }
  }

  if (enqueued.length > 0) {
    console.log(`[seed-demo] waiting for the worker to process ${enqueued.length} image(s)...`);
    const failed = await waitForProcessing(enqueued);
    if (failed.length > 0) {
      throw new Error(
        `${failed.length} image(s) FAILED processing: ${failed.join(', ')} — ` +
          'check the worker logs; a re-run cleans up and reseeds the affected projects.',
      );
    }
  }

  console.log(
    '[seed-demo] done. Log in via phone OTP as +919800000101 (Studio Meraki) or ' +
      '+919800000102 (Atelier Arjun); with SMS_PROVIDER=console the code is printed by the worker.',
  );
}

main()
  .then(async () => {
    await closeQueues();
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    console.error('[seed-demo] failed:', err);
    await closeQueues().catch(() => undefined);
    process.exit(1);
  });
