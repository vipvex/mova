import Phaser from "phaser";
import type { PlatformerLevel, PlatformerObstacle } from "@shared/platformerTypes";
import type { GameHud, GameHooks, EngineScene } from "@shared/gameTypes";
import { playWord } from "./wordAudio";

interface ObState {
  o: PlatformerObstacle;
  picture: Phaser.GameObjects.Text;
  blocker?: Phaser.GameObjects.Rectangle; // barrier body (boulder/bear/vine/door)
  bridge?: Phaser.GameObjects.Rectangle;  // gap-filling planks (created on clear)
  cleared: boolean;
}

const GROUND_FRAC = 0.8;

export class PlatformerScene extends Phaser.Scene implements EngineScene {
  private level!: PlatformerLevel;
  private hooks!: GameHooks;

  private player!: Phaser.Physics.Arcade.Sprite | any;
  private ground!: Phaser.Physics.Arcade.StaticGroup;
  private barriers!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private groundY = 0;

  private obs: ObState[] = [];
  private active: ObState | null = null;
  private prompt!: Phaser.GameObjects.Container;
  private lastPromptWord = "";
  private lastReplay = 0;
  private lastFloor = 0;
  private checkpointX = 60;

  private clearedCount = 0;
  private respawns = 0;
  private coins = 0;
  private won = false;
  private startedAt = 0;
  private sfxCtx: AudioContext | null = null;

  constructor() { super("platformer"); }

  init(data: { level: PlatformerLevel; hooks: GameHooks }) {
    this.level = data.level; this.hooks = data.hooks;
    this.obs = []; this.active = null; this.lastPromptWord = "";
    this.clearedCount = 0; this.respawns = 0; this.coins = 0; this.won = false;
  }

