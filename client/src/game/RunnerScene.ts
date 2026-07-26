import Phaser from "phaser";
import type { RunnerLevel } from "@shared/runnerTypes";
import type { GameHud, GameHooks, EngineScene } from "@shared/gameTypes";

interface Ob {
  action: string;
  emoji: string;
  gfx: Phaser.GameObjects.Container;
  resolved: boolean;
  x: number;
}

const GROUND_FRAC = 0.78;
const CHAR_X = 150;

export class RunnerScene extends Phaser.Scene implements EngineScene {
  private level!: RunnerLevel;
  private hooks!: GameHooks;

  private char!: Phaser.GameObjects.Container;
  private charBody!: Phaser.GameObjects.Text;
  private obstacles: Ob[] = [];
  private groundY = 0;

  private speed = 0;
  private cleared = 0;
  private misses = 0;
  private sinceSpawnSec = 0;
  private queueIdx = 0;
  private running = false;
  private won = false;

  private motion: "none" | "jump" | "duck" = "none";
  private motionUntil = 0;
  private stunUntil = 0;
  private lastTelegraph = "";

  private sfxCtx: AudioContext | null = null;

  constructor() { super("runner"); }

  init(data: { level: RunnerLevel; hooks: GameHooks }) {
    this.level = data.level;
    this.hooks = data.hooks;
    this.speed = data.level.tuning.scrollPxPerSec;
    this.cleared = 0; this.misses = 0; this.sinceSpawnSec = 999; this.queueIdx = 0;
    this.obstacles = []; this.running = false; this.won = false;
    this.motion = "none"; this.stunUntil = 0;
  }

  create() {
    const { width, height } = this.scale;
    this.groundY = height * GROUND_FRAC;
    this.cameras.main.setBackgroundColor("#bfe3ff");

    // ground
    this.add.rectangle(0, this.groundY, width * 2, height, 0x6ab04c).setOrigin(0, 0);
    this.add.rectangle(0, this.groundY, width * 2, 6, 0x4e8b3a).setOrigin(0, 0);

    // character
    this.charBody = this.add.text(0, 0, "🏃", { fontSize: "56px" }).setOrigin(0.5, 1);
    this.char = this.add.container(CHAR_X, this.groundY, [this.charBody]);

    // input: keyboard fallback per action
    this.input.keyboard?.on("keydown", (e: KeyboardEvent) => {
      if (e.repeat) return;
      for (const a of this.level.actions) {
        if (a.keys?.includes(e.key)) { this.attemptAction(a.id); e.preventDefault(); break; }
      }
    });

    this.emitHud("ready");
    // brief countdown then go
    this.time.delayedCall(600, () => { this.running = true; this.emitHud("running"); });
  }

  /** Live tuning: override world speed (also affected by per-clear ramp). */
  setSpeed(px: number) { this.speed = px; }

  /** Called by the page when a level word is recognized by voice. */
  attemptWord(word: string, latencyMs?: number) {
    const a = this.level.actions.find((x) => x.word === word);
    if (a) this.attemptAction(a.id, word, latencyMs);
  }

  private attemptAction(actionId: string, word?: string, latencyMs?: number) {
    if (!this.running || this.won || this.time.now < this.stunUntil) return;
    const action = this.level.actions.find((a) => a.id === actionId);
    if (!action) return;

    // find nearest unresolved obstacle inside the action window around the hit line
    const windowPx = this.level.tuning.actionWindowSec * this.speed;
    let target: Ob | null = null; let best = Infinity;
    for (const o of this.obstacles) {
      if (o.resolved) continue;
      const d = Math.abs(o.x - CHAR_X);
      if (d <= windowPx && d < best) { best = d; target = o; }
    }

    this.playMotion(action.motion);

    if (target && target.action === actionId) {
      target.resolved = true;
      this.popObstacle(target);
      this.cleared++;
      this.speed += this.level.tuning.rampPerClear;
      this.beep(true);
      this.emitHud("running", word, latencyMs);
      if (this.cleared >= this.level.win.obstaclesToClear) this.win();
    } else {
      // wrong verb (or nothing in window): no clear. Just the motion plays.
      this.emitHud("running", word, latencyMs);
    }
  }

  private playMotion(m: "none" | "jump" | "duck") {
    if (m === "none") return;
    this.motion = m;
    this.motionUntil = this.time.now + 560;
    if (m === "jump") {
      this.tweens.add({ targets: this.char, y: this.groundY - 150, duration: 260, yoyo: true, ease: "Quad.easeOut" });
    } else {
      this.tweens.add({ targets: this.charBody, scaleY: 0.55, y: 0, duration: 120, yoyo: true, hold: 300 });
    }
  }

