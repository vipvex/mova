import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronRight, Check, ListTree, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/contexts/UserContext";
import { fetchUserCurriculum, type UserCurriculum, type UserCurriculumSubtheme } from "@/lib/api";

// Static Tailwind class maps keyed by the curriculum phase `color` stem.
// (Tailwind can't see dynamically-built class strings, so we map explicitly.)
const PHASE_STYLES: Record<string, { dot: string; bar: string; text: string }> = {
  stone: { dot: "bg-stone-400", bar: "bg-stone-400", text: "text-stone-600 dark:text-stone-300" },
  amber: { dot: "bg-amber-400", bar: "bg-amber-400", text: "text-amber-600 dark:text-amber-300" },
  orange: { dot: "bg-orange-400", bar: "bg-orange-400", text: "text-orange-600 dark:text-orange-300" },
  emerald: { dot: "bg-emerald-400", bar: "bg-emerald-400", text: "text-emerald-600 dark:text-emerald-300" },
  teal: { dot: "bg-teal-400", bar: "bg-teal-400", text: "text-teal-600 dark:text-teal-300" },
  sky: { dot: "bg-sky-400", bar: "bg-sky-400", text: "text-sky-600 dark:text-sky-300" },
  indigo: { dot: "bg-indigo-400", bar: "bg-indigo-400", text: "text-indigo-600 dark:text-indigo-300" },
  violet: { dot: "bg-violet-400", bar: "bg-violet-400", text: "text-violet-600 dark:text-violet-300" },
};

function styleFor(color: string) {
  return PHASE_STYLES[color] ?? PHASE_STYLES.sky;
}

function ProgressBar({ learned, total, barClass }: { learned: number; total: number; barClass: string }) {
  const pct = total > 0 ? Math.round((learned / total) * 100) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${barClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function CategoryCard({
  subtheme,
  color,
}: {
  subtheme: UserCurriculumSubtheme;
  color: string;
}) {
  const [open, setOpen] = useState(false);
  const s = styleFor(color);

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-4 text-left hover-elevate"
        data-testid={`button-category-${subtheme.name}`}
      >
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold truncate">{subtheme.name}</span>
            <span className="text-sm font-medium text-muted-foreground shrink-0">
              {subtheme.learnedWords} / {subtheme.totalWords}
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar learned={subtheme.learnedWords} total={subtheme.totalWords} barClass={s.bar} />
          </div>
        </div>
        {open ? (
          <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t divide-y">
          {subtheme.words.map((w) => (
            <div
              key={w.word}
              className="flex items-center gap-3 px-4 py-2.5"
              data-testid={`row-word-${w.word}`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  w.isLearned ? s.bar : "bg-muted"
                }`}
              >
                {w.isLearned && <Check className="w-3 h-3 text-white" />}
              </span>
              <div className="flex-1 min-w-0">
                <span className="font-medium">{w.word}</span>
                <span className="text-muted-foreground"> — {w.english}</span>
              </div>
              <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                <RefreshCw className="w-3 h-3" />
                {w.reviewCount}×
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Curriculum() {
  const { currentUser } = useUser();
  const userId = currentUser?.id ?? "";

  const { data, isLoading, isError } = useQuery<UserCurriculum>({
    queryKey: ["/api/users", userId, "curriculum"],
    queryFn: () => fetchUserCurriculum(userId),
    enabled: !!userId,
  });

  return (
    <div className="min-h-screen py-6">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex items-center gap-3 mb-5">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-9 w-9" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <ListTree className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Curriculum</h1>
          </div>
        </div>

        <p className="text-muted-foreground mb-6">
          The categories of words you'll learn, and how far you've come in each. Tap a category to
          see every word and how many times you've reviewed it.
        </p>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {isError && (
          <p className="text-center text-muted-foreground py-16">
            Couldn't load the curriculum. Please try again later.
          </p>
        )}

        {data && (
          <div className="flex flex-col gap-8">
            {data.phases.map((phase) => {
              const s = styleFor(phase.color);
              return (
                <section key={phase.phase} data-testid={`phase-${phase.phase}`}>
                  <div className="mb-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className={`text-lg font-bold flex items-center gap-2 ${s.text}`}>
                        <span className={`w-3 h-3 rounded-full ${s.dot}`} />
                        {phase.name}
                      </h2>
                      <span className="text-sm font-medium text-muted-foreground">
                        {phase.learnedWords} / {phase.totalWords} learned
                      </span>
                    </div>
                    {phase.goal && (
                      <p className="text-sm text-muted-foreground mt-1 ml-5">{phase.goal}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-3">
                    {phase.subthemes.map((sub) => (
                      <CategoryCard key={sub.name} subtheme={sub} color={phase.color} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
