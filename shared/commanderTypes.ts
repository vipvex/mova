/**
 * COMMANDER engine — level config schema.
 * An NPC (robot) obeys spoken commands, in order, to solve a room. Teaches verb/phrase
 * commands (S4 Combine). Design law: the NPC moves ONLY on her voice.
 */
import type { BaseLevel } from "./gameTypes";

export interface CommanderStep {
  word: string;    // command to say (иди / возьми / открой …)
  emoji: string;   // glyph shown for the action
  action: "walk" | "grab" | "open" | "push" | "press";
}

export interface CommanderLevel extends BaseLevel {
  engine: "commander";
  goalEmoji: string;         // what the robot is trying to reach (🏁, 🎁 …)
  steps: CommanderStep[];    // ordered command sequence that solves the room
  win: { steps: number };    // usually steps.length
}
