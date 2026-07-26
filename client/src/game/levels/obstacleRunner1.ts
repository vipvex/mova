import type { RunnerLevel } from "@shared/runnerTypes";

/**
 * Level 1 — Obstacle Runner (Russian action verbs).
 * The top-ranked game on the master list (34/35). Two verbs to start: jump / duck.
 * Words chosen because they decode cleanly (validated in the Phase 0 spike).
 */
export const obstacleRunner1: RunnerLevel = {
  id: "obstacle-runner-1",
  engine: "runner",
  title: "Беги!",
  lang: "russian",
  theme: "meadow",
  source: "handmade",
  status: "approved",
  vocab: ["прыгай", "пригнись"],
  words: ["прыгай", "пригнись"],
  actions: [
    { id: "jump", word: "прыгай", emoji: "🪵", keys: [" ", "ArrowUp", "w"], motion: "jump" },
    { id: "duck", word: "пригнись", emoji: "🪁", keys: ["ArrowDown", "s"], motion: "duck" },
  ],
  tuning: {
    scrollPxPerSec: 260,
    rampPerClear: 8,
    spawnGapSec: 2.4,      // generous lead time to absorb ~1s voice latency
    actionWindowSec: 0.55,
  },
  win: { obstaclesToClear: 12 },
};
