import Phaser from "phaser";
import type { GateLevel, GateChoice } from "@shared/gateTypes";
import type { GameHud, GameHooks, EngineScene } from "@shared/gameTypes";

export class GateScene extends Phaser.Scene implements EngineScene {
  private level!: GateLevel;
  private hooks!: GameHooks;

  private char!: Phaser.GameObjects.Text;
  private doors: { choice: GateChoice; container: Phaser.GameObjects.Container; x: number }[] = [];
  private targetIdx = 0;
  private timerBar!: Phaser.GameObjects.Rectangle;
  private timeLeft = 0;
  private roundActive = false;

  private cleared = 0;
  private misses = 0;
  private won = false;
  private sfxCtx: AudioContext | null = null;

  constructor() { super("gate"); }

  init(data: { level: GateLevel; hooks: GameHooks }) {
    this.level = data.level;
    this.hooks = data.hooks;
    this.cleared = 0; this.misses = 0; this.won = false; this.doors = [];
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#2a2140");
    this.add.rectangle(0, height * 0.82, width * 2, height, 0x3a2f52).setOrigin(0, 0);
    this.char = this.add.text(width / 2, height * 0.82, "🧒", { fontSize: "56px" }).setOrigin(0.5, 1);
    this.timerBar = this.add.rectangle(0, 0, width, 8, 0xffd166).setOrigin(0, 0);

    this.input.keyboard?.on("keydown", (e: KeyboardEvent) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= this.doors.length) this.pick(n - 1);
    });

    this.emitHud("ready");
    this.time.delayedCall(500, () => this.nextRound());
  }

  private nextRound() {
    if (this.won) return;
    this.doors.forEach((d) => d.container.destroy());
    this.doors = [];
    const { width, height } = this.scale;
    const per = Math.min(this.level.gatesPerScreen ?? 3, this.level.choices.length);
    const pool = [...this.level.choices].sort(() => Math.random() - 0.5).slice(0, per);
    this.targetIdx = Math.floor(Math.random() * pool.length);

    const gap = width / (per + 1);
    pool.forEach((choice, i) => {
      const x = gap * (i + 1), y = height * 0.4;
      const door = this.add.rectangle(0, 0, 130, 200, Phaser.Display.Color.HexStringToColor(choice.color || "#8b5cf6").color)
        .setStrokeStyle(4, 0x000000, 0.25);
      const knob = this.add.circle(45, 0, 8, 0xffffff, 0.8);
      const glyph = this.add.text(0, -30, choice.emoji, { fontSize: "48px" }).setOrigin(0.5);
      const label = this.add.text(0, 60, choice.word, {
        fontSize: "24px", fontFamily: "Nunito, system-ui, sans-serif", color: "#fff",
        fontStyle: "bold", backgroundColor: "#00000055", padding: { x: 8, y: 3 },
      }).setOrigin(0.5);
      const container = this.add.container(x, y, [door, knob, glyph, label]);
      this.doors.push({ choice, container, x });
    });

    this.timeLeft = this.level.tuning.decideSec;
    this.roundActive = true;
    this.hooks.onNeedWord(this.doors[this.targetIdx].choice.word); // telegraph the target descriptor
  }

  attemptWord(word: string) {
    if (!this.roundActive || this.won) return;
    const idx = this.doors.findIndex((d) => d.choice.word === word);
    if (idx >= 0) this.pick(idx);
  }

  private pick(idx: number) {
    if (!this.roundActive || this.won) return;
    this.roundActive = false;
    const door = this.doors[idx];
    // walk the character to the chosen door
    this.tweens.add({ targets: this.char, x: door.x, duration: 220 });

    if (idx === this.targetIdx) {
      this.cleared++;
      this.beep(true);
      this.tweens.add({ targets: door.container, y: door.container.y - 30, alpha: 0, duration: 260 });
      this.emitHud("running", door.choice.word);
      if (this.cleared >= this.level.win.gatesToClear) return this.win();
    } else {
      this.misses++;
      this.beep(false);
      this.cameras.main.shake(160, 0.008);
      this.tweens.add({ targets: door.container, angle: 6, yoyo: true, duration: 80, repeat: 2 });
      this.emitHud("running");
    }
    this.time.delayedCall(360, () => this.nextRound());
  }

  update(_t: number, deltaMs: number) {
    if (!this.roundActive || this.won) return;
    this.timeLeft -= deltaMs / 1000;
    this.timerBar.width = this.scale.width * Math.max(0, this.timeLeft / this.level.tuning.decideSec);
    if (this.timeLeft <= 0) {
      this.roundActive = false;
      this.misses++;
      this.beep(false);
      this.emitHud("running");
      this.time.delayedCall(200, () => this.nextRound());
    }
  }

  private win() {
    this.won = true; this.roundActive = false;
    this.add.text(this.scale.width / 2, this.scale.height / 2, "🎉 Молодец!", {
      fontSize: "72px", fontFamily: "Nunito, sans-serif", color: "#fff", fontStyle: "bold",
      stroke: "#2a2140", strokeThickness: 8,
    }).setOrigin(0.5);
    this.emitHud("won");
  }

  private emitHud(state: GameHud["state"], lastWord?: string) {
    this.hooks.onHud({ cleared: this.cleared, total: this.level.win.gatesToClear, misses: this.misses, state, lastWord });
  }

  private beep(ok: boolean) {
    try {
      if (!this.sfxCtx) this.sfxCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const c = this.sfxCtx, o = c.createOscillator(), g = c.createGain();
      o.type = "square"; o.frequency.value = ok ? 700 : 170;
      g.gain.value = 0.0001; o.connect(g); g.connect(c.destination);
      const t = c.currentTime;
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (ok ? 0.14 : 0.3));
      o.start(t); o.stop(t + 0.32);
    } catch { /* ignore */ }
  }
}
