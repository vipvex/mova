import Phaser from "phaser";
import type { ListenerLevel, ListenerCommand } from "@shared/listenerTypes";
import type { GameHud, GameHooks, EngineScene } from "@shared/gameTypes";

export class ListenerScene extends Phaser.Scene implements EngineScene {
  private level!: ListenerLevel;
  private hooks!: GameHooks;

  private char!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private simonBadge!: Phaser.GameObjects.Text;
  private timerBar!: Phaser.GameObjects.Rectangle;

  private cmd!: ListenerCommand;
  private isSimon = false;
  private responded = false;
  private pressedCorrect = false;
  private roundActive = false;
  private timeLeft = 0;

  private roundsPlayed = 0;
  private correct = 0;
  private misses = 0;
  private won = false;
  private sfxCtx: AudioContext | null = null;

  constructor() { super("listener"); }

  init(data: { level: ListenerLevel; hooks: GameHooks }) {
    this.level = data.level;
    this.hooks = data.hooks;
    this.roundsPlayed = 0; this.correct = 0; this.misses = 0; this.won = false;
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#101a30");
    this.simonBadge = this.add.text(width / 2, height * 0.24, "", {
      fontSize: "26px", fontFamily: "Nunito, sans-serif", color: "#facc15", fontStyle: "bold",
    }).setOrigin(0.5);
    this.promptText = this.add.text(width / 2, height * 0.4, "", {
      fontSize: "64px", fontFamily: "Nunito, sans-serif", color: "#fff", fontStyle: "bold",
    }).setOrigin(0.5);
    this.char = this.add.text(width / 2, height * 0.72, "🧒", { fontSize: "72px" }).setOrigin(0.5);
    this.timerBar = this.add.rectangle(0, 0, width, 8, 0x38bdf8).setOrigin(0, 0);
    this.add.text(width / 2, height * 0.9, "🎧 Слушай и нажимай (без голоса)", {
      fontSize: "16px", fontFamily: "Nunito, sans-serif", color: "#7c8bb0",
    }).setOrigin(0.5);

    this.input.keyboard?.on("keydown", (e: KeyboardEvent) => this.onKey(e.key));
    // test hook: lets a headless driver play correctly
    (window as any).__listener = () => ({ isSimon: this.isSimon, keys: this.cmd?.keys || [], active: this.roundActive });

    this.emitHud("ready");
    this.time.delayedCall(500, () => this.nextRound());
  }

  private speak(text: string) {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.level.lang === "spanish" ? "es-ES" : "ru-RU";
      u.rate = 0.95;
      synth.cancel(); synth.speak(u);
    } catch { /* ignore */ }
  }

  private nextRound() {
    if (this.won) return;
    this.cmd = this.level.commands[Math.floor(Math.random() * this.level.commands.length)];
    this.isSimon = Math.random() < 0.65;
    this.responded = false; this.pressedCorrect = false;
    this.timeLeft = this.level.tuning.windowSec;
    this.roundActive = true;

    const spoken = this.isSimon ? `${this.level.simonPhrase}: ${this.cmd.phrase}` : this.cmd.phrase;
    this.simonBadge.setText(this.isSimon ? this.level.simonPhrase : "…");
    this.simonBadge.setColor(this.isSimon ? "#22c55e" : "#f59e0b");
    this.promptText.setText(`${this.cmd.emoji || ""} ${this.cmd.phrase.toUpperCase()}`);
    this.speak(spoken);
  }

  private onKey(key: string) {
    if (!this.roundActive || this.responded) return;
    // any relevant d-pad key counts as "she acted"
    const dpad = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "w", "a", "s", "d"];
    if (!dpad.includes(key)) return;
    this.responded = true;
    this.pressedCorrect = this.cmd.keys.includes(key);
    // animate the character reacting
    this.tweens.add({ targets: this.char, y: this.char.y - 20, yoyo: true, duration: 120 });
    this.endRound();
  }

  // EngineScene contract (unused — voice-rest), kept for uniformity
  attemptWord() { /* listener is d-pad only */ }

  private endRound() {
    if (!this.roundActive) return;
    this.roundActive = false;
    let success: boolean;
    if (this.isSimon) success = this.responded && this.pressedCorrect; // obey correctly
    else success = !this.responded;                                    // ignore the trap
    if (success) { this.correct++; this.beep(true); }
    else { this.misses++; this.beep(false); this.cameras.main.shake(140, 0.006); }

    this.roundsPlayed++;
    this.emitHud("running");
    if (this.roundsPlayed >= this.level.win.rounds) return this.win();
    this.time.delayedCall(450, () => this.nextRound());
  }

  update(_t: number, deltaMs: number) {
    if (!this.roundActive || this.won) return;
    this.timeLeft -= deltaMs / 1000;
    this.timerBar.width = this.scale.width * Math.max(0, this.timeLeft / this.level.tuning.windowSec);
    if (this.timeLeft <= 0) this.endRound(); // timeout: no press → correct if trap, miss if simon
  }

  private win() {
    this.won = true; this.roundActive = false;
    this.add.text(this.scale.width / 2, this.scale.height / 2, "🎉 Молодец!", {
      fontSize: "64px", fontFamily: "Nunito, sans-serif", color: "#fff", fontStyle: "bold",
      stroke: "#101a30", strokeThickness: 8,
    }).setOrigin(0.5);
    this.emitHud("won");
  }

  private emitHud(state: GameHud["state"]) {
    this.hooks.onHud({ cleared: this.correct, total: this.level.win.rounds, misses: this.misses, state });
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
