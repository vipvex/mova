import Phaser from "phaser";
import type { CatcherLevel } from "@shared/catcherTypes";
import type { GameHud, GameHooks, EngineScene } from "@shared/gameTypes";

interface FallingItem {
  word: string;
  emoji: string;
  gfx: Phaser.GameObjects.Container;
  y: number;
  x: number;
  caught: boolean;
}

const TOP = 60;

export class CatcherScene extends Phaser.Scene implements EngineScene {
  private level!: CatcherLevel;
  private hooks!: GameHooks;

  private basket!: Phaser.GameObjects.Text;
  private items: FallingItem[] = [];
  private groundY = 0;
  private speed = 0;
  private caught = 0;
  private misses = 0;
  private sinceSpawnSec = 0;
  private running = false;
  private won = false;
  private sfxCtx: AudioContext | null = null;

  constructor() { super("catcher"); }

  init(data: { level: CatcherLevel; hooks: GameHooks }) {
    this.level = data.level;
    this.hooks = data.hooks;
    this.speed = data.level.tuning.fallPxPerSec;
    this.caught = 0; this.misses = 0; this.sinceSpawnSec = 999;
    this.items = []; this.running = false; this.won = false;
  }

  create() {
    const { width, height } = this.scale;
    this.groundY = height * 0.86;
    this.cameras.main.setBackgroundColor("#fff4e6");
    this.add.rectangle(0, this.groundY, width * 2, height, 0xf1c27d).setOrigin(0, 0);
    this.basket = this.add.text(width / 2, this.groundY + 6, "🧺", { fontSize: "60px" }).setOrigin(0.5, 0);

    this.emitHud("ready");
    this.time.delayedCall(600, () => { this.running = true; this.emitHud("running"); });
    this.hooks.onNeedWord(""); // catcher = recall from the picture; no verbal telegraph
  }

  setSpeed(px: number) { this.speed = px; }

  attemptWord(word: string, latencyMs?: number) {
    if (!this.running || this.won) return;
    // catch the LOWEST falling item matching this word
    let target: FallingItem | null = null; let lowest = -Infinity;
    for (const it of this.items) {
      if (it.caught || it.word !== word) continue;
      if (it.y > lowest) { lowest = it.y; target = it; }
    }
    if (target) {
      target.caught = true;
      this.caught++;
      this.speed += this.level.tuning.rampPerCatch;
      this.beep(true);
      // zip to basket
      this.tweens.add({ targets: target.gfx, x: this.scale.width / 2, y: this.groundY,
        scale: 0.4, duration: 220, ease: "Quad.easeIn", onComplete: () => target!.gfx.destroy() });
      this.tweens.add({ targets: this.basket, scaleX: 1.25, scaleY: 0.8, duration: 90, yoyo: true });
      this.emitHud("running", word, latencyMs);
      if (this.caught >= this.level.win.itemsToCatch) this.win();
    } else {
      this.emitHud("running", word, latencyMs); // said a name with nothing matching falling — no-op
    }
  }

  private spawn() {
    const { width } = this.scale;
    const item = this.level.items[Math.floor(Math.random() * this.level.items.length)];
    const x = 60 + Math.random() * (width - 120);
    const glyph = this.add.text(0, 0, item.emoji, { fontSize: "52px" }).setOrigin(0.5);
    const kids: Phaser.GameObjects.GameObject[] = [glyph];
    if (this.level.showLabels) {
      kids.push(this.add.text(0, 40, item.word, {
        fontSize: "24px", fontFamily: "Nunito, system-ui, sans-serif", color: "#5a3210",
        fontStyle: "bold", backgroundColor: "#ffffffcc", padding: { x: 6, y: 2 },
      }).setOrigin(0.5));
    }
    const gfx = this.add.container(x, TOP, kids);
    this.items.push({ word: item.word, emoji: item.emoji, gfx, y: TOP, x, caught: false });
  }

  update(_t: number, deltaMs: number) {
    if (!this.running || this.won) return;
    const dt = deltaMs / 1000;
    this.sinceSpawnSec += dt;
    if (this.sinceSpawnSec >= this.level.tuning.spawnGapSec &&
        (this.caught + this.activeUncaught()) < this.level.win.itemsToCatch) {
      this.sinceSpawnSec = 0; this.spawn();
    }
    const dy = this.speed * dt;
    for (const it of this.items) {
      if (it.caught) continue;
      it.y += dy; it.gfx.y = it.y;
      if (it.y >= this.groundY - 10) { this.splat(it); }
    }
    this.items = this.items.filter((it) => it.gfx.active);
  }

  private splat(it: FallingItem) {
    it.caught = true;
    this.misses++;
    this.beep(false);
    this.tweens.add({ targets: it.gfx, scaleX: 1.5, scaleY: 0.3, alpha: 0, duration: 260,
      onComplete: () => it.gfx.destroy() });
    this.emitHud("running");
  }

  private activeUncaught() { return this.items.filter((it) => !it.caught).length; }

  private win() {
    this.won = true; this.running = false;
    this.add.text(this.scale.width / 2, this.scale.height / 2, "🎉 Молодец!", {
      fontSize: "72px", fontFamily: "Nunito, sans-serif", color: "#fff", fontStyle: "bold",
      stroke: "#5a3210", strokeThickness: 8,
    }).setOrigin(0.5);
    this.emitHud("won");
  }

  private emitHud(state: GameHud["state"], lastWord?: string, lastLatencyMs?: number) {
    this.hooks.onHud({ cleared: this.caught, total: this.level.win.itemsToCatch,
      misses: this.misses, state, lastWord, lastLatencyMs });
  }

  private beep(ok: boolean) {
    try {
      if (!this.sfxCtx) this.sfxCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const c = this.sfxCtx, o = c.createOscillator(), g = c.createGain();
      o.type = "square"; o.frequency.value = ok ? 720 : 160;
      g.gain.value = 0.0001; o.connect(g); g.connect(c.destination);
      const t = c.currentTime;
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (ok ? 0.14 : 0.3));
      o.start(t); o.stop(t + 0.32);
    } catch { /* ignore */ }
  }
}
