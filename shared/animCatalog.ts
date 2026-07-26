/** Character animation catalog.
 *
 *  Primary path (Studio + Kitchen):
 *    1. Base still (`char_athena`) from Assets
 *    2. Per-direction FACING still (`char_athena__face_se`) — reorients the character
 *       in place (same isometric camera). Shared by idle/walk/run/carry for that dir.
 *    3. VIDEO clip from that facing still (image-to-video) on a chroma-green plate
 *    4. Extract PNG flipbook frames for gameplay
 *
 *  Legacy path: non-directional PNG flipbook frames / pose sheets. */

export interface FrameSpec {
  suffix: string;  // appended to baseKey → the frame's asset key (e.g. "walk1")
  pose: string;    // what the frame shows (fed to the generation prompt)
}

export interface Clip {
  name: string;
  fps: number;
  kind?: "state" | "cycle";
  frames?: FrameSpec[];       // STATE clips: explicit extra frames
  cycle?: "walk" | "run";     // CYCLE clips: which phase library
  count?: number;             // CYCLE clips: how many keyframes to sample
}

export interface AnimSpec {
  baseKey: string;
  label: string;
  basePose?: string;
  clips: Clip[];
}

/** Classic isometric 8-way facings (screen space: N=up, E=right). */
export const ISO_DIRS_8 = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
export const ISO_DIRS_4 = ["n", "e", "s", "w"] as const;
export type IsoDir = (typeof ISO_DIRS_8)[number];

export type DirSet = 4 | 8;

/** One playable video animation for a character (or object). */
export interface VideoClip {
  name: string;
  kind: "loop" | "oneshot";
  /** Motion-only prompt — likeness comes from the facing still (or base). Facing appended when directional. */
  prompt: string;
  durationSec?: number;
  /** How long oneshots block the movement state machine (ms). */
  lockMs?: number;
  /** Generate one video per facing (4-way or 8-way). Omit = single non-directional clip. */
  directions?: DirSet;
}

export interface VideoAnimSpec {
  baseKey: string;
  label: string;
  clips: VideoClip[];
}

/** Pure chroma-key green used as the video plate (must match ChromaKeyPipeline / ffmpeg). */
export const ANIM_CHROMA = "#00FF00";

export function frameKey(baseKey: string, suffix: string) {
  return `${baseKey}__${suffix}`;
}

export function dirsFor(set?: DirSet | null): readonly IsoDir[] {
  if (set === 4) return ISO_DIRS_4;
  if (set === 8) return ISO_DIRS_8;
  return [];
}

/**
 * Logical asset key for a video clip.
 *  - `char_athena__vid_idle` (no dir)
 *  - `char_athena__vid_walk_se` (with dir)
 */
export function videoClipKey(baseKey: string, clipName: string, dir?: string | null) {
  const d = dir ? `_${dir}` : "";
  return `${baseKey}__vid_${clipName}${d}`;
}

/**
 * Standing still facing a direction — seed for all directional videos of that facing.
 * Shared across idle/walk/run/carry (not clip-specific).
 *  - `char_athena__face_n`
 *  - `char_athena__face_se`
 */
export function facingStillKey(baseKey: string, dir: string) {
  return `${baseKey}__face_${dir}`;
}

/** Parse `char_athena__face_se` → { baseKey, dir }. */
export function parseFacingStillKey(key: string): { baseKey: string; dir: IsoDir } | null {
  const m = /^(.+)__face_([a-z]+)$/i.exec(key);
  if (!m) return null;
  const dir = (ISO_DIRS_8 as readonly string[]).includes(m[2]) ? (m[2] as IsoDir) : null;
  if (!dir) return null;
  return { baseKey: m[1], dir };
}

/**
 * Camera lock for FACING stills — keeps isometric framing but NEVER demands
 * "front of torso + one side" (that fights north / back-quarter facings).
 */
export function facingCameraClause(): string {
  return (
    " CAMERA LOCK (non-negotiable): keep the EXACT same true isometric / dimetric (2:1) camera, " +
    "lens height, zoom, and framing as the source image. Do NOT orbit, tilt, or re-stage the shot. " +
    "Only yaw the CHARACTER in place on the ground plane to the required facing. " +
    "Full body fully visible and centered. Feet planted on an invisible isometric ground plane. " +
    "FORBIDDEN: changing camera angle, front-facing portrait camera, top-down, side-scroller profile."
  );
}

