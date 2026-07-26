import Phaser from "phaser";

/** Green-screen key for animation videos (plate color = ANIM_CHROMA / #00FF00). */
const FRAG = `
#define SHADER_NAME CHROMA_KEY_FS
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uThreshold;
uniform float uSmoothness;
varying vec2 outTexCoord;
void main() {
  vec4 color = texture2D(uMainSampler, outTexCoord);
  float maxRB = max(color.r, color.b);
  float key = color.g - maxRB;
  float alpha = 1.0 - smoothstep(uThreshold, uThreshold + uSmoothness, key);
  gl_FragColor = vec4(color.rgb, color.a * alpha);
}
`;

export class ChromaKeyPipeline extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline {
  constructor(game: Phaser.Game) {
    super({
      game,
      name: "ChromaKey",
      fragShader: FRAG,
    });
  }

  onBind() {
    super.onBind();
    this.set1f("uThreshold", 0.18);
    this.set1f("uSmoothness", 0.22);
  }
}

/** Register once per game; safe to call from any scene. */
export function ensureChromaKeyPipeline(game: Phaser.Game) {
  const renderer = game.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return false;
  if (!renderer.pipelines.has("ChromaKey")) {
    renderer.pipelines.add("ChromaKey", new ChromaKeyPipeline(game));
  }
  return true;
}
