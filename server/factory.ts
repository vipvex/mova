/**
 * The nightly factory. Generates level CONTENT on top of hand-built engines
 * (never new mechanics — playable by construction). Pipeline:
 *   generate (Claude) → zod-validate → structural self-playtest → judge (Claude) → store draft
 *
 * Design laws (baked into prompts + judge): the spoken word IS the action button;
 * voice = controller not quiz gate; urgency creates speech; fail is funny, retry instant;
 * difficulty via speed/complexity not harder-vocab walls. Mute Test M<=2 = AUTO-REJECT.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { gameLevels, type StoredLevel, type JudgeScores } from "./gameLevels";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const GEN_MODEL = process.env.FACTORY_MODEL || "claude-sonnet-5";

// ── engine config schemas (validate STRUCTURE; numbers get clamped, not rejected) ──
const runnerConfig = z.object({
  theme: z.string().optional(),
  actions: z.array(z.object({
    id: z.string(), word: z.string(), emoji: z.string(),
    keys: z.array(z.string()).optional(),
    motion: z.enum(["jump", "duck", "none"]),
  })).min(1).max(4),
  obstacles: z.array(z.object({ action: z.string(), emoji: z.string().optional() })).optional(),
  tuning: z.object({
    scrollPxPerSec: z.number(), rampPerClear: z.number(),
    spawnGapSec: z.number(), actionWindowSec: z.number(),
  }),
  win: z.object({ obstaclesToClear: z.number() }),
});

const catcherConfig = z.object({
  theme: z.string().optional(),
  items: z.array(z.object({ id: z.string(), word: z.string(), emoji: z.string() })).min(3).max(8),
  showLabels: z.boolean().optional(),
  tuning: z.object({ fallPxPerSec: z.number(), rampPerCatch: z.number(), spawnGapSec: z.number() }),
  win: z.object({ itemsToCatch: z.number() }),
});

const gateConfig = z.object({
  theme: z.string().optional(),
  choices: z.array(z.object({ id: z.string(), word: z.string(), emoji: z.string(), color: z.string().optional() })).min(3).max(6),
  gatesPerScreen: z.number().optional(),
  tuning: z.object({ decideSec: z.number() }),
  win: z.object({ gatesToClear: z.number() }),
});

const ENGINE_SCHEMAS: Record<string, z.ZodTypeAny> = { runner: runnerConfig, catcher: catcherConfig, gate: gateConfig };

const clamp = (n: number, lo: number, hi: number, dflt: number) =>
  (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt);

/** Coerce model-chosen numbers into playable bounds — playable by construction. */
function normalizeConfig(engine: string, c: any): any {
  if (engine === "runner") {
    c.tuning.scrollPxPerSec = clamp(c.tuning.scrollPxPerSec, 120, 420, 240);
    c.tuning.rampPerClear = clamp(c.tuning.rampPerClear, 0, 20, 8);
    c.tuning.spawnGapSec = clamp(c.tuning.spawnGapSec, 1.6, 3.5, 2.4);
    c.tuning.actionWindowSec = clamp(c.tuning.actionWindowSec, 0.4, 1.0, 0.55);
    c.win.obstaclesToClear = Math.round(clamp(c.win.obstaclesToClear, 8, 20, 12));
    for (const a of c.actions) if (!a.keys) a.keys = a.motion === "duck" ? ["ArrowDown"] : [" ", "ArrowUp"];
  } else if (engine === "catcher") {
    c.tuning.fallPxPerSec = clamp(c.tuning.fallPxPerSec, 110, 300, 150);
    c.tuning.rampPerCatch = clamp(c.tuning.rampPerCatch, 0, 16, 6);
    c.tuning.spawnGapSec = clamp(c.tuning.spawnGapSec, 1.6, 3.2, 2.2);
    c.win.itemsToCatch = Math.round(clamp(c.win.itemsToCatch, 8, 16, 12));
    if (c.showLabels === undefined) c.showLabels = true;
  } else if (engine === "gate") {
    c.tuning.decideSec = clamp(c.tuning.decideSec, 2.5, 5, 3.5);
    c.gatesPerScreen = Math.round(clamp(c.gatesPerScreen ?? 3, 2, Math.min(4, c.choices.length), 3));
    c.win.gatesToClear = Math.round(clamp(c.win.gatesToClear, 8, 16, 10));
  }
  return c;
}

