import type { GateLevel } from "@shared/gateTypes";

/** Level 3 — Three Doors (Russian colors). GATE engine (32/35). Say the door's color to pass. */
export const threeDoors1: GateLevel = {
  id: "three-doors-1",
  engine: "gate",
  title: "Три двери",
  lang: "russian",
  theme: "castle",
  source: "handmade",
  status: "approved",
  vocab: ["красный", "синий", "жёлтый", "зелёный"],
  words: ["красный", "синий", "жёлтый", "зелёный"],
  gatesPerScreen: 3,
  choices: [
    { id: "red", word: "красный", emoji: "🔴", color: "#e23b3b" },
    { id: "blue", word: "синий", emoji: "🔵", color: "#3b82f6" },
    { id: "yellow", word: "жёлтый", emoji: "🟡", color: "#eab308" },
    { id: "green", word: "зелёный", emoji: "🟢", color: "#22c55e" },
  ],
  tuning: { decideSec: 3.5 },
  win: { gatesToClear: 10 },
};
