import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, mkdir, writeFile, cp } from "fs/promises";
import { execSync } from "child_process";
import path from "path";

async function buildAll() {
  // Clean output
  await rm(".vercel/output", { recursive: true, force: true });

  // 1. Build client with Vite
  console.log("building client...");
  await viteBuild();

  // 2. Bundle API serverless function — bundle everything except pg (native bindings)
  console.log("building api serverless function...");
  await esbuild({
    entryPoints: ["server/api-entry.ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: ".vercel/output/functions/api/index.func/index.mjs",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.VERCEL": '"1"',
    },
    minify: true,
    external: ["pg-native"],
    banner: {
      js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
    },
    logLevel: "info",
  });

  // 3. Write function config
  await writeFile(
    ".vercel/output/functions/api/index.func/.vc-config.json",
    JSON.stringify({
      runtime: "nodejs20.x",
      handler: "index.mjs",
      maxDuration: 60,
      launcherType: "Nodejs",
      includeFiles: "index.mjs",
    })
  );

  // 4. Copy static assets to output
  console.log("copying static assets...");
  await cp("dist/public", ".vercel/output/static", { recursive: true });

  // 5. Write output config with rewrites
  await mkdir(".vercel/output", { recursive: true });
  await writeFile(
    ".vercel/output/config.json",
    JSON.stringify({
      version: 3,
      routes: [
        { src: "/api/(.*)", dest: "/api/index" },
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index.html" },
      ],
    })
  );

  console.log("build complete!");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
