import { randomUUID } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '@repo/config';

export const ORIGINALS_PREFIX = 'originals';
export const DERIVATIVES_PREFIX = 'derivatives';

/** Thrown when an object exceeds the byte budget — a permanent failure, never retried. */
export class ObjectTooLargeError extends Error {
  constructor(
    public readonly key: string,
    public readonly size: number,
    public readonly maxBytes: number,
  ) {
    super(`object ${key} is ${size}B, exceeds the ${maxBytes}B limit`);
    this.name = 'ObjectTooLargeError';
  }
}

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
    // R2 (and MinIO) reject the SDK's default CRC32 trailer; baking it into a presigned
    // PUT makes the browser upload fail. Only sign a checksum when explicitly set.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return client;
}

/** Non-sequential private key for an original: `originals/{projectId}/{uuid}` (§11/§12). */
export function buildOriginalKey(projectId: string): string {
  return `${ORIGINALS_PREFIX}/${projectId}/${randomUUID()}`;
}

/** Deterministic key for a derivative so re-runs overwrite rather than orphan (idempotent, E-112). */
export function buildDerivativeKey(
  projectId: string,
  imageId: string,
  variant: string,
  format: string,
): string {
  return `${DERIVATIVES_PREFIX}/${projectId}/${imageId}/${variant}.${format}`;
}

/** HEAD before download so an oversize object is rejected without buffering it into memory. */
export async function getObject(
  key: string,
  maxBytes: number = config.MEDIA_MAX_UPLOAD_BYTES,
): Promise<Buffer> {
  const bucket = requireEnv('R2_BUCKET', config.R2_BUCKET);
  const head = await r2Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  const size = head.ContentLength ?? 0;
  if (size > maxBytes) throw new ObjectTooLargeError(key, size, maxBytes);

  const res = await r2Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) throw new Error(`R2 object ${key} has no body`);
  return Buffer.from(await res.Body.transformToByteArray());
}

export async function putObject(params: {
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
}): Promise<void> {
  await r2Client().send(
    new PutObjectCommand({
      Bucket: requireEnv('R2_BUCKET', config.R2_BUCKET),
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl: params.cacheControl,
    }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  await r2Client().send(
    new DeleteObjectCommand({ Bucket: requireEnv('R2_BUCKET', config.R2_BUCKET), Key: key }),
  );
}

/** Fail fast at boot if R2 is misconfigured, instead of letting every job fail later. */
export function assertMediaStorageConfig(): void {
  resolveEndpoint();
  requireEnv('R2_ACCESS_KEY_ID', config.R2_ACCESS_KEY_ID);
  requireEnv('R2_SECRET_ACCESS_KEY', config.R2_SECRET_ACCESS_KEY);
  requireEnv('R2_BUCKET', config.R2_BUCKET);
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404;
}

/** Whether an object exists in the bucket. Used to confirm a client actually PUT its bytes. */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await r2Client().send(
      new HeadObjectCommand({ Bucket: requireEnv('R2_BUCKET', config.R2_BUCKET), Key: key }),
    );
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

/** ContentType and ContentLength are pinned into the signature so the client can't upload a different type or a larger body. */
export async function presignUpload(params: {
  key: string;
  contentType: string;
  contentLength: number;
  expiresIn?: number;
}): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: requireEnv('R2_BUCKET', config.R2_BUCKET),
    Key: params.key,
    ContentType: params.contentType,
    ContentLength: params.contentLength,
  });
  return getSignedUrl(r2Client(), command, {
    expiresIn: params.expiresIn ?? config.R2_UPLOAD_URL_EXPIRY_SECONDS,
    // Force both into SignedHeaders; the SDK doesn't sign content-type by default, so without
    // this the client could PUT a different type than was declared at mint.
    signableHeaders: new Set(['content-type', 'content-length']),
  });
}

/** Short-lived private read URL for an already-stored object. */
export async function presignDownload(params: {
  key: string;
  expiresIn?: number;
}): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: requireEnv('R2_BUCKET', config.R2_BUCKET),
    Key: params.key,
  });
  return getSignedUrl(r2Client(), command, {
    expiresIn: params.expiresIn ?? config.R2_UPLOAD_URL_EXPIRY_SECONDS,
  });
}
