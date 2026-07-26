import type { KitchenLevel, KitchenIngredient, KitchenMode } from "@shared/kitchenTypes";

// Tier-1 food nouns on the kitchen perimeter (stations Athena runs between).
const INGREDIENTS: KitchenIngredient[] = [
  { id: "apple", word: "яблоко", emoji: "🍎", cell: [1, 0] },
  { id: "meat", word: "мясо", emoji: "🥩", cell: [7, 0] },
  { id: "bread", word: "хлеб", emoji: "🍞", cell: [0, 3] },
  { id: "cheese", word: "сыр", emoji: "🧀", cell: [8, 3] },
  { id: "milk", word: "молоко", emoji: "🥛", cell: [2, 6] },
  { id: "fish", word: "рыба", emoji: "🐟", cell: [6, 6] },
];

function make(mode: KitchenMode, id: string, title: string): KitchenLevel {
  return {
    id, engine: "kitchen", title, lang: "russian", theme: "kitchen",
    source: "handmade", status: "approved",
    mode,
    vocab: INGREDIENTS.map((i) => i.word),
    words: INGREDIENTS.map((i) => i.word),
    grid: { cols: 9, rows: 7 },
    grandmaCell: [4, 0],
    ingredients: INGREDIENTS,
    tuning: { moveSpeed: 300, timeSec: 120, flashMs: 1300 },
    win: { orders: 6 },
  };
}

/** Mode 1 — grandma says the word; recognize & fetch (button pickup). */
export const grandmaKitchenListen = make("listen", "grandma-kitchen-listen", "Бабушкина кухня · слушай");
/** Mode 2 — say the word to pick up + to drop off. */
export const grandmaKitchenSay = make("say", "grandma-kitchen-say", "Бабушкина кухня · говори");
/** Mode 3 — grandma flashes the picture; recognize → say to pick up. */
export const grandmaKitchenFlash = make("flash", "grandma-kitchen-flash", "Бабушкина кухня · угадай");
