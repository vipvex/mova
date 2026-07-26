/** ffmpeg helpers for anim videos — chroma-key green → transparent WebM. */
import { spawn } from "child_process";
import { promises as fsp } from "fs";
import os from "os";
import path from "path";
import { ANIM_CHROMA, MAX_SPRITE_FRAMES } from "@shared/animCatalog";

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += String(d); });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${err.slice(-600)}`));
    });
  });
}

/** Convert #RRGGBB → 0xRRGGBB for ffmpeg chromakey. */
function chromaHex(): string {
  return `0x${ANIM_CHROMA.replace("#", "").toUpperCase()}`;
}

/**
 * Remove solid green plate → VP9 WebM with alpha (yuva420p).
 * similarity/blend tuned for flat #00FF00 generation plates.
 */
export async function chromaKeyToWebm(
  input: Buffer,
  opts?: { similarity?: number; blend?: number },
): Promise<Buffer> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "mova-vid-"));
  const inPath = path.join(dir, "in.mp4");
  const outPath = path.join(dir, "out.webm");
  try {
    await fsp.writeFile(inPath, input);
    const similarity = opts?.similarity ?? 0.18;
    const blend = opts?.blend ?? 0.08;
    // chromakey=color:similarity:blend — make green transparent, keep character.
    await run("ffmpeg", [
      "-y", "-i", inPath,
      "-vf", `chromakey=${chromaHex()}:${similarity}:${blend}`,
      "-c:v", "libvpx-vp9",
      "-pix_fmt", "yuva420p",
      "-auto-alt-ref", "0",
      "-b:v", "0",
      "-crf", "32",
      "-an",
      outPath,
    ]);
    return await fsp.readFile(outPath);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Extract N evenly spaced PNG frames from a video (honors start/end trim).
 * fps is derived so we land ~`count` frames across the trimmed window.
 */
export async function extractVideoFrames(
  input: Buffer,
  opts: { count: number; startSec?: number; endSec?: number },
): Promise<Buffer[]> {
  const count = Math.max(2, Math.min(MAX_SPRITE_FRAMES, Math.floor(opts.count) || 12));
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "mova-frames-"));
  const inPath = path.join(dir, "in.bin");
  const pattern = path.join(dir, "f_%03d.png");
  try {
    await fsp.writeFile(inPath, input);
    const start = Math.max(0, opts.startSec || 0);
    const end = opts.endSec && opts.endSec > start ? opts.endSec : undefined;
    const probed = await probeDurationSec(input);
    const dur = end != null ? (end - start) : Math.max(0.25, (probed || 4) - start);
    const fps = Math.max(0.5, count / dur);
    // Force rgba so alpha from keyed WebM (yuva420p) survives as PNG transparency.
    // Without this, transparent green pixels often bake back into opaque green RGB.
    await run("ffmpeg", [
      "-y",
      ...(start > 0 ? ["-ss", String(start)] : []),
      "-i", inPath,
      ...(end != null ? ["-to", String(end)] : []),
      "-vf", `fps=${fps},format=rgba`,
      "-frames:v", String(count),
      pattern,
    ]);
    const files = (await fsp.readdir(dir)).filter((f) => f.startsWith("f_") && f.endsWith(".png")).sort();
    const frames: Buffer[] = [];
    for (const f of files.slice(0, count)) {
      frames.push(await fsp.readFile(path.join(dir, f)));
    }
    if (frames.length < 2) throw new Error(`extracted only ${frames.length} frame(s)`);
    return frames;
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Probe duration in seconds (best-effort). */
export async function probeDurationSec(input: Buffer): Promise<number | null> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "mova-probe-"));
  const inPath = path.join(dir, "in.bin");
  try {
    await fsp.writeFile(inPath, input);
    const out = await new Promise<string>((resolve, reject) => {
      const p = spawn("ffprobe", [
        "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", inPath,
      ], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      p.stdout.on("data", (d) => { stdout += String(d); });
      p.on("error", reject);
      p.on("close", (code) => (code === 0 ? resolve(stdout.trim()) : reject(new Error("ffprobe failed"))));
    });
    const n = parseFloat(out);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
