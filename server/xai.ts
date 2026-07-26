/**
 * xAI (Grok Imagine + Voice) client helpers.
 * Images: OpenAI-compatible /v1/images/generations (+ JSON /v1/images/edits).
 * Video: async /v1/videos/generations + poll.
 * TTS: POST /v1/tts → raw audio bytes.
 */
import OpenAI from "openai";

const BASE = "https://api.x.ai/v1";

export function xaiConfigured(): boolean {
  return !!process.env.XAI_API_KEY;
}

function requireKey(): string {
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error("XAI_API_KEY is not set");
  return key;
}

/** OpenAI SDK pointed at xAI — works for image *generation* (not edits). */
export function xaiOpenAI(): OpenAI {
  return new OpenAI({
    apiKey: requireKey(),
    baseURL: BASE,
    timeout: 240_000,
    maxRetries: 2,
  });
}

export type XaiImageModel = "grok-imagine-image" | "grok-imagine-image-quality";

function aspectForSize(size?: string): string {
  if (size === "1536x1024") return "3:2";
  if (size === "1024x1536") return "2:3";
  return "1:1";
}

async function downloadAsBase64(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`failed to download xAI image: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.toString("base64");
}

/** Text → image. Returns PNG/JPEG bytes as Buffer. */
export async function xaiGenerateImage(opts: {
  prompt: string;
  model?: XaiImageModel;
  size?: string;
  n?: number;
}): Promise<Buffer> {
  const model = opts.model || "grok-imagine-image-quality";
  const client = xaiOpenAI();
  const res = await client.images.generate({
    model,
    prompt: opts.prompt,
    n: opts.n ?? 1,
    response_format: "b64_json",
    // xAI-specific fields — accepted via SDK passthrough
    ...({ aspect_ratio: aspectForSize(opts.size) } as any),
  } as any);
  const b64 = res.data?.[0]?.b64_json;
  if (b64) return Buffer.from(b64, "base64");
  const url = res.data?.[0]?.url;
  if (!url) throw new Error("no image data from xAI");
  return Buffer.from(await downloadAsBase64(url), "base64");
}

export type XaiEditImageRef =
  | { base64Data: string; mimeType?: string }
  | { url: string };

function toXaiImageUrl(ref: XaiEditImageRef): string {
  if ("url" in ref && ref.url) return ref.url.replace(/\?.*$/, "");
  const mime = ("mimeType" in ref && ref.mimeType) || "image/png";
  const b64 = "base64Data" in ref ? ref.base64Data : "";
  if (b64.startsWith("data:")) return b64;
  return `data:${mime};base64,${b64}`;
}

/**
 * Edit / restyle from one or more reference images (up to 3).
 * xAI edits require JSON (not multipart), so we call the REST API directly.
 * With multiple images, refer to them in the prompt as <IMAGE_0>, <IMAGE_1>, …
 */
export async function xaiEditImage(opts: {
  prompt: string;
  /** Single-image convenience (same as images: [{ base64Data }]). */
  imageBase64?: string;
  mimeType?: string;
  /** Multi-reference edit inputs (mutually preferred over imageBase64 when set). */
  images?: XaiEditImageRef[];
  model?: XaiImageModel;
  size?: string;
}): Promise<Buffer> {
  const model = opts.model || "grok-imagine-image-quality";
  const refs: XaiEditImageRef[] = opts.images?.length
    ? opts.images.slice(0, 3)
    : opts.imageBase64
      ? [{ base64Data: opts.imageBase64, mimeType: opts.mimeType }]
      : [];
  if (!refs.length) throw new Error("xaiEditImage requires at least one reference image");

  const body: Record<string, unknown> = {
    model,
    prompt: opts.prompt,
    response_format: "b64_json",
    aspect_ratio: aspectForSize(opts.size),
  };
  if (refs.length === 1) {
    body.image = { url: toXaiImageUrl(refs[0]), type: "image_url" };
  } else {
    body.images = refs.map((r) => ({ url: toXaiImageUrl(r), type: "image_url" }));
  }

  const r = await fetch(`${BASE}/images/edits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(`xAI image edit failed (${r.status}): ${errText.slice(0, 400)}`);
  }
  const json = await r.json() as any;
  const b64 = json.data?.[0]?.b64_json;
  if (b64) return Buffer.from(b64, "base64");
  const url = json.data?.[0]?.url;
  if (!url) throw new Error("no image data from xAI edit");
  return Buffer.from(await downloadAsBase64(url), "base64");
}

