import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { BUILTIN_LEVELS } from "@/game/registry";
import { GAME_IDEAS, BUILT_ENGINES, FACTORY_ENGINES, type GameIdea } from "@/game/gameIdeas";
import { VISUAL_STYLES } from "@shared/styles";
import { ASSET_PACKS } from "@shared/assetCatalog";
import { defaultMasterPrompt, promptKindForKey } from "@shared/assetPrompts";
import {
  VIDEO_ANIM_SPECS, allVideoClipRows, videoClipKey, composeDirectionalPrompt,
  facingStillKey, videoFrameKeys, spritePlaybackFps,
  type VideoClip, type IsoDir,
} from "@shared/animCatalog";
import type { StoredLevel } from "@shared/gameTypes";
import { useUrlTab } from "@/lib/useUrlTab";

const MASTER_PROMPT_STORE = "mova.studio.masterPrompt.v1";

function masterStorageKey(styleId: string, assetKey: string, fromPhoto: boolean): string {
  return `${styleId}|${promptKindForKey(assetKey)}|${fromPhoto ? "photo" : "base"}`;
}

function readStoredMaster(key: string): string | null {
  try {
    const all = JSON.parse(localStorage.getItem(MASTER_PROMPT_STORE) || "{}");
    const v = all?.[key];
    return typeof v === "string" && v.trim() ? v : null;
  } catch { return null; }
}

function writeStoredMaster(key: string, value: string) {
  try {
    const all = JSON.parse(localStorage.getItem(MASTER_PROMPT_STORE) || "{}");
    all[key] = value;
    localStorage.setItem(MASTER_PROMPT_STORE, JSON.stringify(all));
  } catch { /* ignore */ }
}

function clearStoredMaster(key: string) {
  try {
    const all = JSON.parse(localStorage.getItem(MASTER_PROMPT_STORE) || "{}");
    delete all[key];
    localStorage.setItem(MASTER_PROMPT_STORE, JSON.stringify(all));
  } catch { /* ignore */ }
}

/** Stable proxy path + cache-bust. Strips any prior ?query so we never produce ?v=a?v=b. */
function assetSrc(path: string | undefined | null, bust?: number | string | null): string | null {
  if (!path) return null;
  const base = String(path).split(/[?#]/)[0];
  // Use 0 when no bust yet (stable across renders). After regen, pass Date.now()/server v.
  const v = bust == null || bust === "" ? 0 : bust;
  return `${base}?v=${v}`;
}

const STUDIO_TABS = ["levels", "ideas", "styles", "assets", "animations", "history"] as const;
type StudioTab = (typeof STUDIO_TABS)[number];

const ASSET_COUNT = ASSET_PACKS.reduce((n, p) => n + p.assets.length, 0);

type Row = Partial<StoredLevel> & {
  id: string; engine: string; title: string; lang: string;
  source: string; status: string; vocab?: string[];
};

// ── Unity-style editor tokens ────────────────────────────────────────────────
const S = {
  bg: "#1e1e1e",
  panel: "#252526",
  panel2: "#2d2d30",
  hover: "#2a2d2e",
  selected: "#094771",
  border: "#3e3e42",
  borderSoft: "#333337",
  text: "#cccccc",
  textDim: "#858585",
  textBright: "#f0f0f0",
  accent: "#0e639c",
  accentHover: "#1177bb",
  ok: "#4ec9b0",
  warn: "#dcdcaa",
  err: "#f48771",
  mono: 'ui-monospace, "Cascadia Code", "SF Mono", Menlo, monospace',
  font: 'system-ui, "Segoe UI", sans-serif',
} as const;

const STATUS_COLOR: Record<string, string> = {
  approved: S.ok, draft: S.warn, rejected: S.err,
};
const TIER_COLOR: Record<string, string> = {
  S: "#4ec9b0", A: "#b5cea8", B: "#dcdcaa", C: "#ce9178", reject: "#f48771", DQ: "#858585",
};

const CHECKER: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg,#2a2a2a 25%,transparent 25%),linear-gradient(-45deg,#2a2a2a 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#2a2a2a 75%),linear-gradient(-45deg,transparent 75%,#2a2a2a 75%)",
  backgroundSize: "12px 12px",
  backgroundPosition: "0 0,0 6px,6px -6px,-6px 0",
  backgroundColor: "#1a1a1a",
};

const sel: React.CSSProperties = {
  font: "inherit", fontSize: 12, padding: "4px 8px", borderRadius: 3,
  border: `1px solid ${S.border}`, background: S.bg, color: S.textBright, outline: "none",
};
function btn(primary: boolean, bg?: string): React.CSSProperties {
  return {
    font: "inherit", fontSize: 12, fontWeight: 600, border: `1px solid ${primary ? "transparent" : S.border}`,
    borderRadius: 3, padding: "4px 10px",
    background: bg || (primary ? S.accent : S.panel2),
    color: S.textBright, cursor: "pointer", whiteSpace: "nowrap",
  };
}
function chip(active: boolean): React.CSSProperties {
  return {
    font: "inherit", fontSize: 11, fontWeight: 600, border: `1px solid ${active ? S.accent : S.border}`,
    borderRadius: 3, padding: "3px 8px",
    background: active ? S.selected : "transparent", color: active ? S.textBright : S.textDim, cursor: "pointer",
  };
}
const td: React.CSSProperties = { padding: "5px 8px", whiteSpace: "nowrap", fontSize: 12, verticalAlign: "middle" };
const toolbarStyle: React.CSSProperties = {
  display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
  padding: "8px 12px", background: S.panel, borderBottom: `1px solid ${S.border}`,
  flexShrink: 0,
};
const panelStyle: React.CSSProperties = {
  flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: S.bg,
};

function Th({ children, onClick, active, title, style }: {
  children?: React.ReactNode; onClick?: () => void; active?: boolean; title?: string; style?: React.CSSProperties;
}) {
  return (
    <th title={title} onClick={onClick} style={{
      padding: "6px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6,
      color: active ? "#9cdcfe" : S.textDim, cursor: onClick ? "pointer" : "default",
      whiteSpace: "nowrap", borderBottom: `1px solid ${S.border}`, background: S.panel, position: "sticky", top: 0, zIndex: 1,
      textAlign: "left", ...style,
    }}>{children}</th>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "ok" | "warn" | "err" | "dim" | "busy" }) {
  const color = tone === "ok" ? S.ok : tone === "warn" ? S.warn : tone === "err" ? S.err : tone === "busy" ? "#9cdcfe" : S.textDim;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
      color, border: `1px solid ${color}55`, padding: "1px 6px", borderRadius: 2, background: `${color}14`,
    }}>{label}</span>
  );
}

function Spinner({ label }: { label?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width="20" height="20" viewBox="0 0 50 50" aria-label="loading">
        <circle cx="25" cy="25" r="20" fill="none" stroke={S.accent} strokeWidth={5} strokeLinecap="round" strokeDasharray="80 45">
          <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite" />
        </circle>
      </svg>
      {label && <span style={{ fontSize: 10, color: S.textDim }}>{label}</span>}
    </div>
  );
}

/** Persist a clamped number in localStorage (inspector width / preview height). */
function usePersistedNumber(storageKey: string, defaultValue: number, min: number, max: number) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const n = raw ? Number(raw) : NaN;
      if (Number.isFinite(n)) return Math.min(max, Math.max(min, n));
    } catch { /* ignore */ }
    return defaultValue;
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, String(value)); } catch { /* ignore */ }
  }, [storageKey, value]);
  return { value, setValue, min, max };
}

/** Right-side inspector with a drag handle on the left edge to resize width. */
function ResizableInspector({
  storageKey, defaultWidth = 320, children,
}: {
  storageKey: string; defaultWidth?: number; children: ReactNode;
}) {
  const { value: width, setValue: setWidth, min, max } = usePersistedNumber(storageKey, defaultWidth, 240, 720);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      // Dragging the left edge: moving left grows the panel, right shrinks it.
      const next = Math.min(max, Math.max(min, d.startW + (d.startX - e.clientX)));
      setWidth(next);
    };
    const onUp = () => { dragRef.current = null; setDragging(false); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, min, max, setWidth]);

  return (
    <aside style={{
      width, flexShrink: 0, borderLeft: `1px solid ${S.border}`, background: S.panel,
      display: "flex", flexDirection: "column", overflow: "auto", position: "relative",
    }}>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize inspector"
        title="Drag to resize"
        onPointerDown={(e) => {
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          dragRef.current = { startX: e.clientX, startW: width };
          setDragging(true);
        }}
        style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: 6, marginLeft: -3,
          cursor: "col-resize", zIndex: 5,
          background: dragging ? `${S.accent}66` : "transparent",
        }}
        onMouseEnter={(e) => { if (!dragging) (e.currentTarget as HTMLElement).style.background = `${S.accent}33`; }}
        onMouseLeave={(e) => { if (!dragging) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      />
      {children}
    </aside>
  );
}

/** Unity-style preview pane — drag the bottom edge to grow/shrink height (persisted). */
function ResizablePreview({
  storageKey, defaultHeight = 160, min = 72, max = 560, children, style,
}: {
  storageKey: string;
  defaultHeight?: number;
  min?: number;
  max?: number;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  const { value: height, setValue: setHeight, min: minH, max: maxH } = usePersistedNumber(
    storageKey, defaultHeight, min, max,
  );
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const next = Math.min(maxH, Math.max(minH, d.startH + (e.clientY - d.startY)));
      setHeight(next);
    };
    const onUp = () => { dragRef.current = null; setDragging(false); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, minH, maxH, setHeight]);

  return (
    <div style={{ position: "relative", height, flexShrink: 0, ...style }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {children}
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize preview"
        title="Drag to resize preview"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          dragRef.current = { startY: e.clientY, startH: height };
          setDragging(true);
        }}
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0, height: 8, marginBottom: -3,
          cursor: "row-resize", zIndex: 6,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: dragging ? `${S.accent}55` : "transparent",
        }}
        onMouseEnter={(e) => { if (!dragging) (e.currentTarget as HTMLElement).style.background = `${S.accent}28`; }}
        onMouseLeave={(e) => { if (!dragging) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <div style={{
          width: 28, height: 3, borderRadius: 2,
          background: dragging ? S.accent : S.border,
        }} />
      </div>
    </div>
  );
}

function assetType(key: string): string {
  if (key.startsWith("char_")) return "Character";
  if (key.startsWith("ing_")) return "Ingredient";
  if (key.startsWith("env_")) return "Tile";
  return "Sprite";
}

