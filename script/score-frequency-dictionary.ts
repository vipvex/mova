import Anthropic from "@anthropic-ai/sdk";
import { storage, type FrequencyWordScoreUpdate } from "../server/storage";
import type { FrequencyDictionary, Language } from "../shared/schema";

const args = process.argv.slice(2);
const language = (args[0] as Language) || "russian";
const limitArg = args.find((a) => a.startsWith("--limit="));
const concurrencyArg = args.find((a) => a.startsWith("--concurrency="));
const batchSizeArg = args.find((a) => a.startsWith("--batch-size="));

const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;
const CONCURRENCY = concurrencyArg ? parseInt(concurrencyArg.split("=")[1], 10) : 5;
const BATCH_SIZE = batchSizeArg ? parseInt(batchSizeArg.split("=")[1], 10) : 20;

if (language !== "russian" && language !== "spanish") {
  console.error(`Invalid language: ${language}`);
  process.exit(1);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Missing ANTHROPIC_API_KEY");
  process.exit(1);
}

const client = new Anthropic({ apiKey });

const languageLabel = language === "russian" ? "Russian" : "Spanish";

const RUBRIC = `You are scoring ${languageLabel} vocabulary for a 6-year-old child whose goal is conversational fluency (NOT literary, NOT academic). The target is ~2,000 high-quality words across 4 learning tiers.

For EACH word, return a JSON object with these fields:

HARD GATE (set gatePass=false and tier="Reject" if word is any of these):
- profane / sexual / violent / drug-related
- bureaucratic / legal / political / military (государство, парламент, налогообложение)
- adult professional / financial life (ипотека, командировка, бухгалтерия)
- archaic, literary, poetic-only (вельможа, оный)
- technical / academic jargon
- news/media register (заявление, конфликт in news sense)
- pure abstract philosophical (сущность, трактовка)
- crude slang
If gate fails, set gateReason to a SHORT label like "bureaucratic", "archaic", "adult-professional", "abstract", "violent", "technical", "literary", "slang". Set all dimension scores to 0.

If gate passes (gatePass=true, gateReason=null), score these dimensions:

D1 spoken-conversation utility (0-3): 3=said constantly aloud (хочу, мама), 2=regular speech, 1=mostly written, 0=never said
D2 child-world relevance (0-3): 3=central to a 6yo's daily life (зуб, котик, садик), 2=child encounters monthly, 1=rare for child, 0=adult-only
D3 concreteness/imageability (0-3): 3=picture-able (банан, бегать, красный), 2=mostly concrete (друг, утро), 1=semi-abstract, 0=pure abstract
D4 generative leverage (0-3): 3=required to form sentences (я, ты, не, и, в, что, хочу, можно), 2=high-leverage connector/modal, 1=useful, 0=pure content noun
D5 age-appropriateness (0-3): 3=natural in child mouth, 2=neutral, 1=awkwardly formal for child, 0=should be hard-gated
D6 cultural/home register (0-2): 2=strongly child-cultural (бабушка, ёлка, садик, блин), 1=present in family life, 0=not really
D7 English-cognate leverage (0-2): 2=near-identical (банан, такси, телефон, шоколад), 1=recognizable with hint (доктор), 0=no leverage
D8 phonetic accessibility for a 6yo (0-2): 2=short/easy, 1=average, 0=hard clusters (встреча, всмятку)

TIER (one of "T1","T2","T3","T4","Reject"):
- T1 = ~100 survival words: pronouns, yes/no, please/thanks, hello/bye, mama/papa, basic needs (есть, пить, спать), no/can/want
- T2 = ~400 daily life: family, body, food, home, basic verbs, colors, numbers 1-20, common adjectives, weather, animals, toys
- T3 = ~500 conversation: time/space prepositions, school, transport, clothing, more verbs, feelings, common questions
- T4 = ~1000 fluency: connectors, modals beyond basics, useful but not urgent abstract words
- Reject = failed gate

TIER RULES:
- D1>=3 AND D4>=2 → at least T2 (function-word survival; T1 only for the absolute core ~100)
- D1>=2 AND D2>=3 AND D3>=2 → T2
- D6>=2 AND D5>=2 → bump up one tier
- D7=2 AND D2>=1 → bump up one tier
- Default uncertain "useful but not urgent" → T4 (do NOT reject; only hard-gate violations reject)

RATIONALE: one short sentence (max 15 words) explaining the tier choice.

EXAMPLES:
- "мама" → gatePass=true, d1=3,d2=3,d3=3,d4=1,d5=3,d6=2,d7=0,d8=2, tier="T1", rationale="core child word, said daily, central to home life"
- "хочу" → gatePass=true, d1=3,d2=3,d3=0,d4=3,d5=3,d6=0,d7=0,d8=2, tier="T1", rationale="essential modal verb for expressing needs"
- "банан" → gatePass=true, d1=2,d2=3,d3=3,d4=0,d5=3,d6=1,d7=2,d8=2, tier="T2", rationale="concrete child food, free English cognate"
- "налогообложение" → gatePass=false, gateReason="bureaucratic", tier="Reject", rationale="adult tax terminology, no child use"
- "вельможа" → gatePass=false, gateReason="archaic", tier="Reject", rationale="archaic literary word, not in modern speech"
- "сущность" → gatePass=false, gateReason="abstract", tier="Reject", rationale="abstract philosophical concept, beyond child level"
- "автомобиль" → gatePass=true, d1=2,d2=2,d3=3,d4=0,d5=2,d6=0,d7=1,d8=1, tier="T3", rationale="concrete vehicle, but машина is the kid-natural form"
- "проблема" → gatePass=true, d1=2,d2=1,d3=1,d4=1,d5=2,d6=0,d7=2,d8=1, tier="T4", rationale="abstract but useful, English cognate, not urgent for kid"

Return STRICT JSON: an array with EXACTLY one object per input word, in the SAME order. Do not skip any word.`;