export interface CurriculumSpec {
  engine: "runner" | "catcher" | "gate";
  lang: "russian" | "spanish";
  title?: string;
  theme?: string;
  vocabDomain: string;          // e.g. "food nouns", "action verbs: jump/duck/run"
  difficulty?: "easy" | "medium" | "hard";
  iterationComment?: string;    // Alex's review comment from a prior night
}

const DESIGN_LAWS = `MOVA design laws (every level MUST pass):
1. Mute Test: fun even in her native language. Speaking is the BUTTON, not a quiz gate.
2. Voice = controller. Urgency (speed/timers) creates speech.
3. Fail is funny, retry is instant. Difficulty scales via SPEED, never harder-vocab walls.
4. Tiny per-moment vocab (constrained ASR grammar). All-ages content only.`;

const ENGINE_BRIEFS: Record<string, string> = {
  runner: `RUNNER: side-scroller; each obstacle telegraphs a verb the child SAYS to act (jump/duck).
Config fields: theme, actions[{id,word,emoji,motion:jump|duck|none}], optional obstacles[{action,emoji}],
tuning{scrollPxPerSec,rampPerClear,spawnGapSec,actionWindowSec}, win{obstaclesToClear}.
Use 2-3 distinct action verbs. Emojis represent the obstacle (log=jump, kite/bird=duck).`,
  catcher: `CATCHER: items fall; the child SAYS the item's name to catch it before it splats. Teaches nouns at speed.
Config fields: theme, items[{id,word,emoji}], showLabels(bool), tuning{fallPxPerSec,rampPerCatch,spawnGapSec}, win{itemsToCatch}.
Use 4-6 nameable items. Emoji must clearly depict each noun.`,
  gate: `GATE: a wall of doors; the child SAYS the descriptor of the target door to pass through it. Teaches adjectives/colors/sizes/antonyms.
Config fields: theme, choices[{id,word,emoji,color(hex)}], gatesPerScreen(2-4), tuning{decideSec}, win{gatesToClear}.
Use 3-6 distinct descriptors (e.g. colors, sizes, or antonym pairs). color = a hex tint for that door. Emoji should echo the descriptor.`,
};

// Tool-based structured output: force the model to "call" a tool whose input IS
// the config we want. Guaranteed structured object — no JSON-string parsing.
const TOOL_INPUT: Record<string, any> = {
  runner: {
    type: "object",
    properties: {
      theme: { type: "string" },
      actions: { type: "array", items: { type: "object", properties: {
        id: { type: "string" }, word: { type: "string" }, emoji: { type: "string" },
        motion: { type: "string", enum: ["jump", "duck", "none"] },
      }, required: ["id", "word", "emoji", "motion"] } },
      obstacles: { type: "array", items: { type: "object", properties: {
        action: { type: "string" }, emoji: { type: "string" } }, required: ["action"] } },
      tuning: { type: "object", properties: {
        scrollPxPerSec: { type: "number" }, rampPerClear: { type: "number" },
        spawnGapSec: { type: "number" }, actionWindowSec: { type: "number" },
      }, required: ["scrollPxPerSec", "rampPerClear", "spawnGapSec", "actionWindowSec"] },
      win: { type: "object", properties: { obstaclesToClear: { type: "number" } }, required: ["obstaclesToClear"] },
    },
    required: ["actions", "tuning", "win"],
  },
  catcher: {
    type: "object",
    properties: {
      theme: { type: "string" },
      items: { type: "array", items: { type: "object", properties: {
        id: { type: "string" }, word: { type: "string" }, emoji: { type: "string" } },
        required: ["id", "word", "emoji"] } },
      showLabels: { type: "boolean" },
      tuning: { type: "object", properties: {
        fallPxPerSec: { type: "number" }, rampPerCatch: { type: "number" }, spawnGapSec: { type: "number" },
      }, required: ["fallPxPerSec", "rampPerCatch", "spawnGapSec"] },
      win: { type: "object", properties: { itemsToCatch: { type: "number" } }, required: ["itemsToCatch"] },
    },
    required: ["items", "tuning", "win"],
  },
  gate: {
    type: "object",
    properties: {
      theme: { type: "string" },
      choices: { type: "array", items: { type: "object", properties: {
        id: { type: "string" }, word: { type: "string" }, emoji: { type: "string" }, color: { type: "string" } },
        required: ["id", "word", "emoji"] } },
      gatesPerScreen: { type: "number" },
      tuning: { type: "object", properties: { decideSec: { type: "number" } }, required: ["decideSec"] },
      win: { type: "object", properties: { gatesToClear: { type: "number" } }, required: ["gatesToClear"] },
    },
    required: ["choices", "tuning", "win"],
  },
};

