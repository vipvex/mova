/**
 * Candidate HOUSE visual styles for all MOVA minigames.
 * Goal: one style, reused everywhere — fun for a 6yo girl, AI-repeatable ("hard to
 * fuck up"), and friendly to simple/goofy sprite animation. Each style ships a `recipe`
 * (the fixed art-style descriptor injected into every image-gen prompt so assets stay
 * consistent) + ratings on the axes that actually matter for us.
 *
 * ratings 1-5: appeal (6yo girl) · consistency (AI-repeatable) · animation (sprite-friendly)
 */

export interface VisualStyle {
  id: string;
  name: string;
  blurb: string;
  recipe: string;          // injected into image-gen prompts
  swatches: string[];      // representative palette (hex)
  appeal: number;
  consistency: number;
  animation: number;
  note: string;            // designer's take / tradeoff
  recommended?: boolean;
}

/** True for house styles meant for isometric / dimetric game worlds (not flat front-on or top-down). */
export function isIsometricStyle(style: Pick<VisualStyle, "id" | "recipe">): boolean {
  const id = style.id.toLowerCase();
  const recipe = style.recipe.toLowerCase();
  if (id.includes("topdown") || recipe.includes("top-down 2d") || recipe.includes("topdown")) return false;
  if (id.includes("iso") || id.includes("voxel") || id === "hd2d") return true;
  return recipe.includes("isometric") || recipe.includes("dimetric") || recipe.includes("2:1 projection");
}

/**
 * Camera / framing clause injected into asset prompts so iso house styles don't
 * collapse into front-facing or orthographic top-down sprites.
 */
export function cameraClause(
  style: Pick<VisualStyle, "id" | "recipe">,
  kind: "character" | "object" | "tile" | "sheet",
): string {
  if (!isIsometricStyle(style)) {
    if (kind === "tile") return " Seamless top-down square game tile filling the frame edge to edge.";
    if (kind === "sheet") return " All figures front-facing, same baseline.";
    if (kind === "character") return " Full body, fully visible, centered, front-facing.";
    return " Centered and fully visible.";
  }
  if (kind === "tile") {
    return " CRITICAL CAMERA: true isometric / dimetric (2:1) game TILE — classic iso tilemap diamond/rhombus footprint with clear depth, matching Eastward / Habbo / SNES-RPG floors. NOT a flat orthographic top-down square viewed straight from above.";
  }
  if (kind === "sheet") {
    return " CRITICAL CAMERA: every cell uses the SAME true isometric / dimetric (2:1) game-sprite angle — body turned ~30–45° so front AND one side read clearly (Eastward / Chrono Trigger / Habbo character angle). NOT front-facing, NOT top-down, NOT side-scroller profile.";
  }
  if (kind === "character") {
    return (
      " NON-NEGOTIABLE OUTPUT CAMERA: true isometric / dimetric (2:1) video-game character sprite. " +
      "Body yawed ~35–45° (classic Eastward / Habbo / Chrono Trigger standing pose) so the chest faces the camera diagonally — you MUST see the front of the torso AND one full side (shoulder, arm, hip, leg). " +
      "Head may glance toward camera but the body is NOT square-on. Feet planted on an invisible isometric ground plane. " +
      "FORBIDDEN: front-facing orthographic portrait, straight-on mascot pose, bird's-eye top-down, side-scroller profile. " +
      "If any reference image is front-facing, IGNORE that camera and still output isometric."
    );
  }
  return " CRITICAL CAMERA: true isometric / dimetric (2:1) video-game prop, three-quarter view matching an isometric tile world — NOT flat front-on, NOT straight top-down.";
}

