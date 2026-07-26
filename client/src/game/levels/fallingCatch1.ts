import type { CatcherLevel } from "@shared/catcherTypes";

/**
 * Level 2 — Falling Catch (Russian food/animal nouns).
 * CATCHER engine (33/35 on the master list). Say the item's name to catch it.
 */
export const fallingCatch1: CatcherLevel = {
  id: "falling-catch-1",
  engine: "catcher",
  title: "Лови!",
  lang: "russian",
  theme: "kitchen",
  source: "handmade",
  status: "approved",
  vocab: ["яблоко", "банан", "рыба", "сыр", "молоко"],
  words: ["яблоко", "банан", "рыба", "сыр", "молоко"],
  showLabels: true,
  items: [
    { id: "apple", word: "яблоко", emoji: "🍎" },
    { id: "banana", word: "банан", emoji: "🍌" },
    { id: "fish", word: "рыба", emoji: "🐟" },
    { id: "cheese", word: "сыр", emoji: "🧀" },
    { id: "milk", word: "молоко", emoji: "🥛" },
  ],
  tuning: { fallPxPerSec: 150, rampPerCatch: 6, spawnGapSec: 2.2 },
  win: { itemsToCatch: 12 },
};
