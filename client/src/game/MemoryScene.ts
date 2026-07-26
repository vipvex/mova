import Phaser from "phaser";
import type { MemoryLevel } from "@shared/memoryTypes";
import type { GameHud, GameHooks, EngineScene } from "@shared/gameTypes";

interface Card {
  word: string; emoji: string;
  faceUp: boolean; matched: boolean;
  front: Phaser.GameObjects.Text; back: Phaser.GameObjects.Container;
  container: Phaser.GameObjects.Container;
}

export class MemoryScene extends Phaser.Scene implements EngineScene {
  private level!: MemoryLevel;
  private hooks!: GameHooks;

  private cards: Card[] = [];
  private firstIdx: number | null = null;
  private secondIdx: number | null = null;
  private pending: string | null = null;   // a matched pair awaiting its name
  private collected = 0;
  private locked = false;
  private won = false;
  private sfxCtx: AudioContext | null = null;

  constructor() { super("memory"); }

  init(data: { level: MemoryLevel; hooks: GameHooks }) {
    this.level = data.level; this.hooks = data.hooks;
    this.cards = []; this.firstIdx = this.secondIdx = null; this.pending = null;
    this.collected = 0; this.locked = false; this.won = false;
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#1a1230");
    const pairs = Math.min(this.level.win.pairs, this.level.items.length);
    const deck = this.level.items.slice(0, pairs).flatMap((it) => [it, it]);
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }

    const cols = Math.min(4, deck.length);
    const rows = Math.ceil(deck.length / cols);
    const cw = 120, ch = 150, gx = 16, gy = 16;
    const totalW = cols * cw + (cols - 1) * gx;
    const x0 = (width - totalW) / 2 + cw / 2;
    const y0 = height * 0.3;

    deck.forEach((it, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = x0 + col * (cw + gx), y = y0 + row * (ch + gy);
      const bg = this.add.rectangle(0, 0, cw, ch, 0x3b2f66).setStrokeStyle(3, 0x8b5cf6);
      const num = this.add.text(0, 0, String(i + 1), { fontSize: "40px", fontFamily: "Nunito, sans-serif", color: "#c4b5fd", fontStyle: "bold" }).setOrigin(0.5);
      const back = this.add.container(0, 0, [bg, num]);
      const front = this.add.text(0, 0, it.emoji, { fontSize: "64px" }).setOrigin(0.5).setVisible(false);
      const container = this.add.container(x, y, [back, front]);
      container.setSize(cw, ch).setInteractive().on("pointerdown", () => this.flip(i));
      this.cards.push({ word: it.word, emoji: it.emoji, faceUp: false, matched: false, front, back, container });
    });

    this.input.keyboard?.on("keydown", (e: KeyboardEvent) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= this.cards.length) this.flip(n - 1);
    });
    // test hook
    (window as any).__memory = () => ({
      pending: this.pending,
      cards: this.cards.map((c, i) => ({ k: i + 1, word: c.word, up: c.faceUp, matched: c.matched })),
    });

    this.emitHud("ready");
  }

  private setFace(c: Card, up: boolean) {
    c.faceUp = up; c.front.setVisible(up); c.back.setVisible(!up);
  }

  private flip(idx: number) {
    if (this.won || this.locked || this.pending) return;
    const c = this.cards[idx];
    if (!c || c.matched || c.faceUp) return;
    this.setFace(c, true);
    this.beep(true);
    if (this.firstIdx === null) { this.firstIdx = idx; return; }
    this.secondIdx = idx;
    const a = this.cards[this.firstIdx], b = this.cards[idx];
    if (a.word === b.word) {
      // a pair — must NAME it to collect
      this.pending = a.word;
      this.hooks.onNeedWord(a.word);
      // safety: auto-collect if not named in time (avoids soft-lock)
      this.time.delayedCall(3200, () => { if (this.pending === a.word) this.collect(a.word); });
    } else {
      this.locked = true;
      this.time.delayedCall(750, () => {
        this.setFace(a, false); this.setFace(b, false);
        this.firstIdx = this.secondIdx = null; this.locked = false;
      });
    }
  }

  attemptWord(word: string) {
    if (this.pending && word === this.pending) this.collect(word);
  }

  private collect(word: string) {
    if (this.pending !== word) return;
    const first = this.firstIdx, second = this.secondIdx;
    if (first === null || second === null) return;
    [first, second].forEach((i) => {
      const c = this.cards[i];
      c.matched = true;
      this.tweens.add({ targets: c.container, scale: 1.1, alpha: 0.55, duration: 220 });
    });
    this.collected++;
    this.pending = null; this.firstIdx = this.secondIdx = null;
    this.hooks.onNeedWord("");
    this.beep(true);
    this.emitHud("running", word);
    if (this.collected >= Math.min(this.level.win.pairs, this.level.items.length)) this.win();
  }

  private win() {
    this.won = true;
    this.add.text(this.scale.width / 2, this.scale.height * 0.85, "🎉 Все пары!", {
      fontSize: "48px", fontFamily: "Nunito, sans-serif", color: "#fff", fontStyle: "bold",
      stroke: "#1a1230", strokeThickness: 8,
    }).setOrigin(0.5);
    this.emitHud("won");
  }

  private emitHud(state: GameHud["state"], lastWord?: string) {
    this.hooks.onHud({ cleared: this.collected, total: Math.min(this.level.win.pairs, this.level.items.length), misses: 0, state, lastWord });
  }

  private beep(ok: boolean) {
    try {
      if (!this.sfxCtx) this.sfxCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const c = this.sfxCtx, o = c.createOscillator(), g = c.createGain();
      o.type = "square"; o.frequency.value = ok ? 680 : 170;
      g.gain.value = 0.0001; o.connect(g); g.connect(c.destination);
      const t = c.currentTime;
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.start(t); o.stop(t + 0.2);
    } catch { /* ignore */ }
  }
}
