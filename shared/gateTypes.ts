/**
 * GATE engine — level config schema.
 * A wall of doors; the child SAYS the descriptor of the target door to pass through it.
 * Teaches: adjectives, colors, sizes, antonyms. Design law: speaking IS the steering.
 */
import type { BaseLevel } from "./gameTypes";

export interface GateChoice {
  id: string;
  word: string;   // the descriptor to say (also the door label)
  emoji: string;
  color?: string; // optional door tint (hex)
}

export interface GateLevel extends BaseLevel {
  engine: "gate";
  choices: GateChoice[];
  gatesPerScreen?: number;      // doors shown each round (default 3)
  tuning: { decideSec: number }; // seconds to choose before it counts as a miss
  win: { gatesToClear: number };
}
