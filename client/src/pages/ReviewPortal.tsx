import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import type { StoredLevel } from "@shared/gameTypes";

export default function ReviewPortal() {
  const [drafts, setDrafts] = useState<StoredLevel[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [, nav] = useLocation();

  async function load() {
    const r = await fetch("/api/review/queue");
    const d = await r.json();
    setDrafts(d.drafts || []);
  }
  useEffect(() => { load(); }, []);

  async function decide(id: string, decision: "approve" | "reject") {
    setBusy(id);
    const comment = decision === "reject" ? (prompt("Comment (becomes tomorrow's iteration prompt) — optional:") || "") : "";
    await fetch(`/api/review/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, comment }),
    });
    setBusy(null);
    load();
  }

  return (
    <div style={{ minHeight: "100dvh", background: "#0c1020", color: "#e8ecf6", fontFamily: "Nunito, system-ui, sans-serif", padding: 20 }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => nav("/map")} style={btn(false)}>← Map</button>
          <h1 style={{ fontSize: 26, margin: 0 }}>🏭 Morning review — {drafts.length} to swipe</h1>
        </div>
        <p style={{ opacity: .6, fontSize: 14 }}>Factory-generated overnight. 👍 = live on the map · 👎 = reject (+ comment steers tomorrow).</p>

        {drafts.length === 0 && (
          <div style={{ opacity: .6, marginTop: 30 }}>
            Queue empty. Generate a batch: <code>tsx --env-file=.env script/factory-run.ts</code>
          </div>
        )}

        <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
          {drafts.map((l) => (
            <div key={l.id} style={{ background: "#131a2e", border: "1px solid #263352", borderRadius: 16, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{l.title}</div>
                <div style={{ fontSize: 13, opacity: .6 }}>{l.engine} · {l.lang === "russian" ? "RU" : "ES"}</div>
              </div>
              {l.scores && <ScoreRow s={l.scores} />}
              <div style={{ fontSize: 13, opacity: .7, marginTop: 6 }}>{l.vocab?.join(" · ")}</div>
              {l.scores?.notes && <div style={{ fontSize: 12, opacity: .5, marginTop: 4, fontStyle: "italic" }}>“{l.scores.notes}”</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={() => nav(`/play/${l.id}`)} style={btn(false)}>▶︎ Play</button>
                <button disabled={busy === l.id} onClick={() => decide(l.id, "approve")} style={btn(true, "#22c55e")}>👍 Approve</button>
                <button disabled={busy === l.id} onClick={() => decide(l.id, "reject")} style={btn(true, "#ef4444")}>👎 Reject</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScoreRow({ s }: { s: NonNullable<StoredLevel["scores"]> }) {
  const tierColor = { S: "#22c55e", A: "#84cc16", B: "#eab308", C: "#f97316", reject: "#ef4444" }[s.tier];
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
      <span style={{ background: tierColor, color: "#0c1020", fontWeight: 800, padding: "2px 10px", borderRadius: 8 }}>{s.tier} · {s.total}/35</span>
      <span style={{ opacity: .7 }}>M{s.M} V{s.V} T{s.T} B{s.B} R{s.R} L{s.L} A{s.A}</span>
    </div>
  );
}
function btn(primary: boolean, bg?: string): React.CSSProperties {
  return { font: "inherit", fontWeight: 800, border: 0, borderRadius: 10, padding: "8px 14px",
    background: bg || (primary ? "#3b82f6" : "#1e2740"), color: "#fff", cursor: "pointer" };
}
