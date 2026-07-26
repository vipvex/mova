/**
 * Telemetry sink — the seed of the word-state machine (per-utterance + per-level events).
 * Appends JSONL locally for now (factory runs on Alex's Mac). Swapping the sink to
 * Postgres/Drizzle later is a one-function change; the /api/telemetry contract stays.
 */
import { promises as fs } from "fs";
import path from "path";

const DIR = path.resolve(import.meta.dirname, "data");
const FILE = path.join(DIR, "telemetry.jsonl");

export async function appendEvent(e: Record<string, unknown>): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  await fs.appendFile(FILE, JSON.stringify({ ...e, ts: new Date().toISOString() }) + "\n", "utf8");
}

export async function readEvents(limit = 1000): Promise<any[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines.slice(-limit).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

/** Per-word first-try success + latency — what the word-state machine will consume. */
export async function wordStats(): Promise<Record<string, { attempts: number; accepted: number; avgLatencyMs: number }>> {
  const events = await readEvents(5000);
  const acc: Record<string, { attempts: number; accepted: number; lat: number[] }> = {};
  for (const e of events) {
    if (e.type !== "utterance" || !e.word) continue;
    const w = (acc[e.word] ||= { attempts: 0, accepted: 0, lat: [] });
    w.attempts++; if (e.accepted) w.accepted++;
    if (typeof e.latencyMs === "number") w.lat.push(e.latencyMs);
  }
  const out: Record<string, { attempts: number; accepted: number; avgLatencyMs: number }> = {};
  for (const [word, w] of Object.entries(acc)) {
    out[word] = { attempts: w.attempts, accepted: w.accepted, avgLatencyMs: w.lat.length ? Math.round(w.lat.reduce((a, b) => a + b, 0) / w.lat.length) : 0 };
  }
  return out;
}
