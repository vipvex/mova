/**
 * Shared game envelope across all engines.
 *
 * Every mini-game engine (RUNNER, CATCHER, GATE, LISTENER, MEMORY, ...) is a Phaser
 * scene that eats an engine-specific config. They all share this BaseLevel envelope so
 * the registry, menu, voice wiring, factory, and review portal can treat them uniformly.
 */

export type EngineId =
  | "runner" | "catcher" | "gate" | "commander" | "builder"
  | "listener" | "memory" | "number" | "rhythm" | "platformer" | "kitchen";

export type Lang = "russian" | "spanish";

export interface BaseLevel {
  id: string;
  engine: EngineId;
  title: string;
  lang: Lang;
  theme?: string;
  /** Vocabulary this level teaches (for menu/curriculum display). */
  vocab?: string[];
  /** The ASR grammar — tiny word set the voice recognizer is constrained to. */
  words: string[];
  /** Whether the child must speak (voice engines) or only listen/d-pad (voice-rest). */
  voiceRest?: boolean;
  source: "handmade" | "factory";
  status: "approved" | "draft";
}

/** Uniform HUD the shell renders for any engine. */
export interface GameHud {
  cleared: number;
  total: number;
  misses: number;
  state: "ready" | "running" | "won";
  lastWord?: string;
  lastLatencyMs?: number;
}

/** A telemetry event (per-utterance / per-level) — the seed of the word-state machine. */
export interface GameEvent {
  type: "level_start" | "level_complete" | "utterance" | "clear" | "respawn" | "reward";
  word?: string;
  accepted?: boolean;
  latencyMs?: number;
  confidence?: number;
  ms?: number;        // e.g. completion time
  coins?: number;
  meta?: Record<string, unknown>;
}

/** Hooks every engine scene receives from the shell. */
export interface GameHooks {
  onHud: (h: GameHud) => void;
  /** Telegraph: the word the player should say right now ("" = none). */
  onNeedWord: (word: string) => void;
  /** Optional: award coins/collectibles to the meta-layer. */
  onReward?: (coins: number) => void;
  /** Narrow the live ASR grammar to the current interaction's word(s). */
  onSetGrammar?: (words: string[]) => void;
  /** Emit a telemetry event (shell adds levelId + timestamp, posts to /api/telemetry). */
  onTelemetry?: (e: GameEvent) => void;
}

/** Contract the shell relies on for any engine scene. */
export interface EngineScene {
  attemptWord(word: string, latencyMs?: number): void;
}

// ── factory / review portal shared types ────────────────────────────────────

export interface JudgeScores {
  M: number; V: number; T: number; B: number; R: number; L: number; A: number;
  total: number;
  tier: "S" | "A" | "B" | "C" | "reject";
  notes?: string;
}

export interface StoredLevel {
  id: string;
  engine: string;
  title: string;
  lang: Lang;
  status: "draft" | "approved" | "rejected";
  source: "handmade" | "factory";
  vocab?: string[];
  words: string[];
  createdAt: string;
  scores?: JudgeScores;
  comment?: string;
  config: any; // full engine-specific level (RunnerLevel | CatcherLevel | ...)
}
