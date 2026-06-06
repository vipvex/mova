import { db } from "../server/db";
import { frequencyDictionary } from "../shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

// Names I missed in the keep-rejected list — demote these from T3 → Reject
const MORE_NAMES_TO_REJECT = [
  "илья","вася","гоголь","волков","пастернак","денис","соня","воробьев","ира","люба","тимур",
  "грозный","африка","орел","грозный",
];

// Words I incorrectly kept rejected — these are common nouns that happen to share form with names.
// Promote back to a sensible tier. "надежда"=hope and "любовь"=love are emotion words; "света"=light(genitive).
// "лена" appears mostly as river/diminutive; keep rejected (river is also proper). Same for "тома" if present.
const HOMONYMS_TO_REVERT = [
  { word: "надежда", tier: "T2" as const, rationale: "Common emotion noun (hope); also a female name but the abstract-noun meaning dominates." },
  { word: "любовь",  tier: "T2" as const, rationale: "Core emotion noun (love); essential child vocabulary." },
  { word: "света",   tier: "T3" as const, rationale: "Genitive form of свет (light); base form свет is more important." },
  { word: "марина",  tier: "T4" as const, rationale: "Marina (boat dock); also female name. Concrete but specific." },
  { word: "том",     tier: "T4" as const, rationale: "Volume/tome (book); concrete noun, low daily child use." },
];

(async () => {
  // 1. Demote the missed names
  const r1 = await db
    .update(frequencyDictionary)
    .set({
      tier: "Reject",
      gatePass: false,
      gateReason: "proper-noun",
    })
    .where(
      and(
        eq(frequencyDictionary.language, "russian"),
        inArray(frequencyDictionary.word, MORE_NAMES_TO_REJECT),
      ),
    );
  console.log(`Demoted ${r1.rowCount} additional names → Reject.`);

  // 2. Revert the homonyms
  for (const h of HOMONYMS_TO_REVERT) {
    const r = await db
      .update(frequencyDictionary)
      .set({ tier: h.tier, gatePass: true, gateReason: null, rationale: h.rationale })
      .where(and(eq(frequencyDictionary.language, "russian"), eq(frequencyDictionary.word, h.word)));
    console.log(`Reverted "${h.word}" → ${h.tier} (${r.rowCount} row).`);
  }

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
