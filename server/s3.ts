import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

const REGION = process.env.AWS_REGION;
const BUCKET = process.env.AWS_S3_BUCKET;
const PUBLIC_BASE = process.env.AWS_S3_PUBLIC_BASE;

if (!REGION) throw new Error("AWS_REGION is not set");
if (!BUCKET) throw new Error("AWS_S3_BUCKET is not set");

export const s3 = new S3Client({ region: REGION });

export const IMAGE_PREFIX = "images";

export function imageKey(id: string): string {
  const sanitized = id.replace(/[^a-zA-Z0-9-_]/g, "");
  return `${IMAGE_PREFIX}/${sanitized}.png`;
}

export const AUDIO_PREFIX = "audio";

export function audioKey(hash: string): string {
  const sanitized = hash.replace(/[^a-zA-Z0-9-_]/g, "");
  return `${AUDIO_PREFIX}/${sanitized}.mp3`;
}

export function publicUrl(key: string): string {
  if (PUBLIC_BASE) return `${PUBLIC_BASE.replace(/\/$/, "")}/${key}`;
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

export async function uploadPng(key: string, body: Buffer): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: "image/png",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return publicUrl(key);
}

export async function uploadMp3(key: string, body: Buffer): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: "audio/mpeg",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return publicUrl(key);
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (err: any) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") return false;
    throw err;
  }
}
