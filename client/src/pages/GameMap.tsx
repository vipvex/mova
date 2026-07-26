import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { getAllLevels } from "@/game/registry";
import type { BaseLevel } from "@shared/gameTypes";

const ENGINE_EMOJI: Record<string, string> = {
  runner: "🏃", catcher: "🧺", gate: "🚪", commander: "🤖", builder: "🌉",
  listener: "👂", memory: "🧠", number: "🔢", rhythm: "🎵",
};

export default function GameMap() {
  const [levels, setLevels] = useState<BaseLevel[]>([]);
  const [, nav] = useLocation();
  useEffect(() => { getAllLevels().then(setLevels); }, []);

  return (
    <div style={{ minHeight: "100dvh", background: "linear-gradient(#bfe3ff,#e9f7ff)", fontFamily: "Nunito, system-ui, sans-serif", padding: 20 }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ color: "#0b2b4a", fontSize: 34, margin: "6px 0 2px" }}>MOVA — карта</h1>
        <p style={{ color: "#3a5a7a", marginTop: 0 }}>Скажи слово — играй! ({levels.length} levels)</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginTop: 16 }}>
          {levels.map((l) => (
            <div key={l.id} onClick={() => nav(`/play/${l.id}`)} style={{
              cursor: "pointer", background: "#fff", borderRadius: 18,
              padding: 16, boxShadow: "0 4px 14px #0b2b4a22", border: "2px solid #cfe8ff", color: "#0b2b4a",
            }}>
              <div style={{ fontSize: 44 }}>{ENGINE_EMOJI[l.engine] || "🎮"}</div>
              <div style={{ fontWeight: 800, fontSize: 20, marginTop: 6 }}>{l.title}</div>
              <div style={{ fontSize: 12, opacity: .6, textTransform: "uppercase", letterSpacing: .5 }}>
                {l.engine} · {l.lang === "russian" ? "RU" : "ES"}{l.source === "factory" ? " · 🏭" : ""}
              </div>
              {l.vocab?.length ? (
                <div style={{ fontSize: 13, marginTop: 8, color: "#3a5a7a" }}>{l.vocab.slice(0, 5).join(" · ")}</div>
              ) : null}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24, fontSize: 13, display: "flex", gap: 18 }}>
          <span onClick={() => nav("/studio")} style={{ color: "#3b82f6", fontWeight: 700, cursor: "pointer" }}>🎮 Game Studio (admin) →</span>
          <span onClick={() => nav("/review")} style={{ color: "#3b82f6", fontWeight: 700, cursor: "pointer" }}>🏭 Review queue →</span>
        </div>
      </div>
    </div>
  );
}
