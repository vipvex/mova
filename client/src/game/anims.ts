import Phaser from "phaser";

/** Cheap, reusable "goofy juice" tweens for any scene's sprites (Image or emoji Text).
 *  Design rule: loops and one-shots use DIFFERENT properties on the same object so
 *  they never fight — idle uses position/Y, squash uses scale, wobble uses angle. */

type GO = Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;

/** Gentle looping up-bob (position Y). Use on NON-physics objects only — a physics
 *  body would fight a position tween. Returns the tween so it can be stopped. */
export function idleBob(scene: Phaser.Scene, obj: any, amp = 6, dur = 800, delay = 0) {
  return scene.tweens.add({
    targets: obj, y: obj.y - amp, duration: dur, delay,
    yoyo: true, repeat: -1, ease: "Sine.easeInOut",
  });
}

/** One-shot squash-and-stretch (scale). Multiplicative off the object's current
 *  scale, so it's safe on sprites sized via setDisplaySize. */
export function squash(scene: Phaser.Scene, obj: any, power = 0.22, dur = 110) {
  const bx = obj.scaleX, by = obj.scaleY;
  scene.tweens.add({
    targets: obj, scaleX: bx * (1 + power), scaleY: by * (1 - power),
    duration: dur, ease: "Quad.easeOut", yoyo: true,
  });
}

/** Looping rock/wobble (angle) — for the item carried over a character's head. */
export function carryWobble(scene: Phaser.Scene, obj: any, deg = 12, dur = 300) {
  return scene.tweens.add({
    targets: obj, angle: { from: -deg, to: deg }, duration: dur,
    yoyo: true, repeat: -1, ease: "Sine.easeInOut",
  });
}

/** Happy celebration: a big scale pop + a quick angle jiggle. Avoids Y so it can
 *  coexist with an idleBob loop on the same object. */
export function happyBounce(scene: Phaser.Scene, obj: any) {
  const bx = obj.scaleX, by = obj.scaleY;
  scene.tweens.add({
    targets: obj, scaleX: bx * 1.28, scaleY: by * 1.28,
    duration: 150, ease: "Back.easeOut", yoyo: true,
  });
  scene.tweens.add({
    targets: obj, angle: { from: -12, to: 12 }, duration: 70,
    yoyo: true, repeat: 3, onComplete: () => obj.setAngle(0),
  });
}

/** Scale-bounce entrance (scale). Pops from tiny to `to`. */
export function popIn(scene: Phaser.Scene, obj: any, to = 1, dur = 220) {
  obj.setScale(to * 0.2);
  scene.tweens.add({ targets: obj, scaleX: to, scaleY: to, duration: dur, ease: "Back.easeOut" });
}

/** A little burst of ✨ that fly out and fade. Self-cleaning. */
export function sparkle(scene: Phaser.Scene, x: number, y: number, tile: number, n = 5) {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const s = scene.add.text(x, y, "✨", { fontSize: `${Math.floor(tile * 0.42)}px` }).setOrigin(0.5).setDepth(50);
    scene.tweens.add({
      targets: s,
      x: x + Math.cos(a) * tile * (0.7 + Math.random() * 0.4),
      y: y + Math.sin(a) * tile * (0.7 + Math.random() * 0.4) - tile * 0.3,
      alpha: 0, scale: 0.2, duration: 550 + Math.random() * 200,
      ease: "Quad.easeOut", onComplete: () => s.destroy(),
    });
  }
}

/** Flipbook: cycle an Image through a list of texture keys on a timer. All frames are
 *  the same cell size, so we only setTexture (never resize) — the object's current
 *  scale/tween juice is preserved. No-op (returns undefined) unless ≥2 frames exist.
 *  `loop: false` plays once and holds the last frame (oneshots). */
export function flipbook(
  scene: Phaser.Scene,
  img: any,
  keys: string[],
  fps = 4,
  opts?: { loop?: boolean },
) {
  const valid = keys.filter((k) => scene.textures.exists(k));
  if (valid.length < 2 || typeof img.setTexture !== "function") return undefined;
  const shouldLoop = opts?.loop !== false;
  let i = 0;
  img.setTexture(valid[0]);
  const ev = scene.time.addEvent({
    delay: 1000 / Math.max(1, fps),
    loop: true,
    callback: () => {
      if (i >= valid.length - 1) {
        if (!shouldLoop) { ev.remove(false); return; }
        i = 0;
      } else {
        i++;
      }
      img.setTexture(valid[i]);
    },
  });
  return ev;
}

/** Face + lean a walking character toward its movement direction. Call every frame
 *  with the horizontal input (-1/0/1) and whether it's moving. Uses flipX + angle
 *  (never scale/Y), so it composes with squash/idle. */
export function walkLean(obj: any, dirX: number, moving: boolean) {
  if (dirX < 0) obj.setFlipX?.(true);
  else if (dirX > 0) obj.setFlipX?.(false);
  const target = moving ? dirX * 6 : 0;
  obj.setAngle(obj.angle + (target - obj.angle) * 0.2);
}

/** Play (or restart) a preloaded Phaser Video clip. Loops when `loop` is true.
 *  Returns false if the video key isn't in the cache yet. */
export function playVideoClip(
  scene: Phaser.Scene,
  vid: Phaser.GameObjects.Video,
  key: string,
  opts: { loop?: boolean; sizePx?: number } = {},
): boolean {
  if (!scene.cache.video.exists(key)) return false;
  const loop = opts.loop !== false;
  try {
    vid.changeSource(key);
  } catch {
    // First play — changeSource can throw if never set; fall through to play.
  }
  if (opts.sizePx) vid.setDisplaySize(opts.sizePx, opts.sizePx);
  vid.setVisible(true);
  vid.setMute(true);
  vid.play(loop);
  return true;
}
