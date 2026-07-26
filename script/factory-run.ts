/**
 * Nightly factory run. Generates a batch of draft levels for the morning review queue.
 * Run:  tsx --env-file=.env script/factory-run.ts
 * Cron: schedule this overnight; Alex swipes the results at /review each morning.
 *
 * Edit NIGHTLY_BATCH (or later, read from a curriculum doc) to steer what gets made.
 */
import { runFactory, type CurriculumSpec } from "../server/factory";

const NIGHTLY_BATCH: CurriculumSpec[] = [
  { engine: "runner",  lang: "russian", vocabDomain: "action verbs: jump / duck / run", theme: "forest",  difficulty: "easy" },
  { engine: "catcher", lang: "russian", vocabDomain: "fruit nouns",                       theme: "orchard", difficulty: "easy" },
  { engine: "catcher", lang: "russian", vocabDomain: "animal nouns",                       theme: "farm",    difficulty: "medium" },
  { engine: "runner",  lang: "spanish", vocabDomain: "action verbs: salta / agacha / corre", theme: "city",  difficulty: "easy" },
];

async function main() {
  console.log(`[factory] generating ${NIGHTLY_BATCH.length} levels…`);
  let ok = 0, rejected = 0, failed = 0;
  for (let i = 0; i < NIGHTLY_BATCH.length; i++) {
    const spec = NIGHTLY_BATCH[i];
    try {
      const l = await runFactory(spec, i);
      const s = l.scores!;
      const flag = l.status === "rejected" ? "❌ REJECTED (M<=2)" : `→ ${l.status} · tier ${s.tier} (${s.total}/35)`;
      console.log(`  ✓ ${spec.engine}/${spec.vocabDomain}  ${flag}  [M${s.M} V${s.V} T${s.T} B${s.B} R${s.R} L${s.L} A${s.A}]`);
      if (l.status === "rejected") rejected++; else ok++;
    } catch (e: any) {
      failed++;
      console.log(`  ✗ ${spec.engine}/${spec.vocabDomain}  FAILED: ${e?.message || e}`);
    }
  }
  console.log(`[factory] done — ${ok} queued for review, ${rejected} auto-rejected, ${failed} errored.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
