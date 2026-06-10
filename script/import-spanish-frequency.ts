// Import a Spanish frequency dictionary into `frequency_dictionary`.
//
// Source: doozan/spanish_data frequency.csv — lemmatized Spanish ranked by
// OpenSubtitles corpus frequency, with FreeLing POS tags. CC-BY-SA 3.0 (data
// derived from hermitdave/FrequencyWords), repo CC-BY-4.0. The same corpus
// family as the Russian list, so the two languages stay comparable.
//
// Mirrors how Russian was built: word + rank (+ POS here, a bonus). english
// and category are left null — derived later by score-frequency-dictionary.ts
// and the theme-classification pass.
//
// Idempotent: skips lemmas already present for Spanish.
// Run: npx tsx --env-file=.env script/import-spanish-frequency.ts [--limit=10000] [--dry]

import { db } from "../server/db";
import { frequencyDictionary } from "../shared/schema";
import { eq } from "drizzle-orm";

const SOURCE_URL = "https://raw.githubusercontent.com/doozan/spanish_data/master/frequency.csv";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : 10000;

// Map the source's FreeLing-style tags to our part_of_speech convention.
const POS_MAP: Record<string, string | null> = {
  v: "verb",
  n: "noun",
  adj: "adjective",
  adv: "adverb",
  prep: "preposition",
  pron: "pronoun",
  art: "determiner",
  determiner: "determiner",
  conj: "conjunction",
  num: "numeral",
  interj: "interjection",
  prop: "proper noun",
  contraction: "contraction",
  prefix: "prefix",
  particle: "particle",
  phrase: "phrase",
  letter: "letter",
  none: null,
  "": null,
};

function mapPos(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if (key in POS_MAP) return POS_MAP[key];
  return key || null;
}

const hasLetter = /[a-záéíóúüñ]/i;

async function main() {
  console.log(`Fetching ${SOURCE_URL} …`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  const lines = text.split("\n");
  console.log(`Source has ${lines.length - 1} rows. Target limit: ${LIMIT}.${DRY ? " (DRY RUN)" : ""}`);

  // Parse, filter, dedupe by lemma (keep highest-frequency occurrence).
  const seen = new Set<string>();
  type Row = { word: string; pos: string | null };
  const planned: Row[] = [];
  for (let i = 1; i < lines.length && planned.length < LIMIT; i++) {
    const line = lines[i];
    if (!line) continue;
    // Columns: count,spanish,pos,flags,usage — only the first four matter and
    // none of them contain commas (usage commas are irrelevant since we ignore it).
    const parts = line.split(",");
    if (parts.length < 4) continue;
    const spanish = parts[1].trim();
    const pos = parts[2];
    const flags = parts[3];
    if (!spanish || !hasLetter.test(spanish)) continue;
    if (flags.includes("DUPLICATE")) continue;
    const key = spanish.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    planned.push({ word: spanish, pos: mapPos(pos) });
  }
  console.log(`After filter/dedupe: ${planned.length} lemmas to consider.`);

  // Idempotency: skip lemmas already present for Spanish.
  const existing = await db
    .select({ word: frequencyDictionary.word })
    .from(frequencyDictionary)
    .where(eq(frequencyDictionary.language, "spanish"));
  const existingSet = new Set(existing.map((e) => e.word.toLowerCase().trim()));
  console.log(`Existing Spanish freq rows: ${existingSet.size}`);

  const toInsert = planned
    .map((p, idx) => ({
      word: p.word,
      english: null as string | null,
      language: "spanish",
      frequencyRank: idx + 1,
      partOfSpeech: p.pos,
      category: null as string | null,
    }))
    .filter((r) => !existingSet.has(r.word.toLowerCase().trim()));

  console.log(`Will insert ${toInsert.length} new rows (skipping ${planned.length - toInsert.length} existing).`);

  if (!DRY && toInsert.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      await db.insert(frequencyDictionary).values(toInsert.slice(i, i + CHUNK));
      process.stdout.write(`  inserted ${Math.min(i + CHUNK, toInsert.length)}/${toInsert.length}\r`);
    }
    console.log("");
  }

  // POS distribution sanity log.
  const posDist = new Map<string, number>();
  for (const p of planned) posDist.set(p.pos ?? "(none)", (posDist.get(p.pos ?? "(none)") || 0) + 1);
  console.log("POS distribution:");
  for (const [k, n] of [...posDist.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);

  console.log(`Done.${DRY ? " (DRY)" : ""}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