const JUDGE_INPUT = {
  type: "object",
  properties: {
    M: { type: "number" }, V: { type: "number" }, T: { type: "number" }, B: { type: "number" },
    R: { type: "number" }, L: { type: "number" }, A: { type: "number" }, notes: { type: "string" },
  },
  required: ["M", "V", "T", "B", "R", "L", "A"],
};

async function callTool(system: string, user: string, name: string, inputSchema: any): Promise<any> {
  const msg = await anthropic.messages.create({
    model: GEN_MODEL, max_tokens: 2000, system,
    tools: [{ name, description: `Emit the ${name} object.`, input_schema: inputSchema }],
    tool_choice: { type: "tool", name },
    messages: [{ role: "user", content: user }],
  });
  const block = msg.content.find((c: any) => c.type === "tool_use");
  if (!block) throw new Error("model did not call the tool");
  return (block as any).input;
}

// ── generate ───────────────────────────────────────────────────────────────
export async function generateConfig(spec: CurriculumSpec): Promise<any> {
  const schema = ENGINE_SCHEMAS[spec.engine];
  const system = `You design levels for MOVA, a voice-first language game for a 6-year-old.
${DESIGN_LAWS}

Engine you are writing for —
${ENGINE_BRIEFS[spec.engine]}

Output ONLY a JSON object for the engine config (no prose, no markdown fences). ${spec.lang === "russian" ? "Words in Russian (Cyrillic)." : "Words in Spanish."}
Use FULL, standard dictionary words a child actually learns — proper imperative verbs (прыгай, ныряй, беги) and real nouns, NOT clipped baby-talk (not "прыг"). Words must be real, common, and ASR-decodable.
Difficulty comes from SPEED, never obscure vocabulary. Keep tuning moderate (easy = slower scroll, bigger action window).`;

  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const user = `Make a ${spec.difficulty || "easy"} ${spec.engine} level.
Vocabulary domain: ${spec.vocabDomain}.
${spec.theme ? `Theme: ${spec.theme}.` : ""}
${spec.iterationComment ? `IMPROVE per this feedback from the reviewer: "${spec.iterationComment}".` : ""}
${lastErr ? `Your previous attempt was INVALID: ${lastErr}. Fix it.` : ""}`;
    try {
      const input = await callTool(system, user, `emit_${spec.engine}_level`, TOOL_INPUT[spec.engine]);
      const parsed = schema.parse(input);
      return normalizeConfig(spec.engine, parsed);
    } catch (e: any) {
      lastErr = e?.message?.slice(0, 300) || String(e);
    }
  }
  throw new Error(`generation failed after retries: ${lastErr}`);
}

