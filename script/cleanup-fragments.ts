import { db } from "../server/db";
import { frequencyDictionary } from "../shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

// Pure fragments / non-words / hyphenated leftovers — Reject as "fragment"
const FRAGMENTS = [
  "дк", "ил", "як", "ас", "эл", "ся", "ё", "ма", "обо",
];

// Inflected forms of base lemmas already in dict — Reject as "case-form"
const CASE_FORMS = [
  "трёх",   // gen/prep of три
  "даёт",   // 3sg of давать
  "своё",   // n-sg of свой
  "моё",    // n-sg of мой
  "чём",    // prep of что
  "нём",    // prep of он/оно
  "неё",    // gen/acc of она
];

// Name diminutives that slipped through earlier name-strip
const NAME_DIMS = [
  "пашка", "васька", "винни",
];

// Misc: neuter adjective form already redundant with masculine base
const REDUNDANT = [
  "новое",  // neuter of новый
];

(async () => {
  let total = 0;

  const update = async (words: string[], reason: string) => {
    if (words.length === 0) return 0;
    const r = await db
      .update(frequencyDictionary)
      .set({ tier: "Reject", gatePass: false, gateReason: reason })
      .where(
        and(
          eq(frequencyDictionary.language, "russian"),
          inArray(frequencyDictionary.word, words),
        ),
      );
    return r.rowCount ?? 0;
  };

  const f = await update(FRAGMENTS, "fragment");
  console.log(`Rejected ${f} fragment entries`);
  total += f;

  const c = await update(CASE_FORMS, "case-form");
  console.log(`Rejected ${c} case-form entries`);
  total += c;

  const n = await update(NAME_DIMS, "proper-noun");
  console.log(`Rejected ${n} name-diminutive entries`);
  total += n;

  const r = await update(REDUNDANT, "redundant-form");
  console.log(`Rejected ${r} redundant-form entries`);
  total += r;

  console.log(`\nTotal rejected: ${total}`);

  // Verify
  const allTargets = [...FRAGMENTS, ...CASE_FORMS, ...NAME_DIMS, ...REDUNDANT];
  const check = await db
    .select({ word: frequencyDictionary.word, tier: frequencyDictionary.tier })
    .from(frequencyDictionary)
    .where(
      and(
        eq(frequencyDictionary.language, "russian"),
        inArray(frequencyDictionary.word, allTargets),
      ),
    );
  const notRejected = check.filter((c) => c.tier !== "Reject");
  if (notRejected.length > 0) {
    console.log(`\n⚠ Not rejected (probably not in dict):`, notRejected.map((c) => c.word));
  }
  const missing = allTargets.filter((w) => !check.find((c) => c.word === w));
  if (missing.length > 0) {
    console.log(`Not in dict at all: ${missing.join(", ")}`);
  }

  process.exit(0);
})();
