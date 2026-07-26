import Phaser from "phaser";
import type { BuilderLevel } from "@shared/builderTypes";
import type { GameHud, GameHooks, EngineScene } from "@shared/gameTypes";

export class BuilderScene extends Phaser.Scene implements EngineScene {
  private level!: BuilderLevel;
  private hooks!: GameHooks;

  private hero!: Phaser.GameObjects.Text;
  private tiles: Phaser.GameObjects.Container[] = [];
  private planks: Phaser.GameObjects.Rectangle[] = [];
  private sIdx = 0;
  private wIdx = 0;
  private doneSentences = 0;
  private misses = 0;
  private won = false;
  private gapX0 = 0; private gapX1 = 0; private groundY = 0;
  private sfxCtx: AudioContext | null = null;

  constructor() { super("builder"); }

  init(data: { level: BuilderLevel; hooks: GameHooks }) {
    this.level = data.level; this.hooks = data.hooks;
    this.sIdx = 0; this.wIdx = 0; this.doneSentences = 0; this.misses = 0; this.won = false;
    this.tiles = []; this.planks = [];
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#0e2233");
    this.groundY = height * 0.66;
    // two cliffs with a gap between
    this.gapX0 = width * 0.22; this.gapX1 = width * 0.82;
    this.add.rectangle(0, this.groundY, this.gapX0, height, 0x2e5d47).setOrigin(0, 0);
    this.add.rectangle(this.gapX1, this.groundY, width - this.gapX1, height, 0x2e5d47).setOrigin(0, 0);
    this.hero = this.add.text(this.gapX0 - 30, this.groundY, "🧒", { fontSize: "48px" }).setOrigin(0.5, 1);

    this.input.keyboard?.on("keydown-SPACE", () => this.attemptWord(this.currentWord()));

    this.emitHud("ready");
    this.time.delayedCall(400, () => this.startSentence());
  }

  private currentWord() { return this.level.sentences[this.sIdx]?.[this.wIdx]; }

  private startSentence() {
    this.tiles.forEach((t) => t.destroy()); this.tiles = [];
    this.planks.forEach((p) => p.destroy()); this.planks = [];
    this.hero.x = this.gapX0 - 30;
    this.wIdx = 0;
    this.hooks.onNeedWord(this.currentWord() || "");
  }

  attemptWord(word?: string) {
    if (this.won || !word) return;
    const sentence = this.level.sentences[this.sIdx];
    if (!sentence) return;
    if (word === sentence[this.wIdx]) {
      this.beep(true);
      this.layPlank(this.wIdx, sentence.length, word);
      this.wIdx++;
      if (this.wIdx >= sentence.length) return this.completeSentence();
      this.hooks.onNeedWord(this.currentWord() || "");
    } else {
      this.misses++;
      this.beep(false);
      if (this.planks.length) this.tweens.add({ targets: this.planks[this.planks.length - 1], angle: 8, yoyo: true, duration: 80, repeat: 2 });
      this.emitHud("running");
    }
  }

  private layPlank(i: number, n: number, word: string) {
    const span = this.gapX1 - this.gapX0;
    const w = span / n;
    const x = this.gapX0 + w * i;
    const plank = this.add.rectangle(x, this.groundY + 6, w - 4, 14, 0xb5651d).setOrigin(0, 0).setStrokeStyle(2, 0x000000, 0.2);
    this.planks.push(plank);
    // show the spoken word as a tile above
    const tile = this.add.container(x + w / 2, this.groundY - 60, [
      this.add.rectangle(0, 0, Math.max(60, word.length * 16), 34, 0x1e3a5f).setStrokeStyle(2, 0x60a5fa),
      this.add.text(0, 0, word, { fontSize: "20px", fontFamily: "Nunito, sans-serif", color: "#fff", fontStyle: "bold" }).setOrigin(0.5),
    ]);
    this.tiles.push(tile);
    this.tweens.add({ targets: tile, y: tile.y - 8, duration: 120, yoyo: true });
  }

  private completeSentence() {
    // hero walks across the finished bridge
    this.tweens.add({ targets: this.hero, x: this.gapX1 + 30, duration: 700, ease: "Sine.easeInOut" });
    this.doneSentences++;
    this.emitHud("running", "✓");
    if (this.doneSentences >= this.level.win.sentences) return this.time.delayedCall(700, () => this.win());
    this.sIdx++;
    this.time.delayedCall(850, () => this.startSentence());
  }

  private win() {
    this.won = true;
    this.add.text(this.scale.width / 2, this.scale.height / 2, "🎉 Мост готов!", {
      fontSize: "56px", fontFamily: "Nunito, sans-serif", color: "#fff", fontStyle: "bold",
      stroke: "#0e2233", strokeThickness: 8,
    }).setOrigin(0.5);
    this.emitHud("won");
  }

  private emitHud(state: GameHud["state"], lastWord?: string) {
    this.hooks.onHud({ cleared: this.doneSentences, total: this.level.win.sentences, misses: this.misses, state, lastWord });
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
