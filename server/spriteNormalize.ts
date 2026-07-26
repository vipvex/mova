/** Deterministic sprite normalization — the model-agnostic anti-jitter step.
 *  Every AI frame arrives at a slightly different position/scale with a different
 *  alpha bounding box, so swapping raw textures makes the character wobble. Here we:
 *    1. find the tight alpha bounding box (ignoring faint glow via a threshold),
 *    2. scale by CONTENT HEIGHT so the character is the same size every frame,
 *    3. paste onto a fixed square cell so a chosen pivot (feet for characters,
 *       center for objects) lands on the SAME pixel every frame.
 *  Pivot is baked into pixels because Phaser ignores atlas pivots during animation. */
import sharp from "sharp";

export interface CellSpec {
  cell: number;            // output square cell size (px)
  pivotX: number;          // 0..1 target pivot X inside cell
  pivotY: number;          // 0..1 target pivot Y inside cell (feet≈0.9, center=0.5)
  contentScale?: number;   // fraction of cell the content HEIGHT should fill
  alphaThreshold?: number; // alpha <= this counts as empty (trims faint glow halo)
}

export const CHARACTER_SPEC: CellSpec = { cell: 768, pivotX: 0.5, pivotY: 0.9, contentScale: 0.86, alphaThreshold: 24 };
export const OBJECT_SPEC: CellSpec = { cell: 768, pivotX: 0.5, pivotY: 0.5, contentScale: 0.8, alphaThreshold: 24 };

export interface FrameStat { w: number; h: number; pivotX: number; pivotY: number; empty: boolean; }

function alphaBBox(data: Buffer, w: number, h: number, thr: number) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] > thr) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Normalize one frame → { png, stat }. Fully transparent input yields an empty cell. */
export async function normalizeFrame(input: Buffer, spec: CellSpec): Promise<{ png: Buffer; stat: FrameStat }> {
  const { cell, pivotX, pivotY, contentScale = 0.86, alphaThreshold = 24 } = spec;
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const box = alphaBBox(data, info.width, info.height, alphaThreshold);

  const emptyCell = () => sharp({ create: { width: cell, height: cell, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png();
  if (!box) return { png: await emptyCell().toBuffer(), stat: { w: 0, h: 0, pivotX: cell * pivotX, pivotY: cell * pivotY, empty: true } };

  // scale by HEIGHT → constant body size across a clip (kills the size-pulse),
  // but clamp so a very wide pose (e.g. a running stride) still fits the cell width.
  const targetH = Math.round(cell * contentScale);
  let scale = targetH / box.height;
  const maxW = cell * 0.98;
  if (box.width * scale > maxW) scale = maxW / box.width;
  const newW = Math.max(1, Math.round(box.width * scale));
  const newH = Math.max(1, Math.round(box.height * scale));

  const cropped = await sharp(input).ensureAlpha()
    .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
    .resize(newW, newH, { fit: "fill", kernel: "lanczos3" })
    .png().toBuffer();

  // place the content's bottom-center (feet) at the cell's pivot pixel
  const left = Math.round(cell * pivotX - newW / 2);
  const top = Math.round(cell * pivotY - newH);

  const png = await sharp({ create: { width: cell, height: cell, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: cropped, left, top }])
    .png().toBuffer();

  return { png, stat: { w: newW, h: newH, pivotX: cell * pivotX, pivotY: cell * pivotY, empty: false } };
}

/** Chroma-key a green-screen render to transparency. Flat-vector sprites contain no
 *  green, so a global key (not flood-fill) is safe and gives cleaner edges than ML
 *  matting. "Greenness" = G − max(R,B): high = background, low = subject; a soft band
 *  antialiases the edge, and green spill on kept pixels is suppressed to kill fringing. */
export async function chromaKeyGreen(input: Buffer, opt?: { low?: number; high?: number }): Promise<Buffer> {
  // Tuned for AI video plates: pure #00FF00 and slightly muddy greens (e.g. 12,201,5).
  const low = opt?.low ?? 18, high = opt?.high ?? 70;
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const srcA = data[i + 3];
    const greenness = g - Math.max(r, b);
    // Also catch near-neon greens where R/B aren't zero but G dominates.
    const neon = g >= 160 && g >= r * 1.6 && g >= b * 1.6;
    let keyed = 255;
    if (greenness >= high || (neon && greenness >= low)) keyed = 0;
    else if (greenness > low) keyed = Math.round(255 * (1 - (greenness - low) / (high - low)));
    // Multiply with source alpha so already-transparent WebM pixels stay gone,
    // while opaque green plates (ffmpeg dropped alpha) still key out.
    const alpha = Math.round((srcA * keyed) / 255);
    if (alpha > 0) { const cap = (r + b) / 2; if (g > cap) data[i + 1] = cap; } // spill suppression
    data[i + 3] = alpha;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

/** Fraction of opaque pixels that still look like a green plate (0..1). */
export async function measureGreenPlate(input: Buffer): Promise<number> {
  const { data } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaque = 0, green = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;
    opaque++;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (g - Math.max(r, b) > 26 && g >= 140) green++;
  }
  return opaque ? green / opaque : 0;
}

/**
 * Strip a near-white OUTER stroke / halo only.
 *
 * Critical: only touches white pixels that sit on the silhouette edge (adjacent to
 * already-transparent pixels), within `maxDepth` pixels of transparency. Interior
 * whites (chef hat, pants, eyes) are left alone — a global white-key punched holes
 * through Athena's clothing.
 */
export async function stripWhiteOutline(
  input: Buffer,
  opt?: { minLuma?: number; maxChroma?: number; maxDepth?: number },
): Promise<Buffer> {
  const minLuma = opt?.minLuma ?? 242;
  const maxChroma = opt?.maxChroma ?? 22;
  const maxDepth = opt?.maxDepth ?? 2;
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const n = w * h;

  const isWhite = (i: number) => {
    const o = i * 4;
    if (data[o + 3] < 8) return false;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    return luma >= minLuma && chroma <= maxChroma;
  };

  // Distance from nearest already-transparent pixel. Only those seed the flood —
  // never strip interior whites (hat / pants / eyes).
  const dist = new Uint8Array(n);
  dist.fill(255);
  const q: number[] = [];
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] < 8) { dist[i] = 0; q.push(i); }
  }

  let head = 0;
  while (head < q.length) {
    const i = q[head++];
    const d = dist[i];
    if (d >= maxDepth) continue;
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      const nd = d + 1;
      if (nd < dist[ni]) { dist[ni] = nd; q.push(ni); }
    }
  }

  for (let i = 0; i < n; i++) {
    if (dist[i] === 0 || dist[i] > maxDepth) continue;
    if (!isWhite(i)) continue;
    // Soften the outermost ring more than the inner ring.
    const t = 1 - (dist[i] - 1) / Math.max(1, maxDepth);
    data[i * 4 + 3] = Math.round(data[i * 4 + 3] * (1 - t));
  }

  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

