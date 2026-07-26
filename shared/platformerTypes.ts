/**
 * PLATFORMER chassis (Prototype 1 — Voice-Gate Platformer, side-scroll).
 * FINAL game model: free d-pad movement + jump; EVERY world interaction runs through
 * spoken Russian. Obstacles block the path; speaking the word triggers the world response.
 * Level is 100% JSON — ship many themes/orders from identical code (factory economics).
 */
import type { BaseLevel } from "./gameTypes";

export type ObstacleType = "bridge" | "boulder" | "bear" | "vine" | "door" | "chest";

export interface PlatformerObstacle {
  id: string;
  /** World x-position of the obstacle / gap. */
  x: number;
  /** Word she must say to trigger the response (also the ASR grammar + TTS text). */
  word: string;
  /** Picture (emoji) — prompts are picture-only for now (no Cyrillic text). */
  picture: string;
  type: ObstacleType;
  /** For "bridge": the gap width it spans. For "chest": coins awarded. */
  span?: number;
  reward?: number;
}

export interface PlatformerLevel extends BaseLevel {
  engine: "platformer";
  theme: string;
  worldWidth: number;                 // total level length (px)
  gaps: { x: number; width: number }[]; // holes in the ground (fall → respawn)
  obstacles: PlatformerObstacle[];
  goalX: number;                      // flag / end-door position
  tuning: {
    runSpeed: number;    // px/s horizontal
    jumpVel: number;     // upward launch velocity
    gravity: number;     // px/s²
    triggerRange: number; // proximity (px) that opens the voice hot-window
  };
}