  private popObstacle(o: Ob) {
    this.tweens.add({ targets: o.gfx, scale: 1.6, alpha: 0, y: o.gfx.y - 40, duration: 260,
      onComplete: () => o.gfx.destroy() });
  }

  private bonk(o: Ob) {
    o.resolved = true;
    this.misses++;
    this.stunUntil = this.time.now + 900; // brief, then instant continue
    this.beep(false);
    this.cameras.main.shake(200, 0.01);
    // comic tumble
    this.tweens.add({ targets: this.char, angle: 360, duration: 500 });
    this.tweens.add({ targets: o.gfx, alpha: 0, angle: 90, y: o.gfx.y - 20, duration: 400,
      onComplete: () => o.gfx.destroy() });
    this.emitHud("running");
  }

  private spawn() {
    const { width } = this.scale;
    let ob: { action: string; emoji?: string };
    if (this.level.obstacles && this.level.obstacles.length) {
      ob = this.level.obstacles[this.queueIdx % this.level.obstacles.length];
      this.queueIdx++;
    } else {
      const a = this.level.actions[Math.floor(Math.random() * this.level.actions.length)];
      ob = { action: a.id, emoji: a.emoji };
    }
    const action = this.level.actions.find((a) => a.id === ob.action)!;
    const emoji = ob.emoji || action.emoji;
    const isDuck = action.motion === "duck";
    const y = isDuck ? this.groundY - 120 : this.groundY;

    const glyph = this.add.text(0, 0, emoji, { fontSize: "50px" }).setOrigin(0.5, 1);
    const label = this.add.text(0, isDuck ? 34 : -70, action.word, {
      fontSize: "30px", fontFamily: "Nunito, system-ui, sans-serif", color: "#0b2b4a",
      fontStyle: "bold", backgroundColor: "#ffffffcc", padding: { x: 8, y: 3 },
    }).setOrigin(0.5, isDuck ? 0 : 1);
    const gfx = this.add.container(width + 60, y, [glyph, label]);

    this.obstacles.push({ action: ob.action, emoji, gfx, resolved: false, x: width + 60 });
  }

  update(_t: number, deltaMs: number) {
    if (!this.running || this.won) return;
    const dt = deltaMs / 1000;

    // spawn cadence
    this.sinceSpawnSec += dt;
    if (this.sinceSpawnSec >= this.level.tuning.spawnGapSec &&
        (this.cleared + this.activeUnresolved()) < this.level.win.obstaclesToClear) {
      this.sinceSpawnSec = 0; this.spawn();
    }

    const dx = this.speed * dt;
    let telegraph = "";
    let nearest = Infinity;
    for (const o of this.obstacles) {
      o.x -= dx; o.gfx.x = o.x;
      if (!o.resolved) {
        // choose the closest approaching obstacle to telegraph
        const ahead = o.x - CHAR_X;
        if (ahead > -20 && ahead < nearest) { nearest = ahead; telegraph = this.wordFor(o.action); }
        // collision if it reaches the character un-cleared
        if (o.x <= CHAR_X - 6) this.bonk(o);
      }
      if (o.x < -80) o.gfx.destroy();
    }
    this.obstacles = this.obstacles.filter((o) => o.gfx.active);

    if (telegraph !== this.lastTelegraph) { this.lastTelegraph = telegraph; this.hooks.onNeedWord(telegraph); }
  }

  private activeUnresolved() { return this.obstacles.filter(o => !o.resolved).length; }
  private wordFor(actionId: string) { return this.level.actions.find(a => a.id === actionId)?.word || ""; }

  private win() {
    this.won = true; this.running = false;
    this.add.text(this.scale.width / 2, this.scale.height / 2, "🎉 Молодец!", {
      fontSize: "72px", fontFamily: "Nunito, sans-serif", color: "#fff", fontStyle: "bold",
      stroke: "#0b2b4a", strokeThickness: 8,
    }).setOrigin(0.5);
    this.emitHud("won");
  }

  private emitHud(state: GameHud["state"], lastWord?: string, lastLatencyMs?: number) {
    this.hooks.onHud({
      cleared: this.cleared, total: this.level.win.obstaclesToClear,
      misses: this.misses, state, lastWord, lastLatencyMs,
    });
  }

  private beep(ok: boolean) {
    try {
      if (!this.sfxCtx) this.sfxCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const c = this.sfxCtx, o = c.createOscillator(), g = c.createGain();
      o.type = "square"; o.frequency.value = ok ? 660 : 180;
      g.gain.value = 0.0001; o.connect(g); g.connect(c.destination);
      const t = c.currentTime;
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (ok ? 0.14 : 0.3));
      o.start(t); o.stop(t + 0.32);
    } catch { /* ignore */ }
  }
}
