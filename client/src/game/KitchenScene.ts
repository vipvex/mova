import Phaser from "phaser";
import type { KitchenLevel, KitchenIngredient } from "@shared/kitchenTypes";
import type { GameHud, GameHooks, EngineScene } from "@shared/gameTypes";
import { idleBob, squash, carryWobble, happyBounce, popIn, sparkle, walkLean, flipbook } from "./anims";
import { ensureChromaKeyPipeline } from "./ChromaKeyPipeline";
import {
  clipKeys, specFor, videoSpecFor,
  videoClipKey, videoClipFor, videoFrameKeys, defaultSpriteFrameCount,
  spritePlaybackFps, allVideoClipRows, facingFromVelocity, dirsFor,
  facingStillKey, ISO_DIRS_8, ISO_DIRS_4, type IsoDir,
} from "@shared/animCatalog";
import { playWord } from "./wordAudio";

/** Athena locomotion / pose clips driven by the Kitchen state machine. */
type AthenaLocomotion = "idle" | "walk" | "run" | "carry";
/** Athena oneshots triggered by gameplay events. */
type AthenaOneshot = "listen" | "speak" | "celebrate" | "confused";

type ClipMeta = { loopStart?: number; loopEnd?: number; keyed?: boolean; frameCount?: number };
type ResolvedSprites = { keys: string[]; dir: IsoDir | null };

interface Station { ing: KitchenIngredient; cx: number; cy: number; glyph: any; }
type Ctx = { kind: "pickup"; st: Station } | { kind: "deliver" } | null;

export class KitchenScene extends Phaser.Scene implements EngineScene {
  private level!: KitchenLevel;
  private hooks!: GameHooks;

  /** Iso diamond tile width (screen px). Height is tileW/2 (classic 2:1 dimetric). */
  private tileW = 0;
  private tileH = 0;
  /** @deprecated use tileW — kept as alias for interact radii during transition */
  private tile = 0;
  private ox = 0; private oy = 0;
  /** Facings whose flipbook PNGs are already in the texture cache (`baseKey:dir`). */
  private loadedFacings = new Set<string>();
  private facingLoadQueue = new Set<string>();
  // The game world renders at physical (device) pixels for retina sharpness, so
  // absolute-px sizes (fonts, header offset) are multiplied by dpr to stay visually constant.
  private dpr = Math.min(window.devicePixelRatio || 1, 2);
  private player!: Phaser.GameObjects.Text | any;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private shiftKey!: Phaser.Input.Keyboard.Key;
  private stations: Station[] = [];
  private grandma!: Phaser.GameObjects.Text | any;
  private gcx = 0; private gcy = 0;

  private animState = "";
  private animTimer?: Phaser.Time.TimerEvent;
  private animLockUntil = 0;
  private playerSize = 0;
  private athenaVids = new Map<string, Phaser.GameObjects.Video>();
  private usingVideo = false;
  private facing: IsoDir = "se";
  /** Last locomotion/oneshot name requested (survives holds while a facing loads). */
  private athenaClipWanted = "idle";
  private animMeta: Record<string, ClipMeta> = {};
  private activeVideoKey = "";

  private grandmaAnimState = "";
  private grandmaAnimTimer?: Phaser.Time.TimerEvent;
  private grandmaAnimLockUntil = 0;
  private grandmaVids = new Map<string, Phaser.GameObjects.Video>();
  private grandmaUsingVideo = false;
  private grandmaFacing: IsoDir = "s";
  private grandmaClipWanted = "idle";
  private grandmaActiveVideoKey = "";
  private grandmaSize = 0;

  // Live-tunable gameplay settings (adjusted from the in-game ⚙ panel). moveSpeed is
  // in VISUAL px/s (multiplied by dpr internally, since the world renders at physical px);
  // interactRadius / bodyScale are in tile fractions.
  private tune = { moveSpeed: 360, interactRadius: 1.3, bodyScale: 0.6, timeSec: 120 };

  private carry: KitchenIngredient | null = null;
  private carryIcon!: Phaser.GameObjects.Text;
  private carryTween?: Phaser.Tweens.Tween;
  private target: KitchenIngredient | null = null;
  private active: Ctx = null;
  private lastGrammar = "__init";

  private bubble!: Phaser.GameObjects.Container;
  private bubblePic!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;

  private orders = 0; private misses = 0; private timeLeft = 0;
  private orderStart = 0; private ended = false;
  private assets: Record<string, string> = {};
  private sfxCtx: AudioContext | null = null;

  constructor() { super("kitchen"); }

  init(data: {
    level: KitchenLevel; hooks: GameHooks;
    assets?: Record<string, string>;
    animMeta?: Record<string, ClipMeta>;
  }) {
    this.level = data.level; this.hooks = data.hooks; this.assets = data.assets || {};
    this.animMeta = data.animMeta || {};
    this.stations = []; this.carry = null; this.target = null; this.active = null;
    this.orders = 0; this.misses = 0; this.ended = false; this.lastGrammar = "__init";
    this.facing = "se"; this.activeVideoKey = ""; this.animState = "";
    this.athenaClipWanted = "idle";
    this.grandmaFacing = "s"; this.grandmaActiveVideoKey = ""; this.grandmaAnimState = "";
    this.grandmaClipWanted = "idle";
    this.grandmaUsingVideo = false; this.grandmaAnimLockUntil = 0;
    this.loadedFacings.clear();
    this.facingLoadQueue.clear();
    this.tune = {
      moveSpeed: Math.round((data.level.tuning.moveSpeed ?? 300) * 1.2), // a bit snappier by default
      interactRadius: 1.15,
      bodyScale: 0.45,
      timeSec: data.level.tuning.timeSec,
    };
    this.timeLeft = this.tune.timeSec;
  }

  /**
   * Boot pack: env + chars + ings + Athena walk×8 + full Athena `se` + Grandma idle×4
   * + oneshots + facing stills. Remaining idle/run/carry facings lazy-load after create.
   */
  preload() {
    const need = new Set<string>([
      "char_athena", "char_grandma", "env_floor", "env_floor_dark", "env_wall", "env_counter",
      ...this.level.ingredients.map((i) => "ing_" + i.id),
    ]);
    // All Athena locomotion facings at boot so ↑↓←→ instantly switch plates
    for (const d of ISO_DIRS_8) {
      for (const k of this.facingFrameKeys("char_athena", d, ["idle", "walk", "run", "carry"])) need.add(k);
      need.add(facingStillKey("char_athena", d));
    }
    // Grandma: all 4 idle facings
    for (const d of ISO_DIRS_4) {
      for (const k of this.facingFrameKeys("char_grandma", d, ["idle"])) need.add(k);
      need.add(facingStillKey("char_grandma", d));
    }
    // Non-directional oneshots (listen/speak/celebrate/confused)
    for (const row of allVideoClipRows()) {
      if (row.dir) continue;
      if (row.baseKey !== "char_athena" && row.baseKey !== "char_grandma") continue;
      const count = Math.max(defaultSpriteFrameCount(row), this.animMeta[row.key]?.frameCount || 0);
      for (const fk of videoFrameKeys(row.baseKey, row.clipName, count, null)) need.add(fk);
    }
    Array.from(need).forEach((k) => {
      const u = this.assets[k];
      if (u) this.load.image(k, u);
    });

    // Video fallback only for default dirs when sprites are missing
    for (const row of allVideoClipRows()) {
      if (row.baseKey !== "char_athena" && row.baseKey !== "char_grandma") continue;
      const count = this.animMeta[row.key]?.frameCount || 0;
      if (count >= 2) continue;
      if (row.dir && row.baseKey === "char_athena" && row.dir !== "se") continue;
      if (row.dir && row.baseKey === "char_grandma" && row.dir !== "s") continue;
      const u = this.assets[row.key];
      if (u) this.load.video(row.key, u, true);
    }
  }