/** Slice a pose-sheet into cols×rows equal cells (left-to-right, top-to-bottom).
 *  Each cell is later normalized, so uneven content within a cell self-corrects. */
export async function sliceSheet(sheet: Buffer, cols: number, rows: number): Promise<Buffer[]> {
  const meta = await sharp(sheet).metadata();
  const W = meta.width || 0, H = meta.height || 0;
  const cw = Math.floor(W / cols), ch = Math.floor(H / rows);
  const out: Buffer[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    out.push(await sharp(sheet).extract({ left: c * cw, top: r * ch, width: cw, height: ch }).png().toBuffer());
  }
  return out;
}

/** Group a boolean occupancy array into segments, bridging gaps < minGap and
 *  dropping segments < minSize. Used to find figures by their transparent gaps. */
function segments(has: boolean[], minGap: number, minSize: number): Array<{ start: number; end: number }> {
  const raw: Array<{ start: number; end: number }> = [];
  let s = -1;
  for (let i = 0; i < has.length; i++) {
    if (has[i] && s < 0) s = i;
    else if (!has[i] && s >= 0) { raw.push({ start: s, end: i - 1 }); s = -1; }
  }
  if (s >= 0) raw.push({ start: s, end: has.length - 1 });
  // bridge small gaps
  const merged: Array<{ start: number; end: number }> = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last && seg.start - last.end - 1 < minGap) last.end = seg.end;
    else merged.push({ ...seg });
  }
  return merged.filter((seg) => seg.end - seg.start + 1 >= minSize);
}

/** Content-aware slice: find each figure by its transparent gaps (row bands, then
 *  column bands within each row) rather than a fixed grid — so figures that drift
 *  across nominal cell lines aren't clipped. Returns boxes in reading order. */
export async function sliceSheetByContent(
  sheet: Buffer, opt?: { alphaThreshold?: number; minGap?: number; minSize?: number },
): Promise<Array<{ left: number; top: number; width: number; height: number }>> {
  const thr = opt?.alphaThreshold ?? 24, minGap = opt?.minGap ?? 14, minSize = opt?.minSize ?? 40;
  const { data, info } = await sharp(sheet).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;

  const rowHas = new Array(H).fill(false);
  for (let y = 0; y < H; y++) { const base = y * W * 4; for (let x = 0; x < W; x++) if (data[base + x * 4 + 3] > thr) { rowHas[y] = true; break; } }

  const boxes: Array<{ left: number; top: number; width: number; height: number }> = [];
  for (const rb of segments(rowHas, minGap, minSize)) {
    const colHas = new Array(W).fill(false);
    for (let x = 0; x < W; x++) for (let y = rb.start; y <= rb.end; y++) if (data[(y * W + x) * 4 + 3] > thr) { colHas[x] = true; break; }
    for (const cb of segments(colHas, minGap, minSize)) {
      boxes.push({ left: cb.start, top: rb.start, width: cb.end - cb.start + 1, height: rb.end - rb.start + 1 });
    }
  }
  return boxes;
}

