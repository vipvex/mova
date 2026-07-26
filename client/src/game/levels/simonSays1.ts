import type { ListenerLevel } from "@shared/listenerTypes";

/** Level 4 — Simon Says (Russian). LISTENER engine (33/35). Voice-rest: obey the d-pad only when "Саймон говорит". */
export const simonSays1: ListenerLevel = {
  id: "simon-says-1",
  engine: "listener",
  title: "Саймон говорит",
  lang: "russian",
  theme: "playroom",
  source: "handmade",
  status: "approved",
  voiceRest: true,
  vocab: ["прыгай", "садись", "налево", "направо"],
  words: [], // voice-rest: no ASR grammar
  simonPhrase: "Саймон говорит",
  commands: [
    { action: "jump", phrase: "прыгай", keys: ["ArrowUp", " ", "w"], emoji: "⬆️" },
    { action: "sit", phrase: "садись", keys: ["ArrowDown", "s"], emoji: "⬇️" },
    { action: "left", phrase: "налево", keys: ["ArrowLeft", "a"], emoji: "⬅️" },
    { action: "right", phrase: "направо", keys: ["ArrowRight", "d"], emoji: "➡️" },
  ],
  tuning: { windowSec: 2.2 },
  win: { rounds: 12 },
};
