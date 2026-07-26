import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { randomBytes } from "crypto";
import { promises as fsp } from "fs";
import path from "path";
import sharp from "sharp";
import { storage } from "./storage";
import { calculateSM2, mapButtonToQuality, getInitialProgress } from "./spacedRepetition";
import OpenAI, { toFile } from "openai";
import {
  elevenlabs,
  getOrGenerateTTS,
  audioSpeedToTag,
  chunkWordForPronunciation,
  ELEVENLABS_VOICE_ID,
  ELEVENLABS_CHILD_VOICE_ID,
} from "./tts";
import { z } from "zod";
import { type Language, languageEnum, stories, frequencyDictionary, assetGenerations } from "@shared/schema";
import { CURRICULA, type CurriculumPhase } from "@shared/curriculum";
import { saveImageFromBase64, saveAvatarFromBase64, saveSelfPortraitFromBase64, deleteImage as deleteImageFile, imageExists } from "./media";
import { GoogleGenAI } from "@google/genai";
import { russianVocabulary } from "./russianVocabulary";
import { gameLevels } from "./gameLevels";
import { runFactory, type CurriculumSpec } from "./factory";
import { appendEvent, wordStats } from "./telemetry";
import { VISUAL_STYLES, cameraClause, isIsometricStyle } from "@shared/styles";
import { composeAssetPrompt, defaultMasterPrompt, promptKindForKey } from "@shared/assetPrompts";
import {
  composeVideoMotionPrompt, isVideoAssetKey, videoClipFor, videoClipKey,
  videoFrameKey, videoFrameKeys, defaultSpriteFrameCount, parseVideoClipKey,
  facingStillKey, composeFacingStillPrompt, facingCameraClause, dirsFor,
  type IsoDir, ISO_DIRS_8,
} from "@shared/animCatalog";
import { getAnimMeta, getClipMeta, setClipMeta } from "./animMetaStore";
import { chromaKeyToWebm, probeDurationSec, extractVideoFrames } from "./videoProcess";
import {
  getExamples as getStyleExamples,
  setExample as setStyleExample,
  getActiveStyleId,
  setActiveStyleId,
  getFavoriteIds,
  toggleFavorite,
} from "./styleStore";
import { getMediaProviders, setMediaProviders } from "./mediaProvider";
import {
  xaiConfigured, xaiGenerateImage, xaiEditImage, xaiGenerateVideo, xaiDownload, XAI_VOICES,
} from "./xai";
import { getAssets as getGameAssets, setAsset as setGameAsset, deleteAsset as deleteGameAsset, getHistory as getAssetHistory, addAssetVersion, setCurrentVersion, deleteAssetVersion } from "./assetStore";
import { normalizeFrame, sliceSheetSmart, chromaKeyGreen, measureGreenPlate, stripWhiteOutline, punchIsoTileBackground, CHARACTER_SPEC, OBJECT_SPEC } from "./spriteNormalize";
import { videoKey, uploadMp4, uploadWebm } from "./s3";

function assetProxyPath(key: string, url?: string) {
  return isVideoAssetKey(key, url) ? `/api/assets/video/${key}` : `/api/assets/img/${key}`;
}

/** Map provider errors (credits / quota / auth) to a clear HTTP status + message. */
function providerErrorStatus(err: unknown): { status: number; details: string; error: string } {
  const details = err instanceof Error ? err.message : String(err);
  const low = details.toLowerCase();
  if (
    low.includes("used all available credits")
    || low.includes("spending limit")
    || low.includes("insufficient")
    || low.includes("quota")
    || low.includes("out of credits")
  ) {
    return {
      status: 402,
      error: "credits exhausted",
      details: "xAI credits or monthly spending limit hit — add credits or raise the limit at console.x.ai, then retry.",
    };
  }
  if (low.includes("(401)") || low.includes("unauthorized") || low.includes("invalid api key")) {
    return { status: 401, error: "auth failed", details: "API key rejected — check XAI_API_KEY / OpenAI key." };
  }
  if (low.includes("(403)") || low.includes("permission-denied") || low.includes("forbidden")) {
    return { status: 403, error: "permission denied", details };
  }
  if (low.includes("(429)") || low.includes("rate limit")) {
    return { status: 429, error: "rate limited", details: "Provider rate limit — wait a moment and retry." };
  }
  return { status: 500, error: "generation failed", details };
}

/** Hosted image model for sprites. gpt-image-1.5: native transparent PNG + much
 *  better character preservation on edits than gpt-image-1 (which retires Oct 2026). */
const SPRITE_MODEL = "gpt-image-1.5";
const specForKey = (key: string) => (key.startsWith("char_") ? CHARACTER_SPEC : OBJECT_SPEC);

/** Normalize a freshly generated sprite (trim → constant scale → baked pivot → fixed
 *  cell) so every frame aligns, then cache to S3 + manifest. Returns the proxy url. */
/** Save a PNG as a NEW version of a logical key (never overwrites past gens), register
 *  it in the manifest, and point `current` at it. The pre-versioning image (if any) is
 *  preserved once as version 0 so it stays browsable. Returns the current proxy path. */
async function saveVersioned(key: string, png: Buffer): Promise<{ url: string; v: number }> {
  const map = await getGameAssets();
  const hist = await getAssetHistory();
  // first time we version this key: keep the old current image as v0
  if (!hist[key] && map[key]) {
    const v0 = `${key}__v0`;
    await setGameAsset(v0, map[key]);
    await addAssetVersion(key, v0, 0);
  }
  const ts = Date.now();
  const vkey = `${key}__v${ts}`;
  const s3 = await saveImageFromBase64(`asset-${vkey}`, png.toString("base64"));
  await setGameAsset(vkey, `${s3}?v=${ts}`);       // servable version
  await setGameAsset(key, `${s3}?v=${ts}`);        // current pointer → newest
  await addAssetVersion(key, vkey, ts);
  // Stable proxy path + explicit cache-bust token the Studio UI must append.
  return { url: `/api/assets/img/${key}`, v: ts };
}

async function saveNormalizedSprite(key: string, buf: Buffer): Promise<{ url: string; v: number }> {
  const { png } = await normalizeFrame(buf, specForKey(key));
  return saveVersioned(key, png);
}

/** Same versioning scheme as PNGs, but uploads MP4/WebM and returns the video proxy path. */
async function saveVideoVersioned(
  key: string,
  body: Buffer,
  opts?: { ext?: "mp4" | "webm" },
): Promise<{ url: string; v: number }> {
  const map = await getGameAssets();
  const hist = await getAssetHistory();
  if (!hist[key] && map[key]) {
    const v0 = `${key}__v0`;
    await setGameAsset(v0, map[key]);
    await addAssetVersion(key, v0, 0);
  }
  const ts = Date.now();
  const vkey = `${key}__v${ts}`;
  const ext = opts?.ext || "mp4";
  const s3 = ext === "webm"
    ? await uploadWebm(videoKey(`asset-${vkey}`, "webm"), body)
    : await uploadMp4(videoKey(`asset-${vkey}`, "mp4"), body);
  await setGameAsset(vkey, `${s3}?v=${ts}`);
  await setGameAsset(key, `${s3}?v=${ts}`);
  await addAssetVersion(key, vkey, ts);
  return { url: `/api/assets/video/${key}`, v: ts };
}

/** Append one row to the asset-generation audit log (DB). Best-effort: a logging
 *  failure never breaks or crashes a generation. On success it back-fills the
 *  resulting S3 url + version key from the manifest/history. */
async function logGeneration(rec: {
  key: string; kind: string; model?: string; engine?: string; quality?: string; size?: string;
  styleId?: string; subject?: string; prompt: string; proxyUrl?: string; status?: string; error?: string;
}) {
  try {
    let s3Url: string | undefined; let versionKey: string | undefined;
    if (!rec.error) {
      const [map, hist] = await Promise.all([getGameAssets(), getAssetHistory()]);
      versionKey = hist[rec.key]?.current;
      s3Url = (versionKey && map[versionKey]) || map[rec.key];
    }
    await db.insert(assetGenerations).values({
      assetKey: rec.key, versionKey, kind: rec.kind, model: rec.model, engine: rec.engine,
      quality: rec.quality, size: rec.size, styleId: rec.styleId, subject: rec.subject,
      prompt: rec.prompt, s3Url, proxyUrl: rec.proxyUrl, status: rec.status || "ok", error: rec.error,
    });
  } catch (e: any) { console.error("gen-log insert failed:", e?.message || e); }
}

type RefImg = { base64Data: string; mimeType: string };
/** Produce a transparent sprite PNG buffer via one of two paths:
 *   - native (gpt-image-1.5, background:"transparent") — clean alpha, default.
 *   - matte  (gpt-image-2 on a green screen → chroma-key cutout) — better art, cut out here. */
// gpt-image quality → speed/cost. "low" ≈ 5–10× faster & cheaper than "high"; great for
// iterating, less crisp. "auto" lets the model pick. Default "high".
export type ImgQuality = "low" | "medium" | "high" | "auto";
const normQuality = (q?: string): ImgQuality =>
  (["low", "medium", "high", "auto"].includes(String(q)) ? q : "high") as ImgQuality;

async function genSpriteBuffer(opts: {
  prompt: string; size: string; ref?: RefImg | null; matte?: boolean; quality?: string;
  /** Extra visual refs (e.g. house style example sheet). Combined with `ref` for multi-image edit. */
  styleRef?: RefImg | { url: string } | null;
  /**
   * When both ref + styleRef are set, put the style sheet first (IMAGE_0).
   * Important for from-photo: if the likeness photo is IMAGE_0, xAI tends to
   * restyle that front-facing photo in place and ignore isometric camera instructions.
   */
  styleRefFirst?: boolean;
  /** Override image provider for this call; defaults to persisted Studio preference. */
  provider?: "openai" | "xai";
  /** Force a specific xAI image model (e.g. quality for likeness+style transfer). */
  xaiModel?: "grok-imagine-image" | "grok-imagine-image-quality";
}): Promise<Buffer> {
  const { prompt, size, ref, styleRef } = opts;
  const quality = normQuality(opts.quality);
  const prefs = await getMediaProviders();
  const provider = opts.provider || prefs.imageProvider;

  const pushStyle = (images: Array<{ base64Data: string; mimeType?: string } | { url: string }>) => {
    if (!styleRef) return;
    if ("url" in styleRef && styleRef.url) images.push({ url: styleRef.url });
    else if ("base64Data" in styleRef) images.push({ base64Data: styleRef.base64Data, mimeType: styleRef.mimeType });
  };
  const pushLikeness = (images: Array<{ base64Data: string; mimeType?: string } | { url: string }>) => {
    if (ref) images.push({ base64Data: ref.base64Data, mimeType: ref.mimeType });
  };

  // xAI has no native transparent PNG — always green-matte + chroma-key for sprites.
  if (provider === "xai") {
    if (!xaiConfigured()) throw new Error("XAI_API_KEY is not set — pick OpenAI or add the key");
    const p = `${prompt} Place everything on a completely solid, uniform, flat pure chroma-green background of exact color #00FF00 (RGB 0,255,0) filling the entire image — no gradient, texture, other background or shadows. NO outline, NO white border, NO stroke, NO halo around the character — clean silhouette edges against the green only.`;
    const model = opts.xaiModel || prefs.xaiImageModel;
    const images: Array<{ base64Data: string; mimeType?: string } | { url: string }> = [];
    if (opts.styleRefFirst) { pushStyle(images); pushLikeness(images); }
    else { pushLikeness(images); pushStyle(images); }
    const raw = images.length
      ? await xaiEditImage({ prompt: p, images, model, size })
      : await xaiGenerateImage({ prompt: p, model, size });
    return chromaKeyGreen(raw);
  }

  const matte = opts.matte;
  const openaiRefs: RefImg[] = [];
  const styleAsRefImg = async (): Promise<RefImg | null> => {
    if (!styleRef) return null;
    if ("base64Data" in styleRef && styleRef.base64Data) return styleRef as RefImg;
    if ("url" in styleRef && styleRef.url) return fetchImageAsBase64(styleRef.url);
    return null;
  };
  const styleImg = await styleAsRefImg();
  if (opts.styleRefFirst) {
    if (styleImg) openaiRefs.push(styleImg);
    if (ref) openaiRefs.push(ref);
  } else {
    if (ref) openaiRefs.push(ref);
    if (styleImg) openaiRefs.push(styleImg);
  }

  if (matte) {
    const p = `${prompt} Place everything on a completely solid, uniform, flat pure chroma-green background of exact color #00FF00 (RGB 0,255,0) filling the entire image — no gradient, texture, other background or shadows. NO outline, NO white border, NO stroke, NO halo around the character in any cell — clean silhouette edges against the green only.`;
    if (openaiRefs.length) {
      const files = await Promise.all(openaiRefs.map((r, i) =>
        toFile(Buffer.from(r.base64Data, "base64"), `ref-${i}.png`, { type: r.mimeType || "image/png" })));
      const gen = await openai.images.edit({ model: "gpt-image-2", image: files.length === 1 ? files[0] : files, prompt: p, size, quality, n: 1 } as any);
      const b64 = gen.data?.[0]?.b64_json;
      if (!b64) throw new Error("no image data from OpenAI");
      return chromaKeyGreen(Buffer.from(b64, "base64"));
    }
    const gen = await openai.images.generate({ model: "gpt-image-2", prompt: p, size, quality, n: 1 } as any);
    const b64 = gen.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image data from OpenAI");
    return chromaKeyGreen(Buffer.from(b64, "base64"));
  }
  if (openaiRefs.length) {
    const files = await Promise.all(openaiRefs.map((r, i) =>
      toFile(Buffer.from(r.base64Data, "base64"), `ref-${i}.png`, { type: r.mimeType || "image/png" })));
    const gen = await openai.images.edit({
      model: SPRITE_MODEL, image: files.length === 1 ? files[0] : files, prompt, size, quality, background: "transparent", n: 1,
    } as any);
    const b64 = gen.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image data from OpenAI");
    return Buffer.from(b64, "base64");
  }
  const gen = await openai.images.generate({ model: SPRITE_MODEL, prompt, size, quality, background: "transparent", n: 1 } as any);
  const b64 = gen.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image data from OpenAI");
  return Buffer.from(b64, "base64");
}

/** Slice a pose sheet (content-aware, grid fallback), normalize each figure, save. */
async function sliceSaveSheet(sheetBuf: Buffer, poses: any[], cols: number, rows: number) {
  const { cells, mode } = await sliceSheetSmart(sheetBuf, poses.length, cols, rows);
  const results: any[] = [];
  for (let i = 0; i < poses.length; i++) {
    const key = poses[i].key;
    const { png, stat } = await normalizeFrame(cells[i], specForKey(key));
    const saved = await saveVersioned(key, png);
    results.push({ key, empty: stat.empty, url: saved.url, v: saved.v });
  }
  return { mode, results };
}
import { spanishVocabulary } from "./spanishVocabulary";
import { db } from "./db";
import { eq, and, asc, desc, inArray } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 240_000,  // 4 min — high-quality gpt-image renders can take 2–3 min
  maxRetries: 3,     // ride out transient connection blips
});

// Gemini is still used for text generation (story creation, word filtering)
const geminiAI = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

interface ReferenceImage {
  name: string;
  base64Data: string;
  mimeType?: string;
}

type ImageOpts = {
  quality?: "low" | "medium" | "high";
  size?: "1024x1024" | "1024x1536" | "1536x1024";
};

async function generateOpenAIImage(
  prompt: string,
  referenceImages?: ReferenceImage[],
  opts?: ImageOpts,
): Promise<string> {
  const size = opts?.size ?? "1024x1024";
  const quality = opts?.quality ?? "low";

  if (referenceImages && referenceImages.length > 0) {
    const refNames = referenceImages.map(r => r.name).join(", ");
    const enhancedPrompt = `I've provided reference images for these characters/objects: ${refNames}. Please keep them consistent with these references in the new image.\n\n${prompt}`;

    const files = await Promise.all(
      referenceImages.map((ref, i) =>
        toFile(
          Buffer.from(ref.base64Data, "base64"),
          `${(ref.name || "ref").replace(/[^a-z0-9_-]/gi, "_")}-${i}.png`,
          { type: ref.mimeType || "image/png" },
        ),
      ),
    );

    const res = await openai.images.edit({
      model: "gpt-image-2",
      image: files,
      prompt: enhancedPrompt,
      size,
      quality,
      n: 1,
    });

    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image data in OpenAI response");
    return b64;
  }

  const res = await openai.images.generate({
    model: "gpt-image-2",
    prompt,
    size,
    quality,
    n: 1,
  });

  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data in OpenAI response");
  return b64;
}