export const VISUAL_STYLES: VisualStyle[] = [
  {
    id: "flat-vector",
    name: "Chunky Flat Vector",
    blurb: "Bold rounded shapes, thick soft outlines, flat pastel fills — Duolingo-clean.",
    recipe: "chunky flat vector illustration, bold rounded shapes, thick soft dark outlines, flat pastel color fills, minimal simple shading, clean modern kids-app mascot style, crisp edges",
    swatches: ["#7ED957", "#FF6B6B", "#4EA8FF", "#FFE08A", "#FFF6E9"],
    appeal: 4, consistency: 5, animation: 5,
    note: "Safest all-rounder. Separable shapes rig for squash/stretch trivially; AI nails it every time.",
    recommended: true,
  },
  {
    id: "puffy-sticker",
    name: "Puffy Kawaii Stickers",
    blurb: "Glossy die-cut stickers, thick white border, sparkly eyes, chubby & cute.",
    recipe: "glossy die-cut kawaii sticker style, thick white sticker border, soft cel shading, big cute sparkly eyes, rounded chubby shapes, subtle drop shadow, adorable",
    swatches: ["#FFB3D1", "#C9B6FF", "#A8F0D0", "#FFF3A8", "#FFFFFF"],
    appeal: 5, consistency: 5, animation: 4,
    note: "Highest girl-appeal + very repeatable. The white border reads great on any background. Top pick for the target player.",
    recommended: true,
  },
  {
    id: "chibi",
    name: "Chibi Cartoon",
    blurb: "Big head, tiny body, bold clean lines, bright cel shading — Saturday-morning energy.",
    recipe: "cute chibi cartoon, big head small body, bold clean black outlines, bright cel shading, expressive simple faces, saturday-morning cartoon energy",
    swatches: ["#FF5C8A", "#FFD23F", "#3DCCC7", "#7C4DFF", "#FFFFFF"],
    appeal: 5, consistency: 4, animation: 5,
    note: "Classic kid cartoon; animates beautifully (paper-doll rig). Slightly more style-drift than flat vector.",
  },
  {
    id: "clay",
    name: "Soft 3D Clay",
    blurb: "Squishy matte modeling-clay, gentle lighting, Pixar-toy roundness.",
    recipe: "soft matte claymation style, rounded modeling-clay forms, gentle soft studio lighting, subtle fingerprint texture, chunky squishy shapes, cute pixar-toy feel",
    swatches: ["#FF8C69", "#5BC0BE", "#FFD97D", "#9A7B4F", "#FDF0E0"],
    appeal: 5, consistency: 3, animation: 3,
    note: "Premium adorable, but 3D-ish shading drifts between gens and is harder to animate as flat sprites. Gorgeous hero art, riskier as a system.",
  },
  {
    id: "paper-cutout",
    name: "Paper Cutout Collage",
    blurb: "Layered construction-paper shapes with soft shadows — Tearaway / Sesame Street.",
    recipe: "layered construction-paper cutout collage, flat paper shapes with subtle paper grain, soft drop shadows between layers, handcrafted craft-paper look",
    swatches: ["#E84855", "#3185FC", "#F9DC5C", "#22A06B", "#F7EDE2"],
    appeal: 4, consistency: 4, animation: 5,
    note: "Charming and hides imperfection well; jointed-paper animation is naturally goofy. Distinctive but less 'princess-cute'.",
  },
  {
    id: "felt-plush",
    name: "Felt & Plush Toys",
    blurb: "Everything looks like a soft stitched plushie — cozy and tactile.",
    recipe: "cozy felt and plush toy style, soft fabric texture, visible stitching seams, stuffed-toy roundness, warm handmade wool look",
    swatches: ["#E8A07A", "#8DB596", "#F2D492", "#C97C7C", "#FBF3E4"],
    appeal: 5, consistency: 3, animation: 3,
    note: "Super cozy, very girl-friendly. Fabric texture wanders between gens; better for props than fast-animating characters.",
  },
  {
    id: "candy-pop",
    name: "Candy Gloss Pop",
    blurb: "Shiny jelly/plastic surfaces, vivid colors, bubbly highlights — gummy-cute.",
    recipe: "glossy candy-pop style, shiny plastic and jelly surfaces, vivid saturated colors, bubbly glossy highlights, playful smooth gradients, gummy-candy cuteness",
    swatches: ["#FF4FA3", "#31D0F0", "#B06BFF", "#FF9F45", "#FFFFFF"],
    appeal: 5, consistency: 4, animation: 4,
    note: "High-energy and sweet; the gloss reads well small. Gradients slightly harder to keep identical than flat fills.",
  },
  {
    id: "crayon",
    name: "Crayon Storybook",
    blurb: "Hand-drawn crayon & colored-pencil, warm and whimsically imperfect.",
    recipe: "hand-drawn crayon and colored-pencil children's picture-book style, soft waxy texture, gentle imperfect lines, warm whimsical storybook look",
    swatches: ["#EF767A", "#456990", "#F6C453", "#48A9A6", "#FBF7F0"],
    appeal: 4, consistency: 3, animation: 2,
    note: "On-theme (a kid's game) and heart-warming, but texture + wobble make consistent, snappy animation the hardest here.",
  },
  {
    id: "watercolor",
    name: "Cozy Watercolor",
    blurb: "Soft washes, light paper texture, gentle picture-book warmth.",
    recipe: "soft picture-book watercolor illustration, gentle color washes, light paper texture, warm cozy muted palette, storybook feel",
    swatches: ["#F3B6A5", "#A7C4BC", "#F6D9A0", "#C4A5C7", "#FBF6EF"],
    appeal: 4, consistency: 2, animation: 2,
    note: "Beautiful and calming, but painterly variance is the enemy of repeatability + crisp sprite frames. Best as backdrops, not the system.",
  },
  {
    id: "pixel",
    name: "Chunky Pixel Art",
    blurb: "Clean large pixels, bright limited palette — cute modern 16-bit sprites.",
    recipe: "clean chunky pixel-art sprite, large readable pixels, limited bright palette, cute modern 16-bit game character, crisp shapes, no anti-aliasing",
    swatches: ["#FF4D6D", "#4DD0E1", "#FFD166", "#8338EC", "#2B2D42"],
    appeal: 4, consistency: 3, animation: 5,
    note: "Frame-animation heaven and nostalgic-cute, BUT AI pixel output is the least consistent (grid/scale wobble). Great if we hand-clean, riskier fully-AI.",
  },

  // ── Set 2 — modeled on other 2D / isometric games + Studio Ghibli ──────────
  {
    id: "ghibli",
    name: "Studio Ghibli",
    blurb: "Soft hand-painted anime, lush painted backdrops, gentle warm lighting.",
    recipe: "Studio Ghibli hand-painted anime style, soft gentle line art, lush painted watercolor backgrounds, warm nostalgic natural lighting, rounded friendly cel-shaded characters, Miyazaki whimsy",
    swatches: ["#8FB98E", "#E8C79A", "#7FB4D6", "#D98E7A", "#F3ECD9"],
    appeal: 5, consistency: 2, animation: 2,
    note: "Dreamy and beloved — but painterly variance fights repeatability + clean sprite frames. Magnificent for hero screens & backdrops; risky as the whole sprite system.",
  },
  {
    id: "monument-iso",
    name: "Monument Valley Iso",
    blurb: "Minimal geometric isometric, soft flat pastel gradients, serene architecture.",
    recipe: "clean isometric minimalist game art, precise geometric shapes, soft flat pastel gradients, Monument Valley style, calm elegant, subtle long shadows",
    swatches: ["#F2C6B4", "#B7A6D6", "#F7E1A0", "#8FBFC7", "#FBEFE6"],
    appeal: 3, consistency: 5, animation: 4,
    note: "Gorgeous for isometric/grid worlds (our kitchen is one!). Ultra-repeatable, but the calm minimalism is more 'pretty' than 'giggly' for a 6yo.",
  },
  {
    id: "cozy-lowpoly-iso",
    name: "Cozy Low-Poly Iso",
    blurb: "Soft rounded low-poly 3D, warm colors — A Short Hike / Cozy Grove.",
    recipe: "cozy low-poly isometric game art, soft rounded 3D shapes, warm flat color palette, gentle ambient occlusion, A Short Hike and Cozy Grove vibe, wholesome",
    swatches: ["#E5A56B", "#89C08A", "#F2D06B", "#6FA8C7", "#F6EBD8"],
    appeal: 4, consistency: 4, animation: 3,
    note: "Warm, huggable, and native to top-down/iso rooms. Great fit for the kitchen; 3D-ish shading a touch harder to animate as flat sprites.",
  },
  {
    id: "okami-ink",
    name: "Ōkami Ink Brush",
    blurb: "Japanese sumi-e brush strokes on paper, splashes of color + gold accents.",
    recipe: "Okami sumi-e Japanese ink-brush game art, bold expressive black brush strokes, textured washi paper, splashes of vivid color, gold leaf accents, woodblock elegance",
    swatches: ["#2B2B2B", "#D64545", "#E0B04A", "#4A7A6F", "#F3EAD6"],
    appeal: 3, consistency: 3, animation: 3,
    note: "Striking and unlike anything else — real art-director flex. Less overtly 'girly', and brush texture drifts between gens.",
  },
  {
    id: "rubber-hose",
    name: "Cuphead Rubber-Hose",
    blurb: "1930s vintage rubber-hose cartoon, inky bounce, aged-film warmth.",
    recipe: "1930s rubber-hose cartoon animation style, Cuphead inspired, bouncy noodle limbs, vintage inked linework, soft aged-paper film texture, expressive pie-cut eyes, wholesome not scary",
    swatches: ["#C9A36A", "#B5443A", "#3E3A36", "#DCCBA6", "#F2E7CE"],
    appeal: 3, consistency: 3, animation: 5,
    note: "Peak squash-and-stretch animation heritage. Can skew vintage/spooky — we'd steer it bright & friendly. Distinctive but a bolder bet for the age.",
  },
  {
    id: "alto-gradient",
    name: "Alto's Odyssey Gradient",
    blurb: "Elegant flat gradient silhouettes, serene atmospheric color.",
    recipe: "Alto's Odyssey minimalist illustration, smooth flat color gradients, clean elegant silhouettes, serene atmospheric palette, simple vector shapes, dreamy depth",
    swatches: ["#F6A192", "#7C6CA8", "#F4CE7A", "#5E9BB5", "#FBEDE4"],
    appeal: 3, consistency: 5, animation: 4,
    note: "Beautiful, calm, extremely consistent. Reads as 'chill' more than 'fun' — better for menus/world-map than frantic gameplay, maybe.",
  },
  {
    id: "papercraft-3d",
    name: "Paper Mario Papercraft",
    blurb: "Folded 3D paper characters with visible creases, diorama charm.",
    recipe: "Paper Mario papercraft style, folded 3D paper characters standing in a diorama, visible fold creases and paper edges, flat colors printed on thick paper, cute and crafty",
    swatches: ["#EFC94C", "#4C9BE8", "#E8604C", "#5FB86A", "#F5EFE2"],
    appeal: 4, consistency: 4, animation: 4,
    note: "Delightful and forgiving (paper hides flaws), naturally goofy animation. More distinctive than flat vector, still very kid-friendly.",
  },
  {
    id: "y2k-holo",
    name: "Y2K Holographic Glitter",
    blurb: "Iridescent rainbow foil, sparkly gradients, stars & hearts — max sparkle.",
    recipe: "Y2K holographic glitter style, iridescent rainbow foil surfaces, sparkly pastel-neon gradients, cute star and heart accents, dreamy shiny, glossy stickers",
    swatches: ["#FF9EC4", "#9AD7FF", "#C4A0FF", "#B9FBD0", "#FFF3B0"],
    appeal: 5, consistency: 3, animation: 3,
    note: "Maximum sparkle-appeal for a little girl. The iridescence is the fun AND the risk — foil shifts between gens; best kept as accents over a stable base.",
  },
  {
    id: "toy-diorama",
    name: "Toy Diorama (Tilt-Shift)",
    blurb: "Looks like a real miniature toy set — chunky plastic figures, macro depth.",
    recipe: "miniature toy diorama, chunky plastic toy figures, handcrafted tiny set, soft tilt-shift macro depth of field, warm playful lighting, collectible-toy cuteness",
    swatches: ["#E88C6A", "#6FB3C7", "#F2C860", "#8FB86F", "#F4ECE0"],
    appeal: 4, consistency: 3, animation: 2,
    note: "Adorable 'my little world' feel. Photoreal-ish rendering is the hardest to animate as 2D sprites and to keep identical — lovely, but heavy as a system.",
  },
  {
    id: "pixel-iso",
    name: "Chunky Isometric Pixel Art",
    blurb: "Big crisp pixels in true isometric projection — cute 16-bit dioramas & tile rooms.",
    recipe: "clean chunky isometric pixel-art, large readable pixels, true isometric 2:1 projection, limited bright palette, cute modern 16-bit game diorama, crisp dithered shading, no anti-aliasing, tile-based depth",
    swatches: ["#FF6392", "#4DD0E1", "#FFD166", "#7C5CFF", "#2B2D42"],
    appeal: 4, consistency: 3, animation: 4,
    note: "Marries pixel nostalgia with the iso grid our kitchen already uses — reads as an adorable buildable world. Same AI caveat as flat pixel (grid/scale wobble) plus iso-angle drift; best hand-cleaned, and props/tiles stay more consistent than fast-animating characters.",
  },
  {
    id: "glossy-3d-icon",
    name: "Glossy 3D Icon",
    blurb: "Modern rendered 3D — soft plastic, big highlights (Fluent 3D / Fall Guys-cute).",
    recipe: "modern glossy 3D rendered icon style, soft matte-plastic surfaces with big soft highlights, rounded chunky forms, clean studio lighting, Microsoft Fluent 3D and Fall Guys cuteness, app-icon polish",
    swatches: ["#FF7BA9", "#5CC8F5", "#FFD24C", "#8E6BFF", "#FFFFFF"],
    appeal: 5, consistency: 4, animation: 3,
    note: "Premium, modern, very high appeal and fairly consistent. 3D shading needs care to animate flat, but reads amazing at small sizes.",
  },

  // ── Set 3 — top-down / isometric GAME-NATIVE styles (modeled on shipped games) ──
  // Chosen for how well they build a real top-down/iso game world (tiles, props,
  // readable characters), not just how pretty a single sheet looks.
  {
    id: "topdown-pixel-farm",
    name: "Cozy Top-Down Pixel (Stardew)",
    blurb: "Warm top-down 2D pixel RPG tiles — Stardew Valley / classic Pokémon overworld.",
    recipe: "top-down 2D pixel-art RPG, Stardew Valley and classic Pokemon overworld style, cozy farming-sim tileset perspective, warm limited palette, crisp readable sprites, soft pixel shading, no anti-aliasing, wholesome",
    swatches: ["#8FCB6E", "#E8B25E", "#7CC4E8", "#D96B6B", "#F4E4C1"],
    appeal: 4, consistency: 3, animation: 5,
    note: "The most game-native fit for our grid worlds — top-down tile RPG with classic 4-frame walk cycles and endless reusable tiles. Usual AI pixel-grid wobble; hand-clean helps.",
  },
  {
    id: "overcooked-iso",
    name: "Overcooked Cartoon 3D Iso",
    blurb: "Chunky vibrant low-poly iso kitchens — punchy readable props, high energy.",
    recipe: "chunky cartoon low-poly 3D isometric game art, Overcooked style, bold saturated colors, rounded exaggerated props, soft ambient occlusion, lively kitchen-diorama energy, clean readable shapes",
    swatches: ["#FF7A45", "#3EC6C6", "#FFCE3B", "#7B61FF", "#F5EFE6"],
    appeal: 5, consistency: 4, animation: 3,
    note: "Literally Grandma's Kitchen's genre — iso 3D tile rooms with punchy, readable objects. Higher energy than the calm A Short Hike look; 3D shading a touch harder to animate flat.",
  },
  {
    id: "voxel-iso",
    name: "Cute Voxel Iso (Crossy Road)",
    blurb: "Blocky 3D cube-voxel world, bright flat colors — buildable & adorable.",
    recipe: "cute isometric voxel art, Crossy Road style, chunky 3D cube blocks, bright flat colors, soft simple shadows, blocky adorable characters, buildable toy-world look",
    swatches: ["#6BCB77", "#FFD93D", "#4D96FF", "#FF6B6B", "#FFF4E0"],
    appeal: 5, consistency: 4, animation: 4,
    note: "Voxels are hard to draw 'wrong', read instantly as a buildable world, and hop/animate charmingly. Excellent top-down/iso fit and very kid-friendly.",
  },
  {
    id: "hd2d",
    name: "HD-2D (Octopath Traveler)",
    blurb: "Pixel sprites inside a lit 3D iso diorama — tilt-shift, bloom, real depth.",
    recipe: "HD-2D game art, Octopath Traveler style, detailed pixel-art sprites inside a lit 3D isometric diorama, dramatic depth-of-field tilt-shift blur, warm bloom and glow, rich lighting, nostalgic yet modern",
    swatches: ["#E8A54B", "#5B8DD6", "#C25B7A", "#4CA88A", "#2A2540"],
    appeal: 4, consistency: 2, animation: 3,
    note: "Gorgeous premium game look fusing pixel sprites with real lighting. The layered lighting + DOF is the hardest thing here to keep identical between gens.",
  },
  {
    id: "cute-iso-sim",
    name: "Cute Iso Sim (Two Point)",
    blurb: "Big-head chibi characters in tidy iso tile rooms — management-sim cheer.",
    recipe: "cute isometric simulation-game art, Two Point Hospital style, big-head chibi characters, clean tile-based rooms, bright cheerful colors, soft cartoon 3D shading, tidy readable props",
    swatches: ["#5CC8F5", "#FFC24B", "#FF7B9C", "#8ED96B", "#F2ECE0"],
    appeal: 4, consistency: 4, animation: 3,
    note: "Management-sim iso is built for tile rooms full of little props; big-head characters stay expressive and cute at small sizes. Very on-genre for us.",
  },
  {
    id: "iso-pixel-diorama",
    name: "Iso Pixel Diorama (Tycoon)",
    blurb: "Dimetric 2:1 pixel tiles, tiny detailed props — RollerCoaster/SimCity builder.",
    recipe: "classic isometric pixel-art diorama, RollerCoaster Tycoon and SimCity 2000 style, dimetric 2:1 pixel tiles, tiny detailed props, bright clean palette, crisp no anti-aliasing, tycoon-builder charm",
    swatches: ["#7BD56A", "#E8C34A", "#5AA9E6", "#E06B5A", "#F3EAD3"],
    appeal: 3, consistency: 3, animation: 4,
    note: "The definitive builder-game look — perfect for iso tile worlds with lots of small reusable props. Hand-clean helps pixel-grid consistency; reads more 'tycoon' than 'giggly'.",
  },
  {
    id: "minimal-lowpoly-iso",
    name: "Minimal Low-Poly Iso (Bad North)",
    blurb: "Clean flat-shaded low-poly iso, tiny simple forms — calm & ultra-consistent.",
    recipe: "minimalist low-poly isometric game art, Bad North style, clean flat-shaded 3D, tiny simple characters, soft solid colors, gentle single-light shading, calm tactical diorama",
    swatches: ["#7FB88E", "#E4C169", "#6E9BC4", "#D98C6A", "#F1ECE0"],
    appeal: 3, consistency: 5, animation: 3,
    note: "Extremely repeatable (few shapes, flat shading) and razor-clean on an iso grid. Leans calm/tactical over cute — better for worlds/menus than giggly hero art.",
  },
  {
    id: "painted-iso",
    name: "Hand-Painted Iso (Bastion)",
    blurb: "Lush painterly iso, vivid colors, warm rim light — storybook fantasy depth.",
    recipe: "lush hand-painted isometric game art, Bastion and Transistor style, vivid saturated colors, painterly textured surfaces, strong warm rim lighting, storybook fantasy diorama, rich and vibrant",
    swatches: ["#E8894B", "#3FA9A0", "#C7503F", "#F2C14E", "#2E2A3A"],
    appeal: 4, consistency: 2, animation: 2,
    note: "Stunning premium iso art with real painterly depth. But painterly variance fights sprite-frame consistency — best for hero screens and backdrops, not the fast-animating system.",
  },
  {
    id: "cozy-3d-topdown",
    name: "Cozy 3D Top-Down (Animal Crossing)",
    blurb: "Soft rounded low-poly, pastel, curved miniature world — maximally welcoming.",
    recipe: "cozy 3D top-down game art, Animal Crossing style, soft rounded low-poly shapes, gentle pastel palette, warm soft lighting, curved miniature world, wholesome and inviting",
    swatches: ["#9FDCA6", "#FFD98C", "#8ECBE8", "#FBB1C4", "#F4EFDF"],
    appeal: 5, consistency: 4, animation: 3,
    note: "The coziest top-down game look — extremely kid-friendly and welcoming, native to top-down rooms. Soft 3D shading needs care to animate as flat sprites.",
  },
  {
    id: "tactics-iso",
    name: "Clean Tactics Iso (Into the Breach)",
    blurb: "Crisp vector-pixel iso, bold flat colors, clear grid tiles — every object pops.",
    recipe: "clean isometric tactics-game art, Into the Breach style, crisp readable vector-pixel shapes, bold flat colors, clear grid tiles, minimal sharp shading, tidy strategic diorama",
    swatches: ["#4FB0C6", "#F2B138", "#E06D5A", "#6BBE6B", "#28303A"],
    appeal: 3, consistency: 5, animation: 4,
    note: "Built for crystal-clear iso-grid readability — every object reads cleanly on its tile, and it's very consistent. More 'sharp/strategic' than sugary-cute.",
  },

  // ── Set 4 — more isometric GAME-FIRST styles (shipped-game DNA) ────────────
  // Another 10 candidates optimized for tile rooms, readable props, and play —
  // not illustration sheets. Preview these in Studio → Styles before locking the house look.
  {
    id: "merge-room-iso",
    name: "Soft Merge-Room Iso",
    blurb: "Polished mobile merge/decorate rooms — Homescapes / Merge Mansion readability.",
    recipe: "soft polished isometric room game art, Homescapes and Merge Mansion style, cozy furnished interior tiles, clean readable household props, gentle cartoon 3D shading, warm inviting lighting, mobile-casual game polish",
    swatches: ["#F2B88A", "#8EC9A8", "#7EB6E0", "#F0C35A", "#F7F0E6"],
    appeal: 4, consistency: 4, animation: 3,
    note: "Built for rooms full of recognizable objects — perfect for kitchen stations and ingredient icons. Very game-native; shading is soft-3D so keep frames simple.",
  },
  {
    id: "village-builder-iso",
    name: "Cartoon Village Builder Iso",
    blurb: "Bright punchy village/builder iso — Clash of Clans energy, kid-readable.",
    recipe: "bright cartoon isometric village-builder game art, Clash of Clans style, chunky colorful buildings and props, bold saturated colors, soft cartoon 3D, clear silhouette readability, lively playful game world",
    swatches: ["#5DBB63", "#4AA3E0", "#F0C23A", "#E86A4A", "#F5EFE0"],
    appeal: 4, consistency: 4, animation: 3,
    note: "High readability at a glance — buildings and props pop on a grid. Energetic game feel; slightly less 'princess-soft' than pastel cozy styles.",
  },
  {
    id: "townscaper-blocks",
    name: "Pastel Toy-Block Iso",
    blurb: "Stacked pastel architecture toys — Townscaper / Islanders miniature charm.",
    recipe: "pastel toy-block isometric game art, Townscaper and Islanders style, stacked soft geometric buildings, gentle solid colors, clean miniature architecture, soft ambient occlusion, playful buildable diorama",
    swatches: ["#A8D5E5", "#F6C6D0", "#F2E2A0", "#B8D9A8", "#F8F4EE"],
    appeal: 4, consistency: 5, animation: 3,
    note: "Ultra-consistent geometric blocks tile beautifully. Great for environments; characters need a matching chunky toy treatment to stay on-style.",
  },
  {
    id: "jrpg-tactics-iso",
    name: "JRPG Tactics Iso",
    blurb: "Classic SRPG battle-grid iso — Final Fantasy Tactics / Fire Emblem charm.",
    recipe: "classic JRPG isometric tactics game art, Final Fantasy Tactics and Fire Emblem style, dimetric battle grid, cute chibi-proportion characters, clean tile elevation, soft cel shading, colorful fantasy diorama",
    swatches: ["#6BA3D9", "#E8B45A", "#7CB87A", "#D97B7B", "#EDE6D6"],
    appeal: 4, consistency: 4, animation: 4,
    note: "Native grid combat/rooms with chibi characters that animate well. Slightly more 'fantasy RPG' than kitchen-sim, but excellent for voice-command levels on tiles.",
  },
  {
    id: "sims-build-iso",
    name: "Sims Build-Mode Iso",
    blurb: "Colorful modern sim furniture & rooms — The Sims build catalog clarity.",
    recipe: "The Sims isometric build-mode game art, colorful modern furniture and room tiles, clean readable household objects, soft cartoon 3D shading, bright cheerful interior, tidy catalog-game look",
    swatches: ["#4DB8E8", "#7BC96A", "#F2C04A", "#E88BB0", "#F4F0E8"],
    appeal: 4, consistency: 4, animation: 3,
    note: "Furniture and props are the stars — ideal when vocabulary is everyday objects. Characters are secondary; keep them simple so objects stay the hero.",
  },
  {
    id: "lego-brick-iso",
    name: "LEGO Brick Iso",
    blurb: "Brick-built diorama, studs & plastic — insanely consistent, toy-first play feel.",
    recipe: "LEGO brick isometric game art, plastic brick-built characters and props, visible studs and brick seams, bright primary toy colors, clean hard plastic shading, miniature brick diorama, wholesome",
    swatches: ["#E5252A", "#0055BF", "#F5CD2F", "#00852B", "#F5F5F5"],
    appeal: 5, consistency: 5, animation: 4,
    note: "Hard plastic + brick grammar is almost impossible for AI to drift — excellent house-style candidate. Reads instantly as a toy game world kids already love.",
  },
  {
    id: "nintendo-board-iso",
    name: "Party Board-Game Iso",
    blurb: "Chunky Mario Party–style board tiles — bold, playful, hyper-readable.",
    recipe: "chunky party board-game isometric art, Mario Party style, bold colorful board tiles, rounded playful props, thick friendly shapes, bright saturated Nintendo-like colors, cheerful game-board diorama",
    swatches: ["#E5252A", "#2D8CFF", "#FFD93D", "#3DBB5A", "#FFF4E0"],
    appeal: 5, consistency: 4, animation: 4,
    note: "Maximum play-feel: every tile and prop shouts 'game'. Great for runner/gate/commander levels. Slightly louder than cozy kitchen — lean into the energy.",
  },
  {
    id: "soft-garden-iso",
    name: "Soft Garden Adventure Iso",
    blurb: "Tiny explorers in a soft 3D garden — Pikmin / nature-adventure scale.",
    recipe: "soft 3D isometric garden adventure game art, Pikmin style, tiny characters in oversized nature, rounded leafy props, gentle warm daylight, soft low-poly ground, wholesome outdoor diorama",
    swatches: ["#7CB86A", "#E8C56A", "#8EC5E0", "#E89A6A", "#F3ECD8"],
    appeal: 5, consistency: 4, animation: 3,
    note: "Wholesome outdoor iso with clear scale hierarchy (big plants, tiny kids). Excellent for nature vocab; indoor kitchens need the same soft-plastic treatment.",
  },
  {
    id: "bold-cartoon-iso",
    name: "Bold Ink Cartoon Iso",
    blurb: "Thick outlines, flat fills, comic energy — Cult of the Lamb / Adventure Time iso.",
    recipe: "bold inked cartoon isometric game art, thick clean outlines, flat color fills, simple cel shading, expressive cute shapes, Adventure Time and Cult of the Lamb cartoon energy, wholesome not dark, clear readable props",
    swatches: ["#FF6B6B", "#4ECDC4", "#FFE66D", "#7B68EE", "#FFF8F0"],
    appeal: 5, consistency: 5, animation: 5,
    note: "Flat fills + thick outlines are the animation sweet spot and AI-repeatable. Strong game silhouette; keep prompts 'wholesome' so it never drifts spooky.",
  },
  {
    id: "casual-farm-iso",
    name: "Casual Farm Soft Iso",
    blurb: "Sunny mobile farm iso — Hay Day / FarmVille soft 3D, friendly crops & barns.",
    recipe: "casual mobile farm isometric game art, Hay Day style, soft cartoon 3D crops barns and animals, sunny warm lighting, bright friendly colors, clean readable farm props, wholesome farming-sim diorama",
    swatches: ["#8FCB6E", "#F0C14A", "#6BB8E8", "#E88B6A", "#F6EEDC"],
    appeal: 5, consistency: 4, animation: 3,
    note: "Different from Stardew pixel: soft 3D casual-farm look. Super kid-friendly and prop-heavy — strong for food/animal vocab and kitchen-adjacent worlds.",
  },

  // ── Set 5 — isometric PIXEL ART variants (for side-by-side pixel iso picks) ─
  {
    id: "snes-rpg-iso-pixel",
    name: "SNES RPG Iso Pixel",
    blurb: "Classic 16-bit JRPG iso — Chrono Trigger / Secret of Mana warmth.",
    recipe: "classic 16-bit SNES JRPG isometric pixel-art, Chrono Trigger and Secret of Mana style, true isometric 2:1 projection, warm limited palette, soft dithered shading, crisp readable sprites, no anti-aliasing, nostalgic wholesome game diorama",
    swatches: ["#5B8C5A", "#E8B060", "#6A9CC8", "#C76B6B", "#F0E2C8"],
    appeal: 4, consistency: 3, animation: 5,
    note: "The cozy classic JRPG pixel look — great walk-cycle animation DNA. AI may wobble on pixel grid; still one of the most 'real game' feels.",
  },
  {
    id: "mystery-dungeon-pixel",
    name: "Cute Dungeon Grid Pixel",
    blurb: "Chibi grid crawler pixel — Pokémon Mystery Dungeon charm on tiles.",
    recipe: "cute isometric dungeon-crawler pixel-art, Pokemon Mystery Dungeon style, chibi characters on a clear tile grid, chunky readable pixels, bright friendly limited palette, soft pixel shading, no anti-aliasing, wholesome adventure diorama",
    swatches: ["#7EC8E3", "#F2C14E", "#E88BB0", "#8ED96B", "#3A3A4A"],
    appeal: 5, consistency: 3, animation: 5,
    note: "Built for grid moves and cute creatures — maps cleanly onto voice-command tile games. Very kid-friendly; usual AI pixel-scale caveat.",
  },
  {
    id: "eastward-iso-pixel",
    name: "Lush Indie Iso Pixel",
    blurb: "Modern dense indie pixel iso — Eastward / richly detailed tile rooms.",
    recipe: "modern lush indie isometric pixel-art, Eastward style, true dimetric 2:1 projection, characters and props drawn at classic isometric three-quarter game angle (not front-facing, not top-down), dense detailed tile rooms, rich saturated limited palette, crisp large pixels, soft dither and lighting, no anti-aliasing, cinematic cozy game diorama",
    swatches: ["#E07A5F", "#3D405B", "#81B29A", "#F2CC8F", "#F4F1DE"],
    appeal: 4, consistency: 3, animation: 4,
    note: "Premium modern pixel with denser props and mood. Gorgeous for kitchens/rooms; detail density can drift between gens more than chunkier styles.",
  },
  {
    id: "habbo-furniture-pixel",
    name: "Furniture Sim Pixel Iso",
    blurb: "Chunky social-sim furniture pixels — Habbo / classic room catalog clarity.",
    recipe: "classic isometric furniture-sim pixel-art, Habbo Hotel style, chunky furniture and room tiles, clear 2:1 isometric projection, bright clean limited palette, simple pixel shading, no anti-aliasing, cute catalog-game diorama",
    swatches: ["#5BA3D9", "#F0C14A", "#E86A7A", "#7BC96A", "#F5F0E6"],
    appeal: 4, consistency: 4, animation: 4,
    note: "Props-first pixel iso — chairs, food, crates read instantly. Excellent for object vocab; characters stay simple and chibi.",
  },
  {
    id: "mega-chunk-iso-pixel",
    name: "Mega-Chunk Iso Pixel",
    blurb: "Huge readable pixels, toy-simple shapes — maximum clarity at small sizes.",
    recipe: "mega chunky isometric pixel-art, extremely large readable pixels, toy-simple rounded block shapes, bright limited kid palette, minimal dither, true isometric 2:1, no anti-aliasing, adorable miniature game diorama",
    swatches: ["#FF6B9D", "#4DD0E1", "#FFD93D", "#7C5CFF", "#2B2D42"],
    appeal: 5, consistency: 4, animation: 5,
    note: "Biggest pixels = easiest AI consistency + snappiest animation. Loses fine detail, but wins hard for a 6yo mobile game on a grid.",
  },
];
