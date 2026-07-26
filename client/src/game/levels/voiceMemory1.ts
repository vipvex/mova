import type { MemoryLevel } from "@shared/memoryTypes";

/** Level 7 — Voice Memory Match (Russian nouns). MEMORY engine (32/35). Uncover a pair, then NAME it to keep it. */
export const voiceMemory1: MemoryLevel = {
  id: "voice-memory-1",
  engine: "memory",
  title: "Найди пару",
  lang: "russian",
  theme: "cards",
  source: "handmade",
  status: "approved",
  vocab: ["кот", "собака", "рыба", "яблоко"],
  words: ["кот", "собака", "рыба", "яблоко"],
  items: [
    { word: "кот", emoji: "🐱" },
    { word: "собака", emoji: "🐶" },
    { word: "рыба", emoji: "🐟" },
    { word: "яблоко", emoji: "🍎" },
  ],
  win: { pairs: 4 },
};