/** Image-edit pose for a facing still (body reorients; camera stays put). */
export function composeFacingStillPrompt(dir: IsoDir): string {
  const facing = directionFacingPrompt(dir);
  const label = dir.toUpperCase();
  return (
    `TARGET FACING ${label} (highest priority — the whole point of this edit): ${facing}. ` +
    `Standing idle, feet planted firmly, calm relaxed posture, arms at natural rest by the sides ` +
    `(or holding props exactly as in the source if any). ` +
    `The character's body yaw, hips, feet, and head MUST clearly read as facing ${label} — ` +
    `if the source faces a different way, TURN THE CHARACTER to ${label}; do not keep the source facing. ` +
    `Neutral expression, no walking stride, no motion blur, no camera move.`
  );
}

/**
 * PNG flipbook frame extracted from a video clip (game playback path).
 *  - `char_athena__walk_se_1`
 *  - `char_athena__celebrate_1`
 * Must NOT use `__vid_` so the image proxy (not video) serves them.
 */
export function videoFrameKey(baseKey: string, clipName: string, n: number, dir?: string | null) {
  const d = dir ? `_${dir}` : "";
  return `${baseKey}__${clipName}${d}_${n}`;
}

export function videoFrameKeys(baseKey: string, clipName: string, count: number, dir?: string | null): string[] {
  return Array.from({ length: count }, (_, i) => videoFrameKey(baseKey, clipName, i + 1, dir));
}

/**
 * Playback rate for extracted PNG flipbooks.
 * Tuned for AI video → game sprites: dense enough to look smooth, light enough
 * for 8-way × many clips on mobile.
 */
export function spritePlaybackFps(clip: Pick<VideoClip, "name" | "kind">): number {
  if (clip.name === "run") return 14;
  if (clip.name === "walk") return 12;
  if (clip.kind === "oneshot") return 12;
  return 8; // idle / carry — gentle loop
}

/**
 * How many PNG frames to pull from a generated video.
 *
 * Videos are ~3–4s, but we don't need 3–4s × 24fps (huge). We sample a dense
 * flipbook that covers roughly one smooth cycle / gesture when played at
 * `spritePlaybackFps`:
 *   - walk/run: 16 frames @ 12–14 fps ≈ 1.1–1.3s gait
 *   - idle/carry: 12 frames @ 8 fps ≈ 1.5s breathe
 *   - oneshots: 12 frames @ 12 fps ≈ 1.0s gesture (hold last frame in-game)
 */
export function defaultSpriteFrameCount(clip: Pick<VideoClip, "name" | "kind" | "durationSec">): number {
  if (clip.name === "walk" || clip.name === "run") return 16;
  if (clip.kind === "oneshot") return 12;
  return 12; // idle, carry, grandma idle
}

/** Max frames ffmpeg will extract (hard cap for download size). */
export const MAX_SPRITE_FRAMES = 24;

/** Parse `char_athena__vid_walk_se` → { baseKey, clip, dir }. */
export function parseVideoClipKey(key: string): { baseKey: string; clip: string; dir: IsoDir | null } | null {
  const m = /^(.+)__vid_([a-z0-9]+)(?:_([a-z]+))?$/i.exec(key);
  if (!m) return null;
  const dir = m[3] && (ISO_DIRS_8 as readonly string[]).includes(m[3]) ? (m[3] as IsoDir) : null;
  return { baseKey: m[1], clip: m[2], dir };
}

/** True for video clip keys and their version siblings (`…__vid_idle__v123`). */
export function isVideoAssetKey(key: string, url?: string) {
  if (/__vid_/.test(key)) return true;
  if (url && /\.(mp4|webm)(\?|$)/i.test(url)) return true;
  return false;
}

/** Screen-space velocity → nearest 8-way iso facing. */
export function facingFromVelocity(vx: number, vy: number): IsoDir {
  if (vx === 0 && vy === 0) return "se";
  const a = Math.atan2(vy, vx); // -PI..PI, 0 = east
  const deg = ((a * 180) / Math.PI + 360) % 360;
  // 8 sectors centered on E, NE, N, …
  const sector = Math.round(deg / 45) % 8;
  return (["e", "se", "s", "sw", "w", "nw", "n", "ne"] as const)[sector];
}

/**
 * Human-readable facing clause for generation prompts (screen-space iso).
 * Explicit visibility cues so the model cannot keep a default SE pose.
 */
