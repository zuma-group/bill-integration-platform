import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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
  const Body = Buffer.from(base64, 'base64');
  const params: any = {
    Bucket: process.env.S3_BUCKET!,
    Key: key,
    Body,
    ContentType: contentType,
  };
  // Some providers/buckets (e.g., Bucket owner enforced / R2) reject ACLs.
  if (process.env.S3_USE_ACL === 'true') {
    params.ACL = 'private';
  }
  await s3.send(new PutObjectCommand(params));
  return getPublicUrl(key);
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