/**
 * KITCHEN chassis — Grandma's Kitchen (flagship template).
 * Isometric (2:1 dimetric) grid: logical [col,row] cells project to diamond tiles;
 * Athena runs the kitchen, grabs ingredients, brings them to grandma.
 * Voice is the pickup/dropoff action; d-pad is movement. THREE escalating modes teach
 * recognition → production → recall, mapped to curriculum stages S1→S3.
 * This chassis is the foundation other game modes (shop, cook, tidy) fork from.
 */
import type { BaseLevel } from "./gameTypes";

export type KitchenMode =
  | "listen"   // grandma SAYS it → recognize by ear → fetch (button pickup). S1 Meet.
  | "say"      // say the word to pick up + say again to drop off. S2/S3 production.
  | "flash";   // grandma FLASHES the picture → recognize → say to pick up. S3.

export interface KitchenIngredient {
  id: string;
  word: string;         // Russian noun (ASR grammar + TTS)
  emoji: string;        // placeholder art (swap for sprites later)
  cell: [number, number]; // [col, row] on the iso grid (perimeter stations)
}

export interface KitchenLevel extends BaseLevel {
  engine: "kitchen";
  mode: KitchenMode;
  /** Logical grid size; rendered as a continuous isometric diamond floor. */
  grid: { cols: number; rows: number };
  grandmaCell: [number, number];
  ingredients: KitchenIngredient[];
  tuning: {
    moveSpeed: number;   // px/s
    timeSec: number;     // round timer
    flashMs: number;     // how long the picture flashes in "flash" mode
  };
  win: { orders: number };
}