export function directionFacingPrompt(dir: IsoDir): string {
  const map: Record<IsoDir, string> = {
    n:
      "facing NORTH / away from camera (toward top of screen) — BACK of head, back of torso, and heels " +
      "mostly visible; face mostly hidden; three-quarter isometric rear view",
    ne:
      "facing NORTHEAST / upper-right of screen — body yawed toward top-right; right shoulder/side and " +
      "partial back visible; walking/standing toward top-right; three-quarter isometric",
    e:
      "facing EAST / due screen-RIGHT — strict isometric RIGHT profile: nose and toes point to the right edge; " +
      "right shoulder/arm/hip/leg dominate the silhouette; left side almost hidden; NOT facing the camera, NOT southeast",
    se:
      "facing SOUTHEAST / lower-right of screen — default game three-quarter; chest and right side " +
      "readable, walking/standing toward bottom-right",
    s:
      "facing SOUTH / toward the camera (bottom of screen) — FRONT of face and torso mostly visible; " +
      "three-quarter isometric front view (slight yaw still ok, but clearly front-dominant)",
    sw:
      "facing SOUTHWEST / lower-left of screen — body yawed toward bottom-left; left shoulder/side " +
      "and chest readable; three-quarter isometric",
    w:
      "facing WEST / due screen-LEFT — strict isometric LEFT profile: nose and toes point to the left edge; " +
      "left shoulder/arm/hip/leg dominate the silhouette; right side almost hidden; NOT facing the camera, NOT southwest",
    nw:
      "facing NORTHWEST / upper-left of screen — body yawed toward top-left; left shoulder/side and " +
      "partial back visible; walking/standing toward top-left; three-quarter isometric",
  };
  return map[dir];
}

