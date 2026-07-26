import type { PlatformerLevel } from "@shared/platformerTypes";

/** Prototype 1 — Voice-Gate Platformer, config A (forest). Control verbs + a 2-word door. */
export const voiceGate1: PlatformerLevel = {
  id: "voice-gate-1",
  engine: "platformer",
  title: "Лесная тропа",
  lang: "russian",
  theme: "forest",
  source: "handmade",
  status: "approved",
  vocab: ["катись", "опустись", "беги", "расти", "открой сундук", "открой дверь"],
  words: ["катись", "опустись", "беги", "расти", "открой сундук", "открой дверь"],
  worldWidth: 2900,
  gaps: [{ x: 1200, width: 220 }],
  obstacles: [
    { id: "boulder", x: 600, word: "катись", picture: "🪨", type: "boulder" },
    { id: "chest", x: 950, word: "открой сундук", picture: "🎁", type: "chest", reward: 5 },
    { id: "bridge", x: 1200, word: "опустись", picture: "🌉", type: "bridge", span: 220 },
    { id: "bear", x: 1750, word: "беги", picture: "🐻", type: "bear" },
    { id: "vine", x: 2200, word: "расти", picture: "🌿", type: "vine" },
    { id: "door", x: 2700, word: "открой дверь", picture: "🚪", type: "door" },
  ],
  goalX: 2700,
  tuning: { runSpeed: 260, jumpVel: 620, gravity: 1400, triggerRange: 210 },
};
