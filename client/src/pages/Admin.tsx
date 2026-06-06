import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ArrowLeft, 
  Lock, 
  RefreshCw, 
  ImagePlus, 
  Check, 
  X,
  Loader2,
  Edit3,
  BookOpen,
  Image,
  Settings,
  Save,
  GripVertical,
  Volume2,
  Calendar,
  RotateCcw,
  Trash2,
  Filter,
  Database,
  Library,
  LayoutGrid,
  Users,
  Layers,
  Sparkles,
  Crown,
  Award,
  Star,
  Ban,
  HelpCircle,
  ListTree,
  AlertCircle,
  CheckCircle2,
  Search,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import type { Language } from "@/lib/api";
import StoryDesigner from "@/components/StoryDesigner";

interface AdminWord {
  id: string;
  targetWord: string;
  english: string;
  language: string;
  imageUrl: string | null;
  audioUrl: string | null;
  frequencyRank: number;
  displayOrder: number;
  category: string | null;
  partOfSpeech: string | null;
  isLearned: boolean;
  learnedAt: string | null;
  lastReviewDate: string | null;
  reviewCount: number;
  nextReviewDate: string | null;
  repetitions: number;
}

async function verifyPassword(password: string): Promise<{ success: boolean; token?: string }> {
  try {
    const response = await apiRequest("POST", "/api/admin/auth", { password });
    if (response.ok) {
      const data = await response.json();
      return { success: true, token: data.token };
    }
    return { success: false };
  } catch {
    return { success: false };
  }
}

async function regenerateImage(wordId: string, token: string, customPrompt?: string): Promise<string> {
  const response = await fetch(`/api/admin/words/${wordId}/regenerate-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ customPrompt }),
  });
  if (!response.ok) throw new Error("Failed to regenerate image");
  const data = await response.json();
  return data.imageUrl;
}

async function generateImage(wordId: string, token: string): Promise<string> {
  const response = await fetch(`/api/admin/words/${wordId}/generate-image`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new Error("Failed to generate image");
  const data = await response.json();
  return data.imageUrl;
}

async function generateAudio(wordId: string): Promise<string> {
  const response = await fetch(`/api/tts/${wordId}`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Failed to generate audio");
  const data = await response.json();
  return data.audioUrl;
}

async function deleteImage(wordId: string, token: string): Promise<void> {
  const response = await fetch(`/api/admin/words/${wordId}/image`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new Error("Failed to delete image");
}

async function deleteWord(wordId: string, token: string): Promise<void> {
  const response = await fetch(`/api/admin/words/${wordId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new Error("Failed to delete word");
}

async function fetchWordsWithoutImagesAuth(token: string, language?: Language): Promise<AdminWord[]> {
  const url = language ? `/api/admin/words/no-images?language=${language}` : "/api/admin/words/no-images";
  const response = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to fetch words");
  return response.json();
}

async function fetchWordsWithMissingImagesAuth(token: string, language?: Language): Promise<AdminWord[]> {
  const url = language ? `/api/admin/words/missing-images?language=${language}` : "/api/admin/words/missing-images";
  const response = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to fetch words");
  return response.json();
}

interface BatchJobStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total: number;
  completed: number;
  failedCount: number;
  successCount: number;
  failed: string[];
}

async function startBatchGeneration(token: string, wordIds: string[]): Promise<{ jobId: string }> {
  const response = await fetch("/api/admin/batch-generate-images", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ wordIds }),
  });
  if (!response.ok) throw new Error("Failed to start batch generation");
  return response.json();
}

async function getBatchJobStatus(token: string, jobId: string): Promise<BatchJobStatus> {
  const response = await fetch(`/api/admin/batch-generate-images/${jobId}`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to get batch status");
  return response.json();
}

async function fetchAdminWordsAuth(token: string, language?: Language, userId?: string): Promise<AdminWord[]> {
  const params = new URLSearchParams();
  if (language) params.set("language", language);
  if (userId) params.set("userId", userId);
  const url = `/api/admin/words${params.toString() ? `?${params}` : ""}`;
  const response = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to fetch words");
  return response.json();
}

async function fetchSettings(token: string): Promise<{ defaultImagePrompt: string }> {
  const response = await fetch("/api/admin/settings", {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to fetch settings");
  return response.json();
}

async function updateSettings(token: string, defaultImagePrompt: string): Promise<void> {
  const response = await fetch("/api/admin/settings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ defaultImagePrompt }),
  });
  if (!response.ok) throw new Error("Failed to update settings");
}

async function reorderWords(token: string, wordIds: string[], targetIndex: number): Promise<void> {
  const response = await fetch("/api/admin/words/reorder", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ wordIds, targetIndex }),
  });
  if (!response.ok) throw new Error("Failed to reorder words");
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateString: string | null): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface FreqWord {
  id: string;
  word: string;
  english: string | null;
  language: string;
  frequencyRank: number;
  partOfSpeech: string | null;
  category: string | null;
  suggested: boolean | null;
  gatePass: boolean | null;
  gateReason: string | null;
  d1Spoken: number | null;
  d2ChildWorld: number | null;
  d3Concrete: number | null;
  d4Generative: number | null;
  d5AgeOk: number | null;
  d6Cultural: number | null;
  d7Cognate: number | null;
  d8Phonetic: number | null;
  tier: "T1" | "T2" | "T3" | "T4" | "Reject" | null;
  rationale: string | null;
}

type SuggestedFilter = "all" | "yes" | "no" | "unevaluated";
type TierFilter = "all" | "T1" | "T2" | "T3" | "T4" | "Reject" | "unscored";

interface EvalProgress {
  isRunning: boolean;
  processed: number;
  totalRemaining: number;
  lastBatchWords: { word: string; suggested: boolean | null }[];
  status: string;
}

interface CuratedStats {
  tierCounts: Record<string, number>;
  rejectReasons: { reason: string; count: number }[];
  total: number;
}

const TIER_META: Record<string, { label: string; sub: string; color: string; ring: string; icon: any }> = {
  T1: { label: "T1 — Survival", sub: "First ~100 words", color: "from-amber-500 to-orange-600", ring: "ring-amber-500/40", icon: Crown },
  T2: { label: "T2 — Daily life", sub: "Family, body, food, basic verbs", color: "from-emerald-500 to-teal-600", ring: "ring-emerald-500/40", icon: Star },
  T3: { label: "T3 — Conversation", sub: "School, transport, feelings", color: "from-sky-500 to-blue-600", ring: "ring-sky-500/40", icon: Award },
  T4: { label: "T4 — Fluency stretch", sub: "Useful but not urgent", color: "from-violet-500 to-purple-600", ring: "ring-violet-500/40", icon: Sparkles },
  Reject: { label: "Reject", sub: "Failed gate (adult / abstract / etc.)", color: "from-rose-500 to-red-600", ring: "ring-rose-500/40", icon: Ban },
  unscored: { label: "Unscored", sub: "Not yet evaluated", color: "from-slate-400 to-slate-500", ring: "ring-slate-400/40", icon: HelpCircle },
};

const DIM_META: { key: keyof FreqWord; label: string; max: number; color: string }[] = [
  { key: "d1Spoken",     label: "D1 Spoken",        max: 3, color: "bg-emerald-500" },
  { key: "d2ChildWorld", label: "D2 Child world",   max: 3, color: "bg-teal-500" },
  { key: "d3Concrete",   label: "D3 Concrete",      max: 3, color: "bg-sky-500" },
  { key: "d4Generative", label: "D4 Generative",    max: 3, color: "bg-indigo-500" },
  { key: "d5AgeOk",      label: "D5 Age-OK",        max: 3, color: "bg-violet-500" },
  { key: "d6Cultural",   label: "D6 Cultural",      max: 2, color: "bg-pink-500" },
  { key: "d7Cognate",    label: "D7 Cognate",       max: 2, color: "bg-amber-500" },
  { key: "d8Phonetic",   label: "D8 Phonetic",      max: 2, color: "bg-orange-500" },
];

function TierCard({ tier, count, total, active, onClick }: { tier: string; count: number; total: number; active: boolean; onClick: () => void }) {
  const meta = TIER_META[tier];
  const pct = total > 0 ? (count / total) * 100 : 0;
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl text-left transition-all hover:scale-[1.02] ${active ? `ring-2 ${meta.ring} shadow-lg` : "ring-1 ring-border"}`}
      data-testid={`tier-card-${tier}`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${meta.color} opacity-90`} />
      <div className="relative p-4 text-white">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wide opacity-90">{meta.label}</span>
          </div>
        </div>
        <div className="mt-3 text-3xl font-bold tabular-nums">{count.toLocaleString()}</div>
        <div className="mt-1 text-xs opacity-80">{meta.sub}</div>
        <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-white/80" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 text-[10px] opacity-70 tabular-nums">{pct.toFixed(1)}% of total</div>
      </div>
    </button>
  );
}

function DimensionBars({ word }: { word: FreqWord }) {
  return (
    <div className="grid grid-cols-8 gap-1">
      {DIM_META.map((d) => {
        const v = (word[d.key] as number | null) ?? 0;
        const pct = (v / d.max) * 100;
        return (
          <div key={d.key} className="flex flex-col items-center gap-0.5" title={`${d.label}: ${v}/${d.max}`}>
            <div className="relative h-8 w-2 bg-muted rounded overflow-hidden">
              <div className={`absolute bottom-0 left-0 right-0 ${d.color} transition-all`} style={{ height: `${pct}%` }} />
            </div>
            <div className="text-[8px] text-muted-foreground tabular-nums">{v}</div>
          </div>
        );
      })}
    </div>
  );
}

