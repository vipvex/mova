/**
 * Master + modifier prompt composition for Game Studio asset generation.
 *
 * - Master: camera, framing, reference roles, style recipe (the "make it correct" lock)
 * - Modifier: costume / subject extras appended on top without replacing the master
 */
import { cameraClause, isIsometricStyle, type VisualStyle } from "./styles";

export type AssetPromptKind = "character" | "object" | "tile";

export function promptKindForKey(key: string): AssetPromptKind {
  if (key.startsWith("char_")) return "character";
  if (key.startsWith("env_")) return "tile";
  return "object";
}

export function defaultMasterPrompt(
  style: Pick<VisualStyle, "id" | "recipe">,
  kind: AssetPromptKind,
  opts?: { fromPhoto?: boolean; hasStyleSheet?: boolean },
): string {
  const fromPhoto = !!opts?.fromPhoto;
  const hasStyleSheet = !!opts?.hasStyleSheet;
  const iso = isIsometricStyle(style);
  const cam = cameraClause(style, kind === "tile" ? "tile" : kind === "character" ? "character" : "object");

  if (kind === "tile") {
    return [
      `Create ONE seamless ${iso ? "isometric" : "top-down"} game floor/surface TILE for a children's tilemap.`,
      cam.trim(),
      "No character, no object on top, no text, no shadow. It should tile cleanly when repeated on a grid.",
      `Art style recipe: ${style.recipe}.`,
    ].join("\n");
  }

  if (kind === "object") {
    return [
      `Create ONE clean simple food/object prop for a children's ${iso ? "isometric tile " : ""}game.`,
      cam.trim(),
      "It is an INANIMATE item, NOT a creature — no face, no eyes, no mouth, no arms, no legs, no hands, no feet; just the plain object itself.",
      "Fully visible, centered on empty background. No cast shadow, no text, no words, no letters, no watermark.",
      hasStyleSheet
        ? "<IMAGE_0> (if provided) = ART STYLE ONLY — copy palette/pixels/shading/rendering; ignore sheet camera, poses, layout, and subjects."
        : "",
      `Art style recipe: ${style.recipe}.`,
    ].filter(Boolean).join("\n");
  }

  // character
  if (fromPhoto && hasStyleSheet) {
    return [
      `Create ONE single children's ${iso ? "isometric tile-" : ""}game character sprite from scratch (do not paste or lightly filter either reference).`,
      cam.trim(),
      "",
      "REFERENCE ROLES (do not mix them up):",
      "- <IMAGE_0> = ART STYLE ONLY (house style sheet). Copy pixel size, palette, shading/dither, outlines, proportions, and material look. Do NOT copy the sheet's camera, poses, layout, or subjects.",
      "- <IMAGE_1> = LIKENESS ONLY (a real photograph). Copy who she is: hair colour/hairstyle (incl. bows/accessories), face shape, features, skin tone, cheerful expression. Do NOT copy the photo's camera, pose, framing, or background — photos are usually front-facing; you must still output the camera above.",
      "",
      "Turn her into a clean stylized game character (NOT a photo, not photorealistic) without changing who she is.",
      "Full body, fully visible, standing, centered on empty background. No cast shadow, no text, no words, no letters, no watermark.",
      `Art style recipe: ${style.recipe}.`,
    ].join("\n");
  }

  if (fromPhoto) {
    return [
      `Create a cute children's-game cartoon character from the provided PHOTOGRAPH (likeness only — ignore its camera/pose).`,
      cam.trim(),
      "It MUST look like THIS child (hair, face, skin, expression). Turn her into a clean cartoon (NOT photorealistic).",
      "Full body, fully visible, standing, centered. No cast shadow, no text.",
      `Art style recipe: ${style.recipe}.`,
    ].join("\n");
  }

  return [
    `Create ONE friendly children's mobile-game character for a ${iso ? "isometric tile " : ""}video game.`,
    cam.trim(),
    "Full body, fully visible, centered, bright and wholesome for a young child.",
    "No cast shadow on the ground, no text, no words, no letters, no writing, no watermark.",
    hasStyleSheet
      ? "<IMAGE_0> (if provided) = ART STYLE ONLY — copy palette/pixels/shading/rendering; ignore sheet camera, poses, layout, and subjects."
      : "",
    `Art style recipe: ${style.recipe}.`,
  ].filter(Boolean).join("\n");
}

/** Append the modifier under the master. Empty modifier → master only. */
export function composeAssetPrompt(master: string, modifier?: string): string {
  const m = String(master || "").trim();
  const mod = String(modifier || "").trim();
  if (!mod) return m;
  return `${m}

MODIFIER (apply on top of the master — costume, props, extras, mood. Do NOT override the master's camera, likeness rules, or reference roles):
${mod}`;
}
