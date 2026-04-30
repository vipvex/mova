import "dotenv/config";
import { db } from "../server/db";
import { vocabulary, storyPages, wordExampleSentences } from "../shared/schema";
import { sql } from "drizzle-orm";

async function main() {
  const v = await db
    .update(vocabulary)
    .set({ audioUrl: null })
    .where(sql`${vocabulary.audioUrl} LIKE 'data:%'`)
    .returning({ id: vocabulary.id });
  console.log(`Cleared base64 audioUrl on ${v.length} vocabulary rows.`);

  const p = await db
    .update(storyPages)
    .set({ audioUrl: null })
    .where(sql`${storyPages.audioUrl} LIKE 'data:%'`)
    .returning({ id: storyPages.id });
  console.log(`Cleared base64 audioUrl on ${p.length} story_page rows.`);

  const e = await db
    .update(wordExampleSentences)
    .set({ audioUrl: null })
    .where(sql`${wordExampleSentences.audioUrl} LIKE 'data:%'`)
    .returning({ id: wordExampleSentences.id });
  console.log(`Cleared base64 audioUrl on ${e.length} word_example_sentence rows.`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
