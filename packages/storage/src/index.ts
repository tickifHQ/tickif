import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '@repo/config';

export const ORIGINALS_PREFIX = 'originals';
export const DERIVATIVES_PREFIX = 'derivatives';

function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is required for media storage`);
  return value;
}

function resolveEndpoint(): string {
  if (config.R2_ENDPOINT) return config.R2_ENDPOINT;
  const accountId = requireEnv('R2_ACCOUNT_ID', config.R2_ACCOUNT_ID);
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

let client: S3Client | undefined;

/** Lazily built so importing this package never fails when R2 env is absent. */
export function r2Client(): S3Client {
  client ??= new S3Client({
    region: 'auto',
    endpoint: resolveEndpoint(),
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID', config.R2_ACCESS_KEY_ID),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY', config.R2_SECRET_ACCESS_KEY),
    },
    forcePathStyle: true,
  });
  return client;
}

/** Non-sequential private key for an original: `originals/{projectId}/{uuid}` (§11/§12). */
export function buildOriginalKey(projectId: string): string {
  return `${ORIGINALS_PREFIX}/${projectId}/${randomUUID()}`;
}

/** ContentType is pinned into the signature so the client can't upload a different type. */
export async function presignUpload(params: {
  key: string;
  contentType: string;
  expiresIn?: number;
}): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: requireEnv('R2_BUCKET', config.R2_BUCKET),
    Key: params.key,
    ContentType: params.contentType,
  });
  return getSignedUrl(r2Client(), command, {
    expiresIn: params.expiresIn ?? config.R2_UPLOAD_URL_EXPIRY_SECONDS,
  });
}
