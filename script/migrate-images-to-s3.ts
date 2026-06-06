import { readdir, readFile } from "fs/promises";
import { join } from "path";
import pg from "pg";
import { uploadPng, objectExists, imageKey, publicUrl } from "../server/s3";

const MEDIA_DIR = join(import.meta.dirname, "..", "server", "media", "images");

const TABLES: Array<{ table: string; column: string }> = [
  { table: "vocabulary", column: "image_url" },
  { table: "stories", column: "cover_image_url" },
  { table: "story_pages", column: "image_url" },
  { table: "story_quizzes", column: "question_image_url" },
  { table: "story_references", column: "reference_image_url" },
  { table: "word_example_sentences", column: "image_url" },
];

const BATCH_SIZE = 10;

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  const files = await readdir(MEDIA_DIR);
  const pngFiles = files.filter(f => f.endsWith(".png"));
  console.log(`Found ${pngFiles.length} local PNGs in ${MEDIA_DIR}`);

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let dbRowsUpdated = 0;

  for (let i = 0; i < pngFiles.length; i += BATCH_SIZE) {
    const batch = pngFiles.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async file => {
        const id = file.replace(/\.png$/, "");
        const key = imageKey(id);
        const oldUrl = `/media/images/${file}`;
        const newUrl = publicUrl(key);

        if (await objectExists(key)) {
          skipped++;
        } else {
          const content = await readFile(join(MEDIA_DIR, file));
          await uploadPng(key, content);
          uploaded++;
        }

        for (const { table, column } of TABLES) {
          const r = await client.query(
            `UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`,
            [newUrl, oldUrl],
          );
          dbRowsUpdated += r.rowCount ?? 0;
        }

        return file;
      }),
    );

    for (const r of results) {
      if (r.status === "rejected") {
        failed++;
        console.error("Failed:", r.reason?.message || r.reason);
      }
    }
    console.log(
      `Progress: ${i + batch.length}/${pngFiles.length} ` +
        `(uploaded=${uploaded} skipped=${skipped} failed=${failed} rowsUpdated=${dbRowsUpdated})`,
    );
  }

  await client.end();
  console.log(
    `Done. uploaded=${uploaded} skipped=${skipped} failed=${failed} rowsUpdated=${dbRowsUpdated}`,
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
