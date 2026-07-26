/** Persisted media-provider prefs for Game Studio (image / TTS / video). */
import { promises as fs } from "fs";
import path from "path";

const FILE = path.resolve(import.meta.dirname, "data", "media-providers.json");

export type ImageProvider = "openai" | "xai";
export type TtsProvider = "elevenlabs" | "xai";
export type VideoProvider = "xai" | "off";

export interface MediaProviders {
  imageProvider: ImageProvider;
  ttsProvider: TtsProvider;
  videoProvider: VideoProvider;
  /** xAI Imagine model for stills */
  xaiImageModel: "grok-imagine-image" | "grok-imagine-image-quality";
  /** xAI video model */
  xaiVideoModel: "grok-imagine-video" | "grok-imagine-video-1.5";
  /** Default xAI TTS voice */
  xaiVoiceId: string;
}

const DEFAULTS: MediaProviders = {
  imageProvider: "openai",
  ttsProvider: "elevenlabs",
  videoProvider: "xai",
  xaiImageModel: "grok-imagine-image-quality",
  xaiVideoModel: "grok-imagine-video-1.5",
  xaiVoiceId: "eve",
};

async function read(): Promise<MediaProviders> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE, "utf8"));
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

async function write(state: MediaProviders): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(state, null, 2), "utf8");
}

export async function getMediaProviders(): Promise<MediaProviders> {
  return read();
}

export async function setMediaProviders(patch: Partial<MediaProviders>): Promise<MediaProviders> {
  const cur = await read();
  const next: MediaProviders = { ...cur, ...patch };
  // validate enums lightly
  if (next.imageProvider !== "openai" && next.imageProvider !== "xai") next.imageProvider = cur.imageProvider;
  if (next.ttsProvider !== "elevenlabs" && next.ttsProvider !== "xai") next.ttsProvider = cur.ttsProvider;
  if (next.videoProvider !== "xai" && next.videoProvider !== "off") next.videoProvider = cur.videoProvider;
  await write(next);
  return next;
}
