import { db } from "../server/db";
import { frequencyDictionary } from "../shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

(async () => {
  const wanted = [
    "Function words & grammar",
    "Family & people",
    "Numbers",
    "Social & greetings",
    "Common verbs",
    "Time",
    "Home & furniture",
    "Body",
    "Food & drink",
    "Clothing",
    "Animals",
    "Descriptions (size, quality)",
    "Colors & shapes",
    "Weather & nature",
    "Toys & play",
    "Transport",
    "Feelings & emotions",
    "School & learning",
    "Tech & modern life",
    "Other",
  ];

  for (const cat of wanted) {
    const rows = await db
      .select({
        word: frequencyDictionary.word,
        english: frequencyDictionary.english,
        tier: frequencyDictionary.tier,
        rank: frequencyDictionary.frequencyRank,
        partOfSpeech: frequencyDictionary.partOfSpeech,
      })
      .from(frequencyDictionary)
      .where(
        and(
          eq(frequencyDictionary.language, "russian"),
          eq(frequencyDictionary.category, cat),
          inArray(frequencyDictionary.tier, ["T1", "T2"]),
        ),
      )
      .orderBy(frequencyDictionary.frequencyRank);

    console.log(`\n=== ${cat} (${rows.length}) ===`);
    for (const r of rows) {
      console.log(`  ${r.word.padEnd(20)} | ${r.tier} | #${String(r.rank).padStart(5)} | ${(r.english ?? "").padEnd(30)} | ${r.partOfSpeech ?? ""}`);
    }
  }

  process.exit(0);
})();
