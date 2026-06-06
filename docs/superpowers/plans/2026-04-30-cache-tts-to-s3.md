# Cache ElevenLabs TTS Audio to S3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop regenerating identical TTS audio on every request. Cache every ElevenLabs response to S3 keyed by a deterministic hash of the inputs so repeat requests return a public S3 URL with zero ElevenLabs spend.

**Architecture:** A single helper `getOrGenerateTTS(text, voiceId, speedTag)` in a new `server/tts.ts` computes `sha256(JSON.stringify({finalText, voiceId, modelId, settings}))` → S3 key `audio/<hash>.mp3`. On a HEAD hit, returns `publicUrl(key)` immediately. On miss, calls ElevenLabs once, uploads the MP3 to S3 with `immutable` cache-control, returns the URL. All six existing `generateElevenLabsTTS` callsites in `server/routes.ts` swap to this helper, so what they return is now an S3 URL instead of a `data:audio/mpeg;base64,...` blob. A one-shot DB cleanup script wipes legacy base64 values out of `audioUrl` columns so the next request regenerates them as S3 URLs.

**Tech Stack:** TypeScript, Express, `@aws-sdk/client-s3` (already installed), `elevenlabs` SDK (already installed), Node `crypto` (built-in).

**Note on TDD:** This repo has no test runner / test directory. Per YAGNI for a 2-user side project, this plan uses manual `curl`-based verification instead of adding test infrastructure. Each task ends with explicit verification commands and expected output.

