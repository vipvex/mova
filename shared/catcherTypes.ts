/**
 * CATCHER engine — level config schema.
 * Items fall; the child SAYS the item's name to catch it before it splats.
 * Teaches: nouns at speed. Design law: naming IS the catch button; urgency = falling.
 */
import type { BaseLevel } from "./gameTypes";

export interface CatcherItem {
  id: string;
  /** Word to say to catch it (also its display label). */
  word: string;
  emoji: string;
}

export interface CatcherLevel extends BaseLevel {
  engine: "catcher";
  items: CatcherItem[];
  /** Show the word label on the falling item (easier). Factory can hide for recall difficulty. */
  showLabels?: boolean;
  tuning: {
    fallPxPerSec: number;
    rampPerCatch: number;   // speed added per catch
    spawnGapSec: number;
  };
  win: { itemsToCatch: number };
}
