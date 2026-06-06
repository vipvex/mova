import { db } from "../server/db";
import { frequencyDictionary } from "../shared/schema";
import { and, eq } from "drizzle-orm";

const REVERTS = [
  {
    word: "душа",
    tier: "T2" as const,
    rationale: "Core word: soul/heart; central to emotional vocabulary and idioms (от души, душа в душу).",
  },
];

(async () => {
  for (const r of REVERTS) {
    const before = await db
      .select({ tier: frequencyDictionary.tier })
      .from(frequencyDictionary)
      .where(and(eq(frequencyDictionary.language, "russian"), eq(frequencyDictionary.word, r.word)));

    if (before.length === 0) {
      console.log(`  ⚠ "${r.word}" not in dict`);
      continue;
    }

    const result = await db
      .update(frequencyDictionary)
      .set({
        tier: r.tier,
        gatePass: true,
        gateReason: null,
        rationale: r.rationale,
      })
      .where(and(eq(frequencyDictionary.language, "russian"), eq(frequencyDictionary.word, r.word)));

    console.log(`Reverted "${r.word}" ${before[0].tier} → ${r.tier} (${result.rowCount} row)`);
  }

  process.exit(0);
})();
