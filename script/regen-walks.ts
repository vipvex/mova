/**
 * Regen Athena walk videos for all 8 dirs from current facing stills, then extract sprites.
 * Usage: npx tsx script/regen-walks.ts
 */
const BASE = process.env.API_BASE || "http://localhost:5000";
const DIRS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;

async function waitReady(timeoutMs = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/assets`);
      if (r.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("server not ready");
}

async function main() {
  await waitReady();
  let ok = 0, fail = 0;
  for (const dir of DIRS) {
    console.log(`=== WALK ${dir} ===`);
    try {
      const r = await fetch(`${BASE}/api/assets/generate-anim-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseKey: "char_athena",
          clip: "walk",
          dir,
          ensureFacing: true,
        }),
      });
      const text = await r.text();
      let d: any;
      try { d = JSON.parse(text); } catch {
        console.error("non-json", r.status, text.slice(0, 200));
        fail++;
        continue;
      }
      console.log("video", d.ok, d.key, "sprites", d.sprites?.count, d.error || d.details || "");
      if (!d.ok) { fail++; continue; }
      ok++;
      if (!(d.sprites?.count > 0)) {
        const er = await fetch(`${BASE}/api/assets/extract-sprites`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: `char_athena__vid_walk_${dir}` }),
        });
        const ed = await er.json();
        console.log("extract", ed.ok, ed.count, ed.error || "");
      }
    } catch (e: any) {
      console.error(dir, e?.message || e);
      fail++;
    }
  }
  console.log(`WALK DONE ok=${ok} fail=${fail}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
