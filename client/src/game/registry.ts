import Phaser from "phaser";
import type { EngineId, BaseLevel } from "@shared/gameTypes";
import { RunnerScene } from "./RunnerScene";
import { CatcherScene } from "./CatcherScene";
import { GateScene } from "./GateScene";
import { ListenerScene } from "./ListenerScene";
import { CommanderScene } from "./CommanderScene";
import { BuilderScene } from "./BuilderScene";
import { MemoryScene } from "./MemoryScene";
import { PlatformerScene } from "./PlatformerScene";
import { KitchenScene } from "./KitchenScene";
import { obstacleRunner1 } from "./levels/obstacleRunner1";
import { fallingCatch1 } from "./levels/fallingCatch1";
import { threeDoors1 } from "./levels/threeDoors1";
import { simonSays1 } from "./levels/simonSays1";
import { robotButler1 } from "./levels/robotButler1";
import { bridgeBuilder1 } from "./levels/bridgeBuilder1";
import { voiceMemory1 } from "./levels/voiceMemory1";
import { voiceGate1 } from "./levels/voiceGate1";
import { voiceGate2 } from "./levels/voiceGate2";
import { grandmaKitchenListen, grandmaKitchenSay, grandmaKitchenFlash } from "./levels/grandmaKitchen";

/** engine id → Phaser scene class. Add a row here when a new engine ships. */
export const SCENES: Partial<Record<EngineId, new () => Phaser.Scene>> = {
  runner: RunnerScene,
  catcher: CatcherScene,
  gate: GateScene,
  listener: ListenerScene,
  commander: CommanderScene,
  builder: BuilderScene,
  memory: MemoryScene,
  platformer: PlatformerScene,
  kitchen: KitchenScene,
};

/** Hand-made reference levels bundled with the client. Flagship (kitchen) first. */
export const BUILTIN_LEVELS: BaseLevel[] = [
  grandmaKitchenListen, grandmaKitchenSay, grandmaKitchenFlash,
  voiceGate1, voiceGate2,
  obstacleRunner1, fallingCatch1, threeDoors1, simonSays1, robotButler1, bridgeBuilder1, voiceMemory1,
] as unknown as BaseLevel[];

/** Factory-generated + approved levels served by the API (empty if none/unavailable). */
export async function fetchFactoryLevels(): Promise<BaseLevel[]> {
  try {
    const r = await fetch("/api/levels");
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data.levels) ? data.levels : [];
  } catch {
    return [];
  }
}

export async function getAllLevels(): Promise<BaseLevel[]> {
  const factory = await fetchFactoryLevels();
  // builtin first, then approved factory levels
  return [...BUILTIN_LEVELS, ...factory.filter((l) => l.status === "approved")];
}

export async function getLevel(id: string): Promise<BaseLevel | undefined> {
  const builtin = BUILTIN_LEVELS.find((l) => l.id === id);
  if (builtin) return builtin;
  // fetch any single level (approved OR draft) so the review portal can preview drafts
  try {
    const r = await fetch(`/api/levels/${encodeURIComponent(id)}`);
    if (r.ok) { const d = await r.json(); if (d.level) return d.level as BaseLevel; }
  } catch { /* ignore */ }
  return undefined;
}
