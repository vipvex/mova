// Rewrites vocabulary.display_order so the homescreen grid follows the
// curriculum order (phase -> subtheme -> word) instead of frequency rank.
//
// Curriculum words come first, in curriculum order. Vocabulary words NOT in the
// curriculum are appended after, sorted by their existing frequency_rank.
// Curriculum words with no vocabulary row are reported as "missing" (no entry
// is created).
//
//   tsx --env-file=.env script/reorder-vocab-by-curriculum.ts russian          (dry run)
//   tsx --env-file=.env script/reorder-vocab-by-curriculum.ts russian --apply  (writes)

import { writeFileSync } from "fs";
import { db } from "../server/db";
import { vocabulary } from "../shared/schema";
import { CURRICULA } from "../shared/curriculum";
import { eq, asc } from "drizzle-orm";

type Lang = "russian" | "spanish";

const language = (process.argv[2] as Lang) || "russian";
const APPLY = process.argv.includes("--apply");

if (language !== "russian" && language !== "spanish") {
  console.error(`Invalid language "${language}" (expected russian|spanish)`);
  process.exit(1);
}

const norm = (s: string) => s.toLowerCase().trim();

async function main() {
  const curriculum = CURRICULA[language] ?? [];

  // Flatten curriculum into an ordered, de-duplicated list of words. First
  // occurrence wins (a word repeated in a later phase keeps its earliest slot).
  const order: { word: string; english: string; phase: number; phaseName: string; subtheme: string }[] = [];
  const seen = new Set<string>();
  for (const p of curriculum) {
    for (const s of p.subthemes) {
      for (const entry of s.words) {
        const key = norm(entry.word);
        if (seen.has(key)) continue;
        seen.add(key);
        order.push({ word: key, english: entry.english, phase: p.phase, phaseName: p.name, subtheme: s.name });
      }
    }
  }

  // Load all vocabulary for the language, keyed by normalized target word.
  const vocab = await db
    .select()
    .from(vocabulary)
    .where(eq(vocabulary.language, language))
    .orderBy(asc(vocabulary.frequencyRank));

  const vocabByWord = new Map<string, typeof vocab[number]>();
  for (const v of vocab) {
    const key = norm(v.targetWord);
    // Keep the lowest-frequency-rank row if duplicates exist.
    if (!vocabByWord.has(key)) vocabByWord.set(key, v);
  }

  // Assign display_order: curriculum words first, in curriculum order.
  const assignments: { id: string; word: string; displayOrder: number }[] = [];
  const matchedIds = new Set<string>();
  const missing: typeof order = [];
  let pos = 0;
  for (const o of order) {
    const v = vocabByWord.get(o.word);
    if (!v) {
      missing.push(o);
      continue;
    }
    assignments.push({ id: v.id, word: o.word, displayOrder: pos });
    matchedIds.add(v.id);
    pos++;
  }

  // Append non-curriculum vocabulary words by frequency rank (vocab already
  // sorted asc by frequencyRank above).
  const tail = vocab.filter((v) => !matchedIds.has(v.id));
  for (const v of tail) {
    assignments.push({ id: v.id, word: norm(v.targetWord), displayOrder: pos });
    pos++;
  }

  // ---- Report ----
  console.log(`\n=== Reorder vocabulary by curriculum: ${language} ===`);
  console.log(`Curriculum unique words:        ${order.length}`);
  console.log(`Vocabulary rows (DB):           ${vocab.length}`);
  console.log(`  - matched to curriculum:      ${matchedIds.size}`);
  console.log(`  - appended tail (non-curric): ${tail.length}`);
  console.log(`Curriculum words NOT in vocab:  ${missing.length}`);
  console.log(`Total display_order slots:      ${assignments.length}`);

  if (missing.length) {
    console.log(`\n--- ${missing.length} curriculum words missing from the vocabulary table ---`);
    console.log(`(these will NOT appear in the grid until vocab entries are created)`);
    const csvPath = `script/missing-vocab-${language}.csv`;
    const csv = ["phase,phase_name,subtheme,word,english"]
      .concat(missing.map((m) => `${m.phase},"${m.phaseName}","${m.subtheme}",${m.word},"${m.english}"`))
      .join("\n");
    writeFileSync(csvPath, csv + "\n");
    console.log(`Wrote full list to ${csvPath}\n`);
  }

  // Show the first 25 of the new order as a sanity check.
  console.log(`\n--- First 25 of new grid order ---`);
  for (const a of assignments.slice(0, 25)) {
    console.log(`  ${String(a.displayOrder).padStart(3)}  ${a.word}`);
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — no changes written. Re-run with --apply to commit.\n`);
    await db.$client.end?.();
    process.exit(0);
  }

  // ---- Apply ----
  console.log(`\nApplying ${assignments.length} display_order updates...`);
  let n = 0;
  for (const a of assignments) {
    await db.update(vocabulary).set({ displayOrder: a.displayOrder }).where(eq(vocabulary.id, a.id));
    n++;
    if (n % 100 === 0) console.log(`  ...${n}/${assignments.length}`);
  }
  console.log(`Done. Updated ${n} rows.\n`);
  await db.$client.end?.();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