// ── structural self-playtest (playable by construction) ─────────────────────
export function selfPlaytest(engine: string, config: any): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (engine === "runner") {
    const ids = new Set(config.actions.map((a: any) => a.id));
    for (const a of config.actions) if (!a.word?.trim()) issues.push(`action ${a.id} missing word`);
    for (const o of config.obstacles || []) if (!ids.has(o.action)) issues.push(`obstacle references unknown action ${o.action}`);
    if (config.win.obstaclesToClear < config.actions.length) issues.push("too few obstacles to showcase all verbs");
  } else if (engine === "catcher") {
    const words = new Set(config.items.map((i: any) => i.word));
    if (words.size !== config.items.length) issues.push("duplicate item words (ambiguous ASR)");
    for (const i of config.items) if (!i.emoji?.trim()) issues.push(`item ${i.id} missing emoji`);
  } else if (engine === "gate") {
    const words = new Set(config.choices.map((c: any) => c.word));
    if (words.size !== config.choices.length) issues.push("duplicate door words (ambiguous choice)");
    for (const c of config.choices) if (!c.word?.trim()) issues.push(`choice ${c.id} missing word`);
    if ((config.gatesPerScreen ?? 3) > config.choices.length) issues.push("gatesPerScreen exceeds choices");
  }
  return { ok: issues.length === 0, issues };
}

// ── judge (7-criterion rubric) ──────────────────────────────────────────────
export async function judge(engine: string, config: any): Promise<JudgeScores> {
  const system = `You are the strict quality judge for MOVA levels.
${DESIGN_LAWS}
Score 1-5 each: M(Mute Test) V(Voice-as-Controller) T(Templateability) B(Buildability) R(Repetition Tolerance) L(Learning Density) A(ASR Reliability).
HARD RULE: if M<=2, the level is REJECTED regardless of total.
Return ONLY JSON: {"M":n,"V":n,"T":n,"B":n,"R":n,"L":n,"A":n,"notes":"one line"}.`;
  const user = `Engine: ${engine}\nLevel config:\n${JSON.stringify(config)}`;
  const s = await callTool(system, user, "score_level", JUDGE_INPUT);
  const total = ["M", "V", "T", "B", "R", "L", "A"].reduce((n, k) => n + (Number(s[k]) || 0), 0);
  let tier: JudgeScores["tier"];
  if ((Number(s.M) || 0) <= 2) tier = "reject";
  else if (total >= 30) tier = "S";
  else if (total >= 27) tier = "A";
  else if (total >= 23) tier = "B";
  else tier = "C";
  return { M: s.M, V: s.V, T: s.T, B: s.B, R: s.R, L: s.L, A: s.A, total, tier, notes: s.notes };
}

// ── orchestrate: one level, end to end ──────────────────────────────────────
export async function runFactory(spec: CurriculumSpec, seq = 0): Promise<StoredLevel> {
  const config = await generateConfig(spec);
  const test = selfPlaytest(spec.engine, config);
  if (!test.ok) throw new Error(`self-playtest failed: ${test.issues.join("; ")}`);

  const scores = await judge(spec.engine, config);
  const words: string[] = spec.engine === "runner"
    ? config.actions.map((a: any) => a.word)
    : spec.engine === "catcher"
      ? config.items.map((i: any) => i.word)
      : config.choices.map((c: any) => c.word);

  const stamp = Date.now();
  const id = `${spec.engine}-${slug(spec.vocabDomain)}-${stamp}-${seq}`;
  const stored: StoredLevel = {
    id, engine: spec.engine,
    title: spec.title || config.theme || `${spec.engine} · ${spec.vocabDomain}`,
    lang: spec.lang,
    status: scores.tier === "reject" ? "rejected" : "draft",
    source: "factory",
    vocab: words, words,
    createdAt: new Date(stamp).toISOString(),
    scores,
    config: { ...config, id, engine: spec.engine, title: spec.title || config.theme || spec.vocabDomain,
      lang: spec.lang, source: "factory", status: "draft", vocab: words, words },
  };
  await gameLevels.upsert(stored);
  return stored;
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9а-я]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 24);
}