/** Slice a sheet into `count` cell buffers: content-aware when it finds exactly the
 *  expected number of figures, else falls back to an even cols×rows grid. */
export async function sliceSheetSmart(sheet: Buffer, count: number, cols: number, rows: number): Promise<{ cells: Buffer[]; mode: "content" | "grid" }> {
  let boxes = await sliceSheetByContent(sheet);
  let mode: "content" | "grid" = "content";
  if (boxes.length !== count) {
    const meta = await sharp(sheet).metadata();
    const W = meta.width || 0, H = meta.height || 0, cw = Math.floor(W / cols), ch = Math.floor(H / rows);
    boxes = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) boxes.push({ left: c * cw, top: r * ch, width: cw, height: ch });
    mode = "grid";
  }
  const cells: Buffer[] = [];
  for (const b of boxes) cells.push(await sharp(sheet).extract(b).png().toBuffer());
  return { cells, mode };
}

/** Flag frame-to-frame drift across a clip so a bad AI frame can be re-rolled. */
export function qaClip(stats: FrameStat[], tol = { size: 0.07, pivot: 4 }): string[] {
  const solid = stats.filter((s) => !s.empty);
  if (solid.length < 2) return [];
  const med = (a: number[]) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const medH = med(solid.map((s) => s.h));
  const problems: string[] = [];
  solid.forEach((s, i) => {
    if (Math.abs(s.h - medH) / medH > tol.size) problems.push(`frame ${i}: height ${Math.round(s.h / medH * 100)}% of median (size-pulse)`);
  });
  return problems;
}

/**
 * Punch opaque white/paper corners off an isometric diamond tile and emit a
 * tight 2:1 PNG (diamond fills the frame edge-to-edge).
 *
 * AI tile gens often put the rhombus on a solid white square — those corners
 * occlude neighboring tiles and characters in Phaser. We:
 *   1. flood-fill near-white from the image edge → alpha
 *   2. hard-mask to a centered 2:1 diamond (kills leftover corner junk)
 *   3. crop to content and resize onto a clean 2:1 canvas
 *
 * Does NOT run character/object normalizeFrame (that would squash the diamond
 * into a square cell and break iso tiling).
 */
export async function punchIsoTileBackground(
  input: Buffer,
  opt?: { minLuma?: number; maxChroma?: number; outW?: number },
): Promise<Buffer> {
  const minLuma = opt?.minLuma ?? 248;
  const maxChroma = opt?.maxChroma ?? 18;
  const outW = opt?.outW ?? 512;
  const outH = Math.round(outW / 2);

  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const n = w * h;

  const isPaper = (i: number) => {
    const o = i * 4;
    if (data[o + 3] < 8) return true;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    return luma >= minLuma && chroma <= maxChroma;
  };

  // Flood from every edge pixel that is paper-white / already clear
  const seen = new Uint8Array(n);
  const q: number[] = [];
  const push = (i: number) => {
    if (seen[i]) return;
    if (!isPaper(i)) return;
    seen[i] = 1;
    q.push(i);
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + (w - 1)); }

  let head = 0;
  while (head < q.length) {
    const i = q[head++];
    const x = i % w, y = (i / w) | 0;
    data[i * 4 + 3] = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      push(ny * w + nx);
    }
  }

  // Hard diamond mask (2:1 rhombus inscribed in the frame, slight inset)
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const halfW = w / 2 - 1, halfH = h / 2 - 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      if (data[o + 3] < 8) continue;
      // |dx|/halfW + |dy|/halfH <= 1  → inside diamond
      const nx = Math.abs(x - cx) / halfW;
      const ny = Math.abs(y - cy) / halfH;
      const t = nx + ny;
      if (t > 1.02) {
        data[o + 3] = 0;
      } else if (t > 0.97) {
        // soft rim
        data[o + 3] = Math.round(data[o + 3] * ((1.02 - t) / 0.05));
      }
    }
  }

  const punched = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const { data: d2, info: i2 } = await sharp(punched).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const box = alphaBBox(d2, i2.width, i2.height, 16);
  if (!box) {
    return sharp({
      create: { width: outW, height: outH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
  }

  // Prefer a true 2:1 crop around the diamond center
  const midX = box.left + box.width / 2;
  const midY = box.top + box.height / 2;
  let cropW = Math.max(box.width, Math.round(box.height * 2));
  let cropH = Math.round(cropW / 2);
  let left = Math.round(midX - cropW / 2);
  let top = Math.round(midY - cropH / 2);
  if (left < 0) left = 0;
  if (top < 0) top = 0;
  if (left + cropW > i2.width) cropW = i2.width - left;
  if (top + cropH > i2.height) cropH = i2.height - top;
  cropW = Math.max(1, cropW);
  cropH = Math.max(1, cropH);

  return sharp(punched)
    .extract({ left, top, width: cropW, height: cropH })
    .resize(outW, outH, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();
}
