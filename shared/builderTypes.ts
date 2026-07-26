/**
 * BUILDER engine — level config schema.
 * Speak words in the correct ORDER to lay planks and span a gap. Teaches word order /
 * sentence building (S4 Combine). Wrong order wobbles (funny), never punishes hard.
 */
import type { BaseLevel } from "./gameTypes";

export interface BuilderLevel extends BaseLevel {
  engine: "builder";
  /** Each sentence = words in the valid order to speak. */
  sentences: string[][];
  win: { sentences: number };  // how many spans to build (usually sentences.length)
}