  /** Frame keys for one character facing (optionally filtered to clip names). */
  private facingFrameKeys(baseKey: string, dir: IsoDir, onlyClips?: string[]): string[] {
    const spec = videoSpecFor(baseKey);
    if (!spec) return [];
    const out: string[] = [];
    for (const clip of spec.clips) {
      if (!clip.directions) continue;
      if (onlyClips && !onlyClips.includes(clip.name)) continue;
      const vkey = videoClipKey(baseKey, clip.name, dir);
      const count = Math.max(defaultSpriteFrameCount(clip), this.animMeta[vkey]?.frameCount || 0);
      out.push(...videoFrameKeys(baseKey, clip.name, count, dir));
    }
    return out;
  }

  private facingFullyCached(baseKey: string, dir: IsoDir): boolean {
    const keys = this.facingFrameKeys(baseKey, dir).filter((k) => this.assets[k]);
    return keys.length > 0 && keys.every((k) => this.textures.exists(k));
  }

  private syncLoadedFacingFlags() {
    for (const d of ISO_DIRS_8) {
      if (this.facingFullyCached("char_athena", d)) this.loadedFacings.add(`char_athena:${d}`);
    }
    for (const d of ISO_DIRS_4) {
      if (this.facingFullyCached("char_grandma", d)) this.loadedFacings.add(`char_grandma:${d}`);
    }
  }

