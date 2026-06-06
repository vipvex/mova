import { db } from "../server/db";
import { frequencyDictionary } from "../shared/schema";
import { and, eq, sql } from "drizzle-orm";
import { readFileSync } from "fs";

type Pair = { word: string; tier: string | null; rank: number; base: string; baseTier: string | null; baseRank: number };

// Pairs where BOTH forms have distinct senses important for kids — keep both untouched
const KEEP_BOTH = new Set([
  "учиться", "учить",                // study vs teach
  "собираться", "собирать",          // intend / gather oneself  vs  collect things
  "возиться", "возить",              // fuss with  vs  transport
  "встречаться", "встречать",        // date / meet up  vs  meet someone
]);

// Ordinal numbers that look like participles (-ый with a digit base) — NOT participles, keep
const ORDINALS = new Set([
  "четвертый", "пятый", "шестой", "седьмой", "восьмой", "девятый", "десятый",
  "одиннадцатый", "двенадцатый", "тринадцатый", "четырнадцатый", "пятнадцатый",
  "двадцатый", "тридцатый", "сороковой", "сотый", "тысячный",
]);

(async () => {
  const data: { reflexives: Pair[]; punctual: Pair[]; participles: Pair[] } = JSON.parse(
    readFileSync("/tmp/form_dups_v2.json", "utf-8"),
  );

  const demotions: { word: string; rationale: string; pattern: string }[] = [];

  // === Reflexives: demote the higher-rank (less frequent) one ===
  let reflexivesProcessed = 0;
  for (const p of data.reflexives) {
    if (KEEP_BOTH.has(p.word) || KEEP_BOTH.has(p.base)) continue;
    // Demote whichever has higher rank
    if (p.rank > p.baseRank) {
      demotions.push({
        word: p.word,
        pattern: "reflexive-of-base",
        rationale: `Reflexive form of ${p.base}; learn the active base verb first.`,
      });
    } else {
      demotions.push({
        word: p.base,
        pattern: "transitive-base-of-reflexive",
        rationale: `Transitive base of ${p.word}; the reflexive form is more common in everyday speech.`,
      });
    }
    reflexivesProcessed++;
  }

  // === -нуть: always demote the punctual ===
  for (const p of data.punctual) {
    demotions.push({
      word: p.word,
      pattern: "punctual-perfective",
      rationale: `Single-action perfective of ${p.base}; learn the imperfective first.`,
    });
  }

  // === Participles: skip ordinals, demote the rest ===
  let participlesSkipped = 0;
  for (const p of data.participles) {
    if (ORDINALS.has(p.word)) {
      participlesSkipped++;
      continue;
    }
    demotions.push({
      word: p.word,
      pattern: "past-participle",
      rationale: `Past-participle adjective of ${p.verb || "base verb"}; learn the verb form first.`,
    });
  }

  console.log(`Reflexive pairs processed: ${reflexivesProcessed} (skipped ${data.reflexives.length - reflexivesProcessed} from KEEP_BOTH)`);
  console.log(`-нуть punctuals queued: ${data.punctual.length}`);
  console.log(`Participles queued: ${data.participles.length - participlesSkipped} (skipped ${participlesSkipped} ordinals)`);
  console.log(`Total demotions: ${demotions.length}\n`);

  // Dedupe (in case base appeared in multiple pairs)
  const seen = new Set<string>();
  const unique = demotions.filter((d) => {
    if (seen.has(d.word)) return false;
    seen.add(d.word);
    return true;
  });
  console.log(`After dedup: ${unique.length} unique words to demote`);

  // Apply
  let applied = 0;
  for (const d of unique) {
    const r = await db
      .update(frequencyDictionary)
      .set({ tier: "T4", rationale: d.rationale })
      .where(and(eq(frequencyDictionary.language, "russian"), eq(frequencyDictionary.word, d.word)));
    if (r.rowCount && r.rowCount > 0) applied++;
  }
  console.log(`Demoted ${applied} entries → T4`);

  // Print final counts
  const finalCounts = await db
    .select({ tier: frequencyDictionary.tier, count: sql<number>`COUNT(*)::int` })
    .from(frequencyDictionary)
    .where(eq(frequencyDictionary.language, "russian"))
    .groupBy(frequencyDictionary.tier);
  console.log("\nFinal tier counts:");
  console.table(finalCounts);

  process.exit(0);
})();