async function fetchImageAsBase64(url: string): Promise<{ base64Data: string; mimeType: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Reference image fetch ${response.status} for ${url}`);
      return null;
    }
    const base64Data = Buffer.from(await response.arrayBuffer()).toString("base64");
    const mimeType = response.headers.get("content-type") || "image/png";
    return { base64Data, mimeType };
  } catch (error) {
    console.error(`Error loading reference image at ${url}:`, error);
    return null;
  }
}

async function loadReferenceImagesForStory(storyId: string): Promise<ReferenceImage[]> {
  const references = await storage.getStoryReferences(storyId);
  const result: ReferenceImage[] = [];

  for (const ref of references) {
    if (!ref.referenceImageUrl) continue;
    const fetched = await fetchImageAsBase64(ref.referenceImageUrl);
    if (fetched) {
      result.push({ name: ref.name, base64Data: fetched.base64Data, mimeType: fetched.mimeType });
    }
  }

  return result;
}


export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ==================== USER ROUTES ====================
  
  // Expose which optional features are available based on env config
  app.get("/api/voice-config", (_req, res) => {
    res.json({
      childVoiceEnabled: ELEVENLABS_CHILD_VOICE_ID !== ELEVENLABS_VOICE_ID,
    });
  });

  // Get all users
  app.get("/api/users", async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users.map(u => ({ id: u.id, username: u.username, language: u.language, avatarUrl: u.avatarUrl, selfPortraitUrl: u.selfPortraitUrl })));
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Create a new user
  const createUserSchema = z.object({
    username: z.string().min(1).max(50),
    language: languageEnum,
  });

  app.post("/api/users", async (req, res) => {
    try {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      const existingUser = await storage.getUserByUsername(parsed.data.username);
      if (existingUser) {
        return res.status(409).json({ error: "Username already exists" });
      }

      const user = await storage.createUser({
        username: parsed.data.username,
        password: "",
        language: parsed.data.language,
      });
      
      res.json({ id: user.id, username: user.username, language: user.language, avatarUrl: user.avatarUrl });
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  // Upload (or replace) a user's avatar. Body: { image: "<base64 jpeg, no data: prefix>" }
  app.post("/api/users/:userId/avatar", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const image = req.body?.image;
      if (typeof image !== "string" || image.length === 0) {
        return res.status(400).json({ error: "Missing image data" });
      }
      // Strip a data-URL prefix if the client sent one.
      const base64 = image.includes(",") ? image.slice(image.indexOf(",") + 1) : image;

      const avatarUrl = await saveAvatarFromBase64(userId, base64);
      await storage.updateUserAvatar(userId, avatarUrl);
      res.json({ avatarUrl });
    } catch (error) {
      console.error("Error uploading avatar:", error);
      res.status(500).json({ error: "Failed to upload avatar" });
    }
  });

  // Generate a Ghibli-style self-portrait from a photo of the student and store
  // it on the user. Body: { image: "<base64 photo, optional data: prefix>" }.
  // The result is reusable as a reference image when generating flashcard art.
  const SELF_PORTRAIT_PROMPT = "Transform the person in this photo into a soft, hand-painted anime film style character portrait inspired by classic Studio Ghibli movies: warm watercolor lighting, gentle expressive eyes, rounded friendly features, and a simple clean pastel background. Keep their likeness, hairstyle, skin tone, and clothing colors recognizable. Head-and-shoulders framing, wholesome and child-friendly.";

  app.post("/api/users/:userId/self-portrait", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const image = req.body?.image;
      if (typeof image !== "string" || image.length === 0) {
        return res.status(400).json({ error: "Missing image data" });
      }
      // Accept a data-URL or a bare base64 string.
      const base64 = image.includes(",") ? image.slice(image.indexOf(",") + 1) : image;
      const mimeType = image.startsWith("data:")
        ? image.slice(5, image.indexOf(";"))
        : "image/jpeg";

      const generated = await generateOpenAIImage(
        SELF_PORTRAIT_PROMPT,
        [{ name: user.username || "person", base64Data: base64, mimeType }],
        { quality: "medium" },
      );
      const selfPortraitUrl = await saveSelfPortraitFromBase64(userId, generated);
      await storage.updateUserSelfPortrait(userId, selfPortraitUrl);
      res.json({ selfPortraitUrl });
    } catch (error: any) {
      const code = error?.error?.code || error?.code;
      console.error("Error generating self-portrait:", error?.status, code, error?.message);
      if (code === "moderation_blocked") {
        return res.status(422).json({
          error: "The image provider declined to stylize this photo for safety reasons. Try a clear, well-lit photo of a single face.",
          code,
        });
      }
      res.status(500).json({ error: "Failed to generate self-portrait", detail: error?.message });
    }
  });

  // Get user by ID
  app.get("/api/users/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ id: user.id, username: user.username, language: user.language, avatarUrl: user.avatarUrl, selfPortraitUrl: user.selfPortraitUrl });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // Update user language
  app.patch("/api/users/:userId/language", async (req, res) => {
    try {
      const { userId } = req.params;
      const { language } = req.body;
      
      const parsed = languageEnum.safeParse(language);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid language" });
      }

      await storage.updateUserLanguage(userId, parsed.data);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating user language:", error);
      res.status(500).json({ error: "Failed to update language" });
    }
  });

  // ==================== VOCABULARY ROUTES ====================

  // Get all vocabulary (optionally filtered by language)
  app.get("/api/vocabulary", async (req, res) => {
    try {
      const language = req.query.language as Language | undefined;
      const vocabulary = await storage.getAllVocabulary(language);
      res.json(vocabulary);
    } catch (error) {
      console.error("Error fetching vocabulary:", error);
      res.status(500).json({ error: "Failed to fetch vocabulary" });
    }
  });

  // Get vocabulary by category
  app.get("/api/vocabulary/category/:category", async (req, res) => {
    try {
      const { category } = req.params;
      const language = req.query.language as Language | undefined;
      const vocabulary = await storage.getVocabularyByCategory(category, language);
      res.json(vocabulary);
    } catch (error) {
      console.error("Error fetching vocabulary by category:", error);
      res.status(500).json({ error: "Failed to fetch vocabulary" });
    }
  });

  // Get level info for a user
  app.get("/api/users/:userId/level", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const levelInfo = await storage.getLevelInfo(userId, user.language as Language);
      res.json(levelInfo);
    } catch (error) {
      console.error("Error fetching level info:", error);
      res.status(500).json({ error: "Failed to fetch level info" });
    }
  });

  app.get("/api/users/:userId/level/:levelNum", async (req, res) => {
    try {
      const { userId, levelNum } = req.params;
      const level = parseInt(levelNum);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const allVocab = await storage.getAllVocabulary(user.language as Language);
      const userProgress = await storage.getAllLearningProgress(userId);
      const learnedWordIds = new Set(userProgress.filter(p => p.isLearned).map(p => p.wordId));

      const WORDS_PER_LEVEL = 100;
      const totalLevels = Math.ceil(allVocab.length / WORDS_PER_LEVEL);
      const clampedLevel = Math.max(0, Math.min(level, totalLevels - 1));
      const levelWords = allVocab.slice(clampedLevel * WORDS_PER_LEVEL, (clampedLevel + 1) * WORDS_PER_LEVEL);
      const wordsLearned = levelWords.filter(w => learnedWordIds.has(w.id)).length;

      res.json({
        currentLevel: clampedLevel,
        wordsLearned,
        totalWords: levelWords.length,
        totalLevels,
        allLevelWords: levelWords.map(word => ({ word, isLearned: learnedWordIds.has(word.id) })),
      });
    } catch (error) {
      console.error("Error fetching level info:", error);
      res.status(500).json({ error: "Failed to fetch level info" });
    }
  });

  app.get("/api/users/:userId/words/learned-all", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const allVocab = await storage.getAllVocabulary(user.language as Language);
      const allProgress = await storage.getAllLearningProgress(userId);
      const learnedWordIds = new Set(allProgress.filter(p => p.isLearned).map(p => p.wordId));
      const learnedWords = allVocab.filter(w => learnedWordIds.has(w.id));
      res.json(learnedWords);
    } catch (error) {
      console.error("Error fetching all learned words:", error);
      res.status(500).json({ error: "Failed to fetch learned words" });
    }
  });

  // User-facing curriculum: the curriculum tree enriched with the user's own
  // progress (learned? how many reviews?) rather than dictionary tiers.
  app.get("/api/users/:userId/curriculum", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const language = user.language as Language;
      const curriculum: CurriculumPhase[] = CURRICULA[language] ?? [];

      // Map vocabulary by lowercased target word so we can resolve curriculum
      // words to their vocab id, then to the user's progress for that word.
      const allVocab = await storage.getAllVocabulary(language);
      const vocabByWord = new Map<string, typeof allVocab[number]>();
      for (const v of allVocab) vocabByWord.set(v.targetWord.toLowerCase().trim(), v);

      const allProgress = await storage.getAllLearningProgress(userId);
      const progressByWordId = new Map<string, typeof allProgress[number]>();
      for (const p of allProgress) progressByWordId.set(p.wordId, p);

      let totalWords = 0;
      let learnedWords = 0;

      const phases = curriculum.map((p) => {
        let phaseTotal = 0;
        let phaseLearned = 0;
        const subthemes = p.subthemes.map((s) => {
          let subTotal = 0;
          let subLearned = 0;
          const words = s.words.map((entry) => {
            const vocab = vocabByWord.get(entry.word.toLowerCase().trim()) ?? null;
            const prog = vocab ? progressByWordId.get(vocab.id) ?? null : null;
            const isLearned = prog?.isLearned ?? false;
            subTotal++;
            if (isLearned) subLearned++;
            return {
              word: entry.word,
              english: entry.english,
              inVocab: vocab !== null,
              isLearned,
              reviewCount: prog?.reviewCount ?? 0,
            };
          });
          phaseTotal += subTotal;
          phaseLearned += subLearned;
          return { name: s.name, totalWords: subTotal, learnedWords: subLearned, words };
        });
        totalWords += phaseTotal;
        learnedWords += phaseLearned;
        return {
          phase: p.phase,
          name: p.name,
          goal: p.goal,
          color: p.color,
          totalWords: phaseTotal,
          learnedWords: phaseLearned,
          subthemes,
        };
      });

      res.json({ phases, stats: { totalWords, learnedWords } });
    } catch (error) {
      console.error("Error fetching user curriculum:", error);
      res.status(500).json({ error: "Failed to fetch curriculum" });
    }
  });

  // Get words to learn for a user
  app.get("/api/users/:userId/words/learn", async (req, res) => {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 5;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const words = await storage.getWordsToLearn(userId, user.language as Language, limit);
      res.json(words);
    } catch (error) {
      console.error("Error fetching words to learn:", error);
      res.status(500).json({ error: "Failed to fetch words to learn" });
    }
  });

  // Get words due for review for a user
  app.get("/api/users/:userId/words/review", async (req, res) => {
    try {
      const { userId } = req.params;

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const words = await storage.getWordsToReview(userId, user.language as Language);
      res.json(words);
    } catch (error) {
      console.error("Error fetching words to review:", error);
      res.status(500).json({ error: "Failed to fetch words to review" });
    }
  });

  function parseTzOffset(req: Request): number {
    const raw = req.query.tzOffsetMinutes;
    const n = typeof raw === "string" ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) ? n : 0;
  }

  function localTodayStartUtc(tzOffsetMinutes: number): Date {
    const nowUtcMs = Date.now();
    const localNowMs = nowUtcMs - tzOffsetMinutes * 60_000;
    const localMidnightMs = Math.floor(localNowMs / 86_400_000) * 86_400_000;
    return new Date(localMidnightMs + tzOffsetMinutes * 60_000);
  }

  // Daily missions: progress counters for the 3 daily tasks
  app.get("/api/users/:userId/daily-missions", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const todayStart = localTodayStartUtc(parseTzOffset(req));
      const counts = await storage.getDailyMissionCounts(userId, user.language as Language, todayStart);
      res.json({
        wordCatch: { completed: counts.wordCatch, target: 1 },
        reviewOld: { completed: counts.reviewOld, target: 10 },
        learnNew: { completed: counts.learnNew, target: 10 },
        reviewNew: { completed: counts.reviewNew, target: 10 },
      });
    } catch (error) {
      console.error("Error fetching daily missions:", error);
      res.status(500).json({ error: "Failed to fetch daily missions" });
    }
  });

  // Beacon: WordCatchGame calls this when a game session ends
  app.post("/api/users/:userId/word-catch-played", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      await storage.incrementWordCatchPlay(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error recording word-catch play:", error);
      res.status(500).json({ error: "Failed to record word-catch play" });
    }
  });

  // Mission 1 source: review-due words excluding today's newly-learned
  app.get("/api/users/:userId/words/review-old", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const todayStart = localTodayStartUtc(parseTzOffset(req));
      const words = await storage.getWordsToReviewOldOnly(userId, user.language as Language, todayStart);
      res.json(words);
    } catch (error) {
      console.error("Error fetching review-old words:", error);
      res.status(500).json({ error: "Failed to fetch review-old words" });
    }
  });

  // Mission 3 source: words learned today (for consolidation review)
  app.get("/api/users/:userId/words/learned-today", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const todayStart = localTodayStartUtc(parseTzOffset(req));
      const words = await storage.getWordsLearnedToday(userId, user.language as Language, todayStart);
      res.json(words);
    } catch (error) {
      console.error("Error fetching learned-today words:", error);
      res.status(500).json({ error: "Failed to fetch learned-today words" });
    }
  });

  // Mark word as learned for a user
  app.post("/api/users/:userId/words/:wordId/learn", async (req, res) => {
    try {
      const { userId, wordId } = req.params;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const word = await storage.getVocabularyById(wordId);
      if (!word) {
        return res.status(404).json({ error: "Word not found" });
      }

      let progress = await storage.getLearningProgress(userId, wordId);
      
      if (!progress) {
        const initial = getInitialProgress();
        progress = await storage.createLearningProgress({
          userId,
          wordId,
          isLearned: true,
          learnedAt: new Date(),
          reviewCount: 0,
          easeFactor: initial.easeFactor,
          interval: initial.interval,
          repetitions: initial.repetitions,
          nextReviewDate: initial.nextReviewDate,
          lastReviewDate: new Date(),
        });
      } else {
        const initial = getInitialProgress();
        await storage.updateLearningProgress(progress.id, {
          isLearned: true,
          learnedAt: progress.learnedAt || new Date(),
          easeFactor: initial.easeFactor,
          interval: initial.interval,
          repetitions: initial.repetitions,
          nextReviewDate: initial.nextReviewDate,
          lastReviewDate: new Date(),
        });
      }

      const stats = await storage.getOrCreateTodayStats(userId);
      await storage.updateTodayStats(userId, {
        wordsLearned: (stats.wordsLearned ?? 0) + 1,
      });

      res.json({ success: true, progress });
    } catch (error) {
      console.error("Error marking word as learned:", error);
      res.status(500).json({ error: "Failed to mark word as learned" });
    }
  });

  // Review a word for a user
  const reviewSchema = z.object({
    knowsIt: z.boolean(),
  });

  app.post("/api/users/:userId/words/:wordId/review", async (req, res) => {
    try {
      const { userId, wordId } = req.params;
      const parsed = reviewSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      const { knowsIt } = parsed.data;
      
      const progress = await storage.getLearningProgress(userId, wordId);
      if (!progress) {
        return res.status(404).json({ error: "Word not in learning progress" });
      }

      const quality = mapButtonToQuality(knowsIt);
      const sm2Result = calculateSM2(
        quality,
        progress.easeFactor ?? 250,
        progress.interval ?? 0,
        progress.repetitions ?? 0
      );

      await storage.updateLearningProgress(progress.id, {
        easeFactor: sm2Result.easeFactor,
        interval: sm2Result.interval,
        repetitions: sm2Result.repetitions,
        nextReviewDate: sm2Result.nextReviewDate,
        lastReviewDate: new Date(),
        reviewCount: (progress.reviewCount ?? 0) + 1,
      });

      const stats = await storage.getOrCreateTodayStats(userId);
      await storage.updateTodayStats(userId, {
        wordsReviewed: (stats.wordsReviewed ?? 0) + 1,
      });

      res.json({ success: true, nextReview: sm2Result.nextReviewDate });
    } catch (error) {
      console.error("Error reviewing word:", error);
      res.status(500).json({ error: "Failed to review word" });
    }
  });

  // Get session stats for a user
  app.get("/api/users/:userId/stats", async (req, res) => {
    try {
      const { userId } = req.params;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const stats = await storage.getOrCreateTodayStats(userId);
      const allProgress = await storage.getAllLearningProgress(userId);
      const wordsToReview = await storage.getWordsToReview(userId, user.language as Language);
      const wordsToLearn = await storage.getWordsToLearn(userId, user.language as Language, 100);
      
      const totalLearned = allProgress.filter(p => p.isLearned).length;
      
      res.json({
        wordsToday: (stats.wordsLearned ?? 0) + (stats.wordsReviewed ?? 0),
        totalLearned,
        streak: stats.streak ?? 0,
        wordsToReview: wordsToReview.length,
        wordsToLearn: wordsToLearn.length,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // ==================== TTS ROUTES ====================

  // Speech-to-text transcription using ElevenLabs Scribe v2
  app.post("/api/transcribe", async (req, res) => {
    try {
      const { audioData, mimeType, language } = req.body;
      
      if (!audioData) {
        return res.status(400).json({ error: "No audio data provided" });
      }

      const audioBuffer = Buffer.from(audioData, 'base64');
      
      // Map language to ISO-639 code - MUST be explicit to prevent English transcription
      const langCode = language === 'spanish' ? 'es' : 'ru';
      console.log(`Transcribing audio: mimeType: ${mimeType || 'audio/webm'}, buffer size: ${audioBuffer.length} bytes, target language: ${language} (${langCode})`);
      
      // Create form data using Web FormData API (compatible with Node fetch)
      const formData = new FormData();
      const audioBlob = new Blob([audioBuffer], { type: mimeType || 'audio/webm' });
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model_id', 'scribe_v1');
      // Explicitly set the language code to force transcription in target language only
      formData.append('language_code', langCode);
      // Disable auto-detect to prevent falling back to English
      formData.append('tag_audio_events', 'false');
      
      console.log(`Calling ElevenLabs Scribe API with forced language: ${langCode}`);
      
      const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY!,
        },
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("ElevenLabs STT error:", response.status, errorText);
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json() as { text?: string };
      console.log("ElevenLabs transcription result:", result);

      res.json({ 
        text: result.text?.trim() || '',
        success: true 
      });
    } catch (error: any) {
      console.error("Error transcribing audio:", error);
      console.error("Error details:", error?.message);
      res.status(500).json({ error: "Failed to transcribe audio", details: error?.message || String(error) });
    }
  });

  // Same-origin proxy to the local Whisper ASR server (asr_server/server.py).
  // Lets an HTTPS page (phone over a tunnel) reach the http-only local ASR box
  // without mixed-content/CORS issues. Body: { audioBase64, targets, lang }.
  app.post("/api/asr-local", async (req, res) => {
    try {
      const { audioBase64, targets, lang } = req.body || {};
      if (!audioBase64) return res.status(400).json({ error: "No audioBase64" });
      const url = process.env.ASR_LOCAL_URL || "http://localhost:8756/asr";
      const audioBuffer = Buffer.from(audioBase64, "base64");

      const form = new FormData();
      form.append("file", new Blob([audioBuffer], { type: "audio/wav" }), "clip.wav");
      form.append("targets", String(targets || ""));
      form.append("lang", String(lang || "russian"));

      const t0 = Date.now();
      const upstream = await fetch(url, { method: "POST", body: form });
      if (!upstream.ok) {
        const txt = await upstream.text();
        return res.status(502).json({ error: `ASR server ${upstream.status}`, details: txt });
      }
      const data = await upstream.json() as Record<string, unknown>;
      res.json({ ...data, proxy_ms: Date.now() - t0 });
    } catch (error: any) {
      res.status(500).json({ error: "asr-local proxy failed", details: error?.message || String(error) });
    }
  });

  // ── MOVA game factory + review portal ────────────────────────────────────

  // Approved levels for the world map (returns playable engine configs).
  app.get("/api/levels", async (_req, res) => {
    const approved = await gameLevels.approved();
    res.json({ levels: approved.map((l) => l.config) });
  });

  // Any single level's config (approved OR draft) — lets the portal preview drafts.
  app.get("/api/levels/:id", async (req, res) => {
    const l = await gameLevels.get(req.params.id);
    if (!l) return res.status(404).json({ error: "not found" });
    res.json({ level: l.config });
  });

  // Review queue: draft levels with judge scores.
  app.get("/api/review/queue", async (_req, res) => {
    const drafts = await gameLevels.drafts();
    res.json({ drafts });
  });

  // Admin studio: EVERY factory level regardless of status (handmade ones live in client code).
  app.get("/api/admin/levels", async (_req, res) => {
    res.json({ levels: await gameLevels.all() });
  });

  // Delete a factory level (cleanup / discard).
  app.delete("/api/levels/:id", async (req, res) => {
    const ok = await gameLevels.remove(req.params.id);
    res.json({ ok });
  });

  // Approve / reject a draft. Comment becomes tomorrow-night's iteration prompt.
  app.post("/api/review/:id", async (req, res) => {
    const { decision, comment } = req.body || {};
    const status = decision === "approve" ? "approved" : "rejected";
    const l = await gameLevels.setStatus(req.params.id, status, comment);
    if (!l) return res.status(404).json({ error: "not found" });
    if (l.config) l.config.status = status;
    await gameLevels.upsert(l);
    res.json({ ok: true, level: l });
  });

  // Generate a level on demand (also used by the nightly CLI). Body = CurriculumSpec.
  app.post("/api/factory/generate", async (req, res) => {
    try {
      const spec = req.body as CurriculumSpec;
      if (!spec?.engine || !spec?.lang || !spec?.vocabDomain) {
        return res.status(400).json({ error: "engine, lang, vocabDomain required" });
      }
      const level = await runFactory(spec);
      res.json({ ok: true, level });
    } catch (error: any) {
      res.status(500).json({ error: "factory failed", details: error?.message || String(error) });
    }
  });

  // ── Visual style sheets (image-gen previews for the house art style) ──────
  // A fixed subject sheet rendered in each candidate style → apples-to-apples comparison.
  const STYLE_SUBJECTS_BASE =
    "A children's mobile-game asset sheet on a clean flat pale background. In one horizontal row, evenly spaced and fully visible: " +
    "(1) a cheerful little girl chef with a white chef hat, (2) a shiny red apple, (3) a happy orange cat, (4) a small wooden crate. " +
    "All four share ONE consistent art style. Bright, friendly, wholesome, appealing to a 6-year-old girl. No text, no words, no letters, no watermark.";
  const STYLE_SUBJECTS_ISO =
    STYLE_SUBJECTS_BASE +
    " CRITICAL CAMERA: every subject is drawn in TRUE isometric / dimetric 2:1 video-game perspective (classic Eastward / Habbo / SNES-RPG angle) — characters three-quarter turned so front AND one side read, props sit on an isometric ground plane. NOT front-facing, NOT orthographic top-down.";

  app.get("/api/styles/examples", async (_req, res) => {
    res.json({ examples: await getStyleExamples() });
  });

  /** Resolve a VisualStyle: request styleId → persisted house style → catalog default. */
  async function resolveStyle(styleId?: string) {
    const requested = styleId ? VISUAL_STYLES.find((s) => s.id === styleId) : undefined;
    if (requested) return requested;
    const activeId = await getActiveStyleId();
    return VISUAL_STYLES.find((s) => s.id === activeId) || VISUAL_STYLES[0];
  }

  /** Public URL of the generated style example sheet (visual style lock), if any. */
  async function styleExampleRef(styleId: string): Promise<{ url: string } | null> {
    const examples = await getStyleExamples();
    const url = examples[styleId];
    if (!url || typeof url !== "string") return null;
    return { url: url.replace(/\?.*$/, "") };
  }

  app.get("/api/styles/active", async (_req, res) => {
    const styleId = await getActiveStyleId();
    const style = VISUAL_STYLES.find((s) => s.id === styleId) || VISUAL_STYLES[0];
    const favorites = await getFavoriteIds();
    res.json({ styleId: style.id, style, favorites });
  });

  app.post("/api/styles/active", async (req, res) => {
    const { styleId } = req.body || {};
    const style = VISUAL_STYLES.find((s) => s.id === styleId);
    if (!style) return res.status(400).json({ error: "unknown styleId" });
    await setActiveStyleId(style.id);
    const favorites = await getFavoriteIds();
    res.json({ ok: true, styleId: style.id, style, favorites });
  });

  app.post("/api/styles/favorite", async (req, res) => {
    const { styleId } = req.body || {};
    if (!VISUAL_STYLES.find((s) => s.id === styleId)) return res.status(400).json({ error: "unknown styleId" });
    const favorites = await toggleFavorite(styleId);
    res.json({ ok: true, favorites });
  });

  // ── Media providers (OpenAI / ElevenLabs vs xAI) ───────────────────────────
  app.get("/api/media/providers", async (_req, res) => {
    const providers = await getMediaProviders();
    res.json({
      ...providers,
      xaiConfigured: xaiConfigured(),
      xaiVoices: XAI_VOICES,
    });
  });

  app.post("/api/media/providers", async (req, res) => {
    const patch = req.body || {};
    const providers = await setMediaProviders(patch);
    res.json({ ok: true, ...providers, xaiConfigured: xaiConfigured(), xaiVoices: XAI_VOICES });
  });

  app.post("/api/styles/example", async (req, res) => {
    try {
      const { styleId } = req.body || {};
      const style = VISUAL_STYLES.find((s) => s.id === styleId);
      if (!style) return res.status(400).json({ error: "unknown styleId" });

      const prompt = `${isIsometricStyle(style) ? STYLE_SUBJECTS_ISO : STYLE_SUBJECTS_BASE}\n\nArt style: ${style.recipe}.`;
      const prefs = await getMediaProviders();
      let b64: string;
      if (prefs.imageProvider === "xai") {
        if (!xaiConfigured()) return res.status(400).json({ error: "XAI_API_KEY not set" });
        const buf = await xaiGenerateImage({ prompt, model: prefs.xaiImageModel, size: "1536x1024" });
        b64 = buf.toString("base64");
      } else {
        const gen = await openai.images.generate({ model: "gpt-image-2", prompt, size: "1536x1024", quality: "low", n: 1 });
        b64 = gen.data?.[0]?.b64_json || "";
        if (!b64) throw new Error("no image data from OpenAI");
      }

      const baseUrl = await saveImageFromBase64(`style-${style.id}`, b64);
      const url = `${baseUrl}?v=${Date.now()}`;
      await setStyleExample(style.id, url);
      res.json({ ok: true, url, provider: prefs.imageProvider });
    } catch (error: any) {
      console.error("style example gen failed:", error?.message || error);
      res.status(500).json({ error: "generation failed", details: error?.message || String(error) });
    }
  });

  // ── Game sprite / video assets (generated in the chosen house style) ──────
  // Manifest of key → same-origin proxy path (so Phaser/WebGL can texture them).
  app.get("/api/assets", async (_req, res) => {
    const map = await getGameAssets();
    const out: Record<string, string> = {};
    for (const [key, url] of Object.entries(map)) out[key] = assetProxyPath(key, url);
    res.json({ assets: out });
  });

  // All generations kept per logical key (newest first), with which one is current.
  app.get("/api/assets/history", async (_req, res) => {
    const hist = await getAssetHistory();
    const map = await getGameAssets();
    const out: Record<string, any> = {};
    for (const [k, e] of Object.entries(hist)) {
      out[k] = {
        current: e.current,
        versions: e.versions.slice().sort((a, b) => b.ts - a.ts)
          .map((v) => ({
            key: v.key, ts: v.ts,
            url: assetProxyPath(v.key, map[v.key]),
            current: v.key === e.current,
          })),
      };
    }
    res.json({ history: out });
  });

  // Full audit log of every image generation we ever requested (newest first) — prompt,
  // params, model, S3 url, status. Persisted in the DB (asset_generations table).
  app.get("/api/assets/generations", async (req, res) => {
    try {
      const limit = Math.min(1000, Math.max(1, parseInt(String(req.query.limit || "300"), 10) || 300));
      const rows = await db.select().from(assetGenerations).orderBy(desc(assetGenerations.createdAt)).limit(limit);
      res.json({ generations: rows });
    } catch (e: any) {
      res.status(500).json({ error: "failed to load generation log", details: e?.message || String(e) });
    }
  });

  // Pick which past generation is the active one for a frame (the "compile" action).
  app.post("/api/assets/select", async (req, res) => {
    try {
      const { key, versionKey } = req.body || {};
      if (!key || !versionKey) return res.status(400).json({ error: "key + versionKey required" });
      const map = await getGameAssets();
      const url = map[versionKey];
      if (!url) return res.status(400).json({ error: "unknown version" });
      await setGameAsset(key, url);
      const ok = await setCurrentVersion(key, versionKey);
      res.json({ ok, key, url: assetProxyPath(key, url) });
    } catch (e: any) { res.status(500).json({ error: "select failed", details: e?.message || String(e) }); }
  });

  // Remove a version from the browsable history (S3 object is left in place).
  app.post("/api/assets/version/delete", async (req, res) => {
    const { key, versionKey } = req.body || {};
    if (!key || !versionKey) return res.status(400).json({ error: "key + versionKey required" });
    await deleteAssetVersion(key, versionKey);
    res.json({ ok: true });
  });

  // Stream an asset image from S3 through our origin (avoids Phaser CORS taint).
  app.get("/api/assets/img/:key", async (req, res) => {
    try {
      const map = await getGameAssets();
      const url = map[req.params.key];
      if (!url) return res.status(404).end();
      if (isVideoAssetKey(req.params.key, url)) {
        return res.redirect(302, `/api/assets/video/${req.params.key}`);
      }
      const r = await fetch(url);
      if (!r.ok) return res.status(502).end();
      res.set("Content-Type", r.headers.get("content-type") || "image/png");
      // The proxy URL (/api/assets/img/<key>) is STABLE but its target changes whenever the
      // asset is regenerated, so it must NOT be cached hard, or the browser/game keeps showing
      // the old sprite after a regen. Vary on the Studio ?v= bust token too.
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      // Fingerprint the upstream S3 URL (includes ?v=ts) so intermediaries don't reuse bytes.
      res.set("ETag", `"${Buffer.from(String(url)).toString("base64url")}"`);
      res.send(Buffer.from(await r.arrayBuffer()));
    } catch { res.status(500).end(); }
  });

  // Stream an asset MP4/WebM from S3 through our origin (Phaser Video + Studio preview).
  app.get("/api/assets/video/:key", async (req, res) => {
    try {
      const map = await getGameAssets();
      const url = map[req.params.key];
      if (!url) return res.status(404).end();
      const upstream = String(url).replace(/\?.*$/, "");
      const range = req.headers.range;
      const headers: Record<string, string> = {};
      if (range) headers.Range = range;
      const r = await fetch(upstream, { headers });
      if (!r.ok && r.status !== 206) return res.status(502).end();
      const fallbackType = /\.webm(\?|$)/i.test(upstream) ? "video/webm" : "video/mp4";
      res.status(r.status);
      res.set("Content-Type", r.headers.get("content-type") || fallbackType);
      res.set("Accept-Ranges", "bytes");
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      res.set("Pragma", "no-cache");
      const len = r.headers.get("content-length");
      if (len) res.set("Content-Length", len);
      const cr = r.headers.get("content-range");
      if (cr) res.set("Content-Range", cr);
      res.set("ETag", `"${Buffer.from(String(url)).toString("base64url")}"`);
      res.send(Buffer.from(await r.arrayBuffer()));
    } catch { res.status(500).end(); }
  });

  // Loop trim + keyed flag for animation clips.
  app.get("/api/assets/anim-meta", async (_req, res) => {
    res.json({ meta: await getAnimMeta() });
  });
  app.get("/api/assets/anim-meta/:key", async (req, res) => {
    res.json({ key: req.params.key, meta: (await getClipMeta(req.params.key)) || { loopStart: 0, loopEnd: 0 } });
  });
  app.put("/api/assets/anim-meta/:key", async (req, res) => {
    try {
      const { loopStart, loopEnd, duration, keyed } = req.body || {};
      const meta = await setClipMeta(req.params.key, { loopStart, loopEnd, duration, keyed });
      res.json({ ok: true, key: req.params.key, meta });
    } catch (e: any) {
      res.status(500).json({ error: "meta save failed", details: e?.message || String(e) });
    }
  });

  // ── Reference photos (must be above generate so Regenerate can auto-use them) ──
  const REF_PHOTO_DIR = path.resolve(import.meta.dirname, "data", "ref-photos");
  const refPhotoPath = (key: string) => path.join(REF_PHOTO_DIR, `${String(key).replace(/[^a-z0-9_]/gi, "_")}.png`);
  async function readRefPhoto(key: string): Promise<RefImg | null> {
    try { const buf = await fsp.readFile(refPhotoPath(key)); return { base64Data: buf.toString("base64"), mimeType: "image/png" }; }
    catch { return null; }
  }

  /** Likeness (photo) + house style sheet → character sprite. Shared by from-photo + auto Regenerate. */
  async function generateCharacterFromPhoto(opts: {
    key: string; subject?: string; masterPrompt?: string; styleId?: string;
    matte?: boolean; quality?: string; providerOverride?: string;
  }) {
    const { key } = opts;
    const q = normQuality(opts.quality); const size = "1024x1024";
    const style = await resolveStyle(opts.styleId);
    const prefs = await getMediaProviders();
    const provider = (opts.providerOverride === "xai" || opts.providerOverride === "openai")
      ? opts.providerOverride : prefs.imageProvider;
    const photo = await readRefPhoto(key);
    if (!photo) throw Object.assign(new Error("no reference photo uploaded for this character yet"), { status: 400 });
    const styleSheet = await styleExampleRef(style.id);
    const bgClause = (provider === "xai" || opts.matte) ? "" : " On a plain empty transparent background.";
    const modifier = String(opts.subject || "").trim();
    const master = String(opts.masterPrompt || "").trim()
      || defaultMasterPrompt(style, "character", { fromPhoto: true, hasStyleSheet: !!styleSheet });
    let prompt = composeAssetPrompt(master, modifier);
    if (bgClause) prompt = `${prompt}${bgClause}`;

    const buf = await genSpriteBuffer({
      prompt, size, ref: photo, styleRef: styleSheet, styleRefFirst: !!styleSheet,
      matte: !!opts.matte, quality: q, provider,
      // Quality model is much better at style transfer + likeness than the fast model.
      xaiModel: "grok-imagine-image-quality",
    });
    const { url, v } = await saveNormalizedSprite(key, buf);
    const model = provider === "xai" ? "grok-imagine-image-quality" : (opts.matte ? "gpt-image-2" : SPRITE_MODEL);
    void logGeneration({
      key, kind: "from-photo", model, engine: provider, quality: q, size, styleId: style.id,
      subject: modifier, prompt, proxyUrl: url,
    });
    return { ok: true as const, key, url, v, styleId: style.id, provider, engine: `${model} (from photo)`, usedStyleSheet: !!styleSheet };
  }

  // Generate one sprite in the chosen house art style (transparent bg), cache to S3.
  // Characters with an uploaded ref photo auto-use likeness + style-sheet path.
  app.post("/api/assets/generate", async (req, res) => {
    const { key, subject, masterPrompt, styleId, matte, quality, provider: providerOverride } = req.body || {};
    if (!key) return res.status(400).json({ error: "key required" });
    const modifier = String(subject || "").trim();

    if (String(key).startsWith("char_") && await readRefPhoto(key)) {
      try {
        const result = await generateCharacterFromPhoto({
          key, subject: modifier, masterPrompt, styleId, matte, quality, providerOverride,
        });
        return res.json(result);
      } catch (error: any) {
        console.error("from-photo (via generate) failed:", error?.message || error);
        void logGeneration({ key, kind: "from-photo", model: "xai", engine: "xai", prompt: modifier, status: "error", error: error?.message || String(error) });
        return res.status(error?.status || 500).json({ error: "generation failed", details: error?.message || String(error) });
      }
    }

    const q = normQuality(quality); const size = "1024x1024";
    const style = await resolveStyle(styleId);
    const prefs = await getMediaProviders();
    const provider = (providerOverride === "xai" || providerOverride === "openai") ? providerOverride : prefs.imageProvider;
    const bgClause = (provider === "xai" || matte) ? "" : " On a plain empty transparent background.";
    const styleSheet = await styleExampleRef(style.id);
    const kind = promptKindForKey(String(key));
    const master = String(masterPrompt || "").trim()
      || defaultMasterPrompt(style, kind, { hasStyleSheet: !!styleSheet });
    let prompt = composeAssetPrompt(master, modifier);
    if (bgClause) prompt = `${prompt}${bgClause}`;
    try {
      if (!modifier && !masterPrompt) return res.status(400).json({ error: "subject or masterPrompt required" });
      const buf = await genSpriteBuffer({
        prompt, size, matte: !!matte, quality: q, provider,
        styleRef: styleSheet,
        xaiModel: styleSheet ? "grok-imagine-image-quality" : undefined,
      });
      const { url, v } = await saveNormalizedSprite(key, buf);
      const model = provider === "xai" ? (styleSheet ? "grok-imagine-image-quality" : prefs.xaiImageModel) : (matte ? "gpt-image-2" : SPRITE_MODEL);
      void logGeneration({ key, kind: "base", model, engine: provider, quality: q, size, styleId: style.id, subject: modifier, prompt, proxyUrl: url });
      res.json({ ok: true, key, url, v, styleId: style.id, provider, engine: model, usedStyleSheet: !!styleSheet });
    } catch (error: any) {
      console.error("asset gen failed:", error?.message || error);
      void logGeneration({ key, kind: "base", model: provider, engine: provider, quality: q, size, styleId: style.id, subject: modifier, prompt, status: "error", error: error?.message || String(error) });
      res.status(500).json({ error: "generation failed", details: error?.message || String(error) });
    }
  });

  // Generate an ENVIRONMENT tile (floor / wall / counter). For isometric house styles
  // we punch white corners → tight 2:1 diamond PNG (no character normalizeFrame).
  app.post("/api/assets/generate-tile", async (req, res) => {
    const { key, subject, masterPrompt, styleId, quality, provider: providerOverride } = req.body || {};
    const q = normQuality(quality); const size = "1024x1024";
    const style = await resolveStyle(styleId);
    const prefs = await getMediaProviders();
    const provider = (providerOverride === "xai" || providerOverride === "openai") ? providerOverride : prefs.imageProvider;
    const modifier = String(subject || "").trim();
    const master = String(masterPrompt || "").trim() || defaultMasterPrompt(style, "tile");
    const prompt = composeAssetPrompt(master, modifier);
    try {
      if (!key || (!modifier && !masterPrompt)) return res.status(400).json({ error: "key + subject or masterPrompt required" });
      let png: Buffer;
      let modelLabel: string;
      if (provider === "xai") {
        if (!xaiConfigured()) return res.status(400).json({ error: "XAI_API_KEY not set" });
        png = await xaiGenerateImage({ prompt, model: prefs.xaiImageModel, size });
        modelLabel = prefs.xaiImageModel;
      } else {
        const gen = await openai.images.generate({ model: "gpt-image-2", prompt, size, quality: q, n: 1 } as any);
        const b64 = gen.data?.[0]?.b64_json;
        if (!b64) throw new Error("no image data from OpenAI");
        png = Buffer.from(b64, "base64");
        modelLabel = "gpt-image-2";
      }
      // Iso tiles: cut paper-white corners so diamonds tile cleanly in Phaser
      if (String(key).startsWith("env_")) {
        try { png = await punchIsoTileBackground(png); } catch (e: any) {
          console.warn("punchIsoTileBackground skipped:", e?.message || e);
        }
      }
      const { url, v } = await saveVersioned(key, png);
      void logGeneration({ key, kind: "tile", model: modelLabel, engine: `tile:${provider}`, quality: q, size, styleId: style.id, subject: modifier, prompt, proxyUrl: url });
      res.json({ ok: true, key, url, v, styleId: style.id, provider, engine: `${modelLabel} tile` });
    } catch (error: any) {
      console.error("tile gen failed:", error?.message || error);
      void logGeneration({ key, kind: "tile", model: provider, engine: "tile", quality: q, size, styleId: style.id, subject: modifier, prompt, status: "error", error: error?.message || String(error) });
      res.status(500).json({ error: "tile generation failed", details: error?.message || String(error) });
    }
  });

  // Reference photo upload/read endpoints (helpers declared above generate).
  app.post("/api/assets/upload-photo", async (req, res) => {
    try {
      const { key, photoBase64 } = req.body || {};
      if (!key || !photoBase64) return res.status(400).json({ error: "key + photoBase64 required" });
      const raw = Buffer.from(String(photoBase64).replace(/^data:[^,]+,/, ""), "base64");
      // .rotate() bakes EXIF orientation, then the re-encode drops ALL metadata (incl. GPS)
      const png = await sharp(raw).rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).png().toBuffer();
      await fsp.mkdir(REF_PHOTO_DIR, { recursive: true });
      await fsp.writeFile(refPhotoPath(key), png);
      res.json({ ok: true, key, url: `/api/assets/refphoto/${key}?v=${Date.now()}` });
    } catch (error: any) {
      console.error("photo upload failed:", error?.message || error);
      res.status(500).json({ error: "upload failed", details: error?.message || String(error) });
    }
  });

  app.get("/api/assets/has-photo/:key", async (req, res) => {
    res.json({ has: !!(await readRefPhoto(req.params.key)) });
  });

  app.get("/api/assets/refphoto/:key", async (req, res) => {
    const photo = await readRefPhoto(req.params.key);
    if (!photo) return res.status(404).end();
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store"); // private, don't cache the child's photo
    res.send(Buffer.from(photo.base64Data, "base64"));
  });

  app.delete("/api/assets/photo/:key", async (req, res) => {
    try { await fsp.unlink(refPhotoPath(req.params.key)); } catch { /* already gone */ }
    res.json({ ok: true });
  });

  // Generate a character sprite FROM the uploaded reference photo + house style sheet.
  app.post("/api/assets/generate-from-photo", async (req, res) => {
    const { key, subject, masterPrompt, styleId, matte, quality, provider: providerOverride } = req.body || {};
    if (!key) return res.status(400).json({ error: "key required" });
    try {
      const result = await generateCharacterFromPhoto({
        key, subject, masterPrompt, styleId, matte, quality, providerOverride,
      });
      res.json(result);
    } catch (error: any) {
      console.error("from-photo gen failed:", error?.message || error);
      void logGeneration({
        key, kind: "from-photo", model: String(providerOverride || "xai"), engine: String(providerOverride || "xai"),
        styleId, subject: String(subject || ""), prompt: String(subject || ""),
        status: "error", error: error?.message || String(error),
      });
      res.status(error?.status || 500).json({ error: "generation failed", details: error?.message || String(error) });
    }
  });

  // Default master prompt for the Studio inspector (keeps client/server in sync).
  app.get("/api/assets/master-prompt", async (req, res) => {
    const style = await resolveStyle(String(req.query.styleId || ""));
    const key = String(req.query.key || "");
    const fromPhoto = req.query.fromPhoto === "1" || req.query.fromPhoto === "true";
    const kind = promptKindForKey(key || "char_x");
    const styleSheet = await styleExampleRef(style.id);
    res.json({
      styleId: style.id,
      kind,
      masterPrompt: defaultMasterPrompt(style, kind, { fromPhoto, hasStyleSheet: !!styleSheet }),
      hasStyleSheet: !!styleSheet,
    });
  });

  // Generate a flipbook FRAME by editing the base sprite → same character, new pose.
  // Editing (not fresh gen) keeps the design identical so frames don't jitter.
  app.post("/api/assets/generate-frame", async (req, res) => {
    try {
      const { baseKey, frameKey, pose, styleId, matte } = req.body || {};
      if (!baseKey || !frameKey || !pose) return res.status(400).json({ error: "baseKey + frameKey + pose required" });
      const map = await getGameAssets();
      const baseUrl = map[baseKey];
      if (!baseUrl) return res.status(400).json({ error: `base sprite "${baseKey}" not generated yet` });
      const fetched = await fetchImageAsBase64(baseUrl);
      if (!fetched) return res.status(502).json({ error: "could not load base sprite" });

      const style = await resolveStyle(styleId);
      const prefs = await getMediaProviders();
      const providerOverride = req.body?.provider;
      const provider = (providerOverride === "xai" || providerOverride === "openai") ? providerOverride : prefs.imageProvider;
      const q = normQuality(req.body?.quality); const size = "1024x1024";
      const bgClause = (provider === "xai" || matte) ? "" : " On a plain empty transparent background.";
      const cam = cameraClause(style, "character");
      const prompt = `Redraw this EXACT SAME character/object — keep its design, face, colors, outfit, proportions and scale identical — in a new pose/expression: ${pose}. Keep the SAME isometric camera angle as the source. ${cam} Same size and centered, no cast shadow on the ground, clothing blank with no text or letters.\n\nArt style: ${style.recipe}.${bgClause}`;
      const buf = await genSpriteBuffer({ prompt, size, ref: fetched, matte: !!matte, quality: q, provider });
      const { url, v } = await saveNormalizedSprite(frameKey, buf);
      const model = provider === "xai" ? prefs.xaiImageModel : (matte ? "gpt-image-2" : SPRITE_MODEL);
      void logGeneration({ key: frameKey, kind: "frame", model, engine: provider, quality: q, size, styleId: style.id, subject: pose, prompt, proxyUrl: url });
      res.json({ ok: true, key: frameKey, url, v, styleId: style.id, provider, engine: model });
    } catch (error: any) {
      console.error("frame gen failed:", error?.message || error);
      void logGeneration({ key: req.body?.frameKey || req.body?.baseKey || "?", kind: "frame", quality: normQuality(req.body?.quality), prompt: String(req.body?.pose || ""), status: "error", error: error?.message || String(error) });
      res.status(500).json({ error: "frame generation failed", details: error?.message || String(error) });
    }
  });

  // Generate a whole POSE SHEET in one image (the model self-consistifies all poses),
  // then slice + normalize each cell into its own sprite. Far more consistent than N
  // independent edits, and cheaper. Uses the existing base as an identity reference.
  app.post("/api/assets/generate-sheet", async (req, res) => {
    try {
      const { baseKey, poses, cols, rows, styleId, size, matte, rawKey, sequence, motion } = req.body || {};
      if (!baseKey || !Array.isArray(poses) || !poses.length || !cols || !rows) {
        return res.status(400).json({ error: "baseKey + poses[] + cols + rows required" });
      }
      const rawAssetKey = rawKey || `${baseKey}__sheetraw`;
      const style = await resolveStyle(styleId);
      const prefs = await getMediaProviders();
      const providerOverride = req.body?.provider;
      const provider = (providerOverride === "xai" || providerOverride === "openai") ? providerOverride : prefs.imageProvider;
      const map = await getGameAssets();
      const ref = map[baseKey] ? await fetchImageAsBase64(map[baseKey]) : null;
      const bgClause = (provider === "xai" || matte) ? "" : " on a plain empty transparent background";
      const refClause = ref ? " Match the character's design exactly to the provided reference image." : "";

      const camSheet = cameraClause(style, "sheet");
      let prompt: string;
      if (sequence) {
        // Motion CYCLE: sequential keyframes — iso house styles keep dimetric angle; else three-quarter side.
        const motionWord = motion || "movement";
        const cells = poses.map((p: any, i: number) => `Cell ${i + 1} — ${p.pose}`).join("\n");
        const view = isIsometricStyle(style)
          ? `${camSheet} Body oriented toward screen-right travel so stride AND arm swing read in isometric depth.`
          : "drawn in a clear THREE-QUARTER SIDE VIEW: her body turned about 45 degrees toward the direction of travel (screen right) so that BOTH the stride of her legs AND the swing of her arms are clearly visible from the side, while her face still reads.";
        prompt = `A ${rows}-row by ${cols}-column sprite grid of ONE single game character mid-${motionWord}-cycle, ${view} These are SEQUENTIAL animation keyframes of one continuous ${motionWord}; read left-to-right then top-to-bottom, each frame advances the motion by one step and the last frame loops smoothly back into the first. Every cell is the EXACT SAME character — identical design, face, hair, colors, outfit, proportions and scale — in this art style: ${style.recipe}. All figures are the exact same scale and share the same feet baseline (vertically aligned), but do NOT draw any ground line, floor, horizon or shadow. "Front" leg/arm = toward the travel direction, "back" = away from it. No cast shadow on the ground, clothing blank with no letters${bgClause}. Render each cell EXACTLY as written, following the described foot AND hand positions precisely:\n${cells}\nRULES: In EVERY frame the arms must be clearly SWINGING in opposition to the legs — one hand reaching forward in front of her body and the other pulled back behind her hip (for a run, both arms bent about ninety degrees, fists pumping) — the arms must NEVER hang straight down at her sides. Exaggerate the leg stride, the arm swing and the up-and-down body bob like a lively cartoon. Every cell must be a visibly DIFFERENT pose — do NOT repeat any stance, do NOT draw the same pose twice, do NOT fall back to a plain standing or idle pose. One character per cell, nothing overlapping the cell edges, no text or numbers or labels drawn anywhere.${refClause}`;
      } else {
        const list = poses.map((p: any, i: number) => `${i + 1}) ${p.pose}`).join("; ");
        prompt = `A children's mobile-game character pose sheet for an isometric tile video game: ONE single character in a ${rows}-row by ${cols}-column grid${bgClause}. ${camSheet} Every pose is the EXACT SAME character — identical design, face, hair, colors, outfit, proportions and scale. Each pose sits fully inside its own grid cell without overlapping neighbors, all the same size, standing on the same baseline, no cast shadow on the ground, clothing completely blank with no text or letters. The ${poses.length} poses, left-to-right then top-to-bottom, are: ${list}.\n\nArt style: ${style.recipe}.${refClause}`;
      }

      const sizeStr = size || "1536x1024";
      const q = normQuality(req.body?.quality);
      const sheetBuf = await genSpriteBuffer({ prompt, size: sizeStr, ref, matte: !!matte, quality: q, provider });

      // keep the raw sheet so we can re-slice without paying to regenerate
      const sheetS3 = await saveImageFromBase64(`asset-${rawAssetKey}`, sheetBuf.toString("base64"));
      await setGameAsset(rawAssetKey, `${sheetS3}?v=${Date.now()}`);

      const { mode, results } = await sliceSaveSheet(sheetBuf, poses, cols, rows);
      const model = provider === "xai" ? prefs.xaiImageModel : (matte ? "gpt-image-2" : SPRITE_MODEL);
      void logGeneration({ key: rawAssetKey, kind: "sheet", model, engine: provider, quality: q, size: sizeStr, styleId: style.id, subject: `${poses.length} poses${motion ? " · " + motion : ""}`, prompt, proxyUrl: `/api/assets/img/${rawAssetKey}` });
      res.json({ ok: true, sliceMode: mode, sheet: `/api/assets/img/${rawAssetKey}`, results, provider, engine: model });
    } catch (error: any) {
      console.error("sheet gen failed:", error?.message || error);
      void logGeneration({ key: req.body?.rawKey || `${req.body?.baseKey}__sheetraw`, kind: "sheet", quality: normQuality(req.body?.quality), prompt: "sheet", status: "error", error: error?.message || String(error) });
      res.status(500).json({ error: "sheet generation failed", details: error?.message || String(error) });
    }
  });

  // Animate a sprite (or any image URL) into a short video via xAI Grok Imagine Video.
  // Body: { key?, prompt, imageUrl?, duration?, resolution? }
  // If `key` is given and imageUrl omitted, uses the current sprite for that key.
  app.post("/api/assets/generate-video", async (req, res) => {
    try {
      if (!xaiConfigured()) return res.status(400).json({ error: "XAI_API_KEY not set" });
      const prefs = await getMediaProviders();
      if (prefs.videoProvider === "off") return res.status(400).json({ error: "video provider is off" });

      const { key, prompt, imageUrl, duration, resolution } = req.body || {};
      if (!prompt && !key && !imageUrl) {
        return res.status(400).json({ error: "prompt (and key or imageUrl) required" });
      }
      let still = imageUrl as string | undefined;
      if (!still && key) {
        const map = await getGameAssets();
        const s3 = map[key];
        if (!s3) return res.status(400).json({ error: `no sprite for key "${key}"` });
        // Prefer public S3 URL; otherwise inline as data URI (xAI can't reach localhost).
        if (s3.startsWith("http")) {
          still = s3.replace(/\?.*$/, "");
        } else {
          const fetched = await fetchImageAsBase64(s3);
          if (!fetched) return res.status(502).json({ error: `could not load sprite for "${key}"` });
          still = `data:${fetched.mimeType || "image/png"};base64,${fetched.base64Data}`;
        }
      }
      const motion = String(prompt || "Gentle idle animation, wholesome children's game, soft bounce, keep the character centered");
      const result = await xaiGenerateVideo({
        prompt: motion,
        model: prefs.xaiVideoModel,
        imageUrl: still,
        duration: Math.min(15, Math.max(1, Number(duration) || 6)),
        resolution: resolution === "480p" ? "480p" : "720p",
      });
      const mp4 = await xaiDownload(result.url);
      const vkey = videoKey(`vid-${key || "clip"}-${Date.now()}`);
      const s3Url = await uploadMp4(vkey, mp4);
      void logGeneration({
        key: key || "video", kind: "video", model: result.model, engine: "xai-video",
        subject: motion.slice(0, 120), prompt: motion, proxyUrl: s3Url,
      });
      res.json({ ok: true, url: s3Url, requestId: result.requestId, model: result.model, key });
    } catch (error: any) {
      console.error("video gen failed:", error?.message || error);
      const mapped = providerErrorStatus(error);
      res.status(mapped.status).json({
        error: mapped.error === "generation failed" ? "video generation failed" : mapped.error,
        details: mapped.details,
      });
    }
  });

  /** Coalesce concurrent facing-still gens for the same key (bulk "Generate missing"). */
  const facingStillInflight = new Map<string, Promise<{
    key: string; url: string; v: number; s3?: string; prompt: string;
    provider: string; model: string; styleId: string;
  }>>();

  /** Edit base sprite → standing still facing `dir`. Shared seed for all clips of that facing. */
  async function makeFacingStill(opts: {
    baseKey: string;
    facing: IsoDir;
    styleId?: string;
    provider?: string;
    quality?: string;
    matte?: boolean;
    /** When true, regenerate even if a facing still already exists. */
    force?: boolean;
  }) {
    const key = facingStillKey(opts.baseKey, opts.facing);
    const existing = facingStillInflight.get(key);
    if (existing) return existing;

    const job = (async () => {
      const map0 = await getGameAssets();
      if (map0[key] && !opts.force) {
        return {
          key, url: `/api/assets/img/${key}`, v: Date.now(), s3: map0[key],
          prompt: "", provider: "cached", model: "cached", styleId: String(opts.styleId || ""),
        };
      }
      const baseUrl = map0[opts.baseKey];
      if (!baseUrl) {
        throw Object.assign(
          new Error(`base sprite "${opts.baseKey}" not generated yet — generate in Assets first`),
          { status: 400 },
        );
      }
      const fetched = await fetchImageAsBase64(baseUrl);
      if (!fetched) {
        throw Object.assign(new Error("could not load base sprite"), { status: 502 });
      }
      const style = await resolveStyle(opts.styleId);
      const prefs = await getMediaProviders();
      const provider = (opts.provider === "xai" || opts.provider === "openai")
        ? opts.provider
        : prefs.imageProvider;
      const q = normQuality(opts.quality);
      const size = "1024x1024";
      const bgClause = (provider === "xai" || opts.matte) ? "" : " On a plain empty transparent background.";
      // Facing-safe camera: lock iso framing WITHOUT demanding "front + side" (fights N/NW/NE).
      const cam = facingCameraClause();
      const pose = composeFacingStillPrompt(opts.facing);
      const prompt = (
        `Redraw this EXACT SAME character — keep design, face, colors, outfit, proportions and scale identical. ` +
        `${pose} ${cam} ` +
        `Same size and centered, no cast shadow on the ground, clothing blank with no text or letters.\n\n` +
        `Art style: ${style.recipe}.${bgClause}`
      );
      const buf = await genSpriteBuffer({
        prompt, size, ref: fetched, matte: !!opts.matte, quality: q, provider,
      });
      const saved = await saveNormalizedSprite(key, buf);
      const model = provider === "xai" ? prefs.xaiImageModel : (opts.matte ? "gpt-image-2" : SPRITE_MODEL);
      void logGeneration({
        key, kind: "facing", model, engine: provider, quality: q, size,
        styleId: style.id, subject: `face ${opts.facing}`, prompt, proxyUrl: saved.url,
      });
      const s3 = (await getGameAssets())[key];
      return { key, url: saved.url, v: saved.v, s3, prompt, provider, model, styleId: style.id };
    })();

    facingStillInflight.set(key, job);
    try {
      return await job;
    } finally {
      facingStillInflight.delete(key);
    }
  }

  // Generate (or regen) a directional FACING still by editing the base sprite.
  // Body: { baseKey, dir, styleId?, provider?, quality?, matte?, force? }
  // Persists under `baseKey__face_<dir>` — shared seed for idle/walk/run/carry videos.
  app.post("/api/assets/generate-facing-still", async (req, res) => {
    try {
      const { baseKey, dir, styleId, matte, force } = req.body || {};
      if (!baseKey || !dir) return res.status(400).json({ error: "baseKey + dir required" });
      const facing = String(dir).toLowerCase() as IsoDir;
      if (!(ISO_DIRS_8 as readonly string[]).includes(facing)) {
        return res.status(400).json({ error: `invalid dir "${dir}" — use n|ne|e|se|s|sw|w|nw` });
      }
      const out = await makeFacingStill({
        baseKey: String(baseKey),
        facing,
        styleId,
        provider: req.body?.provider,
        quality: req.body?.quality,
        matte: !!matte,
        force: !!force,
      });
      res.json({
        ok: true, key: out.key, url: out.url, v: out.v, dir: facing,
        styleId: out.styleId, provider: out.provider, engine: out.model,
        cached: out.provider === "cached",
      });
    } catch (error: any) {
      console.error("facing still gen failed:", error?.message || error);
      const mapped = providerErrorStatus(error);
      const status = typeof error?.status === "number" ? error.status : mapped.status;
      void logGeneration({
        key: req.body?.baseKey ? facingStillKey(String(req.body.baseKey), String(req.body.dir || "?")) : "?",
        kind: "facing", quality: normQuality(req.body?.quality),
        prompt: String(req.body?.dir || ""), status: "error", error: mapped.details,
      });
      res.status(status).json({
        error: mapped.error === "generation failed" ? "facing still generation failed" : mapped.error,
        details: error?.message || mapped.details,
      });
    }
  });

  /**
   * Force-regenerate every facing still for a character (corrects bad dirs from
   * older prompts that fought back-facing with "front + side" camera language).
   * Body: { baseKey, dirs?, styleId?, force?: true }
   */
  app.post("/api/assets/regen-facing-stills", async (req, res) => {
    try {
      const baseKey = String(req.body?.baseKey || "");
      if (!baseKey) return res.status(400).json({ error: "baseKey required" });
      const spec = videoClipFor(baseKey, "idle") || videoClipFor(baseKey, "walk");
      const defaultDirs = dirsFor(spec?.directions || (baseKey.includes("grandma") ? 4 : 8));
      const dirs: IsoDir[] = Array.isArray(req.body?.dirs) && req.body.dirs.length
        ? req.body.dirs.map((d: string) => String(d).toLowerCase()).filter((d: string) =>
          (ISO_DIRS_8 as readonly string[]).includes(d)) as IsoDir[]
        : [...defaultDirs];
      if (!dirs.length) return res.status(400).json({ error: "no dirs to regenerate" });
      const results: Array<{ dir: IsoDir; key: string; url: string; v: number; cached?: boolean }> = [];
      const errors: Array<{ dir: string; error: string }> = [];
      for (const facing of dirs) {
        try {
          const out = await makeFacingStill({
            baseKey,
            facing,
            styleId: req.body?.styleId,
            provider: req.body?.provider,
            quality: req.body?.quality,
            matte: !!req.body?.matte,
            force: req.body?.force !== false, // default FORCE for this endpoint
          });
          results.push({
            dir: facing, key: out.key, url: out.url, v: out.v,
            cached: out.provider === "cached",
          });
        } catch (e: any) {
          errors.push({ dir: facing, error: e?.message || String(e) });
        }
      }
      res.json({ ok: errors.length === 0, baseKey, updated: results.length, results, errors });
    } catch (error: any) {
      console.error("regen-facing-stills failed:", error?.message || error);
      res.status(500).json({ error: "regen failed", details: error?.message || String(error) });
    }
  });

  // Generate (or regen) a catalog animation VIDEO clip.
  // Body: { baseKey, clip, dir?, prompt?, duration?, resolution?, keyGreen?, ensureFacing?, forceFacing?, styleId? }
  // Directional clips prefer `baseKey__face_<dir>` as the image-to-video seed (auto-generates
  // that facing still when missing unless ensureFacing:false). Falls back to base still.
  // Persists under `baseKey__vid_<clip>[_dir]`. Auto chroma-keys green → WebM unless keyGreen:false.
  app.post("/api/assets/generate-anim-video", async (req, res) => {
    try {
      if (!xaiConfigured()) return res.status(400).json({ error: "XAI_API_KEY not set" });
      const prefs = await getMediaProviders();
      if (prefs.videoProvider === "off") return res.status(400).json({ error: "video provider is off" });

      const { baseKey, clip, dir, prompt, duration, resolution, keyGreen, ensureFacing, forceFacing, styleId, matte } = req.body || {};
      if (!baseKey || !clip) return res.status(400).json({ error: "baseKey + clip required" });
      const catalog = videoClipFor(String(baseKey), String(clip));
      const motionRaw = String(prompt || catalog?.prompt || "").trim();
      if (!motionRaw) return res.status(400).json({ error: "prompt required (no catalog default)" });

      let facing: IsoDir | null = null;
      if (dir) {
        const d = String(dir).toLowerCase() as IsoDir;
        if (!(ISO_DIRS_8 as readonly string[]).includes(d)) {
          return res.status(400).json({ error: `invalid dir "${dir}" — use n|ne|e|se|s|sw|w|nw` });
        }
        facing = d;
      } else if (catalog?.directions) {
        return res.status(400).json({ error: `clip "${clip}" is directional — pass dir` });
      }

      const map = await getGameAssets();
      const baseS3 = map[String(baseKey)];
      if (!baseS3) {
        return res.status(400).json({
          error: `no base sprite for "${baseKey}" — generate the character in Assets first`,
        });
      }

      // Prefer a per-direction facing still so video starts already oriented (no mid-clip turn).
      let stillSourceKey = String(baseKey);
      let stillS3 = baseS3;
      let facingGenerated: { key: string; url: string; v: number } | null = null;
      if (facing) {
        const faceKey = facingStillKey(String(baseKey), facing);
        const needFace = !!forceFacing || !map[faceKey];
        if (!needFace) {
          stillSourceKey = faceKey;
          stillS3 = map[faceKey];
        } else if (ensureFacing !== false) {
          const out = await makeFacingStill({
            baseKey: String(baseKey),
            facing,
            styleId,
            provider: req.body?.provider,
            quality: req.body?.quality,
            matte: !!matte,
            force: !!forceFacing,
          });
          facingGenerated = { key: out.key, url: out.url, v: out.v };
          stillSourceKey = out.key;
          stillS3 = out.s3 || out.url;
        } else if (map[faceKey]) {
          stillSourceKey = faceKey;
          stillS3 = map[faceKey];
        }
      }

      let still: string;
      if (stillS3.startsWith("http")) {
        still = stillS3.replace(/\?.*$/, "");
      } else {
        const fetched = await fetchImageAsBase64(stillS3);
        if (!fetched) return res.status(502).json({ error: `could not load sprite for "${stillSourceKey}"` });
        still = `data:${fetched.mimeType || "image/png"};base64,${fetched.base64Data}`;
      }

      const motion = composeVideoMotionPrompt(motionRaw, facing);
      const dur = Math.min(15, Math.max(1, Number(duration) || catalog?.durationSec || 4));
      const result = await xaiGenerateVideo({
        prompt: motion,
        model: prefs.xaiVideoModel,
        imageUrl: still,
        duration: dur,
        resolution: resolution === "480p" ? "480p" : "720p",
      });
      const mp4 = await xaiDownload(result.url);
      const key = videoClipKey(String(baseKey), String(clip), facing);
      // Keep raw MP4 as a version, then prefer keyed WebM as current.
      await saveVideoVersioned(key, mp4, { ext: "mp4" });
      let saved = { url: `/api/assets/video/${key}`, v: Date.now() };
      let keyed = false;
      const doKey = keyGreen !== false;
      if (doKey) {
        try {
          const webm = await chromaKeyToWebm(mp4);
          saved = await saveVideoVersioned(key, webm, { ext: "webm" });
          keyed = true;
        } catch (e: any) {
          console.warn("chroma key failed, keeping mp4:", e?.message || e);
        }
      }
      const probed = await probeDurationSec(mp4);
      const prevMeta = await getClipMeta(key);
      await setClipMeta(key, {
        loopStart: prevMeta?.loopStart ?? 0,
        loopEnd: prevMeta?.loopEnd ?? 0,
        duration: probed || dur,
        keyed,
        frameCount: prevMeta?.frameCount,
      });
      void logGeneration({
        key, kind: "video", model: result.model, engine: keyed ? "xai-anim-video+chroma" : "xai-anim-video",
        subject: motionRaw.slice(0, 120), prompt: motion, proxyUrl: saved.url,
      });
      // Auto-extract PNG flipbook for in-game sprite playback (video stays for Studio review).
      let sprites: { frames: Array<{ key: string; url: string; v: number }>; count: number } | null = null;
      let spritesError: string | null = null;
      for (let attempt = 0; attempt < 2 && !sprites; attempt++) {
        try {
          if (attempt > 0 && !keyed) {
            try {
              const webm = await chromaKeyToWebm(mp4);
              saved = await saveVideoVersioned(key, webm, { ext: "webm" });
              keyed = true;
              await setClipMeta(key, {
                loopStart: prevMeta?.loopStart ?? 0,
                loopEnd: prevMeta?.loopEnd ?? 0,
                duration: probed || dur,
                keyed: true,
                frameCount: prevMeta?.frameCount,
              });
            } catch { /* retry extract on current buf anyway */ }
          }
          const extracted = await extractSpritesFromVideoKey(key);
          sprites = { frames: extracted.frames, count: extracted.count };
          spritesError = null;
        } catch (e: any) {
          spritesError = e?.message || String(e);
          console.warn(`auto extract-sprites attempt ${attempt + 1} failed:`, spritesError);
        }
      }
      res.json({
        ok: true, key, url: saved.url, v: saved.v, dir: facing,
        stillKey: stillSourceKey,
        facingStill: facingGenerated,
        requestId: result.requestId, model: result.model,
        kind: catalog?.kind || "loop", duration: probed || dur, keyed,
        sprites,
        spritesError,
        pipeline: ["facing-still", "video", "chroma", "extract-sprites"],
      });
    } catch (error: any) {
      console.error("anim video gen failed:", error?.message || error);
      const mapped = providerErrorStatus(error);
      res.status(mapped.status).json({
        error: mapped.error === "generation failed" ? "anim video generation failed" : mapped.error,
        details: mapped.details,
      });
    }
  });

  // Re-run ffmpeg chromakey on the current video for a clip (green → transparent WebM).
  app.post("/api/assets/key-green", async (req, res) => {
    try {
      const { key } = req.body || {};
      if (!key) return res.status(400).json({ error: "key required" });
      const map = await getGameAssets();
      const url = map[String(key)];
      if (!url) return res.status(404).json({ error: "asset not found" });
      const upstream = String(url).replace(/\?.*$/, "");
      const r = await fetch(upstream);
      if (!r.ok) return res.status(502).json({ error: "could not download current video" });
      const buf = Buffer.from(await r.arrayBuffer());
      const webm = await chromaKeyToWebm(buf);
      const saved = await saveVideoVersioned(String(key), webm, { ext: "webm" });
      const probed = await probeDurationSec(buf);
      const prev = await getClipMeta(String(key));
      const meta = await setClipMeta(String(key), {
        loopStart: prev?.loopStart ?? 0,
        loopEnd: prev?.loopEnd ?? 0,
        keyed: true,
        duration: probed || prev?.duration,
        frameCount: prev?.frameCount,
      });
      res.json({ ok: true, key, url: saved.url, v: saved.v, meta, keyed: true });
    } catch (error: any) {
      console.error("key-green failed:", error?.message || error);
      res.status(500).json({ error: "chroma key failed", details: error?.message || String(error) });
    }
  });

  /** Pull N PNG flipbook frames from a video clip (uses loop trim). Game prefers these. */
  async function extractSpritesFromVideoKey(videoKeyStr: string, countOverride?: number) {
    const parsed = parseVideoClipKey(videoKeyStr);
    if (!parsed) throw Object.assign(new Error(`not a video clip key: ${videoKeyStr}`), { status: 400 });
    const catalog = videoClipFor(parsed.baseKey, parsed.clip);
    const meta = await getClipMeta(videoKeyStr);
    // Always prefer catalog density (16 walk / 12 idle…) over a stale low meta.frameCount
    // from older 6–8 frame extracts — pass `count` in the body to override.
    const count = countOverride
      || (catalog ? defaultSpriteFrameCount(catalog) : 12);
    const map = await getGameAssets();
    const url = map[videoKeyStr];
    if (!url) throw Object.assign(new Error("video not found"), { status: 404 });
    const upstream = String(url).replace(/\?.*$/, "");
    const r = await fetch(upstream);
    if (!r.ok) throw Object.assign(new Error("could not download video"), { status: 502 });
    let buf = Buffer.from(await r.arrayBuffer());
    // Prefer a keyed WebM source when the current asset is still a green-plate MP4.
    if (/\.mp4$/i.test(upstream) || !meta?.keyed) {
      try { buf = await chromaKeyToWebm(buf); } catch { /* already alpha or key failed — try extract anyway */ }
    }
    const frames = await extractVideoFrames(buf, {
      count,
      startSec: meta?.loopStart || 0,
      endSec: meta?.loopEnd && meta.loopEnd > (meta.loopStart || 0) ? meta.loopEnd : undefined,
    });
    const saved: Array<{ key: string; url: string; v: number }> = [];
    for (let i = 0; i < frames.length; i++) {
      let png = frames[i];
      // ALWAYS chroma-key frames. ffmpeg often drops WebM alpha on extract, which
      // restores the opaque green plate even when meta.keyed is true.
      png = await chromaKeyGreen(png);
      // Second pass if a muddy plate survived the first thresholds.
      if ((await measureGreenPlate(png)) > 0.02) {
        png = await chromaKeyGreen(png, { low: 12, high: 48 });
      }
      const fk = videoFrameKey(parsed.baseKey, parsed.clip, i + 1, parsed.dir);
      const out = await saveNormalizedSprite(fk, png);
      saved.push({ key: fk, ...out });
    }
    const nextMeta = await setClipMeta(videoKeyStr, {
      loopStart: meta?.loopStart ?? 0,
      loopEnd: meta?.loopEnd ?? 0,
      keyed: meta?.keyed,
      duration: meta?.duration,
      frameCount: saved.length,
    });
    return { frames: saved, meta: nextMeta, count: saved.length };
  }

  // Extract PNG flipbook frames from a video clip for in-game sprite playback.
  app.post("/api/assets/extract-sprites", async (req, res) => {
    try {
      const { key, count } = req.body || {};
      if (!key) return res.status(400).json({ error: "key required (video clip key)" });
      const result = await extractSpritesFromVideoKey(String(key), count ? Number(count) : undefined);
      res.json({ ok: true, key, ...result });
    } catch (error: any) {
      console.error("extract-sprites failed:", error?.message || error);
      res.status(error?.status || 500).json({ error: "extract failed", details: error?.message || String(error) });
    }
  });

  /** Re-chroma-key already-extracted sprite frames (fixes green plates baked into PNGs).
   *  Body: { key? } — video clip key to rekey its frames; omit to rekey ALL video frames. */
  app.post("/api/assets/rekey-sprite-frames", async (req, res) => {
    try {
      const map = await getGameAssets();
      const videoKeyFilter = req.body?.key ? String(req.body.key) : null;
      const frameKeys: string[] = [];
      if (videoKeyFilter) {
        const parsed = parseVideoClipKey(videoKeyFilter);
        if (!parsed) return res.status(400).json({ error: "key must be a video clip key" });
        const meta = await getClipMeta(videoKeyFilter);
        const catalog = videoClipFor(parsed.baseKey, parsed.clip);
        const count = Math.max(
          catalog ? defaultSpriteFrameCount(catalog) : 12,
          meta?.frameCount || 0,
        );
        for (const fk of videoFrameKeys(parsed.baseKey, parsed.clip, count, parsed.dir)) {
          if (map[fk]) frameKeys.push(fk);
        }
      } else {
        // Any saved flipbook frame: char_*__idle_n_1, char_*__walk_se_3, char_*__celebrate_2…
        for (const k of Object.keys(map)) {
          if (/__v\d+$/.test(k)) continue;
          if (/__vid_/.test(k)) continue;
          if (/sheetraw$/.test(k)) continue;
          if (/__face_/.test(k)) continue;
          if (/__(?:idle|walk|run|carry|listen|speak|celebrate|confused)(?:_[a-z]+)?_\d+$/i.test(k)) {
            frameKeys.push(k);
          }
        }
      }
      const updated: Array<{ key: string; url: string; v: number; greenBefore: number }> = [];
      const skipped: string[] = [];
      for (const fk of frameKeys) {
        const fetched = await fetchImageAsBase64(map[fk]);
        if (!fetched) { skipped.push(fk); continue; }
        const raw = Buffer.from(fetched.base64Data, "base64");
        const greenBefore = await measureGreenPlate(raw);
        if (greenBefore < 0.01) { skipped.push(fk); continue; }
        let png = await chromaKeyGreen(raw);
        if ((await measureGreenPlate(png)) > 0.02) {
          png = await chromaKeyGreen(png, { low: 12, high: 48 });
        }
        const saved = await saveNormalizedSprite(fk, png);
        updated.push({ key: fk, url: saved.url, v: saved.v, greenBefore });
      }
      res.json({ ok: true, updated: updated.length, skipped: skipped.length, frames: updated });
    } catch (error: any) {
      console.error("rekey-sprite-frames failed:", error?.message || error);
      res.status(500).json({ error: "rekey failed", details: error?.message || String(error) });
    }
  });

  // Strip white outline / halo from an existing sprite (e.g. Athena base) and re-normalize.
  app.post("/api/assets/strip-outline", async (req, res) => {
    try {
      const { key } = req.body || {};
      if (!key) return res.status(400).json({ error: "key required" });
      const map = await getGameAssets();
      const url = map[String(key)];
      if (!url) return res.status(404).json({ error: "asset not found" });
      const fetched = await fetchImageAsBase64(String(url));
      if (!fetched) return res.status(502).json({ error: "could not load image" });
      const raw = Buffer.from(fetched.base64Data, "base64");
      // Edge-only: strip near-white within ~2px of transparent silhouette, not interior whites.
      const cleaned = await stripWhiteOutline(raw);
      const saved = await saveNormalizedSprite(String(key), cleaned);
      res.json({ ok: true, key, url: saved.url, v: saved.v });
    } catch (error: any) {
      console.error("strip-outline failed:", error?.message || error);
      res.status(500).json({ error: "strip failed", details: error?.message || String(error) });
    }
  });

  /**
   * Punch white corners off isometric env tiles and save as tight 2:1 diamonds
   * (no character normalize — that would squash tiling).
   * Body: { keys?: string[] } — defaults to kitchen env tile set.
   */
  app.post("/api/assets/punch-iso-tiles", async (req, res) => {
    try {
      const defaults = ["env_floor", "env_floor_dark", "env_wall", "env_counter"];
      const keys: string[] = Array.isArray(req.body?.keys) && req.body.keys.length
        ? req.body.keys.map(String)
        : defaults;
      const map = await getGameAssets();
      const updated: Array<{ key: string; url: string; v: number }> = [];
      const skipped: string[] = [];
      for (const key of keys) {
        const url = map[key];
        if (!url) { skipped.push(key); continue; }
        const fetched = await fetchImageAsBase64(String(url));
        if (!fetched) { skipped.push(key); continue; }
        const punched = await punchIsoTileBackground(Buffer.from(fetched.base64Data, "base64"));
        // Save raw 2:1 diamond — do NOT normalizeFrame (would force a square cell).
        const saved = await saveVersioned(key, punched);
        updated.push({ key, url: saved.url, v: saved.v });
      }
      res.json({ ok: true, updated: updated.length, skipped, tiles: updated });
    } catch (error: any) {
      console.error("punch-iso-tiles failed:", error?.message || error);
      res.status(500).json({ error: "punch failed", details: error?.message || String(error) });
    }
  });

  // Re-slice a previously generated sheet (stored as <baseKey>__sheetraw) without
  // paying to regenerate — for iterating on the slicing / pose mapping.
  app.post("/api/assets/reslice-sheet", async (req, res) => {
    try {
      const { baseKey, poses, cols, rows, rawKey } = req.body || {};
      if (!baseKey || !Array.isArray(poses) || !cols || !rows) return res.status(400).json({ error: "baseKey + poses[] + cols + rows required" });
      const map = await getGameAssets();
      const rawUrl = map[rawKey || `${baseKey}__sheetraw`];
      if (!rawUrl) return res.status(400).json({ error: `no stored sheet for ${rawKey || baseKey}` });
      const fetched = await fetchImageAsBase64(rawUrl);
      if (!fetched) return res.status(502).json({ error: "could not load stored sheet" });
      const { mode, results } = await sliceSaveSheet(Buffer.from(fetched.base64Data, "base64"), poses, cols, rows);
      res.json({ ok: true, sliceMode: mode, results });
    } catch (error: any) {
      res.status(500).json({ error: "reslice failed", details: error?.message || String(error) });
    }
  });

  // Remove a sprite from the manifest (the scene falls back to its emoji placeholder).
  app.delete("/api/assets/:key", async (req, res) => {
    try {
      const removed = await deleteGameAsset(req.params.key);
      res.json({ ok: removed });
    } catch (error: any) {
      res.status(500).json({ error: "delete failed", details: error?.message || String(error) });
    }
  });

  // Telemetry ingest (per-utterance / per-level). Feeds the future word-state machine.
  app.post("/api/telemetry", async (req, res) => {
    try { await appendEvent(req.body || {}); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e?.message || String(e) }); }
  });

  // Per-word success + latency rollup (word-state seed / review-word selector).
  app.get("/api/telemetry/word-stats", async (_req, res) => {
    res.json({ stats: await wordStats() });
  });

  // ── Memory Palace example sentences ──────────────────────────────────────

  // GET /api/words/:wordId/example-sentence?userId=
  // Returns the cached sentence for this (word, user) pair, or null
  app.get("/api/words/:wordId/example-sentence", async (req, res) => {
    try {
      const { wordId } = req.params;
      const { userId } = req.query as { userId?: string };
      if (!userId) return res.status(400).json({ error: "userId required" });
      const row = await storage.getExampleSentence(wordId, userId);
      res.json(row ?? null);
    } catch (error) {
      console.error("Error fetching example sentence:", error);
      res.status(500).json({ error: "Failed to fetch example sentence" });
    }
  });

  // POST /api/words/:wordId/example-sentence
  // Generates (or returns cached) a Memory Palace sentence for this (word, user)
  // Wraps the target word with commas (e.g. "cat eats" → "cat, eats,") so the TTS
  // takes a beat before/after the learned word. Cyrillic-aware word boundary.
  function speakableSentenceForStory(sentence: string, targetWord: string): string {
    if (!targetWord) return sentence;
    const escaped = targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\p{L}])(${escaped})(?![\\p{L}])`, 'giu');
    return sentence
      .replace(re, ', $1,')
      .replace(/,\s*,/g, ',')
      .replace(/\s+,/g, ',')
      .replace(/^[\s,]+/, '');
  }

  app.post("/api/words/:wordId/example-sentence", async (req, res) => {
    try {
      const { wordId } = req.params;
      const { userId, language, voiceType, speed, knownWords = [] } = req.body;

      if (!userId) return res.status(400).json({ error: "userId required" });

      // Return cached row when available. Always re-derive the audio URL for
      // the current speed/voice (getOrGenerateTTS is S3-cached, so a matching
      // prior request is free), so the example sentence honors the user's
      // current audioSpeed setting just like the learning-word audio does.
      // Also backfill imageUrl if a prior attempt persisted the row but image
      // generation failed.
      const cached = await storage.getExampleSentence(wordId, userId);
      if (cached) {
        const cachedWord = await storage.getVocabularyById(wordId);
        const cachedSpoken = speakableSentenceForStory(cached.sentence, cachedWord?.targetWord ?? "");
        const tasks: Array<Promise<{ imageUrl?: string; audioUrl?: string }>> = [];
        if (!cached.imageUrl) {
          const imagePrompt = `Colorful cartoon illustration for children ages 4-8, bright joyful style, white background. Scene: ${cached.englishHint}. No text, letters, or numbers in the image.`;
          tasks.push(
            generateOpenAIImage(imagePrompt)
              .then(b64 => saveImageFromBase64(`example-${cached.id}`, b64))
              .then(url => ({ imageUrl: url })),
          );
        }
        tasks.push(
          getOrGenerateTTS(cachedSpoken, "[very slowly]", voiceType ?? "native", language ?? cached.language ?? "russian")
            .then(url => ({ audioUrl: url })),
        );
        const results = await Promise.allSettled(tasks);
        const updates: { imageUrl?: string; audioUrl?: string } = {};
        for (const r of results) {
          if (r.status === "fulfilled") Object.assign(updates, r.value);
          else console.error("Example sentence media error:", r.reason?.message || r.reason);
        }
        // Only persist when the URL actually changed to avoid a write per fetch
        const dbUpdates: { imageUrl?: string; audioUrl?: string } = {};
        if (updates.imageUrl && updates.imageUrl !== cached.imageUrl) dbUpdates.imageUrl = updates.imageUrl;
        if (updates.audioUrl && updates.audioUrl !== cached.audioUrl) dbUpdates.audioUrl = updates.audioUrl;
        if (Object.keys(dbUpdates).length > 0) {
          await storage.updateExampleSentenceMedia(cached.id, dbUpdates);
        }
        Object.assign(cached, updates);
        return res.json(cached);
      }

      const word = await storage.getVocabularyById(wordId);
      if (!word) return res.status(404).json({ error: "Word not found" });

      const lang = language || word.language || "russian";

      // Build known-words constraint for the prompt
      const knownList = (knownWords as string[]).filter(Boolean);
      const knownWordsClause = knownList.length > 0
        ? `The child already knows these ${lang === "spanish" ? "Spanish" : "Russian"} words: ${knownList.join(", ")}.\nBuild the sentence using ONLY these known words plus "${word.targetWord}".`
        : `Use very simple, common words a young child would know.`;

      const langName = lang === "spanish" ? "Spanish" : "Russian";

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: `You are writing a silly, memorable sentence to help a 6-year-old child learn the ${langName} word "${word.targetWord}" (it means "${word.english}").

