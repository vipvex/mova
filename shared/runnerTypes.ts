/**
 * RUNNER engine — level config schema.
 *
 * A "new Obstacle-Runner-style game" is just a new object of this shape.
 * The nightly factory will emit these; the engine (RunnerScene) plays any of them.
 * Design law: the spoken word IS the action button. Obstacles telegraph their verb.
 */
import type { BaseLevel } from "./gameTypes";

export type RunnerActionId = string; // internal key, e.g. "jump" | "duck"

export interface RunnerAction {
  id: RunnerActionId;
  /** The target word the player must SAY to trigger this action (level's language). */
  word: string;
  /** Telegraph glyph shown on the approaching obstacle. */
  emoji: string;
  /** Dev/testing keyboard fallback (KeyboardEvent.key values). */
  keys?: string[];
  /** Visual for how the character performs it (used by the scene). */
  motion: "jump" | "duck" | "none";
}

export interface RunnerObstacle {
  /** Which action clears this obstacle. Must match a RunnerAction.id. */
  action: RunnerActionId;
  /** Obstacle sprite/emoji (falls back to the action's emoji). */
  emoji?: string;
}

export interface RunnerLevel extends BaseLevel {
  engine: "runner";

  /** The verbs this level teaches. Union of .word values = the ASR grammar (`words`). */
  actions: RunnerAction[];

  /** Explicit ordered sequence. If omitted, obstacles are drawn randomly from `actions`. */
  obstacles?: RunnerObstacle[];

  /** Tuning knobs — the feel lives here. All time in seconds, speed in px/sec. */
  tuning: {
    scrollPxPerSec: number;   // base world speed
    rampPerClear: number;     // speed added per cleared obstacle (difficulty via speed)
    spawnGapSec: number;      // gap between obstacles
    /** Grace window (± seconds around the hit line) in which the action counts. */
    actionWindowSec: number;
  };

  win: { obstaclesToClear: number };
}
