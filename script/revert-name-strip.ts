import { db } from "../server/db";
import { frequencyDictionary } from "../shared/schema";
import { and, eq, like, sql } from "drizzle-orm";

// Words that ARE clearly proper names — keep them rejected
const KEEP_REJECTED = new Set([
  // first-name diminutives + first names that have NO common-noun meaning
  "никита","лёха","леха","лёша","леша","миша","петя","паша","саша","коля","ваня","юра","серёжа","сережа",
  "толя","рома","костя","гена","дима","димка","витя","стёпа","степа","андрюша","матвей",
  "маша","катя","оля","настя","таня","света","надя","даша","юля","лена","ирка","анечка",
  "александр","андрей","владимир","иван","алексей","игорь","петр","пётр","виктор","олег","анна",
  "борис","юрий","татьяна","катя","петрович","семёнович","семенович","геннадий","иосиф","адам","тамара",
  "роберт","валентина","виталий","эдуард","жанна","эрик","лидия","генри","хуан","анастасия","полина",
  "артем","артём","артур","антон","костя","федор","фёдор","костя","аня","ника","лука","леха","леха",
  "ирина","марина","нина","катя","юля","полина","лариса","зоя","инна","эмма","эльвира","клара","милана",
  "кристина","оксана","рита","раиса","диана","карина","даша","юлия","катюша","ксения","тоня","сашка",
  "наташа","наташка","елена","екатерина","евгения","любовь","надежда","вера",
  // foreign names
  "джон","майкл","дэвид","уильям","эдвард","джейн","эдвард","вернер","отто","гарри","джим","том",
  "фрэнк","билл","моисей","иисус","адам","авраам","ева","яков","ник",
  // surnames
  "иванов","петров","сидоров","попов","жуков","беляев","павлов","шекспир","пушкин","толстой",
  // cities (clearly place names, no other meaning)
  "москва","петербург","питер","екатеринбург","новосибирск","самара","омск","казань","рига","минск",
  "одесса","париж","лондон","берлин","рим","мадрид","токио","пекин","сидней","лос-анджелес",
  "сан-франциско","голливуд","нью-йорк","бостон","филадельфия","сочи","нева","днепр","волга",
  "ярославль","псков","владивосток","хабаровск","красноярск",
  // countries / regions
  "россия","украина","беларусь","казахстан","узбекистан","грузия","армения","азербайджан",
  "германия","франция","италия","испания","польша","чехия","венгрия","греция","турция","кипр",
  "британия","англия","шотландия","ирландия","голландия","нидерланды","бельгия","швейцария","австрия",
  "норвегия","швеция","финляндия","дания","эстония","латвия","литва","китай","япония","корея",
  "индия","пакистан","иран","ирак","израиль","египет","ливия","марокко","алжир","тунис","судан",
  "австралия","канада","сша","америка","мексика","куба","бразилия","аргентина","чили","перу",
  "вьетнам","таиланд","филиппины","индонезия","малайзия","сингапур","болгария","румыния","сербия",
  "хорватия","босния","албания","молдова","татарстан","сибирь","кавказ","урал","крым","чукотка",
  "вьетнам","чехословакия","югославия","ссср","ирландия","шотландия","уэльс",
  "вена",
  // brands / awards / mythological
  "оскар","эмми","грэмми","мерседес","форд","тойота","вольво","будда","зевс","аллах","христос",
  // patronymics
  "петрович","семёнович","семенович","иванович","сергеевич","ивановна","сергеевна",
]);

(async () => {
  // 1. Find all rows that were demoted by the previous strip
  const demoted = await db
    .select({
      id: frequencyDictionary.id,
      word: frequencyDictionary.word,
      rationale: frequencyDictionary.rationale,
      category: frequencyDictionary.category,
    })
    .from(frequencyDictionary)
    .where(
      and(
        eq(frequencyDictionary.language, "russian"),
        like(frequencyDictionary.rationale, "%[demoted: name strip]%"),
      ),
    );

  console.log(`Found ${demoted.length} rows demoted by name strip.`);

  const toRevert: { id: string; word: string }[] = [];
  const toKeep: string[] = [];

  for (const row of demoted) {
    const w = row.word.toLowerCase().trim();
    if (KEEP_REJECTED.has(w)) {
      toKeep.push(row.word);
    } else {
      toRevert.push({ id: row.id, word: row.word });
    }
  }

  console.log(`Keeping rejected (real names): ${toKeep.length}`);
  console.log(toKeep.join(", "));
  console.log(`\nReverting (false positives): ${toRevert.length}`);
  console.log(toRevert.map((r) => r.word).join(", "));

  // 2. Revert false positives — set tier=T3 (a sensible default for common words)
  //    and strip the " [demoted: name strip]" suffix
  if (toRevert.length > 0) {
    for (const r of toRevert) {
      await db
        .update(frequencyDictionary)
        .set({
          tier: "T3",
          gatePass: true,
          gateReason: null,
          rationale: sql`REPLACE(COALESCE(${frequencyDictionary.rationale}, ''), ' [demoted: name strip]', '')`,
        })
        .where(eq(frequencyDictionary.id, r.id));
    }
    console.log(`\nReverted ${toRevert.length} rows to T3.`);
  }

  // 3. Clean up rationale for the keepers (drop the suffix marker)
  if (toKeep.length > 0) {
    await db.execute(sql`
      UPDATE frequency_dictionary
      SET rationale = REPLACE(rationale, ' [demoted: name strip]', '')
      WHERE language='russian' AND rationale LIKE '%[demoted: name strip]%'
    `);
    console.log(`Cleaned rationale suffix on remaining rejected names.`);
  }

  process.exit(0);
})();
