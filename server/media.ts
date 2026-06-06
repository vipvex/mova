import { uploadPng, deleteObject, objectExists, imageKey } from "./s3";

export async function saveImageFromBase64(id: string, base64Data: string): Promise<string> {
  const buffer = Buffer.from(base64Data, "base64");
  return uploadPng(imageKey(id), buffer);
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
