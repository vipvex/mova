import Anthropic from "@anthropic-ai/sdk";
import { db } from "../server/db";
import { frequencyDictionary } from "../shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const THEMES = [
  "Family & people",
  "Body",
  "Food & drink",
  "Animals",
  "Colors & shapes",
  "Numbers",
  "Time",
  "Weather & nature",
  "Transport",
  "Clothing",
  "Home & furniture",
  "School & learning",
  "Toys & play",
  "Feelings & emotions",
  "Common verbs",
  "Function words & grammar",
  "Descriptions (size, quality)",
  "Social & greetings",
  "Tech & modern life",
  "Other",
] as const;

const RUBRIC = `For each Russian word below, assign EXACTLY ONE theme from the list. Pick the most natural fit for a 6-year-old learning the language.

THEMES:
${THEMES.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Guidance:
- "Function words & grammar" = pronouns, conjunctions, particles, prepositions, articles, modal/auxiliary verbs (быть, мочь, надо, можно)
- "Common verbs" = action verbs not fitting another theme (сказать, играть, бегать, делать)
- "Descriptions (size, quality)" = adjectives like маленький, большой, хороший, новый
- "Family & people" = relatives + roles (мама, бабушка, друг, ребёнок, человек)
- "Body" = body parts AND bodily actions (зуб, кашлять, спать)
- "Time" = day/night, days of week, time-of-day, seasons, time concepts (утро, год, минута, сейчас)
- "Weather & nature" = weather + natural phenomena + landscape (солнце, дождь, лес, гора)
- "Tech & modern life" = телефон, интернет, машина, компьютер
- "Social & greetings" = здравствуйте, спасибо, пожалуйста, пока, привет
- If a word genuinely fits 2 themes, pick the more child-relevant one.
- Use "Other" only if NOTHING fits.

Return strict JSON: { items: [{word, theme}] } in same order, exactly the same number of items as input.`;

const schema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          word: { type: "string" },
          theme: { type: "string", enum: [...THEMES] },
        },
        required: ["word", "theme"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

async function classifyBatch(words: { id: string; word: string }[]) {
  const userMessage = `Words to classify (${words.length}):\n${words.map((w) => w.word).join("\n")}`;
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 8192,
    system: RUBRIC,
    messages: [{ role: "user", content: userMessage }],
    output_config: { format: { type: "json_schema", schema: schema as any } },
  } as any);
  const textBlock = response.content.find((b) => b.type === "text") as { text: string };
  return JSON.parse(textBlock.text) as { items: { word: string; theme: string }[] };
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
  const BATCH_SIZE = 30;
  const CONCURRENCY = 5;

  const all = await db
    .select({ id: frequencyDictionary.id, word: frequencyDictionary.word })
    .from(frequencyDictionary)
    .where(and(eq(frequencyDictionary.language, "russian"), inArray(frequencyDictionary.tier, ["T1", "T2", "T3", "T4"])));

  console.log(`Classifying ${all.length} T1-T4 words...`);

  const batches: { id: string; word: string }[][] = [];
  for (let i = 0; i < all.length; i += BATCH_SIZE) batches.push(all.slice(i, i + BATCH_SIZE));

  let processed = 0;
  const themeCounts: Record<string, number> = {};
  const t0 = Date.now();

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

    // Apply updates
    for (let bi = 0; bi < slice.length; bi++) {
      const batch = slice[bi];
      const result = results[bi];
      const byWord = new Map(result.items.map((i) => [i.word.toLowerCase().trim(), i.theme]));
      for (const w of batch) {
        const theme = byWord.get(w.word.toLowerCase().trim());
        if (!theme) continue;
        await db.update(frequencyDictionary).set({ category: theme }).where(eq(frequencyDictionary.id, w.id));
        themeCounts[theme] = (themeCounts[theme] || 0) + 1;
        processed++;
      }
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`Processed ${processed}/${all.length} (${elapsed}s)`);
  }

  console.log("\nTheme distribution:");
  console.table(Object.entries(themeCounts).sort((a, b) => b[1] - a[1]).map(([theme, count]) => ({ theme, count })));
  process.exit(0);
})();
