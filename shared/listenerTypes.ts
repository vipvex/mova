/**
 * LISTENER engine — level config schema. VOICE-REST (no speaking; d-pad only).
 * The game SPEAKS a command; the child obeys — but only when prefixed by the "Simon says"
 * phrase. Trap commands (no prefix) must be ignored. Teaches: comprehension. Rotates in
 * to rest the voice during long sessions (design law #6).
 */
import type { BaseLevel } from "./gameTypes";

export interface ListenerCommand {
  action: string;
  phrase: string;      // spoken/shown command word (target language)
  keys: string[];      // d-pad keys that satisfy it
  emoji?: string;
}

export interface ListenerLevel extends BaseLevel {
  engine: "listener";
  voiceRest: true;
  simonPhrase: string;             // e.g. "Саймон говорит" / "Simón dice"
  commands: ListenerCommand[];
  tuning: { windowSec: number };   // time to react
  win: { rounds: number };
}