const itemSchema = {
  type: "object",
  properties: {
    word: { type: "string" },
    gatePass: { type: "boolean" },
    gateReason: { type: ["string", "null"] },
    d1: { type: "integer" },
    d2: { type: "integer" },
    d3: { type: "integer" },
    d4: { type: "integer" },
    d5: { type: "integer" },
    d6: { type: "integer" },
    d7: { type: "integer" },
    d8: { type: "integer" },
    tier: { type: "string", enum: ["T1", "T2", "T3", "T4", "Reject"] },
    rationale: { type: "string" },
  },
  required: ["word", "gatePass", "gateReason", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "tier", "rationale"],
  additionalProperties: false,
};

const responseSchema = {
  type: "object",
  properties: {
    items: { type: "array", items: itemSchema },
  },
  required: ["items"],
  additionalProperties: false,
};

interface ScoredItem {
  word: string;
  gatePass: boolean;
  gateReason?: string | null;
  d1: number;
  d2: number;
  d3: number;
  d4: number;
  d5: number;
  d6: number;
  d7: number;
  d8: number;
  tier: "T1" | "T2" | "T3" | "T4" | "Reject";
  rationale: string;
}

async function scoreBatch(words: FrequencyDictionary[]): Promise<FrequencyWordScoreUpdate[]> {
  const wordList = words.map((w) => w.word).join("\n");
  const userMessage = `Words to score (${words.length} total):\n${wordList}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    system: [
      { type: "text", text: RUBRIC, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userMessage }],
    output_config: {
      format: { type: "json_schema", schema: responseSchema as any },
    },
  } as any);

  const textBlock = response.content.find((b) => b.type === "text") as { type: "text"; text: string } | undefined;
  if (!textBlock) throw new Error("No text content from Claude");

  let parsed: { items: ScoredItem[] };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch (e) {
    throw new Error(`Bad JSON: ${textBlock.text.slice(0, 200)}`);
  }
  const scored = parsed.items;

  const byWord = new Map<string, ScoredItem>();
  for (const s of scored) byWord.set(s.word.toLowerCase().trim(), s);

  const updates: FrequencyWordScoreUpdate[] = [];
  for (const w of words) {
    const s = byWord.get(w.word.toLowerCase().trim());
    if (!s) continue;
    updates.push({
      id: w.id,
      gatePass: s.gatePass,
      gateReason: s.gateReason ?? null,
      d1Spoken: s.d1,
      d2ChildWorld: s.d2,
      d3Concrete: s.d3,
      d4Generative: s.d4,
      d5AgeOk: s.d5,
      d6Cultural: s.d6,
      d7Cognate: s.d7,
      d8Phonetic: s.d8,
      tier: s.tier,
      rationale: s.rationale,
    });
  }
  return updates;
}

async function runWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  console.log(`Scoring ${language} (concurrency=${CONCURRENCY}, batch=${BATCH_SIZE}, limit=${LIMIT === Infinity ? "all" : LIMIT})`);

  const tierCounts: Record<string, number> = { T1: 0, T2: 0, T3: 0, T4: 0, Reject: 0 };
  let totalProcessed = 0;
  const startedAt = Date.now();

  while (totalProcessed < LIMIT) {
    const remaining = LIMIT - totalProcessed;
    const fetchSize = Math.min(BATCH_SIZE * CONCURRENCY, remaining);
    const pool = await storage.getUntieredFrequencyWords(language, fetchSize);
    if (pool.length === 0) {
      console.log("No more untiered words.");
      break;
    }

    const batches: FrequencyDictionary[][] = [];
    for (let i = 0; i < pool.length; i += BATCH_SIZE) {
      batches.push(pool.slice(i, i + BATCH_SIZE));
    }

    const t0 = Date.now();
    const allUpdates: FrequencyWordScoreUpdate[][] = await runWithConcurrency(
      batches,
      CONCURRENCY,
      async (batch) => {
        try {
          return await scoreBatch(batch);
        } catch (e: any) {
          console.error(`Batch failed (${batch.length} words): ${e.message}`);
          return [];
        }
      }
    );

    const flat = allUpdates.flat();
    if (flat.length > 0) {
      await storage.updateFrequencyWordsScoresBatch(flat);
    }

    for (const u of flat) tierCounts[u.tier] = (tierCounts[u.tier] || 0) + 1;
    totalProcessed += flat.length;

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const tierStr = `T1:${tierCounts.T1} T2:${tierCounts.T2} T3:${tierCounts.T3} T4:${tierCounts.T4} R:${tierCounts.Reject}`;
    console.log(`Processed ${totalProcessed} (${tierStr}) — last cycle ${flat.length} words in ${elapsed}s`);

    if (flat.length === 0) {
      console.error(`Aborting: cycle made no progress (${pool.length} words fetched, 0 scored). Likely API failure.`);
      process.exit(1);
    }
    if (pool.length < fetchSize) break;
  }

  const totalElapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nDone. ${totalProcessed} words in ${totalElapsed}s.`);
  console.log(`Tier distribution: T1=${tierCounts.T1} T2=${tierCounts.T2} T3=${tierCounts.T3} T4=${tierCounts.T4} Reject=${tierCounts.Reject}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
