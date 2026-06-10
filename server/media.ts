import { uploadPng, uploadJpeg, deleteObject, objectExists, imageKey, avatarKey, selfPortraitKey } from "./s3";

export async function saveImageFromBase64(id: string, base64Data: string): Promise<string> {
  const buffer = Buffer.from(base64Data, "base64");
  return uploadPng(imageKey(id), buffer);
}

/**
 * Uploads a generated self-portrait (PNG, base64-encoded) to S3 and returns a
 * cache-busted public URL. Like avatars, the S3 key is stable per user, so
 * regenerating overwrites the previous portrait; the ?v= suffix forces a refetch.
 */
export async function saveSelfPortraitFromBase64(userId: string, base64Data: string): Promise<string> {
  const buffer = Buffer.from(base64Data, "base64");
  const url = await uploadPng(selfPortraitKey(userId), buffer);
  return `${url}?v=${Date.now()}`;
}

/**
 * Uploads a user avatar (a client-cropped/resized JPEG, base64-encoded) to S3
 * and returns a cache-busted public URL. The S3 key is stable per user, so a
 * re-upload overwrites the previous object; the ?v= suffix forces a refetch.
 */
export async function saveAvatarFromBase64(userId: string, base64Data: string): Promise<string> {
  const buffer = Buffer.from(base64Data, "base64");
  const url = await uploadJpeg(avatarKey(userId), buffer);
  return `${url}?v=${Date.now()}`;
}

export async function saveImageFromUrl(id: string, imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return uploadPng(imageKey(id), buffer);
}

export async function deleteImage(id: string): Promise<void> {
  await deleteObject(imageKey(id));
}

export async function imageExists(id: string): Promise<boolean> {
  return objectExists(imageKey(id));
}
