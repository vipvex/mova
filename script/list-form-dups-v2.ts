import { db } from "../server/db";
import { frequencyDictionary } from "../shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import { writeFileSync } from "fs";

(async () => {
  const all = await db
    .select({
      word: frequencyDictionary.word,
      tier: frequencyDictionary.tier,
      rank: frequencyDictionary.frequencyRank,
    })
    .from(frequencyDictionary)
    .where(and(eq(frequencyDictionary.language, "russian"), inArray(frequencyDictionary.tier, ["T1", "T2", "T3"])));

  const byWord = new Map<string, { tier: string | null; rank: number }>();
  for (const r of all) byWord.set(r.word.toLowerCase().trim(), { tier: r.tier, rank: r.rank });

  // ============ Reflexive pairs ============
  const reflexives: { word: string; tier: string | null; rank: number; base: string; baseTier: string | null; baseRank: number }[] = [];
  for (const r of all) {
    const w = r.word.toLowerCase().trim();
    if (!w.endsWith("ся") && !w.endsWith("сь")) continue;
    if (w.endsWith("ться")) {
      const base = w.slice(0, -2); // -ся off → -ть
      const baseEntry = byWord.get(base);
      if (baseEntry) reflexives.push({ word: r.word, tier: r.tier, rank: r.rank, base, baseTier: baseEntry.tier, baseRank: baseEntry.rank });
      continue;
    }
    // Other -ся forms (rare; mostly conjugated, but covers nouns like занимаюсь?)
    if (w.endsWith("ся")) {
      const base = w.slice(0, -2);
      const baseEntry = byWord.get(base);
      if (baseEntry) reflexives.push({ word: r.word, tier: r.tier, rank: r.rank, base, baseTier: baseEntry.tier, baseRank: baseEntry.rank });
    }
  }

  console.log(`\n=== REFLEXIVE PAIRS (-ся with base also in T1-T3): ${reflexives.length} ===\n`);
  for (const r of reflexives.sort((a, b) => a.rank - b.rank)) {
    console.log(`  ${r.word.padEnd(20)} (${r.tier}, #${r.rank}) ↔ ${r.base.padEnd(18)} (${r.baseTier}, #${r.baseRank})`);
  }

  // ============ -нуть punctual ============
  const punctual: { word: string; tier: string | null; rank: number; base: string; baseTier: string | null }[] = [];
  for (const r of all) {
    const w = r.word.toLowerCase().trim();
    if (!w.endsWith("нуть")) continue;
    const stem = w.slice(0, -4);
    const candidates = [stem + "ать", stem + "ять", stem + "ить", stem + "еть"];
    if (stem.endsWith("к")) candidates.push(stem.slice(0, -1) + "ч" + "ать");
    if (stem.endsWith("г")) candidates.push(stem.slice(0, -1) + "ж" + "ать");
    for (const cand of candidates) {
      const baseEntry = byWord.get(cand);
      if (baseEntry) {
        punctual.push({ word: r.word, tier: r.tier, rank: r.rank, base: cand, baseTier: baseEntry.tier });
        break;
      }
    }
  }

  console.log(`\n=== -НУТЬ PUNCTUAL (with imperfective base in T1-T3): ${punctual.length} ===\n`);
  for (const p of punctual.sort((a, b) => a.rank - b.rank)) {
    console.log(`  ${p.word.padEnd(18)} (${p.tier}, #${p.rank}) → ${p.base.padEnd(18)} (${p.baseTier})`);
  }

  // ============ Past participles ============
  const participles: { word: string; tier: string | null; rank: number; verb: string; verbTier: string | null }[] = [];
  for (const r of all) {
    const w = r.word.toLowerCase().trim();
    if (!/(ый|ой)$/.test(w)) continue;
    if (!/(нный|тый|анный|енный|итый)$/.test(w)) continue;
    let stem = w.slice(0, -2); // strip -ый/-ой
    // Try various verb endings on the stem
    const candidates = new Set<string>();
    if (stem.endsWith("нн")) {
      const s = stem.slice(0, -2);
      candidates.add(s + "ть");
      candidates.add(s + "ать");
      candidates.add(s + "ить");
      candidates.add(s + "еть");
    }
    if (stem.endsWith("т")) {
      const s = stem.slice(0, -1);
      candidates.add(s + "ть");
      candidates.add(s + "уть");
    }
    if (stem.endsWith("нн")) {
      const s = stem.slice(0, -2);
      candidates.add(s + "ить");
    }
    for (const cand of candidates) {
      const baseEntry = byWord.get(cand);
      if (baseEntry) {
        participles.push({ word: r.word, tier: r.tier, rank: r.rank, verb: cand, verbTier: baseEntry.tier });
        break;
      }
    }
  }

  console.log(`\n=== PAST PARTICIPLES (with verb in T1-T3): ${participles.length} ===\n`);
  for (const p of participles.sort((a, b) => a.rank - b.rank)) {
    console.log(`  ${p.word.padEnd(20)} (${p.tier}, #${p.rank}) ↔ ${p.verb.padEnd(18)} (${p.verbTier})`);
  }

  writeFileSync("/tmp/form_dups_v2.json", JSON.stringify({ reflexives, punctual, participles }, null, 2));
  console.log(`\nSaved to /tmp/form_dups_v2.json`);

  process.exit(0);
})();
