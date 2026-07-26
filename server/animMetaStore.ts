/** Per-clip playback metadata: loop trim points + whether green was keyed out. */
import { promises as fs } from "fs";
import path from "path";

const FILE = path.resolve(import.meta.dirname, "data", "anim-clip-meta.json");

export type AnimClipMeta = {
  /** Inclusive loop start (seconds). */
  loopStart: number;
  /** Exclusive-ish loop end (seconds). 0 = use full duration. */
  loopEnd: number;
  /** True once a chroma-keyed (transparent) version is the current asset. */
  keyed?: boolean;
  /** Last known duration from the browser / ffprobe. */
  duration?: number;
  /** PNG flipbook frames extracted from this video (game playback). */
  frameCount?: number;
  updatedAt?: number;
};

export type AnimMetaMap = Record<string, AnimClipMeta>;

export async function getAnimMeta(): Promise<AnimMetaMap> {
  try { return JSON.parse(await fs.readFile(FILE, "utf8")); } catch { return {}; }
}

export async function getClipMeta(key: string): Promise<AnimClipMeta | null> {
  const all = await getAnimMeta();
  return all[key] || null;
}

export async function setClipMeta(key: string, patch: Partial<AnimClipMeta>): Promise<AnimClipMeta> {
  const all = await getAnimMeta();
  const prev = all[key] || { loopStart: 0, loopEnd: 0 };
  const next: AnimClipMeta = {
    ...prev,
    ...patch,
    loopStart: Math.max(0, Number(patch.loopStart ?? prev.loopStart) || 0),
    loopEnd: Math.max(0, Number(patch.loopEnd ?? prev.loopEnd) || 0),
    updatedAt: Date.now(),
  };
  if (next.loopEnd > 0 && next.loopEnd <= next.loopStart) {
    next.loopEnd = next.loopStart + 0.05;
  }
  all[key] = next;
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(all, null, 2), "utf8");
  return next;
}