**Bonus fix included:** [server/routes.ts:188](server/routes.ts#L188) currently references an undefined `slowText` variable inside `generateElevenLabsTTS`. Task 2 fixes this as part of moving the function.

---

## File Structure

- **Modify** `server/s3.ts` — add `audioKey()` and `uploadMp3()` helpers next to existing `imageKey()` / `uploadPng()`.
- **Create** `server/tts.ts` — owns ElevenLabs client setup, the `getOrGenerateTTS` cache wrapper, the bonus `chunkWordForPronunciation` and `audioSpeedToTag` helpers (moved out of routes.ts so the route file shrinks and TTS logic lives in one place).
- **Modify** `server/routes.ts` — delete the moved helpers, swap six callsites of the old `generateElevenLabsTTS` for the new `getOrGenerateTTS` (the new helper already returns an S3 URL, so callsites get simpler).
- **Create** `script/clear-base64-audio.ts` — one-shot script: `UPDATE vocabulary SET audio_url = NULL WHERE audio_url LIKE 'data:%'`, same for `story_pages` and `example_sentences`. Wipes legacy base64 values so the next request regenerates them as S3 URLs.

---

### Task 1: Add audio helpers to `server/s3.ts`

**Files:**
- Modify: `server/s3.ts`

- [ ] **Step 1: Add `AUDIO_PREFIX`, `audioKey()`, `uploadMp3()` to s3.ts**

Open [server/s3.ts](server/s3.ts) and after line 22 (after `imageKey`), add:

```typescript
export const AUDIO_PREFIX = "audio";

export function audioKey(hash: string): string {
  const sanitized = hash.replace(/[^a-zA-Z0-9-_]/g, "");
  return `${AUDIO_PREFIX}/${sanitized}.mp3`;
}
```

Then after line 40 (after `uploadPng`), add:

```typescript
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors related to `server/s3.ts`.

- [ ] **Step 3: Commit**

```bash
git add server/s3.ts
git commit -m "Add audioKey and uploadMp3 helpers to s3 module"
```

---

### Task 2: Create `server/tts.ts` with the cache-aware wrapper

**Files:**
- Create: `server/tts.ts`

- [ ] **Step 1: Write the new module**

Create [server/tts.ts](server/tts.ts) with this exact content:

```typescript
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (The file compiles standalone — routes.ts will still have its own copies of these symbols until Task 3.)

- [ ] **Step 3: Commit**

```bash
git add server/tts.ts
git commit -m "Add tts module with S3-cached getOrGenerateTTS helper"
```

---

### Task 3: Wire `routes.ts` to the cached helper

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Update imports**

In [server/routes.ts](server/routes.ts), find the existing `import { ElevenLabsClient } from "elevenlabs";` line (line 7) and replace it with:

```typescript
import {
  elevenlabs,
  getOrGenerateTTS,
  audioSpeedToTag,
  chunkWordForPronunciation,
  ELEVENLABS_VOICE_ID,
  ELEVENLABS_CHILD_VOICE_ID,
} from "./tts";
```

- [ ] **Step 2: Delete the moved helpers from routes.ts**

Delete the entire block from line 126 (`const elevenlabs = new ElevenLabsClient(...)`) through line 217 (closing brace of `generateElevenLabsTTS`). That removes:
- The local `elevenlabs` client construction
- The local `ELEVENLABS_VOICE_ID` / `ELEVENLABS_CHILD_VOICE_ID` constants
- The local `chunkWordForPronunciation` function
- The local `audioSpeedToTag` function
- The local `generateElevenLabsTTS` function (which has the `slowText` bug)

These are all now imported from `./tts`.

- [ ] **Step 3: Replace callsite at example-sentence generation (was ~line 721)**

Find the `Promise.allSettled` block that generates an example sentence's image + audio:

```typescript
      const [imageResult, audioResult] = await Promise.allSettled([
        generateGeminiImage(imagePrompt).then(b64 => saveImageFromBase64(`example-${row.id}`, b64)),
        generateElevenLabsTTS(sentence, audioSpeedToTag(speed), voiceType ?? "native"),
      ]);
```

Replace the second array element so it reads:

```typescript
      const [imageResult, audioResult] = await Promise.allSettled([
        generateGeminiImage(imagePrompt).then(b64 => saveImageFromBase64(`example-${row.id}`, b64)),
        getOrGenerateTTS(sentence, audioSpeedToTag(speed), voiceType ?? "native"),
      ]);
```

- [ ] **Step 4: Replace callsite in `/api/tts/text` (was ~line 766)**

Find:

```typescript
      const audioUrl = await generateElevenLabsTTS(text, audioSpeedToTag(speed), voiceType);
```

Replace with:

```typescript
      const audioUrl = await getOrGenerateTTS(text, audioSpeedToTag(speed), voiceType);
```

- [ ] **Step 5: Replace callsite in `/api/tts/confirmation` (was ~line 791)**

Find:

```typescript
      const audioUrl = await generateElevenLabsTTS(confirmationText, audioSpeedToTag(speed), voiceType);
```

Replace with:

```typescript
      const audioUrl = await getOrGenerateTTS(confirmationText, audioSpeedToTag(speed), voiceType);
```

- [ ] **Step 6: Replace `/api/tts/:wordId` learn-mode callsite (was ~line 825)**

Find:

```typescript
        const audioUrl = await generateElevenLabsTTS(learnText, speedTag, voiceType);
        return res.json({ audioUrl });
```

Replace with:

```typescript
        const audioUrl = await getOrGenerateTTS(learnText, speedTag, voiceType);
        return res.json({ audioUrl });
```

- [ ] **Step 7: Replace `/api/tts/:wordId` regular-mode callsite + simplify cache logic**

Find:

```typescript
      // For regular mode, use cached audio only when native voice and default speed
      if (word.audioUrl && voiceType !== 'child' && !speed) {
        return res.json({ audioUrl: word.audioUrl });
      }

      const audioUrl = await generateElevenLabsTTS(word.targetWord, speedTag, voiceType);
      // Only cache native voice at default speed
      if (voiceType !== 'child' && !speed) {
        await storage.updateVocabularyAudio(wordId, audioUrl);
      }

      res.json({ audioUrl });
```

Replace with:

```typescript
      // S3 cache covers all variants. Still mirror the canonical
      // (native voice, default speed) URL into the DB row so client code
      // that reads word.audioUrl directly keeps working.
      const audioUrl = await getOrGenerateTTS(word.targetWord, speedTag, voiceType);
      if (voiceType !== 'child' && !speed && word.audioUrl !== audioUrl) {
        await storage.updateVocabularyAudio(wordId, audioUrl);
      }

      res.json({ audioUrl });
```

- [ ] **Step 8: Replace story-page TTS callsite (was ~line 1564)**

Find:

```typescript
      // If page already has audio, return it
      if (page.audioUrl) {
        return res.json({ audioUrl: page.audioUrl });
      }

      // Generate new audio
      const audioUrl = await generateElevenLabsTTS(page.sentence, '[very slowly]');

      // Save the audio URL to the page
      await storage.updateStoryPage(page.id, { audioUrl });

      res.json({ audioUrl });
```

Replace with:

```typescript
      const audioUrl = await getOrGenerateTTS(page.sentence, '[very slowly]');
      if (page.audioUrl !== audioUrl) {
        await storage.updateStoryPage(page.id, { audioUrl });
      }
      res.json({ audioUrl });
```

(The S3 HEAD check inside `getOrGenerateTTS` is cheap, and dropping the early-return means a base64 data URL stuck in the DB from the old code path no longer gets served back to the client — it gets overwritten with the S3 URL.)

- [ ] **Step 9: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Boot the server and verify a cache miss writes to S3**

Start the dev server in one terminal:

```bash
npm run dev
```

In another terminal, hit the text TTS endpoint with a fresh phrase:

```bash
curl -s -X POST http://localhost:5000/api/tts/text \
  -H 'Content-Type: application/json' \
  -d '{"text":"тестовая проверка кэша","voiceType":"native"}'
```

Expected response: `{"audioUrl":"https://<bucket>.s3.<region>.amazonaws.com/audio/<hash>.mp3"}`. The dev server log should show one `Generating TTS (cache miss): ...` line.

Confirm the object exists in S3:

```bash
aws s3 ls s3://$AWS_S3_BUCKET/audio/ | tail -5
```

Expected: an `.mp3` file timestamped just now.

- [ ] **Step 11: Verify the second call is a cache hit**

Run the exact same curl command again:

```bash
curl -s -X POST http://localhost:5000/api/tts/text \
  -H 'Content-Type: application/json' \
  -d '{"text":"тестовая проверка кэша","voiceType":"native"}'
```

Expected: identical `audioUrl` returned. The dev server log should NOT show another `Generating TTS (cache miss)` line — only the HEAD against S3 happened.

- [ ] **Step 12: Smoke-test the vocab + story endpoints in the UI**

Open the app in a browser, run a learn session and a story page. Confirm audio plays. Open the browser network tab and confirm the audio elements load `https://<bucket>.s3...amazonaws.com/audio/...` URLs (not `data:audio/mpeg;base64,...`).

- [ ] **Step 13: Commit**

```bash
git add server/routes.ts
git commit -m "Route TTS through S3 cache, drop base64 data URLs"
```

---

### Task 4: One-shot script to clear legacy base64 audio URLs from the DB

**Files:**
- Create: `script/clear-base64-audio.ts`

Some `vocabulary.audio_url`, `story_pages.audio_url`, and `example_sentences.audio_url` rows currently hold giant `data:audio/mpeg;base64,...` strings written by the old code path. The client reads these directly into `<audio>` elements. This script nullifies them so the next request to the relevant endpoint regenerates clean S3 URLs via Task 3's wiring.

- [ ] **Step 1: Write the script**

Create [script/clear-base64-audio.ts](script/clear-base64-audio.ts):

```typescript
import "dotenv/config";
import { db } from "../server/db";
import { vocabulary, storyPages, exampleSentences } from "../shared/schema";
import { sql } from "drizzle-orm";

async function main() {
  const v = await db
    .update(vocabulary)
    .set({ audioUrl: null })
    .where(sql`${vocabulary.audioUrl} LIKE 'data:%'`)
    .returning({ id: vocabulary.id });
  console.log(`Cleared base64 audioUrl on ${v.length} vocabulary rows.`);

  const p = await db
    .update(storyPages)
    .set({ audioUrl: null })
    .where(sql`${storyPages.audioUrl} LIKE 'data:%'`)
    .returning({ id: storyPages.id });
  console.log(`Cleared base64 audioUrl on ${p.length} story_page rows.`);

  const e = await db
    .update(exampleSentences)
    .set({ audioUrl: null })
    .where(sql`${exampleSentences.audioUrl} LIKE 'data:%'`)
    .returning({ id: exampleSentences.id });
  console.log(`Cleared base64 audioUrl on ${e.length} example_sentence rows.`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

> If the imported table names (`storyPages`, `exampleSentences`) differ in `shared/schema.ts`, adjust to match the exported names there. Run `grep -n "pgTable" shared/schema.ts` to confirm the exact identifiers before editing.

- [ ] **Step 2: Verify table names exist**

Run:

```bash
grep -n "pgTable" /Users/alexanderyurchenko/Documents/coding/mova/shared/schema.ts
```

Expected: lines showing `vocabulary = pgTable(...)`, `storyPages = pgTable(...)` (or similar), and `exampleSentences = pgTable(...)`. Update the import in the script if the exported variable names differ.

- [ ] **Step 3: Type-check the script**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the cleanup against the database**

```bash
npx tsx script/clear-base64-audio.ts
```

Expected output (counts will vary):

```
Cleared base64 audioUrl on 12 vocabulary rows.
Cleared base64 audioUrl on 8 story_page rows.
Cleared base64 audioUrl on 0 example_sentence rows.
```

- [ ] **Step 5: Verify no `data:` URLs remain**

Run:

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM vocabulary WHERE audio_url LIKE 'data:%';"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM story_pages WHERE audio_url LIKE 'data:%';"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM example_sentences WHERE audio_url LIKE 'data:%';"
```

Expected: each query returns `0`.

- [ ] **Step 6: Commit**

```bash
git add script/clear-base64-audio.ts
git commit -m "Add one-shot script to clear legacy base64 audio URLs"
```

---

### Task 5 (optional): Pre-warm vocab audio so first-use is instant

**Files:**
- Create: `script/warm-vocab-tts.ts`

Skip this task if you'd rather warm the cache lazily through normal app use. With ~2 users that's totally fine. Run this if you want zero latency on first play.

- [ ] **Step 1: Write the script**

Create [script/warm-vocab-tts.ts](script/warm-vocab-tts.ts):

```typescript
import "dotenv/config";
import { db } from "../server/db";
import { vocabulary } from "../shared/schema";
import { getOrGenerateTTS } from "../server/tts";

async function main() {
  const words = await db.select().from(vocabulary);
  console.log(`Warming TTS cache for ${words.length} vocabulary words...`);

  let hits = 0;
  let misses = 0;
  for (const word of words) {
    const before = Date.now();
    const url = await getOrGenerateTTS(word.targetWord, "", "native");
    const ms = Date.now() - before;
    // Cache hits are fast (HEAD only); misses include a full TTS call.
    if (ms < 200) hits++;
    else misses++;
    console.log(`  [${ms}ms] ${word.targetWord} -> ${url}`);
  }

  console.log(`\nDone. ~${hits} hits, ~${misses} new generations.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run it**

```bash
npx tsx script/warm-vocab-tts.ts
```

Expected: progress lines for each word, ending with hits/misses summary. The first run is mostly misses; rerun it to confirm it's mostly hits.

- [ ] **Step 4: Commit**

```bash
git add script/warm-vocab-tts.ts
git commit -m "Add vocab TTS warm-up script"
```

---

## Final Verification

After all tasks, do an end-to-end smoke test:

1. Restart `npm run dev`.
2. Tail the server log: `npm run dev 2>&1 | grep -E "Generating TTS|TTS"`
3. Use the app for a learn session of 5 words + a story page.
4. Confirm: every audio request after the first per (word, voice, speed) shows zero `Generating TTS (cache miss)` log lines. New (text, voice, speed) tuples generate exactly once each.
5. Open the browser network tab — confirm `<audio>` `src` values are S3 URLs, not `data:` URIs.

If the log shows repeat misses for the same input, the hash function is non-deterministic — re-check `ttsHash` in `server/tts.ts`.
