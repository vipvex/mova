/** Style examples cache + persisted house style / favorites for Game Studio gens. */
import { promises as fs } from "fs";
import path from "path";

const EXAMPLES_FILE = path.resolve(import.meta.dirname, "data", "style-examples.json");
const HOUSE_FILE = path.resolve(import.meta.dirname, "data", "house-style.json");

const DEFAULT_ACTIVE = "flat-vector";

interface HouseStyleState {
  activeStyleId: string;
  favoriteIds: string[];
}

async function readHouse(): Promise<HouseStyleState> {
  try {
    const raw = JSON.parse(await fs.readFile(HOUSE_FILE, "utf8"));
    return {
      activeStyleId: typeof raw.activeStyleId === "string" ? raw.activeStyleId : DEFAULT_ACTIVE,
      favoriteIds: Array.isArray(raw.favoriteIds) ? raw.favoriteIds.filter((x: unknown) => typeof x === "string") : [],
    };
  } catch {
    return { activeStyleId: DEFAULT_ACTIVE, favoriteIds: [] };
  }
}

async function writeHouse(state: HouseStyleState): Promise<void> {
  await fs.mkdir(path.dirname(HOUSE_FILE), { recursive: true });
  await fs.writeFile(HOUSE_FILE, JSON.stringify(state, null, 2), "utf8");
}

export async function getExamples(): Promise<Record<string, string>> {
  try { return JSON.parse(await fs.readFile(EXAMPLES_FILE, "utf8")); } catch { return {}; }
}

export async function setExample(id: string, url: string): Promise<void> {
  const all = await getExamples();
  all[id] = url;
  await fs.mkdir(path.dirname(EXAMPLES_FILE), { recursive: true });
  await fs.writeFile(EXAMPLES_FILE, JSON.stringify(all, null, 2), "utf8");
}

export async function getActiveStyleId(): Promise<string> {
  return (await readHouse()).activeStyleId || DEFAULT_ACTIVE;
}

export async function setActiveStyleId(id: string): Promise<string> {
  const state = await readHouse();
  state.activeStyleId = id;
  await writeHouse(state);
  return state.activeStyleId;
}

export async function getFavoriteIds(): Promise<string[]> {
  return (await readHouse()).favoriteIds;
}

export async function toggleFavorite(id: string): Promise<string[]> {
  const state = await readHouse();
  const set = new Set(state.favoriteIds);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  state.favoriteIds = Array.from(set);
  await writeHouse(state);
  return state.favoriteIds;
}