  /** Background-load remaining flipbooks for a facing; re-apply anim when ready. */
  private ensureFacingLoaded(baseKey: string, dir: IsoDir) {
    const id = `${baseKey}:${dir}`;
    if (this.loadedFacings.has(id) || this.facingLoadQueue.has(id)) return;
    if (this.facingFullyCached(baseKey, dir)) {
      this.loadedFacings.add(id);
      return;
    }
    const keys = this.facingFrameKeys(baseKey, dir).filter((k) => this.assets[k] && !this.textures.exists(k));
    const face = facingStillKey(baseKey, dir);
    if (this.assets[face] && !this.textures.exists(face)) keys.push(face);
    if (!keys.length) { this.loadedFacings.add(id); return; }
    this.facingLoadQueue.add(id);
    const startBatch = () => {
      if (this.load.isLoading()) {
        this.load.once(Phaser.Loader.Events.COMPLETE, startBatch);
        return;
      }
      for (const k of keys) {
        if (!this.textures.exists(k) && this.assets[k]) this.load.image(k, this.assets[k]);
      }
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        this.loadedFacings.add(id);
        this.facingLoadQueue.delete(id);
        this.onFacingReady(baseKey, dir);
      });
      this.load.start();
    };
    startBatch();
  }

  /** Swap in the correct directional clip once its frames finish loading. */
  private onFacingReady(baseKey: string, dir: IsoDir) {
    if (baseKey === "char_athena" && this.facing === dir) {
      this.animState = "";
      this.animTimer?.remove();
      this.animTimer = undefined;
      if (this.time.now >= this.animLockUntil) this.setAnim(this.athenaClipWanted);
    }
    if (baseKey === "char_grandma" && this.grandmaFacing === dir) {
      this.grandmaAnimState = "";
      this.grandmaAnimTimer?.remove();
      this.grandmaAnimTimer = undefined;
      if (this.time.now >= this.grandmaAnimLockUntil) this.setGrandmaAnim(this.grandmaClipWanted);
    }
  }

  /** Prefetch idle/run/carry for non-default Athena facings (walk already booted). */
  private prefetchOtherFacings() {
    const jobs: Array<[string, IsoDir]> = [];
    for (const d of ISO_DIRS_8) {
      if (!this.loadedFacings.has(`char_athena:${d}`)) jobs.push(["char_athena", d]);
    }
    for (const d of ISO_DIRS_4) {
      if (!this.loadedFacings.has(`char_grandma:${d}`)) jobs.push(["char_grandma", d]);
    }
    jobs.forEach(([base, dir], i) => {
      this.time.delayedCall(40 + i * 90, () => this.ensureFacingLoaded(base, dir));
    });
  }

  /** Start the "idle" flipbook on a sprite if its frames were generated. */
  private playIdle(baseKey: string, img: any) {
    const clip = specFor(baseKey)?.clips.find((c) => c.name === "idle");
    if (clip) flipbook(this, img, clipKeys(baseKey, clip), clip.fps);
  }

  /**
   * Resolve extracted sprite frames for clip + facing.
   * Locomotion: preferred facing ONLY (no silent cross-dir fallback).
   * Pass `fallback: true` only for debug inventory.
   */
  private resolveSpriteKeys(
    baseKey: string,
    clipName: string,
    facing: IsoDir,
    opts?: { fallback?: boolean },
  ): ResolvedSprites | null {
    const vClip = videoClipFor(baseKey, clipName);
    if (!vClip) return null;
    const tryDir = (dir: IsoDir | null): string[] | null => {
      const vkey = videoClipKey(baseKey, clipName, dir);
      const count = Math.max(
        defaultSpriteFrameCount(vClip),
        this.animMeta[vkey]?.frameCount || 0,
      );
      const keys = videoFrameKeys(baseKey, clipName, count, dir)
        .filter((k) => this.textures.exists(k));
      return keys.length >= 2 ? keys : null;
    };
    if (vClip.directions) {
      const preferred = tryDir(facing);
      if (preferred) return { keys: preferred, dir: facing };
      if (opts?.fallback) {
        for (const d of dirsFor(vClip.directions)) {
          const keys = tryDir(d);
          if (keys) return { keys, dir: d };
        }
      }
      return null;
    }
    const keys = tryDir(null);
    return keys ? { keys, dir: null } : null;
  }

  /** Video key for the preferred facing only (no cross-dir fallback). */
  private resolveVideoKey(
    baseKey: string,
    clipName: string,
    facing: IsoDir,
    vids: Map<string, Phaser.GameObjects.Video>,
  ): string | null {
    const vClip = videoClipFor(baseKey, clipName);
    if (!vClip) return null;
    if (vClip.directions) {
      const preferred = videoClipKey(baseKey, clipName, facing);
      return vids.has(preferred) ? preferred : null;
    }
    const k = videoClipKey(baseKey, clipName);
    return vids.has(k) ? k : null;
  }

  private hideVideos(vids: Map<string, Phaser.GameObjects.Video>) {
    for (const v of Array.from(vids.values())) {
      try { v.stop(); } catch { /* ignore */ }
      v.setVisible(false);
    }
  }

  private hideAthenaVideos() { this.hideVideos(this.athenaVids); }
  private hideGrandmaVideos() { this.hideVideos(this.grandmaVids); }

  /** Nearest 4-way facing (grandma catalog). */
  private facing4FromDelta(dx: number, dy: number): IsoDir {
    if (dx === 0 && dy === 0) return "s";
    const eight = facingFromVelocity(dx, dy);
    const map: Record<IsoDir, IsoDir> = {
      n: "n", ne: "n", e: "e", se: "s", s: "s", sw: "s", w: "w", nw: "n",
    };
    return map[eight];
  }

  private syncAthenaVideo() {
    if (!this.usingVideo || !this.player || !this.activeVideoKey) return;
    const vid = this.athenaVids.get(this.activeVideoKey);
    if (!vid) return;
    vid.setPosition(this.player.x, this.player.y);
    vid.setFlipX(false);
    vid.setAngle(this.player.angle);
    vid.setScale(this.player.scaleX, this.player.scaleY);
    const m = this.animMeta[this.activeVideoKey];
    if (m && (m.loopEnd || 0) > (m.loopStart || 0)) {
      try {
        const t = vid.getCurrentTime();
        if (t >= (m.loopEnd as number) - 0.03) vid.setCurrentTime(m.loopStart || 0);
      } catch { /* ignore */ }
    }
  }

  /**
   * Switch Athena clip. Order:
   *  1) extracted PNG flipbook for the *requested* facing
   *  2) video for that facing
   *  3) facing still (while frames load)
   *  4) hold current anim / legacy sheet
   * Never claims animState for a facing whose frames aren't on screen.
   */
  private setAnim(name: string) {
    this.athenaClipWanted = name;
    const vClip = videoClipFor("char_athena", name);
    const resolved = this.resolveSpriteKeys("char_athena", name, this.facing);

    if (resolved) {
      const stateId = resolved.dir ? `${name}:${resolved.dir}` : name;
      if (this.animState === stateId && !this.usingVideo && this.animTimer) return;
      this.animState = stateId;
      this.activeVideoKey = "";
      this.usingVideo = false;
      this.animTimer?.remove();
      this.animTimer = undefined;
      this.hideAthenaVideos();
      this.player.setVisible(true);
      this.player.setFlipX?.(false);
      this.player.setAngle?.(0);
      const fps = spritePlaybackFps(vClip || { name, kind: "loop" });
      this.player.setTexture(resolved.keys[0]);
      if (this.playerSize) this.player.setDisplaySize?.(this.playerSize, this.playerSize);
      this.animTimer = flipbook(this, this.player, resolved.keys, fps, {
        loop: vClip?.kind !== "oneshot",
      });
      this.ensureAthenaChroma();
      return;
    }

    if (vClip?.directions) {
      this.ensureFacingLoaded("char_athena", this.facing);
      const vkey = this.resolveVideoKey("char_athena", name, this.facing, this.athenaVids);
      if (vkey) {
        const stateId = `${name}:${this.facing}`;
        if (this.animState === stateId && this.activeVideoKey === vkey) return;
        this.animState = stateId;
        this.activeVideoKey = vkey;
        this.animTimer?.remove();
        this.animTimer = undefined;
        for (const [k, v] of Array.from(this.athenaVids.entries())) {
          if (k === vkey) {
            v.setVisible(true);
            v.setMute(true);
            const m = this.animMeta[vkey];
            try { if (m?.loopStart) v.setCurrentTime(m.loopStart); } catch { /* ignore */ }
            v.play(vClip.kind === "loop");
          } else {
            try { v.stop(); } catch { /* ignore */ }
            v.setVisible(false);
          }
        }
        this.player.setVisible(false);
        this.usingVideo = true;
        this.syncAthenaVideo();
        return;
      }
      // Interim facing still while walk/idle frames load
      const face = facingStillKey("char_athena", this.facing);
      if (this.textures.exists(face)) {
        const stateId = `face:${this.facing}`;
        if (this.animState === stateId) return;
        this.animState = stateId;
        this.usingVideo = false;
        this.activeVideoKey = "";
        this.animTimer?.remove();
        this.animTimer = undefined;
        this.hideAthenaVideos();
        this.player.setVisible(true);
        this.player.setFlipX?.(false);
        this.player.setAngle?.(0);
        this.player.setTexture(face);
        if (this.playerSize) this.player.setDisplaySize?.(this.playerSize, this.playerSize);
        this.ensureAthenaChroma();
        return;
      }
      // Hold whatever is currently playing until the facing pack arrives
      return;
    }

    const vkey = this.resolveVideoKey("char_athena", name, this.facing, this.athenaVids);
    if (vkey && vClip) {
      if (this.animState === name && this.activeVideoKey === vkey) return;
      this.animState = name;
      this.activeVideoKey = vkey;
      this.animTimer?.remove();
      this.animTimer = undefined;
      for (const [k, v] of Array.from(this.athenaVids.entries())) {
        if (k === vkey) {
          v.setVisible(true);
          v.setMute(true);
          const m = this.animMeta[vkey];
          try { if (m?.loopStart) v.setCurrentTime(m.loopStart); } catch { /* ignore */ }
          v.play(vClip.kind === "loop");
        } else {
          try { v.stop(); } catch { /* ignore */ }
          v.setVisible(false);
        }
      }
      this.player.setVisible(false);
      this.usingVideo = true;
      this.syncAthenaVideo();
      return;
    }

    // Legacy flipbook / still
    this.usingVideo = false;
    this.activeVideoKey = "";
    this.hideAthenaVideos();
    this.player.setVisible(true);
    const clip = specFor("char_athena")?.clips.find((c) => c.name === name);
    if (!clip) return;
    const keys = clipKeys("char_athena", clip).filter((k) => this.textures.exists(k));
    if (!keys.length) return;
    this.animState = name;
    this.animTimer?.remove();
    this.animTimer = undefined;
    if (keys.length < 2) { this.player.setTexture(keys[0]); return; }
    this.animTimer = flipbook(this, this.player, keys, clip.fps);
  }

  /** Grandma idle (directional when available). Same honest-facing rules as Athena. */
  private setGrandmaAnim(name: string) {
    this.grandmaClipWanted = name;
    const vClip = videoClipFor("char_grandma", name);
    const resolved = this.resolveSpriteKeys("char_grandma", name, this.grandmaFacing);

    if (resolved) {
      const stateId = resolved.dir ? `${name}:${resolved.dir}` : name;
      if (this.grandmaAnimState === stateId && !this.grandmaUsingVideo && this.grandmaAnimTimer) return;
      this.grandmaAnimState = stateId;
      this.grandmaActiveVideoKey = "";
      this.grandmaUsingVideo = false;
      this.grandmaAnimTimer?.remove();
      this.grandmaAnimTimer = undefined;
      this.hideGrandmaVideos();
      this.grandma.setVisible(true);
      this.grandma.setFlipX?.(false);
      const fps = spritePlaybackFps(vClip || { name, kind: "loop" });
      this.grandma.setTexture(resolved.keys[0]);
      if (this.grandmaSize) this.grandma.setDisplaySize?.(this.grandmaSize, this.grandmaSize);
      this.grandmaAnimTimer = flipbook(this, this.grandma, resolved.keys, fps, {
        loop: vClip?.kind !== "oneshot",
      });
      this.ensureGrandmaChroma();
      return;
    }

    if (vClip?.directions) {
      this.ensureFacingLoaded("char_grandma", this.grandmaFacing);
      const vkey = this.resolveVideoKey("char_grandma", name, this.grandmaFacing, this.grandmaVids);
      if (vkey) {
        const stateId = `${name}:${this.grandmaFacing}`;
        if (this.grandmaAnimState === stateId && this.grandmaActiveVideoKey === vkey) return;
        this.grandmaAnimState = stateId;
        this.grandmaActiveVideoKey = vkey;
        this.grandmaAnimTimer?.remove();
        this.grandmaAnimTimer = undefined;
        for (const [k, v] of Array.from(this.grandmaVids.entries())) {
          if (k === vkey) {
            v.setVisible(true);
            v.setMute(true);
            const m = this.animMeta[vkey];
            try { if (m?.loopStart) v.setCurrentTime(m.loopStart); } catch { /* ignore */ }
            v.play(vClip.kind === "loop");
          } else {
            try { v.stop(); } catch { /* ignore */ }
            v.setVisible(false);
          }
        }
        this.grandma.setVisible(false);
        this.grandmaUsingVideo = true;
        this.syncGrandmaVideo();
        return;
      }
      const face = facingStillKey("char_grandma", this.grandmaFacing);
      if (this.textures.exists(face)) {
        const stateId = `face:${this.grandmaFacing}`;
        if (this.grandmaAnimState === stateId) return;
        this.grandmaAnimState = stateId;
        this.grandmaUsingVideo = false;
        this.grandmaActiveVideoKey = "";
        this.grandmaAnimTimer?.remove();
        this.grandmaAnimTimer = undefined;
        this.hideGrandmaVideos();
        this.grandma.setVisible(true);
        this.grandma.setFlipX?.(false);
        this.grandma.setTexture(face);
        if (this.grandmaSize) this.grandma.setDisplaySize?.(this.grandmaSize, this.grandmaSize);
        this.ensureGrandmaChroma();
        return;
      }
      return; // hold
    }

    const vkey = this.resolveVideoKey("char_grandma", name, this.grandmaFacing, this.grandmaVids);
    if (vkey && vClip) {
      if (this.grandmaAnimState === name && this.grandmaActiveVideoKey === vkey) return;
      this.grandmaAnimState = name;
      this.grandmaActiveVideoKey = vkey;
      this.grandmaAnimTimer?.remove();
      this.grandmaAnimTimer = undefined;
      for (const [k, v] of Array.from(this.grandmaVids.entries())) {
        if (k === vkey) {
          v.setVisible(true);
          v.setMute(true);
          const m = this.animMeta[vkey];
          try { if (m?.loopStart) v.setCurrentTime(m.loopStart); } catch { /* ignore */ }
          v.play(vClip.kind === "loop");
        } else {
          try { v.stop(); } catch { /* ignore */ }
          v.setVisible(false);
        }
      }
      this.grandma.setVisible(false);
      this.grandmaUsingVideo = true;
      this.syncGrandmaVideo();
      return;
    }

    this.grandmaUsingVideo = false;
    this.grandmaActiveVideoKey = "";
    this.hideGrandmaVideos();
    this.grandma.setVisible(true);
    if (this.grandmaAnimState === `legacy:${name}`) return;
    this.grandmaAnimState = `legacy:${name}`;
    this.playIdle("char_grandma", this.grandma);
  }

  private syncGrandmaVideo() {
    if (!this.grandmaUsingVideo || !this.grandma || !this.grandmaActiveVideoKey) return;
    const vid = this.grandmaVids.get(this.grandmaActiveVideoKey);
    if (!vid) return;
    vid.setPosition(this.grandma.x, this.grandma.y);
    vid.setFlipX(false);
    vid.setAngle(0);
    vid.setScale(this.grandma.scaleX, this.grandma.scaleY);
    const m = this.animMeta[this.grandmaActiveVideoKey];
    if (m && (m.loopEnd || 0) > (m.loopStart || 0)) {
      try {
        const t = vid.getCurrentTime();
        if (t >= (m.loopEnd as number) - 0.03) vid.setCurrentTime(m.loopStart || 0);
      } catch { /* ignore */ }
    }
  }

  /** Live gameplay tuning (from the in-game ⚙ panel). Returns the current values. */
  getTuning() { return { ...this.tune }; }
  setTuning(patch: Partial<typeof this.tune>) {
    Object.assign(this.tune, patch);
    if (patch.bodyScale !== undefined && this.player?.body) this.sizeBody();
  }

  /** Map movement + carry → Athena locomotion clip (every catalog loop is reachable). */
  private athenaLocomotion(moving: boolean, running: boolean): AthenaLocomotion {
    if (moving) return running ? "run" : "walk";
    return this.carry ? "carry" : "idle";
  }

  /** Lock duration: catalog lockMs, but at least long enough to play the flipbook once. */
  private oneshotLockMs(baseKey: string, name: string, override?: number): number {
    const clip = videoClipFor(baseKey, name);
    const catalog = override ?? clip?.lockMs ?? 800;
    const frames = defaultSpriteFrameCount(clip || { name, kind: "oneshot" });
    const fps = spritePlaybackFps(clip || { name, kind: "oneshot" });
    const playMs = Math.round((frames / Math.max(1, fps)) * 1000);
    return Math.max(catalog, playMs);
  }

  /** Play a one-shot pose, blocking the locomotion SM until lock expires. */
  private playOneShot(name: AthenaOneshot | string, ms?: number) {
    const lock = this.oneshotLockMs("char_athena", name, ms);
    this.setAnim(name);
    this.animLockUntil = this.time.now + lock;
  }

  private playGrandmaOneShot(name: string, ms?: number) {
    const lock = this.oneshotLockMs("char_grandma", name, ms);
    this.setGrandmaAnim(name);
    this.grandmaAnimLockUntil = this.time.now + lock;
  }

  /** Inventory of which Athena catalog clips have sprites / video loaded. */
  private athenaAnimInventory() {
    const spec = videoSpecFor("char_athena");
    const out: Array<{ name: string; kind: string; dirs?: number; sprites: number; video: boolean }> = [];
    for (const clip of spec?.clips || []) {
      if (clip.directions) {
        let spriteDirs = 0;
        for (const d of dirsFor(clip.directions)) {
          if (this.resolveSpriteKeys("char_athena", clip.name, d)) spriteDirs++;
        }
        out.push({
          name: clip.name, kind: clip.kind, dirs: clip.directions,
          sprites: spriteDirs,
          video: dirsFor(clip.directions).some((d) => this.athenaVids.has(videoClipKey("char_athena", clip.name, d))),
        });
      } else {
        const resolved = this.resolveSpriteKeys("char_athena", clip.name, this.facing);
        out.push({
          name: clip.name, kind: clip.kind,
          sprites: resolved ? resolved.keys.length : 0,
          video: this.athenaVids.has(videoClipKey("char_athena", clip.name)),
        });
      }
    }
    return out;
  }

  /** True when the *current* facing has a baked directional plate (not a wrong-dir fallback). */
  private athenaFacingBaked(clipName: string): boolean {
    const vClip = videoClipFor("char_athena", clipName);
    if (!vClip?.directions) return false;
    if (this.resolveSpriteKeys("char_athena", clipName, this.facing)) return true;
    if (this.textures.exists(facingStillKey("char_athena", this.facing))) return true;
    return this.usingVideo && this.activeVideoKey === videoClipKey("char_athena", clipName, this.facing);
  }

  /** Sprite if the house-style asset exists, else the emoji placeholder. */
  private icon(key: string, x: number, y: number, sizePx: number, emoji: string, chroma = false): any {
    if (this.textures.exists(key)) {
      const img = this.add.image(x, y, key).setDisplaySize(sizePx, sizePx);
      // Safety net for video-extracted frames that still have a green plate baked in.
      if (chroma) {
        try { img.setPipeline("ChromaKey"); } catch { /* canvas / pipeline missing */ }
      }
      this.softShadow(img);
      return img;
    }
    return this.add.text(x, y, emoji, { fontSize: `${Math.floor(sizePx * 0.9)}px` }).setOrigin(0.5);
  }

  /** Keep chroma pipeline on Athena when playing PNG flipbooks (green-plate safety net). */
  private ensureAthenaChroma() {
    if (!this.player?.setPipeline) return;
    if (this.usingVideo) return; // video path sets pipeline per-clip
    try { this.player.setPipeline("ChromaKey"); } catch { /* ignore */ }
  }

  private ensureGrandmaChroma() {
    if (!this.grandma?.setPipeline || this.grandmaUsingVideo) return;
    try { this.grandma.setPipeline("ChromaKey"); } catch { /* ignore */ }
  }

  /** A subtle soft drop shadow so sprites feel grounded / 3D (WebGL postFX; no-op elsewhere).
   *  addShadow(x, y, decay, power, color, samples, intensity) — small offset + low intensity
   *  keeps it soft rather than a hard smeared silhouette. */
  private softShadow(img: any) {
    try { img.postFX?.addShadow?.(0, 1, 0.1, 0.6, 0x000000, 6, 0.25); } catch { /* canvas fallback: skip */ }
  }

  /** Size the player's physics body to ~bodyScale of a tile, accounting for the
   *  sprite's display scale (Arcade setSize is in source-texture px, then scaled). */
  private sizeBody() {
    const b = this.player.body as Phaser.Physics.Arcade.Body;
    const sx = this.player.scaleX || 1, sy = this.player.scaleY || 1;
    b.setSize((this.tile * this.tune.bodyScale) / sx, (this.tile * this.tune.bodyScale) / sy, true);
  }

  /**
   * Punch opaque paper-white corners off a loaded env tile texture and replace
   * it with a tight 2:1 diamond (runtime safety net for AI JPEGs / unpurged PNGs).
   */
  private punchLoadedIsoTile(key: string) {
    if (!this.textures.exists(key)) return;
    try {
      const src = this.textures.get(key).getSourceImage() as CanvasImageSource;
      const sw = (src as any).width as number;
      const sh = (src as any).height as number;
      if (!sw || !sh) return;
      const c = document.createElement("canvas");
      c.width = sw; c.height = sh;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(src as CanvasImageSource, 0, 0);
      const img = ctx.getImageData(0, 0, sw, sh);
      const d = img.data;
      const n = sw * sh;
      const isPaper = (i: number) => {
        const o = i * 4;
        if (d[o + 3] < 8) return true;
        const r = d[o], g = d[o + 1], b = d[o + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        return luma >= 248 && chroma <= 18;
      };
      const seen = new Uint8Array(n);
      const q: number[] = [];
      const push = (i: number) => {
        if (seen[i] || !isPaper(i)) return;
        seen[i] = 1; q.push(i);
      };
      for (let x = 0; x < sw; x++) { push(x); push((sh - 1) * sw + x); }
      for (let y = 0; y < sh; y++) { push(y * sw); push(y * sw + sw - 1); }
      let head = 0;
      while (head < q.length) {
        const i = q[head++];
        d[i * 4 + 3] = 0;
        const x = i % sw, y = (i / sw) | 0;
        if (x + 1 < sw) push(i + 1);
        if (x > 0) push(i - 1);
        if (y + 1 < sh) push(i + sw);
        if (y > 0) push(i - sw);
      }
      // Hard 2:1 diamond mask
      const cx = (sw - 1) / 2, cy = (sh - 1) / 2;
      const halfW = sw / 2 - 1, halfH = sh / 2 - 1;
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const o = (y * sw + x) * 4;
          if (d[o + 3] < 8) continue;
          const t = Math.abs(x - cx) / halfW + Math.abs(y - cy) / halfH;
          if (t > 1.02) d[o + 3] = 0;
          else if (t > 0.97) d[o + 3] = Math.round(d[o + 3] * ((1.02 - t) / 0.05));
        }
      }
      ctx.putImageData(img, 0, 0);

      // Crop to opaque bbox → resize onto a clean 2:1 canvas
      let minX = sw, minY = sh, maxX = -1, maxY = -1;
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          if (d[(y * sw + x) * 4 + 3] > 16) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return;
      const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
      let cropW = Math.max(maxX - minX + 1, (maxY - minY + 1) * 2);
      let cropH = Math.round(cropW / 2);
      let left = Math.round(midX - cropW / 2);
      let top = Math.round(midY - cropH / 2);
      left = Math.max(0, left); top = Math.max(0, top);
      cropW = Math.min(cropW, sw - left); cropH = Math.min(cropH, sh - top);

      const outW = 512, outH = 256;
      const out = document.createElement("canvas");
      out.width = outW; out.height = outH;
      const octx = out.getContext("2d")!;
      octx.clearRect(0, 0, outW, outH);
      octx.drawImage(c, left, top, cropW, cropH, 0, 0, outW, outH);

      this.textures.remove(key);
      this.textures.addCanvas(key, out);
    } catch (e) {
      console.warn("punchLoadedIsoTile failed", key, e);
    }
  }

  /**
   * Iso diamond tile (or flat diamond fallback).
   * Display size is slightly oversized (+2/+1) so diamonds seal hairline seams.
   */
  private tileImg(key: string, x: number, y: number, fill: number, stroke?: number, strokeW = 2, depth = 0): any {
    let obj: any;
    if (this.textures.exists(key)) {
      // +2/+1 overlap kills sub-pixel gaps between abutting diamonds
      obj = this.add.image(x, y, key).setOrigin(0.5, 0.5).setDisplaySize(this.tileW + 2, this.tileH + 1);
    } else {
      obj = this.add.polygon(x, y, [
        0, -this.tileH / 2,
        this.tileW / 2, 0,
        0, this.tileH / 2,
        -this.tileW / 2, 0,
      ], fill);
      if (stroke !== undefined) obj.setStrokeStyle?.(strokeW, stroke);
    }
    obj.setDepth?.(depth);
    return obj;
  }

  /** Logical [col,row] → screen center for classic 2:1 dimetric iso. */
  private cell(c: number, r: number): [number, number] {
    return [
      this.ox + (c - r) * (this.tileW / 2),
      this.oy + (c + r) * (this.tileH / 2),
    ];
  }

  /**
   * Depth bands:
   *  - Floors stay in a LOW band so flat diamonds never clip tall sprites
   *  - Props / characters share an ENTITY band sorted by (c+r)
   */
  private floorDepth(c: number, r: number): number {
    return 1 + (c + r);
  }

  private depthAt(c: number, r: number, bias = 0): number {
    return 1000 + (c + r) * 10 + bias;
  }

  private depthForY(y: number): number {
    return 1000 + Math.round(((y - this.oy) / Math.max(1, this.tileH / 2)) * 10) + 5;
  }

  private isPerimeter(c: number, r: number) { const { cols, rows } = this.level.grid; return c === 0 || r === 0 || c === cols - 1 || r === rows - 1; }
  private interiorNeighbor(c: number, r: number): [number, number] {
    const { cols, rows } = this.level.grid;
    if (r === 0) return [c, 1]; if (r === rows - 1) return [c, rows - 2];
    if (c === 0) return [1, r]; return [cols - 2, r];
  }

  create() {
    const { width, height } = this.scale;
    const { cols, rows } = this.level.grid;
    const D = this.dpr;
    const padX = 36 * D;
    const padTop = 88 * D;
    const padBot = 100 * D;
    const availW = Math.max(120, width - padX * 2);
    const availH = Math.max(120, height - padTop - padBot);
    // Bounding diamond: W = (cols+rows)*tileW/2, H = (cols+rows)*tileH/2 with tileH=tileW/2
    const sum = cols + rows;
    this.tileW = Math.floor(Math.min((2 * availW) / sum, (4 * availH) / sum));
    this.tileW = Math.max(48, this.tileW);
    this.tileH = Math.floor(this.tileW / 2);
    this.tile = this.tileW; // interact radii / body scale in tile units
    // Center the iso map in the playfield
    this.ox = Math.floor(width / 2 - ((cols - 1) - (rows - 1)) * (this.tileW / 4));
    this.oy = Math.floor(padTop + availH / 2 - (cols + rows - 2) * (this.tileH / 4));

    this.cameras.main.setBackgroundColor("#3a2c22");
    this.physics.world.gravity.y = 0;
    const hasChroma = ensureChromaKeyPipeline(this.game);

    // Cut white corners off env tiles before placing (AI gens are often opaque JPEGs)
    for (const k of ["env_floor", "env_floor_dark", "env_wall", "env_counter"]) {
      this.punchLoadedIsoTile(k);
    }

    // Floor / wall diamonds — floors in a low depth band (never clip characters).
    // Perimeter "wall" tiles are still flat ground here, so they share the floor band.
    const cells: { c: number; r: number }[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ c, r });
    cells.sort((a, b) => (a.c + a.r) - (b.c + b.r) || a.r - b.r);
    for (const { c, r } of cells) {
      const [x, y] = this.cell(c, r);
      const d = this.floorDepth(c, r);
      if (this.isPerimeter(c, r)) {
        this.tileImg("env_wall", x, y, 0x8a6a48, 0x6b4f34, 2, d);
      } else {
        const light = (c + r) % 2 === 0;
        this.tileImg(light ? "env_floor" : "env_floor_dark", x, y, light ? 0xf3d9a8 : 0xe6c88a, undefined, 2, d);
      }
    }

    // Wall colliders — compact bodies at iso centers (not cartesian squares)
    this.walls = this.physics.add.staticGroup();
    const wallBody = Math.max(18, Math.floor(this.tileW * 0.28));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!this.isPerimeter(c, r)) continue;
      const [x, y] = this.cell(c, r);
      const w = this.add.rectangle(x, y, wallBody, wallBody, 0x000000, 0);
      this.walls.add(w); (w.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    }

    // Ingredient stations (entity band — always above floor diamonds)
    this.level.ingredients.forEach((ing, i) => {
      const [c, r] = ing.cell;
      const [x, y] = this.cell(c, r);
      const d = this.depthAt(c, r, 2);
      this.tileImg("env_counter", x, y, 0xbfa06a, 0x8a6a48, 3, d);
      // Sit prop slightly above tile center so it reads "on" the diamond
      const glyph = this.icon("ing_" + ing.id, x, y - this.tileH * 0.35, this.tileW * 0.62, ing.emoji);
      glyph.setDepth?.(d + 3);
      idleBob(this, glyph, this.tileH * 0.12, 720 + (i % 3) * 90, i * 130);
      this.playIdle("ing_" + ing.id, glyph);
      this.stations.push({ ing, cx: x, cy: y, glyph });
    });

    // Grandma
    const [gc, gr] = this.level.grandmaCell;
    [this.gcx, this.gcy] = this.cell(gc, gr);
    const gDepth = this.depthAt(gc, gr, 4);
    this.tileImg("env_counter", this.gcx, this.gcy, 0xc98a5a, 0x8a6a48, 3, gDepth);
    this.grandmaSize = this.tileW * 0.95;
    // Feet on tile: characters use center origin, so nudge up by ~⅓ tile height
    this.grandma = this.icon("char_grandma", this.gcx, this.gcy - this.tileH * 0.35, this.grandmaSize, "👵", true);
    this.grandma.setDepth?.(gDepth + 5);
    this.grandmaVids.clear();
    for (const row of allVideoClipRows().filter((r) => r.baseKey === "char_grandma")) {
      if (!this.cache.video.exists(row.key)) continue;
      const v = this.add.video(this.grandma.x, this.grandma.y, row.key)
        .setDepth(gDepth + 5).setVisible(false).setMute(true).setOrigin(0.5);
      v.setDisplaySize(this.grandmaSize, this.grandmaSize);
      if (hasChroma) v.setPipeline("ChromaKey");
      this.grandmaVids.set(row.key, v);
    }
    this.syncLoadedFacingFlags();
    const grandmaHasDir = !!this.resolveSpriteKeys("char_grandma", "idle", "s")
      || this.grandmaVids.size > 0;
    if (!grandmaHasDir) {
      idleBob(this, this.grandma, this.tileH * 0.1, 950);
    }
    this.setGrandmaAnim("idle");

    // Order bubble above grandma
    const bg = this.add.rectangle(0, 0, this.tileW * 0.7, this.tileW * 0.7, 0xffffff, 0.95).setStrokeStyle(4, 0xef6c4d);
    this.bubblePic = this.add.text(0, 0, "", { fontSize: `${Math.floor(this.tileW * 0.32)}px` }).setOrigin(0.5);
    this.bubble = this.add.container(this.gcx, this.grandma.y - this.tileW * 0.7, [bg, this.bubblePic]).setDepth(5000);

    // Player spawn — interior center (nudge up so feet sit on the diamond)
    const [px, py] = this.cell(Math.floor(cols / 2), Math.floor(rows / 2));
    const pDrawY = py - this.tileH * 0.35;
    this.playerSize = this.tileW * 1.05;
    this.player = this.icon("char_athena", px, pDrawY, this.playerSize, "🧑‍🍳", true);
    this.player.setDepth(this.depthForY(py));
    this.athenaVids.clear();
    for (const row of allVideoClipRows().filter((r) => r.baseKey === "char_athena")) {
      if (!this.cache.video.exists(row.key)) continue;
      const v = this.add.video(px, pDrawY, row.key)
        .setDepth(this.depthForY(py)).setVisible(false).setMute(true).setOrigin(0.5);
      v.setDisplaySize(this.playerSize, this.playerSize);
      if (hasChroma) v.setPipeline("ChromaKey");
      this.athenaVids.set(row.key, v);
    }
    this.setAnim("idle");
    this.physics.add.existing(this.player);
    this.sizeBody();
    this.physics.world.setBounds(0, 0, width, height);
    this.player.body.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.walls);
    this.scale.on("resize", (gs: Phaser.Structs.Size) => this.physics.world.setBounds(0, 0, gs.width, gs.height));
    this.carryIcon = this.add.text(px, py - this.tileW * 0.55, "", {
      fontSize: `${Math.floor(this.tileW * 0.28)}px`,
    }).setOrigin(0.5).setDepth(this.depthForY(py) + 1);

    // HUD
    this.timerText = this.add.text(width - 16 * D, 16 * D, "", { fontSize: `${Math.round(26 * D)}px`, fontFamily: "Nunito, sans-serif", color: "#fff", fontStyle: "bold" }).setOrigin(1, 0).setDepth(300);
    this.hintText = this.add.text(width / 2, height - 92 * D, "", { fontSize: `${Math.round(16 * D)}px`, fontFamily: "Nunito, sans-serif", color: "#ffe" }).setOrigin(0.5).setDepth(300);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.input.keyboard!.on("keydown-SPACE", () => this.onAction());
    this.input.keyboard!.on("keydown-B", () => { if (this.target) this.speak(this.target.word); });

    (window as any).__kitchen = {
      info: () => ({
        order: this.target?.word, carrying: this.carry?.word, orders: this.orders, won: this.ended,
        mode: this.level.mode, active: this.active?.kind, tex: this.player?.texture?.key,
        px: Math.round(this.player?.x), py: Math.round(this.player?.y),
        anim: this.animState, facing: this.facing, usingVideo: this.usingVideo, videoKey: this.activeVideoKey,
        grandmaAnim: this.grandmaAnimState, grandmaFacing: this.grandmaFacing,
        athenaClips: this.athenaAnimInventory(),
        tileW: this.tileW, tileH: this.tileH, loadedFacings: Array.from(this.loadedFacings),
        wbw: Math.round(this.physics.world.bounds.width), wbh: Math.round(this.physics.world.bounds.height),
        moveSpeed: this.tune.moveSpeed,
      }),
      listAnims: () => this.athenaAnimInventory(),
      playAnim: (name: string, facing?: IsoDir) => {
        if (facing) { this.facing = facing; this.ensureFacingLoaded("char_athena", facing); }
        const clip = videoClipFor("char_athena", name);
        if (clip?.kind === "oneshot") this.playOneShot(name);
        else { this.animLockUntil = 0; this.setAnim(name); }
        return this.animState;
      },
      playGrandmaAnim: (name: string, facing?: IsoDir) => {
        if (facing) { this.grandmaFacing = facing; this.ensureFacingLoaded("char_grandma", facing); }
        const clip = videoClipFor("char_grandma", name);
        if (clip?.kind === "oneshot") this.playGrandmaOneShot(name);
        else { this.grandmaAnimLockUntil = 0; this.setGrandmaAnim(name); }
        return this.grandmaAnimState;
      },
      setFacing: (d: IsoDir) => {
        this.facing = d;
        this.ensureFacingLoaded("char_athena", d);
        this.setAnim(this.animState.split(":")[0] || "idle");
      },
      warpToTarget: () => { if (!this.target) return; const st = this.stations.find((s) => s.ing.id === this.target!.id)!; const [nc, nr] = this.interiorNeighbor(st.ing.cell[0], st.ing.cell[1]); const [x, y] = this.cell(nc, nr); this.player.setPosition(x, y); (this.player.body as any).reset(x, y); },
      warpToGrandma: () => { const [nc, nr] = this.interiorNeighbor(this.level.grandmaCell[0], this.level.grandmaCell[1]); const [x, y] = this.cell(nc, nr); this.player.setPosition(x, y); (this.player.body as any).reset(x, y); },
      grab: () => { const st = this.stations.find((s) => s.ing.id === this.target?.id); if (st) this.pickup(st); },
      deliver: () => this.tryDeliver(),
    };

    // Warm other facings after first paint — keeps boot snappy
    this.time.delayedCall(0, () => this.prefetchOtherFacings());

    this.hooks.onTelemetry?.({ type: "level_start" });
    this.hooks.onSetGrammar?.([]);
    this.emitHud("running");
    this.time.delayedCall(500, () => this.newOrder());
  }

  /** Speak a word in the pleasant ElevenLabs voice (S3-cached per word). */
  private speak(text: string) {
    playWord(text, this.level.lang === "spanish" ? "spanish" : "russian");
  }

  private newOrder() {
    if (this.ended) return;
    const pool = this.level.ingredients.filter((i) => i.id !== this.target?.id);
    this.target = pool[Math.floor(Math.random() * pool.length)] || this.level.ingredients[0];
    this.orderStart = this.time.now;
    this.bubble.setVisible(true);
    popIn(this, this.bubble); // order bubble pops in
    const cue = (pose: string) => { if (this.time.now >= this.animLockUntil) this.playOneShot(pose); };
    if (this.level.mode === "listen") {
      this.bubblePic.setText("🔊"); this.speak(this.target.word); cue("listen");
      this.playGrandmaOneShot("listen");
    } else if (this.level.mode === "say") {
      this.bubblePic.setText(this.target.emoji); this.speak(this.target.word); cue("speak");
      this.playGrandmaOneShot("listen");
    } else { // flash
      this.bubblePic.setText(this.target.emoji);
      this.playGrandmaOneShot("listen");
      this.time.delayedCall(this.level.tuning.flashMs, () => { if (this.target && !this.ended) this.bubblePic.setText("❓"); });
    }
    this.updateHint();
  }

  private updateHint() {
    const m = this.level.mode;
    const run = " · Shift = бег";
    if (this.carry) this.hintText.setText((m === "say" ? "Отнеси бабушке и скажи слово" : "Отнеси бабушке (пробел)") + run);
    else this.hintText.setText((m === "listen" ? "Найди и возьми (пробел)" : "Найди и скажи слово, чтобы взять") + run);
  }

  private onAction() {
    if (this.ended) return;
    if (this.active?.kind === "pickup" && this.level.mode === "listen") this.pickup(this.active.st);
    else if (this.active?.kind === "deliver" && this.level.mode !== "say") this.tryDeliver();
  }

  attemptWord(word: string) {
    if (this.ended) return;
    const w = norm(word);
    if (this.active?.kind === "pickup" && (this.level.mode === "say" || this.level.mode === "flash")) {
      const ok = w === norm(this.active.st.ing.word);
      this.hooks.onTelemetry?.({ type: "utterance", word: this.active.st.ing.word, accepted: ok });
      if (ok) this.pickup(this.active.st);
    } else if (this.active?.kind === "deliver" && this.level.mode === "say" && this.carry) {
      const ok = w === norm(this.carry.word);
      this.hooks.onTelemetry?.({ type: "utterance", word: this.carry.word, accepted: ok });
      if (ok) this.tryDeliver();
    }
  }

  private pickup(st: Station) {
    this.carry = st.ing; this.carryIcon.setText(st.ing.emoji);
    this.beep(true);
    squash(this, st.glyph);        // item pops when grabbed
    squash(this, this.player, 0.18); // Athena little hop-squash
    this.carryTween?.stop(); this.carryIcon.setAngle(0);
    this.carryTween = carryWobble(this, this.carryIcon); // item wobbles overhead while carried
    // Switch into carry pose immediately when standing (walk/run keep locomotion clips).
    if (this.time.now >= this.animLockUntil) this.setAnim("carry");
    this.hooks.onTelemetry?.({ type: "clear", word: st.ing.word, meta: { action: "pickup" } });
    this.updateHint();
  }

  private stopCarryWobble() {
    this.carryTween?.stop(); this.carryTween = undefined; this.carryIcon.setAngle(0);
  }

  private tryDeliver() {
    if (!this.carry) return;
    if (this.target && this.carry.id === this.target.id) {
      this.orders++;
      this.beep(true);
      const latency = Math.round(this.time.now - this.orderStart);
      this.hooks.onTelemetry?.({ type: "utterance", word: this.target.word, accepted: true, latencyMs: latency, meta: { action: "deliver" } });
      this.hooks.onReward?.(1);
      happyBounce(this, this.grandma);
      this.playOneShot("celebrate"); // Athena jumps for joy (catalog lockMs)
      this.playGrandmaOneShot("celebrate");
      sparkle(this, this.gcx, this.gcy - this.tile * 0.2, this.tile);
      this.stopCarryWobble();
      this.carry = null; this.carryIcon.setText("");
      this.emitHud("running", this.target.word);
      if (this.orders >= this.level.win.orders) return this.win();
      this.newOrder();
    } else {
      this.misses++; this.beep(false);
      this.playOneShot("confused"); // gentle shrug (catalog lockMs)
      this.playGrandmaOneShot("confused");
      this.cameras.main.shake(120, 0.006);
      this.emitHud("running");
    }
  }

  update() {
    if (!this.player?.body || this.ended) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const running = this.shiftKey?.isDown;
    const s = this.tune.moveSpeed * this.dpr * (running ? 1.55 : 1);
    let vx = 0, vy = 0;
    if (this.cursors.left.isDown) vx = -1; else if (this.cursors.right.isDown) vx = 1;
    if (this.cursors.up.isDown) vy = -1; else if (this.cursors.down.isDown) vy = 1;
    const len = Math.hypot(vx, vy) || 1; body.setVelocity((vx / len) * s, (vy / len) * s);
    const moving = vx !== 0 || vy !== 0;
    if (moving) {
      this.facing = facingFromVelocity(vx, vy);
      this.ensureFacingLoaded("char_athena", this.facing);
    }
    // Locomotion covers every Athena loop clip: idle · walk · run · carry
    const moveClip = this.athenaLocomotion(moving, !!running);
    // Directional sprites/videos bake facing — don't flipX/lean like legacy stills
    if (!this.athenaFacingBaked(moveClip)) {
      walkLean(this.player, vx, moving);
    } else {
      this.player.setFlipX?.(false);
      this.player.setAngle(0);
    }
    // Locomotion SM (oneshots listen/speak/celebrate/confused lock this briefly)
    if (this.time.now >= this.animLockUntil) {
      this.setAnim(moveClip);
    }
    this.syncAthenaVideo();
    const pDepth = this.depthForY(this.player.y);
    this.player.setDepth?.(pDepth);
    this.athenaVids.forEach((v) => v.setDepth?.(pDepth));

    // Grandma faces Athena; idle unless a oneshot (celebrate/confused/listen) is locked
    this.grandmaFacing = this.facing4FromDelta(this.player.x - this.gcx, this.player.y - this.gcy);
    this.ensureFacingLoaded("char_grandma", this.grandmaFacing);
    if (this.time.now >= this.grandmaAnimLockUntil) {
      this.setGrandmaAnim("idle");
    }
    this.syncGrandmaVideo();

    this.carryIcon.setPosition(this.player.x, this.player.y - this.tileW * 0.45);
    this.carryIcon.setDepth(pDepth + 1);

    // proximity → active interaction (tileW ≈ diamond width)
    let ctx: Ctx = null;
    const near = this.tileW * this.tune.interactRadius;
    let best = Infinity, bestSt: Station | null = null;
    for (const st of this.stations) { const d = Math.hypot(st.cx - this.player.x, st.cy - this.player.y); if (d < near && d < best) { best = d; bestSt = st; } }
    const dG = Math.hypot(this.gcx - this.player.x, this.gcy - this.player.y);
    if (this.carry && dG < near) ctx = { kind: "deliver" };
    else if (bestSt) ctx = { kind: "pickup", st: bestSt };
    this.active = ctx;

    // dynamic grammar (only when voice is the action for this mode)
    let grammar: string[] = [];
    if (ctx?.kind === "pickup" && (this.level.mode === "say" || this.level.mode === "flash")) grammar = [ctx.st.ing.word];
    else if (ctx?.kind === "deliver" && this.level.mode === "say" && this.carry) grammar = [this.carry.word];
    const key = grammar.join("|");
    if (key !== this.lastGrammar) { this.lastGrammar = key; this.hooks.onSetGrammar?.(grammar); }

    // timer
    this.timeLeft -= this.game.loop.delta / 1000;
    this.timerText.setText("⏱ " + Math.max(0, Math.ceil(this.timeLeft)));
    if (this.timeLeft <= 0) this.timeUp();
  }

  private win() { this.finish("🎉 Молодец, Афина!"); }
  private timeUp() { this.finish(this.orders >= this.level.win.orders ? "🎉 Готово!" : "⏰ Время!"); }

  private finish(msg: string) {
    if (this.ended) return; this.ended = true;
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.hooks.onSetGrammar?.([]);
    this.hooks.onTelemetry?.({ type: "level_complete", ms: Math.round(this.level.tuning.timeSec * 1000 - this.timeLeft * 1000), meta: { orders: this.orders, misses: this.misses } });
    this.add.text(this.scale.width / 2, this.scale.height / 2, msg, {
      fontSize: `${Math.round(56 * this.dpr)}px`, fontFamily: "Nunito, sans-serif", color: "#fff", fontStyle: "bold", stroke: "#3a2c22", strokeThickness: 8 * this.dpr,
    }).setOrigin(0.5).setDepth(40);
    this.emitHud("won");
  }

  private emitHud(state: GameHud["state"], lastWord?: string) {
    this.hooks.onHud({ cleared: this.orders, total: this.level.win.orders, misses: this.misses, state, lastWord });
  }

  private beep(ok: boolean) {
    try {
      if (!this.sfxCtx) this.sfxCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const c = this.sfxCtx, o = c.createOscillator(), g = c.createGain();
      o.type = "square"; o.frequency.value = ok ? 680 : 170;
      g.gain.value = 0.0001; o.connect(g); g.connect(c.destination);
      const t = c.currentTime;
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (ok ? 0.14 : 0.3));
      o.start(t); o.stop(t + 0.32);
    } catch { /* ignore */ }
  }
}

function norm(s: string) { return s.toLowerCase().replace(/[^\wа-яё ]/gi, "").trim(); }