/** Strip any prior orientation clauses so we never double-append or keep a stale facing. */
export function stripDirectionalClauses(prompt: string): string {
  return String(prompt || "")
    .replace(/\s*TARGET FACING [A-Z]+[^.]*(?:\.[^.]*)*\./gi, "")
    .replace(/\s*Character orientation:\s*[^.]*(?:\.[^.]*)*\./gi, "")
    .replace(/\s*Body and head orientation:\s*[^.]*(?:\.[^.]*)*\./gi, "")
    .replace(/\s*REQUIRED FACING[^.]*\./gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function composeDirectionalPrompt(basePrompt: string, dir?: IsoDir | null): string {
  const base = stripDirectionalClauses(basePrompt);
  if (!dir) return base;
  const facing = directionFacingPrompt(dir);
  const label = dir.toUpperCase();
  const orient =
    `REQUIRED FACING ${label} (do not drift): ${facing}. ` +
    `Hold this body yaw for the entire clip — do not turn mid-animation.`;
  return base ? `${orient} ${base}` : orient;
}

/** Appended to every anim-video motion prompt so the plate is keyable. */
export function chromaVideoSuffix(): string {
  return (
    `Solid flat pure chroma-key green background (${ANIM_CHROMA}), even lighting, ` +
    `no shadows or props on the background, character fully visible and centered, ` +
    `seamless loop-friendly motion, LOCKED isometric camera (no orbit/pan/zoom), no text, no watermark.`
  );
}

export function composeVideoMotionPrompt(motion: string, dir?: IsoDir | null): string {
  const m = composeDirectionalPrompt(motion, dir);
  return m ? `${m} ${chromaVideoSuffix()}` : chromaVideoSuffix();
}

// ── Motion-cycle choreography (legacy flipbook sheets) ───────────────────────
const CYCLE_CHOREO: Record<"walk" | "run", Record<number, string[]>> = {
  walk: {
    2: [
      "a wide walking stride: FRONT leg reaching forward with the heel planted on the ground, BACK leg stretched out behind with only the toe touching, legs in a wide open split. ARMS SWINGING clearly in opposition to the legs — the BACK hand swung FORWARD and raised up in front of her chest, the FRONT hand swung BACK behind her hip. Body upright at mid height. The arms must clearly swing, never hang straight down.",
      "the exact mirror of the previous pose: the legs swap so the OTHER leg is now forward with heel planted and the first leg stretches back on its toe; the ARMS also swap — the hand now in front is raised up before her chest, the other hand is pulled back behind her hip. Body upright at mid height, arms clearly swinging.",
    ],
    4: [
      "wide walking stride, FRONT leg forward heel-planted and BACK leg stretched behind on the toe. ARMS swinging in opposition — back hand raised FORWARD in front of the chest, front hand pulled BACK behind the hip. Upright, mid height. Arms clearly swinging, not hanging.",
      "PASSING pose: the front leg is now straight and vertical carrying all the weight, while the other leg is lifted with the knee bent and the thigh raised, swinging forward past the standing leg. Body at its highest point. The arms are mid-swing, both hands passing straight down close beside the hips.",
      "the mirror of frame 1: the OTHER leg reaches forward heel-planted, the first stretches back on its toe; the arms swap so the hand now in front is raised before the chest and the other hand is pulled back behind the hip. Upright, mid height.",
      "the mirror of frame 2 PASSING: the standing leg straight and vertical while the other knee lifts and swings forward past it, body at its highest, both hands passing straight down beside the hips.",
    ],
    6: [
      "CONTACT: a wide walking stride, FRONT leg reaching forward with the heel planted, BACK leg stretched behind on the toe. ARMS clearly swinging in opposition — the BACK hand swung FORWARD up in front of her chest, the FRONT hand swung BACK behind her hip. Upright, mid height.",
      "DOWN recoil: the front foot is now flat directly under her body with its knee bent to absorb the weight, the back foot's heel lifting off behind; her whole body squashed to its LOWEST point. Both hands are mid-swing, passing straight down close beside her hips.",
      "PASSING: the standing leg straightens to vertical under her body while the other leg lifts with the knee bent, thigh raised, swinging forward past it; body rising to its HIGHEST point. The arms swing through to the opposite extremes — the hand that was forward now swinging back, the other hand coming forward.",
      "CONTACT mirrored: now the OTHER leg reaches forward heel-planted and the first stretches back on the toe; the arms are swapped — the forward hand raised up before her chest, the back hand behind her hip. Upright, mid height.",
      "DOWN recoil mirrored: the now-front foot flat under her body with knee bent taking the weight, the back heel lifting; body at its LOWEST; both hands mid-swing down beside the hips.",
      "PASSING mirrored: the standing leg straight and vertical while the other knee lifts and swings forward past it; body at its HIGHEST; arms swinging to the opposite extremes, leading smoothly back into frame 1.",
    ],
    8: [
      "CONTACT: widest walking stride, FRONT leg forward with the heel striking and BACK leg extended straight behind on the toe. The BACK arm is swung all the way FORWARD with that hand raised to chest height in front of her, the FRONT arm swung all the way BACK with that hand behind her hip. Upright, mid height.",
      "DOWN recoil: weight dropping onto the flat front foot, its knee bent absorbing, back heel lifting; body at its LOWEST. Both hands easing inward, mid-swing, close beside the hips.",
      "PASSING: front leg straight and vertical bearing all the weight, back leg lifted knee-bent swinging forward beside it; body rising through mid height. Both hands passing straight down at her sides.",
      "UP high-point: the standing leg fully straightened, pushing up onto the ball of the foot so the body is at its TALLEST, the other foot swinging forward toward the next step. The arms reach their new extremes — the front hand now swinging forward toward the chest, the back hand behind the hip.",
      "CONTACT mirrored: widest stride with the OTHER leg forward heel-striking, first leg extended back on the toe; arms swapped — one hand raised forward at chest height, the other back behind the hip. Upright, mid height.",
      "DOWN recoil mirrored: weight onto the flat front foot, knee bent, back heel lifting; body LOWEST; hands easing in, mid-swing beside the hips.",
      "PASSING mirrored: standing leg straight and vertical, other leg lifted knee-bent swinging forward; body mid height; hands passing straight down at the sides.",
      "UP high-point mirrored: standing leg fully extended on the ball of the foot, body TALLEST, other foot swinging forward; arms reaching opposite extremes — front hand forward at chest height, back hand behind the hip, leading back into frame 1.",
    ],
  },
  run: {
    2: [
      "an airborne running peak with BOTH feet off the ground: the FRONT knee driven up very high and forward (thigh near horizontal, shin hanging down), the BACK leg extended straight out behind. Both arms are bent about ninety degrees and pumping hard — the BACK fist punched FORWARD and up near her chin, the FRONT fist driven BACK past her hip. Strong forward lean of the whole body. Arms bent and pumping, never hanging.",
      "the exact mirror: the OTHER knee is driven up high and forward while the first leg extends straight back, both feet off the ground; the bent arms swap — the fist now forward is up near her chin, the other fist driven back past the hip. Forward lean.",
    ],
    4: [
      "airborne PEAK, both feet off the ground, FRONT knee driven up high and forward, BACK leg stretched behind; body at its highest with a strong forward lean. Arms bent ninety degrees pumping — back fist forward near the chin, front fist back past the hip.",
      "CONTACT recoil: the front foot slams down flat and its knee bends deeply to absorb the landing, the other leg folding up behind; body compressed to its LOWEST with a deep forward lean. The bent arms are mid-pump, fists passing near the ribs.",
      "airborne PEAK mirrored: the OTHER knee driven up high and forward, first leg stretched behind, both feet off the ground, body highest; bent arms swapped — the forward fist up near the chin, the other back past the hip.",
      "CONTACT recoil mirrored: the now-front foot slams down flat, knee bent deep absorbing, other leg folding up behind; body LOWEST, deep lean; bent arms mid-pump, fists near the ribs.",
    ],
    6: [
      "CONTACT DOWN: the FRONT foot strikes the ground and the body compresses low with a hard forward lean, the BACK knee folded up high behind her. Arms bent ninety degrees — the BACK fist punched FORWARD up near her chin, the FRONT fist driven BACK past her hip.",
      "PUSH: the front leg extends hard to drive her body up and forward, the back knee swinging up and through toward the front; body rising. The bent arms pump through — fists passing near the ribs, beginning to swap.",
      "airborne PEAK: both feet off the ground at the highest point, the driving knee thrown up high and forward, the other leg trailing straight out behind; body leaning forward. Bent arms at full pump — one fist forward near the chin, the other back past the hip.",
      "CONTACT DOWN mirrored: the OTHER foot strikes, body compressed low with forward lean, other knee folded up behind; bent arms swapped — the forward fist up near her chin, the back fist past the hip.",
      "PUSH mirrored: that leg extends to drive up and forward, the trailing knee swinging up through; body rising; bent arms pumping through, fists near the ribs.",
      "airborne PEAK mirrored: both feet off the ground, the driving knee thrown up high and forward, other leg trailing behind; bent arms at full pump — forward fist near the chin, back fist past the hip — leading back into frame 1.",
    ],
    8: [
      "CONTACT: the FRONT foot strikes the ground toward the front, body descending into a hard forward lean, BACK leg extended up and behind. Arms bent ninety degrees — the BACK fist forward up near her chin, the FRONT fist back past her hip.",
      "DOWN recoil: the front knee bends deeply to absorb the landing, body at its LOWEST and most compressed, the back foot swinging in underneath. Bent arms near neutral at the ribs, mid-pump.",
      "PUSH: the front leg extends hard, body rising and leaning forward, the back knee driving up and forward. Bent arms beginning to pump apart again.",
      "airborne PEAK: both feet off the ground at the highest point, the driving knee thrown up high and forward, the other leg trailing straight out far behind; bent arms at full pump — one fist forward near the chin, the other back past her hip.",
      "CONTACT mirrored: the OTHER foot strikes toward the front, body descending into the lean, first leg extended up and behind; bent arms swapped — forward fist near the chin, back fist past the hip.",
      "DOWN recoil mirrored: that knee bends deep, body LOWEST, other foot swinging in underneath; bent arms near neutral at the ribs.",
      "PUSH mirrored: that leg extends, body rising and leaning forward, the other knee driving up; bent arms pumping apart.",
      "airborne PEAK mirrored: both feet off the ground, the driving knee thrown up high and forward, other leg trailing behind; bent arms full pump — forward fist near the chin, back fist past the hip — leading back into frame 1.",
    ],
  },
};

const AUTHORED_COUNTS = [2, 4, 6, 8];
function snapCount(count: number): number {
  return AUTHORED_COUNTS.reduce((best, c) => Math.abs(c - count) < Math.abs(best - count) ? c : best, 8);
}

export function cyclePoses(cycle: "walk" | "run", count: number): FrameSpec[] {
  const set = CYCLE_CHOREO[cycle][snapCount(count)];
  return set.map((pose, k) => ({ suffix: `${cycle}${k + 1}`, pose }));
}

export function clipFrames(clip: Clip): FrameSpec[] {
  if (clip.kind === "cycle" && clip.cycle) return cyclePoses(clip.cycle, clip.count ?? 4);
  return clip.frames ?? [];
}

const isCycle = (clip: Clip) => clip.kind === "cycle";

export function clipKeys(baseKey: string, clip: Clip): string[] {
  const frames = clipFrames(clip).map((f) => frameKey(baseKey, f.suffix));
  return isCycle(clip) ? frames : [baseKey, ...frames];
}

export function sheetPoses(spec: AnimSpec): Array<{ key: string; pose: string }> {
  const base = { key: spec.baseKey, pose: spec.basePose || "standing calmly, arms relaxed at sides, gentle closed-mouth smile, eyes open" };
  const rest = spec.clips.filter((c) => !isCycle(c)).flatMap((c) => clipFrames(c).map((f) => ({ key: frameKey(spec.baseKey, f.suffix), pose: f.pose })));
  return [base, ...rest];
}

export function clipSheetPoses(baseKey: string, clip: Clip): Array<{ key: string; pose: string }> {
  return clipFrames(clip).map((f) => ({ key: frameKey(baseKey, f.suffix), pose: f.pose }));
}

export function gridFor(n: number): { cols: number; rows: number } {
  if (n >= 6 && n % 2 === 0) return { cols: n / 2, rows: 2 };
  if (n >= 9 && n % 3 === 0) return { cols: n / 3, rows: 3 };
  return { cols: n, rows: 1 };
}

export const sheetRawKey = (baseKey: string, tag?: string) => `${baseKey}__${tag ? tag + "_" : ""}sheetraw`;

/** Legacy flipbook specs (fallback when video missing). */
export const ANIM_SPECS: AnimSpec[] = [
  {
    baseKey: "char_athena", label: "Athena",
    basePose: "standing calmly, arms relaxed at sides, gentle closed-mouth smile, eyes open",
    clips: [
      { name: "idle", fps: 3, frames: [
        { suffix: "idle1", pose: "eyes happily closed, big open smile, arms raised a little in a cheerful bounce" },
      ] },
      { name: "listen", fps: 2, frames: [
        { suffix: "listen", pose: "one hand cupped behind her ear, head tilted, listening attentively with a curious smile" },
      ] },
      { name: "speak", fps: 2, frames: [
        { suffix: "speak", pose: "mouth open mid-speech, one hand raised gesturing outward, encouraging expression" },
      ] },
      { name: "carry", fps: 2, frames: [
        { suffix: "carry", pose: "both arms held forward and slightly up as if carrying something, happy expression" },
      ] },
      { name: "celebrate", fps: 3, frames: [
        { suffix: "celebrate", pose: "both arms thrown up high, huge open smile, jumping for joy" },
      ] },
      { name: "confused", fps: 2, frames: [
        { suffix: "confused", pose: "shoulders shrugged, one eyebrow raised, slightly puzzled frown, hands turned palms-up" },
      ] },
      { name: "walk", fps: 8, kind: "cycle", cycle: "walk", count: 6 },
      { name: "run", fps: 12, kind: "cycle", cycle: "run", count: 6 },
    ],
  },
  {
    baseKey: "char_grandma", label: "Grandma",
    clips: [
      { name: "idle", fps: 3, frames: [
        { suffix: "idle1", pose: "eyes gently closed with a warm smile, hands clasped a little higher — a soft breathing idle" },
      ] },
    ],
  },
  {
    baseKey: "ing_apple", label: "Apple",
    clips: [
      { name: "idle", fps: 4, frames: [
        { suffix: "idle1", pose: "squished slightly wider and shorter, with a brighter shine highlight — a springy squash" },
      ] },
    ],
  },
];

/** Video-first animation catalog (Studio table + Kitchen runtime). */
export const VIDEO_ANIM_SPECS: VideoAnimSpec[] = [
  {
    baseKey: "char_athena",
    label: "Athena",
    clips: [
      {
        name: "idle", kind: "loop", durationSec: 4, directions: 8,
        prompt:
          "Gentle idle breathing bounce in place, soft cheerful smile, arms relaxed, " +
          "wholesome children's game character, seamless loop — stay facing the same direction the whole time",
      },
      {
        name: "listen", kind: "oneshot", durationSec: 3, lockMs: 850,
        prompt: "Cups one hand behind her ear, tilts head, attentive curious listening pose, small natural motion, wholesome kids game",
      },
      {
        name: "speak", kind: "oneshot", durationSec: 3, lockMs: 850,
        prompt: "Talking gesture — mouth moving, one hand gesturing outward encouragingly, friendly expression, wholesome kids game",
      },
      {
        name: "carry", kind: "loop", durationSec: 4, directions: 8,
        prompt:
          "Standing in place while holding arms forward as if carrying something, gentle idle sway, happy expression, " +
          "seamless loop — stay facing the same direction the whole time",
      },
      {
        name: "celebrate", kind: "oneshot", durationSec: 3, lockMs: 1000,
        prompt: "Jumps for joy with both arms thrown up high, huge open smile, celebratory bounce, wholesome kids game",
      },
      {
        name: "confused", kind: "oneshot", durationSec: 3, lockMs: 700,
        prompt: "Gentle shrug, palms up, one eyebrow raised, puzzled but soft expression, wholesome kids game",
      },
      {
        name: "walk", kind: "loop", durationSec: 4, directions: 8,
        prompt:
          "Walk cycle IN PLACE on a treadmill (root stays centered — do not travel across frame), " +
          "clear opposite arm/leg swing, steady looping gait, feet plant and lift, " +
          "wholesome children's game character, seamless loop — body yaw fixed; never turn mid-cycle",
      },
      {
        name: "run", kind: "loop", durationSec: 3, directions: 8,
        prompt:
          "Run cycle IN PLACE on a treadmill (root stays centered — do not travel across frame), " +
          "knees high, arms pumping, forward lean, energetic seamless loop, wholesome kids game — " +
          "body yaw fixed; never turn mid-cycle",
      },
    ],
  },
  {
    baseKey: "char_grandma",
    label: "Grandma",
    clips: [
      {
        name: "idle", kind: "loop", durationSec: 4, directions: 4,
        prompt:
          "Soft breathing idle in place, warm smile, hands gently clasped, wholesome elderly character, " +
          "seamless loop — stay facing the same direction the whole time",
      },
      {
        name: "celebrate", kind: "oneshot", durationSec: 3, lockMs: 900,
        prompt: "Warm delighted clap or hands-to-cheeks joy, soft bounce, wholesome elderly character, kids game",
      },
      {
        name: "confused", kind: "oneshot", durationSec: 3, lockMs: 700,
        prompt: "Gentle puzzled head tilt, soft shrug, kind confused expression, wholesome elderly character, kids game",
      },
      {
        name: "listen", kind: "oneshot", durationSec: 3, lockMs: 800,
        prompt: "Leans in slightly listening, attentive warm smile, wholesome elderly character, kids game",
      },
    ],
  },
];

export type VideoClipRow = VideoClip & {
  baseKey: string;
  label: string;
  key: string;
  dir: IsoDir | null;
  clipName: string;
};

export function specFor(baseKey: string): AnimSpec | undefined {
  return ANIM_SPECS.find((s) => s.baseKey === baseKey);
}

export function videoSpecFor(baseKey: string): VideoAnimSpec | undefined {
  return VIDEO_ANIM_SPECS.find((s) => s.baseKey === baseKey);
}

export function videoClipFor(baseKey: string, clipName: string): VideoClip | undefined {
  return videoSpecFor(baseKey)?.clips.find((c) => c.name === clipName);
}

/** Flat list of every catalog video clip row (dirs expanded) for admin tables. */
export function allVideoClipRows(): VideoClipRow[] {
  const rows: VideoClipRow[] = [];
  for (const spec of VIDEO_ANIM_SPECS) {
    for (const clip of spec.clips) {
      const dirs = dirsFor(clip.directions);
      if (!dirs.length) {
        rows.push({
          ...clip,
          baseKey: spec.baseKey,
          label: spec.label,
          clipName: clip.name,
          dir: null,
          key: videoClipKey(spec.baseKey, clip.name),
        });
        continue;
      }
      for (const dir of dirs) {
        rows.push({
          ...clip,
          baseKey: spec.baseKey,
          label: spec.label,
          clipName: clip.name,
          dir,
          key: videoClipKey(spec.baseKey, clip.name, dir),
        });
      }
    }
  }
  return rows;
}

/** Every video asset key for a character (all clips × dirs). */
export function allVideoKeysFor(baseKey: string): string[] {
  return allVideoClipRows().filter((r) => r.baseKey === baseKey).map((r) => r.key);
}
