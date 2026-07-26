/**
 * Factory level store — JSON file on disk (the factory runs locally on Alex's Mac,
 * same as the ASR server). Approved levels feed the world map; drafts feed the
 * review portal. Can move to Postgres later; the API shape stays the same.
 */
import { promises as fs } from "fs";
import path from "path";
import type { JudgeScores, StoredLevel } from "@shared/gameTypes";

export type { JudgeScores, StoredLevel };

const DATA_DIR = path.resolve(import.meta.dirname, "data");
const FILE = path.join(DATA_DIR, "game-levels.json");

async function readAll(): Promise<StoredLevel[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeAll(levels: StoredLevel[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(levels, null, 2), "utf8");
}

export const gameLevels = {
  async all() { return readAll(); },
  async approved() { return (await readAll()).filter((l) => l.status === "approved"); },
  async drafts() { return (await readAll()).filter((l) => l.status === "draft"); },
  async get(id: string) { return (await readAll()).find((l) => l.id === id); },

  async upsert(level: StoredLevel) {
    const all = await readAll();
    const i = all.findIndex((l) => l.id === level.id);
    if (i >= 0) all[i] = level; else all.push(level);
    await writeAll(all);
    return level;
  },

  async setStatus(id: string, status: StoredLevel["status"], comment?: string) {
    const all = await readAll();
    const l = all.find((x) => x.id === id);
    if (!l) return undefined;
    l.status = status;
    if (comment !== undefined) l.comment = comment;
    await writeAll(all);
    return l;
  },

  async remove(id: string) {
    const all = await readAll();
    const next = all.filter((l) => l.id !== id);
    await writeAll(next);
    return next.length !== all.length;
  },
};
