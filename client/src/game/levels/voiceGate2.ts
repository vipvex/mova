import type { PlatformerLevel } from "@shared/platformerTypes";

/** Prototype 1 — config B (cave). Same code, different order/theme → proves config-swap. */
export const voiceGate2: PlatformerLevel = {
  id: "voice-gate-2",
  engine: "platformer",
  title: "Пещера",
  lang: "russian",
  theme: "cave",
  source: "handmade",
  status: "approved",
  vocab: ["беги", "опустись", "катись", "расти", "открой сундук", "открой дверь"],
  words: ["беги", "опустись", "катись", "расти", "открой сундук", "открой дверь"],
  worldWidth: 2700,
  gaps: [{ x: 850, width: 240 }],
  obstacles: [
    { id: "bear", x: 500, word: "беги", picture: "🐻", type: "bear" },
    { id: "bridge", x: 850, word: "опустись", picture: "🌉", type: "bridge", span: 240 },
    { id: "boulder", x: 1400, word: "катись", picture: "🪨", type: "boulder" },
    { id: "chest", x: 1650, word: "открой сундук", picture: "🎁", type: "chest", reward: 5 },
    { id: "vine", x: 2000, word: "расти", picture: "🌿", type: "vine" },
    { id: "door", x: 2500, word: "открой дверь", picture: "🚪", type: "door" },
  ],
  goalX: 2500,
  tuning: { runSpeed: 260, jumpVel: 620, gravity: 1400, triggerRange: 210 },
};
