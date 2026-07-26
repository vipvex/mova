/** Game sprite manifest: logical asset key → S3 url. Assets are generated in the
 *  chosen house art style and served same-origin (proxy) so Phaser/WebGL can texture them.
 *
 *  Writes are serialized — concurrent setAsset (e.g. parallel extract-sprites) used to
 *  clobber the JSON file via read-modify-write races. */
import { promises as fs } from "fs";
import path from "path";

const FILE = path.resolve(import.meta.dirname, "data", "game-assets.json");
const HFILE = path.resolve(import.meta.dirname, "data", "game-asset-history.json");

let writeChain: Promise<void> = Promise.resolve();

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(() => undefined, () => undefined);
  return run;
}

export async function getAssets(): Promise<Record<string, string>> {
  try { return JSON.parse(await fs.readFile(FILE, "utf8")); } catch { return {}; }
}

export async function setAsset(key: string, url: string): Promise<void> {
  await enqueueWrite(async () => {
    const all = await getAssets();
    all[key] = url;
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(all, null, 2), "utf8");
  });
}

/** Atomically set many keys (one read + one write) — used by recover / bulk ops. */
export async function setAssetsBulk(entries: Record<string, string>): Promise<void> {
  await enqueueWrite(async () => {
    const all = await getAssets();
    Object.assign(all, entries);
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(all, null, 2), "utf8");
  });
}

export async function deleteAsset(key: string): Promise<boolean> {
  return enqueueWrite(async () => {
    const all = await getAssets();
    if (!(key in all)) return false;
    delete all[key];
    await fs.writeFile(FILE, JSON.stringify(all, null, 2), "utf8");
    return true;
  });
}

// ── Version history ─────────────────────────────────────────────────────────
// Every generation is kept under its own version key so past gens aren't lost and
// the best one per frame can be picked in the Studio. `current` is the selected
// version that the game + manifest[key] point to.
export type AssetHistory = Record<string, { current: string; versions: Array<{ key: string; ts: number }> }>;

export async function getHistory(): Promise<AssetHistory> {
  try { return JSON.parse(await fs.readFile(HFILE, "utf8")); } catch { return {}; }
}
async function saveHistory(h: AssetHistory): Promise<void> {
  await fs.mkdir(path.dirname(HFILE), { recursive: true });
  await fs.writeFile(HFILE, JSON.stringify(h, null, 2), "utf8");
}

/** Append a new version for a logical key and make it current. */
export async function addAssetVersion(key: string, versionKey: string, ts: number): Promise<void> {
  await enqueueWrite(async () => {
    const h = await getHistory();
    const e = h[key] || { current: "", versions: [] };
    if (!e.versions.some((v) => v.key === versionKey)) e.versions.push({ key: versionKey, ts });
    e.current = versionKey;
    h[key] = e;
    await saveHistory(h);
  });
}

/** Point a logical key's `current` at an existing version (for picking the best one). */
export async function setCurrentVersion(key: string, versionKey: string): Promise<boolean> {
  return enqueueWrite(async () => {
    const h = await getHistory();
    if (!h[key] || !h[key].versions.some((v) => v.key === versionKey)) return false;
    h[key].current = versionKey;
    await saveHistory(h);
    return true;
  });
}

/** Drop a single version from history (does not delete the S3 object). */
export async function deleteAssetVersion(key: string, versionKey: string): Promise<void> {
  await enqueueWrite(async () => {
    const h = await getHistory();
    if (!h[key]) return;
    h[key].versions = h[key].versions.filter((v) => v.key !== versionKey);
    await saveHistory(h);
  });
}
