/**
 * MEMORY engine — level config schema.
 * Classic memory match, voice-twisted: flip cards (d-pad/number keys); when you uncover a
 * matching pair you must NAME it to collect it. Teaches recall + production of any nouns.
 * Rotates in as lower-urgency practice.
 */
import type { BaseLevel } from "./gameTypes";

export interface MemoryItem { word: string; emoji: string; }

export interface MemoryLevel extends BaseLevel {
  engine: "memory";
  items: MemoryItem[];        // distinct items; each becomes a pair on the board
  win: { pairs: number };     // number of pairs on the board (uses first N items)
}
