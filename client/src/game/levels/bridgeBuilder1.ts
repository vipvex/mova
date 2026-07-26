import type { BuilderLevel } from "@shared/builderTypes";

/** Level 6 — Bridge Builder (Russian word order). BUILDER engine (31/35). Speak the words in order to span the gap. */
export const bridgeBuilder1: BuilderLevel = {
  id: "bridge-builder-1",
  engine: "builder",
  title: "Мост из слов",
  lang: "russian",
  theme: "canyon",
  source: "handmade",
  status: "approved",
  vocab: ["я", "хочу", "красное", "яблоко", "кот", "на", "столе"],
  words: ["я", "хочу", "красное", "яблоко", "кот", "на", "столе"],
  sentences: [
    ["я", "хочу", "яблоко"],
    ["красное", "яблоко"],
    ["кот", "на", "столе"],
  ],
  win: { sentences: 3 },
};
