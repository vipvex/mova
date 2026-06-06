import { db } from "../server/db";
import { frequencyDictionary } from "../shared/schema";
import { and, eq, inArray, sql, desc, asc } from "drizzle-orm";

const lang = "russian";

async function rows<T extends Record<string, any>>(query: any): Promise<T[]> {
  return query;
}

function fmt(rows: { word: string; tier: string | null; frequency_rank?: number; rank?: number }[]) {
  return rows.map((r) => `${r.word}(${r.tier ?? "-"})`).join(", ");
}

(async () => {
  const all = await db
    .select({
      id: frequencyDictionary.id,
      word: frequencyDictionary.word,
      tier: frequencyDictionary.tier,
      rank: frequencyDictionary.frequencyRank,
      gateReason: frequencyDictionary.gateReason,
      category: frequencyDictionary.category,
      rationale: frequencyDictionary.rationale,
    })
    .from(frequencyDictionary)
    .where(eq(frequencyDictionary.language, lang));

  const byWord = new Map<string, typeof all[0]>();
  for (const r of all) byWord.set(r.word.toLowerCase().trim(), r);

  const inKept = (w: string) => {
    const e = byWord.get(w);
    return e && ["T1", "T2", "T3", "T4"].includes(e.tier ?? "");
  };
  const tierOf = (w: string) => byWord.get(w)?.tier ?? "—";

  const sec = (n: number, title: string) => console.log(`\n=== ${n}. ${title} ===`);

  // ============== A. DUPLICATE PATTERNS ==============

  // Scan 1: Reflexive verb pairs (-ся) where both forms in T1-T3
  sec(1, "Reflexive verb duplicates (X / X-ся both in T1-T3)");
  const reflexives: { word: string; tier: string | null; base: string; baseTier: string | null }[] = [];
  for (const r of all) {
    const w = r.word.toLowerCase().trim();
    if (!(w.endsWith("ться") || w.endsWith("ся") && w.endsWith("ться"))) continue;
    if (!w.endsWith("ся")) continue;
    if (!["T1", "T2", "T3"].includes(r.tier ?? "")) continue;
    const base = w.endsWith("ться") ? w.slice(0, -2) : w.slice(0, -2);
    if (byWord.has(base) && ["T1", "T2", "T3"].includes(byWord.get(base)!.tier ?? "")) {
      reflexives.push({ word: r.word, tier: r.tier, base, baseTier: byWord.get(base)!.tier });
    }
  }
  console.log(`Found: ${reflexives.length}`);
  console.log(reflexives.slice(0, 25).map((x) => `${x.word}(${x.tier})↔${x.base}(${x.baseTier})`).join(", "));
  if (reflexives.length > 25) console.log(`...and ${reflexives.length - 25} more`);

  // Scan 2: Suppletive aspect pairs (different roots, same meaning)
  sec(2, "Suppletive aspect pairs (different-root impf/pf)");
  const suppletives = [
    ["говорить", "сказать"],
    ["брать", "взять"],
    ["класть", "положить"],
    ["ловить", "поймать"],
    ["искать", "найти"],
    ["возвращать", "вернуть"],
    ["становиться", "стать"],
    ["ложиться", "лечь"],
    ["садиться", "сесть"],
  ];
  for (const [a, b] of suppletives) {
    const ta = tierOf(a), tb = tierOf(b);
    if (ta !== "—" || tb !== "—") {
      console.log(`  ${a}=${ta}  vs  ${b}=${tb}`);
    }
  }

  // Scan 3: -нуть punctual verbs vs imperfective base
  sec(3, "-нуть punctual verbs in T1-T3 with imperfective base also in T1-T3");
  const punctual: { word: string; tier: string | null; base: string; baseTier: string | null }[] = [];
  for (const r of all) {
    const w = r.word.toLowerCase().trim();
    if (!w.endsWith("нуть")) continue;
    if (!["T1", "T2", "T3"].includes(r.tier ?? "")) continue;
    // Try common imperfective bases by suffix swap
    const stem = w.slice(0, -4);
    for (const ending of ["ать", "ять", "ить", "еть"]) {
      const base = stem + ending;
      // also try with consonant alternation (к→ч, г→ж)
      const alts = [base];
      if (stem.endsWith("к")) alts.push(stem.slice(0, -1) + "ч" + ending);
      if (stem.endsWith("г")) alts.push(stem.slice(0, -1) + "ж" + ending);
      for (const alt of alts) {
        if (byWord.has(alt) && ["T1", "T2", "T3"].includes(byWord.get(alt)!.tier ?? "")) {
          punctual.push({ word: r.word, tier: r.tier, base: alt, baseTier: byWord.get(alt)!.tier });
        }
      }
    }
  }
  console.log(`Found: ${punctual.length}`);
  console.log(punctual.slice(0, 25).map((x) => `${x.word}(${x.tier})→${x.base}(${x.baseTier})`).join(", "));

  // Scan 4: Comparative + superlative pairs
  sec(4, "Irregular comparatives where base adjective also exists");
  const compPairs = [
    ["лучше", "хороший"], ["хуже", "плохой"], ["больше", "большой"], ["меньше", "маленький"],
    ["выше", "высокий"], ["ниже", "низкий"], ["старше", "старший"], ["младше", "младший"],
    ["лучший", "хороший"], ["худший", "плохой"], ["больший", "большой"], ["меньший", "маленький"],
    ["легче", "лёгкий"], ["тяжелее", "тяжёлый"], ["дальше", "далёкий"], ["ближе", "близкий"],
  ];
  for (const [comp, base] of compPairs) {
    const ta = tierOf(comp), tb = tierOf(base);
    if (ta !== "—" || tb !== "—") {
      console.log(`  comp ${comp}=${ta}  vs  base ${base}=${tb}`);
    }
  }

  // Scan 5: Past participles vs verbs (-тый, -нный)
  sec(5, "Past-participle forms in T1-T3 with their verb also in T1-T3");
  const participles: { word: string; tier: string | null; verb?: string; verbTier?: string | null }[] = [];
  for (const r of all) {
    const w = r.word.toLowerCase().trim();
    if (!["T1", "T2", "T3"].includes(r.tier ?? "")) continue;
    if (!/(ый|ая|ое|ые)$/.test(w)) continue;
    // Strip ending; try matching verb -ть or -ться
    const stem = w.replace(/(тый|нный|нный|анный|енный)$/, "");
    if (stem === w || stem.length < 3) continue;
    for (const ending of ["ть", "ться", "ать", "ить", "еть"]) {
      const verb = stem + ending;
      if (byWord.has(verb) && ["T1", "T2", "T3"].includes(byWord.get(verb)!.tier ?? "")) {
        participles.push({ word: r.word, tier: r.tier, verb, verbTier: byWord.get(verb)!.tier });
        break;
      }
    }
  }
  console.log(`Found: ${participles.length}`);
  console.log(participles.slice(0, 25).map((x) => `${x.word}(${x.tier})↔${x.verb}(${x.verbTier})`).join(", "));

  // Scan 6: More diminutive adjective suffixes
  sec(6, "Other diminutive adj suffixes (-ёхонький, -охонький, etc.)");
  const dimPats = ["ёхонький", "охонький", "ёшенький", "ёшечный", "ушка", "юшка"];
  const dimAdj: string[] = [];
  for (const r of all) {
    const w = r.word.toLowerCase().trim();
    if (!["T1", "T2", "T3"].includes(r.tier ?? "")) continue;
    for (const p of dimPats) {
      if (w.endsWith(p)) dimAdj.push(`${r.word}(${r.tier})`);
    }
  }
  console.log(`Found: ${dimAdj.length}`);
  console.log(dimAdj.slice(0, 30).join(", "));

  // Scan 7: Augmentatives
  sec(7, "Augmentatives (-ище, -ища)");
  const aug = all
    .filter((r) => /(ище|ища|ищу)$/.test(r.word.toLowerCase().trim()))
    .filter((r) => ["T1", "T2", "T3", "T4"].includes(r.tier ?? ""));
  console.log(`Found: ${aug.length}`);
  console.log(aug.slice(0, 20).map((x) => `${x.word}(${x.tier})`).join(", "));

  // ============== B. POSSIBLE FALSE REJECTS ==============

  // Scan 8: Strong cultural words possibly mis-rejected
  sec(8, "Possibly-mis-rejected cultural staples");
  const culturalCheck = ["ангел","бог","душа","мечта","сказка","сон","сердце","мечтать","петь","танцевать"];
  for (const w of culturalCheck) console.log(`  ${w}: ${tierOf(w)}`);

  // Scan 9: Animal verbs/sounds
  sec(9, "Animal sound verbs presence");
  const animVerbs = ["мяукать","гавкать","лаять","хрюкать","кукарекать","рычать","мычать","чирикать","квакать","кудахтать"];
  for (const w of animVerbs) console.log(`  ${w}: ${tierOf(w)}`);

  // Scan 10: Onomatopoeia
  sec(10, "Onomatopoeia (likely missing entirely)");
  const onom = ["бах","бум","тик-так","ам","ав","мяу","гав","хрю","ой","ай","ох","ух","ха-ха","ого","эй"];
  for (const w of onom) {
    const e = byWord.get(w);
    if (e) console.log(`  ${w}: ${e.tier}`);
  }
  console.log(`(missing words from this set are not in dict at all)`);

  // Scan 11: Politeness particles
  sec(11, "Politeness particles tier check");
  for (const w of ["пожалуйста","спасибо","здравствуйте","привет","пока","до","свидания","извините","прости","прошу"]) {
    console.log(`  ${w}: ${tierOf(w)}`);
  }

  // ============== C. COVERAGE GAPS ==============

  // Scan 12: Numbers
  sec(12, "Numbers — coverage check");
  const nums = ["один","два","три","четыре","пять","шесть","семь","восемь","девять","десять","одиннадцать","двенадцать","тринадцать","четырнадцать","пятнадцать","двадцать","тридцать","сорок","пятьдесят","сто","тысяча","миллион"];
  for (const w of nums) console.log(`  ${w}: ${tierOf(w)}`);

  // Scan 13: Days + months
  sec(13, "Days of week + months");
  const days = ["понедельник","вторник","среда","четверг","пятница","суббота","воскресенье"];
  const months = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];
  for (const w of days) console.log(`  day ${w}: ${tierOf(w)}`);
  for (const w of months) console.log(`  month ${w}: ${tierOf(w)}`);

  // Scan 14: Time-of-day + temporal markers
  sec(14, "Temporal markers");
  for (const w of ["утро","день","вечер","ночь","завтра","вчера","сейчас","потом","рано","поздно","скоро","часто","всегда","никогда"]) {
    console.log(`  ${w}: ${tierOf(w)}`);
  }

  // Scan 15: Prepositions + spatial
  sec(15, "Prepositions + spatial relations");
  for (const w of ["над","под","за","перед","между","вокруг","около","рядом","слева","справа","внутри","снаружи","сверху","снизу"]) {
    console.log(`  ${w}: ${tierOf(w)}`);
  }

  // Scan 16: Question words
  sec(16, "Question words");
  for (const w of ["кто","что","где","когда","почему","зачем","как","куда","откуда","который","какой","чей","сколько"]) {
    console.log(`  ${w}: ${tierOf(w)}`);
  }

  // Scan 17: Extended family
  sec(17, "Extended family terms");
  for (const w of ["тётя","тетя","дядя","племянник","племянница","двоюродный","родственник","родители","супруг","супруга","муж","жена"]) {
    console.log(`  ${w}: ${tierOf(w)}`);
  }

  // ============== D. POLYSEMY ==============

  // Scan 18: Known polysemic words — show their scored sense (rationale)
  sec(18, "Known polysemic words — verify scored sense");
  const polysemy = ["ключ","язык","мир","лук","лист","пол","коса","зам","брак","раз","том","свет","нос"];
  for (const w of polysemy) {
    const e = byWord.get(w);
    if (e) console.log(`  ${w} (${e.tier}): ${(e.rationale || "").slice(0, 100)}`);
  }

  // ============== E. MODERN/CULTURAL ==============

  // Scan 20: Modern tech presence
  sec(20, "Modern tech vocabulary presence");
  for (const w of ["смартфон","селфи","вайфай","wi-fi","пароль","онлайн","видео","сайт","интернет","телефон","компьютер","блог","эсэмэска","чат"]) {
    console.log(`  ${w}: ${tierOf(w)}`);
  }

  // Scan 21: Outdated tech that may have leaked into kept tiers
  sec(21, "Outdated tech in kept tiers (should be Reject?)");
  for (const w of ["пейджер","факс","телеграф","телеграмма","видеокассета","патефон","граммофон"]) {
    const t = tierOf(w);
    if (t !== "—") console.log(`  ${w}: ${t}`);
  }

  // Scan 22: Soviet residue
  sec(22, "Soviet-era residue in kept tiers");
  for (const w of ["коммунистический","коммунист","пионер","комсомол","октябрёнок","октябренок","совхоз","колхоз","ленинский","сталинский"]) {
    const t = tierOf(w);
    if (t !== "—" && t !== "Reject") console.log(`  ${w}: ${t} ⚠`);
    else if (t !== "—") console.log(`  ${w}: ${t}`);
  }

  // ============== F. TIER QUALITY ==============

  // Scan 23: Full T1 audit
  sec(23, "Full T1 audit (all 109 words)");
  const t1Words = all.filter((r) => r.tier === "T1").sort((a, b) => a.rank - b.rank);
  console.log(`Total: ${t1Words.length}`);
  console.log(t1Words.map((x) => x.word).join(", "));

  // Scan 24: Top 50 highest-frequency Rejects
  sec(24, "Top 50 highest-frequency Rejects (red-flag check)");
  const topRejects = all.filter((r) => r.tier === "Reject").sort((a, b) => a.rank - b.rank).slice(0, 50);
  console.log(topRejects.map((x) => `${x.word}#${x.rank}/${x.gateReason ?? "?"}`).join(", "));

  // Scan 25: Lowest-frequency T2 (deepest-rank kept words)
  sec(25, "Lowest-frequency T2 (rank 8000+) — sanity sample");
  const deepT2 = all.filter((r) => r.tier === "T2" && r.rank >= 8000).sort((a, b) => b.rank - a.rank).slice(0, 30);
  console.log(deepT2.map((x) => `${x.word}#${x.rank}`).join(", "));

  // Scan 26: Pure T3 sample around mid-rank (3k-5k)
  sec(26, "T3 sample mid-rank — verify they're 'round-out conversation'");
  const midT3 = all.filter((r) => r.tier === "T3" && r.rank >= 3000 && r.rank <= 5000).slice(0, 30);
  console.log(midT3.map((x) => `${x.word}#${x.rank}`).join(", "));

  // ============== G. PEDAGOGICAL ==============

  // Scan 27: Vulgar but kid-said words
  sec(27, "Vulgar-but-kid-said words — current tier");
  for (const w of ["попа","какашка","пук","пердеть","пукать","пописать","покакать","писать"]) {
    console.log(`  ${w}: ${tierOf(w)}`);
  }

  // Scan 28: Formal words in T2
  sec(28, "Formal-feeling words in T2 (sample for register check)");
  const formalSamples = ["являться","становиться","оказываться","соответствовать","осуществлять","осуществляться","обеспечивать","представлять","предоставлять","осмеливаться"];
  for (const w of formalSamples) {
    const t = tierOf(w);
    if (t !== "—" && t !== "Reject") console.log(`  ${w}: ${t}`);
  }

  // Scan 29: Cognate words possibly noise in T2/T3
  sec(29, "Cognate words feeling 'too academic for child' in T2/T3");
  const cogNoise = ["актуальный","адекватный","позитивный","негативный","оптимальный","персональный","эффективный","потенциальный","актуально","реальный"];
  for (const w of cogNoise) {
    const t = tierOf(w);
    if (t !== "—" && t !== "Reject") console.log(`  ${w}: ${t}`);
  }

  // Scan 30: Motion verb pairs
  sec(30, "Motion verb pairs (impf-determinate / impf-indeterminate)");
  for (const pair of [["идти","ходить"], ["бежать","бегать"], ["лететь","летать"], ["плыть","плавать"], ["ехать","ездить"], ["вести","водить"], ["нести","носить"], ["ползти","ползать"]]) {
    console.log(`  ${pair[0]}=${tierOf(pair[0])}  vs  ${pair[1]}=${tierOf(pair[1])}`);
  }

  // ============== H. DATA QUALITY ==============

  // Scan 31: Single-letter or non-words still kept
  sec(31, "Single/very-short non-word entries in kept tiers");
  const shorts = all.filter((r) => r.word.length <= 2 && ["T1", "T2", "T3", "T4"].includes(r.tier ?? ""));
  console.log(shorts.map((x) => `${x.word}(${x.tier})`).join(", "));

  // Scan 32: Whitespace/case anomalies
  sec(32, "Whitespace/case anomalies");
  const anomalies = all.filter((r) => r.word !== r.word.trim() || r.word !== r.word.toLowerCase() || /[A-Za-z]/.test(r.word));
  console.log(`Found: ${anomalies.length}`);
  if (anomalies.length > 0) console.log(anomalies.slice(0, 20).map((x) => `"${x.word}"`).join(", "));

  // Scan 33: Duplicate word entries (same word, different IDs)
  sec(33, "Duplicate entries (same word multiple times)");
  const dupCount = await db.execute(sql`
    SELECT word, COUNT(*) as n FROM frequency_dictionary
    WHERE language='russian' GROUP BY word HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 20
  `);
  console.log(`Found groups: ${(dupCount as any).rows.length}`);
  for (const row of (dupCount as any).rows) console.log(`  "${row.word}" × ${row.n}`);

  // ============== SUMMARY ==============
  sec(99, "SUMMARY — final tier counts");
  const tierC: Record<string, number> = {};
  for (const r of all) tierC[r.tier ?? "(null)"] = (tierC[r.tier ?? "(null)"] || 0) + 1;
  console.table(tierC);

  process.exit(0);
})();