type CurriculumWordRow = {
  word: string;
  english: string;
  tier: string | null;
  rank: number | null;
  category: string | null;
  partOfSpeech: string | null;
  rationale: string | null;
  inDictionary: boolean;
  duplicateInLaterPhase: boolean;
};

type CurriculumSubthemeData = { name: string; words: CurriculumWordRow[] };
type CurriculumPhaseData = {
  phase: number;
  name: string;
  goal: string;
  color: string;
  subthemes: CurriculumSubthemeData[];
};

type CurriculumStats = {
  totalUnique: number;
  totalEntries: number;
  inDictCount: number;
  missingCount: number;
  tierCounts: Record<string, number>;
};

const PHASE_THEME: Record<number, { dot: string; soft: string; ring: string; chip: string }> = {
  0: { dot: "bg-stone-500", soft: "from-stone-50 to-stone-100/50 dark:from-stone-950/40 dark:to-stone-900/20 border-stone-300 dark:border-stone-800", ring: "ring-stone-300 dark:ring-stone-700", chip: "bg-stone-100 text-stone-800 dark:bg-stone-900/40 dark:text-stone-300 border-stone-300/60" },
  1: { dot: "bg-amber-500", soft: "from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/20 border-amber-300 dark:border-amber-800", ring: "ring-amber-300 dark:ring-amber-700", chip: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300/60" },
  2: { dot: "bg-orange-500", soft: "from-orange-50 to-orange-100/50 dark:from-orange-950/40 dark:to-orange-900/20 border-orange-300 dark:border-orange-800", ring: "ring-orange-300 dark:ring-orange-700", chip: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-300/60" },
  3: { dot: "bg-emerald-500", soft: "from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/20 border-emerald-300 dark:border-emerald-800", ring: "ring-emerald-300 dark:ring-emerald-700", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300/60" },
  4: { dot: "bg-teal-500", soft: "from-teal-50 to-teal-100/50 dark:from-teal-950/40 dark:to-teal-900/20 border-teal-300 dark:border-teal-800", ring: "ring-teal-300 dark:ring-teal-700", chip: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 border-teal-300/60" },
  5: { dot: "bg-sky-500", soft: "from-sky-50 to-sky-100/50 dark:from-sky-950/40 dark:to-sky-900/20 border-sky-300 dark:border-sky-800", ring: "ring-sky-300 dark:ring-sky-700", chip: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300 border-sky-300/60" },
  6: { dot: "bg-indigo-500", soft: "from-indigo-50 to-indigo-100/50 dark:from-indigo-950/40 dark:to-indigo-900/20 border-indigo-300 dark:border-indigo-800", ring: "ring-indigo-300 dark:ring-indigo-700", chip: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-300/60" },
  7: { dot: "bg-violet-500", soft: "from-violet-50 to-violet-100/50 dark:from-violet-950/40 dark:to-violet-900/20 border-violet-300 dark:border-violet-800", ring: "ring-violet-300 dark:ring-violet-700", chip: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 border-violet-300/60" },
  8: { dot: "bg-fuchsia-500", soft: "from-fuchsia-50 to-fuchsia-100/50 dark:from-fuchsia-950/40 dark:to-fuchsia-900/20 border-fuchsia-300 dark:border-fuchsia-800", ring: "ring-fuchsia-300 dark:ring-fuchsia-700", chip: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-300 border-fuchsia-300/60" },
  9: { dot: "bg-rose-500", soft: "from-rose-50 to-rose-100/50 dark:from-rose-950/40 dark:to-rose-900/20 border-rose-300 dark:border-rose-800", ring: "ring-rose-300 dark:ring-rose-700", chip: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border-rose-300/60" },
};

function tierBadgeClass(tier: string | null): string {
  switch (tier) {
    case "T1": return "bg-amber-100 text-amber-900 border-amber-400/70 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700";
    case "T2": return "bg-emerald-100 text-emerald-900 border-emerald-400/70 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700";
    case "T3": return "bg-sky-100 text-sky-900 border-sky-400/70 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-700";
    case "T4": return "bg-violet-100 text-violet-900 border-violet-400/70 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700";
    case "Reject": return "bg-rose-100 text-rose-900 border-rose-400/70 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function CurriculumTab({ authToken, language }: { authToken: string; language: string }) {
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<number | "all">("all");

  const { data, isLoading } = useQuery<{ phases: CurriculumPhaseData[]; stats: CurriculumStats }>({
    queryKey: ["/api/admin/curriculum", language],
    queryFn: async () => {
      const r = await fetch(`/api/admin/curriculum/${language}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!r.ok) throw new Error("Failed to load curriculum");
      return r.json();
    },
    enabled: !!authToken,
  });

  const filteredPhases = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.phases
      .filter((p) => phaseFilter === "all" || p.phase === phaseFilter)
      .map((p) => ({
        ...p,
        subthemes: p.subthemes
          .map((s) => ({
            ...s,
            words: s.words.filter((w) =>
              !q ||
              w.word.toLowerCase().includes(q) ||
              w.english.toLowerCase().includes(q),
            ),
          }))
          .filter((s) => s.words.length > 0),
      }))
      .filter((p) => p.subthemes.length > 0);
  }, [data, search, phaseFilter]);

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading curriculum…
      </div>
    );
  }

  const stats = data.stats;
  const phases = data.phases;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="flex items-center justify-between gap-4 flex-wrap bg-gradient-to-br from-background to-muted/30 p-5 rounded-xl border">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ListTree className="w-6 h-6 text-violet-500" />
            Curriculum — first {stats.totalUnique} words
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {stats.totalEntries} entries across {phases.length} phases ·{" "}
            <span className="font-semibold text-foreground">{stats.inDictCount}</span> in dictionary ·{" "}
            <span className={stats.missingCount > 0 ? "font-semibold text-rose-600 dark:text-rose-400" : "font-semibold text-foreground"}>
              {stats.missingCount}
            </span>{" "}
            missing
          </p>
        </div>
        <div className="flex gap-3">
          {Object.entries(stats.tierCounts).sort(([a], [b]) => a.localeCompare(b)).map(([tier, count]) => (
            <div key={tier} className="text-center">
              <div className="text-2xl font-bold tabular-nums">{count}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{tier === "missing" ? "Not in dict" : tier}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Phase filter pills + search */}
      <div className="flex items-center gap-3 flex-wrap sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 py-3 -my-3 border-b">
        <div className="flex gap-1.5 flex-wrap">
          <Button
            variant={phaseFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setPhaseFilter("all")}
            className="h-8"
          >
            All ({stats.totalEntries})
          </Button>
          {phases.map((p) => {
            const total = p.subthemes.reduce((a, s) => a + s.words.length, 0);
            const t = PHASE_THEME[p.phase];
            return (
              <Button
                key={p.phase}
                variant={phaseFilter === p.phase ? "default" : "outline"}
                size="sm"
                onClick={() => setPhaseFilter(p.phase)}
                className="h-8 gap-1.5"
              >
                <span className={`w-2 h-2 rounded-full ${t.dot}`} />
                P{p.phase} · {p.name} ({total})
              </Button>
            );
          })}
        </div>
        <div className="relative flex-1 max-w-xs ml-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search Russian or English…"
            className="h-8 pl-7 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Phases */}
      <div className="space-y-8">
        {filteredPhases.map((p) => {
          const theme = PHASE_THEME[p.phase];
          const phaseTotal = p.subthemes.reduce((a, s) => a + s.words.length, 0);
          const phaseInDict = p.subthemes.reduce(
            (a, s) => a + s.words.filter((w) => w.inDictionary).length, 0,
          );
          const phaseMissing = phaseTotal - phaseInDict;
          return (
            <section key={p.phase}>
              {/* Phase banner */}
              <div className={`rounded-xl border bg-gradient-to-br ${theme.soft} p-4 mb-3`}>
                <div className="flex items-baseline justify-between gap-4 flex-wrap">
                  <div className="flex items-baseline gap-3">
                    <div className={`w-10 h-10 rounded-lg ${theme.dot} text-white grid place-items-center text-base font-black shadow-sm`}>
                      {p.phase}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold leading-none">{p.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{p.goal}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      {phaseInDict} in dict
                    </Badge>
                    {phaseMissing > 0 && (
                      <Badge variant="secondary" className="gap-1">
                        <AlertCircle className="w-3 h-3 text-rose-500" />
                        {phaseMissing} missing
                      </Badge>
                    )}
                    <span className="font-mono tabular-nums text-muted-foreground">{phaseTotal} words</span>
                  </div>
                </div>
              </div>

              {/* Subthemes */}
              <div className="space-y-4">
                {p.subthemes.map((s) => (
                  <div key={s.name} className="rounded-lg border bg-card overflow-hidden">
                    <div className="flex items-baseline justify-between px-3 py-1.5 bg-muted/30 border-b">
                      <h4 className="text-sm font-semibold">{s.name}</h4>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground tabular-nums">
                        {s.words.length} {s.words.length === 1 ? "word" : "words"}
                      </span>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-muted/20 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr className="text-left">
                          <th className="px-3 py-1.5 font-medium w-10">#</th>
                          <th className="px-3 py-1.5 font-medium">Russian</th>
                          <th className="px-3 py-1.5 font-medium">English</th>
                          <th className="px-3 py-1.5 font-medium w-16">Tier</th>
                          <th className="px-3 py-1.5 font-medium w-20">Rank</th>
                          <th className="px-3 py-1.5 font-medium">Category</th>
                          <th className="px-3 py-1.5 font-medium w-20">POS</th>
                          <th className="px-3 py-1.5 font-medium w-12 text-center">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.words.map((row, i) => {
                          const missing = !row.inDictionary;
                          return (
                            <tr
                              key={`${row.word}-${i}`}
                              className={`border-t border-border/50 hover:bg-muted/20 transition-colors ${missing ? "bg-rose-50/40 dark:bg-rose-950/10" : ""}`}
                            >
                              <td className="px-3 py-1 text-[11px] text-muted-foreground tabular-nums">{i + 1}</td>
                              <td className="px-3 py-1 font-medium">
                                <span className="font-russian">{row.word}</span>
                              </td>
                              <td className="px-3 py-1 text-muted-foreground">{row.english}</td>
                              <td className="px-3 py-1">
                                {row.tier ? (
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold ${tierBadgeClass(row.tier)}`}>
                                    {row.tier}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-rose-600 dark:text-rose-400">—</span>
                                )}
                              </td>
                              <td className="px-3 py-1 font-mono text-[11px] text-muted-foreground tabular-nums">
                                {row.rank ? `#${row.rank}` : "—"}
                              </td>
                              <td className="px-3 py-1 text-[11px] text-muted-foreground truncate max-w-[200px]" title={row.category ?? ""}>
                                {row.category ?? <span className="opacity-50">—</span>}
                              </td>
                              <td className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                                {row.partOfSpeech ?? <span className="opacity-50">—</span>}
                              </td>
                              <td className="px-3 py-1 text-center">
                                {missing && (
                                  <span title="Not in frequency dictionary — needs to be added or imported.">
                                    <AlertCircle className="w-3.5 h-3.5 text-rose-500 inline" />
                                  </span>
                                )}
                                {!missing && row.duplicateInLaterPhase && (
                                  <span title="Re-introduced in a later phase for spaced re-exposure.">
                                    <Layers className="w-3.5 h-3.5 text-sky-500 inline" />
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        {filteredPhases.length === 0 && (
          <div className="text-center py-16 text-muted-foreground text-sm">No words match your filter.</div>
        )}
      </div>
    </div>
  );
}

function CuratedWordsTab({ authToken, language }: { authToken: string; language: string }) {
  const [tierFilter, setTierFilter] = useState<TierFilter>("T1");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [groupByTheme, setGroupByTheme] = useState(true);
  const [expandedThemes, setExpandedThemes] = useState<Set<string>>(new Set());
  const PAGE_SIZE = 50;

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(0); }, [tierFilter]);

  const { data: stats } = useQuery<CuratedStats>({
    queryKey: ["/api/admin/frequency-dictionary", language, "curated-stats"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/frequency-dictionary/${language}/curated-stats`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!r.ok) throw new Error("Failed to load stats");
      return r.json();
    },
    enabled: !!authToken,
    refetchInterval: 30000,
  });

  // When grouping by theme, fetch all words for the tier (no pagination)
  const fetchLimit = groupByTheme ? 5000 : PAGE_SIZE;
  const fetchOffset = groupByTheme ? 0 : page * PAGE_SIZE;

  const { data: words, isLoading } = useQuery<{ words: FreqWord[]; total: number }>({
    queryKey: ["/api/admin/frequency-dictionary", language, "curated", tierFilter, debouncedSearch, fetchOffset, fetchLimit],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(fetchLimit),
        offset: String(fetchOffset),
        tierFilter,
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const r = await fetch(`/api/admin/frequency-dictionary/${language}?${params}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!r.ok) throw new Error("Failed to load words");
      return r.json();
    },
    enabled: !!authToken,
  });

  const totalPages = Math.ceil((words?.total ?? 0) / PAGE_SIZE);
  const tierCounts = stats?.tierCounts ?? {};
  const total = stats?.total ?? 0;
  const passRate = total > 0 ? (((tierCounts.T1 ?? 0) + (tierCounts.T2 ?? 0) + (tierCounts.T3 ?? 0) + (tierCounts.T4 ?? 0)) / total) * 100 : 0;
  const t123 = (tierCounts.T1 ?? 0) + (tierCounts.T2 ?? 0) + (tierCounts.T3 ?? 0);

  const tierOrder: TierFilter[] = ["T1", "T2", "T3", "T4", "Reject", "unscored"];

  return (
    <div className="space-y-6">
      {/* Hero stats */}
      <div className="flex items-center justify-between gap-4 flex-wrap bg-gradient-to-br from-background to-muted/30 p-5 rounded-xl border">
        <div>
          <h2 className="text-2xl font-bold">Curated word tiers</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {total.toLocaleString()} words scored · <span className="font-semibold text-foreground">{t123.toLocaleString()}</span> high-priority (T1–T3) · <span className="font-semibold text-foreground">{passRate.toFixed(0)}%</span> pass rate
          </p>
        </div>
        <div className="flex gap-3">
          <div className="text-center">
            <div className="text-3xl font-bold tabular-nums text-amber-600 dark:text-amber-500">{(tierCounts.T1 ?? 0).toLocaleString()}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Survival</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-500">{((tierCounts.T1 ?? 0) + (tierCounts.T2 ?? 0)).toLocaleString()}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Daily-life set</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold tabular-nums text-sky-600 dark:text-sky-500">{t123.toLocaleString()}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Conversational</div>
          </div>
        </div>
      </div>

      {/* Tier cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {tierOrder.map((t) => (
          <TierCard
            key={t}
            tier={t}
            count={tierCounts[t] ?? 0}
            total={total}
            active={tierFilter === t}
            onClick={() => setTierFilter(t)}
          />
        ))}
      </div>

      {/* Reject reason breakdown — only shown when Reject tier is selected */}
      {tierFilter === "Reject" && stats && stats.rejectReasons.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Ban className="w-4 h-4 text-rose-500" />
            Reject reasons
          </h3>
          <div className="flex flex-wrap gap-2">
            {stats.rejectReasons.map((r) => (
              <Badge key={r.reason} variant="secondary" className="text-xs">
                {r.reason} <span className="ml-1.5 font-mono opacity-70">{r.count}</span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Search + view toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Input
            placeholder="Search this tier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="curated-search"
          />
        </div>
        <div className="text-sm text-muted-foreground flex-1">
          {words?.total ?? 0} {tierFilter === "all" ? "results" : `in ${tierFilter}`}
        </div>
        {tierFilter !== "Reject" && tierFilter !== "unscored" && (
          <div className="flex gap-1 bg-muted rounded-md p-0.5">
            <Button
              size="sm"
              variant={groupByTheme ? "default" : "ghost"}
              onClick={() => setGroupByTheme(true)}
              className="h-7 text-xs"
              data-testid="view-by-theme"
            >By theme</Button>
            <Button
              size="sm"
              variant={!groupByTheme ? "default" : "ghost"}
              onClick={() => setGroupByTheme(false)}
              className="h-7 text-xs"
              data-testid="view-flat-list"
            >Flat list</Button>
          </div>
        )}
      </div>

      {/* Word list */}
      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : groupByTheme && tierFilter !== "Reject" && tierFilter !== "unscored" ? (
        <ThemeGroupedList
          words={words?.words ?? []}
          expandedThemes={expandedThemes}
          setExpandedThemes={setExpandedThemes}
        />
      ) : (
        <div className="space-y-2">
          {words?.words.map((w) => <WordRow key={w.id} word={w} />)}
          {words?.words.length === 0 && (
            <div className="text-center text-muted-foreground py-12">No words match this filter.</div>
          )}
        </div>
      )}

      {/* Pagination — only in flat mode */}
      {!groupByTheme && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
          <span className="text-sm text-muted-foreground tabular-nums">Page {page + 1} / {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next</Button>
        </div>
      )}
    </div>
  );
}

function WordRow({ word: w }: { word: FreqWord }) {
  return (
    <div className="rounded-lg border bg-card p-3 hover-elevate transition-all" data-testid={`curated-word-${w.id}`}>
      <div className="flex items-center gap-4">
        <div className="text-xs font-mono text-muted-foreground tabular-nums w-12 text-right">#{w.frequencyRank}</div>
        {w.tier && (
          <div className={`px-2 py-0.5 rounded text-[10px] font-bold text-white bg-gradient-to-br ${TIER_META[w.tier]?.color ?? "from-slate-400 to-slate-500"} w-12 text-center`}>
            {w.tier}
          </div>
        )}
        <div className="min-w-32">
          <div className="text-base font-semibold">{w.word}</div>
          {w.english && <div className="text-xs text-muted-foreground">{w.english}</div>}
        </div>
        {w.tier !== "Reject" && w.d1Spoken !== null && <DimensionBars word={w} />}
        {w.tier === "Reject" && w.gateReason && <Badge variant="destructive" className="text-xs">{w.gateReason}</Badge>}
        <div className="flex-1 text-xs text-muted-foreground italic line-clamp-2">{w.rationale ?? "(no rationale)"}</div>
      </div>
    </div>
  );
}

function ThemeGroupedList({ words, expandedThemes, setExpandedThemes }: {
  words: FreqWord[];
  expandedThemes: Set<string>;
  setExpandedThemes: (s: Set<string>) => void;
}) {
  // Group words by category (theme)
  const grouped: Record<string, FreqWord[]> = {};
  for (const w of words) {
    const theme = w.category ?? "(unclassified)";
    if (!grouped[theme]) grouped[theme] = [];
    grouped[theme].push(w);
  }

  // Sort themes by size (largest first) and within each by frequency_rank
  const themes = Object.keys(grouped).sort((a, b) => grouped[b].length - grouped[a].length);
  for (const t of themes) grouped[t].sort((a, b) => a.frequencyRank - b.frequencyRank);

  const toggle = (theme: string) => {
    const next = new Set(expandedThemes);
    if (next.has(theme)) next.delete(theme);
    else next.add(theme);
    setExpandedThemes(next);
  };

  if (words.length === 0) {
    return <div className="text-center text-muted-foreground py-12">No words.</div>;
  }

  return (
    <div className="space-y-3">
      {themes.map((theme) => {
        const list = grouped[theme];
        const isOpen = expandedThemes.has(theme);
        return (
          <div key={theme} className="rounded-lg border bg-card overflow-hidden">
            <button
              onClick={() => toggle(theme)}
              className="w-full px-4 py-3 flex items-center justify-between hover-elevate transition-all"
              data-testid={`theme-toggle-${theme}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-base font-semibold">{theme}</span>
                <Badge variant="secondary" className="text-xs">{list.length}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">{isOpen ? "▼" : "▶"}</span>
            </button>
            {isOpen && (
              <div className="border-t bg-muted/30 p-3">
                <div className="flex flex-wrap gap-1.5">
                  {list.map((w) => (
                    <div
                      key={w.id}
                      className="group relative px-2.5 py-1 rounded-md bg-background border text-sm hover:shadow-sm hover:scale-105 transition-all cursor-help"
                      title={`#${w.frequencyRank} · ${w.tier} · ${w.rationale ?? ""}`}
                      data-testid={`theme-word-${w.id}`}
                    >
                      <span className="font-medium">{w.word}</span>
                      {w.english && (
                        <span className="text-muted-foreground text-xs ml-1.5">{w.english}</span>
                      )}
                      {w.tier && (
                        <span className={`ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded text-white bg-gradient-to-br ${TIER_META[w.tier]?.color ?? "from-slate-400 to-slate-500"}`}>
                          {w.tier}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FrequencyDictionaryTab({ authToken, language }: { authToken: string; language: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [clearExisting, setClearExisting] = useState(true);
  const [suggestedFilter, setSuggestedFilter] = useState<SuggestedFilter>("all");
  const [evalProgress, setEvalProgress] = useState<EvalProgress>({
    isRunning: false, processed: 0, totalRemaining: 0, lastBatchWords: [], status: "",
  });
  const eventSourceRef = useRef<EventSource | null>(null);
  const PAGE_SIZE = 100;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, refetch } = useQuery<{ words: FreqWord[]; total: number }>({
    queryKey: ["/api/admin/frequency-dictionary", language, debouncedSearch, page, suggestedFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (suggestedFilter !== "all") params.set("suggestedFilter", suggestedFilter);
      const res = await fetch(`/api/admin/frequency-dictionary/${language}?${params}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!authToken,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  const handleImport = async () => {
    if (!importText.trim()) return;
    setIsImporting(true);
    try {
      const res = await fetch(`/api/admin/frequency-dictionary/${language}/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ content: importText, clearExisting }),
      });
      if (!res.ok) throw new Error("Import failed");
      const result = await res.json();
      toast({ title: "Import complete", description: `Imported ${result.imported} words for ${language}` });
      setShowImportDialog(false);
      setImportText("");
      refetch();
    } catch (e) {
      toast({ title: "Import failed", description: String(e), variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const handleClear = async () => {
    if (!confirm(`Clear all ${language} dictionary entries?`)) return;
    try {
      const res = await fetch(`/api/admin/frequency-dictionary/${language}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) throw new Error("Clear failed");
      toast({ title: "Dictionary cleared", description: `All ${language} entries removed` });
      refetch();
    } catch (e) {
      toast({ title: "Clear failed", description: String(e), variant: "destructive" });
    }
  };

  const startEvaluation = () => {
    if (eventSourceRef.current) return;

    setEvalProgress({ isRunning: true, processed: 0, totalRemaining: 0, lastBatchWords: [], status: "Starting..." });

    const es = new EventSource(`/api/admin/frequency-dictionary/${language}/evaluate?token=${authToken}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "start") {
        setEvalProgress((p) => ({ ...p, totalRemaining: data.totalRemaining, status: `Evaluating ${data.totalRemaining} words...` }));
      } else if (data.type === "batch") {
        setEvalProgress((p) => ({
          ...p,
          processed: data.processed,
          totalRemaining: data.totalRemaining,
          lastBatchWords: data.words || [],
          status: `Processed ${data.processed}/${data.totalRemaining} — batch: ${data.suggested} suggested, ${data.rejected} rejected`,
        }));
        queryClient.invalidateQueries({ queryKey: ["/api/admin/frequency-dictionary"] });
      } else if (data.type === "complete") {
        setEvalProgress((p) => ({ ...p, isRunning: false, status: `Done! Evaluated ${data.processed} words.` }));
        toast({ title: "Evaluation complete", description: `Evaluated ${data.processed} words` });
        es.close();
        eventSourceRef.current = null;
        refetch();
      } else if (data.type === "cancelled") {
        setEvalProgress((p) => ({ ...p, isRunning: false, status: `Cancelled after ${data.processed} words. You can resume later.` }));
        toast({ title: "Evaluation paused", description: `Processed ${data.processed} words so far. Resume anytime.` });
        es.close();
        eventSourceRef.current = null;
        refetch();
      } else if (data.type === "error") {
        setEvalProgress((p) => ({ ...p, isRunning: false, status: `Error: ${data.message}` }));
        toast({ title: "Evaluation error", description: data.message, variant: "destructive" });
        es.close();
        eventSourceRef.current = null;
      }
    };

    es.onerror = () => {
      setEvalProgress((p) => ({ ...p, isRunning: false, status: "Connection lost. You can resume later." }));
      es.close();
      eventSourceRef.current = null;
    };
  };

  const cancelEvaluation = async () => {
    try {
      await fetch(`/api/admin/frequency-dictionary/${language}/evaluate/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
    } catch (e) {
      console.error("Cancel failed", e);
    }
  };

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const progressPercent = evalProgress.totalRemaining > 0
    ? Math.round((evalProgress.processed / evalProgress.totalRemaining) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Frequency Dictionary</h2>
          <Badge variant="secondary">{data?.total ?? 0} words</Badge>
        </div>
        <div className="flex gap-2">
          {!evalProgress.isRunning ? (
            <Button
              size="sm"
              variant="outline"
              onClick={startEvaluation}
              className="gap-2"
              disabled={!data?.total}
              data-testid="button-evaluate-dictionary"
            >
              <RefreshCw className="w-4 h-4" />
              {evalProgress.processed > 0 ? "Resume Evaluation" : "Evaluate Words"}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={cancelEvaluation}
              className="gap-2 border-orange-300 text-orange-600 hover:bg-orange-50"
              data-testid="button-cancel-evaluation"
            >
              <X className="w-4 h-4" />
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => setShowImportDialog(true)}
            className="gap-2"
            data-testid="button-import-dictionary"
          >
            <Database className="w-4 h-4" />
            Import Words
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleClear}
            disabled={!data?.total}
            data-testid="button-clear-dictionary"
          >
            <Trash2 className="w-4 h-4" />
            Clear All
          </Button>
        </div>
      </div>

      {(evalProgress.isRunning || evalProgress.status) && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {evalProgress.isRunning && <Loader2 className="w-4 h-4 animate-spin" />}
              <span className="text-sm font-medium">{evalProgress.status}</span>
            </div>
            {evalProgress.isRunning && (
              <span className="text-sm text-muted-foreground">{progressPercent}%</span>
            )}
          </div>
          {evalProgress.isRunning && (
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary rounded-full h-2 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
          {evalProgress.lastBatchWords.length > 0 && (
            <div className="text-xs text-muted-foreground max-h-20 overflow-y-auto">
              {evalProgress.lastBatchWords.map((w, i) => (
                <span key={i} className={`inline-block mr-2 mb-1 px-1.5 py-0.5 rounded ${w.suggested === true ? "bg-green-100 text-green-700" : w.suggested === false ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>
                  {w.word}
                </span>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-muted p-1 rounded-lg">
          {(["all", "yes", "no", "unevaluated"] as SuggestedFilter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={suggestedFilter === f ? "default" : "ghost"}
              onClick={() => { setSuggestedFilter(f); setPage(0); }}
              data-testid={`filter-suggested-${f}`}
            >
              {f === "all" ? "All" : f === "yes" ? "Suggested" : f === "no" ? "Rejected" : "Unevaluated"}
            </Button>
          ))}
        </div>
        <Input
          placeholder="Search words..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
          data-testid="input-dictionary-search"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : !data?.words.length ? (
        <Card className="p-12 text-center text-muted-foreground">
          <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">
            {suggestedFilter !== "all" ? `No ${suggestedFilter === "yes" ? "suggested" : suggestedFilter === "no" ? "rejected" : "unevaluated"} words` : "No dictionary entries"}
          </p>
          <p className="text-sm mt-1">
            {suggestedFilter !== "all" ? "Try a different filter" : "Import a word list to get started"}
          </p>
        </Card>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 w-20">Rank</th>
                  <th className="text-left px-4 py-2">Word</th>
                  <th className="text-left px-4 py-2">English</th>
                  <th className="text-left px-4 py-2 w-32">Part of Speech</th>
                  <th className="text-left px-4 py-2 w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.words.map((word) => (
                  <tr key={word.id} className="border-t hover:bg-muted/20" data-testid={`dict-row-${word.id}`}>
                    <td className="px-4 py-2 text-muted-foreground font-mono">{word.frequencyRank}</td>
                    <td className="px-4 py-2 font-medium">{word.word}</td>
                    <td className="px-4 py-2 text-muted-foreground">{word.english || "-"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{word.partOfSpeech || "-"}</td>
                    <td className="px-4 py-2">
                      {word.suggested === true ? (
                        <Badge variant="default" className="bg-green-100 text-green-700 hover:bg-green-100">
                          <Check className="w-3 h-3 mr-1" /> Yes
                        </Badge>
                      ) : word.suggested === false ? (
                        <Badge variant="default" className="bg-red-100 text-red-700 hover:bg-red-100">
                          <X className="w-3 h-3 mr-1" /> No
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          —
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages} ({data.total} total)
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  data-testid="button-dict-prev"
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                  data-testid="button-dict-next"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Frequency Dictionary</DialogTitle>
            <DialogDescription>
              Paste a plain text word list (one word per line). Line number = frequency rank.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={"Example:\nи\nв\nне\nон\nна"}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={12}
            className="font-mono text-sm"
            data-testid="textarea-import-words"
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id="clear-existing"
              checked={clearExisting}
              onCheckedChange={(c) => setClearExisting(!!c)}
              data-testid="checkbox-clear-existing"
            />
            <label htmlFor="clear-existing" className="text-sm">
              Clear existing entries before import
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>Cancel</Button>
            <Button onClick={handleImport} disabled={isImporting || !importText.trim()} data-testid="button-confirm-import">
              {isImporting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Importing...</> : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Admin() {
  const { currentUser } = useUser();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  const [editingWord, setEditingWord] = useState<AdminWord | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchErrors, setBatchErrors] = useState<string[]>([]);
  
  const [isRegeneratingMissing, setIsRegeneratingMissing] = useState(false);
  const [missingProgress, setMissingProgress] = useState({ current: 0, total: 0 });
  const [missingImagesCount, setMissingImagesCount] = useState(0);
  
  const [isRegeneratingSelected, setIsRegeneratingSelected] = useState(false);
  const [selectedProgress, setSelectedProgress] = useState({ current: 0, total: 0 });
  
  const [imageCacheBuster, setImageCacheBuster] = useState(Date.now());
  
  const [showSettings, setShowSettings] = useState(false);
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draggedIds, setDraggedIds] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterPartOfSpeech, setFilterPartOfSpeech] = useState<string>("all");
  const [filterLearned, setFilterLearned] = useState<string>("all");
  
  const [isSyncingVocabulary, setIsSyncingVocabulary] = useState(false);
  const [activeTab, setActiveTab] = useState<"vocabulary" | "stories" | "view" | "dictionary" | "curated" | "curriculum">("vocabulary");
  const [viewStudentId, setViewStudentId] = useState<string>("none");
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [isRemovingDuplicates, setIsRemovingDuplicates] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const queryClient = useQueryClient();
  
  const userLanguage = currentUser?.language as Language | undefined;
  const languageLabel = userLanguage === 'spanish' ? 'Spanish' : 'Russian';

  const { data: words = [], isLoading } = useQuery({
    queryKey: ['/api/admin/words', authToken, userLanguage],
    queryFn: () => authToken ? fetchAdminWordsAuth(authToken, userLanguage) : Promise.resolve([]),
    enabled: isAuthenticated && !!authToken,
  });

  const { data: settings } = useQuery({
    queryKey: ['/api/admin/settings', authToken],
    queryFn: () => authToken ? fetchSettings(authToken) : Promise.resolve({ defaultImagePrompt: "" }),
    enabled: isAuthenticated && !!authToken,
  });

  const { data: allUsers = [] } = useQuery<Array<{ id: string; username: string; language: string }>>({
    queryKey: ['/api/users'],
    enabled: isAuthenticated,
  });

  const { data: viewWords = [], isLoading: isViewLoading } = useQuery({
    queryKey: ['/api/admin/words', authToken, userLanguage, 'view', viewStudentId],
    queryFn: () => authToken ? fetchAdminWordsAuth(authToken, userLanguage, viewStudentId !== "none" ? viewStudentId : undefined) : Promise.resolve([]),
    enabled: isAuthenticated && !!authToken && activeTab === "view",
  });

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  useEffect(() => {
    async function checkMissingImages() {
      if (isAuthenticated && authToken) {
        try {
          const missingImages = await fetchWordsWithMissingImagesAuth(authToken, userLanguage);
          setMissingImagesCount(missingImages.length);
        } catch (error) {
          console.error("Failed to check missing images:", error);
        }
      }
    }
    checkMissingImages();
  }, [isAuthenticated, authToken, userLanguage, words]);

  const { toast } = useToast();
  
  const handleRegenerateMissingImages = useCallback(async () => {
    if (!authToken) return;
    
    setIsRegeneratingMissing(true);
    try {
      const wordsWithMissingImages = await fetchWordsWithMissingImagesAuth(authToken, userLanguage);
      
      if (wordsWithMissingImages.length === 0) {
        toast({
          title: "No images to regenerate",
          description: "All images are up to date",
        });
        setIsRegeneratingMissing(false);
        return;
      }
      
      const wordIds = wordsWithMissingImages.map(w => w.id);
      setMissingProgress({ current: 0, total: wordIds.length });

      const { jobId } = await startBatchGeneration(authToken, wordIds);
      
      const pollInterval = setInterval(async () => {
        try {
          const status = await getBatchJobStatus(authToken, jobId);
          setMissingProgress({ current: status.completed, total: status.total });
          
          if (status.status === 'completed' || status.status === 'failed') {
            clearInterval(pollInterval);
            
            queryClient.invalidateQueries({ queryKey: ['/api/admin/words', authToken, userLanguage] });
            
            const updatedMissing = await fetchWordsWithMissingImagesAuth(authToken, userLanguage);
            setMissingImagesCount(updatedMissing.length);
            
            if (status.failedCount > 0) {
              toast({
                title: "Some images failed",
                description: `${status.successCount} succeeded, ${status.failedCount} failed`,
                variant: "destructive",
              });
            } else {
              toast({
                title: "Images regenerated",
                description: `Successfully generated ${status.successCount} images (3 at a time)`,
              });
            }
            
            setImageCacheBuster(Date.now());
            setIsRegeneratingMissing(false);
            setMissingProgress({ current: 0, total: 0 });
          }
        } catch (error) {
          console.error("Error polling batch status:", error);
          clearInterval(pollInterval);
          setIsRegeneratingMissing(false);
          setMissingProgress({ current: 0, total: 0 });
        }
      }, 1500);
      
    } catch (error) {
      console.error("Error regenerating missing images:", error);
      toast({
        title: "Error",
        description: "Failed to start batch regeneration",
        variant: "destructive",
      });
      setIsRegeneratingMissing(false);
      setMissingProgress({ current: 0, total: 0 });
    }
  }, [authToken, userLanguage, queryClient, toast]);

  const handleRegenerateSelected = useCallback(async () => {
    if (!authToken || selectedIds.size === 0) return;
    
    setIsRegeneratingSelected(true);
    try {
      const wordIds = Array.from(selectedIds);
      setSelectedProgress({ current: 0, total: wordIds.length });

      const { jobId } = await startBatchGeneration(authToken, wordIds);
      
      const pollInterval = setInterval(async () => {
        try {
          const status = await getBatchJobStatus(authToken, jobId);
          setSelectedProgress({ current: status.completed, total: status.total });
          
          if (status.status === 'completed' || status.status === 'failed') {
            clearInterval(pollInterval);
            
            queryClient.invalidateQueries({ queryKey: ['/api/admin/words', authToken, userLanguage] });
            
            if (status.failedCount > 0) {
              toast({
                title: "Some images failed",
                description: `${status.successCount} succeeded, ${status.failedCount} failed`,
                variant: "destructive",
              });
            } else {
              toast({
                title: "Images regenerated",
                description: `Successfully regenerated ${status.successCount} selected images`,
              });
            }
            
            setImageCacheBuster(Date.now());
            setSelectedIds(new Set());
            setIsRegeneratingSelected(false);
            setSelectedProgress({ current: 0, total: 0 });
          }
        } catch (error) {
          console.error("Error polling batch status:", error);
          clearInterval(pollInterval);
          setIsRegeneratingSelected(false);
          setSelectedProgress({ current: 0, total: 0 });
        }
      }, 1500);
      
    } catch (error) {
      console.error("Error regenerating selected images:", error);
      toast({
        title: "Error",
        description: "Failed to start batch regeneration",
        variant: "destructive",
      });
      setIsRegeneratingSelected(false);
      setSelectedProgress({ current: 0, total: 0 });
    }
  }, [authToken, selectedIds, queryClient, userLanguage, toast]);

  const handlePlayAudio = useCallback(async (word: AdminWord) => {
    if (playingAudioId === word.id) {
      audioRef.current?.pause();
      setPlayingAudioId(null);
      return;
    }

    try {
      let audioUrl = word.audioUrl;
      
      if (!audioUrl) {
        setLoadingAudioId(word.id);
        audioUrl = await generateAudio(word.id);
        queryClient.invalidateQueries({ queryKey: ['/api/admin/words', authToken, userLanguage] });
      }

      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      audio.onended = () => setPlayingAudioId(null);
      audio.onerror = () => setPlayingAudioId(null);
      
      await audio.play();
      setPlayingAudioId(word.id);
    } catch (error) {
      console.error("Failed to play audio:", error);
    } finally {
      setLoadingAudioId(null);
    }
  }, [playingAudioId, authToken, queryClient]);

  const handleOpenSettings = useCallback(() => {
    setDefaultPrompt(settings?.defaultImagePrompt || "");
    setShowSettings(true);
    setSettingsSaved(false);
    setSettingsError(null);
  }, [settings]);

  const handleSaveSettings = useCallback(async () => {
    if (!authToken) return;
    
    if (!defaultPrompt.includes("{word}")) {
      setSettingsError("Prompt must contain {word} placeholder");
      return;
    }
    
    setIsSavingSettings(true);
    setSettingsError(null);
    try {
      await updateSettings(authToken, defaultPrompt);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings', authToken] });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSettingsError("Failed to save settings. Please try again.");
    } finally {
      setIsSavingSettings(false);
    }
  }, [authToken, defaultPrompt, queryClient]);

  const handleLogin = useCallback(async () => {
    setIsLoggingIn(true);
    setAuthError(false);
    
    const result = await verifyPassword(password);
    if (result.success && result.token) {
      setAuthToken(result.token);
      setIsAuthenticated(true);
    } else {
      setAuthError(true);
    }
    setIsLoggingIn(false);
  }, [password]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  }, [handleLogin]);

  const handleRegenerateImage = useCallback(async () => {
    if (!editingWord || !authToken) return;
    
    setIsRegenerating(true);
    try {
      await regenerateImage(editingWord.id, authToken, customPrompt || undefined);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/words', authToken, userLanguage] });
      setImageCacheBuster(Date.now());
      setEditingWord(null);
      setCustomPrompt("");
    } catch (error) {
      console.error("Failed to regenerate image:", error);
    } finally {
      setIsRegenerating(false);
    }
  }, [editingWord, customPrompt, queryClient, authToken]);

  const handleBatchGenerate = useCallback(async () => {
    if (!authToken) return;
    
    setIsBatchGenerating(true);
    setBatchErrors([]);
    
    try {
      const wordsWithoutImages = await fetchWordsWithoutImagesAuth(authToken, userLanguage);
      setBatchProgress({ current: 0, total: wordsWithoutImages.length });
      
      for (let i = 0; i < wordsWithoutImages.length; i++) {
        const word = wordsWithoutImages[i];
        try {
          await generateImage(word.id, authToken);
          setBatchProgress({ current: i + 1, total: wordsWithoutImages.length });
          setImageCacheBuster(Date.now());
          queryClient.invalidateQueries({ queryKey: ['/api/admin/words', authToken, userLanguage] });
        } catch (error) {
          setBatchErrors(prev => [...prev, `Failed: ${word.english}`]);
        }
        
        if (i < wordsWithoutImages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      console.error("Batch generation failed:", error);
    } finally {
      setIsBatchGenerating(false);
    }
  }, [queryClient, authToken, userLanguage]);

  const handleSyncVocabulary = useCallback(async () => {
    if (!authToken) return;
    
    setIsSyncingVocabulary(true);
    try {
      const response = await apiRequest("POST", "/api/admin/sync-vocabulary", {}, {
        headers: {
          "Authorization": `Bearer ${authToken}`,
        }
      });
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/words', authToken, userLanguage] });
      toast({
        title: "Vocabulary Synced",
        description: `Added ${data.addedRussian} Russian and ${data.addedSpanish} Spanish words.`,
      });
    } catch (error) {
      console.error("Failed to sync vocabulary:", error);
      toast({
        title: "Sync Failed",
        description: "Failed to sync vocabulary from data files.",
        variant: "destructive",
      });
    } finally {
      setIsSyncingVocabulary(false);
    }
  }, [authToken, queryClient, userLanguage, toast]);

  const handleDeleteImage = useCallback(async (wordId: string) => {
    if (!authToken) return;
    
    setDeletingImageId(wordId);
    try {
      await deleteImage(wordId, authToken);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/words', authToken, userLanguage] });
    } catch (error) {
      console.error("Failed to delete image:", error);
    } finally {
      setDeletingImageId(null);
    }
  }, [authToken, queryClient, userLanguage]);

  const handleSelectWord = useCallback((wordId: string, checked: boolean, shiftKey: boolean) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(wordId);
      } else {
        newSet.delete(wordId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback((checked: boolean, wordsToSelect: AdminWord[]) => {
    if (checked) {
      setSelectedIds(new Set(wordsToSelect.map(w => w.id)));
    } else {
      setSelectedIds(new Set());
    }
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, word: AdminWord) => {
    e.dataTransfer.effectAllowed = "move";
    
    const idsToMove = selectedIds.has(word.id) 
      ? Array.from(selectedIds)
      : [word.id];
    
    setDraggedIds(idsToMove);
    setIsDragging(true);
    
    e.dataTransfer.setData("text/plain", JSON.stringify(idsToMove));
  }, [selectedIds]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDraggedIds([]);
    setDropTargetIndex(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetIndex(index);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    
    if (!authToken || draggedIds.length === 0) return;
    
    try {
      await reorderWords(authToken, draggedIds, targetIndex);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/words', authToken, userLanguage] });
    } catch (error) {
      console.error("Failed to reorder words:", error);
    }
    
    handleDragEnd();
  }, [authToken, draggedIds, queryClient, handleDragEnd]);

  const wordsWithoutImages = words.filter(w => !w.imageUrl);
  const learnedWords = words.filter(w => w.isLearned);
  
  // Get unique categories and parts of speech for filters
  const uniqueCategories = useMemo(() => 
    Array.from(new Set(words.map(w => w.category).filter((c): c is string => c !== null))).sort(),
    [words]
  );
  const uniquePartsOfSpeech = useMemo(() => 
    Array.from(new Set(words.map(w => w.partOfSpeech).filter((p): p is string => p !== null))).sort(),
    [words]
  );
  
  // Apply filters
  const filteredWords = useMemo(() => words.filter(w => {
    if (filterCategory !== "all" && w.category !== filterCategory) return false;
    if (filterPartOfSpeech !== "all" && w.partOfSpeech !== filterPartOfSpeech) return false;
    if (filterLearned === "learned" && !w.isLearned) return false;
    if (filterLearned === "not_learned" && w.isLearned) return false;
    return true;
  }), [words, filterCategory, filterPartOfSpeech, filterLearned]);
  
  const allSelected = filteredWords.length > 0 && selectedIds.size === filteredWords.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filteredWords.length;

  const filteredViewWords = useMemo(() => viewWords.filter(w => {
    if (filterCategory !== "all" && w.category !== filterCategory) return false;
    if (filterLearned === "learned" && !w.isLearned) return false;
    if (filterLearned === "not_learned" && w.isLearned) return false;
    return true;
  }), [viewWords, filterCategory, filterLearned]);

  const viewCategories = useMemo(() => 
    Array.from(new Set(viewWords.map(w => w.category).filter((c): c is string => c !== null))).sort(),
    [viewWords]
  );

  const groupedViewWords = useMemo(() => {
    if (!groupByCategory) return null;
    const groups: Record<string, AdminWord[]> = {};
    for (const w of filteredViewWords) {
      const cat = w.category || "uncategorized";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(w);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredViewWords, groupByCategory]);

  const languageUsers = useMemo(() => 
    allUsers.filter(u => u.language === userLanguage),
    [allUsers, userLanguage]
  );

  const duplicateGroups = useMemo(() => {
    const map = new Map<string, AdminWord[]>();
    for (const w of words) {
      const key = w.targetWord.trim().toLowerCase();
      const arr = map.get(key) || [];
      arr.push(w);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .filter(([, group]) => group.length > 1)
      .sort(([a], [b]) => a.localeCompare(b));
  }, [words]);

  const handleRemoveDuplicates = useCallback(async () => {
    if (!authToken || duplicateGroups.length === 0) return;
    setIsRemovingDuplicates(true);
    let removed = 0;
    try {
      for (const [, group] of duplicateGroups) {
        const sorted = [...group].sort((a, b) => {
          if (a.imageUrl && !b.imageUrl) return -1;
          if (!a.imageUrl && b.imageUrl) return 1;
          if (a.audioUrl && !b.audioUrl) return -1;
          if (!a.audioUrl && b.audioUrl) return 1;
          return a.displayOrder - b.displayOrder;
        });
        for (let i = 1; i < sorted.length; i++) {
          await deleteWord(sorted[i].id, authToken);
          removed++;
        }
      }
      toast({
        title: "Duplicates removed",
        description: `Deleted ${removed} duplicate word${removed !== 1 ? "s" : ""}, keeping entries with images/audio.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/words', authToken, userLanguage] });
      setShowDuplicates(false);
    } catch (error) {
      console.error("Error removing duplicates:", error);
      toast({
        title: "Error",
        description: "Failed to remove some duplicates",
        variant: "destructive",
      });
    } finally {
      setIsRemovingDuplicates(false);
    }
  }, [authToken, duplicateGroups, queryClient, userLanguage, toast]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-sm p-8">
          <div className="flex flex-col items-center gap-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Parent Access</h1>
            
            <div className="w-full space-y-4">
              <Input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                data-testid="input-admin-password"
              />
              {authError && (
                <p className="text-sm text-destructive text-center">
                  Incorrect password
                </p>
              )}
              <Button
                className="w-full"
                onClick={handleLogin}
                disabled={isLoggingIn || !password}
                data-testid="button-admin-login"
              >
                {isLoggingIn ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Login"
                )}
              </Button>
            </div>
            
            <Link href="/">
              <Button variant="ghost" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to App
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background border-b px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button size="icon" variant="ghost" data-testid="button-admin-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold">{languageLabel} Admin</h1>
            <div className="flex gap-1 bg-muted p-1 rounded-lg">
              <Button
                variant={activeTab === "vocabulary" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("vocabulary")}
                className="gap-2"
                data-testid="tab-vocabulary"
              >
                <BookOpen className="w-4 h-4" />
                Vocabulary
              </Button>
              <Button
                variant={activeTab === "stories" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("stories")}
                className="gap-2"
                data-testid="tab-stories"
              >
                <Library className="w-4 h-4" />
                Stories
              </Button>
              <Button
                variant={activeTab === "view" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("view")}
                className="gap-2"
                data-testid="tab-view"
              >
                <LayoutGrid className="w-4 h-4" />
                View
              </Button>
              <Button
                variant={activeTab === "dictionary" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("dictionary")}
                className="gap-2"
                data-testid="tab-dictionary"
              >
                <Database className="w-4 h-4" />
                Dictionary
              </Button>
              <Button
                variant={activeTab === "curated" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("curated")}
                className="gap-2"
                data-testid="tab-curated"
              >
                <Sparkles className="w-4 h-4" />
                Curated
              </Button>
              <Button
                variant={activeTab === "curriculum" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("curriculum")}
                className="gap-2"
                data-testid="tab-curriculum"
              >
                <ListTree className="w-4 h-4" />
                Curriculum
              </Button>
            </div>
          </div>
          
          {activeTab === "vocabulary" && (
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex gap-3">
                <Badge variant="secondary" className="gap-1">
                  <BookOpen className="w-3 h-3" />
                  {learnedWords.length} learned
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Image className="w-3 h-3" />
                  {wordsWithoutImages.length} need images
                </Badge>
                {selectedIds.size > 0 && (
                  <Badge variant="default" className="gap-1">
                    {selectedIds.size} selected
                  </Badge>
                )}
              </div>
              
              {selectedIds.size > 0 && (
                <Button
                  variant="default"
                  onClick={handleRegenerateSelected}
                  disabled={isRegeneratingSelected}
                  className="gap-2"
                  data-testid="button-regenerate-selected"
                >
                  {isRegeneratingSelected ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {selectedProgress.current}/{selectedProgress.total}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Regenerate {selectedIds.size} Selected
                    </>
                  )}
                </Button>
              )}
              
              <Button
                variant="outline"
                onClick={handleSyncVocabulary}
                disabled={isSyncingVocabulary}
                className="gap-2"
                data-testid="button-sync-vocabulary"
              >
                {isSyncingVocabulary ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Database className="w-4 h-4" />
                )}
                Sync Vocabulary
              </Button>
              
              <Button
                variant="outline"
                onClick={() => setShowDuplicates(true)}
                className="gap-2"
                data-testid="button-find-duplicates"
              >
                <Layers className="w-4 h-4" />
                Duplicates{duplicateGroups.length > 0 ? ` (${duplicateGroups.length})` : ""}
              </Button>
              
              <Button
                variant="outline"
                onClick={handleOpenSettings}
                className="gap-2"
                data-testid="button-open-settings"
              >
                <Settings className="w-4 h-4" />
                Settings
              </Button>
              
              <Button
                onClick={handleBatchGenerate}
                disabled={isBatchGenerating || wordsWithoutImages.length === 0}
                className="gap-2"
                data-testid="button-generate-all-images"
              >
                {isBatchGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {batchProgress.current}/{batchProgress.total}
                  </>
                ) : (
                  <>
                    <ImagePlus className="w-4 h-4" />
                    Generate All Images
                  </>
                )}
              </Button>
              
              {missingImagesCount > 0 && (
                <Button
                  variant="secondary"
                  onClick={handleRegenerateMissingImages}
                  disabled={isRegeneratingMissing}
                  className="gap-2"
                  data-testid="button-regenerate-missing-images"
                >
                  {isRegeneratingMissing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {missingProgress.current}/{missingProgress.total}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Fix {missingImagesCount} Expired
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-4">
        {activeTab === "stories" && authToken && userLanguage && (
          <StoryDesigner authToken={authToken} userLanguage={userLanguage} />
        )}

        {activeTab === "dictionary" && authToken && userLanguage && (
          <FrequencyDictionaryTab authToken={authToken} language={userLanguage} />
        )}

        {activeTab === "curated" && authToken && userLanguage && (
          <CuratedWordsTab authToken={authToken} language={userLanguage} />
        )}

        {activeTab === "curriculum" && authToken && userLanguage && (
          <CurriculumTab authToken={authToken} language={userLanguage} />
        )}

        {activeTab === "view" && (() => {
          const renderFlashcardGrid = (wordsToRender: AdminWord[]) => (
            <div className="flex flex-wrap gap-2">
              {wordsToRender.map((word, index) => (
                <div
                  key={word.id}
                  className="w-16 cursor-pointer transition-transform duration-150 hover:scale-110 hover:z-10 relative"
                  draggable
                  onDragStart={(e) => handleDragStart(e, word)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onClick={() => {
                    setEditingWord(word);
                    setCustomPrompt("");
                  }}
                  data-testid={`flashcard-${word.id}`}
                >
                  <div className={`rounded overflow-hidden border ${viewStudentId !== "none" && word.isLearned ? 'border-green-500 border-2' : viewStudentId !== "none" && !word.isLearned ? 'border-red-400/50' : 'border-border'} ${draggedIds.includes(word.id) ? 'opacity-40' : ''} ${dropTargetIndex === index ? 'ring-2 ring-primary' : ''}`}>
                    <div className="aspect-square bg-muted/30 flex items-center justify-center">
                      {word.imageUrl ? (
                        <img
                          src={`${word.imageUrl}?t=${imageCacheBuster}`}
                          alt={word.english}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Image className="w-5 h-5 text-muted-foreground/30" />
                      )}
                    </div>
                    <div className="px-0.5 py-0.5 text-center">
                      <p className="font-bold text-[10px] leading-tight truncate" data-testid={`flashcard-target-${word.id}`}>
                        {word.targetWord}
                      </p>
                    </div>
                  </div>
                  <span className="absolute top-0 left-0.5 text-[7px] text-muted-foreground/60 font-mono leading-none">
                    {word.displayOrder + 1}
                  </span>
                </div>
              ))}
            </div>
          );

          return (
            <>
              <div className="flex items-center gap-4 flex-wrap bg-muted/30 p-3 rounded-lg">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Filters:</span>
                </div>
                <Select value={viewStudentId} onValueChange={setViewStudentId}>
                  <SelectTrigger className="w-44" data-testid="view-filter-student">
                    <div className="flex items-center gap-2">
                      <Users className="w-3 h-3" />
                      <SelectValue placeholder="Student" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Student</SelectItem>
                    {languageUsers.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-40" data-testid="view-filter-category">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {viewCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {viewStudentId !== "none" && (
                  <Select value={filterLearned} onValueChange={setFilterLearned}>
                    <SelectTrigger className="w-40" data-testid="view-filter-learned">
                      <SelectValue placeholder="Learning Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Words</SelectItem>
                      <SelectItem value="learned">Learned</SelectItem>
                      <SelectItem value="not_learned">Not Learned</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <Button
                  variant={groupByCategory ? "default" : "outline"}
                  size="sm"
                  onClick={() => setGroupByCategory(!groupByCategory)}
                  className="gap-2"
                  data-testid="button-group-by-category"
                >
                  <Layers className="w-4 h-4" />
                  Group
                </Button>
                <Badge variant="secondary" className="ml-auto">
                  {filteredViewWords.length} of {viewWords.length} words
                </Badge>
              </div>

              {isViewLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : groupByCategory && groupedViewWords ? (
                <div className="space-y-6">
                  {groupedViewWords.map(([category, catWords]) => (
                    <div key={category}>
                      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-2 border-b pb-1">
                        {category} <span className="font-normal text-xs">({catWords.length})</span>
                      </h3>
                      {renderFlashcardGrid(catWords)}
                    </div>
                  ))}
                </div>
              ) : (
                renderFlashcardGrid(filteredViewWords)
              )}
            </>
          );
        })()}

        {activeTab === "vocabulary" && (
        <>
        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap bg-muted/30 p-3 rounded-lg">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-40" data-testid="filter-category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {uniqueCategories.map(cat => (
                <SelectItem key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={filterPartOfSpeech} onValueChange={setFilterPartOfSpeech}>
            <SelectTrigger className="w-40" data-testid="filter-part-of-speech">
              <SelectValue placeholder="Part of Speech" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {uniquePartsOfSpeech.map(pos => (
                <SelectItem key={pos} value={pos}>
                  {pos.charAt(0).toUpperCase() + pos.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={filterLearned} onValueChange={setFilterLearned}>
            <SelectTrigger className="w-40" data-testid="filter-learned">
              <SelectValue placeholder="Learning Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Words</SelectItem>
              <SelectItem value="learned">Learned</SelectItem>
              <SelectItem value="not_learned">Not Learned</SelectItem>
            </SelectContent>
          </Select>
          
          <Badge variant="secondary" className="ml-auto">
            {filteredWords.length} of {words.length} words
          </Badge>
        </div>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="w-10 p-3">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(checked) => handleSelectAll(!!checked, filteredWords)}
                        className={someSelected ? "opacity-50" : ""}
                        data-testid="checkbox-select-all"
                      />
                    </th>
                    <th className="w-8 p-3"></th>
                    <th className="w-20 p-3 text-left text-xs font-medium text-muted-foreground uppercase">Image</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">Word</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">English</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">Category</th>
                    <th className="w-16 p-3 text-center text-xs font-medium text-muted-foreground uppercase">Audio</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">Learned</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">Last Review</th>
                    <th className="w-20 p-3 text-center text-xs font-medium text-muted-foreground uppercase">Reviews</th>
                    <th className="w-16 p-3 text-center text-xs font-medium text-muted-foreground uppercase">Order</th>
                    <th className="w-16 p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWords.map((word, index) => {
                    const isSelected = selectedIds.has(word.id);
                    const isBeingDragged = draggedIds.includes(word.id);
                    const isDropTarget = dropTargetIndex === index;
                    
                    return (
                      <tr
                        key={word.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, word)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        className={`
                          border-b transition-colors
                          ${isSelected ? "bg-primary/5" : "hover:bg-muted/50"}
                          ${isBeingDragged ? "opacity-50" : ""}
                          ${isDropTarget ? "border-t-2 border-t-primary" : ""}
                        `}
                        data-testid={`row-word-${word.id}`}
                      >
                        <td className="p-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => handleSelectWord(word.id, !!checked, false)}
                            data-testid={`checkbox-word-${word.id}`}
                          />
                        </td>
                        <td className="p-3 cursor-grab active:cursor-grabbing">
                          <GripVertical className="w-4 h-4 text-muted-foreground" />
                        </td>
                        <td className="p-3">
                          <div className="w-16 h-16 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                            {word.imageUrl ? (
                              <img 
                                src={`${word.imageUrl}?t=${imageCacheBuster}`} 
                                alt={word.english}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Image className="w-6 h-6 text-muted-foreground" />
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="font-bold text-lg">{word.targetWord}</span>
                        </td>
                        <td className="p-3">
                          <span className="text-muted-foreground">{word.english}</span>
                        </td>
                        <td className="p-3">
                          {word.category && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {word.category}
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handlePlayAudio(word)}
                            disabled={loadingAudioId === word.id}
                            data-testid={`button-audio-${word.id}`}
                          >
                            {loadingAudioId === word.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : playingAudioId === word.id ? (
                              <Volume2 className="w-4 h-4 text-primary animate-pulse" />
                            ) : (
                              <Volume2 className="w-4 h-4" />
                            )}
                          </Button>
                        </td>
                        <td className="p-3">
                          {word.isLearned ? (
                            <Badge variant="default" className="gap-1 text-xs">
                              <Check className="w-3 h-3" />
                              Learned
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-xs">
                              <X className="w-3 h-3" />
                              New
                            </Badge>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {formatDate(word.learnedAt)}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <RotateCcw className="w-3 h-3" />
                            {formatDateTime(word.lastReviewDate)}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span className="text-sm font-medium">{word.reviewCount}</span>
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant="outline" className="text-xs">
                            #{word.displayOrder + 1}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setEditingWord(word);
                                setCustomPrompt("");
                              }}
                              data-testid={`button-edit-${word.id}`}
                            >
                              <Edit3 className="w-4 h-4" />
                            </Button>
                            {word.imageUrl && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteImage(word.id)}
                                disabled={deletingImageId === word.id}
                                data-testid={`button-delete-image-${word.id}`}
                              >
                                {deletingImageId === word.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                )}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </>
        )}
      </main>

      <Dialog open={!!editingWord} onOpenChange={() => setEditingWord(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit Image: {editingWord?.targetWord} ({editingWord?.english})
            </DialogTitle>
            <DialogDescription>
              Customize the image generation prompt for this word
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {editingWord?.imageUrl && (
              <div className="rounded-lg overflow-hidden">
                <img 
                  src={`${editingWord.imageUrl}?t=${imageCacheBuster}`} 
                  alt={editingWord.english}
                  className="w-full h-48 object-cover"
                />
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Custom Prompt (optional)
              </label>
              <Textarea
                placeholder={`e.g., "A cute cartoon cat playing with yarn, pastel colors, child-friendly style"`}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={3}
                data-testid="input-custom-prompt"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to use the default prompt for "{editingWord?.english}"
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingWord(null)}
              disabled={isRegenerating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRegenerateImage}
              disabled={isRegenerating}
              className="gap-2"
              data-testid="button-regenerate-confirm"
            >
              {isRegenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Regenerate Image
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {batchErrors.length > 0 && (
        <div className="fixed bottom-4 right-4 max-w-sm">
          <Card className="p-4">
            <p className="font-semibold mb-2">Some images failed:</p>
            <ul className="text-sm text-muted-foreground">
              {batchErrors.slice(0, 5).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {batchErrors.length > 5 && (
                <li>...and {batchErrors.length - 5} more</li>
              )}
            </ul>
          </Card>
        </div>
      )}

      <Dialog open={showDuplicates} onOpenChange={setShowDuplicates}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Duplicate {languageLabel} Words Report
            </DialogTitle>
            <DialogDescription>
              {duplicateGroups.length === 0
                ? "No duplicate words found."
                : `Found ${duplicateGroups.length} word${duplicateGroups.length > 1 ? "s" : ""} with duplicates (${duplicateGroups.reduce((sum, [, g]) => sum + g.length, 0)} total entries).`}
            </DialogDescription>
          </DialogHeader>

          {duplicateGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-duplicates">
              <Check className="w-12 h-12 mx-auto mb-3 text-green-500" />
              <p className="font-medium">All clear! No duplicate words detected.</p>
            </div>
          ) : (
            <div className="space-y-4" data-testid="duplicates-list">
              {duplicateGroups.map(([key, group]) => (
                <div key={key} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="text-sm">
                      {group.length}x
                    </Badge>
                    <span className="font-bold text-lg">{group[0].targetWord}</span>
                  </div>
                  <div className="space-y-1 ml-2">
                    {group.map((w) => (
                      <div key={w.id} className="flex items-center gap-3 text-sm bg-muted/50 rounded px-2 py-1.5" data-testid={`duplicate-entry-${w.id}`}>
                        <span className="text-muted-foreground font-mono text-xs">ID: {w.id}</span>
                        <span className="font-medium">{w.targetWord}</span>
                        <span className="text-muted-foreground">= {w.english}</span>
                        {w.category && (
                          <Badge variant="outline" className="text-xs">{w.category}</Badge>
                        )}
                        <span className="text-muted-foreground text-xs">#{w.displayOrder}</span>
                        {w.imageUrl && <Image className="w-3 h-3 text-green-500" />}
                        {w.audioUrl && <Volume2 className="w-3 h-3 text-green-500" />}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowDuplicates(false)} data-testid="button-close-duplicates">
              Close
            </Button>
            {duplicateGroups.length > 0 && (
              <Button
                variant="destructive"
                onClick={handleRemoveDuplicates}
                disabled={isRemovingDuplicates}
                className="gap-2"
                data-testid="button-remove-duplicates"
              >
                {isRemovingDuplicates ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Removing...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Remove All Duplicates
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Image Generation Settings
            </DialogTitle>
            <DialogDescription>
              Configure the default prompt template for AI image generation
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Default Image Prompt Template
              </label>
              <Textarea
                placeholder="Enter the default prompt template..."
                value={defaultPrompt}
                onChange={(e) => setDefaultPrompt(e.target.value)}
                rows={5}
                className="font-mono text-sm"
                data-testid="input-default-prompt"
              />
              <p className="text-xs text-muted-foreground">
                Use <code className="bg-muted px-1 rounded">{"{word}"}</code> as a placeholder for the English word. 
                For example: "A cute cartoon {"{word}"} for children"
              </p>
            </div>
            
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs font-medium mb-1 text-muted-foreground">Preview with "cat":</p>
              <p className="text-sm">
                {defaultPrompt.replace(/{word}/g, "cat") || "(Enter a prompt to see preview)"}
              </p>
            </div>
            
            {settingsError && (
              <p className="text-sm text-destructive">{settingsError}</p>
            )}
            
            {!defaultPrompt.includes("{word}") && defaultPrompt.length > 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Warning: Your prompt must include {"{word}"} placeholder for the English word to be inserted.
              </p>
            )}
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSettings(false)}
              disabled={isSavingSettings}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveSettings}
              disabled={isSavingSettings || !defaultPrompt.trim()}
              className="gap-2"
              data-testid="button-save-settings"
            >
              {isSavingSettings ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : settingsSaved ? (
                <>
                  <Check className="w-4 h-4" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Settings
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
