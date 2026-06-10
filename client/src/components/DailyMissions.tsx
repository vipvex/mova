import { CheckCircle2, GraduationCap, RefreshCw, Sparkles, Lock, Target, Gamepad2 } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { DailyMissions as DailyMissionsData } from "@/lib/api";

interface DailyMissionsProps {
  missions: DailyMissionsData;
  disabled?: boolean;
  /**
   * Whether the user has built up enough vocabulary (5+ words) to make the
   * catch/review missions worthwhile. Until then, only the "Learn new words"
   * mission is shown (and enabled) — there's too little to catch, review, or
   * revise yet, so learning is the clear first step.
   */
  hasLearnedWords?: boolean;
  onWordCatch: () => void;
  onReviewOld: () => void;
  onLearnNew: () => void;
  onReviewNew: () => void;
}

type MissionKey = "wordCatch" | "reviewOld" | "learnNew" | "reviewNew";

interface MissionTileSpec {
  key: MissionKey;
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
}

export default function DailyMissions({
  missions,
  disabled = false,
  hasLearnedWords = true,
  onWordCatch,
  onReviewOld,
  onLearnNew,
  onReviewNew,
}: DailyMissionsProps) {
  const allTiles: MissionTileSpec[] = [
    {
      key: "wordCatch",
      title: "Play Word Catcher",
      icon: <Gamepad2 className="w-7 h-7" />,
      onClick: onWordCatch,
    },
    {
      key: "reviewOld",
      title: "Review old words",
      icon: <RefreshCw className="w-6 h-6" />,
      onClick: onReviewOld,
    },
    {
      key: "learnNew",
      title: "Learn new words",
      icon: <GraduationCap className="w-7 h-7" />,
      onClick: onLearnNew,
    },
    {
      key: "reviewNew",
      title: "Review today's new words",
      icon: <Sparkles className="w-6 h-6" />,
      onClick: onReviewNew,
    },
  ];

  // Before the user has learned 5+ words, the catch/review missions have too
  // little to act on — show only "Learn new words" so it's the clear first step.
  const tiles = hasLearnedWords
    ? allTiles
    : allTiles.filter(t => t.key === "learnNew");

  // Sequential lock: a tile is locked if any earlier tile is not yet complete.
  let firstIncompleteIdx = tiles.findIndex(t => !isComplete(missions[t.key]));
  if (firstIncompleteIdx === -1) firstIncompleteIdx = tiles.length;
  const allDone = firstIncompleteIdx === tiles.length;
  const totalCompleted = tiles.reduce(
    (sum, t) => sum + Math.min(missions[t.key].completed, missions[t.key].target),
    0,
  );
  const totalTarget = tiles.reduce((sum, t) => sum + missions[t.key].target, 0);
  const overallPct = totalTarget > 0 ? (totalCompleted / totalTarget) * 100 : 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full"
      data-testid="daily-missions"
    >
      <div
        className={
          "relative rounded-3xl p-[2px] shadow-lg " +
          (allDone
            ? "bg-gradient-to-br from-emerald-400 via-green-500 to-teal-500"
            : "bg-gradient-to-br from-indigo-400 via-violet-500 to-fuchsia-500")
        }
      >
        <div className="rounded-[1.4rem] bg-background/95 dark:bg-background/90 p-4 sm:p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div
                className={
                  "w-9 h-9 rounded-full flex items-center justify-center " +
                  (allDone
                    ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300"
                    : "bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300")
                }
              >
                <Target className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <h2 className="text-base font-bold leading-tight">Daily Missions</h2>
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {allDone ? "All done — great job!" : "Complete in order"}
                </span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-muted text-sm font-bold tabular-nums">
              {totalCompleted}/{totalTarget}
            </span>
          </div>

          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              className={
                allDone
                  ? "h-full bg-gradient-to-r from-emerald-400 to-teal-500"
                  : "h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500"
              }
              initial={{ width: 0 }}
              animate={{ width: `${overallPct}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>

          <div className="flex flex-col gap-2.5 pt-1">
            {tiles.map((tile, idx) => {
              const m = missions[tile.key];
              const done = isComplete(m);
              // Mission 4 ("Review today's new words") is always unlocked — the kid can
              // dip in any time; the handler shows nothing if there are no words to review.
              const locked = tile.key === 'reviewNew' ? false : !done && idx > firstIncompleteIdx;
              return (
                <MissionTile
                  key={tile.key}
                  title={tile.title}
                  icon={tile.icon}
                  completed={m.completed}
                  target={m.target}
                  done={done}
                  locked={locked}
                  disabled={disabled}
                  onClick={tile.onClick}
                  testId={`mission-${tile.key}`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function isComplete(m: { completed: number; target: number }) {
  return m.completed >= m.target;
}

interface MissionTileProps {
  title: string;
  icon: React.ReactNode;
  completed: number;
  target: number;
  done: boolean;
  locked: boolean;
  disabled: boolean;
  onClick: () => void;
  testId: string;
}

function MissionTile({
  title,
  icon,
  completed,
  target,
  done,
  locked,
  disabled,
  onClick,
  testId,
}: MissionTileProps) {
  const cappedCompleted = Math.min(completed, target);
  const pct = target > 0 ? Math.min(100, (cappedCompleted / target) * 100) : 0;

  const buttonClass = done
    ? "w-full min-h-16 text-lg font-bold rounded-2xl gap-3 bg-muted text-muted-foreground hover:bg-muted cursor-default"
    : locked
    ? "w-full min-h-16 text-lg font-bold rounded-2xl gap-3 bg-muted/60 text-muted-foreground/70 cursor-not-allowed"
    : "w-full min-h-16 text-lg font-bold rounded-2xl gap-3";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="relative"
    >
      <Button
        size="lg"
        variant={done ? "secondary" : locked ? "secondary" : "default"}
        className={buttonClass}
        onClick={done || locked ? undefined : onClick}
        disabled={disabled || locked}
        aria-disabled={done || locked || disabled}
        data-testid={testId}
      >
        {done ? <CheckCircle2 className="w-7 h-7 text-emerald-500" /> : locked ? <Lock className="w-6 h-6" /> : icon}
        <span className={done ? "line-through" : ""}>{title}</span>
        <span
          className={
            "ml-auto px-2 py-0.5 rounded-full text-base tabular-nums " +
            (done
              ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              : locked
              ? "bg-muted text-muted-foreground"
              : "bg-white/20")
          }
        >
          {cappedCompleted}/{target}
        </span>
      </Button>
      {!done && (
        <div className="absolute left-3 right-3 bottom-1.5 h-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden pointer-events-none">
          <motion.div
            className={locked ? "h-full bg-muted-foreground/40" : "h-full bg-emerald-500"}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
      )}
    </motion.div>
  );
}
