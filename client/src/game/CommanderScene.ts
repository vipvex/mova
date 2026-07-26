import Phaser from "phaser";
import type { CommanderLevel } from "@shared/commanderTypes";
import type { GameHud, GameHooks, EngineScene } from "@shared/gameTypes";

export class CommanderScene extends Phaser.Scene implements EngineScene {
  private level!: CommanderLevel;
  private hooks!: GameHooks;

  private robot!: Phaser.GameObjects.Text;
  private cursor = 0;
  private startX = 0;
  private goalX = 0;
  private done = 0;
  private won = false;
  private sfxCtx: AudioContext | null = null;

  constructor() { super("commander"); }

  init(data: { level: CommanderLevel; hooks: GameHooks }) {
    this.level = data.level; this.hooks = data.hooks;
    this.cursor = 0; this.done = 0; this.won = false;
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#141d33");
    this.add.rectangle(0, height * 0.72, width * 2, height, 0x243252).setOrigin(0, 0);
    this.startX = 110; this.goalX = width - 110;
    this.add.text(this.goalX, height * 0.72, this.level.goalEmoji, { fontSize: "56px" }).setOrigin(0.5, 1);
    this.robot = this.add.text(this.startX, height * 0.72, "🤖", { fontSize: "56px" }).setOrigin(0.5, 1);

    // dev fallback: Space issues the currently-needed command (no mic)
    this.input.keyboard?.on("keydown-SPACE", () => this.attemptWord(this.level.steps[this.cursor]?.word));

    this.emitHud("ready");
    this.time.delayedCall(500, () => { this.telegraph(); });
  }

  private telegraph() {
    const step = this.level.steps[this.cursor];
    this.hooks.onNeedWord(step ? step.word : "");
  }

  attemptWord(word?: string) {
    if (this.won || !word) return;
    const step = this.level.steps[this.cursor];
    if (!step) return;
    if (word === step.word) {
      this.done++; this.cursor++;
      this.beep(true);
      const { height } = this.scale;
      // pop the action glyph, advance the robot toward the goal
      const pop = this.add.text(this.robot.x, height * 0.5, step.emoji, { fontSize: "40px" }).setOrigin(0.5);
      this.tweens.add({ targets: pop, y: pop.y - 40, alpha: 0, duration: 500, onComplete: () => pop.destroy() });
      const dx = (this.goalX - this.startX) / this.level.steps.length;
      this.tweens.add({ targets: this.robot, x: this.robot.x + dx, duration: 260, ease: "Quad.easeOut" });
      this.emitHud("running", step.word);
      if (this.done >= this.level.win.steps) return this.win();
      this.telegraph();
    } else {
      this.beep(false);
      this.tweens.add({ targets: this.robot, angle: 8, yoyo: true, duration: 70, repeat: 2 });
    }
  }

  private win() {
    this.won = true;
    this.tweens.add({ targets: this.robot, y: this.robot.y - 20, yoyo: true, duration: 160, repeat: 3 });
    this.add.text(this.scale.width / 2, this.scale.height / 2, "🎉 Готово!", {
      fontSize: "64px", fontFamily: "Nunito, sans-serif", color: "#fff", fontStyle: "bold",
      stroke: "#141d33", strokeThickness: 8,
    }).setOrigin(0.5);
    this.emitHud("won");
  }

  private emitHud(state: GameHud["state"], lastWord?: string) {
    this.hooks.onHud({ cleared: this.done, total: this.level.win.steps, misses: 0, state, lastWord });
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
