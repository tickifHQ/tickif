import '../lib/environment.js';
import { Pool } from 'pg';
import { CreateBucketCommand, HeadBucketCommand, S3ServiceException } from '@aws-sdk/client-s3';
import { config } from '@repo/config';
import { migrateTestDb, assertTestDb } from '@repo/db/testing';
import { seedTaxonomy } from '@repo/db/seeds/taxonomy';
import { bootstrapSearch } from '@repo/search';
import { r2Client } from '@repo/storage';

/** All connection targets are validated before this module loads any clients. */
export async function prepareStack() {
  const database = new URL(config.DATABASE_URL);
  const name = database.pathname.slice(1);
  database.pathname = '/postgres';
  const connection = new Pool({ connectionString: database.toString() });
  try {
    const exists = await connection.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!exists.rowCount) await connection.query(`CREATE DATABASE "${name}"`);
  } finally { await connection.end(); }
  await migrateTestDb(config.DATABASE_URL);
  await assertTestDb();
  await seedTaxonomy();
  await bootstrapSearch();
  const storage = r2Client();
  try { await storage.send(new HeadBucketCommand({ Bucket: config.R2_BUCKET })); }
  catch (error) {
    if (!(error instanceof S3ServiceException) || error.$metadata.httpStatusCode !== 404) throw error;
    await storage.send(new CreateBucketCommand({ Bucket: config.R2_BUCKET }));
  }
  console.log('[e2e] Isolated database, taxonomy, search and private storage are ready.');
}

await prepareStack();
