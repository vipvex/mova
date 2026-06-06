import { writeFile, mkdir } from "fs/promises";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const variations = [
  {
    name: "ocean-horizon-sunset",
    prompt:
      "A serene ocean horizon at golden hour: calm sea reflecting the soft warm sky in shades of peach, lavender and gold, with a few low wispy clouds. Tranquil, painterly, smooth gradients, no boats, no people, no land in foreground, no text. Wide cinematic composition, suitable as a calming desktop background for a children's app.",
  },
  {
    name: "mountain-lake-reflection",
    prompt:
      "A peaceful alpine lake perfectly reflecting distant snow-dusted mountains and a soft pastel morning sky. Mirror-still water, faint mist on the lake, gentle pine trees on the far shore. Painterly, soft contrast, dreamy, no boats, no people, no buildings, no text. Wide cinematic composition, suitable as a soothing background for a children's word-learning app.",
  },
  {
    name: "forest-sunbeams",
    prompt:
      "Soft sunbeams streaming through a quiet forest of tall trees in early morning, with gentle fog. Warm golden light, fresh green ferns, dreamy atmosphere. Painterly photographic style, low contrast, no animals, no people, no text. Wide cinematic composition, suitable as a soothing background.",
  },
  {
    name: "lavender-field-dusk",
    prompt:
      "Endless rows of lavender stretching toward soft rolling hills under a dreamy purple-pink dusk sky with a hint of stars beginning to appear. Calm, idyllic, painterly, smooth gradients, no buildings, no people, no text. Wide cinematic composition, suitable as a relaxing background for a children's app.",
  },
  {
    name: "wheat-field-golden",
    prompt:
      "A golden wheat field gently swaying under a warm summer sky with soft cumulus clouds at golden hour. Rolling, peaceful, sun-kissed, painterly photographic quality, no people, no buildings, no roads, no text. Wide cinematic composition with horizon roughly one third from bottom, suitable as a calm background.",
  },
  {
    name: "cherry-blossom-sky",
    prompt:
      "Looking up through soft pink cherry blossom branches against a gentle pale blue spring sky. Petals drifting, dreamy bokeh, low contrast, painterly, soothing, no people, no buildings, no text. Wide cinematic composition, suitable as a peaceful desktop background for a children's app.",
  },
  {
    name: "calm-tropical-shore",
    prompt:
      "A calm tropical shoreline with turquoise water gently lapping a pale sandy beach, soft pastel sky with a few wispy clouds. Tranquil, painterly, smooth gradients, no people, no boats, no buildings, no palms in foreground, no text. Wide cinematic composition, suitable as a soothing background for a children's word-learning app.",
  },
  {
    name: "foggy-pines-dawn",
    prompt:
      "Soft fog drifting through a quiet pine forest at dawn, distant trees fading to pale blue, gentle warm light from the rising sun in the sky. Ethereal, painterly, low contrast, dreamy, no people, no animals, no text. Wide cinematic composition, suitable as a calming background.",
  },
  {
    name: "starry-night-hills",
    prompt:
      "A gentle starry night over softly rolling dark green hills, with a hint of the milky way and faint pastel auroral glow on the horizon. Calm, dreamy, painterly, low contrast so it stays soothing rather than dramatic, no people, no buildings, no text. Wide cinematic composition, suitable as a peaceful background for a children's app.",
  },
  {
    name: "autumn-forest-path",
    prompt:
      "A soft autumn forest with warm golden, amber and rust leaves, soft sunlight filtering through, a faint hint of a winding path. Cozy, dreamy, painterly photographic style, low contrast, no people, no animals, no text. Wide cinematic composition, suitable as a soothing background for a children's word-learning app.",
  },
];

async function main() {
  const outDir = path.join(process.cwd(), "client/public/backgrounds");
  await mkdir(outDir, { recursive: true });

  for (const v of variations) {
    console.log(`Generating ${v.name}...`);
    try {
      const res = await openai.images.generate({
        model: "gpt-image-2",
        prompt: v.prompt,
        size: "1536x1024",
        quality: "medium",
        n: 1,
      });

      const b64 = res.data?.[0]?.b64_json;
      if (!b64) {
        console.error(`  ✗ no data for ${v.name}`);
        continue;
      }
      const outPath = path.join(outDir, `${v.name}.png`);
      await writeFile(outPath, Buffer.from(b64, "base64"));
      console.log(`  ✓ saved ${outPath}`);
    } catch (err) {
      console.error(`  ✗ failed ${v.name}:`, err instanceof Error ? err.message : err);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
