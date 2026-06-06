import { db } from "../server/db";
import { frequencyDictionary } from "../shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { writeFileSync } from "fs";

(async () => {
  // Load all kept-tier words with their tiers
  const all = await db
    .select({ id: frequencyDictionary.id, word: frequencyDictionary.word, tier: frequencyDictionary.tier })
    .from(frequencyDictionary)
    .where(and(eq(frequencyDictionary.language, "russian"), inArray(frequencyDictionary.tier, ["T1", "T2", "T3", "T4"])));

  const byWord = new Map<string, { id: string; tier: string | null }>();
  for (const r of all) byWord.set(r.word.toLowerCase().trim(), { id: r.id, tier: r.tier });

  const duplicates: { dup: string; base: string; pattern: string; dupTier: string | null; baseTier: string | null }[] = [];

  // Pass 1 — perfective verb duplicates: prefixed verb whose unprefixed root is also in dict
  // Russian aspectual prefixes (longest first to avoid overlap)
  const PREFIXES = ["пере", "пред", "рас", "раз", "при", "под", "про", "за", "по", "на", "об", "вы", "со", "с", "у", "о", "до"];
  for (const r of all) {
    const w = r.word.toLowerCase().trim();
    if (!w.endsWith("ть") && !w.endsWith("чь")) continue;
    if (r.tier === "T4") continue; // only act on T1-T3 duplicates
    for (const prefix of PREFIXES) {
      if (!w.startsWith(prefix) || w.length - prefix.length < 4) continue;
      const base = w.slice(prefix.length);
      if (byWord.has(base)) {
        const baseEntry = byWord.get(base)!;
        duplicates.push({ dup: w, base, pattern: `verb-prefix:${prefix}`, dupTier: r.tier, baseTier: baseEntry.tier });
        break;
      }
    }
  }

  // Pass 2 — deverbal nouns: short noun whose verb form is also in dict
  // Heuristic: word doesn't end in standard noun/adj/verb suffixes; try appending verb endings
  const VERB_ENDINGS = ["ать", "ять", "еть", "ить", "уть", "нуть", "оть"];
  // Consonant alternation (final-consonant → palatalized form for verb stem)
  // e.g. крик → крич+ать (к→ч), стук → стуч+ать, бок → боч+ить, etc.
  const ALT: Record<string, string[]> = {
    "к": ["ч"],
    "г": ["ж"],
    "х": ["ш"],
    "т": ["ч","щ"],
    "д": ["ж","жд"],
    "с": ["ш"],
    "з": ["ж"],
    "ст": ["щ"],
    "ск": ["щ"],
    "б": ["бл"],
    "п": ["пл"],
    "в": ["вл"],
    "м": ["мл"],
    "ф": ["фл"],
  };

  for (const r of all) {
    const w = r.word.toLowerCase().trim();
    if (w.length < 3 || w.length > 6) continue;
    // Skip obvious non-nouns
    if (w.endsWith("ть") || w.endsWith("чь") || w.endsWith("ся")) continue;
    if (/(ый|ий|ой|ая|яя|ое|ее|ые|ие)$/.test(w) && w.length >= 5) continue; // adjective
    if (r.tier === "T4") continue;
    if (r.tier === "Reject") continue;

    const lastChar = w.slice(-1);
    const lastTwo = w.slice(-2);
    const stem = w; // try direct stem first
    let found: string | null = null;

    // Direct + ending
    for (const ending of VERB_ENDINGS) {
      const verb = stem + ending;
      if (byWord.has(verb)) { found = verb; break; }
    }

    // With consonant alternation
    if (!found) {
      const alts = ALT[lastTwo] ?? ALT[lastChar];
      if (alts) {
        const dropLen = ALT[lastTwo] ? 2 : 1;
        for (const alt of alts) {
          for (const ending of VERB_ENDINGS) {
            const verb = stem.slice(0, -dropLen) + alt + ending;
            if (byWord.has(verb)) { found = verb; break; }
          }
          if (found) break;
        }
      }
    }

    if (found) {
      const baseEntry = byWord.get(found)!;
      duplicates.push({ dup: w, base: found, pattern: "deverbal-noun", dupTier: r.tier, baseTier: baseEntry.tier });
    }
  }

  console.log(`Found ${duplicates.length} candidates total.`);
  console.log("\n=== Perfective verb duplicates ===");
  const verbDups = duplicates.filter((d) => d.pattern.startsWith("verb-prefix"));
  console.log(`Count: ${verbDups.length}`);
  console.table(verbDups.slice(0, 60));

  console.log("\n=== Deverbal nouns ===");
  const nounDups = duplicates.filter((d) => d.pattern === "deverbal-noun");
  console.log(`Count: ${nounDups.length}`);
  console.table(nounDups.slice(0, 60));

  // Save for next step
  writeFileSync("/tmp/form_duplicates.json", JSON.stringify(duplicates));
  console.log("\nSaved candidate list to /tmp/form_duplicates.json — review then run apply step.");

  process.exit(0);
})();
