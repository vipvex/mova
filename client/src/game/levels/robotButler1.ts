import type { CommanderLevel } from "@shared/commanderTypes";

/** Level 5 — Robot Butler (Russian commands). COMMANDER engine (33/35). Command the robot to the gift. */
export const robotButler1: CommanderLevel = {
  id: "robot-butler-1",
  engine: "commander",
  title: "Робот-слуга",
  lang: "russian",
  theme: "lab",
  source: "handmade",
  status: "approved",
  vocab: ["иди", "возьми", "открой", "нажми"],
  words: ["иди", "возьми", "открой", "нажми"],
  goalEmoji: "🎁",
  steps: [
    { word: "иди", emoji: "🚶", action: "walk" },
    { word: "возьми", emoji: "🔑", action: "grab" },
    { word: "иди", emoji: "🚶", action: "walk" },
    { word: "открой", emoji: "🚪", action: "open" },
    { word: "нажми", emoji: "🔘", action: "press" },
    { word: "иди", emoji: "🚶", action: "walk" },
  ],
  win: { steps: 6 },
};
