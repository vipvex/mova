import { db } from "../server/db";
import { frequencyDictionary } from "../shared/schema";

type NewWord = {
  word: string;
  english: string;
  tier: "T1" | "T2" | "T3";
  category: string;
  partOfSpeech: string;
  rationale: string;
  // Dimension scores (most are estimates aimed at the chosen tier)
  d: { d1: number; d2: number; d3: number; d4: number; d5: number; d6: number; d7: number; d8: number };
};

// Animal-sound verbs — all T2
const ANIMAL_VERBS: NewWord[] = [
  { word: "мяукать",   english: "to meow",       tier: "T2", category: "Animals", partOfSpeech: "verb",
    rationale: "Animal sound verb (cat); essential child play vocabulary.",
    d: { d1: 3, d2: 3, d3: 3, d4: 1, d5: 3, d6: 1, d7: 0, d8: 2 } },
  { word: "гавкать",   english: "to bark (colloq.)", tier: "T2", category: "Animals", partOfSpeech: "verb",
    rationale: "Colloquial animal sound verb (dog); kids' everyday word.",
    d: { d1: 3, d2: 3, d3: 3, d4: 1, d5: 3, d6: 1, d7: 0, d8: 2 } },
  { word: "лаять",     english: "to bark",       tier: "T2", category: "Animals", partOfSpeech: "verb",
    rationale: "Standard animal sound verb (dog); core for animal play.",
    d: { d1: 3, d2: 3, d3: 3, d4: 1, d5: 3, d6: 1, d7: 0, d8: 2 } },
  { word: "хрюкать",   english: "to oink",       tier: "T2", category: "Animals", partOfSpeech: "verb",
    rationale: "Animal sound verb (pig); barnyard play vocabulary.",
    d: { d1: 3, d2: 3, d3: 3, d4: 1, d5: 3, d6: 1, d7: 0, d8: 2 } },
  { word: "кукарекать", english: "to crow",      tier: "T2", category: "Animals", partOfSpeech: "verb",
    rationale: "Animal sound verb (rooster); barnyard play vocabulary.",
    d: { d1: 3, d2: 3, d3: 3, d4: 1, d5: 3, d6: 1, d7: 0, d8: 2 } },
  { word: "рычать",    english: "to growl/roar", tier: "T2", category: "Animals", partOfSpeech: "verb",
    rationale: "Animal sound verb (lion/bear/dog); dramatic play essential.",
    d: { d1: 3, d2: 3, d3: 3, d4: 1, d5: 3, d6: 1, d7: 0, d8: 2 } },
  { word: "мычать",    english: "to moo",        tier: "T2", category: "Animals", partOfSpeech: "verb",
    rationale: "Animal sound verb (cow); barnyard play vocabulary.",
    d: { d1: 3, d2: 3, d3: 3, d4: 1, d5: 3, d6: 1, d7: 0, d8: 2 } },
  { word: "чирикать",  english: "to chirp",      tier: "T2", category: "Animals", partOfSpeech: "verb",
    rationale: "Animal sound verb (bird); core nature/animal vocabulary.",
    d: { d1: 3, d2: 3, d3: 3, d4: 1, d5: 3, d6: 1, d7: 0, d8: 2 } },
  { word: "квакать",   english: "to croak",      tier: "T2", category: "Animals", partOfSpeech: "verb",
    rationale: "Animal sound verb (frog); core nature/animal vocabulary.",
    d: { d1: 3, d2: 3, d3: 3, d4: 1, d5: 3, d6: 1, d7: 0, d8: 2 } },
  { word: "кудахтать", english: "to cluck",      tier: "T2", category: "Animals", partOfSpeech: "verb",
    rationale: "Animal sound verb (hen); barnyard play vocabulary.",
    d: { d1: 3, d2: 3, d3: 3, d4: 1, d5: 3, d6: 1, d7: 0, d8: 1 } },
];

const POLITENESS: NewWord[] = [
  { word: "здравствуйте", english: "hello (formal)", tier: "T1", category: "Social & greetings", partOfSpeech: "interjection",
    rationale: "Formal greeting; essential for politeness and adult interactions.",
    d: { d1: 3, d2: 3, d3: 0, d4: 3, d5: 3, d6: 2, d7: 0, d8: 1 } },
  { word: "извините",    english: "sorry / excuse me", tier: "T1", category: "Social & greetings", partOfSpeech: "interjection",
    rationale: "Apology / attention-getter; core politeness vocabulary.",
    d: { d1: 3, d2: 3, d3: 0, d4: 3, d5: 3, d6: 2, d7: 0, d8: 2 } },
  { word: "до свидания",  english: "goodbye",     tier: "T1", category: "Social & greetings", partOfSpeech: "phrase",
    rationale: "Standard farewell; essential politeness phrase.",
    d: { d1: 3, d2: 3, d3: 0, d4: 3, d5: 3, d6: 2, d7: 0, d8: 2 } },
  { word: "доброе утро",  english: "good morning", tier: "T2", category: "Social & greetings", partOfSpeech: "phrase",
    rationale: "Daily greeting; learnable phrase for morning routine.",
    d: { d1: 3, d2: 3, d3: 0, d4: 2, d5: 3, d6: 2, d7: 0, d8: 2 } },
];