export type XaiVideoModel = "grok-imagine-video" | "grok-imagine-video-1.5";

/** Start + poll a video generation. Returns a temporary video URL from xAI. */
export async function xaiGenerateVideo(opts: {
  prompt: string;
  model?: XaiVideoModel;
  /** Public URL or data: URL of a still to animate (image-to-video). */
  imageUrl?: string;
  duration?: number;
  resolution?: "480p" | "720p";
  pollMs?: number;
  timeoutMs?: number;
}): Promise<{ url: string; requestId: string; model: string }> {
  const model = opts.model || "grok-imagine-video-1.5";
  const body: Record<string, unknown> = {
    model,
    prompt: opts.prompt,
    duration: opts.duration ?? 6,
    resolution: opts.resolution || "720p",
  };
  if (opts.imageUrl) {
    // Strip cache-busting query params; xAI accepts public URL or data URI.
    body.image = { url: opts.imageUrl.replace(/\?.*$/, "") };
  }

  const start = await fetch(`${BASE}/videos/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!start.ok) {
    const errText = await start.text().catch(() => "");
    throw new Error(`xAI video start failed (${start.status}): ${errText.slice(0, 400)}`);
  }
  const started = await start.json() as any;
  const requestId = started.request_id || started.id;
  if (!requestId) throw new Error("xAI video: no request_id returned");

  const pollMs = opts.pollMs ?? 4000;
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const poll = await fetch(`${BASE}/videos/${requestId}`, {
      headers: { Authorization: `Bearer ${requireKey()}` },
    });
    if (!poll.ok) {
      const errText = await poll.text().catch(() => "");
      throw new Error(`xAI video poll failed (${poll.status}): ${errText.slice(0, 400)}`);
    }
    const status = await poll.json() as any;
    const st = String(status.status || "").toLowerCase();
    if (st === "done" || st === "completed" || st === "succeeded") {
      const url = status.video?.url || status.url;
      if (!url) throw new Error("xAI video done but no url");
      return { url, requestId, model };
    }
    if (st === "failed" || st === "expired" || st === "error") {
      throw new Error(`xAI video ${st}: ${status.error || status.message || JSON.stringify(status).slice(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error("xAI video timed out");
}

export async function xaiDownload(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Map app language → xAI BCP-47. */
export function xaiLang(language: string): string {
  if (language === "spanish") return "es";
  if (language === "russian") return "ru";
  if (language === "english") return "en";
  return "auto";
}

/** Built-in xAI voices. */
export const XAI_VOICES = ["eve", "ara", "rex", "sal", "leo"] as const;
export type XaiVoiceId = (typeof XAI_VOICES)[number];

/** Batch TTS → MP3 buffer. */
export async function xaiTTS(opts: {
  text: string;
  voiceId?: string;
  language: string;
  speed?: number;
}): Promise<Buffer> {
  const r = await fetch(`${BASE}/tts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: opts.text,
      voice_id: opts.voiceId || "eve",
      language: xaiLang(opts.language),
      speed: opts.speed ?? 1.0,
      output_format: { codec: "mp3", sample_rate: 24000, bit_rate: 128000 },
    }),
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(`xAI TTS failed (${r.status}): ${errText.slice(0, 400)}`);
  }
  return Buffer.from(await r.arrayBuffer());
}
