import Anthropic from "@anthropic-ai/sdk";
import { db } from "../server/db";
import { frequencyDictionary } from "../shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT = `For each Russian word below, decide: is it a PROPER NOUN that should be excluded from a vocabulary curriculum?

Treat as proper noun (mark true):
- Person names, given names, nicknames, diminutives of names (Никита, Лёха, Саша, Витя, Аня, Маша)
- Surnames (Иванов, Попов)
- Patronymics (Петрович, Семёнович)
- Place names: cities, countries, regions, rivers (Москва, Россия, Сибирь, Нева)
- Adjectives derived from places (московский, сибирский, российский, парижский)
- Brands, products, awards (Оскар, Голливуд)
- Religious/mythological proper nouns (Аллах, Иисус, Зевс)
- Planets and celestial bodies WHEN they're personal names (Юпитер, Марс as gods) — but if used as common celestial-body terms keep them
- Languages (английский, русский) — these are derived adjectives, mark TRUE

Do NOT treat as proper noun (mark false):
- Common nouns describing concepts (страна, город, район, долина, материк, ледник, полюс, континент)
- Common adjectives (полярный, континентальный)
- Ethnonyms used as common words (араб, русский=Russian person)... actually mark these TRUE since they're tied to specific peoples
- Generic geographic features (пустыня, побережье, пригород)

Return strict JSON: { items: [{word, is_proper_noun}] } in same order, exactly the same number of items as input.`;

const schema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          word: { type: "string" },
          is_proper_noun: { type: "boolean" },
        },
        required: ["word", "is_proper_noun"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

async function classifyBatch(words: { id: string; word: string }[]) {
  const userMessage = `Words (${words.length}):\n${words.map((w) => w.word).join("\n")}`;
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 8192,
    system: PROMPT,
    messages: [{ role: "user", content: userMessage }],
    output_config: { format: { type: "json_schema", schema: schema as any } },
  } as any);
  const textBlock = response.content.find((b) => b.type === "text") as { text: string };
  return JSON.parse(textBlock.text) as { items: { word: string; is_proper_noun: boolean }[] };
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

(async () => {
  const BATCH_SIZE = 50;
  const CONCURRENCY = 5;

  const all = await db
    .select({ id: frequencyDictionary.id, word: frequencyDictionary.word, tier: frequencyDictionary.tier })
    .from(frequencyDictionary)
    .where(and(eq(frequencyDictionary.language, "russian"), inArray(frequencyDictionary.tier, ["T1", "T2", "T3", "T4"])));

  console.log(`Scanning ${all.length} T1-T4 words for proper nouns...`);

  const batches: typeof all[] = [];
  for (let i = 0; i < all.length; i += BATCH_SIZE) batches.push(all.slice(i, i + BATCH_SIZE));

  const flagged: { id: string; word: string; tier: string | null }[] = [];

  for (let cycle = 0; cycle < batches.length; cycle += CONCURRENCY) {
    const slice = batches.slice(cycle, cycle + CONCURRENCY);
    const results = await runWithConcurrency(slice, CONCURRENCY, async (batch) => {
      try {
        return await classifyBatch(batch);
      } catch (e: any) {
        console.error(`Batch failed: ${e.message}`);
        return { items: [] };
      }
    });

    for (let bi = 0; bi < slice.length; bi++) {
      const batch = slice[bi];
      const result = results[bi];
      const byWord = new Map(result.items.map((i) => [i.word.toLowerCase().trim(), i.is_proper_noun]));
      for (const w of batch) {
        if (byWord.get(w.word.toLowerCase().trim()) === true) {
          flagged.push(w);
        }
      }
    }
    console.log(`Processed ${Math.min((cycle + CONCURRENCY) * BATCH_SIZE, all.length)}/${all.length} — flagged so far: ${flagged.length}`);
  }

  console.log(`\nFlagged ${flagged.length} proper nouns to demote.`);
  console.log("Sample:", flagged.slice(0, 30).map((f) => `${f.word}(${f.tier})`).join(", "));

  // Bulk demote to Reject
  if (flagged.length > 0) {
    const ids = flagged.map((f) => f.id);
    const r = await db
      .update(frequencyDictionary)
      .set({
        tier: "Reject",
        gatePass: false,
        gateReason: "proper-noun",
        rationale: sql`COALESCE(${frequencyDictionary.rationale}, '') || ' [demoted: name cleanup pass 2]'`,
      })
      .where(inArray(frequencyDictionary.id, ids));
    console.log(`Demoted ${r.rowCount} rows → Reject.`);
  }

  process.exit(0);
})();