const MODERN_TECH: NewWord[] = [
  { word: "смартфон", english: "smartphone", tier: "T3", category: "Tech & modern life", partOfSpeech: "noun",
    rationale: "Modern device kids encounter daily; near-cognate.",
    d: { d1: 2, d2: 3, d3: 3, d4: 1, d5: 3, d6: 1, d7: 2, d8: 2 } },
  { word: "селфи",   english: "selfie",     tier: "T3", category: "Tech & modern life", partOfSpeech: "noun",
    rationale: "Modern photo concept; near-cognate, kid-relevant.",
    d: { d1: 2, d2: 3, d3: 3, d4: 1, d5: 3, d6: 1, d7: 2, d8: 2 } },
  { word: "вайфай",  english: "wi-fi",      tier: "T3", category: "Tech & modern life", partOfSpeech: "noun",
    rationale: "Daily home tech term; near-cognate.",
    d: { d1: 2, d2: 3, d3: 1, d4: 1, d5: 3, d6: 1, d7: 2, d8: 2 } },
  { word: "онлайн",  english: "online",     tier: "T3", category: "Tech & modern life", partOfSpeech: "adverb",
    rationale: "Modern modifier kids hear constantly; near-cognate.",
    d: { d1: 2, d2: 2, d3: 0, d4: 1, d5: 3, d6: 1, d7: 2, d8: 2 } },
];

const ONOMATOPOEIA: NewWord[] = [
  { word: "мяу",   english: "meow",  tier: "T2", category: "Animals", partOfSpeech: "interjection",
    rationale: "Cat sound; core child onomatopoeia.",
    d: { d1: 3, d2: 3, d3: 3, d4: 1, d5: 3, d6: 2, d7: 0, d8: 3 } },
  { word: "гав",   english: "woof",  tier: "T2", category: "Animals", partOfSpeech: "interjection",
    rationale: "Dog sound; core child onomatopoeia.",
    d: { d1: 3, d2: 3, d3: 3, d4: 1, d5: 3, d6: 2, d7: 0, d8: 3 } },
  { word: "ав-ав", english: "woof-woof", tier: "T2", category: "Animals", partOfSpeech: "interjection",
    rationale: "Reduplicated dog sound; toddler-style onomatopoeia.",
    d: { d1: 3, d2: 3, d3: 3, d4: 1, d5: 3, d6: 2, d7: 0, d8: 3 } },
  { word: "бах",   english: "bang",  tier: "T2", category: "Toys & play", partOfSpeech: "interjection",
    rationale: "Impact sound; core child play vocabulary.",
    d: { d1: 3, d2: 3, d3: 2, d4: 1, d5: 3, d6: 1, d7: 0, d8: 3 } },
];

const ALL = [...ANIMAL_VERBS, ...POLITENESS, ...MODERN_TECH, ...ONOMATOPOEIA];

(async () => {
  let rank = 10001;
  let inserted = 0;
  for (const w of ALL) {
    await db.insert(frequencyDictionary).values({
      word: w.word,
      english: w.english,
      language: "russian",
      frequencyRank: rank++,
      partOfSpeech: w.partOfSpeech,
      category: w.category,
      gatePass: true,
      d1Spoken: w.d.d1,
      d2ChildWorld: w.d.d2,
      d3Concrete: w.d.d3,
      d4Generative: w.d.d4,
      d5AgeOk: w.d.d5,
      d6Cultural: w.d.d6,
      d7Cognate: w.d.d7,
      d8Phonetic: w.d.d8,
      tier: w.tier,
      rationale: w.rationale,
    });
    inserted++;
  }
  console.log(`Inserted ${inserted} new words (ranks ${10001}–${rank - 1})`);

  // Breakdown by tier
  console.log(`  T1: ${ALL.filter((w) => w.tier === "T1").length}`);
  console.log(`  T2: ${ALL.filter((w) => w.tier === "T2").length}`);
  console.log(`  T3: ${ALL.filter((w) => w.tier === "T3").length}`);

  process.exit(0);
})();
