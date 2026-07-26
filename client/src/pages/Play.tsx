import { useEffect, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import Phaser from "phaser";
import { SCENES, getLevel, BUILTIN_LEVELS } from "@/game/registry";
import { VoiceInput, type VoiceState } from "@/lib/voiceInput";
import type { BaseLevel, GameHud } from "@shared/gameTypes";

type KitchenTune = { moveSpeed: number; interactRadius: number; bodyScale: number; timeSec: number };

export default function Play() {
  const [, params] = useRoute("/play/:id");
  const levelId = params?.id;
  const [, nav] = useLocation();

  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const levelRef = useRef<BaseLevel | null>(null);
  const voiceRef = useRef<VoiceInput | null>(null);
  const grammarRef = useRef<string[] | null>(null);
  const assetsRef = useRef<Record<string, string>>({});
  const animMetaRef = useRef<Record<string, { loopStart?: number; loopEnd?: number; keyed?: boolean; frameCount?: number }>>({});

  const [level, setLevel] = useState<BaseLevel | null>(null);
  const [hud, setHud] = useState<GameHud>({ cleared: 0, total: 0, misses: 0, state: "ready" });
  const [telegraph, setTelegraph] = useState("");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [heard, setHeard] = useState<{ word: string; ms: number } | null>(null);
  const [voiceErr, setVoiceErr] = useState("");
  const [endpoint, setEndpoint] = useState(110);
  const [speed, setSpeed] = useState<number | null>(null);
  const [tune, setTune] = useState<KitchenTune | null>(null);
  const [showTune, setShowTune] = useState(false);

  const scene = () => (level ? (gameRef.current?.scene.getScene(level.engine) as any) : undefined);

  // Persisted per-level gameplay tuning (Kitchen). Applied live to the running scene.
  const tuneKey = level ? `mova.tune.${level.id}` : "";
  function applyTune(patch: Partial<KitchenTune>) {
    setTune((prev) => {
      const next = { ...(prev as KitchenTune), ...patch };
      scene()?.setTuning?.(next);
      try { if (tuneKey) localStorage.setItem(tuneKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  // resolve the level (route id, else first builtin) + fetch the sprite manifest first
  useEffect(() => {
    (async () => {
      const [l, assetsResp, metaResp] = await Promise.all([
        levelId ? getLevel(levelId) : Promise.resolve(BUILTIN_LEVELS[0]),
        fetch("/api/assets").then((r) => r.json()).catch(() => ({ assets: {} })),
        fetch("/api/assets/anim-meta").then((r) => r.json()).catch(() => ({ meta: {} })),
      ]);
      assetsRef.current = assetsResp?.assets || {};
      animMetaRef.current = metaResp?.meta || {};
      if (l) { levelRef.current = l; setLevel(l); setSpeed((l as any).tuning?.scrollPxPerSec ?? (l as any).tuning?.fallPxPerSec ?? null); }
    })();
  }, [levelId]);

  function postTelemetry(e: any) {
    const l = levelRef.current; if (!l) return;
    fetch("/api/telemetry", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...e, levelId: l.id, engine: l.engine }) }).catch(() => {});
  }

  function startLevel() {
    const l = levelRef.current; if (!l) return;
    grammarRef.current = null;
    gameRef.current?.scene.start(l.engine, {
      level: l,
      assets: assetsRef.current,
      animMeta: animMetaRef.current,
      hooks: {
        onHud: setHud,
        onNeedWord: setTelegraph,
        onSetGrammar: (words: string[]) => { grammarRef.current = words; voiceRef.current?.setGrammar(words); },
        onTelemetry: postTelemetry,
      },
    });
    // Re-apply persisted tuning after the scene re-inits (it resets tune from the level),
    // or seed the panel from the scene defaults on first run.
    if (l.engine === "kitchen") {
      let persisted: KitchenTune | null = null;
      try { const raw = localStorage.getItem(`mova.tune.${l.id}`); if (raw) persisted = JSON.parse(raw); } catch { /* ignore */ }
      setTimeout(() => {
        const sc = scene(); if (!sc) return;
        if (persisted) { sc.setTuning?.(persisted); setTune(persisted); }
        else { const t = sc.getTuning?.(); if (t) setTune(t); }
      }, 80);
    }
  }

  useEffect(() => {
    if (!hostRef.current || !level) return;
    const SceneClass = SCENES[level.engine];
    if (!SceneClass) { setVoiceErr(`No engine "${level.engine}" yet`); return; }

    // Render at the device pixel ratio so the canvas is crisp on retina/HiDPI
    // displays. World size = physical px (backing store), zoom = 1/dpr pulls the
    // CSS display size back down to logical px. Mipmaps smooth the big sprites
    // as they downscale into small grid cells.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const game = new Phaser.Game({
      type: Phaser.AUTO, parent: hostRef.current, backgroundColor: "#bfe3ff",
      scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.CENTER_BOTH, zoom: 1 / dpr },
      render: { antialias: true, roundPixels: false, mipmapFilter: "LINEAR_MIPMAP_LINEAR", powerPreference: "high-performance" },
      physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 }, debug: false } },
      audio: { noAudio: true },
    });
    gameRef.current = game;

    const host = hostRef.current;
    const applySize = () => { if (host) game.scale.resize(host.clientWidth * dpr, host.clientHeight * dpr); };
    const ro = new ResizeObserver(applySize);
    game.events.once("ready", () => { applySize(); ro.observe(host); });
    // debug/test hook: window.__mova.attempt("word") simulates a recognized word
    (window as any).__mova = { attempt: (w: string, ms?: number) => scene()?.attemptWord(w, ms) };
    game.scene.add(level.engine, SceneClass, false);
    let started = false;
    const begin = () => { if (started) return; started = true; startLevel(); };
    game.events.once("ready", begin);
    setTimeout(begin, 120);

    return () => { ro.disconnect(); voiceRef.current?.stop(); voiceRef.current = null; game.destroy(true); gameRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  async function enableVoice() {
    setVoiceErr("");
    const l = levelRef.current; if (!l) return;
    if (!voiceRef.current) {
      voiceRef.current = new VoiceInput({
        lang: l.lang, grammar: grammarRef.current ?? l.words, endpointSilenceMs: endpoint,
        onMatch: (m) => { setHeard({ word: m.word, ms: m.latencyMs }); scene()?.attemptWord(m.word, m.latencyMs); },
        onState: setVoiceState, onError: (e) => setVoiceErr(e),
      });
    }
    try { await voiceRef.current.start(); } catch (e: any) { setVoiceErr(e?.message || String(e)); }
  }

  useEffect(() => { voiceRef.current?.setEndpointSilenceMs(endpoint); }, [endpoint]);
  useEffect(() => { if (speed != null) scene()?.setSpeed?.(speed); }, [speed]);

  // Voice is intent-triggered: press "V" to toggle it on/off. The keypress also
  // satisfies the browser's gesture requirement for the mic.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.key !== "v" && e.key !== "V")) return;
      if (level?.voiceRest) return;
      if (voiceRef.current && voiceState !== "idle") voiceRef.current.stop();
      else enableVoice();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceState, level]);

  const listening = voiceState !== "idle";

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#bfe3ff", fontFamily: "Nunito, system-ui, sans-serif" }}>
      <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />

      <div style={{ position: "absolute", top: 12, left: 16, right: 16, display: "flex", justifyContent: "space-between", pointerEvents: "none", color: "#0b2b4a", fontWeight: 800 }}>
        <div style={{ fontSize: 22 }}>✅ {hud.cleared}/{hud.total} &nbsp; 💥 {hud.misses}</div>
        <div style={{ fontSize: 22 }}>
          {telegraph && <span style={{ background: "#ffffffcc", padding: "4px 12px", borderRadius: 10 }}>say: <b>{telegraph}</b></span>}
        </div>
      </div>

      {heard && (
        <div style={{ position: "absolute", top: 52, left: 16, color: "#0b2b4a", fontSize: 14, opacity: .8 }}>
          heard “{heard.word}” · {heard.ms}ms {voiceState === "thinking" ? "· thinking…" : ""}
        </div>
      )}

      {level?.engine === "kitchen" && showTune && tune && (
        <div style={{ position: "absolute", right: 16, bottom: 70, width: 300, background: "#0c1020f2", color: "#e8ecf6",
          padding: "14px 16px", borderRadius: 14, boxShadow: "0 8px 30px #0008", fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <b style={{ fontSize: 14 }}>⚙ Gameplay tuning</b>
            <button onClick={() => setShowTune(false)} style={{ ...btn(false), padding: "2px 9px" }}>✕</button>
          </div>
          {tuneRow("Move speed", tune.moveSpeed, 120, 700, 10, (v) => applyTune({ moveSpeed: v }), "px/s")}
          {tuneRow("Reach (pickup / deliver)", tune.interactRadius, 0.8, 2.4, 0.1, (v) => applyTune({ interactRadius: v }), "tiles")}
          {tuneRow("Hitbox size", tune.bodyScale, 0.3, 0.9, 0.05, (v) => applyTune({ bodyScale: v }), "tile")}
          {tuneRow("Round time", tune.timeSec, 30, 240, 5, (v) => applyTune({ timeSec: v }), "s")}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={startLevel} style={{ ...btn(true), flex: 1 }}>↻ Restart (apply time)</button>
            <button onClick={() => { try { if (tuneKey) localStorage.removeItem(tuneKey); } catch { /* ignore */ } startLevel(); }} style={btn(false)}>Reset</button>
          </div>
          <div style={{ opacity: .55, fontSize: 11, marginTop: 8 }}>Speed / reach / hitbox apply live. Round time applies on restart. Saved per level.</div>
        </div>
      )}

      {hud.state === "won" && (
        <div style={{ position: "absolute", top: "58%", left: 0, right: 0, textAlign: "center" }}>
          <button onClick={startLevel} style={btn(true)}>▶︎ Play again</button>
          <button onClick={() => nav("/map")} style={{ ...btn(false), marginLeft: 10 }}>🗺 Map</button>
        </div>
      )}

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#0c1020ee", color: "#e8ecf6", padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", fontSize: 13 }}>
        <button onClick={() => nav("/map")} style={btn(false)}>← Map</button>
        {level?.voiceRest
          ? <span style={{ color: "#38bdf8", fontWeight: 700 }}>🎧 voice-rest · d-pad only</span>
          : !listening
            ? <button onClick={enableVoice} style={btn(true)}>🎤 Enable voice (press V)</button>
            : <span style={{ color: "#4ade80", fontWeight: 700 }}>● {voiceState} · V to stop</span>}
        <button onClick={startLevel} style={btn(false)}>↻ Restart</button>
        {level?.engine === "kitchen" && <button onClick={() => setShowTune((s) => !s)} style={btn(showTune)}>⚙ Tune</button>}
        <span style={{ opacity: .6 }}>{level?.title} · {level?.engine}</span>
        {voiceErr && <span style={{ color: "#f59e0b" }}>⚠ {voiceErr}</span>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 16, flexWrap: "wrap" }}>
          {speed != null && knob("speed", speed, 100, 520, 10, setSpeed, "px/s")}
          {knob("endpoint", endpoint, 60, 400, 10, setEndpoint, "ms")}
        </div>
      </div>
    </div>
  );
}

function btn(primary: boolean): React.CSSProperties {
  return { font: "inherit", fontWeight: 800, border: 0, borderRadius: 12, padding: "10px 16px",
    background: primary ? "#3b82f6" : "#1e2740", color: "#fff", cursor: "pointer" };
}
function tuneRow(label: string, value: number, min: number, max: number, step: number, set: (n: number) => void, unit: string) {
  return (
    <label style={{ display: "block", marginBottom: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
        <span style={{ opacity: .8 }}>{label}</span>
        <b>{step < 1 ? value.toFixed(2) : value}{unit ? ` ${unit}` : ""}</b>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(parseFloat(e.target.value))} style={{ width: "100%" }} />
    </label>
  );
}
function knob(label: string, value: number, min: number, max: number, step: number, set: (n: number) => void, unit: string) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 120 }}>
      <span style={{ opacity: .6, fontSize: 11 }}>{label}: {value}{unit}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(parseFloat(e.target.value))} />
    </label>
  );
}
