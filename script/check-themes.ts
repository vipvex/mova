import { db } from "../server/db";
import { frequencyDictionary } from "../shared/schema";
import { and, eq, sql } from "drizzle-orm";

(async () => {
  const themes = await db
    .select({ category: frequencyDictionary.category, count: sql<number>`COUNT(*)::int` })
    .from(frequencyDictionary)
    .where(and(eq(frequencyDictionary.language, "russian")))
    .groupBy(frequencyDictionary.category);
  for (const t of themes) console.log(`  "${t.category}" — ${t.count}`);

  const maxRank = await db.execute(sql`SELECT MAX(frequency_rank) as m FROM frequency_dictionary WHERE language='russian'`);
  console.log("\nMax frequency_rank:", (maxRank as any).rows[0]);
  process.exit(0);
})();
