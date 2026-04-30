import crypto from "crypto";
import { ElevenLabsClient } from "elevenlabs";
import { audioKey, uploadMp3, objectExists, publicUrl } from "./s3";

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

// "Rachel" — warm friendly voice, works for RU + ES.
export const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
export const ELEVENLABS_CHILD_VOICE_ID =
  process.env.ELEVENLABS_CHILD_VOICE_ID || ELEVENLABS_VOICE_ID;

const MODEL_ID = "eleven_v3";
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

function ttsHash(finalText: string, voiceId: string): string {
  const payload = JSON.stringify({
    text: finalText,
    voiceId,
    modelId: MODEL_ID,
    settings: VOICE_SETTINGS,
  });
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

function resolveVoiceId(voiceType: VoiceType = "native"): string {
  return voiceType === "child" ? ELEVENLABS_CHILD_VOICE_ID : ELEVENLABS_VOICE_ID;
}

/**
 * Returns a public S3 URL to TTS audio for the given inputs. Generates and
 * uploads to S3 on first miss; subsequent calls with identical inputs hit
 * cache and never call ElevenLabs.
 */
export async function getOrGenerateTTS(
  text: string,
  speedTag: string = "",
  voiceType: VoiceType = "native",
): Promise<string> {
  const voiceId = resolveVoiceId(voiceType);
  const finalText = speedTag ? `${speedTag} ${text}` : text;
  const key = audioKey(ttsHash(finalText, voiceId));

  if (await objectExists(key)) {
    return publicUrl(key);
  }

  console.log(`Generating TTS (cache miss): "${finalText}" voice=${voiceId}`);
  const audioStream = await elevenlabs.textToSpeech.convert(voiceId, {
    text: finalText,
    model_id: MODEL_ID,
    voice_settings: VOICE_SETTINGS,
  });

  const chunks: Buffer[] = [];
  for await (const chunk of audioStream) chunks.push(Buffer.from(chunk));
  const buffer = Buffer.concat(chunks);

  return uploadMp3(key, buffer);
}

export { elevenlabs };