${knownWordsClause}
You may also use these basic connectors: и (and), в (in), на (on), с (with), это (this), не (not), очень (very).

Rules:
- 6–9 words maximum
- Make it BIZARRE and FUNNY — silly cartoon logic that would make a child giggle (a cat flies, bread cries, grandma punches a bear)
- The word "${word.targetWord}" MUST appear in the sentence
- Write in ${langName} only — no English in the sentence itself
- The sentence must make visual sense so an illustrator can draw it

Return JSON only, no markdown: { "sentence": "...", "englishHint": "..." }`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 1.1,
      });

      let sentence = word.targetWord;
      let englishHint = word.english;
      try {
        const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
        sentence = parsed.sentence || sentence;
        englishHint = parsed.englishHint || englishHint;
      } catch {}

      // Create the DB row first so we have an id for the image file
      const row = await storage.createExampleSentence({
        wordId,
        userId,
        sentence,
        englishHint,
        language: lang,
        sortOrder: 0,
      });

      // Generate image and TTS in parallel (best-effort — failures don't block response)
      const imagePrompt = `Colorful cartoon illustration for children ages 4-8, bright joyful style, white background. Scene: ${englishHint}. No text, letters, or numbers in the image.`;

      const spokenSentence = speakableSentenceForStory(sentence, word.targetWord);
      const [imageResult, audioResult] = await Promise.allSettled([
        generateOpenAIImage(imagePrompt).then(b64 => saveImageFromBase64(`example-${row.id}`, b64)),
        getOrGenerateTTS(spokenSentence, "[very slowly]", voiceType ?? "native", lang),
      ]);

      const mediaUpdates: { imageUrl?: string; audioUrl?: string } = {};
      if (imageResult.status === "fulfilled") mediaUpdates.imageUrl = imageResult.value;
      if (audioResult.status === "fulfilled") mediaUpdates.audioUrl = audioResult.value;

      if (Object.keys(mediaUpdates).length > 0) {
        await storage.updateExampleSentenceMedia(row.id, mediaUpdates);
        Object.assign(row, mediaUpdates);
      }

      res.json(row);
    } catch (error) {
      console.error("Error generating example sentence:", error);
      res.status(500).json({ error: "Failed to generate example sentence" });
    }
  });

  // GET /api/users/:userId/words/learned?language=
  // Returns all vocabulary words the user has marked as learned (for distractor pool)
  app.get("/api/users/:userId/words/learned", async (req, res) => {
    try {
      const { userId } = req.params;
      const lang = (req.query.language as string) || "russian";
      const words = await storage.getLearnedVocabulary(userId, lang as Language);
      res.json(words);
    } catch (error) {
      console.error("Error fetching learned words:", error);
      res.status(500).json({ error: "Failed to fetch learned words" });
    }
  });

  // ── end Memory Palace routes ───────────────────────────────────────────────

  // Generate TTS for arbitrary text (for grammar exercises)
  // NOTE: This route must come BEFORE /api/tts/:wordId to avoid matching "text" as wordId
  app.post("/api/tts/text", async (req, res) => {
    try {
      const { text, language, voiceType, speed } = req.body;

      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      const audioUrl = await getOrGenerateTTS(text, audioSpeedToTag(speed), voiceType, language ?? "russian");
      res.json({ audioUrl });
    } catch (error) {
      console.error("Error generating TTS:", error);
      res.status(500).json({ error: "Failed to generate audio" });
    }
  });

  // Generate confirmation TTS audio
  // NOTE: This route must come BEFORE /api/tts/:wordId to avoid matching "confirmation" as wordId
  app.post("/api/tts/confirmation", async (req, res) => {
    try {
      const { targetWord, language, voiceType, speed } = req.body;

      if (!targetWord) {
        return res.status(400).json({ error: "Target word is required" });
      }

      let confirmationText: string;
      if (language === 'spanish') {
        confirmationText = `¡Sí! Esa palabra es ${targetWord}!`;
      } else {
        confirmationText = `Да! Это слово ${targetWord}!`;
      }

      const audioUrl = await getOrGenerateTTS(confirmationText, audioSpeedToTag(speed), voiceType, language ?? "russian");
      res.json({ audioUrl });
    } catch (error) {
      console.error("Error generating confirmation TTS:", error);
      res.status(500).json({ error: "Failed to generate confirmation audio" });
    }
  });

  // Generate TTS audio for a vocabulary word by ID
  // NOTE: This wildcard route must come AFTER specific routes like /text and /confirmation
  app.post("/api/tts/:wordId", async (req, res) => {
    try {
      const { wordId } = req.params;
      const { mode, language: userLanguage, voiceType, speed } = req.body || {};

      const word = await storage.getVocabularyById(wordId);
      if (!word) {
        return res.status(404).json({ error: "Word not found" });
      }

      // Determine language: prefer word's language, fallback to user's language, then 'russian'
      const lang = word.language || userLanguage || 'russian';
      const speedTag = audioSpeedToTag(speed);

      // For learning mode, generate "это, {word}. {chunked-word}. {word}!" audio
      if (mode === 'learn') {
        const chunkedWord = chunkWordForPronunciation(word.targetWord);

        let learnText: string;
        if (lang === 'spanish') {
          learnText = `esto es, ${word.targetWord}. ${chunkedWord}. ${word.targetWord}!`;
        } else {
          learnText = `это, ${word.targetWord}. ${chunkedWord}. ${word.targetWord}!`;
        }
        const audioUrl = await getOrGenerateTTS(learnText, speedTag, voiceType, lang);
        return res.json({ audioUrl });
      }

      // S3 cache covers all variants. Still mirror the canonical
      // (native voice, default speed) URL into the DB row so client code
      // that reads word.audioUrl directly keeps working.
      const audioUrl = await getOrGenerateTTS(word.targetWord, speedTag, voiceType, lang);
      if (voiceType !== 'child' && !speed && word.audioUrl !== audioUrl) {
        await storage.updateVocabularyAudio(wordId, audioUrl);
      }

      res.json({ audioUrl });
    } catch (error) {
      console.error("Error generating TTS:", error);
      res.status(500).json({ error: "Failed to generate audio" });
    }
  });

  // Generate image for a word
  app.post("/api/image/:wordId", async (req, res) => {
    try {
      const { wordId } = req.params;
      
      const word = await storage.getVocabularyById(wordId);
      if (!word) {
        return res.status(404).json({ error: "Word not found" });
      }

      if (word.imageUrl) {
        return res.json({ imageUrl: word.imageUrl });
      }

      const promptTemplate = await storage.getDefaultImagePrompt();
      const prompt = promptTemplate.replace(/{word}/g, word.targetWord);

      const base64Data = await generateOpenAIImage(prompt);

      const imageUrl = await saveImageFromBase64(wordId, base64Data);
      await storage.updateVocabularyImage(wordId, imageUrl);

      res.json({ imageUrl });
    } catch (error: any) {
      console.error("Error generating image:", error);
      console.error("Error message:", error?.message);
      res.status(500).json({ error: "Failed to generate image" });
    }
  });

  app.post("/api/image/:wordId/regenerate", async (req, res) => {
    try {
      const { wordId } = req.params;
      const { customPrompt, referenceImage } = req.body || {};

      const word = await storage.getVocabularyById(wordId);
      if (!word) {
        return res.status(404).json({ error: "Word not found" });
      }

      let prompt: string;
      if (customPrompt && typeof customPrompt === 'string' && customPrompt.trim()) {
        prompt = customPrompt.trim();
      } else {
        const promptTemplate = await storage.getDefaultImagePrompt();
        prompt = promptTemplate.replace(/{word}/g, word.targetWord);
      }

      let referenceImages: ReferenceImage[] | undefined;
      if (referenceImage) {
        const refName = typeof referenceImage.name === 'string' && referenceImage.name.trim()
          ? referenceImage.name.trim()
          : word.targetWord;
        let ref: ReferenceImage | undefined;
        if (typeof referenceImage.base64Data === 'string' && referenceImage.base64Data.trim()) {
          ref = {
            name: refName,
            base64Data: referenceImage.base64Data,
            mimeType: typeof referenceImage.mimeType === 'string' ? referenceImage.mimeType : 'image/png',
          };
        } else if (typeof referenceImage.url === 'string' && referenceImage.url.trim()) {
          const fetched = await fetchImageAsBase64(referenceImage.url);
          if (fetched) {
            ref = { name: refName, base64Data: fetched.base64Data, mimeType: fetched.mimeType };
          }
        }
        if (ref) referenceImages = [ref];
      }

      const base64Data = await generateOpenAIImage(prompt, referenceImages);
      const imageUrl = await saveImageFromBase64(wordId, base64Data);
      await storage.updateVocabularyImage(wordId, imageUrl);

      res.json({ imageUrl });
    } catch (error: any) {
      console.error("Error regenerating image:", error);
      res.status(500).json({ error: "Failed to regenerate image" });
    }
  });

  // ==================== ADMIN ROUTES ====================

  const adminTokens = new Set<string>();

  function generateAdminToken(): string {
    return randomBytes(32).toString('hex');
  }

  function requireAdminAuth(req: any, res: any, next: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.slice(7);
    if (!adminTokens.has(token)) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    next();
  }

  const adminAuthSchema = z.object({
    password: z.string(),
  });

  app.post("/api/admin/auth", async (req, res) => {
    try {
      const parsed = adminAuthSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request" });
      }

      const { password } = parsed.data;
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (password === adminPassword) {
        const token = generateAdminToken();
        adminTokens.add(token);
        setTimeout(() => adminTokens.delete(token), 60 * 60 * 1000);
        res.json({ success: true, token });
      } else {
        res.status(401).json({ error: "Invalid password" });
      }
    } catch (error) {
      console.error("Error authenticating:", error);
      res.status(500).json({ error: "Authentication failed" });
    }
  });

  // Get all words for admin (filtered by language)
  app.get("/api/admin/words", requireAdminAuth, async (req, res) => {
    try {
      const language = req.query.language as Language | undefined;
      const userId = req.query.userId as string | undefined;
      const vocabulary = await storage.getAllVocabulary(language);
      
      let progressMap = new Map<string, { isLearned: boolean; learnedAt: string | null; lastReviewDate: string | null; reviewCount: number; nextReviewDate: string | null; repetitions: number }>();
      
      if (userId) {
        const allProgress = await storage.getAllLearningProgress(userId);
        for (const p of allProgress) {
          progressMap.set(p.wordId, {
            isLearned: p.isLearned ?? false,
            learnedAt: p.learnedAt ? new Date(p.learnedAt).toISOString() : null,
            lastReviewDate: p.lastReviewDate ? new Date(p.lastReviewDate).toISOString() : null,
            reviewCount: p.reviewCount ?? 0,
            nextReviewDate: p.nextReviewDate ? new Date(p.nextReviewDate).toISOString() : null,
            repetitions: p.repetitions ?? 0,
          });
        }
      }
      
      const wordsWithStatus = vocabulary.map(word => {
        const progress = progressMap.get(word.id);
        return {
          ...word,
          isLearned: progress?.isLearned ?? false,
          learnedAt: progress?.learnedAt ?? null,
          lastReviewDate: progress?.lastReviewDate ?? null,
          reviewCount: progress?.reviewCount ?? 0,
          nextReviewDate: progress?.nextReviewDate ?? null,
          repetitions: progress?.repetitions ?? 0,
        };
      });

      res.json(wordsWithStatus);
    } catch (error) {
      console.error("Error fetching admin words:", error);
      res.status(500).json({ error: "Failed to fetch words" });
    }
  });

  // Reorder words (admin only)
  const reorderSchema = z.object({
    wordIds: z.array(z.string()),
    targetIndex: z.number(),
  });

  app.post("/api/admin/words/reorder", requireAdminAuth, async (req, res) => {
    try {
      const parsed = reorderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request" });
      }

      const { wordIds, targetIndex } = parsed.data;
      const firstWord = await storage.getVocabularyById(wordIds[0]);
      if (!firstWord) {
        return res.status(404).json({ error: "Word not found" });
      }
      
      const allVocab = await storage.getAllVocabulary(firstWord.language as Language);
      const movingIds = new Set(wordIds);
      
      const remaining = allVocab.filter(v => !movingIds.has(v.id));
      
      const movingWords = wordIds
        .map(id => allVocab.find(v => v.id === id))
        .filter(Boolean) as typeof allVocab;
      
      const clampedIndex = Math.max(0, Math.min(targetIndex, remaining.length));
      const newOrder = [
        ...remaining.slice(0, clampedIndex),
        ...movingWords,
        ...remaining.slice(clampedIndex),
      ];
      
      for (let i = 0; i < newOrder.length; i++) {
        await storage.updateVocabularyDisplayOrder(newOrder[i].id, i);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering words:", error);
      res.status(500).json({ error: "Failed to reorder words" });
    }
  });

  // Regenerate image with custom prompt
  const regenerateImageSchema = z.object({
    customPrompt: z.string().optional(),
  });

  app.post("/api/admin/words/:wordId/regenerate-image", requireAdminAuth, async (req, res) => {
    try {
      const { wordId } = req.params;
      const parsed = regenerateImageSchema.safeParse(req.body);
      
      const word = await storage.getVocabularyById(wordId);
      if (!word) {
        return res.status(404).json({ error: "Word not found" });
      }

      const customPrompt = parsed.success ? parsed.data.customPrompt : undefined;
      
      let prompt: string;
      if (customPrompt) {
        prompt = customPrompt;
      } else {
        const promptTemplate = await storage.getDefaultImagePrompt();
        prompt = promptTemplate.replace(/{word}/g, word.targetWord);
      }

      const base64Data = await generateOpenAIImage(prompt);

      const imageUrl = await saveImageFromBase64(wordId, base64Data);
      await storage.updateVocabularyImage(wordId, imageUrl);

      res.json({ imageUrl });
    } catch (error) {
      console.error("Error regenerating image:", error);
      res.status(500).json({ error: "Failed to regenerate image" });
    }
  });

  // Get words without images
  app.get("/api/admin/words/no-images", requireAdminAuth, async (req, res) => {
    try {
      const language = req.query.language as Language | undefined;
      const vocabulary = await storage.getAllVocabulary(language);
      const wordsWithoutImages = vocabulary.filter(w => !w.imageUrl);
      res.json(wordsWithoutImages);
    } catch (error) {
      console.error("Error fetching words without images:", error);
      res.status(500).json({ error: "Failed to fetch words" });
    }
  });

  // Get words with missing local image files (expired URLs or not saved locally)
  app.get("/api/admin/words/missing-images", requireAdminAuth, async (req, res) => {
    try {
      const language = req.query.language as Language | undefined;
      const vocabulary = await storage.getAllVocabulary(language);
      const checks = await Promise.all(
        vocabulary.map(async w => {
          if (!w.imageUrl) return false;
          const filename = w.imageUrl.split('/').pop()?.replace('.png', '') || '';
          return !(await imageExists(filename));
        }),
      );
      const wordsWithMissingImages = vocabulary.filter((_, i) => checks[i]);
      res.json(wordsWithMissingImages);
    } catch (error) {
      console.error("Error fetching words with missing images:", error);
      res.status(500).json({ error: "Failed to fetch words" });
    }
  });

  // Batch image generation state
  interface BatchJobStatus {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    total: number;
    completed: number;
    failed: string[];
    successful: string[];
    startedAt: Date;
    completedAt?: Date;
  }
  
  const batchJobs = new Map<string, BatchJobStatus>();
  const CONCURRENT_LIMIT = 3; // Process 3 images at a time

  // Helper to process images with concurrency limit
  async function processImagesWithConcurrency(
    wordIds: string[],
    jobId: string,
    promptTemplate: string
  ) {
    const job = batchJobs.get(jobId);
    if (!job) return;

    const queue = [...wordIds];
    const inProgress = new Set<Promise<void>>();

    const processOne = async (wordId: string) => {
      try {
        const word = await storage.getVocabularyById(wordId);
        if (!word) {
          job.failed.push(wordId);
          return;
        }

        const prompt = promptTemplate.replace(/{word}/g, word.targetWord);
        
        const base64Data = await generateOpenAIImage(prompt);

        const imageUrl = await saveImageFromBase64(wordId, base64Data);
        await storage.updateVocabularyImage(wordId, imageUrl);
        job.successful.push(wordId);
      } catch (error) {
        console.error(`Failed to generate image for ${wordId}:`, error);
        job.failed.push(wordId);
      } finally {
        job.completed++;
      }
    };

    while (queue.length > 0 || inProgress.size > 0) {
      // Fill up to concurrent limit
      while (queue.length > 0 && inProgress.size < CONCURRENT_LIMIT) {
        const wordId = queue.shift()!;
        const promise = processOne(wordId).finally(() => {
          inProgress.delete(promise);
        });
        inProgress.add(promise);
      }

      // Wait for at least one to complete before continuing
      if (inProgress.size > 0) {
        await Promise.race(inProgress);
      }
    }

    job.status = 'completed';
    job.completedAt = new Date();
  }

  // Start batch image generation
  const batchGenerateSchema = z.object({
    wordIds: z.array(z.string()).min(1).max(200),
  });

  app.post("/api/admin/batch-generate-images", requireAdminAuth, async (req, res) => {
    try {
      const parsed = batchGenerateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      const { wordIds } = parsed.data;
      const jobId = randomBytes(8).toString('hex');
      
      const job: BatchJobStatus = {
        id: jobId,
        status: 'processing',
        total: wordIds.length,
        completed: 0,
        failed: [],
        successful: [],
        startedAt: new Date(),
      };
      
      batchJobs.set(jobId, job);

      // Get prompt template
      const promptTemplate = await storage.getDefaultImagePrompt();

      // Start processing in background
      processImagesWithConcurrency(wordIds, jobId, promptTemplate).catch(error => {
        console.error("Batch processing error:", error);
        const job = batchJobs.get(jobId);
        if (job) {
          job.status = 'failed';
          job.completedAt = new Date();
        }
      });

      res.json({ jobId, status: 'processing', total: wordIds.length });
    } catch (error) {
      console.error("Error starting batch generation:", error);
      res.status(500).json({ error: "Failed to start batch generation" });
    }
  });

  // Get batch job status
  app.get("/api/admin/batch-generate-images/:jobId", requireAdminAuth, async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = batchJobs.get(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json({
        id: job.id,
        status: job.status,
        total: job.total,
        completed: job.completed,
        failedCount: job.failed.length,
        successCount: job.successful.length,
        failed: job.failed,
      });
    } catch (error) {
      console.error("Error fetching batch status:", error);
      res.status(500).json({ error: "Failed to fetch batch status" });
    }
  });

  // Generate image for a specific word
  app.post("/api/admin/words/:wordId/generate-image", requireAdminAuth, async (req, res) => {
    try {
      const { wordId } = req.params;
      
      const word = await storage.getVocabularyById(wordId);
      if (!word) {
        return res.status(404).json({ error: "Word not found" });
      }

      const promptTemplate = await storage.getDefaultImagePrompt();
      const prompt = promptTemplate.replace(/{word}/g, word.targetWord);

      const base64Data = await generateOpenAIImage(prompt);

      const imageUrl = await saveImageFromBase64(wordId, base64Data);
      await storage.updateVocabularyImage(wordId, imageUrl);
      res.json({ wordId, imageUrl });
    } catch (error) {
      console.error("Error generating image:", error);
      res.status(500).json({ error: "Failed to generate image" });
    }
  });

  // Delete image for a word
  app.delete("/api/admin/words/:wordId/image", requireAdminAuth, async (req, res) => {
    try {
      const { wordId } = req.params;
      
      const word = await storage.getVocabularyById(wordId);
      if (!word) {
        return res.status(404).json({ error: "Word not found" });
      }

      await deleteImageFile(wordId);
      await storage.clearVocabularyImage(wordId);
      res.json({ success: true, wordId });
    } catch (error) {
      console.error("Error deleting image:", error);
      res.status(500).json({ error: "Failed to delete image" });
    }
  });

  app.delete("/api/admin/words/:wordId", requireAdminAuth, async (req, res) => {
    try {
      const { wordId } = req.params;
      const word = await storage.getVocabularyById(wordId);
      if (!word) {
        return res.status(404).json({ error: "Word not found" });
      }
      await deleteImageFile(wordId);
      await storage.deleteVocabulary(wordId);
      res.json({ success: true, wordId });
    } catch (error) {
      console.error("Error deleting vocabulary word:", error);
      res.status(500).json({ error: "Failed to delete word" });
    }
  });

  // Get settings
  app.get("/api/admin/settings", requireAdminAuth, async (req, res) => {
    try {
      const defaultImagePrompt = await storage.getDefaultImagePrompt();
      res.json({ defaultImagePrompt });
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  // Update default image prompt
  const updateSettingsSchema = z.object({
    defaultImagePrompt: z.string()
      .min(10, "Prompt must be at least 10 characters")
      .refine((val) => val.includes("{word}"), {
        message: "Prompt must contain {word} placeholder",
      }),
  });

  app.put("/api/admin/settings", requireAdminAuth, async (req, res) => {
    try {
      const parsed = updateSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      await storage.setDefaultImagePrompt(parsed.data.defaultImagePrompt);
      res.json({ success: true, defaultImagePrompt: parsed.data.defaultImagePrompt });
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Get grammar exercises for a language
  app.get("/api/users/:userId/grammar-exercises", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const exercises = await storage.getGrammarExercises(user.language as "russian" | "spanish");
      const progress = await storage.getAllGrammarProgress(userId);
      
      const progressMap = new Map(progress.map(p => [p.exerciseId, p]));
      
      const exercisesWithProgress = exercises.map(exercise => ({
        ...exercise,
        practiceCount: progressMap.get(exercise.id)?.practiceCount || 0,
        lastPracticedAt: progressMap.get(exercise.id)?.lastPracticedAt || null,
      }));
      
      res.json(exercisesWithProgress);
    } catch (error) {
      console.error("Error fetching grammar exercises:", error);
      res.status(500).json({ error: "Failed to fetch grammar exercises" });
    }
  });

  // Get single grammar exercise
  app.get("/api/grammar-exercises/:exerciseId", async (req, res) => {
    try {
      const { exerciseId } = req.params;
      const exercise = await storage.getGrammarExerciseById(exerciseId);
      if (!exercise) {
        return res.status(404).json({ error: "Exercise not found" });
      }
      res.json(exercise);
    } catch (error) {
      console.error("Error fetching grammar exercise:", error);
      res.status(500).json({ error: "Failed to fetch grammar exercise" });
    }
  });

  // Record grammar practice
  app.post("/api/users/:userId/grammar-exercises/:exerciseId/practice", async (req, res) => {
    try {
      const { userId, exerciseId } = req.params;
      const progress = await storage.createOrUpdateGrammarProgress(userId, exerciseId);
      res.json(progress);
    } catch (error) {
      console.error("Error recording grammar practice:", error);
      res.status(500).json({ error: "Failed to record practice" });
    }
  });

  // Sync vocabulary - add new words without duplicates
  app.post("/api/admin/sync-vocabulary", requireAdminAuth, async (req, res) => {
    try {
      // Get all existing words from database
      const existingRussianWords = await storage.getAllVocabulary("russian");
      const existingSpanishWords = await storage.getAllVocabulary("spanish");
      
      const existingRussianSet = new Set(existingRussianWords.map((w) => w.targetWord.toLowerCase()));
      const existingSpanishSet = new Set(existingSpanishWords.map((w) => w.targetWord.toLowerCase()));
      
      let addedRussian = 0;
      let addedSpanish = 0;
      
      // Find new Russian words
      const newRussianWords = russianVocabulary.filter(
        (w) => !existingRussianSet.has(w.russian.toLowerCase())
      );
      
      // Find new Spanish words
      const newSpanishWords = spanishVocabulary.filter(
        (w) => !existingSpanishSet.has(w.spanish.toLowerCase())
      );
      
      // Add new Russian words
      const startOrderRussian = existingRussianWords.length;
      for (let i = 0; i < newRussianWords.length; i++) {
        const word = newRussianWords[i];
        await storage.createVocabulary({
          targetWord: word.russian,
          english: word.english,
          language: "russian",
          frequencyRank: word.frequencyRank,
          displayOrder: startOrderRussian + i,
          category: word.category,
          partOfSpeech: word.partOfSpeech || null,
        });
        addedRussian++;
      }
      
      // Add new Spanish words
      const startOrderSpanish = existingSpanishWords.length;
      for (let i = 0; i < newSpanishWords.length; i++) {
        const word = newSpanishWords[i];
        await storage.createVocabulary({
          targetWord: word.spanish,
          english: word.english,
          language: "spanish",
          frequencyRank: word.frequencyRank,
          displayOrder: startOrderSpanish + i,
          category: word.category,
          partOfSpeech: null,
        });
        addedSpanish++;
      }
      
      res.json({
        success: true,
        addedRussian,
        addedSpanish,
        totalRussian: existingRussianWords.length + addedRussian,
        totalSpanish: existingSpanishWords.length + addedSpanish,
      });
    } catch (error) {
      console.error("Error syncing vocabulary:", error);
      res.status(500).json({ error: "Failed to sync vocabulary" });
    }
  });

  // ============ STORY MODE API ENDPOINTS ============

  // Get all published stories for a user
  app.get("/api/users/:userId/stories", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const stories = await storage.getStoriesForUser(userId, user.language as Language);
      const progress = await storage.getAllUserStoryProgress(userId);
      const progressMap = new Map(progress.map(p => [p.storyId, p]));
      
      const storiesWithProgress = stories.map(story => ({
        ...story,
        progress: progressMap.get(story.id) || null,
      }));
      
      res.json(storiesWithProgress);
    } catch (error) {
      console.error("Error fetching stories:", error);
      res.status(500).json({ error: "Failed to fetch stories" });
    }
  });

  // Get a specific story with pages and quizzes
  app.get("/api/stories/:storyId", async (req, res) => {
    try {
      const { storyId } = req.params;
      const story = await storage.getStoryById(storyId);
      if (!story) {
        return res.status(404).json({ error: "Story not found" });
      }
      const pages = await storage.getStoryPages(storyId);
      const quizzes = await storage.getStoryQuizzes(storyId);
      res.json({ ...story, pages, quizzes });
    } catch (error) {
      console.error("Error fetching story:", error);
      res.status(500).json({ error: "Failed to fetch story" });
    }
  });

  // Get user's progress on a story
  app.get("/api/users/:userId/stories/:storyId/progress", async (req, res) => {
    try {
      const { userId, storyId } = req.params;
      const progress = await storage.getUserStoryProgress(userId, storyId);
      res.json(progress || { currentPage: 0, isCompleted: false });
    } catch (error) {
      console.error("Error fetching story progress:", error);
      res.status(500).json({ error: "Failed to fetch progress" });
    }
  });

  // Update user's progress on a story
  app.post("/api/users/:userId/stories/:storyId/progress", async (req, res) => {
    try {
      const { userId, storyId } = req.params;
      const { currentPage, isCompleted, quizScore } = req.body;
      
      const updates: { currentPage?: number; isCompleted?: boolean; quizScore?: number; completedAt?: Date } = {};
      if (typeof currentPage === 'number') updates.currentPage = currentPage;
      if (typeof isCompleted === 'boolean') {
        updates.isCompleted = isCompleted;
        if (isCompleted) updates.completedAt = new Date();
      }
      if (typeof quizScore === 'number') updates.quizScore = quizScore;
      
      const progress = await storage.createOrUpdateUserStoryProgress(userId, storyId, updates);
      res.json(progress);
    } catch (error) {
      console.error("Error updating story progress:", error);
      res.status(500).json({ error: "Failed to update progress" });
    }
  });

  // Generate TTS for a story page sentence
  app.post("/api/stories/:storyId/pages/:pageNumber/tts", async (req, res) => {
    try {
      const { storyId, pageNumber } = req.params;
      const page = await storage.getStoryPageByNumber(storyId, parseInt(pageNumber));
      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }

      const story = await storage.getStoryById(storyId);
      const audioUrl = await getOrGenerateTTS(page.sentence, '[very slowly]', 'native', story?.language ?? 'russian');
      if (page.audioUrl !== audioUrl) {
        await storage.updateStoryPage(page.id, { audioUrl });
      }
      res.json({ audioUrl });
    } catch (error) {
      console.error("Error generating story page TTS:", error);
      res.status(500).json({ error: "Failed to generate audio" });
    }
  });

  // Transcribe audio for story page verification (voice recognition)
  app.post("/api/stories/transcribe", async (req, res) => {
    try {
      const audioBase64 = req.body.audio;
      const language = req.body.language || 'ru';
      
      if (!audioBase64) {
        return res.status(400).json({ error: "No audio data provided" });
      }

      const audioBuffer = Buffer.from(audioBase64, 'base64');
      const blob = new Blob([audioBuffer], { type: 'audio/webm' });
      
      const result = await elevenlabs.speechToText.convert({
        file: blob,
        model_id: "scribe_v1",
        language_code: language === 'spanish' ? 'es' : 'ru',
      });

      res.json({ text: result.text || '' });
    } catch (error) {
      console.error("Error transcribing story audio:", error);
      res.status(500).json({ error: "Failed to transcribe audio" });
    }
  });

  // ============ ADMIN STORY MANAGEMENT ENDPOINTS ============

  // Get all users for admin (for story target selection)
  app.get("/api/admin/users", requireAdminAuth, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get all stories for admin (including drafts)
  app.get("/api/admin/stories", requireAdminAuth, async (req, res) => {
    try {
      const { language } = req.query;
      if (!language || typeof language !== 'string') {
        return res.status(400).json({ error: "language query parameter required" });
      }
      
      // Get all stories for this language (both draft and published)
      const allStories = await db.select().from(stories)
        .where(eq(stories.language, language as Language))
        .orderBy(desc(stories.createdAt));
      
      res.json(allStories);
    } catch (error) {
      console.error("Error fetching admin stories:", error);
      res.status(500).json({ error: "Failed to fetch stories" });
    }
  });

  // Create a new story
  app.post("/api/admin/stories", requireAdminAuth, async (req, res) => {
    try {
      const { title, targetUserId, language, storyType } = req.body;
      if (!title || !targetUserId || !language) {
        return res.status(400).json({ error: "title, targetUserId, and language are required" });
      }
      
      const story = await storage.createStory({
        title,
        targetUserId,
        language,
        status: 'draft',
        storyType: storyType || 'story',
        pageCount: 0,
      });
      
      res.json(story);
    } catch (error) {
      console.error("Error creating story:", error);
      res.status(500).json({ error: "Failed to create story" });
    }
  });

  // Update a story
  app.patch("/api/admin/stories/:storyId", requireAdminAuth, async (req, res) => {
    try {
      const { storyId } = req.params;
      const updates = req.body;
      const story = await storage.updateStory(storyId, updates);
      if (!story) {
        return res.status(404).json({ error: "Story not found" });
      }
      res.json(story);
    } catch (error) {
      console.error("Error updating story:", error);
      res.status(500).json({ error: "Failed to update story" });
    }
  });

  // Delete a story
  app.delete("/api/admin/stories/:storyId", requireAdminAuth, async (req, res) => {
    try {
      const { storyId } = req.params;
      await storage.deleteStory(storyId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting story:", error);
      res.status(500).json({ error: "Failed to delete story" });
    }
  });

  // Publish a story
  app.post("/api/admin/stories/:storyId/publish", requireAdminAuth, async (req, res) => {
    try {
      const { storyId } = req.params;
      const story = await storage.publishStory(storyId);
      if (!story) {
        return res.status(404).json({ error: "Story not found" });
      }
      res.json(story);
    } catch (error) {
      console.error("Error publishing story:", error);
      res.status(500).json({ error: "Failed to publish story" });
    }
  });

  // Add a page to a story
  app.post("/api/admin/stories/:storyId/pages", requireAdminAuth, async (req, res) => {
    try {
      const { storyId } = req.params;
      const { sentence, englishTranslation, pageNumber } = req.body;
      
      if (!sentence || typeof pageNumber !== 'number') {
        return res.status(400).json({ error: "sentence and pageNumber are required" });
      }
      
      const page = await storage.createStoryPage({
        storyId,
        pageNumber,
        sentence,
        englishTranslation: englishTranslation || null,
      });
      
      res.json(page);
    } catch (error) {
      console.error("Error creating story page:", error);
      res.status(500).json({ error: "Failed to create page" });
    }
  });

  // Update a story page
  app.patch("/api/admin/stories/pages/:pageId", requireAdminAuth, async (req, res) => {
    try {
      const { pageId } = req.params;
      const updates = req.body;
      const page = await storage.updateStoryPage(pageId, updates);
      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }
      res.json(page);
    } catch (error) {
      console.error("Error updating story page:", error);
      res.status(500).json({ error: "Failed to update page" });
    }
  });

  // Delete a story page
  app.delete("/api/admin/stories/pages/:pageId", requireAdminAuth, async (req, res) => {
    try {
      const { pageId } = req.params;
      await storage.deleteStoryPage(pageId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting story page:", error);
      res.status(500).json({ error: "Failed to delete page" });
    }
  });

  app.post("/api/admin/stories/pages/:pageId/generate-image", requireAdminAuth, async (req, res) => {
    try {
      const { pageId } = req.params;
      const { prompt, storyId } = req.body;
      
      const basePrompt = prompt || "Simple children's book illustration, friendly cartoon style, white background";
      
      let isComic = false;
      if (storyId) {
        const storyObj = await storage.getStoryById(storyId);
        if (storyObj?.storyType === 'comic') isComic = true;
      }
      
      const stylePrefix = isComic
        ? "Comic book panel illustration, bold outlines, bright flat colors, dynamic comic art style for kids"
        : basePrompt;
      const imagePrompt = isComic
        ? `${stylePrefix}. Scene: ${prompt || basePrompt}. IMPORTANT: No text, speech bubbles, letters, words, numbers, or writing of any kind in the image.`
        : `${basePrompt}. IMPORTANT: No text, letters, words, numbers, or writing of any kind in the image.`;
      
      let referenceImages: ReferenceImage[] = [];
      if (storyId) {
        referenceImages = await loadReferenceImagesForStory(storyId);
      }
      
      const base64Data = await generateOpenAIImage(
        imagePrompt,
        referenceImages.length > 0 ? referenceImages : undefined,
        { quality: "medium" },
      );
      const imageUrl = await saveImageFromBase64(`story-page-${pageId}`, base64Data);
      
      await storage.updateStoryPage(pageId, { imageUrl });
      
      res.json({ imageUrl, usedReferences: referenceImages.length > 0 });
    } catch (error) {
      console.error("Error generating story page image:", error);
      res.status(500).json({ error: "Failed to generate image" });
    }
  });

  // Generate an exciting cover image for a story
  app.post("/api/admin/stories/:storyId/generate-cover", requireAdminAuth, async (req, res) => {
    try {
      const { storyId } = req.params;

      const story = await storage.getStoryById(storyId);
      if (!story) return res.status(404).json({ error: "Story not found" });

      const pages = await storage.getStoryPages(storyId);
      const references = await storage.getStoryReferences(storyId);

      // Build context from the story's pages
      const pageDescriptions = pages
        .slice(0, 5)
        .map(p => p.englishTranslation || p.sentence)
        .filter(Boolean)
        .join('. ');

      const characterDesc = references.length > 0
        ? references.map(r => `${r.name}: ${r.description}`).join('; ')
        : '';

      const isComic = story.storyType === 'comic';

      let coverPrompt: string;
      if (isComic) {
        coverPrompt = [
          `COMIC BOOK COVER for children ages 5-7, titled "${story.title}".`,
          `Bold dynamic composition, thick outlines, bright vivid flat colors, action-packed and exciting.`,
          pageDescriptions ? `Story scenes: ${pageDescriptions}.` : '',
          characterDesc ? `Characters: ${characterDesc}.` : '',
          `Portrait orientation, full bleed illustration. Exuberant energy, looks thrilling and fun, makes a child desperate to read it.`,
          `IMPORTANT: No text, titles, letters, words, numbers, speech bubbles, or writing of any kind in the image.`,
        ].filter(Boolean).join(' ');
      } else {
        coverPrompt = [
          `CHILDREN'S BOOK COVER illustration for ages 5-7, titled "${story.title}".`,
          `Warm magical atmosphere, vibrant colors, inviting storybook style. Looks exciting and enchanting.`,
          pageDescriptions ? `Story is about: ${pageDescriptions}.` : '',
          characterDesc ? `Characters: ${characterDesc}.` : '',
          `Portrait orientation, full bleed illustration. Looks like a beloved picture book that a child cannot wait to open.`,
          `IMPORTANT: No text, titles, letters, words, numbers, or writing of any kind in the image.`,
        ].filter(Boolean).join(' ');
      }

      const referenceImages = await loadReferenceImagesForStory(storyId);
      const base64Data = await generateOpenAIImage(
        coverPrompt,
        referenceImages.length > 0 ? referenceImages : undefined,
        { size: "1024x1536", quality: "high" },
      );
      const coverImageUrl = await saveImageFromBase64(`story-cover-${storyId}`, base64Data);

      await storage.updateStory(storyId, { coverImageUrl });

      res.json({ coverImageUrl });
    } catch (error) {
      console.error("Error generating story cover:", error);
      res.status(500).json({ error: "Failed to generate cover" });
    }
  });

  // Generate images for all pages of a story at once (with character consistency)
  app.post("/api/admin/stories/:storyId/generate-all-images", requireAdminAuth, async (req, res) => {
    try {
      const { storyId } = req.params;
      
      const story = await storage.getStoryById(storyId);
      if (!story) {
        return res.status(404).json({ error: "Story not found" });
      }
      
      const pages = await storage.getStoryPages(storyId);
      if (pages.length === 0) {
        return res.status(400).json({ error: "Story has no pages" });
      }
      
      // Load reference images for character consistency
      const referenceImages = await loadReferenceImagesForStory(storyId);
      const hasReferences = referenceImages.length > 0;
      
      const results: { pageId: string; success: boolean; imageUrl?: string; error?: string }[] = [];
      
      const isComic = story.storyType === 'comic';
      
      for (const page of pages) {
        try {
          const sceneDesc = page.englishTranslation || page.sentence;
          let imagePrompt: string;
          if (isComic) {
            imagePrompt = `Comic book panel illustration, bold outlines, bright flat colors, dynamic comic art style for kids. Scene: "${sceneDesc}". Colorful, suitable for 6-year-old child. IMPORTANT: No text, speech bubbles, letters, words, numbers, or writing of any kind in the image.`;
          } else {
            imagePrompt = `Simple children's book illustration for: "${sceneDesc}". Cartoon style, colorful, friendly, white background, suitable for 6-year-old child. IMPORTANT: No text, letters, words, numbers, or writing of any kind in the image.`;
          }
          
          const base64Data = await generateOpenAIImage(
            imagePrompt,
            hasReferences ? referenceImages : undefined,
            { quality: "medium" },
          );
          const imageUrl = await saveImageFromBase64(`story-page-${page.id}`, base64Data);
          
          await storage.updateStoryPage(page.id, { imageUrl });
          
          results.push({ pageId: page.id, success: true, imageUrl });
        } catch (pageError) {
          console.error(`Error generating image for page ${page.id}:`, pageError);
          results.push({ pageId: page.id, success: false, error: 'Failed to generate image' });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      res.json({ 
        message: `Generated ${successCount}/${pages.length} images${hasReferences ? ' with character consistency' : ''}`,
        results,
        usedReferences: hasReferences
      });
    } catch (error) {
      console.error("Error generating all story images:", error);
      res.status(500).json({ error: "Failed to generate images" });
    }
  });

  // Add a quiz question to a story
  app.post("/api/admin/stories/:storyId/quizzes", requireAdminAuth, async (req, res) => {
    try {
      const { storyId } = req.params;
      const { questionNumber, question, correctAnswer, wrongOption1, wrongOption2 } = req.body;
      
      if (!question || !correctAnswer || !wrongOption1 || !wrongOption2 || typeof questionNumber !== 'number') {
        return res.status(400).json({ error: "questionNumber, question, correctAnswer, wrongOption1, and wrongOption2 are required" });
      }
      
      const quiz = await storage.createStoryQuiz({
        storyId,
        questionNumber,
        question,
        correctAnswer,
        wrongOption1,
        wrongOption2,
      });
      
      res.json(quiz);
    } catch (error) {
      console.error("Error creating story quiz:", error);
      res.status(500).json({ error: "Failed to create quiz" });
    }
  });

  // Update a quiz question
  app.patch("/api/admin/stories/quizzes/:quizId", requireAdminAuth, async (req, res) => {
    try {
      const { quizId } = req.params;
      const updates = req.body;
      const quiz = await storage.updateStoryQuiz(quizId, updates);
      if (!quiz) {
        return res.status(404).json({ error: "Quiz not found" });
      }
      res.json(quiz);
    } catch (error) {
      console.error("Error updating story quiz:", error);
      res.status(500).json({ error: "Failed to update quiz" });
    }
  });

  // Delete a quiz question
  app.delete("/api/admin/stories/quizzes/:quizId", requireAdminAuth, async (req, res) => {
    try {
      const { quizId } = req.params;
      await storage.deleteStoryQuiz(quizId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting story quiz:", error);
      res.status(500).json({ error: "Failed to delete quiz" });
    }
  });

  // Story character/object references for image consistency
  // Get all references for a story
  app.get("/api/admin/stories/:storyId/references", requireAdminAuth, async (req, res) => {
    try {
      const { storyId } = req.params;
      const references = await storage.getStoryReferences(storyId);
      res.json(references);
    } catch (error) {
      console.error("Error fetching story references:", error);
      res.status(500).json({ error: "Failed to fetch references" });
    }
  });

  // Create a new reference for a story
  app.post("/api/admin/stories/:storyId/references", requireAdminAuth, async (req, res) => {
    try {
      const { storyId } = req.params;
      const { name, description } = req.body;
      
      if (!name || !description) {
        return res.status(400).json({ error: "name and description are required" });
      }
      
      const reference = await storage.createStoryReference({
        storyId,
        name,
        description,
      });
      
      res.json(reference);
    } catch (error) {
      console.error("Error creating story reference:", error);
      res.status(500).json({ error: "Failed to create reference" });
    }
  });

  // Generate reference image for a character/object
  app.post("/api/admin/stories/references/:referenceId/generate-image", requireAdminAuth, async (req, res) => {
    try {
      const { referenceId } = req.params;
      
      const reference = await storage.getStoryReferenceById(referenceId);
      if (!reference) {
        return res.status(404).json({ error: "Reference not found" });
      }
      
      // Generate a reference image based on the description
      const imagePrompt = `Character reference sheet for children's book: ${reference.name}. Description: ${reference.description}. Cartoon style, simple design, friendly appearance, colorful, white background, suitable for 6-year-old children. IMPORTANT: No text, letters, words, numbers, or writing of any kind in the image.`;
      
      const base64Data = await generateOpenAIImage(imagePrompt);
      const imageUrl = await saveImageFromBase64(`story-ref-${referenceId}`, base64Data);
      
      await storage.updateStoryReference(referenceId, { referenceImageUrl: imageUrl });
      
      res.json({ referenceImageUrl: imageUrl });
    } catch (error) {
      console.error("Error generating reference image:", error);
      res.status(500).json({ error: "Failed to generate reference image" });
    }
  });

  // Update a reference
  app.patch("/api/admin/stories/references/:referenceId", requireAdminAuth, async (req, res) => {
    try {
      const { referenceId } = req.params;
      const { name, description } = req.body;
      
      const updated = await storage.updateStoryReference(referenceId, { name, description });
      if (!updated) {
        return res.status(404).json({ error: "Reference not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating story reference:", error);
      res.status(500).json({ error: "Failed to update reference" });
    }
  });

  // Delete a reference
  app.delete("/api/admin/stories/references/:referenceId", requireAdminAuth, async (req, res) => {
    try {
      const { referenceId } = req.params;
      await storage.deleteStoryReference(referenceId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting story reference:", error);
      res.status(500).json({ error: "Failed to delete reference" });
    }
  });

  app.post("/api/admin/stories/preview", requireAdminAuth, async (req, res) => {
    try {
      const { userId, theme, pageCount, storyType } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Get user's learned vocabulary
      const allProgress = await storage.getAllLearningProgress(userId);
      const learnedWordIds = allProgress.filter(p => p.isLearned).map(p => p.wordId);
      const allVocab = await storage.getAllVocabulary(user.language as Language);
      const learnedWords = allVocab.filter(w => learnedWordIds.includes(w.id));
      
      if (learnedWords.length < 10) {
        return res.status(400).json({ error: "User needs at least 10 learned words to generate a story" });
      }
      
      // Create word list for the AI prompt - show ONLY the target language words
      const wordListRaw = learnedWords.slice(0, 50).map(w => w.targetWord).join(', ');
      const wordListWithMeanings = learnedWords.slice(0, 50).map(w => `${w.targetWord} = ${w.english}`).join('\n');
      const languageName = user.language === 'russian' ? 'Russian' : 'Spanish';
      const storyTheme = theme || 'a fun adventure';
      const targetPageCount = pageCount || 10;
      const isComic = storyType === 'comic';
      
      // Grammar connecting words that are allowed even if not learned
      const grammarWords = user.language === 'russian' 
        ? 'в, на, с, к, и, а, но, у, из, за, по, от, до, для, без, под, над, перед, между, через, это, не'
        : 'en, a, con, de, y, o, pero, para, por, sin, sobre, entre, hacia, desde, hasta, durante, es, no';
      
      // Language-specific grammar instructions
      const grammarInstructions = user.language === 'russian' 
        ? `CRITICAL RUSSIAN GRAMMAR RULES - YOU MUST FOLLOW THESE:
- Use correct noun cases (падежи): nominative for subjects, accusative for direct objects, prepositional after в/на, genitive after из/для/без, dative after к
- Apply proper verb conjugations: я вижу, он видит, мы видим
- Match adjective endings to noun gender and case: красивая девочка, красивый мальчик, красивое небо
- Use correct preposition+case combinations: в доме (prepositional), в дом (accusative for motion)
- Examples of CORRECT grammar: "Мальчик видит собаку" (not "Мальчик видит собака"), "Девочка в доме" (not "Девочка в дом" if she's inside)
- Keep sentences grammatically perfect even if simple`
        : `SPANISH GRAMMAR RULES:
- Use correct verb conjugations: yo veo, él ve, nosotros vemos
- Match adjective gender/number with nouns: niña bonita, niño bonito
- Use correct prepositions: en la casa, a la escuela
- Keep sentences grammatically perfect even if simple`;

      const sentenceLengthRule = isComic
        ? `SENTENCE LENGTH RULE - VERY IMPORTANT:
- Each sentence should have 3 TO 6 content words (nouns, verbs, adjectives, adverbs) — enough for an expressive comic panel caption
- Connecting/grammar words (${grammarWords}) do NOT count toward the word limit
- Example: "Мальчик быстро бежит к большому дому" = 5 content words (good!)
- Example: "Кот прыгает на красивый стол" = 4 content words (good!)
- Example: "Девочка плачет" = 2 content words (too short for a comic panel)
- Example: "Он" = 1 content word (too short!)`
        : `SENTENCE LENGTH RULE - VERY IMPORTANT:
- Each sentence must have NO MORE THAN 3 content words (nouns, verbs, adjectives)
- Connecting/grammar words (${grammarWords}) do NOT count toward the 3-word limit
- Example: "Мальчик видит собаку" = 3 content words (good!)
- Example: "Девочка в доме" = 2 content words + 1 grammar word (good!)
- Example: "Большая красивая собака бежит быстро" = 5 content words (TOO LONG!)`;

      const sentenceDesc = isComic
        ? `${languageName} sentence (3-6 content words, expressive comic caption)`
        : `${languageName} sentence (max 3 content words)`;

      const pageSentenceGuide = isComic
        ? `Each page has ONE expressive sentence (3-6 content words) suitable as a comic panel caption.`
        : `Each page has ONE short sentence (max 3 content words).`;
      
      // Use Gemini to generate the story preview
      const storyPrompt = `You are creating a ${languageName} story for a 6-year-old language learner.

CRITICAL: Generate the story DIRECTLY in ${languageName}. Do NOT write in English first and translate.

STORY STRUCTURE - HERO'S JOURNEY (simplified for children):
1. BEGINNING: Introduce the hero in their normal world (1-2 pages)
2. PROBLEM: Something goes wrong or a challenge appears (1-2 pages)
3. JOURNEY: The hero tries to solve the problem, maybe fails at first (3-4 pages)
4. SOLUTION: The hero finds a way to overcome the challenge (2-3 pages)
5. ENDING: The hero returns home wiser/happier, lesson learned (1-2 pages)

Make the story FUN and ENGAGING! Include:
- A relatable hero (child, animal, or friendly creature)
- An interesting problem or adventure
- Emotions (happy, sad, scared, brave, surprised)
- A satisfying resolution
- A simple moral or lesson

${sentenceLengthRule}

THE CHILD KNOWS THESE ${languageName.toUpperCase()} WORDS:
${wordListRaw}

WORD MEANINGS FOR REFERENCE:
${wordListWithMeanings}

ALLOWED GRAMMAR/CONNECTING WORDS (use freely, don't count as content words): ${grammarWords}

${grammarInstructions}

IMAGE PROMPT RULES - VERY IMPORTANT:
- Describe ONLY visual scenes (people, animals, objects, actions, settings)
- NEVER include any text, letters, words, numbers, or writing in image prompts
- Example good: "A happy boy playing with a red ball in a sunny park"
- Example bad: "A sign that says 'Welcome'" or "The number 5 on a door"

THEME: ${storyTheme}
TARGET PAGES: ${targetPageCount}

Create a fun adventure story using ONLY the vocabulary words listed above. ${pageSentenceGuide} EVERY sentence must be grammatically perfect in ${languageName}.

CHARACTER CONSISTENCY - VERY IMPORTANT:
- List ALL main characters and important objects that appear in the story
- Include physical descriptions for consistent illustration across pages
- Characters should have distinctive, easy-to-draw features

Return ONLY a valid JSON object with this exact structure (no markdown, no code blocks):
{
  "title": "Story title in ${languageName}",
  "englishTitle": "Story title in English",
  "lesson": "Brief description of the story's lesson/moral",
  "storyArc": "One sentence describing the hero's challenge and how they overcome it",
  "characters": [
    { "name": "Character name (e.g., 'Main Cat', 'Magic Ball')", "description": "Detailed visual description for consistent illustration (e.g., 'Fluffy orange tabby cat with bright green eyes, white paws, and a red collar with a bell')" }
  ],
  "pages": [
    { "sentence": "${sentenceDesc}", "englishTranslation": "English translation", "imagePrompt": "Visual scene description - NO text/letters/numbers" }
  ],
  "quizzes": [
    { "question": "Question in English about the story", "correctAnswer": "Correct answer in ${languageName}", "wrongOption1": "Wrong answer in ${languageName}", "wrongOption2": "Wrong answer in ${languageName}" }
  ]
}`;

      const geminiResponse = await geminiAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: storyPrompt }] }],
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
        },
      });
      
      const content = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        throw new Error("No content in AI response");
      }
      
      // Clean up the response in case it has markdown code blocks
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith('```json')) {
        cleanedContent = cleanedContent.slice(7);
      } else if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.slice(3);
      }
      if (cleanedContent.endsWith('```')) {
        cleanedContent = cleanedContent.slice(0, -3);
      }
      cleanedContent = cleanedContent.trim();
      
      let storyData;
      try {
        storyData = JSON.parse(cleanedContent);
      } catch (parseError) {
        console.error("Failed to parse story JSON:", cleanedContent.substring(0, 500));
        throw new Error("AI returned invalid JSON format for story");
      }
      
      // Validate story structure
      if (!storyData.title || !Array.isArray(storyData.pages) || storyData.pages.length === 0) {
        throw new Error("AI returned incomplete story data");
      }
      
      // Return the preview without saving to database
      res.json({
        preview: true,
        userId,
        language: user.language,
        title: storyData.title,
        englishTitle: storyData.englishTitle || storyData.title,
        lesson: storyData.lesson || '',
        storyArc: storyData.storyArc || '',
        characters: storyData.characters || [],
        pages: storyData.pages,
        quizzes: storyData.quizzes || [],
      });
    } catch (error) {
      console.error("Error generating story preview:", error);
      res.status(500).json({ error: "Failed to generate story preview" });
    }
  });

  // Confirm and save a previewed story to the database
  app.post("/api/admin/stories/confirm", requireAdminAuth, async (req, res) => {
    try {
      const { userId, title, language, pages, quizzes, characters, storyType } = req.body;
      
      if (!userId || !title || !language || !pages || !Array.isArray(pages)) {
        return res.status(400).json({ error: "userId, title, language, and pages are required" });
      }
      
      // Validate language
      if (language !== 'russian' && language !== 'spanish') {
        return res.status(400).json({ error: "Language must be 'russian' or 'spanish'" });
      }
      
      // Validate pages have required fields
      for (const page of pages) {
        if (!page.sentence || typeof page.sentence !== 'string') {
          return res.status(400).json({ error: "Each page must have a valid sentence" });
        }
      }
      
      // Validate quizzes if provided
      if (quizzes && Array.isArray(quizzes)) {
        for (const quiz of quizzes) {
          if (!quiz.question || !quiz.correctAnswer || !quiz.wrongOption1 || !quiz.wrongOption2) {
            return res.status(400).json({ error: "Each quiz must have question, correctAnswer, wrongOption1, and wrongOption2" });
          }
        }
      }
      
      const story = await storage.createStory({
        title,
        targetUserId: userId,
        language,
        status: 'draft',
        storyType: storyType || 'story',
        pageCount: pages.length,
      });
      
      // Create pages
      for (let i = 0; i < pages.length; i++) {
        const pageData = pages[i];
        await storage.createStoryPage({
          storyId: story.id,
          pageNumber: i + 1,
          sentence: pageData.sentence,
          englishTranslation: pageData.englishTranslation,
        });
      }
      
      // Create quizzes if provided
      if (quizzes && Array.isArray(quizzes)) {
        for (let i = 0; i < quizzes.length; i++) {
          const quizData = quizzes[i];
          await storage.createStoryQuiz({
            storyId: story.id,
            questionNumber: i + 1,
            question: quizData.question,
            correctAnswer: quizData.correctAnswer,
            wrongOption1: quizData.wrongOption1,
            wrongOption2: quizData.wrongOption2,
          });
        }
      }
      
      // Auto-create character references if provided
      if (characters && Array.isArray(characters)) {
        for (const character of characters) {
          if (character.name && character.description) {
            await storage.createStoryReference({
              storyId: story.id,
              name: character.name,
              description: character.description,
            });
          }
        }
      }
      
      // Fetch the complete story with pages and quizzes
      const savedPages = await storage.getStoryPages(story.id);
      const savedQuizzes = await storage.getStoryQuizzes(story.id);
      
      res.json({ 
        ...story, 
        pages: savedPages, 
        quizzes: savedQuizzes, 
        imagePrompts: pages.map((p: any) => p.imagePrompt) 
      });
    } catch (error) {
      console.error("Error saving story:", error);
      res.status(500).json({ error: "Failed to save story" });
    }
  });

  // Generate a complete story using AI based on user's vocabulary (legacy - saves directly)
  app.post("/api/admin/stories/generate", requireAdminAuth, async (req, res) => {
    try {
      const { userId, theme, storyType } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Get user's learned vocabulary
      const allProgress = await storage.getAllLearningProgress(userId);
      const learnedWordIds = allProgress.filter(p => p.isLearned).map(p => p.wordId);
      const allVocab = await storage.getAllVocabulary(user.language as Language);
      const learnedWords = allVocab.filter(w => learnedWordIds.includes(w.id));
      
      if (learnedWords.length < 10) {
        return res.status(400).json({ error: "User needs at least 10 learned words to generate a story" });
      }
      
      // Create word list for the AI prompt - show ONLY the target language words
      const wordListRaw = learnedWords.slice(0, 50).map(w => w.targetWord).join(', ');
      const wordListWithMeanings = learnedWords.slice(0, 50).map(w => `${w.targetWord} = ${w.english}`).join('\n');
      const languageName = user.language === 'russian' ? 'Russian' : 'Spanish';
      const storyTheme = theme || 'a fun adventure';
      
      const isComicLegacy = storyType === 'comic';
      
      // Grammar connecting words that are allowed even if not learned
      const grammarWords = user.language === 'russian' 
        ? 'в, на, с, к, и, а, но, у, из, за, по, от, до, для, без, под, над, перед, между, через, это, не'
        : 'en, a, con, de, y, o, pero, para, por, sin, sobre, entre, hacia, desde, hasta, durante, es, no';
      
      // Language-specific grammar instructions
      const grammarInstructions = user.language === 'russian' 
        ? `CRITICAL RUSSIAN GRAMMAR RULES - YOU MUST FOLLOW THESE:
- Use correct noun cases (падежи): nominative for subjects, accusative for direct objects, prepositional after в/на, genitive after из/для/без, dative after к
- Apply proper verb conjugations: я вижу, он видит, мы видим
- Match adjective endings to noun gender and case: красивая девочка, красивый мальчик, красивое небо
- Use correct preposition+case combinations: в доме (prepositional), в дом (accusative for motion)
- Examples of CORRECT grammar: "Мальчик видит собаку" (not "Мальчик видит собака"), "Девочка в доме" (not "Девочка в дом" if she's inside)
- Keep sentences grammatically perfect even if simple`
        : `SPANISH GRAMMAR RULES:
- Use correct verb conjugations: yo veo, él ve, nosotros vemos
- Match adjective gender/number with nouns: niña bonita, niño bonito
- Use correct prepositions: en la casa, a la escuela
- Keep sentences grammatically perfect even if simple`;

      const sentenceLengthRuleLegacy = isComicLegacy
        ? `SENTENCE LENGTH RULE - VERY IMPORTANT:
- Each sentence should have 3 TO 6 content words (nouns, verbs, adjectives, adverbs) — enough for an expressive comic panel caption
- Connecting/grammar words (${grammarWords}) do NOT count toward the word limit
- Example: "Мальчик быстро бежит к большому дому" = 5 content words (good!)
- Example: "Кот прыгает на красивый стол" = 4 content words (good!)
- Example: "Девочка плачет" = 2 content words (too short for a comic panel)`
        : `SENTENCE LENGTH RULE - VERY IMPORTANT:
- Each sentence must have NO MORE THAN 3 content words (nouns, verbs, adjectives)
- Connecting/grammar words (${grammarWords}) do NOT count toward the 3-word limit
- Example: "Мальчик видит собаку" = 3 content words (good!)
- Example: "Девочка в доме" = 2 content words + 1 grammar word (good!)
- Example: "Большая красивая собака бежит быстро" = 5 content words (TOO LONG!)`;

      const sentenceDescLegacy = isComicLegacy
        ? `${languageName} sentence (3-6 content words, expressive comic caption)`
        : `${languageName} sentence (max 3 content words)`;

      const pageSentenceGuideLegacy = isComicLegacy
        ? `Each page has ONE expressive sentence (3-6 content words) suitable as a comic panel caption.`
        : `Each page has ONE short sentence (max 3 content words).`;
      
      const storyPrompt = `You are creating a ${languageName} story for a 6-year-old language learner.

CRITICAL: Generate the story DIRECTLY in ${languageName}. Do NOT write in English first and translate.

STORY STRUCTURE - HERO'S JOURNEY (simplified for children):
1. BEGINNING: Introduce the hero in their normal world (1-2 pages)
2. PROBLEM: Something goes wrong or a challenge appears (1-2 pages)
3. JOURNEY: The hero tries to solve the problem, maybe fails at first (3-4 pages)
4. SOLUTION: The hero finds a way to overcome the challenge (2-3 pages)
5. ENDING: The hero returns home wiser/happier, lesson learned (1-2 pages)

Make the story FUN and ENGAGING! Include:
- A relatable hero (child, animal, or friendly creature)
- An interesting problem or adventure
- Emotions (happy, sad, scared, brave, surprised)
- A satisfying resolution
- A simple moral or lesson

${sentenceLengthRuleLegacy}

THE CHILD KNOWS THESE ${languageName.toUpperCase()} WORDS:
${wordListRaw}

WORD MEANINGS FOR REFERENCE:
${wordListWithMeanings}

ALLOWED GRAMMAR/CONNECTING WORDS (use freely, don't count as content words): ${grammarWords}

${grammarInstructions}

IMAGE PROMPT RULES - VERY IMPORTANT:
- Describe ONLY visual scenes (people, animals, objects, actions, settings)
- NEVER include any text, letters, words, numbers, or writing in image prompts
- Example good: "A happy boy playing with a red ball in a sunny park"
- Example bad: "A sign that says 'Welcome'" or "The number 5 on a door"

THEME: ${storyTheme}

Create a fun adventure story with 8-12 pages using ONLY the vocabulary words listed above. ${pageSentenceGuideLegacy} Include 3-5 quiz questions. EVERY sentence must be grammatically perfect in ${languageName}.

Return ONLY a valid JSON object with this exact structure (no markdown, no code blocks):
{
  "title": "Story title in ${languageName}",
  "pages": [
    { "sentence": "${sentenceDescLegacy}", "englishTranslation": "English translation", "imagePrompt": "Visual scene description - NO text/letters/numbers" }
  ],
  "quizzes": [
    { "question": "Question in English about the story", "correctAnswer": "Correct answer in ${languageName}", "wrongOption1": "Wrong answer in ${languageName}", "wrongOption2": "Wrong answer in ${languageName}" }
  ]
}`;

      const geminiResponse = await geminiAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: storyPrompt }] }],
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
        },
      });
      
      const content = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        throw new Error("No content in AI response");
      }
      
      // Clean up the response in case it has markdown code blocks
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith('```json')) {
        cleanedContent = cleanedContent.slice(7);
      } else if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.slice(3);
      }
      if (cleanedContent.endsWith('```')) {
        cleanedContent = cleanedContent.slice(0, -3);
      }
      cleanedContent = cleanedContent.trim();
      
      let storyData;
      try {
        storyData = JSON.parse(cleanedContent);
      } catch (parseError) {
        console.error("Failed to parse story JSON:", cleanedContent.substring(0, 500));
        throw new Error("AI returned invalid JSON format for story");
      }
      
      // Validate story structure
      if (!storyData.title || !Array.isArray(storyData.pages) || storyData.pages.length === 0) {
        throw new Error("AI returned incomplete story data");
      }
      
      const story = await storage.createStory({
        title: storyData.title,
        targetUserId: userId,
        language: user.language,
        status: 'draft',
        storyType: storyType || 'story',
        pageCount: storyData.pages.length,
      });
      
      // Create pages
      for (let i = 0; i < storyData.pages.length; i++) {
        const pageData = storyData.pages[i];
        await storage.createStoryPage({
          storyId: story.id,
          pageNumber: i + 1,
          sentence: pageData.sentence,
          englishTranslation: pageData.englishTranslation,
        });
      }
      
      // Create quizzes
      for (let i = 0; i < storyData.quizzes.length; i++) {
        const quizData = storyData.quizzes[i];
        await storage.createStoryQuiz({
          storyId: story.id,
          questionNumber: i + 1,
          question: quizData.question,
          correctAnswer: quizData.correctAnswer,
          wrongOption1: quizData.wrongOption1,
          wrongOption2: quizData.wrongOption2,
        });
      }
      
      // Fetch the complete story with pages and quizzes
      const pages = await storage.getStoryPages(story.id);
      const quizzes = await storage.getStoryQuizzes(story.id);
      
      res.json({ ...story, pages, quizzes, imagePrompts: storyData.pages.map((p: any) => p.imagePrompt) });
    } catch (error) {
      console.error("Error generating story:", error);
      res.status(500).json({ error: "Failed to generate story" });
    }
  });

  // ========================
  // Frequency Dictionary API
  // ========================

  app.get("/api/admin/frequency-dictionary/:language", requireAdminAuth, async (req, res) => {
    try {
      const language = req.params.language as Language;
      if (language !== "russian" && language !== "spanish") {
        return res.status(400).json({ error: "Invalid language" });
      }
      const search = req.query.search as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const suggestedFilter = (req.query.suggestedFilter as string) || "all";
      const tierFilter = (req.query.tierFilter as string) || "all";
      const result = await storage.getFrequencyDictionary(language, { search, limit, offset, suggestedFilter: suggestedFilter as any, tierFilter: tierFilter as any });
      res.json(result);
    } catch (error) {
      console.error("Error fetching frequency dictionary:", error);
      res.status(500).json({ error: "Failed to fetch frequency dictionary" });
    }
  });

  app.get("/api/admin/frequency-dictionary/:language/curated-stats", requireAdminAuth, async (req, res) => {
    try {
      const language = req.params.language as Language;
      if (language !== "russian" && language !== "spanish") {
        return res.status(400).json({ error: "Invalid language" });
      }
      const stats = await storage.getCuratedStats(language);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching curated stats:", error);
      res.status(500).json({ error: "Failed to fetch curated stats" });
    }
  });

  app.get("/api/admin/curriculum/:language", requireAdminAuth, async (req, res) => {
    try {
      const language = req.params.language as Language;
      if (language !== "russian" && language !== "spanish") {
        return res.status(400).json({ error: "Invalid language" });
      }

      const curriculum: CurriculumPhase[] = CURRICULA[language] ?? [];

      // Collect all unique words across the curriculum (lowercased) so we can
      // hit the dictionary in one query rather than N.
      const allWords = new Set<string>();
      for (const p of curriculum) {
        for (const s of p.subthemes) {
          for (const w of s.words) allWords.add(w.word.toLowerCase().trim());
        }
      }

      const dictRows = allWords.size === 0 ? [] : await db
        .select({
          word: frequencyDictionary.word,
          tier: frequencyDictionary.tier,
          rank: frequencyDictionary.frequencyRank,
          category: frequencyDictionary.category,
          partOfSpeech: frequencyDictionary.partOfSpeech,
          rationale: frequencyDictionary.rationale,
        })
        .from(frequencyDictionary)
        .where(and(
          eq(frequencyDictionary.language, language),
          inArray(frequencyDictionary.word, [...allWords]),
        ));

      const byWord = new Map<string, typeof dictRows[0]>();
      for (const r of dictRows) byWord.set(r.word.toLowerCase().trim(), r);

      // Map curriculum words to vocabulary rows (by lowercased target word) so the
      // admin UI can offer image generation for curriculum entries that lack one.
      const vocabRows = await storage.getAllVocabulary(language);
      const vocabByWord = new Map<string, { id: string; hasImage: boolean }>();
      for (const v of vocabRows) {
        const k = v.targetWord.toLowerCase().trim();
        if (!vocabByWord.has(k)) vocabByWord.set(k, { id: v.id, hasImage: !!v.imageUrl });
      }

      // Enrich the curriculum tree
      const seenAcrossPhases = new Set<string>();
      const phasesEnriched = curriculum.map((p) => ({
        phase: p.phase,
        name: p.name,
        goal: p.goal,
        color: p.color,
        subthemes: p.subthemes.map((s) => ({
          name: s.name,
          words: s.words.map((entry) => {
            const key = entry.word.toLowerCase().trim();
            const dup = seenAcrossPhases.has(key);
            seenAcrossPhases.add(key);
            const dict = byWord.get(key) ?? null;
            const vrow = vocabByWord.get(key) ?? null;
            return {
              word: entry.word,
              english: entry.english,
              tier: dict?.tier ?? null,
              rank: dict?.rank ?? null,
              category: dict?.category ?? null,
              partOfSpeech: dict?.partOfSpeech ?? null,
              rationale: dict?.rationale ?? null,
              inDictionary: dict !== null,
              duplicateInLaterPhase: dup,
              vocabId: vrow?.id ?? null,
              hasImage: vrow?.hasImage ?? false,
            };
          }),
        })),
      }));

      // Compute totals (across unique words)
      let totalUnique = allWords.size;
      let inDictCount = 0;
      let imagesPresent = 0;
      let imagesMissing = 0;
      const tierCounts: Record<string, number> = {};
      for (const w of allWords) {
        const r = byWord.get(w);
        if (r) inDictCount++;
        const tier = r?.tier ?? "missing";
        tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
        const vrow = vocabByWord.get(w);
        if (vrow) {
          if (vrow.hasImage) imagesPresent++;
          else imagesMissing++;
        }
      }

      res.json({
        phases: phasesEnriched,
        stats: {
          totalUnique,
          totalEntries: [...curriculum].reduce(
            (acc, p) => acc + p.subthemes.reduce((a, s) => a + s.words.length, 0),
            0,
          ),
          inDictCount,
          missingCount: totalUnique - inDictCount,
          tierCounts,
          imagesPresent,
          imagesMissing,
        },
      });
    } catch (error) {
      console.error("Error fetching curriculum:", error);
      res.status(500).json({ error: "Failed to fetch curriculum" });
    }
  });

  app.get("/api/admin/frequency-dictionary/:language/count", requireAdminAuth, async (req, res) => {
    try {
      const language = req.params.language as Language;
      if (language !== "russian" && language !== "spanish") {
        return res.status(400).json({ error: "Invalid language" });
      }
      const count = await storage.getFrequencyDictionaryCount(language);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching frequency dictionary count:", error);
      res.status(500).json({ error: "Failed to fetch count" });
    }
  });

  app.post("/api/admin/frequency-dictionary/:language/import", requireAdminAuth, async (req, res) => {
    try {
      const language = req.params.language as Language;
      if (language !== "russian" && language !== "spanish") {
        return res.status(400).json({ error: "Invalid language" });
      }
      const { content, clearExisting } = req.body;
      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "Content is required (plain text, one word per line)" });
      }

      if (clearExisting) {
        await storage.clearFrequencyDictionary(language);
      }

      const lines = content.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      const entries = lines.map((word: string, index: number) => ({
        word,
        language,
        frequencyRank: index + 1,
      }));

      await storage.insertFrequencyDictionaryBatch(entries);

      res.json({ imported: entries.length, language });
    } catch (error) {
      console.error("Error importing frequency dictionary:", error);
      res.status(500).json({ error: "Failed to import frequency dictionary" });
    }
  });

  const evaluationCancelFlags = new Map<string, boolean>();

  app.get("/api/admin/frequency-dictionary/:language/evaluate", (req: any, res: any, next: any) => {
    const token = req.query.token as string;
    if (!token || !adminTokens.has(token)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  }, async (req, res) => {
    const language = req.params.language as Language;
    if (language !== "russian" && language !== "spanish") {
      res.status(400).json({ error: "Invalid language" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const sendEvent = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    evaluationCancelFlags.set(language, false);

    const languageLabel = language === "russian" ? "Russian" : "Spanish";
    const BATCH_SIZE = 20;

    try {
      const totalUnevaluated = await storage.getFrequencyDictionary(language, { suggestedFilter: "unevaluated", limit: 1, offset: 0 });
      const totalRemaining = totalUnevaluated.total;
      let processed = 0;

      sendEvent({ type: "start", totalRemaining });

      while (true) {
        if (evaluationCancelFlags.get(language)) {
          sendEvent({ type: "cancelled", processed });
          break;
        }

        const batch = await storage.getUnevaluatedFrequencyWords(language, BATCH_SIZE);
        if (batch.length === 0) {
          sendEvent({ type: "complete", processed });
          break;
        }

        const wordList = batch.map((w) => w.word);
        const prompt = `You are a strict filter for ${languageLabel} vocabulary suitable for 5–6 year old native-speaking children.

For EVERY word below, answer in exactly ONE line using this format:
word: Yes + Yes
OR
word: No + No

First Yes/No = Is the word common and age-appropriate for a 5-6 year old?
Second Yes/No = Is the word concrete (not abstract)?

Yes if: Child hears/uses it in cartoons, kindergarten, family talk, simple books. Concrete, visual, can be shown in a picture book.
No if: Adult topic, very abstract, rare, literary, not in children's speech.

IMPORTANT: You MUST answer for ALL ${batch.length} words below. Do not skip any word.

${wordList.join("\n")}`;

        try {
          const geminiResponse = await geminiAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              temperature: 0.1,
              maxOutputTokens: 4000,
            },
          });

          const content = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text || "";
          const lines = content.split("\n").filter((l) => l.trim());

          const updates: { id: string; suggested: boolean }[] = [];

          for (const line of lines) {
            const match = line.match(/^[*\d.\s]*(.+?):\s*(Yes|No)\s*(?:\([^)]*\))?\s*[+\\/,]\s*(Yes|No)/i);
            if (match) {
              const word = match[1].trim().toLowerCase();
              const ageAppropriate = match[2].toLowerCase() === "yes";
              const foundWord = batch.find((w) => w.word.toLowerCase() === word);
              if (foundWord) {
                updates.push({ id: foundWord.id, suggested: ageAppropriate });
              }
            }
          }

          if (updates.length > 0) {
            await storage.updateFrequencyWordsSuggestedBatch(updates);
          }

          const matchedIds = new Set(updates.map((u) => u.id));
          const unmatchedCount = batch.filter((w) => !matchedIds.has(w.id)).length;

          processed += updates.length;
          const suggestedCount = updates.filter((u) => u.suggested).length;
          const rejectedCount = updates.length - suggestedCount;

          sendEvent({
            type: "batch",
            processed,
            totalRemaining,
            batchSize: batch.length,
            matched: updates.length,
            unmatched: unmatchedCount,
            suggested: suggestedCount,
            rejected: rejectedCount,
            words: batch.map((w) => {
              const update = updates.find((u) => u.id === w.id);
              return { word: w.word, suggested: update ? update.suggested : null };
            }),
          });
        } catch (aiError: any) {
          console.error("AI evaluation error:", aiError);
          sendEvent({ type: "error", message: aiError.message || "AI evaluation failed", processed });
          break;
        }
      }
    } catch (error: any) {
      console.error("Evaluation error:", error);
      sendEvent({ type: "error", message: error.message || "Evaluation failed" });
    } finally {
      evaluationCancelFlags.delete(language);
      res.end();
    }
  });

  app.post("/api/admin/frequency-dictionary/:language/evaluate/cancel", requireAdminAuth, async (req, res) => {
    const language = req.params.language as Language;
    evaluationCancelFlags.set(language, true);
    res.json({ success: true });
  });

  app.delete("/api/admin/frequency-dictionary/:language", requireAdminAuth, async (req, res) => {
    try {
      const language = req.params.language as Language;
      if (language !== "russian" && language !== "spanish") {
        return res.status(400).json({ error: "Invalid language" });
      }
      await storage.clearFrequencyDictionary(language);
      res.json({ success: true });
    } catch (error) {
      console.error("Error clearing frequency dictionary:", error);
      res.status(500).json({ error: "Failed to clear frequency dictionary" });
    }
  });

  return httpServer;
}