// ── Shell ────────────────────────────────────────────────────────────────────
export default function AdminGames() {
  const [, nav] = useLocation();
  const [tab, setTab] = useUrlTab<StudioTab>({
    basePath: "/studio",
    tabs: STUDIO_TABS,
    defaultTab: "levels",
    storageKey: "mova.studio.tab",
    aliases: { built: "levels" }, // legacy in-memory tab id
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [statusF, setStatusF] = useState("all");
  const [engineF, setEngineF] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [gEngine, setGEngine] = useState("runner");
  const [gLang, setGLang] = useState("russian");
  const [gDomain, setGDomain] = useState("");
  const [gDiff, setGDiff] = useState("easy");
  const [gStatus, setGStatus] = useState("");
  const [houseStyle, setHouseStyleState] = useState("flat-vector");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [media, setMedia] = useState<MediaPrefs | null>(null);

  useEffect(() => {
    fetch("/api/styles/active").then((r) => r.json()).then((d) => {
      if (d.styleId) setHouseStyleState(d.styleId);
      if (Array.isArray(d.favorites)) setFavorites(d.favorites);
    }).catch(() => {});
    fetch("/api/media/providers").then((r) => r.json()).then(setMedia).catch(() => {});
  }, []);

  async function patchMedia(patch: Partial<MediaPrefs>) {
    setMedia((m) => (m ? { ...m, ...patch } : m));
    try {
      const r = await fetch("/api/media/providers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const d = await r.json();
      setMedia((m) => ({ ...(m || {}), ...d }));
    } catch { /* keep optimistic */ }
  }

  async function setHouseStyle(id: string) {
    setHouseStyleState(id);
    try {
      const r = await fetch("/api/styles/active", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleId: id }),
      });
      const d = await r.json();
      if (d.styleId) setHouseStyleState(d.styleId);
      if (Array.isArray(d.favorites)) setFavorites(d.favorites);
    } catch { /* keep optimistic local value */ }
  }

  async function toggleFavorite(id: string) {
    try {
      const r = await fetch("/api/styles/favorite", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleId: id }),
      });
      const d = await r.json();
      if (Array.isArray(d.favorites)) setFavorites(d.favorites);
    } catch { /* ignore */ }
  }

  async function load() {
    let factory: Row[] = [];
    try {
      const r = await fetch("/api/admin/levels");
      const d = await r.json();
      factory = d.levels || [];
    } catch { /* ignore */ }
    const builtin: Row[] = (BUILTIN_LEVELS as any[]).map((l) => ({
      id: l.id, engine: l.engine, title: l.title, lang: l.lang,
      source: "handmade", status: "approved", vocab: l.vocab,
    }));
    setRows([...factory.reverse(), ...builtin]);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((r) =>
    (statusF === "all" || r.status === statusF) && (engineF === "all" || r.engine === engineF)
  ), [rows, statusF, engineF]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { total: rows.length, approved: 0, draft: 0, rejected: 0 };
    rows.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [rows]);

  const engines = useMemo(() => Array.from(new Set(rows.map((r) => r.engine))), [rows]);

  async function decide(id: string, decision: "approve" | "reject") {
    setBusy(id);
    const comment = decision === "reject" ? (prompt("Reject comment (steers tomorrow's generation) — optional:") || "") : "";
    await fetch(`/api/review/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, comment }) });
    setBusy(null); load();
  }
  async function del(id: string) {
    if (!confirm("Delete this level permanently?")) return;
    setBusy(id);
    await fetch(`/api/levels/${id}`, { method: "DELETE" });
    setBusy(null); load();
  }
  async function generate() {
    if (!gDomain.trim()) { setGStatus("enter a vocab domain"); return; }
    setGStatus("generating…");
    try {
      const r = await fetch("/api/factory/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engine: gEngine, lang: gLang, vocabDomain: gDomain, difficulty: gDiff }),
      });
      const d = await r.json();
      setGStatus(d.level ? `✓ ${d.level.title} · tier ${d.level.scores?.tier}` : `✗ ${d.details || "failed"}`);
      setGDomain(""); load();
    } catch (e: any) { setGStatus("✗ " + (e?.message || e)); }
  }

  async function generateFromIdea(idea: GameIdea) {
    setBusy("idea-" + idea.n);
    try {
      const r = await fetch("/api/factory/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engine: idea.engine, lang: gLang, vocabDomain: idea.teaches, title: idea.name }),
      });
      const d = await r.json();
      setBusy(null);
      if (d.level) { setTab("levels"); load(); }
      else alert("Generation failed: " + (d.details || "unknown"));
    } catch (e: any) { setBusy(null); alert(String(e?.message || e)); }
  }

  const TABS: Array<{ id: StudioTab; label: string; count?: number }> = [
    { id: "levels", label: "Levels", count: rows.length },
    { id: "ideas", label: "Ideas", count: GAME_IDEAS.length },
    { id: "styles", label: "Styles", count: VISUAL_STYLES.length },
    { id: "assets", label: "Assets", count: ASSET_COUNT },
    { id: "animations", label: "Animations" },
    { id: "history", label: "History" },
  ];

  return (
    <div style={{
      height: "100dvh", background: S.bg, color: S.text, fontFamily: S.font,
      fontSize: 13, display: "flex", alignItems: "stretch", overflow: "hidden",
    }}>
      {/* Left nav */}
      <nav style={{
        width: 200, flexShrink: 0, background: S.panel, borderRight: `1px solid ${S.border}`,
        display: "flex", flexDirection: "column", padding: "12px 0", boxSizing: "border-box",
      }}>
        <div style={{ padding: "0 14px 12px", borderBottom: `1px solid ${S.borderSoft}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: S.textBright, letterSpacing: 0.3 }}>Game Studio</div>
          <div style={{ fontSize: 10, color: S.textDim, marginTop: 4, lineHeight: 1.5 }}>
            {counts.total} levels<br />
            <span style={{ color: STATUS_COLOR.approved }}>{counts.approved} live</span>
            {" · "}
            <span style={{ color: STATUS_COLOR.draft }}>{counts.draft || 0} draft</span>
            {" · "}
            <span style={{ color: STATUS_COLOR.rejected }}>{counts.rejected || 0} rejected</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "8px 6px", flex: 1 }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              font: "inherit", fontSize: 12, fontWeight: tab === t.id ? 600 : 400, border: 0, borderRadius: 3,
              padding: "7px 10px", textAlign: "left", cursor: "pointer",
              background: tab === t.id ? S.selected : "transparent",
              color: tab === t.id ? S.textBright : S.text,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span>{t.label}</span>
              {t.count != null && <span style={{ fontSize: 10, color: S.textDim, fontVariantNumeric: "tabular-nums" }}>{t.count}</span>}
            </button>
          ))}
        </div>
        <div style={{ padding: "8px 6px", borderTop: `1px solid ${S.borderSoft}`, display: "flex", flexDirection: "column", gap: 4 }}>
          <button onClick={() => nav("/map")} style={{ ...btn(false), width: "100%", textAlign: "left" }}>Map</button>
          <button onClick={() => nav("/review")} style={{ ...btn(false), width: "100%", textAlign: "left" }}>Review queue</button>
        </div>
      </nav>

      {/* Main workspace */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{
          ...toolbarStyle, borderBottom: `1px solid ${S.border}`,
          justifyContent: "flex-start", gap: 10,
        }}>
          <HouseStyleSelect value={houseStyle} favorites={favorites} onChange={setHouseStyle} />
          {media && <MediaProvidersBar media={media} onPatch={patchMedia} />}
          <span style={{ fontSize: 11, color: S.textDim }}>
            Style + providers apply to every asset / tile / photo / frame / sheet / TTS gen
          </span>
        </div>
        {tab === "levels" && (
          <LevelsTab
            filtered={filtered} engines={engines} statusF={statusF} setStatusF={setStatusF}
            engineF={engineF} setEngineF={setEngineF} busy={busy}
            gEngine={gEngine} setGEngine={setGEngine} gLang={gLang} setGLang={setGLang}
            gDomain={gDomain} setGDomain={setGDomain} gDiff={gDiff} setGDiff={setGDiff}
            gStatus={gStatus} generate={generate} decide={decide} del={del} nav={nav}
          />
        )}
        {tab === "ideas" && <IdeasTable lang={gLang} setLang={setGLang} busy={busy} onGenerate={generateFromIdea} />}
        {tab === "styles" && (
          <StylesTab
            houseStyle={houseStyle} favorites={favorites}
            onUse={setHouseStyle} onToggleFavorite={toggleFavorite}
          />
        )}
        {tab === "assets" && (
          <AssetsTab styleId={houseStyle} setStyleId={setHouseStyle} favorites={favorites} />
        )}
        {tab === "animations" && (
          <AnimationsTab styleId={houseStyle} setStyleId={setHouseStyle} favorites={favorites} />
        )}
        {tab === "history" && <GenHistoryTab />}
      </main>
    </div>
  );
}

