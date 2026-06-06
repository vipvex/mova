import Anthropic from "@anthropic-ai/sdk";
import { db } from "../server/db";
import { frequencyDictionary } from "../shared/schema";
import { and, eq, sql } from "drizzle-orm";
import { readFileSync } from "fs";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const inputFile = process.argv[2] || "/tmp/dim_candidates.json";
const candidates: { word: string; tier: string; frequency_rank: number }[] = JSON.parse(
  readFileSync(inputFile, "utf-8"),
);

const PROMPT = `For each Russian word below, decide:
1. is_diminutive: is this a TRUE productive diminutive (e.g. шапочка from шапка), as opposed to a lexicalized standalone word (e.g. бабушка, мальчик, девочка, бабочка, лягушка, точка, игрушка)? Lexicalized words have evolved into their own meaning and are NOT diminutives anymore.
2. base_form: if it IS a diminutive, give the base lemma (e.g. шапочка → "шапка", пальчик → "палец"). null if not a diminutive OR if the base is semantically different (e.g. лампочка=lightbulb vs лампа=lamp are different objects — return null).

Be strict: only mark is_diminutive=true if a 6-year-old learning Russian could safely substitute the base form and the base form would be the more "standard" version to learn first.

Return strict JSON: { items: [{word, is_diminutive, base_form}] }, in same order, exactly ${candidates.length} items.

Words:
${candidates.map((c, i) => `${i + 1}. ${c.word}`).join("\n")}`;

const schema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          word: { type: "string" },
          is_diminutive: { type: "boolean" },
          base_form: { type: ["string", "null"] },
        },
        required: ["word", "is_diminutive", "base_form"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

(async () => {
  console.log(`Asking Claude to classify ${candidates.length} candidates...`);
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 8192,
    messages: [{ role: "user", content: PROMPT }],
    output_config: { format: { type: "json_schema", schema: schema as any } },
  } as any);

  const textBlock = response.content.find((b) => b.type === "text") as { text: string };
  const parsed = JSON.parse(textBlock.text) as {
    items: { word: string; is_diminutive: boolean; base_form: string | null }[];
  };

  const trueDiminutives = parsed.items.filter((x) => x.is_diminutive && x.base_form);
  console.log(`\nFlagged as true diminutives: ${trueDiminutives.length}/${parsed.items.length}`);

  // For each diminutive, check if base_form exists in dictionary with a higher tier (T1/T2/T3)
  const toDemote: { word: string; current_tier: string; base_form: string; base_tier: string }[] = [];
  const noBase: { word: string; base_form: string }[] = [];

  for (const d of trueDiminutives) {
    const baseRow = await db
      .select()
      .from(frequencyDictionary)
      .where(and(eq(frequencyDictionary.language, "russian"), eq(frequencyDictionary.word, d.base_form!)))
      .limit(1);

    const dimRow = candidates.find((c) => c.word === d.word)!;

    if (baseRow.length === 0) {
      noBase.push({ word: d.word, base_form: d.base_form! });
    } else {
      const baseTier = baseRow[0].tier ?? "(unscored)";
      toDemote.push({
        word: d.word,
        current_tier: dimRow.tier,
        base_form: d.base_form!,
        base_tier: baseTier,
      });
    }
  }

  console.log("\n=== TRUE DIMINUTIVES WITH BASE IN DICT (will demote) ===");
  console.table(toDemote);

  if (noBase.length > 0) {
    console.log("\n=== TRUE DIMINUTIVES WHERE BASE NOT IN DICT (no action — keep diminutive) ===");
    console.table(noBase);
  }

  const lexicalized = parsed.items.filter((x) => !x.is_diminutive);
  console.log(`\n=== LEXICALIZED (kept as-is, not real diminutives): ${lexicalized.length} ===`);
  console.log(lexicalized.map((x) => x.word).join(", "));

  // Now demote: move each diminutive to T4 (so it's still in the curriculum but deprioritized)
  console.log("\n=== APPLYING DEMOTIONS ===");
  let demoted = 0;
  for (const d of toDemote) {
    const r = await db
      .update(frequencyDictionary)
      .set({
        tier: "T4",
        rationale: sql`'Diminutive of ' || ${d.base_form} || ' (' || ${d.base_tier} || '); base form should be learned first.'`,
      })
      .where(and(eq(frequencyDictionary.language, "russian"), eq(frequencyDictionary.word, d.word)));
    demoted += r.rowCount ?? 0;
  }
  console.log(`Demoted ${demoted} diminutives → T4`);

  process.exit(0);
})();
