// Populate the Spanish `vocabulary` deck from SPANISH_CURRICULUM so every
// curriculum word resolves to a learnable vocab row (inVocab=true) and the
// Learn/Review sessions serve them in pedagogical (curriculum) order.
//
// Idempotent: re-running re-aligns displayOrder/frequencyRank/category to the
// current curriculum and inserts any newly-added words. Existing rows keep
// their english gloss, image, and audio (we never clobber good media).
//
// Run: npx tsx --env-file=.env script/build-spanish-vocab.ts [--dry]

import { db } from "../server/db";
import { vocabulary } from "../shared/schema";
import { SPANISH_CURRICULUM } from "../shared/curriculum";
import { and, eq } from "drizzle-orm";

const DRY = process.argv.includes("--dry");

// Part-of-speech heuristic from the phase the word lives in. The frequency-dict
// scoring pass (Tasks 3–4) can refine this later; here it just gives the deck
// sensible POS tags without a dictionary.
function posFor(phase: number, subthemeName: string): string {
  if (phase === 8) return "verb";
  if (phase === 7) return "adjective";
  if (phase === 0 || phase === 9) return "function";
  if (phase === 6 && /sound verbs/i.test(subthemeName)) return "verb";
  return "noun";
}

type Planned = {
  word: string;
  english: string;
  category: string; // phase name
  partOfSpeech: string;
  order: number; // 0-based curriculum sequence
};

function planFromCurriculum(): Planned[] {
  const seen = new Set<string>();
  const planned: Planned[] = [];
  let order = 0;
  for (const phase of SPANISH_CURRICULUM) {
    for (const sub of phase.subthemes) {
      for (const entry of sub.words) {
        const key = entry.word.toLowerCase().trim();
        if (seen.has(key)) continue; // keep earliest occurrence
        seen.add(key);
        planned.push({
          word: entry.word,
          english: entry.english,
          category: phase.name,
          partOfSpeech: posFor(phase.phase, sub.name),
          order: order++,
        });
      }
    }
  }
  return planned;
}

async function main() {
  const planned = planFromCurriculum();
  console.log(`Curriculum has ${planned.length} unique Spanish words.${DRY ? " (DRY RUN)" : ""}`);

  const existing = await db
    .select()
    .from(vocabulary)
    .where(eq(vocabulary.language, "spanish"));
  const byWord = new Map<string, (typeof existing)[number]>();
  for (const v of existing) byWord.set(v.targetWord.toLowerCase().trim(), v);
  console.log(`Existing Spanish vocab rows: ${existing.length}`);

  let inserted = 0;
  let updated = 0;
  const plannedKeys = new Set(planned.map((p) => p.word.toLowerCase().trim()));

  for (const p of planned) {
    const key = p.word.toLowerCase().trim();
    const existingRow = byWord.get(key);
    if (existingRow) {
      // Re-align ordering/metadata to the curriculum; preserve english + media.
      if (!DRY) {
        await db
          .update(vocabulary)
          .set({
            displayOrder: p.order,
            frequencyRank: p.order + 1,
            category: p.category,
            partOfSpeech: p.partOfSpeech,
          })
          .where(eq(vocabulary.id, existingRow.id));
      }
      updated++;
    } else {
      if (!DRY) {
        await db.insert(vocabulary).values({
          targetWord: p.word,
          english: p.english,
          language: "spanish",
          frequencyRank: p.order + 1,
          displayOrder: p.order,
          category: p.category,
          partOfSpeech: p.partOfSpeech,
        });
      }
      inserted++;
    }
  }

  // Existing Spanish words that aren't in the curriculum: keep them, but push
  // them after the curriculum block so the deck leads with the pedagogical order.
  const leftovers = existing.filter((v) => !plannedKeys.has(v.targetWord.toLowerCase().trim()));
  let bumped = 0;
  const base = planned.length;
  for (let i = 0; i < leftovers.length; i++) {
    const v = leftovers[i];
    const newOrder = base + i;
    if (v.displayOrder !== newOrder) {
      if (!DRY) {
        await db
          .update(vocabulary)
          .set({ displayOrder: newOrder })
          .where(eq(vocabulary.id, v.id));
      }
      bumped++;
    }
  }

  console.log(
    `Done.${DRY ? " (DRY)" : ""} inserted=${inserted} updated=${updated} leftovers=${leftovers.length} (reordered=${bumped})`,
  );
  console.log(`Spanish deck size after run: ${existing.length + inserted}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