// ── Levels ───────────────────────────────────────────────────────────────────
function LevelsTab({ filtered, engines, statusF, setStatusF, engineF, setEngineF, busy,
  gEngine, setGEngine, gLang, setGLang, gDomain, setGDomain, gDiff, setGDiff, gStatus,
  generate, decide, del, nav,
}: {
  filtered: Row[]; engines: string[]; statusF: string; setStatusF: (s: string) => void;
  engineF: string; setEngineF: (s: string) => void; busy: string | null;
  gEngine: string; setGEngine: (s: string) => void; gLang: string; setGLang: (s: string) => void;
  gDomain: string; setGDomain: (s: string) => void; gDiff: string; setGDiff: (s: string) => void;
  gStatus: string; generate: () => void;
  decide: (id: string, d: "approve" | "reject") => void; del: (id: string) => void;
  nav: (p: string) => void;
}) {
  return (
    <div style={panelStyle}>
      <div style={toolbarStyle}>
        <span style={{ fontSize: 11, fontWeight: 700, color: S.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>Generate</span>
        <select value={gEngine} onChange={(e) => setGEngine(e.target.value)} style={sel}>
          <option value="runner">runner</option><option value="catcher">catcher</option>
        </select>
        <select value={gLang} onChange={(e) => setGLang(e.target.value)} style={sel}>
          <option value="russian">RU</option><option value="spanish">ES</option>
        </select>
        <input value={gDomain} onChange={(e) => setGDomain(e.target.value)} placeholder="vocab domain…"
          style={{ ...sel, minWidth: 200, flex: 1 }} onKeyDown={(e) => e.key === "Enter" && generate()} />
        <select value={gDiff} onChange={(e) => setGDiff(e.target.value)} style={sel}>
          <option value="easy">easy</option><option value="medium">medium</option><option value="hard">hard</option>
        </select>
        <button onClick={generate} style={btn(true)}>Generate</button>
        {gStatus && <span style={{ fontSize: 11, color: S.textDim }}>{gStatus}</span>}
      </div>
      <div style={{ ...toolbarStyle, borderBottom: `1px solid ${S.borderSoft}` }}>
        {["all", "approved", "draft", "rejected"].map((s) => (
          <button key={s} onClick={() => setStatusF(s)} style={chip(statusF === s)}>{s}</button>
        ))}
        <span style={{ width: 1, height: 16, background: S.border, margin: "0 4px" }} />
        <button onClick={() => setEngineF("all")} style={chip(engineF === "all")}>all engines</button>
        {engines.map((e) => (
          <button key={e} onClick={() => setEngineF(e)} style={chip(engineF === e)}>{e}</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, color: S.textDim }}>{filtered.length} levels</span>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th>Title</Th>
              <Th>Engine</Th>
              <Th>Lang</Th>
              <Th>Source</Th>
              <Th>Status</Th>
              <Th>Tier</Th>
              <Th>Vocab</Th>
              <Th style={{ textAlign: "right" }}>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l, idx) => (
              <tr key={l.id} style={{ background: idx % 2 ? S.panel : S.bg, borderTop: `1px solid ${S.borderSoft}` }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = S.hover; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = idx % 2 ? S.panel : S.bg; }}>
                <td style={{ ...td, fontWeight: 600, color: S.textBright }}>{l.title}</td>
                <td style={td}><code style={{ fontFamily: S.mono, fontSize: 11, color: S.textDim }}>{l.engine}</code></td>
                <td style={td}>{l.lang === "russian" ? "RU" : "ES"}</td>
                <td style={{ ...td, color: S.textDim }}>{l.source}</td>
                <td style={td}>
                  <StatusBadge label={l.status} tone={l.status === "approved" ? "ok" : l.status === "draft" ? "warn" : "err"} />
                </td>
                <td style={td}>
                  {l.scores ? (
                    <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 11 }}>
                      <b style={{ color: TIER_COLOR[l.scores.tier] }}>{l.scores.tier}</b>
                      <span style={{ color: S.textDim }}> {l.scores.total}/35</span>
                    </span>
                  ) : <span style={{ color: S.textDim }}>—</span>}
                </td>
                <td style={{ ...td, color: S.textDim, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {l.vocab?.slice(0, 5).join(", ") || "—"}
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  <div style={{ display: "inline-flex", gap: 4 }}>
                    <button onClick={() => nav(`/play/${l.id}`)} style={btn(false)}>Test</button>
                    {l.source === "factory" && l.status !== "approved" && (
                      <button disabled={busy === l.id} onClick={() => decide(l.id, "approve")} style={btn(true, "#2d6a4f")}>Approve</button>
                    )}
                    {l.source === "factory" && l.status !== "rejected" && (
                      <button disabled={busy === l.id} onClick={() => decide(l.id, "reject")} style={btn(true, "#6b2d2d")}>Reject</button>
                    )}
                    {l.source === "factory" && (
                      <button disabled={busy === l.id} onClick={() => del(l.id)} style={btn(false)}>Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: 24, color: S.textDim }}>No levels match. Generate one above.</div>}
      </div>
    </div>
  );
}

// ── Ideas ────────────────────────────────────────────────────────────────────
function IdeasTable({ lang, setLang, busy, onGenerate }: {
  lang: string; setLang: (l: string) => void; busy: string | null; onGenerate: (i: GameIdea) => void;
}) {
  const [tierF, setTierF] = useState("all");
  const [builtOnly, setBuiltOnly] = useState(false);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<"total" | "n" | "M">("total");

  const rows = useMemo(() => {
    let r = GAME_IDEAS.filter((i) =>
      (tierF === "all" || i.tier === tierF) &&
      (!builtOnly || BUILT_ENGINES.has(i.engine)) &&
      (!q || (i.name + " " + i.family + " " + i.teaches).toLowerCase().includes(q.toLowerCase())));
    r = [...r].sort((a, b) => sortKey === "n" ? a.n - b.n : (b[sortKey] as number) - (a[sortKey] as number));
    return r;
  }, [tierF, builtOnly, q, sortKey]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, DQ: 0 };
    GAME_IDEAS.forEach((i) => c[i.tier]++);
    return c;
  }, []);

  return (
    <div style={panelStyle}>
      <div style={toolbarStyle}>
        <span style={{ fontSize: 11, color: S.textDim }}>
          S {counts.S} · A {counts.A} · B {counts.B} · C {counts.C} · DQ {counts.DQ}
        </span>
        <span style={{ width: 1, height: 16, background: S.border }} />
        {["all", "S", "A", "B", "C", "DQ"].map((t) => (
          <button key={t} onClick={() => setTierF(t)} style={chip(tierF === t)}>{t}</button>
        ))}
        <button onClick={() => setBuiltOnly(!builtOnly)} style={chip(builtOnly)}>buildable</button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search…" style={{ ...sel, minWidth: 160 }} />
        <select value={lang} onChange={(e) => setLang(e.target.value)} style={sel}>
          <option value="russian">gen in RU</option><option value="spanish">gen in ES</option>
        </select>
        <span style={{ marginLeft: "auto", fontSize: 11, color: S.textDim }}>{rows.length} ideas</span>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th onClick={() => setSortKey("n")} active={sortKey === "n"}>#</Th>
              <Th>Game</Th>
              <Th>Family</Th>
              <Th>Engine</Th>
              <Th>Teaches</Th>
              <Th title="Mute·Voice·Templ·Build·Repeat·Learn·ASR">M V T B R L A</Th>
              <Th onClick={() => setSortKey("total")} active={sortKey === "total"}>Total</Th>
              <Th>Tier</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i, idx) => {
              const built = BUILT_ENGINES.has(i.engine);
              return (
                <tr key={i.n} style={{ background: idx % 2 ? S.panel : S.bg, borderTop: `1px solid ${S.borderSoft}` }}>
                  <td style={{ ...td, color: S.textDim }}>{i.n}</td>
                  <td style={{ ...td, fontWeight: 600, color: S.textBright }}>{i.name}</td>
                  <td style={{ ...td, color: S.textDim }}>{i.family}</td>
                  <td style={td}>
                    <code style={{
                      fontFamily: S.mono, fontSize: 10, padding: "1px 5px", borderRadius: 2,
                      background: built ? "#094771" : S.panel2, color: built ? "#9cdcfe" : S.textDim,
                    }}>{i.engine}{built ? "" : " ·soon"}</code>
                  </td>
                  <td style={{ ...td, color: S.textDim }}>{i.teaches}</td>
                  <td style={{ ...td, fontVariantNumeric: "tabular-nums", color: S.textDim, letterSpacing: 1, fontFamily: S.mono, fontSize: 11 }}>
                    {i.M} {i.V} {i.T} {i.B} {i.R} {i.L} {i.A}
                  </td>
                  <td style={{ ...td, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{i.total}</td>
                  <td style={td}>
                    <span style={{
                      color: S.bg, background: TIER_COLOR[i.tier] || "#555", fontWeight: 700,
                      padding: "1px 6px", borderRadius: 2, fontSize: 10,
                    }}>{i.tier}</span>
                  </td>
                  <td style={td}>
                    {FACTORY_ENGINES.has(i.engine)
                      ? <button disabled={busy === "idea-" + i.n} onClick={() => onGenerate(i)} style={btn(true)}>{busy === "idea-" + i.n ? "…" : "Gen"}</button>
                      : built
                        ? <span style={{ color: S.textDim, fontSize: 11 }}>playable</span>
                        : <span style={{ color: S.textDim, fontSize: 11, opacity: .5 }}>wip</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HouseStyleSelect({ value, favorites, onChange }: {
  value: string; favorites: string[]; onChange: (id: string) => void;
}) {
  const favSet = new Set(favorites);
  const ordered = [
    ...VISUAL_STYLES.filter((s) => favSet.has(s.id)),
    ...VISUAL_STYLES.filter((s) => !favSet.has(s.id)),
  ];
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: S.textDim }}>
      <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>House style</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...sel, minWidth: 220, fontWeight: 600, color: S.textBright }}>
        {ordered.map((s) => (
          <option key={s.id} value={s.id}>
            {favSet.has(s.id) ? "★ " : ""}{s.name}{s.id === value ? " · ACTIVE" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

type MediaPrefs = {
  imageProvider: "openai" | "xai";
  ttsProvider: "elevenlabs" | "xai";
  videoProvider: "xai" | "off";
  xaiImageModel: "grok-imagine-image" | "grok-imagine-image-quality";
  xaiVideoModel: "grok-imagine-video" | "grok-imagine-video-1.5";
  xaiVoiceId: string;
  xaiConfigured?: boolean;
  xaiVoices?: string[];
};

function MediaProvidersBar({ media, onPatch }: {
  media: MediaPrefs; onPatch: (p: Partial<MediaPrefs>) => void;
}) {
  const voices = media.xaiVoices?.length ? media.xaiVoices : ["eve", "ara", "rex", "sal", "leo"];
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ width: 1, height: 16, background: S.border }} />
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: S.textDim }}>
        <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Image</span>
        <select
          value={media.imageProvider}
          onChange={(e) => onPatch({ imageProvider: e.target.value as MediaPrefs["imageProvider"] })}
          style={{ ...sel, fontWeight: 600, color: S.textBright }}
          title={!media.xaiConfigured && media.imageProvider === "xai" ? "Set XAI_API_KEY in .env" : undefined}
        >
          <option value="openai">OpenAI</option>
          <option value="xai">xAI Imagine{!media.xaiConfigured ? " (no key)" : ""}</option>
        </select>
      </label>
      {media.imageProvider === "xai" && (
        <select
          value={media.xaiImageModel}
          onChange={(e) => onPatch({ xaiImageModel: e.target.value as MediaPrefs["xaiImageModel"] })}
          style={sel}
        >
          <option value="grok-imagine-image-quality">quality</option>
          <option value="grok-imagine-image">fast</option>
        </select>
      )}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: S.textDim }}>
        <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>TTS</span>
        <select
          value={media.ttsProvider}
          onChange={(e) => onPatch({ ttsProvider: e.target.value as MediaPrefs["ttsProvider"] })}
          style={{ ...sel, fontWeight: 600, color: S.textBright }}
        >
          <option value="elevenlabs">ElevenLabs</option>
          <option value="xai">xAI Voice{!media.xaiConfigured ? " (no key)" : ""}</option>
        </select>
      </label>
      {media.ttsProvider === "xai" && (
        <select
          value={media.xaiVoiceId}
          onChange={(e) => onPatch({ xaiVoiceId: e.target.value })}
          style={sel}
        >
          {voices.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      )}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: S.textDim }}>
        <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Video</span>
        <select
          value={media.videoProvider}
          onChange={(e) => onPatch({ videoProvider: e.target.value as MediaPrefs["videoProvider"] })}
          style={{ ...sel, fontWeight: 600, color: S.textBright }}
        >
          <option value="xai">xAI Imagine Video</option>
          <option value="off">Off</option>
        </select>
      </label>
      {media.videoProvider === "xai" && (
        <select
          value={media.xaiVideoModel}
          onChange={(e) => onPatch({ xaiVideoModel: e.target.value as MediaPrefs["xaiVideoModel"] })}
          style={sel}
        >
          <option value="grok-imagine-video-1.5">1.5 · native audio</option>
          <option value="grok-imagine-video">1.0</option>
        </select>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
function StylesTab({ houseStyle, favorites, onUse, onToggleFavorite }: {
  houseStyle: string; favorites: string[];
  onUse: (id: string) => void; onToggleFavorite: (id: string) => void;
}) {
  const [examples, setExamples] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(houseStyle || VISUAL_STYLES[0]?.id || null);
  const favSet = useMemo(() => new Set(favorites), [favorites]);

  useEffect(() => { fetch("/api/styles/examples").then((r) => r.json()).then((d) => setExamples(d.examples || {})).catch(() => {}); }, []);

  const sorted = useMemo(() => {
    const fav = VISUAL_STYLES.filter((s) => favSet.has(s.id));
    const rest = VISUAL_STYLES.filter((s) => !favSet.has(s.id));
    return [...fav, ...rest];
  }, [favSet]);

  async function gen(id: string) {
    setBusy(id);
    try {
      const r = await fetch("/api/styles/example", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ styleId: id }) });
      const d = await r.json();
      if (d.url) setExamples((e) => ({ ...e, [id]: d.url }));
      else alert("Generation failed: " + (d.details || d.error || "unknown"));
    } catch (e: any) { alert(String(e?.message || e)); }
    setBusy(null);
  }
  async function genAll() { for (const s of VISUAL_STYLES) { if (!examples[s.id]) await gen(s.id); } }

  const focused = VISUAL_STYLES.find((s) => s.id === focus) || null;
  const activeName = VISUAL_STYLES.find((s) => s.id === houseStyle)?.name;

  return (
    <div style={{ ...panelStyle, flexDirection: "row" }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={toolbarStyle}>
          <span style={{ fontSize: 12, color: S.textDim }}>
            House art styles — star favorites, click <b style={{ color: S.textBright }}>Use</b> to set the default for all asset gens.
            {activeName && <> Active: <b style={{ color: S.ok }}>{activeName}</b></>}
          </span>
          <button onClick={genAll} disabled={!!busy} style={{ ...btn(true), marginLeft: "auto" }}>{busy ? "generating…" : "Generate missing"}</button>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th style={{ width: 36 }}> </Th>
                <Th>Preview</Th>
                <Th>Name</Th>
                <Th>Appeal</Th>
                <Th>Repeat</Th>
                <Th>Anim</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, idx) => {
                const isActive = s.id === houseStyle;
                const isFav = favSet.has(s.id);
                return (
                  <tr key={s.id}
                    onClick={() => setFocus(s.id)}
                    style={{
                      background: focus === s.id ? S.selected : isActive ? "#1a3a2a" : idx % 2 ? S.panel : S.bg,
                      borderTop: `1px solid ${S.borderSoft}`, cursor: "pointer",
                    }}>
                    <td style={td} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onToggleFavorite(s.id)}
                        title={isFav ? "Unfavorite" : "Favorite"}
                        style={{
                          font: "inherit", fontSize: 14, border: 0, background: "transparent", cursor: "pointer",
                          color: isFav ? S.warn : S.textDim, padding: "2px 4px",
                        }}
                      >{isFav ? "★" : "☆"}</button>
                    </td>
                    <td style={{ ...td, width: 80 }}>
                      <div style={{ width: 64, height: 40, ...CHECKER, borderRadius: 2, overflow: "hidden", border: `1px solid ${S.border}` }}>
                        {examples[s.id]
                          ? <img src={examples[s.id]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: S.textDim }}>
                              {busy === s.id ? "…" : "—"}
                            </div>}
                      </div>
                    </td>
                    <td style={{ ...td, fontWeight: 600, color: S.textBright }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{s.name}</span>
                        {isActive && <StatusBadge label="Active" tone="ok" />}
                      </div>
                      <div style={{ display: "flex", gap: 3, marginTop: 3 }}>
                        {s.swatches.map((c, i) => <span key={i} style={{ width: 10, height: 10, borderRadius: 1, background: c, border: `1px solid ${S.border}` }} />)}
                      </div>
                    </td>
                    <td style={td}><Rate n={s.appeal} /></td>
                    <td style={td}><Rate n={s.consistency} /></td>
                    <td style={td}><Rate n={s.animation} /></td>
                    <td style={td} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "inline-flex", gap: 4 }}>
                        <button onClick={() => onUse(s.id)} disabled={isActive} style={{ ...btn(true), opacity: isActive ? 0.45 : 1 }}>
                          {isActive ? "In use" : "Use"}
                        </button>
                        <button onClick={() => gen(s.id)} disabled={busy === s.id} style={btn(false)}>
                          {busy === s.id ? "…" : examples[s.id] ? "Regen" : "Generate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <ResizableInspector storageKey="mova.studio.inspector.styles" defaultWidth={300}>
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${S.border}`, fontSize: 11, fontWeight: 700, color: S.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Inspector
        </div>
        {focused ? (
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => onToggleFavorite(focused.id)}
                style={{
                  font: "inherit", fontSize: 18, border: 0, background: "transparent", cursor: "pointer",
                  color: favSet.has(focused.id) ? S.warn : S.textDim, padding: 0, lineHeight: 1,
                }}
                title={favSet.has(focused.id) ? "Unfavorite" : "Favorite"}
              >{favSet.has(focused.id) ? "★" : "☆"}</button>
              <div style={{ fontSize: 14, fontWeight: 700, color: S.textBright, flex: 1 }}>{focused.name}</div>
              {focused.id === houseStyle && <StatusBadge label="Active" tone="ok" />}
            </div>
            <div style={{ fontSize: 12, color: S.textDim, lineHeight: 1.45 }}>{focused.blurb}</div>
            <ResizablePreview storageKey="mova.studio.preview.styles" defaultHeight={160}>
              <div style={{
                ...CHECKER, height: "100%", borderRadius: 3, overflow: "hidden", border: `1px solid ${S.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {examples[focused.id]
                  ? <img src={examples[focused.id]} alt={focused.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  : <div style={{ padding: 24, textAlign: "center", color: S.textDim, fontSize: 11 }}>no example yet</div>}
              </div>
            </ResizablePreview>
            <div style={{ fontSize: 11, color: S.textDim }}>{focused.note}</div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: S.textDim, textTransform: "uppercase", marginBottom: 4 }}>Recipe</div>
              <pre style={{
                margin: 0, fontFamily: S.mono, fontSize: 10, color: S.text, whiteSpace: "pre-wrap",
                background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3, padding: 8, lineHeight: 1.4,
              }}>{focused.recipe}</pre>
            </div>
            <button onClick={() => onUse(focused.id)} disabled={focused.id === houseStyle} style={{ ...btn(true), opacity: focused.id === houseStyle ? 0.55 : 1 }}>
              {focused.id === houseStyle ? "House style (active)" : "Use as house style"}
            </button>
            <button onClick={() => gen(focused.id)} disabled={busy === focused.id} style={btn(false)}>
              {busy === focused.id ? "generating…" : examples[focused.id] ? "Regenerate example" : "Generate example"}
            </button>
          </div>
        ) : (
          <div style={{ padding: 16, color: S.textDim, fontSize: 12 }}>Select a style.</div>
        )}
      </ResizableInspector>
    </div>
  );
}

function Rate({ n }: { n: number }) {
  return (
    <span style={{ fontFamily: S.mono, fontSize: 11, color: n >= 5 ? S.ok : n >= 4 ? "#b5cea8" : n >= 3 ? S.warn : S.err }}>
      {"●".repeat(n)}{"○".repeat(5 - n)}
    </span>
  );
}

// ── Assets Content Browser ───────────────────────────────────────────────────
type AssetRow = { key: string; label: string; subject: string; pack: string; packGame: string };

