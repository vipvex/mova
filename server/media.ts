import fs from 'fs';
import path from 'path';

const MEDIA_DIR = path.join(process.cwd(), 'server', 'media', 'images');

export function ensureMediaDirectory(): void {
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }
}

export function getImagePath(wordId: string): string {
  const sanitizedId = wordId.replace(/[^a-zA-Z0-9-]/g, '');
  return path.join(MEDIA_DIR, `${sanitizedId}.png`);
}

export function getImageUrl(wordId: string): string {
  const sanitizedId = wordId.replace(/[^a-zA-Z0-9-]/g, '');
  return `/media/images/${sanitizedId}.png`;
}

export async function saveImageFromBase64(wordId: string, base64Data: string): Promise<string> {
  ensureMediaDirectory();
  
  const imagePath = getImagePath(wordId);
  const buffer = Buffer.from(base64Data, 'base64');
  
  await fs.promises.writeFile(imagePath, buffer);
  
  return getImageUrl(wordId);
}

export async function saveImageFromUrl(wordId: string, imageUrl: string): Promise<string> {
  ensureMediaDirectory();
  
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  const imagePath = getImagePath(wordId);
  await fs.promises.writeFile(imagePath, buffer);
  
  return getImageUrl(wordId);
}

export function deleteImage(wordId: string): void {
  const imagePath = getImagePath(wordId);
  if (fs.existsSync(imagePath)) {
    fs.unlinkSync(imagePath);
  }
}

export function imageExists(wordId: string): boolean {
  const imagePath = getImagePath(wordId);
  return fs.existsSync(imagePath);
}

export function getMediaDirectory(): string {
  return MEDIA_DIR;
}
