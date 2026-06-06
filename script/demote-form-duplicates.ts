import { db } from "../server/db";
import { frequencyDictionary } from "../shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { readFileSync } from "fs";

// Exception list — these match the prefix-pattern but are NOT actual perfective duplicates
// (the base form is something completely different lexically)
const PERFECTIVE_EXCEPTIONS = new Set([
  "опять",  // о+пять where пять = "five" (numeral), not a verb
]);

// Manually curated deverbal nouns the user explicitly wants demoted
const DEVERBAL_NOUNS_TO_DEMOTE = [
  "бег",     // → бегать
  "звон",    // → звонить
  "мах",     // → махать
  "плач",    // → плакать
  "хохот",   // → хохотать
  "свист",   // → свистеть
  "спор",    // → спорить
  "бой",     // → биться
  "лай",     // → лаять
  "вопль",   // → вопить
  "стук",    // → стучать (note: stuk could be useful — borderline)
  "топот",   // → топать
];

(async () => {
  const candidates: { dup: string; base: string; pattern: string; dupTier: string | null; baseTier: string | null }[] =
    JSON.parse(readFileSync("/tmp/form_duplicates.json", "utf-8"));

  // 1. Apply perfective demotions: all 272 minus exceptions
  const perfectives = candidates
    .filter((c) => c.pattern.startsWith("verb-prefix"))
    .filter((c) => !PERFECTIVE_EXCEPTIONS.has(c.dup));

  console.log(`Perfective duplicates to demote: ${perfectives.length}`);
  console.log("Sample:", perfectives.slice(0, 10).map((c) => `${c.dup}(${c.dupTier})→${c.base}(${c.baseTier})`).join(", "));

  for (const p of perfectives) {
    await db
      .update(frequencyDictionary)
      .set({
        tier: "T4",
        rationale: sql`'Perfective form of ' || ${p.base} || '; learn the imperfective base first.'`,
      })
      .where(and(eq(frequencyDictionary.language, "russian"), eq(frequencyDictionary.word, p.dup)));
  }
  console.log(`Demoted ${perfectives.length} perfective duplicates → T4`);

  // 2. Apply deverbal-noun demotions: only manually curated list
  let deverbalCount = 0;
  for (const word of DEVERBAL_NOUNS_TO_DEMOTE) {
    const r = await db
      .update(frequencyDictionary)
      .set({
        tier: "T4",
        rationale: sql`'Deverbal noun; verb form is more useful for child conversation.'`,
      })
      .where(
        and(
          eq(frequencyDictionary.language, "russian"),
          eq(frequencyDictionary.word, word),
          inArray(frequencyDictionary.tier, ["T1", "T2", "T3"]),
        ),
      );
    if (r.rowCount && r.rowCount > 0) {
      console.log(`  demoted: ${word}`);
      deverbalCount += r.rowCount;
    }
  }
  console.log(`Demoted ${deverbalCount} deverbal nouns → T4`);

  // 3. Final tier counts
  const finalCounts = await db
    .select({ tier: frequencyDictionary.tier, count: sql<number>`COUNT(*)::int` })
    .from(frequencyDictionary)
    .where(eq(frequencyDictionary.language, "russian"))
    .groupBy(frequencyDictionary.tier);
  console.log("\nFinal tier counts:");
  console.table(finalCounts);

  process.exit(0);
})();