function AssetsTab({ styleId, setStyleId, favorites }: {
  styleId: string; setStyleId: (id: string) => void; favorites: string[];
}) {
  const allRows: AssetRow[] = useMemo(() =>
    ASSET_PACKS.flatMap((p) => p.assets.map((a) => ({ ...a, pack: p.game, packGame: p.game }))), []);

  const [manifest, setManifest] = useState<Record<string, string>>({});
  const [subjects, setSubjects] = useState<Record<string, string>>(() => {
    const s: Record<string, string> = {};
    ASSET_PACKS.forEach((p) => p.assets.forEach((a) => { s[a.key] = a.subject; }));
    return s;
  });
  const [ver, setVer] = useState<Record<string, number>>({});
  const [engine, setEngine] = useState<"native" | "matte">("native");
  const [quality, setQuality] = useState<"high" | "medium" | "low">("high");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Record<string, string>>({});
  const [photoVer, setPhotoVer] = useState<Record<string, number>>({});
  const [videos, setVideos] = useState<Record<string, string>>({});
  const [packF, setPackF] = useState<string>("all");
  const [statusF, setStatusF] = useState<"all" | "ready" | "missing" | "generating">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const [masterPrompt, setMasterPrompt] = useState("");
  const [masterKey, setMasterKey] = useState("");
  const lastClickRef = useRef<string | null>(null);
  const matte = engine === "matte";
  const running = Object.values(busy).filter(Boolean).length;

  const focusedStyle = VISUAL_STYLES.find((s) => s.id === styleId) || VISUAL_STYLES[0];
  const focusFromPhoto = !!(focus && focus.startsWith("char_") && photoVer[focus]);

  // Prefill / restore master prompt when style, asset kind, or photo mode changes.
  useEffect(() => {
    if (!focus || !focusedStyle) return;
    const key = masterStorageKey(styleId, focus, focusFromPhoto);
    const kind = promptKindForKey(focus);
    const fallback = defaultMasterPrompt(focusedStyle, kind, {
      fromPhoto: focusFromPhoto,
      hasStyleSheet: true,
    });
    const stored = readStoredMaster(key);
    setMasterKey(key);
    setMasterPrompt(stored || fallback);
  }, [focus, styleId, focusFromPhoto, focusedStyle]);

  function masterForKey(key: string): string {
    const fromPhoto = !!(key.startsWith("char_") && photoVer[key]);
    const storeKey = masterStorageKey(styleId, key, fromPhoto);
    const stored = readStoredMaster(storeKey);
    if (stored) return stored;
    const style = VISUAL_STYLES.find((s) => s.id === styleId) || VISUAL_STYLES[0];
    return defaultMasterPrompt(style, promptKindForKey(key), { fromPhoto, hasStyleSheet: true });
  }

  function onMasterChange(value: string) {
    setMasterPrompt(value);
    if (masterKey) writeStoredMaster(masterKey, value);
  }

  function resetMaster() {
    if (!focus || !focusedStyle) return;
    const kind = promptKindForKey(focus);
    const fallback = defaultMasterPrompt(focusedStyle, kind, {
      fromPhoto: focusFromPhoto,
      hasStyleSheet: true,
    });
    if (masterKey) clearStoredMaster(masterKey);
    setMasterPrompt(fallback);
  }

  const startJob = (key: string, text: string) => { setBusy((b) => ({ ...b, [key]: true })); setStatus((s) => ({ ...s, [key]: text })); };
  const endJob = (key: string, text: string) => { setBusy((b) => { const n = { ...b }; delete n[key]; return n; }); setStatus((s) => ({ ...s, [key]: text })); };

  async function loadManifest() {
    try { const d = await fetch("/api/assets").then((r) => r.json()); setManifest(d.assets || {}); }
    catch { /* ignore */ }
  }
  async function loadPhotos() {
    const chars = ASSET_PACKS.flatMap((p) => p.assets).filter((a) => a.key.startsWith("char_"));
    const entries = await Promise.all(chars.map(async (a) => {
      try { const { has } = await fetch(`/api/assets/has-photo/${a.key}`).then((r) => r.json()); return [a.key, has ? Date.now() : 0] as const; }
      catch { return [a.key, 0] as const; }
    }));
    setPhotoVer(Object.fromEntries(entries));
  }
  useEffect(() => { loadManifest(); loadPhotos(); }, []);

  async function uploadPhoto(key: string, file: File) {
    setStatus((s) => ({ ...s, [key]: "uploading photo…" }));
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file);
    });
    try {
      const r = await fetch("/api/assets/upload-photo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, photoBase64: dataUrl }),
      });
      const d = await r.json();
      if (d.ok) { setPhotoVer((v) => ({ ...v, [key]: Date.now() })); setStatus((s) => ({ ...s, [key]: "✓ photo saved" })); }
      else setStatus((s) => ({ ...s, [key]: `✗ photo: ${d.details || d.error}` }));
    } catch (e: any) { setStatus((s) => ({ ...s, [key]: `✗ photo: ${e?.message || e}` })); }
  }

  async function genFromPhoto(key: string) {
    if (busy[key]) return;
    startJob(key, "photo + style sheet… ~30–90s");
    try {
      const r = await fetch("/api/assets/generate-from-photo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key, subject: subjects[key],
          masterPrompt: key === focus ? masterPrompt : masterForKey(key),
          styleId, matte, quality,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        setManifest((m) => ({ ...m, [key]: d.url || `/api/assets/img/${key}` }));
        setVer((v) => ({ ...v, [key]: Number(d.v) || Date.now() }));
        endJob(key, d.usedStyleSheet === false
          ? "✓ from photo (no style sheet — generate one in Styles)"
          : "✓ from photo + style sheet");
      } else endJob(key, `✗ ${d.details || d.error || "failed"}`);
    } catch (e: any) { endJob(key, `✗ ${e?.message || e}`); }
  }

  async function removePhoto(key: string) {
    if (!confirm(`Remove the reference photo for "${key}"?`)) return;
    await fetch(`/api/assets/photo/${key}`, { method: "DELETE" });
    setPhotoVer((v) => ({ ...v, [key]: 0 }));
    setStatus((s) => ({ ...s, [key]: "photo removed" }));
  }

  async function gen(key: string) {
    // Characters with a ref photo always go through likeness + house style sheet.
    if (key.startsWith("char_") && photoVer[key]) return genFromPhoto(key);
    if (busy[key]) return;
    startJob(key, "generating…");
    try {
      const isTile = key.startsWith("env_");
      const r = await fetch(isTile ? "/api/assets/generate-tile" : "/api/assets/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key, subject: subjects[key],
          masterPrompt: key === focus ? masterPrompt : masterForKey(key),
          styleId, matte, quality,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        setManifest((m) => ({ ...m, [key]: d.url || `/api/assets/img/${key}` }));
        setVer((v) => ({ ...v, [key]: Number(d.v) || Date.now() }));
        endJob(key, d.usedStyleSheet ? "✓ updated (+ style sheet)" : "✓ updated");
      } else endJob(key, `✗ ${d.details || d.error || "failed"}`);
    } catch (e: any) { endJob(key, `✗ ${e?.message || e}`); }
  }

  async function del(key: string) {
    if (!confirm(`Delete sprite "${key}"? The game falls back to its emoji.`)) return;
    await fetch(`/api/assets/${key}`, { method: "DELETE" });
    setManifest((m) => { const n = { ...m }; delete n[key]; return n; });
    setStatus((s) => ({ ...s, [key]: "removed" }));
  }

  async function stripOutline(key: string) {
    if (busy[key]) return;
    startJob(key, "removing white border…");
    try {
      const r = await fetch("/api/assets/strip-outline", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const d = await r.json();
      if (d.ok) {
        setManifest((m) => ({ ...m, [key]: d.url || `/api/assets/img/${key}` }));
        setVer((v) => ({ ...v, [key]: Number(d.v) || Date.now() }));
        endJob(key, "✓ white border removed");
      } else endJob(key, `✗ ${d.details || d.error || "failed"}`);
    } catch (e: any) { endJob(key, `✗ ${e?.message || e}`); }
  }

  async function animateVideo(key: string) {
    if (busy[key] || !manifest[key]) return;
    const prompt = window.prompt(
      "Motion prompt for xAI Imagine Video",
      "Gentle idle bounce, wholesome children's game sprite, soft loop, keep centered",
    );
    if (prompt == null) return;
    startJob(key, "animating video… ~1–3 min");
    try {
      const r = await fetch("/api/assets/generate-video", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, prompt, duration: 6 }),
      });
      const d = await r.json();
      if (d.ok) {
        setVideos((v) => ({ ...v, [key]: d.url }));
        endJob(key, `✓ video · ${d.model || "xai"}`);
      } else endJob(key, `✗ video: ${d.details || d.error || "failed"}`);
    } catch (e: any) { endJob(key, `✗ video: ${e?.message || e}`); }
  }

  function rowStatus(key: string): "ready" | "missing" | "generating" {
    if (busy[key]) return "generating";
    return manifest[key] ? "ready" : "missing";
  }

  const filtered = useMemo(() => allRows.filter((a) => {
    if (packF !== "all" && a.pack !== packF) return false;
    const st = rowStatus(a.key);
    if (statusF !== "all" && st !== statusF) return false;
    if (q && !(a.label + " " + a.key + " " + a.subject).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [allRows, packF, statusF, q, manifest, busy]);

  const packStats = useMemo(() => ASSET_PACKS.map((p) => ({
    game: p.game,
    have: p.assets.filter((a) => manifest[a.key]).length,
    total: p.assets.length,
  })), [manifest]);

  function toggleSelect(key: string, shift: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && lastClickRef.current) {
        const keys = filtered.map((a) => a.key);
        const a = keys.indexOf(lastClickRef.current);
        const b = keys.indexOf(key);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(keys[i]);
          return next;
        }
      }
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    lastClickRef.current = key;
  }

  function selectAll(on: boolean) {
    setSelected(on ? new Set(filtered.map((a) => a.key)) : new Set());
  }

  async function genSelected() {
    await Promise.all(Array.from(selected).filter((k) => !busy[k]).map((k) => gen(k)));
  }
  async function genMissingVisible() {
    await Promise.all(filtered.filter((a) => !manifest[a.key] && !busy[a.key]).map((a) => gen(a.key)));
  }
  async function delSelected() {
    const keys = Array.from(selected).filter((k) => manifest[k]);
    if (!keys.length) return;
    if (!confirm(`Delete ${keys.length} sprite(s)?`)) return;
    await Promise.all(keys.map(async (key) => {
      await fetch(`/api/assets/${key}`, { method: "DELETE" });
      setManifest((m) => { const n = { ...m }; delete n[key]; return n; });
    }));
    setStatus((s) => {
      const n = { ...s };
      keys.forEach((k) => { n[k] = "removed"; });
      return n;
    });
    setSelected(new Set());
  }

  const focused = allRows.find((a) => a.key === focus) || null;
  const focusUrl = focused ? assetSrc(manifest[focused.key], ver[focused.key]) : null;
  const allSelected = filtered.length > 0 && filtered.every((a) => selected.has(a.key));

  return (
    <div style={{ ...panelStyle, flexDirection: "column" }}>
      <div style={toolbarStyle}>
        <select value={engine} onChange={(e) => setEngine(e.target.value as any)} style={sel}
          title="OpenAI cutout mode only — ignored when Image provider is xAI">
          <option value="matte">OpenAI cutout · gpt-image-2</option>
          <option value="native">OpenAI alpha · gpt-image-1.5</option>
        </select>
        <HouseStyleSelect value={styleId} favorites={favorites} onChange={setStyleId} />
        <select value={quality} onChange={(e) => setQuality(e.target.value as any)} style={sel}
          title="OpenAI quality only — xAI from-photo uses quality model automatically">
          <option value="high">high (~60–120s)</option>
          <option value="medium">medium (~30s)</option>
          <option value="low">low draft (~10–15s)</option>
        </select>
        <span style={{ width: 1, height: 16, background: S.border }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter assets…" style={{ ...sel, minWidth: 160 }} />
        {(["all", "ready", "missing", "generating"] as const).map((s) => (
          <button key={s} onClick={() => setStatusF(s)} style={chip(statusF === s)}>{s}</button>
        ))}
        <span style={{ width: 1, height: 16, background: S.border }} />
        <button onClick={genSelected} disabled={!selected.size} style={{ ...btn(true), opacity: selected.size ? 1 : 0.45 }}>
          Generate selected ({selected.size})
        </button>
        <button onClick={genMissingVisible} style={btn(true)}>Generate missing</button>
        <button onClick={delSelected} disabled={!selected.size} style={{ ...btn(false), opacity: selected.size ? 1 : 0.45 }}>Delete selected</button>
        {running > 0 && <span style={{ fontSize: 11, color: "#9cdcfe" }}>{running} running…</span>}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {/* Pack folders */}
        <div style={{
          width: 180, flexShrink: 0, borderRight: `1px solid ${S.border}`, background: S.panel,
          display: "flex", flexDirection: "column", overflow: "auto",
        }}>
          <div style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, color: S.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Packs
          </div>
          <button onClick={() => setPackF("all")} style={packBtn(packF === "all")}>
            <span>All</span>
            <span style={{ color: S.textDim }}>{Object.keys(manifest).length}/{ASSET_COUNT}</span>
          </button>
          {packStats.map((p) => (
            <button key={p.game} onClick={() => setPackF(p.game)} style={packBtn(packF === p.game)}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.game}</span>
              <span style={{ color: S.textDim, flexShrink: 0 }}>{p.have}/{p.total}</span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th style={{ width: 32 }}>
                  <input type="checkbox" checked={allSelected} onChange={(e) => selectAll(e.target.checked)} />
                </Th>
                <Th style={{ width: 44 }}> </Th>
                <Th>Name</Th>
                <Th>Key</Th>
                <Th>Pack</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>Message</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, idx) => {
                const st = rowStatus(a.key);
                const url = assetSrc(manifest[a.key], ver[a.key]);
                const isFocus = focus === a.key;
                const isSel = selected.has(a.key);
                return (
                  <tr key={a.key}
                    onClick={() => setFocus(a.key)}
                    style={{
                      background: isFocus ? S.selected : isSel ? "#1a3a4a" : idx % 2 ? S.panel : S.bg,
                      borderTop: `1px solid ${S.borderSoft}`, cursor: "default",
                    }}>
                    <td style={td} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={isSel}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          toggleSelect(a.key, e.shiftKey);
                        }}
                        onChange={() => { /* handled in onClick for shift-range support */ }} />
                    </td>
                    <td style={td}>
                      <div style={{
                        ...CHECKER, width: 36, height: 36, borderRadius: 2, overflow: "hidden",
                        border: `1px solid ${S.border}`, display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {busy[a.key] ? <Spinner />
                          : url ? <img key={url} src={url} alt="" style={{ maxWidth: "100%", maxHeight: "100%" }} />
                          : <span style={{ fontSize: 9, color: S.textDim }}>—</span>}
                      </div>
                    </td>
                    <td style={{ ...td, fontWeight: 600, color: S.textBright }}>{a.label}</td>
                    <td style={{ ...td, fontFamily: S.mono, fontSize: 11, color: S.textDim }}>{a.key}</td>
                    <td style={{ ...td, color: S.textDim }}>{a.pack}</td>
                    <td style={td}><span style={{ fontSize: 10, color: S.textDim }}>{assetType(a.key)}</span></td>
                    <td style={td}>
                      <StatusBadge
                        label={st === "ready" ? "Ready" : st === "generating" ? "Generating" : "Missing"}
                        tone={st === "ready" ? "ok" : st === "generating" ? "busy" : "dim"}
                      />
                    </td>
                    <td style={{ ...td, color: S.textDim, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {status[a.key] || ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div style={{ padding: 24, color: S.textDim }}>No assets match filters.</div>}
        </div>

        {/* Inspector — drag left edge to resize; width persisted in localStorage */}
        <ResizableInspector storageKey="mova.studio.inspector.assets" defaultWidth={320}>
          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${S.border}`, fontSize: 11, fontWeight: 700, color: S.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Inspector
          </div>
          {focused ? (
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: S.textBright }}>{focused.label}</div>
                <code style={{ fontFamily: S.mono, fontSize: 11, color: S.textDim }}>{focused.key}</code>
                <div style={{ marginTop: 4 }}>
                  <StatusBadge
                    label={rowStatus(focused.key) === "ready" ? "Ready" : rowStatus(focused.key) === "generating" ? "Generating" : "Missing"}
                    tone={rowStatus(focused.key) === "ready" ? "ok" : rowStatus(focused.key) === "generating" ? "busy" : "dim"}
                  />
                  <span style={{ marginLeft: 8, fontSize: 10, color: S.textDim }}>{assetType(focused.key)} · {focused.pack}</span>
                </div>
              </div>

              <HouseStyleSelect value={styleId} favorites={favorites} onChange={setStyleId} />

              <div>
                <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                  {focused.key.startsWith("char_") && (
                    <div style={{ flex: 1, fontSize: 10, color: S.textDim }}>REF PHOTO</div>
                  )}
                  <div style={{ flex: 1, fontSize: 10, color: S.textDim }}>SPRITE</div>
                </div>
                <ResizablePreview storageKey="mova.studio.preview.assets" defaultHeight={140}>
                  <div style={{ display: "flex", gap: 8, height: "100%" }}>
                    {focused.key.startsWith("char_") && (
                      <div style={{
                        flex: 1, height: "100%", borderRadius: 3, border: `1px dashed ${S.border}`, overflow: "hidden",
                        display: "flex", alignItems: "center", justifyContent: "center", background: S.bg,
                      }}>
                        {photoVer[focused.key]
                          ? <img src={`/api/assets/refphoto/${focused.key}?v=${photoVer[focused.key]}`} alt="ref" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                          : <span style={{ fontSize: 10, color: S.textDim }}>no photo</span>}
                      </div>
                    )}
                    <div style={{
                      flex: 1, height: "100%", ...CHECKER, borderRadius: 3, overflow: "hidden", border: `1px solid ${S.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
                    }}>
                      {focusUrl
                        ? <img key={focusUrl} src={focusUrl} alt={focused.label} style={{ maxWidth: "100%", maxHeight: "100%", opacity: busy[focused.key] ? 0.35 : 1 }} />
                        : <span style={{ fontSize: 10, color: S.textDim }}>not generated</span>}
                      {busy[focused.key] && (
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#0008" }}>
                          <Spinner label="working…" />
                        </div>
                      )}
                    </div>
                  </div>
                </ResizablePreview>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: S.textDim, textTransform: "uppercase", letterSpacing: 0.4 }}>
                    Master prompt
                  </div>
                  <button type="button" onClick={resetMaster} style={{ ...btn(false), fontSize: 10, padding: "2px 6px", marginLeft: "auto" }}
                    title="Restore the default camera / style lock for this house style">
                    Reset default
                  </button>
                </div>
                <div style={{ fontSize: 10, color: S.textDim, marginBottom: 6, lineHeight: 1.35 }}>
                  Locked camera + style rules (isometric when the house style is iso). Edits persist for this style.
                </div>
                <textarea
                  value={masterPrompt} rows={8}
                  onChange={(e) => onMasterChange(e.target.value)}
                  style={{
                    width: "100%", boxSizing: "border-box", font: "inherit", fontSize: 11, padding: 8,
                    borderRadius: 3, border: `1px solid ${S.border}`, background: S.bg, color: S.textBright,
                    resize: "vertical", outline: "none", lineHeight: 1.4, fontFamily: S.mono,
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: S.textDim, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                  {focused.key.startsWith("char_") ? "Modifier / costume" : "Modifier / subject"}
                </div>
                <div style={{ fontSize: 10, color: S.textDim, marginBottom: 6, lineHeight: 1.35 }}>
                  Appended on top of the master — outfit, props, extras. Won’t override camera or likeness rules.
                </div>
                <textarea
                  value={subjects[focused.key]} rows={3}
                  onChange={(e) => setSubjects((s) => ({ ...s, [focused.key]: e.target.value }))}
                  placeholder={focused.key.startsWith("char_")
                    ? "e.g. white chef hat, pink apron, holding a whisk"
                    : "e.g. shiny red apple with a small green leaf"}
                  style={{
                    width: "100%", boxSizing: "border-box", font: "inherit", fontSize: 12, padding: 8,
                    borderRadius: 3, border: `1px solid ${S.border}`, background: S.bg, color: S.textBright,
                    resize: "vertical", outline: "none", lineHeight: 1.4,
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {focused.key.startsWith("char_") && !!photoVer[focused.key] ? (
                  <button onClick={() => genFromPhoto(focused.key)} disabled={busy[focused.key]}
                    style={{ ...btn(true), opacity: busy[focused.key] ? 0.55 : 1 }}
                    title="Uses her photo + the active house style sheet">
                    {busy[focused.key] ? "Working…" : focusUrl ? "Regenerate from photo + style" : "Generate from photo + style"}
                  </button>
                ) : (
                  <button onClick={() => gen(focused.key)} disabled={busy[focused.key]} style={{ ...btn(true), opacity: busy[focused.key] ? 0.55 : 1 }}>
                    {busy[focused.key] ? "Working…" : focusUrl ? "Regenerate" : "Generate"}
                  </button>
                )}
                {focused.key.startsWith("char_") && (
                  <>
                    <label style={{ ...btn(false), textAlign: "center", cursor: busy[focused.key] ? "default" : "pointer", opacity: busy[focused.key] ? 0.5 : 1 }}>
                      {photoVer[focused.key] ? "Replace photo" : "Upload photo"}
                      <input type="file" accept="image/*" disabled={busy[focused.key]} style={{ display: "none" }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(focused.key, f); e.currentTarget.value = ""; }} />
                    </label>
                    {!photoVer[focused.key] && (
                      <div style={{ fontSize: 10, color: S.warn, lineHeight: 1.35 }}>
                        Upload her photo first — then Generate uses likeness + the Lush Indie style sheet.
                      </div>
                    )}
                    {!!photoVer[focused.key] && (
                      <button onClick={() => removePhoto(focused.key)} disabled={busy[focused.key]} style={btn(false)}>Remove photo</button>
                    )}
                  </>
                )}
                {focusUrl && (
                  <>
                    <button onClick={() => stripOutline(focused.key)} disabled={busy[focused.key]}
                      style={btn(false)}
                      title="Remove white border / halo, then re-trim to transparent edges">
                      Remove white border
                    </button>
                    <button onClick={() => animateVideo(focused.key)} disabled={busy[focused.key]}
                      style={{ ...btn(true), opacity: busy[focused.key] ? 0.55 : 1 }}
                      title="Animate this sprite with xAI Imagine Video">
                      Animate video (xAI)
                    </button>
                    <button onClick={() => del(focused.key)} disabled={busy[focused.key]} style={btn(false)}>Delete sprite</button>
                  </>
                )}
              </div>

              {videos[focused.key] && (
                <div>
                  <div style={{ fontSize: 10, color: S.textDim, marginBottom: 4 }}>LATEST VIDEO</div>
                  <ResizablePreview storageKey="mova.studio.preview.assetsVideo" defaultHeight={180}>
                    <video
                      src={videos[focused.key]}
                      controls
                      loop
                      playsInline
                      style={{
                        width: "100%", height: "100%", objectFit: "contain",
                        borderRadius: 3, border: `1px solid ${S.border}`, background: "#000",
                      }}
                    />
                  </ResizablePreview>
                  <a href={videos[focused.key]} target="_blank" rel="noreferrer"
                    style={{ fontSize: 11, color: "#9cdcfe", display: "inline-block", marginTop: 4 }}>
                    Open MP4
                  </a>
                </div>
              )}

              {status[focused.key] && (
                <div style={{ fontSize: 11, color: S.textDim, padding: 8, background: S.bg, borderRadius: 3, border: `1px solid ${S.borderSoft}` }}>
                  {status[focused.key]}
                </div>
              )}
              {focused.key.startsWith("char_") && (
                <div style={{ fontSize: 10, color: S.textDim, lineHeight: 1.4 }}>
                  Photos stay private on the server (EXIF stripped). After drawing the base sprite, regenerate poses in Animations.
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: 16, color: S.textDim, fontSize: 12 }}>Select an asset to inspect.</div>
          )}
        </ResizableInspector>
      </div>
    </div>
  );
}

function packBtn(active: boolean): React.CSSProperties {
  return {
    font: "inherit", fontSize: 11, border: 0, borderRadius: 0, padding: "7px 10px",
    background: active ? S.selected : "transparent", color: active ? S.textBright : S.text,
    cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", gap: 8,
  };
}

// ── Gen history ──────────────────────────────────────────────────────────────
function GenHistoryTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kindF, setKindF] = useState("all");

  async function load() {
    setLoading(true); setErr("");
    try {
      const d = await fetch("/api/assets/generations?limit=500").then((r) => r.json());
      setRows(Array.isArray(d.generations) ? d.generations : []);
    } catch (e: any) { setErr(String(e?.message || e)); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const kinds = useMemo(() => ["all", ...Array.from(new Set(rows.map((r) => r.kind)))], [rows]);
  const filtered = rows.filter((r) =>
    (kindF === "all" || r.kind === kindF) &&
    (!q || `${r.assetKey} ${r.prompt || ""} ${r.subject || ""}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div style={panelStyle}>
      <div style={toolbarStyle}>
        <span style={{ fontSize: 12, color: S.textDim }}>Generation audit log</span>
        {kinds.map((k) => <button key={k} onClick={() => setKindF(k)} style={chip(kindF === k)}>{k}</button>)}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search key / prompt…" style={{ ...sel, minWidth: 200 }} />
        <span style={{ fontSize: 11, color: S.textDim }}>{filtered.length} / {rows.length}</span>
        <button onClick={load} style={{ ...btn(false), marginLeft: "auto" }}>Refresh</button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading && <div style={{ padding: 20, color: S.textDim }}>Loading…</div>}
        {err && <div style={{ padding: 12, color: S.err }}>{err}</div>}
        {!loading && rows.length === 0 && !err && (
          <div style={{ padding: 20, color: S.textDim }}>No generations logged yet.</div>
        )}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th style={{ width: 48 }}> </Th>
              <Th>Asset</Th>
              <Th>Kind</Th>
              <Th>Engine</Th>
              <Th>Quality</Th>
              <Th>Status</Th>
              <Th>When</Th>
              <Th>Prompt</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, idx) => {
              const isOpen = open === r.id;
              const thumb = r.proxyUrl && r.status !== "error" ? `${r.proxyUrl}?t=${new Date(r.createdAt).getTime()}` : null;
              return (
                <tr key={r.id} style={{
                  background: idx % 2 ? S.panel : S.bg,
                  borderTop: `1px solid ${r.status === "error" ? "#5a2020" : S.borderSoft}`,
                }}>
                  <td style={td}>
                    <div style={{ ...CHECKER, width: 36, height: 36, borderRadius: 2, overflow: "hidden", border: `1px solid ${S.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {r.status === "error" ? <span style={{ color: S.err, fontSize: 12 }}>!</span>
                        : thumb ? <img src={thumb} alt="" style={{ maxWidth: "100%", maxHeight: "100%" }} />
                        : <span style={{ fontSize: 9, color: S.textDim }}>—</span>}
                    </div>
                  </td>
                  <td style={{ ...td, fontFamily: S.mono, fontSize: 11, fontWeight: 600, color: S.textBright }}>{r.assetKey}</td>
                  <td style={td}><code style={{ fontFamily: S.mono, fontSize: 10, color: S.textDim }}>{r.kind}</code></td>
                  <td style={{ ...td, color: S.textDim, fontSize: 11 }}>{r.engine || "—"}</td>
                  <td style={{ ...td, color: S.textDim, fontSize: 11 }}>{r.quality || "—"}</td>
                  <td style={td}>
                    <StatusBadge label={r.status === "error" ? "error" : "ok"} tone={r.status === "error" ? "err" : "ok"} />
                  </td>
                  <td style={{ ...td, color: S.textDim, fontSize: 11 }}>{new Date(r.createdAt).toLocaleString()}</td>
                  <td style={{
                    ...td, maxWidth: isOpen ? 480 : 240, whiteSpace: isOpen ? "pre-wrap" : "nowrap",
                    overflow: "hidden", textOverflow: "ellipsis", color: r.error ? S.err : S.textDim, cursor: "pointer",
                  }} onClick={() => setOpen(isOpen ? null : r.id)} title="click to expand">
                    {r.error || r.prompt}
                  </td>
                  <td style={td}>
                    <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      {r.s3Url && <a href={r.s3Url} target="_blank" rel="noreferrer" style={{ color: "#9cdcfe", fontSize: 11 }}>S3</a>}
                      {r.versionKey && <code style={{ fontFamily: S.mono, fontSize: 9, color: S.textDim }}>{r.versionKey.slice(0, 12)}</code>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Animations (video clips) ─────────────────────────────────────────────────
const EXTRA_CLIPS_STORE = "mova.studio.extraAnimClips.v1";
const CLIP_PROMPT_STORE = "mova.studio.animPrompts.v1";

type ExtraClip = VideoClip & { baseKey: string; label: string };
type ClipMeta = { loopStart: number; loopEnd: number; keyed?: boolean; duration?: number; frameCount?: number };

function readExtraClips(): ExtraClip[] {
  try {
    const raw = JSON.parse(localStorage.getItem(EXTRA_CLIPS_STORE) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}
function writeExtraClips(clips: ExtraClip[]) {
  try { localStorage.setItem(EXTRA_CLIPS_STORE, JSON.stringify(clips)); } catch { /* ignore */ }
}
function readClipPrompt(key: string, fallback: string): string {
  try {
    const all = JSON.parse(localStorage.getItem(CLIP_PROMPT_STORE) || "{}");
    const v = all?.[key];
    return typeof v === "string" && v.trim() ? v : fallback;
  } catch { return fallback; }
}
function writeClipPrompt(key: string, value: string) {
  try {
    const all = JSON.parse(localStorage.getItem(CLIP_PROMPT_STORE) || "{}");
    all[key] = value;
    localStorage.setItem(CLIP_PROMPT_STORE, JSON.stringify(all));
  } catch { /* ignore */ }
}

type AnimRow = {
  key: string;
  baseKey: string;
  label: string;
  name: string;
  dir: IsoDir | null;
  kind: "loop" | "oneshot";
  prompt: string;
  durationSec: number;
  lockMs?: number;
  extra?: boolean;
};

function AnimationsTab({ styleId, setStyleId, favorites }: {
  styleId: string; setStyleId: (id: string) => void; favorites: string[];
}) {
  const [manifest, setManifest] = useState<Record<string, string>>({});
  const [ver, setVer] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<Record<string, any>>({});
  const [meta, setMeta] = useState<Record<string, ClipMeta>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Record<string, string>>({});
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<ExtraClip[]>(() => readExtraClips());
  const [charF, setCharF] = useState("all");
  const [clipF, setClipF] = useState("all");
  const [statusF, setStatusF] = useState<"all" | "ready" | "missing" | "generating">("all");
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ baseKey: "char_athena", name: "", kind: "loop" as "loop" | "oneshot", prompt: "", durationSec: 4 });
  /** Inspector preview: generated video vs extracted PNG flipbook (what the game plays). */
  const [previewMode, setPreviewMode] = useState<"video" | "sprites">("video");
  const [spriteBust, setSpriteBust] = useState(0);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const lastClickRef = useRef<string | null>(null);

  const catalogRows: AnimRow[] = useMemo(() => {
    const fromCatalog = allVideoClipRows().map((r) => ({
      key: r.key, baseKey: r.baseKey, label: r.label, name: r.clipName, dir: r.dir,
      kind: r.kind, prompt: r.prompt, durationSec: r.durationSec ?? 4, lockMs: r.lockMs, extra: false,
    }));
    const fromExtra = extras.map((e) => ({
      key: videoClipKey(e.baseKey, e.name), baseKey: e.baseKey, label: e.label,
      name: e.name, dir: null as IsoDir | null, kind: e.kind, prompt: e.prompt,
      durationSec: e.durationSec ?? 4, lockMs: e.lockMs, extra: true,
    }));
    return [...fromCatalog, ...fromExtra];
  }, [extras]);

  const clipNames = useMemo(
    () => Array.from(new Set(catalogRows.map((r) => r.name))).sort(),
    [catalogRows],
  );

  async function loadManifest() {
    try {
      const [a, h, m] = await Promise.all([
        fetch("/api/assets").then((r) => r.json()),
        fetch("/api/assets/history").then((r) => r.json()).catch(() => ({ history: {} })),
        fetch("/api/assets/anim-meta").then((r) => r.json()).catch(() => ({ meta: {} })),
      ]);
      setManifest(a.assets || {});
      setHistory(h.history || {});
      setMeta(m.meta || {});
    } catch { /* ignore */ }
  }
  useEffect(() => { loadManifest(); }, []);

  function rowStatus(key: string): "ready" | "missing" | "generating" {
    if (busy[key]) return "generating";
    return manifest[key] ? "ready" : "missing";
  }

  const filtered = useMemo(() => catalogRows.filter((r) => {
    if (charF !== "all" && r.baseKey !== charF) return false;
    if (clipF !== "all" && r.name !== clipF) return false;
    const st = rowStatus(r.key);
    if (statusF !== "all" && st !== statusF) return false;
    if (q && !(r.label + " " + r.name + " " + (r.dir || "") + " " + r.key).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [catalogRows, charF, clipF, statusF, q, manifest, busy]);

  const focused = catalogRows.find((r) => r.key === focus) || null;
  const focusUrl = focused ? assetSrc(manifest[focused.key], ver[focused.key]) : null;
  const basePrompt = focused
    ? (prompts[focused.key] ?? readClipPrompt(focused.key, focused.prompt))
    : "";
  const focusPrompt = focused && focused.dir
    ? composeDirectionalPrompt(basePrompt, focused.dir)
    : basePrompt;

  function setPrompt(key: string, value: string) {
    setPrompts((p) => ({ ...p, [key]: value }));
    writeClipPrompt(key, value);
  }

  async function genFacing(baseKey: string, dir: IsoDir, statusKey?: string, force = false) {
    const faceKey = facingStillKey(baseKey, dir);
    const sk = statusKey || faceKey;
    if (busy[faceKey] || busy[sk]) return null;
    if (!manifest[baseKey]) {
      setStatus((s) => ({ ...s, [sk]: "✗ generate base sprite in Assets first" }));
      return null;
    }
    setBusy((b) => ({ ...b, [faceKey]: true, ...(statusKey ? { [statusKey]: true } : {}) }));
    setStatus((s) => ({ ...s, [sk]: `${force ? "re" : ""}generating facing still (${dir.toUpperCase()})…` }));
    try {
      const r = await fetch("/api/assets/generate-facing-still", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseKey, dir, styleId, force }),
      });
      const d = await r.json();
      if (d.ok) {
        setManifest((m) => ({ ...m, [faceKey]: d.url || `/api/assets/img/${faceKey}` }));
        setVer((v) => ({ ...v, [faceKey]: Number(d.v) || Date.now() }));
        setStatus((s) => ({ ...s, [sk]: `✓ facing still ${dir.toUpperCase()} ready` }));
        return d as { ok: true; key: string; url: string; v: number };
      }
      setStatus((s) => ({ ...s, [sk]: `✗ ${d.details || d.error || "facing still failed"}` }));
      return null;
    } catch (e: any) {
      setStatus((s) => ({ ...s, [sk]: `✗ ${e?.message || e}` }));
      return null;
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[faceKey];
        if (statusKey) delete n[statusKey];
        return n;
      });
    }
  }

  /** Force-regen all facing stills for Athena (fixes dirs generated with conflicting camera prompts). */
  async function regenAllFacings(baseKey = "char_athena") {
    if (pipelineBusy || busy.__bulk) return;
    setPipelineBusy(true);
    setBusy((b) => ({ ...b, __bulk: true }));
    setStatus((s) => ({ ...s, __bulk: `Force-regenerating all facing stills for ${baseKey}…` }));
    try {
      const r = await fetch("/api/assets/regen-facing-stills", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseKey, styleId, force: true }),
      });
      const d = await r.json();
      if (!d.ok && !d.updated) {
        setStatus((s) => ({ ...s, __bulk: `✗ ${d.details || d.error || "facing regen failed"}` }));
        return;
      }
      await loadManifest();
      setStatus((s) => ({
        ...s,
        __bulk: `✓ ${d.updated} facing still(s) rebuilt` +
          (d.errors?.length ? ` · ${d.errors.length} failed` : "") +
          " — now re-run walk/idle videos so sprites pick up the new facing",
      }));
    } catch (e: any) {
      setStatus((s) => ({ ...s, __bulk: `✗ ${e?.message || e}` }));
    } finally {
      setPipelineBusy(false);
      setBusy((b) => { const n = { ...b }; delete n.__bulk; return n; });
    }
  }

  /**
   * Full pipeline for one clip: facing still (if dir) → video → chroma → extract sprites.
   * Server `ensureFacing` builds the still when missing; we also pre-build in bulk.
   */
  async function gen(row: AnimRow, opts?: { forceFacing?: boolean }): Promise<boolean> {
    if (busy[row.key]) return false;
    if (!manifest[row.baseKey]) {
      setStatus((s) => ({ ...s, [row.key]: "✗ generate base sprite in Assets first" }));
      return false;
    }
    setBusy((b) => ({ ...b, [row.key]: true }));
    const faceKey = row.dir ? facingStillKey(row.baseKey, row.dir) : null;
    const forceFacing = !!(opts?.forceFacing && row.dir);
    const needsFace = !!(row.dir && faceKey && (!manifest[faceKey] || forceFacing));
    setStatus((s) => ({
      ...s,
      [row.key]: needsFace
        ? `1/3 facing still (${row.dir!.toUpperCase()})…`
        : "1/3 video (facing ready)…",
    }));
    try {
      // Prefer catalog motion text so server can strip/re-apply REQUIRED FACING cleanly
      const prompt = prompts[row.key] ?? readClipPrompt(row.key, row.prompt) ?? row.prompt;
      setStatus((s) => ({
        ...s,
        [row.key]: needsFace
          ? `pipeline: facing → video → sprites… 2–5 min`
          : `pipeline: video → sprites… 1–3 min`,
      }));
      const r = await fetch("/api/assets/generate-anim-video", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseKey: row.baseKey, clip: row.name, dir: row.dir || undefined,
          prompt, duration: row.durationSec, styleId, ensureFacing: true, forceFacing,
        }),
      });
      const d = await r.json();
      if (!d.ok) {
        setStatus((s) => ({ ...s, [row.key]: `✗ ${d.details || d.error || "failed"}` }));
        return false;
      }
      setManifest((m) => {
        const next = { ...m, [row.key]: d.url || `/api/assets/video/${row.key}` };
        if (d.facingStill?.key) next[d.facingStill.key] = d.facingStill.url;
        return next;
      });
      setVer((v) => {
        const next = { ...v, [row.key]: Number(d.v) || Date.now() };
        if (d.facingStill?.key) next[d.facingStill.key] = Number(d.facingStill.v) || Date.now();
        return next;
      });
      // If server video ok but extract failed, finish the pipeline client-side.
      let spriteCount = d.sprites?.count || 0;
      if (!spriteCount) {
        setStatus((s) => ({ ...s, [row.key]: "3/3 extracting sprites…" }));
        try {
          const er = await fetch("/api/assets/extract-sprites", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: row.key }),
          });
          const ed = await er.json();
          if (ed.ok) {
            spriteCount = ed.count || 0;
            if (ed.meta) setMeta((m) => ({ ...m, [row.key]: ed.meta }));
          } else {
            setStatus((s) => ({
              ...s,
              [row.key]: `✓ video ready, but sprites failed: ${ed.details || ed.error || d.spritesError || "unknown"}`,
            }));
            await loadManifest();
            return true;
          }
        } catch (e: any) {
          setStatus((s) => ({
            ...s,
            [row.key]: `✓ video ready, but sprites failed: ${e?.message || d.spritesError || e}`,
          }));
          await loadManifest();
          return true;
        }
      }
      await loadManifest();
      if (spriteCount) {
        setSpriteBust(Date.now());
        setPreviewMode("sprites");
      }
      const stillNote = d.stillKey && String(d.stillKey).includes("__face_")
        ? ` · still ${String(d.stillKey).split("__").pop()}`
        : "";
      setStatus((s) => ({
        ...s,
        [row.key]: spriteCount
          ? `✓ pipeline done: video + ${spriteCount} sprites${stillNote}`
          : d.keyed ? `✓ video ready (green removed)${stillNote}` : `✓ video ready${stillNote}`,
      }));
      return true;
    } catch (e: any) {
      setStatus((s) => ({ ...s, [row.key]: `✗ ${e?.message || e}` }));
      return false;
    } finally {
      setBusy((b) => ({ ...b, [row.key]: false }));
    }
  }

  async function keyGreen(key: string) {
    if (busy[key] || !manifest[key]) return;
    setBusy((b) => ({ ...b, [key]: true }));
    setStatus((s) => ({ ...s, [key]: "removing green screen…" }));
    try {
      const r = await fetch("/api/assets/key-green", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const d = await r.json();
      if (d.ok) {
        setManifest((m) => ({ ...m, [key]: d.url || `/api/assets/video/${key}` }));
        setVer((v) => ({ ...v, [key]: Number(d.v) || Date.now() }));
        if (d.meta) setMeta((m) => ({ ...m, [key]: d.meta }));
        setStatus((s) => ({ ...s, [key]: "✓ green removed (transparent WebM)" }));
      } else setStatus((s) => ({ ...s, [key]: `✗ ${d.details || d.error}` }));
    } catch (e: any) {
      setStatus((s) => ({ ...s, [key]: `✗ ${e?.message || e}` }));
    }
    setBusy((b) => ({ ...b, [key]: false }));
  }

  async function extractSprites(key: string) {
    if (busy[key] || !manifest[key]) return;
    setBusy((b) => ({ ...b, [key]: true }));
    setStatus((s) => ({ ...s, [key]: "extracting sprite frames…" }));
    try {
      const r = await fetch("/api/assets/extract-sprites", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const d = await r.json();
      if (d.ok) {
        if (d.meta) setMeta((m) => ({ ...m, [key]: d.meta }));
        // Belt-and-suspenders: re-key any green that survived extract.
        await fetch("/api/assets/rekey-sprite-frames", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key }),
        }).catch(() => null);
        await loadManifest();
        setSpriteBust(Date.now());
        setPreviewMode("sprites");
        setStatus((s) => ({ ...s, [key]: `✓ ${d.count} sprite frames — switch preview to Sprites to scrub them` }));
      } else setStatus((s) => ({ ...s, [key]: `✗ ${d.details || d.error}` }));
    } catch (e: any) {
      setStatus((s) => ({ ...s, [key]: `✗ ${e?.message || e}` }));
    }
    setBusy((b) => ({ ...b, [key]: false }));
  }

  async function rekeyAllSprites() {
    setStatus((s) => ({ ...s, __bulk: "re-keying green out of all sprite frames…" }));
    try {
      const r = await fetch("/api/assets/rekey-sprite-frames", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (d.ok) {
        await loadManifest();
        setSpriteBust(Date.now());
        setStatus((s) => ({
          ...s,
          __bulk: `✓ removed green from ${d.updated} frame(s) (${d.skipped} already clean)`,
        }));
      } else setStatus((s) => ({ ...s, __bulk: `✗ ${d.details || d.error}` }));
    } catch (e: any) {
      setStatus((s) => ({ ...s, __bulk: `✗ ${e?.message || e}` }));
    }
  }

  async function saveLoopMeta(key: string, patch: Partial<ClipMeta>) {
    const r = await fetch(`/api/assets/anim-meta/${encodeURIComponent(key)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const d = await r.json();
    if (d.ok) setMeta((m) => ({ ...m, [key]: d.meta }));
  }

  async function del(key: string) {
    if (!confirm(`Delete video clip "${key}"?`)) return;
    await fetch(`/api/assets/${key}`, { method: "DELETE" });
    setManifest((m) => { const n = { ...m }; delete n[key]; return n; });
    setStatus((s) => ({ ...s, [key]: "removed" }));
  }

  async function selectVersion(key: string, versionKey: string) {
    await fetch("/api/assets/select", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, versionKey }),
    });
    await loadManifest();
    setVer((v) => ({ ...v, [key]: Date.now() }));
    setStatus((s) => ({ ...s, [key]: "✓ selected earlier version" }));
  }

  /** Run full pipeline sequentially: unique facing stills first, then each video→sprites. */
  async function runPipelineQueue(rows: AnimRow[], label: string) {
    if (!rows.length) {
      setStatus((s) => ({
        ...s,
        __bulk: "Nothing to generate — no missing/selected clips in view (and none missing overall).",
      }));
      return;
    }
    if (pipelineBusy) {
      setStatus((s) => ({ ...s, __bulk: "Pipeline already running…" }));
      return;
    }
    setPipelineBusy(true);
    // Mark every queued clip busy immediately so the table shows "generating".
    setBusy((b) => {
      const next = { ...b };
      for (const r of rows) next[r.key] = true;
      return next;
    });
    setStatus((s) => ({
      ...s,
      __bulk: `${label}: starting ${rows.length} clip(s) — facing still → video → sprites…`,
    }));

    try {
      const runnable = rows.filter((r) => !!manifest[r.baseKey]);
      const blocked = rows.filter((r) => !manifest[r.baseKey]);
      if (blocked.length) {
        setStatus((s) => {
          const next = { ...s };
          for (const r of blocked) {
            next[r.key] = `✗ generate base sprite "${r.baseKey}" in Assets first`;
          }
          if (!runnable.length) {
            next.__bulk = `✗ Generate base sprite(s) in Assets first: ${Array.from(new Set(blocked.map((r) => r.baseKey))).join(", ")}`;
          }
          return next;
        });
        if (!runnable.length) return;
      }

      const forceFacing = label === "selected"; // Regen selected rebuilds facing stills too
      const faceJobs = new Map<string, { baseKey: string; dir: IsoDir }>();
      for (const r of runnable) {
        if (!r.dir) continue;
        const fk = facingStillKey(r.baseKey, r.dir);
        if ((forceFacing || !manifest[fk]) && !faceJobs.has(fk)) {
          faceJobs.set(fk, { baseKey: r.baseKey, dir: r.dir });
        }
      }
      const failedFaces = new Set<string>();
      let fi = 0;
      for (const [fk, job] of Array.from(faceJobs.entries())) {
        fi++;
        setStatus((s) => {
          const next = {
            ...s,
            __bulk: `${label}: facing still ${job.dir.toUpperCase()} (${fi}/${faceJobs.size})…`,
          };
          for (const r of runnable.filter((x) => x.baseKey === job.baseKey && x.dir === job.dir)) {
            next[r.key] = `facing still ${job.dir.toUpperCase()} (${fi}/${faceJobs.size})…`;
          }
          return next;
        });
        const ok = await genFacing(job.baseKey, job.dir, undefined, forceFacing);
        if (!ok) {
          failedFaces.add(fk);
          setStatus((s) => {
            const next = {
              ...s,
              __bulk: `✗ facing still ${job.dir.toUpperCase()} failed — check credits / base sprite`,
            };
            for (const r of runnable.filter((x) => x.baseKey === job.baseKey && x.dir === job.dir)) {
              next[r.key] = `✗ facing still ${job.dir.toUpperCase()} failed`;
            }
            return next;
          });
        }
        await loadManifest();
      }

      const videoRows = runnable.filter((r) => {
        if (!r.dir) return true;
        return !failedFaces.has(facingStillKey(r.baseKey, r.dir));
      });
      let okN = 0, failN = blocked.length;
      let vi = 0;
      for (const row of videoRows) {
        vi++;
        setStatus((s) => ({
          ...s,
          __bulk: `${label}: video+sprites ${vi}/${videoRows.length}…`,
          [row.key]: `video+sprites ${vi}/${videoRows.length}…`,
        }));
        // gen() also toggles busy[row.key]; clear queue flag so gen can take over
        setBusy((b) => ({ ...b, [row.key]: false }));
        const ok = await gen(row, { forceFacing });
        if (ok) okN++; else failN++;
      }
      failN += runnable.length - videoRows.length;
      setStatus((s) => ({
        ...s,
        __bulk: `${label} done: ${okN} ok · ${failN} failed/skipped of ${rows.length}`,
      }));
    } finally {
      setBusy((b) => {
        const next = { ...b };
        for (const r of rows) delete next[r.key];
        return next;
      });
      setPipelineBusy(false);
    }
  }

  async function genSelected() {
    const rows = filtered.filter((r) => selected.has(r.key));
    await runPipelineQueue(rows, "selected");
  }
  async function genMissing() {
    // Prefer current filter; if filter hides missings (e.g. status=Ready), fall back to all missing.
    let rows = filtered.filter((r) => !manifest[r.key]);
    if (!rows.length) {
      rows = catalogRows.filter((r) => !manifest[r.key]);
      if (rows.length) {
        setStatus((s) => ({
          ...s,
          __bulk: `Filter hid missings — generating all ${rows.length} missing clip(s)…`,
        }));
      }
    }
    await runPipelineQueue(rows, "missing");
  }

  function toggleSelect(key: string, shift: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && lastClickRef.current) {
        const keys = filtered.map((r) => r.key);
        const a = keys.indexOf(lastClickRef.current);
        const b = keys.indexOf(key);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(keys[i]);
          return next;
        }
      }
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    lastClickRef.current = key;
  }

  function addClip() {
    const name = addForm.name.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (!name) return;
    const label = VIDEO_ANIM_SPECS.find((s) => s.baseKey === addForm.baseKey)?.label || addForm.baseKey;
    const key = videoClipKey(addForm.baseKey, name);
    if (catalogRows.some((r) => r.key === key)) {
      setStatus((s) => ({ ...s, [key]: "clip already exists" }));
      return;
    }
    const clip: ExtraClip = {
      baseKey: addForm.baseKey, label, name, kind: addForm.kind,
      prompt: addForm.prompt.trim() || `${name} animation, wholesome kids game`,
      durationSec: addForm.durationSec,
      lockMs: addForm.kind === "oneshot" ? 900 : undefined,
    };
    const next = [...extras, clip];
    setExtras(next);
    writeExtraClips(next);
    writeClipPrompt(key, clip.prompt);
    setFocus(key);
    setAddOpen(false);
    setAddForm((f) => ({ ...f, name: "", prompt: "" }));
  }

  function removeExtra(key: string) {
    const next = extras.filter((e) => videoClipKey(e.baseKey, e.name) !== key);
    setExtras(next);
    writeExtraClips(next);
    if (focus === key) setFocus(null);
  }

  const chars = VIDEO_ANIM_SPECS.map((s) => ({ id: s.baseKey, label: s.label }));
  const readyN = catalogRows.filter((r) => manifest[r.key]).length;
  const focusMeta = focused ? (meta[focused.key] || { loopStart: 0, loopEnd: 0 }) : null;
  const focusSpriteUrls = useMemo(() => {
    if (!focused) return [] as string[];
    const count = focusMeta?.frameCount || 0;
    if (count < 2) return [];
    return videoFrameKeys(focused.baseKey, focused.name, count, focused.dir)
      .map((fk) => assetSrc(manifest[fk], spriteBust || ver[fk]))
      .filter((u): u is string => !!u);
  }, [focused, focusMeta?.frameCount, manifest, ver, spriteBust]);
  const focusSpriteFps = focused ? spritePlaybackFps(focused) : 8;

  return (
    <div style={{ ...panelStyle, flexDirection: "row" }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={toolbarStyle}>
          <span style={{ fontSize: 12, fontWeight: 700, color: S.textBright }}>
            Video clips · {readyN}/{catalogRows.length}
          </span>
          <select value={charF} onChange={(e) => setCharF(e.target.value)} style={sel}>
            <option value="all">All characters</option>
            {chars.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select value={clipF} onChange={(e) => setClipF(e.target.value)} style={sel}>
            <option value="all">All clips</option>
            {clipNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={statusF} onChange={(e) => setStatusF(e.target.value as any)} style={sel}>
            <option value="all">All status</option>
            <option value="ready">Ready</option>
            <option value="missing">Missing</option>
            <option value="generating">Generating</option>
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" style={{ ...sel, width: 120 }} />
          <HouseStyleSelect value={styleId} favorites={favorites} onChange={setStyleId} />
          <button onClick={() => setAddOpen((o) => !o)} style={btn(false)}>+ Add clip</button>
          <button type="button" onClick={() => void genSelected()} disabled={!selected.size || pipelineBusy}
            style={{ ...btn(true), opacity: selected.size && !pipelineBusy ? 1 : 0.45 }}
            title="Full pipeline per clip: facing still → video → extract sprites">
            Regen selected ({selected.size})
          </button>
          <button type="button" onClick={() => void genMissing()} disabled={pipelineBusy}
            style={{ ...btn(true), opacity: pipelineBusy ? 0.55 : 1 }}
            title="For each missing clip: facing still (shared per dir) → video → chroma → extract sprites">
            {pipelineBusy ? "Pipeline running…" : "Generate missing"}
          </button>
          <button type="button" onClick={() => void rekeyAllSprites()} disabled={pipelineBusy} style={btn(false)}
            title="Remove green screen from already-extracted PNG flipbook frames">
            Remove green from sprites
          </button>
          <button type="button" onClick={() => void regenAllFacings(charF !== "all" ? charF : "char_athena")}
            disabled={pipelineBusy} style={btn(false)}
            title="Force-rebuild every directional facing still with corrected orientation prompts (then regen walk videos)">
            Fix all facings
          </button>
          {status.__bulk && (
            <span style={{
              fontSize: 11, color: S.textBright, background: S.panel2, border: `1px solid ${S.border}`,
              padding: "4px 8px", borderRadius: 3, maxWidth: 360,
            }} title={status.__bulk}>
              {status.__bulk}
            </span>
          )}
        </div>

        {addOpen && (
          <div style={{ ...toolbarStyle, background: S.panel2, gap: 6 }}>
            <select value={addForm.baseKey} onChange={(e) => setAddForm((f) => ({ ...f, baseKey: e.target.value }))} style={sel}>
              {chars.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="clip name" style={{ ...sel, width: 110 }} />
            <select value={addForm.kind} onChange={(e) => setAddForm((f) => ({ ...f, kind: e.target.value as any }))} style={sel}>
              <option value="loop">loop</option>
              <option value="oneshot">oneshot</option>
            </select>
            <input type="number" min={1} max={15} value={addForm.durationSec}
              onChange={(e) => setAddForm((f) => ({ ...f, durationSec: Math.max(1, Math.min(15, +e.target.value || 4)) }))}
              style={{ ...sel, width: 56 }} title="duration sec" />
            <input value={addForm.prompt} onChange={(e) => setAddForm((f) => ({ ...f, prompt: e.target.value }))}
              placeholder="motion prompt" style={{ ...sel, flex: 1, minWidth: 160 }} />
            <button onClick={addClip} style={btn(true)}>Add</button>
          </div>
        )}

        <div style={{ flex: 1, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th style={{ width: 28 }}>
                  <input type="checkbox"
                    checked={filtered.length > 0 && filtered.every((r) => selected.has(r.key))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(filtered.map((r) => r.key)) : new Set())} />
                </Th>
                <Th>Preview</Th>
                <Th>Character</Th>
                <Th>Clip</Th>
                <Th>Dir</Th>
                <Th>Kind</Th>
                <Th>Status</Th>
                <Th>Keyed</Th>
                <Th>Dur</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => {
                const st = rowStatus(row.key);
                const url = assetSrc(manifest[row.key], ver[row.key]);
                const selectedRow = focus === row.key;
                const keyed = !!meta[row.key]?.keyed;
                return (
                  <tr key={row.key}
                    onClick={() => setFocus(row.key)}
                    style={{
                      background: selectedRow ? S.selected : idx % 2 ? S.panel : S.bg,
                      borderTop: `1px solid ${S.borderSoft}`, cursor: "pointer",
                    }}>
                    <td style={td} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(row.key)}
                        onChange={(e) => toggleSelect(row.key, (e.nativeEvent as MouseEvent).shiftKey)} />
                    </td>
                    <td style={td}>
                      <div style={{
                        ...CHECKER, width: 56, height: 40, borderRadius: 2, overflow: "hidden",
                        border: `1px solid ${S.border}`, display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {busy[row.key] ? <Spinner />
                          : url ? (
                            <video key={url} src={url} muted loop autoPlay playsInline
                              style={{ maxWidth: "100%", maxHeight: "100%" }} />
                          ) : <span style={{ fontSize: 9, color: S.textDim }}>—</span>}
                      </div>
                    </td>
                    <td style={{ ...td, fontWeight: 600, color: S.textBright }}>{row.label}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: S.textBright }}>{row.name}</div>
                      <div style={{ fontFamily: S.mono, fontSize: 10, color: S.textDim }}>{row.key}</div>
                    </td>
                    <td style={{ ...td, fontFamily: S.mono, color: S.textDim, textTransform: "uppercase" }}>
                      {row.dir || "—"}
                    </td>
                    <td style={td}>
                      <StatusBadge label={row.kind} tone={row.kind === "loop" ? "ok" : "warn"} />
                    </td>
                    <td style={td}>
                      <StatusBadge
                        label={st}
                        tone={st === "ready" ? "ok" : st === "generating" ? "busy" : "dim"}
                      />
                    </td>
                    <td style={td}>
                      {url ? <StatusBadge label={keyed ? "yes" : "raw"} tone={keyed ? "ok" : "warn"} /> : "—"}
                    </td>
                    <td style={{ ...td, color: S.textDim }}>{row.durationSec}s</td>
                    <td style={td} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => gen(row)} disabled={!!busy[row.key]} style={btn(true)}>
                        {busy[row.key] ? "…" : url ? "Regen" : "Generate"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr><td colSpan={10} style={{ ...td, color: S.textDim, padding: 24 }}>No clips match filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ResizableInspector storageKey="mova.studio.inspector.anims" defaultWidth={360}>
        {!focused ? (
          <div style={{ padding: 16, color: S.textDim, fontSize: 12 }}>
            Select a clip to edit motion, trim the loop, remove green, or manage versions.
            Directional clips first need a facing still (`__face_n`…), then video from that still.
          </div>
        ) : (
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: S.textBright }}>
                {focused.label} · {focused.name}
                {focused.dir ? ` · ${focused.dir.toUpperCase()}` : ""}
              </div>
              <div style={{ fontFamily: S.mono, fontSize: 11, color: S.textDim }}>{focused.key}</div>
              <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <StatusBadge label={focused.kind} tone={focused.kind === "loop" ? "ok" : "warn"} />
                {focused.dir && <StatusBadge label={focused.dir} tone="busy" />}
                <StatusBadge
                  label={rowStatus(focused.key)}
                  tone={rowStatus(focused.key) === "ready" ? "ok" : rowStatus(focused.key) === "generating" ? "busy" : "dim"}
                />
                {focusMeta?.keyed && <StatusBadge label="keyed" tone="ok" />}
                {focused.extra && <StatusBadge label="custom" tone="warn" />}
              </div>
            </div>

            {focused.dir && (() => {
              const faceKey = facingStillKey(focused.baseKey, focused.dir!);
              const faceUrl = assetSrc(manifest[faceKey], ver[faceKey]);
              const faceBusy = !!busy[faceKey];
              return (
                <div style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: S.textDim, textTransform: "uppercase" }}>
                    Facing still · {focused.dir.toUpperCase()}
                  </span>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{
                      ...CHECKER, width: 72, height: 72, borderRadius: 2, overflow: "hidden",
                      border: `1px solid ${S.border}`, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {faceBusy ? <Spinner />
                        : faceUrl ? (
                          <img key={faceUrl} src={faceUrl} alt={faceKey}
                            style={{ maxWidth: "100%", maxHeight: "100%", imageRendering: "pixelated" }} />
                        ) : <span style={{ fontSize: 9, color: S.textDim }}>missing</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
                      <div style={{ fontFamily: S.mono, fontSize: 10, color: S.textDim }}>{faceKey}</div>
                      <div style={{ fontSize: 10, color: S.textDim }}>
                        Shared by idle/walk/run/carry for this facing. Video starts from this still (not the base).
                      </div>
                      <button
                        onClick={() => void genFacing(focused.baseKey, focused.dir!, focused.key, !!faceUrl)}
                        disabled={faceBusy || !!busy[focused.key] || !manifest[focused.baseKey]}
                        style={{
                          ...btn(faceUrl ? false : true),
                          opacity: (faceBusy || busy[focused.key]) ? 0.55 : 1,
                          justifySelf: "self-start",
                        }}
                      >
                        {faceBusy ? "Working…" : faceUrl ? "Regen facing still" : "Generate facing still"}
                      </button>
                    </div>
                  </div>
                  {status[faceKey] && status[faceKey] !== status[focused.key] && (
                    <div style={{ fontSize: 11, color: S.textDim }}>{status[faceKey]}</div>
                  )}
                </div>
              );
            })()}

            <div style={{ display: "flex", gap: 4 }}>
              {(["video", "sprites"] as const).map((mode) => {
                const spriteN = focusSpriteUrls.length;
                const label = mode === "video"
                  ? "Video"
                  : spriteN ? `Sprites (${spriteN})` : "Sprites";
                const disabled = mode === "sprites" && spriteN < 2 && !focusMeta?.frameCount;
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={disabled && mode === "sprites" && !focusUrl}
                    onClick={() => setPreviewMode(mode)}
                    style={{
                      ...btn(previewMode === mode),
                      opacity: disabled && mode === "sprites" && !focusMeta?.frameCount ? 0.55 : 1,
                      fontSize: 11,
                    }}
                    title={mode === "video"
                      ? "Generated MP4/WebM (Studio trim / chroma)"
                      : "Extracted PNG flipbook — what Kitchen plays"}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {previewMode === "video" ? (
              <LoopVideoPreview
                url={focusUrl}
                busy={!!busy[focused.key]}
                meta={focusMeta}
                baseKey={focused.baseKey}
                onDuration={(duration) => {
                  if (!focused || !duration) return;
                  if (Math.abs((meta[focused.key]?.duration || 0) - duration) > 0.05) {
                    void saveLoopMeta(focused.key, { ...focusMeta!, duration });
                  }
                }}
              />
            ) : (
              <SpriteFlipbookPreview
                urls={focusSpriteUrls}
                fps={focusSpriteFps}
                busy={!!busy[focused.key]}
                clipLabel={`${focused.name}${focused.dir ? ` · ${focused.dir}` : ""}`}
                onExtract={() => void extractSprites(focused.key)}
                canExtract={!!focusUrl}
              />
            )}

            {previewMode === "video" && focusUrl && focusMeta && focused.kind === "loop" && (
              <LoopTrimEditor
                meta={focusMeta}
                onChange={(patch) => setMeta((m) => ({ ...m, [focused.key]: { ...focusMeta, ...patch } }))}
                onCommit={(patch) => void saveLoopMeta(focused.key, patch)}
              />
            )}

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: S.textDim, textTransform: "uppercase" }}>
                Motion prompt{focused.dir ? " (+ facing)" : ""}
              </span>
              <textarea
                value={basePrompt}
                onChange={(e) => setPrompt(focused.key, e.target.value)}
                rows={4}
                style={{
                  ...sel, resize: "vertical", fontFamily: S.mono, fontSize: 11, lineHeight: 1.4,
                  whiteSpace: "pre-wrap",
                }}
              />
              {focused.dir && (
                <span style={{ fontSize: 10, color: S.textDim, fontFamily: S.mono }}>
                  → {focusPrompt.slice(0, 160)}{focusPrompt.length > 160 ? "…" : ""}
                </span>
              )}
              <span style={{ fontSize: 10, color: S.textDim }}>
                {focused.dir
                  ? "Chroma-green appended server-side. Likeness from the facing still for this direction (auto-built if missing)."
                  : "Chroma-green plate appended server-side. Likeness from base still."}
              </span>
            </label>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button onClick={() => gen(focused)} disabled={!!busy[focused.key]}
                style={{ ...btn(true), opacity: busy[focused.key] ? 0.55 : 1 }}>
                {busy[focused.key] ? "Working…" : focusUrl ? "Regenerate video" : "Generate video"}
              </button>
              {focusUrl && (
                <button onClick={() => keyGreen(focused.key)} disabled={!!busy[focused.key]}
                  style={btn(false)} title="ffmpeg chromakey → transparent WebM">
                  Remove green
                </button>
              )}
              {focusUrl && (
                <button onClick={() => extractSprites(focused.key)} disabled={!!busy[focused.key]}
                  style={btn(true)}
                  title="Pull PNG flipbook frames from this video (game uses these)">
                  {focusMeta?.frameCount ? `Re-extract sprites (${focusMeta.frameCount})` : "Extract sprites"}
                </button>
              )}
              {focusUrl && (
                <a href={focusUrl} target="_blank" rel="noreferrer" style={{ ...btn(false), textDecoration: "none" }}>
                  Open file
                </a>
              )}
              {focusUrl && (
                <button onClick={() => del(focused.key)} disabled={!!busy[focused.key]} style={btn(false)}>
                  Delete
                </button>
              )}
              {focused.extra && (
                <button onClick={() => removeExtra(focused.key)} style={btn(false)}>Remove custom clip</button>
              )}
            </div>

            {status[focused.key] && (
              <div style={{ fontSize: 11, color: S.textDim }}>{status[focused.key]}</div>
            )}

            <VideoVersionPicker
              assetKey={focused.key}
              history={history}
              onSelect={selectVersion}
            />

            {!manifest[focused.baseKey] && (
              <div style={{ fontSize: 11, color: S.warn }}>
                Base sprite missing — generate {focused.label} in the Assets tab first.
              </div>
            )}
          </div>
        )}
      </ResizableInspector>
    </div>
  );
}

/** Cycle extracted PNG frames at gameplay FPS so Studio can verify flipbooks. */
function SpriteFlipbookPreview({
  urls, fps, busy, clipLabel, onExtract, canExtract,
}: {
  urls: string[];
  fps: number;
  busy: boolean;
  clipLabel: string;
  onExtract: () => void;
  canExtract: boolean;
}) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => { setI(0); }, [urls.join("|")]);
  useEffect(() => {
    if (!playing || urls.length < 2) return;
    const ms = Math.max(40, Math.round(1000 / Math.max(1, fps)));
    const id = window.setInterval(() => setI((n) => (n + 1) % urls.length), ms);
    return () => window.clearInterval(id);
  }, [playing, urls, fps]);

  if (busy) {
    return (
      <ResizablePreview storageKey="mova.studio.preview.animsSprites" defaultHeight={220}>
        <div style={{
          ...CHECKER, height: "100%", borderRadius: 3, border: `1px solid ${S.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Spinner label="working…" />
        </div>
      </ResizablePreview>
    );
  }

  if (urls.length < 2) {
    return (
      <ResizablePreview storageKey="mova.studio.preview.animsSprites" defaultHeight={220}>
        <div style={{
          ...CHECKER, height: "100%", borderRadius: 3, border: `1px solid ${S.border}`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 10, padding: 16, textAlign: "center",
        }}>
          <span style={{ fontSize: 11, color: S.textDim, lineHeight: 1.4 }}>
            No extracted sprites for <code style={{ fontFamily: S.mono }}>{clipLabel}</code> yet.
            The game prefers these PNGs over the video.
          </span>
          {canExtract && (
            <button type="button" onClick={onExtract} style={btn(true)}>Extract sprites</button>
          )}
        </div>
      </ResizablePreview>
    );
  }

  const cur = urls[i] || urls[0];
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <ResizablePreview storageKey="mova.studio.preview.animsSprites" defaultHeight={220}>
        <div style={{
          ...CHECKER, height: "100%", borderRadius: 3, overflow: "hidden", border: `1px solid ${S.border}`,
          display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
        }}>
          <img key={cur} src={cur} alt={`frame ${i + 1}`}
            style={{ maxWidth: "100%", maxHeight: "100%", imageRendering: "pixelated" }} />
          <div style={{
            position: "absolute", left: 8, bottom: 8, fontSize: 10, fontFamily: S.mono,
            color: S.textBright, background: "#000a", padding: "2px 6px", borderRadius: 2,
          }}>
            {i + 1}/{urls.length} · {fps}fps
          </div>
        </div>
      </ResizablePreview>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={() => setPlaying((p) => !p)} style={btn(false)}>
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={() => setI((n) => (n - 1 + urls.length) % urls.length)} style={btn(false)}>
          ◀
        </button>
        <button type="button" onClick={() => setI((n) => (n + 1) % urls.length)} style={btn(false)}>
          ▶
        </button>
        <span style={{ fontSize: 10, color: S.textDim }}>Gameplay flipbook preview</span>
      </div>
      <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 2 }}>
        {urls.map((u, idx) => (
          <button
            key={u + idx}
            type="button"
            onClick={() => { setPlaying(false); setI(idx); }}
            style={{
              ...CHECKER, width: 40, height: 40, flexShrink: 0, padding: 0, cursor: "pointer",
              border: `2px solid ${idx === i ? S.accent : S.border}`, borderRadius: 2, overflow: "hidden",
            }}
          >
            <img src={u} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", imageRendering: "pixelated" }} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Preview that respects loopStart/loopEnd trim points. */
function LoopVideoPreview({
  url, busy, meta, baseKey, onDuration,
}: {
  url: string | null;
  busy: boolean;
  meta: ClipMeta | null;
  baseKey: string;
  onDuration: (d: number) => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !meta) return;
    const onTime = () => {
      const end = meta.loopEnd > 0 ? meta.loopEnd : el.duration;
      if (end > meta.loopStart && el.currentTime >= end - 0.02) {
        el.currentTime = meta.loopStart;
      }
    };
    const onMeta = () => {
      if (Number.isFinite(el.duration)) onDuration(el.duration);
      if (meta.loopStart > 0) el.currentTime = meta.loopStart;
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
    };
  }, [url, meta?.loopStart, meta?.loopEnd, onDuration]);

  return (
    <ResizablePreview storageKey="mova.studio.preview.anims" defaultHeight={220}>
      <div style={{
        ...CHECKER, height: "100%", borderRadius: 3, overflow: "hidden", border: `1px solid ${S.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {busy ? <Spinner label="working…" />
          : url ? (
            <video ref={ref} key={url} src={url} muted loop controls autoPlay playsInline
              style={{ maxWidth: "100%", maxHeight: "100%" }} />
          ) : (
            <span style={{ fontSize: 11, color: S.textDim, padding: 12, textAlign: "center" }}>
              No video yet. Needs base sprite <code style={{ fontFamily: S.mono }}>{baseKey}</code>.
            </span>
          )}
      </div>
    </ResizablePreview>
  );
}

function LoopTrimEditor({
  meta, onChange, onCommit,
}: {
  meta: ClipMeta;
  onChange: (patch: Partial<ClipMeta>) => void;
  onCommit: (patch: Partial<ClipMeta>) => void;
}) {
  const dur = meta.duration && meta.duration > 0 ? meta.duration : Math.max(meta.loopEnd, 4);
  const start = meta.loopStart || 0;
  const end = meta.loopEnd > 0 ? meta.loopEnd : dur;

  function commit(patch: Partial<ClipMeta>) {
    onChange(patch);
    onCommit({ loopStart: patch.loopStart ?? start, loopEnd: patch.loopEnd ?? end, duration: dur });
  }

  return (
    <div style={{
      display: "grid", gap: 8, padding: 10, background: S.bg,
      border: `1px solid ${S.border}`, borderRadius: 3,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: S.textDim, textTransform: "uppercase" }}>
        Loop trim
      </div>
      <div style={{ fontSize: 10, color: S.textDim, lineHeight: 1.35 }}>
        Set where the seamless loop should start / stop when the generated video isn’t perfect.
      </div>
      <label style={{ display: "grid", gap: 4, fontSize: 11, color: S.text }}>
        Start {start.toFixed(2)}s
        <input type="range" min={0} max={Math.max(0.05, end - 0.05)} step={0.05} value={start}
          onChange={(e) => onChange({ loopStart: +e.target.value })}
          onMouseUp={(e) => commit({ loopStart: +(e.target as HTMLInputElement).value })}
          onTouchEnd={(e) => commit({ loopStart: +(e.target as HTMLInputElement).value })}
        />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 11, color: S.text }}>
        End {end.toFixed(2)}s
        <input type="range" min={Math.min(dur, start + 0.05)} max={dur} step={0.05} value={end}
          onChange={(e) => onChange({ loopEnd: +e.target.value })}
          onMouseUp={(e) => commit({ loopEnd: +(e.target as HTMLInputElement).value })}
          onTouchEnd={(e) => commit({ loopEnd: +(e.target as HTMLInputElement).value })}
        />
      </label>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" style={btn(false)}
          onClick={() => commit({ loopStart: 0, loopEnd: 0 })}>
          Reset full length
        </button>
        <span style={{ fontSize: 10, color: S.textDim, alignSelf: "center" }}>
          duration ≈ {dur.toFixed(2)}s
        </span>
      </div>
    </div>
  );
}

function VideoVersionPicker({
  assetKey, history, onSelect,
}: {
  assetKey: string;
  history: Record<string, any>;
  onSelect: (key: string, versionKey: string) => void;
}) {
  const vs = history[assetKey]?.versions || [];
  return (
    <details open={vs.length > 0} style={{ marginTop: 4 }}>
      <summary style={{ fontSize: 11, color: S.textDim, cursor: "pointer" }}>
        versions{vs.length ? ` (${vs.length})` : " — none yet"}
      </summary>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {vs.length === 0 && <span style={{ fontSize: 10, color: S.textDim }}>Generate to start version history.</span>}
        {vs.map((v: any) => (
          <button key={v.key} onClick={() => onSelect(assetKey, v.key)}
            title={v.ts ? new Date(v.ts).toLocaleString() : "version"}
            style={{
              width: 72, height: 48, borderRadius: 2, padding: 0, overflow: "hidden", cursor: "pointer",
              border: v.current ? `2px solid ${S.accent}` : `1px solid ${S.border}`,
              background: "#111",
            }}>
            <video src={v.url} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </button>
        ))}
      </div>
    </details>
  );
}
