import Phaser from "phaser";
import { idleBob, squash, carryWobble, happyBounce, popIn, sparkle, walkLean } from "./anims";

/** A live gallery of every juice helper in anims.ts, running the REAL functions on
 *  the REAL house-style sprites — so what you see here is exactly what the games do.
 *  Loops run continuously; one-shots auto-replay on a timer (or via window.__anim.replay). */

type Kind = "idlebob" | "squash" | "wobble" | "bounce" | "popin" | "sparkle" | "walk";
interface Demo { key: string; emoji: string; label: string; kind: Kind; }

const DEMOS: Demo[] = [
  { key: "char_grandma", emoji: "👵", label: "Idle bob", kind: "idlebob" },
  { key: "ing_apple",    emoji: "🍎", label: "Idle bob · item", kind: "idlebob" },
  { key: "char_athena",  emoji: "🧑‍🍳", label: "Squash · pickup", kind: "squash" },
  { key: "ing_bread",    emoji: "🍞", label: "Carry wobble", kind: "wobble" },
  { key: "char_athena",  emoji: "🧑‍🍳", label: "Happy bounce · deliver", kind: "bounce" },
  { key: "ing_cheese",   emoji: "🧀", label: "Pop-in · new order", kind: "popin" },
  { key: "ing_milk",     emoji: "🥛", label: "Sparkle burst", kind: "sparkle" },
  { key: "char_athena",  emoji: "🧑‍🍳", label: "Walk lean + flip", kind: "walk" },
];

export class AnimPreviewScene extends Phaser.Scene {
  private assets: Record<string, string> = {};
  private oneShots: Array<() => void> = [];
  private walk?: { spr: any; cx: number; range: number; dir: number; speed: number };

  constructor() { super("animpreview"); }

  init(data: { assets?: Record<string, string> }) { this.assets = data.assets || {}; this.oneShots = []; this.walk = undefined; }

  preload() {
    for (const k of Array.from(new Set(DEMOS.map((d) => d.key)))) { const u = this.assets[k]; if (u) this.load.image(k, u); }
  }

  private icon(key: string, x: number, y: number, sizePx: number, emoji: string): any {
    if (this.textures.exists(key)) {
      const img = this.add.image(x, y, key).setDisplaySize(sizePx, sizePx);
      (img as any).__base = img.scaleX; // remember base scale for absolute-scale helpers
      return img;
    }
    const t = this.add.text(x, y, emoji, { fontSize: `${Math.floor(sizePx * 0.9)}px` }).setOrigin(0.5);
    (t as any).__base = 1;
    return t;
  }

  create() {
    const { width, height } = this.scale;
    const cols = 4, rows = 2;
    const cw = width / cols, ch = height / rows;
    const size = Math.floor(Math.min(cw, ch) * 0.4);

    DEMOS.forEach((d, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const cx = col * cw + cw / 2, cy = row * ch + ch / 2 - 8;

      // card
      this.add.rectangle(cx, cy, cw - 16, ch - 16, 0x131a2e).setStrokeStyle(1, 0x263352);
      this.add.text(cx, cy + ch / 2 - 26, d.label, { fontSize: "13px", fontFamily: "Nunito, sans-serif", color: "#9fb0d0", fontStyle: "bold" }).setOrigin(0.5);

      const spr = this.icon(d.key, cx, cy - 6, size, d.emoji);
      this.attach(d.kind, spr, cx, cy - 6, size);
    });

    // auto-replay one-shots every 1.5s + expose a manual trigger
    this.time.addEvent({ delay: 1500, loop: true, callback: () => this.replay() });
    this.time.delayedCall(300, () => this.replay());
    (window as any).__anim = { replay: () => this.replay() };
  }

  private replay() { for (const fn of this.oneShots) fn(); }

  private attach(kind: Kind, spr: any, cx: number, cy: number, size: number) {
    switch (kind) {
      case "idlebob":
        idleBob(this, spr, size * 0.14, 780 + Math.random() * 200);
        break;
      case "wobble":
        carryWobble(this, spr);
        break;
      case "squash":
        this.oneShots.push(() => squash(this, spr, 0.22));
        break;
      case "bounce":
        this.oneShots.push(() => { happyBounce(this, spr); sparkle(this, cx, cy, size); });
        break;
      case "popin": {
        const base = spr.__base ?? 1;
        this.oneShots.push(() => popIn(this, spr, base));
        break;
      }
      case "sparkle":
        this.oneShots.push(() => sparkle(this, cx, cy, size, 6));
        break;
      case "walk":
        this.walk = { spr, cx, range: size * 0.9, dir: 1, speed: 70 };
        break;
    }
  }

  update() {
    if (!this.walk) return;
    const w = this.walk;
    w.spr.x += w.dir * w.speed * (this.game.loop.delta / 1000);
    if (w.spr.x > w.cx + w.range) w.dir = -1;
    else if (w.spr.x < w.cx - w.range) w.dir = 1;
    walkLean(w.spr, w.dir, true);
  }
}