  create() {
    const { width, height } = this.scale;
    const L = this.level;
    this.groundY = height * GROUND_FRAC;
    this.cameras.main.setBackgroundColor(L.theme === "cave" ? "#20142e" : "#bfe3ff");
    this.physics.world.setBounds(0, 0, L.worldWidth, height * 3);
    this.physics.world.gravity.y = L.tuning.gravity;

    // ground segments (skip gaps)
    this.ground = this.physics.add.staticGroup();
    const gaps = [...L.gaps].sort((a, b) => a.x - b.x);
    let segStart = 0;
    const addSeg = (x0: number, x1: number) => {
      if (x1 - x0 < 4) return;
      const r = this.add.rectangle(x0, this.groundY, x1 - x0, height, 0x6ab04c).setOrigin(0, 0);
      this.ground.add(r); (r.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    };
    for (const g of gaps) { addSeg(segStart, g.x); segStart = g.x + g.width; }
    addSeg(segStart, L.worldWidth);

    // player
    this.player = this.add.text(this.checkpointX, this.groundY - 80, "🏃", { fontSize: "44px" }).setOrigin(0.5, 1);
    this.physics.add.existing(this.player);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(34, 44); body.setOffset(4, 4); body.setCollideWorldBounds(false);
    this.physics.add.collider(this.player, this.ground);

    // obstacles
    this.barriers = this.physics.add.staticGroup();
    for (const o of L.obstacles) {
      const isBarrier = o.type !== "bridge" && o.type !== "chest";
      const picY = o.type === "chest" ? this.groundY - 30 : this.groundY - 46;
      const picture = this.add.text(o.x, picY, o.picture, { fontSize: "46px" }).setOrigin(0.5, 1);
      const st: ObState = { o, picture, cleared: false };
      if (isBarrier) {
        const blk = this.add.rectangle(o.x, this.groundY, 26, 90, 0x000000, 0).setOrigin(0.5, 1);
        this.barriers.add(blk); (blk.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
        st.blocker = blk;
      }
      this.obs.push(st);
    }
    this.physics.add.collider(this.player, this.barriers);

    // flag
    this.add.text(L.goalX + 40, this.groundY, "🚩", { fontSize: "48px" }).setOrigin(0.5, 1);

    // prompt bubble (picture-only + speaker)
    const bg = this.add.rectangle(0, 0, 96, 96, 0xffffff, 0.92).setStrokeStyle(4, 0x3b82f6);
    const pic = this.add.text(0, -6, "", { fontSize: "44px" }).setOrigin(0.5);
    const spk = this.add.text(0, 34, "🔊", { fontSize: "20px" }).setOrigin(0.5);
    this.prompt = this.add.container(0, 0, [bg, pic, spk]).setDepth(10).setVisible(false);
    (this.prompt as any).pic = pic;

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.input.keyboard!.on("keydown-SPACE", () => this.tryJump());
    this.input.keyboard!.on("keydown-B", () => { if (this.active) playWord(this.active.o.word, this.level.lang); });

    this.cameras.main.setBounds(0, 0, L.worldWidth, height);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    // test hook
    (window as any).__platformer = () => ({ activeWord: this.active?.o.word || "", x: Math.round(this.player.x), cleared: this.clearedCount, won: this.won });

    this.startedAt = this.time.now;
    this.hooks.onSetGrammar?.([]);
    this.hooks.onTelemetry?.({ type: "level_start" });
    this.emitHud("running");
  }

  private tryJump() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const coyote = this.time.now - this.lastFloor < 120;
    if (body.blocked.down || coyote) body.setVelocityY(-this.level.tuning.jumpVel);
  }

  attemptWord(word: string, latencyMs?: number) {
    if (this.won || !this.active) return;
    const accepted = norm(word) === norm(this.active.o.word);
    this.hooks.onTelemetry?.({ type: "utterance", word: this.active.o.word, accepted, latencyMs });
    if (accepted) this.clear(this.active);
    else { this.shrug(); playWord(this.active.o.word, this.level.lang); }
  }

  private clear(st: ObState) {
    st.cleared = true; this.clearedCount++;
    this.beep(true);
    if (st.o.type !== "chest") this.checkpointX = st.o.x + 40; // respawn near progress, not level start
    this.hooks.onTelemetry?.({ type: "clear", word: st.o.word });
    const gy = this.groundY;
    switch (st.o.type) {
      case "bridge": {
        const span = st.o.span ?? 200;
        const plank = this.add.rectangle(st.o.x, gy, span, 16, 0xb5651d).setOrigin(0, 0);
        this.ground.add(plank); (plank.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
        st.bridge = plank;
        this.tweens.add({ targets: st.picture, alpha: 0, y: st.picture.y + 20, duration: 300 });
        break;
      }
      case "boulder":
        this.tweens.add({ targets: st.picture, x: st.picture.x + 120, angle: 360, alpha: 0, duration: 500, onComplete: () => st.picture.destroy() });
        st.blocker?.destroy(); break;
      case "bear":
        this.tweens.add({ targets: st.picture, x: st.picture.x + 90, alpha: 0, duration: 400, onComplete: () => st.picture.destroy() });
        st.blocker?.destroy(); break;
      case "vine":
        this.tweens.add({ targets: st.picture, scaleY: 1.6, alpha: 0, duration: 400, onComplete: () => st.picture.destroy() });
        st.blocker?.destroy(); break;
      case "chest":
        this.coins += st.o.reward ?? 5; this.hooks.onReward?.(st.o.reward ?? 5);
        this.hooks.onTelemetry?.({ type: "reward", coins: st.o.reward ?? 5 });
        this.tweens.add({ targets: st.picture, y: st.picture.y - 24, scale: 1.3, duration: 250, yoyo: true });
        break;
      case "door":
        st.blocker?.destroy();
        this.tweens.add({ targets: st.picture, alpha: 0, duration: 300, onComplete: () => this.win() });
        break;
    }
    this.active = null; this.prompt.setVisible(false); this.lastPromptWord = ""; this.hooks.onSetGrammar?.([]);
    this.emitHud("running", st.o.word);
  }

  private shrug() {
    this.beep(false);
    this.tweens.add({ targets: this.player, angle: 8, yoyo: true, duration: 80, repeat: 1 });
  }

  update(_t: number, _dt: number) {
    if (!this.player?.body) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (body.blocked.down) this.lastFloor = this.time.now;

    // movement
    if (!this.won) {
      const s = this.level.tuning.runSpeed;
      if (this.cursors.left.isDown) body.setVelocityX(-s);
      else if (this.cursors.right.isDown) body.setVelocityX(s);
      else body.setVelocityX(0);
      if ((this.cursors.up.isDown) && (body.blocked.down || this.time.now - this.lastFloor < 120)) this.tryJump();
    }

    // fell into a gap → respawn
    if (this.player.y > this.groundY + 300 && !this.won) this.respawn();

    // proximity hot-window (nearest uncleared obstacle within range)
    let near: ObState | null = null; let best = Infinity;
    for (const st of this.obs) {
      if (st.cleared) continue;
      const d = Math.abs(st.o.x - this.player.x);
      if (d <= this.level.tuning.triggerRange && d < best) { best = d; near = st; }
    }
    this.active = near;
    if (near) {
      this.prompt.setPosition(near.o.x, this.groundY - 150).setVisible(true);
      (this.prompt as any).pic.setText(near.o.picture);
      if (near.o.word !== this.lastPromptWord) {
        this.lastPromptWord = near.o.word;
        this.hooks.onSetGrammar?.([near.o.word]);
        playWord(near.o.word, this.level.lang);   // auto-play the word on entering the zone
        this.lastReplay = this.time.now;
      } else if (this.time.now - this.lastReplay > 4500) {
        playWord(near.o.word, this.level.lang);    // gentle re-prompt if she's stuck
        this.lastReplay = this.time.now;
      }
    } else if (this.lastPromptWord) {
      this.prompt.setVisible(false); this.lastPromptWord = ""; this.hooks.onSetGrammar?.([]);
    }

    // reach flag without a door? (levels always end on a door, but guard)
    if (this.player.x >= this.level.goalX + 30 && !this.won && this.obs.every((o) => o.cleared || o.o.type === "chest")) this.win();
  }

  private respawn() {
    this.respawns++;
    this.hooks.onTelemetry?.({ type: "respawn" });
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.player.setPosition(this.checkpointX, this.groundY - 90);
    this.cameras.main.flash(150, 255, 255, 255);
    this.emitHud("running");
  }

  private win() {
    if (this.won) return;
    this.won = true;
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    const t = Math.round((this.time.now - this.startedAt));
    this.hooks.onTelemetry?.({ type: "level_complete", ms: t, coins: this.coins });
    this.add.text(this.cameras.main.midPoint.x, this.cameras.main.midPoint.y, "🎉 Финиш!", {
      fontSize: "64px", fontFamily: "Nunito, sans-serif", color: "#fff", fontStyle: "bold", stroke: "#000", strokeThickness: 8,
    }).setOrigin(0.5).setScrollFactor(0);
    this.emitHud("won");
  }

  private emitHud(state: GameHud["state"], lastWord?: string) {
    this.hooks.onHud({ cleared: this.clearedCount, total: this.obs.filter((o) => o.o.type !== "chest").length, misses: this.respawns, state, lastWord });
  }

  private beep(ok: boolean) {
    try {
      if (!this.sfxCtx) this.sfxCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const c = this.sfxCtx, o = c.createOscillator(), g = c.createGain();
      o.type = "square"; o.frequency.value = ok ? 660 : 170;
      g.gain.value = 0.0001; o.connect(g); g.connect(c.destination);
      const t = c.currentTime;
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (ok ? 0.14 : 0.3));
      o.start(t); o.stop(t + 0.32);
    } catch { /* ignore */ }
  }
}

function norm(s: string) { return s.toLowerCase().replace(/[^\wа-яё ]/gi, "").trim(); }
