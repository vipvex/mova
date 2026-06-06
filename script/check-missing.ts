import { db } from "../server/db";
import { frequencyDictionary } from "../shared/schema";
import { and, eq, inArray } from "drizzle-orm";

const check = [
  "мяукать", "гавкать", "лаять", "хрюкать", "кукарекать", "рычать", "мычать", "чирикать", "квакать", "кудахтать",
  "здравствуйте", "извините", "пожалуйста", "привет", "пока", "спасибо",
  "смартфон", "селфи", "вайфай", "онлайн", "чат", "видео",
  "мяу", "гав", "бах", "бум", "ой", "ай", "ав-ав", "до свидания", "доброе утро",
];

(async () => {
  const found = await db
    .select({ word: frequencyDictionary.word, tier: frequencyDictionary.tier })
    .from(frequencyDictionary)
    .where(and(eq(frequencyDictionary.language, "russian"), inArray(frequencyDictionary.word, check)));

  console.log("Already in dict:");
  for (const r of found) console.log(`  ${r.word} (${r.tier})`);
  console.log("\nMissing:");
  for (const w of check) if (!found.find((f) => f.word === w)) console.log(`  ${w}`);
  process.exit(0);
})();
