import crypto from "crypto";
import { ElevenLabsClient } from "elevenlabs";
import { audioKey, uploadMp3, objectExists, publicUrl } from "./s3";
import { getMediaProviders } from "./mediaProvider";
import { xaiConfigured, xaiTTS } from "./xai";

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

// One voice per language. Russian: "Rachel" — warm friendly voice.
export const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
// Spanish: dedicated Spanish voice.
export const ELEVENLABS_SPANISH_VOICE_ID =
  process.env.ELEVENLABS_SPANISH_VOICE_ID || "twZzvyYIl5ntDHC1Vatv";
export const ELEVENLABS_CHILD_VOICE_ID =
  process.env.ELEVENLABS_CHILD_VOICE_ID || ELEVENLABS_VOICE_ID;

const MODEL_ID = "eleven_v3";
// WARNING: changing the key order or values in MODEL_ID / VOICE_SETTINGS
// invalidates every cached TTS hash and forces full regeneration on next
// request (real cost in ElevenLabs credits). Same applies to the key order
// of the payload object inside ttsHash() below.
const VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
} as const;

export type VoiceType = "native" | "child";

export function audioSpeedToTag(speed?: number): string {
  if (!speed || speed >= 1.0) return speed && speed >= 1.25 ? "[fast]" : "";
  if (speed <= 0.5) return "[very slowly]";
  return "[slowly]";
}

export function chunkWordForPronunciation(word: string): string {
  const vowels = /[аеёиоуыэюяaeiouáéíóú]/i;
  const chars = word.toLowerCase().split("");
  const chunks: string[] = [];
  let currentChunk = "";

  for (let i = 0; i < chars.length; i++) {
    currentChunk += chars[i];
    if (vowels.test(chars[i]) && i < chars.length - 1) {
      if (!vowels.test(chars[i + 1]) && i + 2 < chars.length && vowels.test(chars[i + 2])) {
        chunks.push(currentChunk);
        currentChunk = "";
      } else if (i + 2 < chars.length && !vowels.test(chars[i + 1]) && !vowels.test(chars[i + 2])) {
        currentChunk += chars[i + 1];
        i++;
        chunks.push(currentChunk);
        currentChunk = "";
      }
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks.join("-");
}

function ttsHash(finalText: string, voiceId: string, provider: string, speed?: number): string {
  const payload = JSON.stringify({
    text: finalText,
    voiceId,
    provider,
    speed: speed ?? 1,
    modelId: provider === "xai" ? "xai-tts" : MODEL_ID,
    settings: provider === "xai" ? { speed: speed ?? 1 } : VOICE_SETTINGS,
  });
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

function resolveVoiceId(
  language: string = "russian",
  voiceType: VoiceType = "native",
): string {
  const isSpanish = language === "spanish";
  if (voiceType === "child") {
    const childOverride = isSpanish
      ? process.env.ELEVENLABS_SPANISH_CHILD_VOICE_ID
      : process.env.ELEVENLABS_CHILD_VOICE_ID;
    if (childOverride) return childOverride;
  }
  return isSpanish ? ELEVENLABS_SPANISH_VOICE_ID : ELEVENLABS_VOICE_ID;
}

function resolveXaiVoice(voiceType: VoiceType, override?: string): string {
  if (override) return override;
  return voiceType === "child" ? "ara" : "eve";
}

function speedFromTag(speedTag: string): number {
  if (speedTag.includes("very slowly")) return 0.7;
  if (speedTag.includes("slowly")) return 0.85;
  if (speedTag.includes("fast")) return 1.25;
  return 1.0;
}

/**
 * Returns a public S3 URL to TTS audio. Provider is chosen from Studio media
 * prefs (ElevenLabs vs xAI). Cache keys include provider so switching backends
 * does not reuse the wrong audio.
 */
export async function getOrGenerateTTS(
  text: string,
  speedTag: string = "",
  voiceType: VoiceType = "native",
  language: string = "russian",
): Promise<string> {
  const prefs = await getMediaProviders();
  const useXai = prefs.ttsProvider === "xai" && xaiConfigured();

  if (useXai) {
    const voiceId = resolveXaiVoice(voiceType, prefs.xaiVoiceId);
    const speed = speedFromTag(speedTag);
    const finalText = text;
    const key = audioKey(ttsHash(finalText, voiceId, "xai", speed));
    if (await objectExists(key)) return publicUrl(key);

    console.log(`generating TTS via xAI (cache miss): "${finalText}" voice=${voiceId}`);
    try {
      const buffer = await xaiTTS({ text: finalText, voiceId, language, speed });
      return await uploadMp3(key, buffer);
    } catch (error: any) {
      console.error("xAI TTS error:", error?.message || error);
      throw error;
    }
  }

  const voiceId = resolveVoiceId(language, voiceType);
  const finalText = speedTag ? `${speedTag} ${text}` : text;
  const key = audioKey(ttsHash(finalText, voiceId, "elevenlabs"));

  if (await objectExists(key)) {
    return publicUrl(key);
  }

  console.log(`generating TTS (cache miss): "${finalText}" voice=${voiceId}`);
  try {
    const audioStream = await elevenlabs.textToSpeech.convert(voiceId, {
      text: finalText,
      model_id: MODEL_ID,
      voice_settings: VOICE_SETTINGS,
    });

    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) chunks.push(Buffer.from(chunk));
    const buffer = Buffer.concat(chunks);

    return await uploadMp3(key, buffer);
  } catch (error: any) {
    console.error("ElevenLabs TTS error:", error?.message || error);
    if (error?.statusCode) console.error("ElevenLabs status code:", error.statusCode);
    if (error?.body) console.error("ElevenLabs error body:", error.body);
    throw error;
  }
}

export { elevenlabs };
