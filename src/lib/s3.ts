import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import type { PutObjectCommandInput } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true' || false,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function uploadPdfBase64(key: string, base64: string, contentType = 'application/pdf') {
  if (!process.env.S3_BUCKET) {
    throw new Error('S3_BUCKET environment variable is not configured');
  }
  
  const Body = Buffer.from(base64, 'base64');
  const params: PutObjectCommandInput = {
    Bucket: process.env.S3_BUCKET,
    Key: key,
    Body,
    ContentType: contentType,
  };
  // Some providers/buckets (e.g., Bucket owner enforced / R2) reject ACLs.
  if (process.env.S3_USE_ACL === 'true') {
    params.ACL = 'private';
  }
  await s3.send(new PutObjectCommand(params));
  return getObjectUrl(key);
}

export function getPublicUrl(key: string): string {
  const base = process.env.S3_PUBLIC_BASE_URL;
  if (base) {
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${cleanBase}/${encodeURIComponent(key)}`;
  }
  // Fallback to standard S3 URL
  return `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${encodeURIComponent(key)}`;
}

export async function getSignedObjectUrl(key: string, expiresSeconds?: number): Promise<string> {
  if (!process.env.S3_BUCKET) {
    throw new Error('S3_BUCKET environment variable is not configured');
  }
  
  const Bucket = process.env.S3_BUCKET;
  const Key = key;
  const command = new GetObjectCommand({ Bucket, Key, ResponseContentType: 'application/pdf' });
  // Default to 7 days (604800 seconds) for Odoo to have plenty of time to fetch
  // Odoo might fetch asynchronously, so we need longer expiration
  const expiresIn = Math.max(60, Math.min(60 * 60 * 24 * 7, Number(expiresSeconds || process.env.S3_SIGNED_URL_EXPIRES || 604800)));
  return await getSignedUrl(s3, command, { expiresIn });
}

export function shouldUseSignedUrls(): boolean {
  return process.env.S3_SIGNED_URLS === 'true' || !process.env.S3_PUBLIC_BASE_URL || process.env.S3_USE_ACL === 'true';
}

export async function getObjectUrl(key: string): Promise<string> {
  if (shouldUseSignedUrls()) {
    return await getSignedObjectUrl(key);
  }
  return Promise.resolve(getPublicUrl(key));
}

export function extractKeyFromUrl(urlOrKey: string | undefined | null): string | null {
  if (!urlOrKey) return null;
  try {
    // If it's a URL, parse path as key
    const u = new URL(urlOrKey);
    const path = u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname;
    return decodeURIComponent(path);
  } catch {
    // Not a URL, assume it's already a key
    return urlOrKey;
  }
}