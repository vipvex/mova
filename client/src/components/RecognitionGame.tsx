import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { type VocabularyWord, type Language } from "@/lib/api";
import {
  playSuccessChime,
  playErrorBuzz,
  playGameStart,
  playRecognitionTick,
  playRecognitionTimeout,
  playConfettiPop,
} from "@/lib/sounds";

interface RecognitionGameProps {
  targetWord: VocabularyWord;
  distractors: VocabularyWord[];   // already shuffled, up to 5
  language: Language;
  onComplete: () => void;
  onSkip: () => void;
}

const GAME_DURATION = 8; // seconds

const REACTION_LABELS = [
  { max: 1.0, label: "⚡ Lightning Fast!" },
  { max: 2.0, label: "🚀 Super Quick!" },
  { max: 3.5, label: "👍 Nice Job!" },
  { max: 6.0, label: "😊 Good Find!" },
  { max: Infinity, label: "🎉 You got it!" },
];

interface ConfettiParticle {
  id: number;
  x: number; y: number;
  vx: number; vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
}

let confettiId = 0;

function burst(x: number, y: number, n = 40): ConfettiParticle[] {
  const colors = ["#fbbf24", "#34d399", "#f472b6", "#60a5fa", "#a78bfa", "#fb923c"];
  return Array.from({ length: n }, (_, i) => {
    const angle = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.8;
    const speed = 120 + Math.random() * 220;
    return {
      id: confettiId++,
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 80,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 6 + Math.random() * 8,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 720,
    };
  });
}

export default function RecognitionGame({
  targetWord,
  distractors,
  language,
  onComplete,
  onSkip,
}: RecognitionGameProps) {
  // Build grid: target + distractors, shuffled
  const [grid] = useState<VocabularyWord[]>(() => {
    const all = [targetWord, ...distractors].slice(0, 6);
    // Fisher-Yates shuffle
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all;
  });

  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [phase, setPhase] = useState<"countdown" | "playing" | "correct" | "timeout">("countdown");
  const [wrongCells, setWrongCells] = useState<Set<string>>(new Set());
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const [confetti, setConfetti] = useState<ConfettiParticle[]>([]);
  const [correctCellId, setCorrectCellId] = useState<string | null>(null);

  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const confettiRef = useRef<ConfettiParticle[]>([]);
  const rafRef = useRef<number>(0);
  const lastRafRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // 3-2-1 countdown then start
  const [countdown, setCountdown] = useState(3);
  useEffect(() => {
    playGameStart();
    const t = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(t);
          setPhase("playing");
          startTimeRef.current = Date.now();
          return 0;
        }
        return prev - 1;
      });
    }, 700);
    return () => clearInterval(t);
  }, []);

  // Timer while playing
  useEffect(() => {
    if (phase !== "playing") return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setPhase("timeout");
          playRecognitionTimeout();
          setTimeout(onComplete, 2200);
          return 0;
        }
        if (prev <= 4) playRecognitionTick();
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // Confetti animation loop
  useEffect(() => {
    if (phase !== "correct") return;
    const animate = (ts: number) => {
      const delta = lastRafRef.current ? Math.min((ts - lastRafRef.current) / 1000, 0.05) : 0.016;
      lastRafRef.current = ts;
      confettiRef.current = confettiRef.current
        .map(p => ({
          ...p,
          x: p.x + p.vx * delta,
          y: p.y + p.vy * delta,
          vy: p.vy + 400 * delta,
          rotation: p.rotation + p.rotationSpeed * delta,
        }))
        .filter(p => p.y < window.innerHeight + 100);
      setConfetti([...confettiRef.current]);
      if (confettiRef.current.length > 0) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  const handleTap = useCallback((word: VocabularyWord, cellEl: HTMLElement) => {
    if (phase !== "playing") return;

    if (word.id === targetWord.id) {
      // CORRECT
      clearInterval(timerRef.current!);
      const rt = (Date.now() - startTimeRef.current) / 1000;
      setReactionTime(rt);
      setCorrectCellId(word.id);
      setPhase("correct");
      playSuccessChime();
      playConfettiPop();

      // Spawn confetti from the tapped cell
      const rect = cellEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const particles = burst(cx, cy, 45);
      confettiRef.current = particles;
      setConfetti(particles);

      setTimeout(onComplete, 1800);
    } else {
      // WRONG
      playErrorBuzz();
      setWrongCells(prev => new Set([...prev, word.id]));
      // Penalise timer
      setTimeLeft(prev => Math.max(1, prev - 2));
      // Clear shake after animation
      setTimeout(() => {
        setWrongCells(prev => {
          const next = new Set(prev);
          next.delete(word.id);
          return next;
        });
      }, 500);
    }
  }, [phase, targetWord.id, onComplete]);

  const reactionLabel = reactionTime != null
    ? REACTION_LABELS.find(l => reactionTime <= l.max)?.label ?? "🎉 You got it!"
    : "";

  const timerFraction = timeLeft / GAME_DURATION;
  const timerColor = timerFraction > 0.5 ? "#34d399" : timerFraction > 0.25 ? "#fbbf24" : "#f87171";

  return (
    <div
      ref={containerRef}
      className="min-h-screen flex flex-col overflow-hidden"
      style={{ background: "linear-gradient(160deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)" }}
    >
      {/* Confetti layer */}
      {confetti.map(p => (
        <div
          key={p.id}
          className="fixed pointer-events-none rounded-sm z-50"
          style={{
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎯</span>
          <span className="text-white/70 text-sm font-semibold uppercase tracking-widest">Find It Fast!</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-white/40 hover:text-white hover:bg-white/10 rounded-xl"
          onClick={onSkip}
        >
          <X className="w-4 h-4 mr-1" /> Skip
        </Button>
      </div>

      {/* Prompt */}
      <div className="text-center px-4 py-3">
        <p className="text-white/60 text-sm mb-1">Tap the word as fast as you can!</p>
        <motion.div
          className="inline-block bg-white/10 border border-white/20 rounded-2xl px-6 py-2"
          animate={phase === "timeout" ? { scale: [1, 1.15, 1], borderColor: ["rgba(255,255,255,0.2)", "#f87171", "rgba(255,255,255,0.2)"] } : {}}
          transition={{ duration: 0.5 }}
        >
          <span className="text-white text-3xl font-extrabold">{targetWord.english}</span>
          <span className="text-white/40 text-lg ml-2">→ ?</span>
        </motion.div>
      </div>

      {/* Timer ring */}
      <div className="flex justify-center py-2">
        <div className="relative w-16 h-16">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
            <motion.circle
              cx="28" cy="28" r="24"
              fill="none"
              stroke={timerColor}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 24}`}
              animate={{ strokeDashoffset: `${2 * Math.PI * 24 * (1 - timerFraction)}` }}
              transition={{ duration: 0.9, ease: "linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white font-bold text-xl">{timeLeft}</span>
          </div>
        </div>
      </div>

      {/* Countdown overlay */}
      <AnimatePresence>
        {phase === "countdown" && (
          <motion.div
            className="absolute inset-0 z-40 flex items-center justify-center"
            style={{ background: "rgba(15,23,42,0.85)" }}
            exit={{ opacity: 0 }}
          >
            <motion.span
              key={countdown}
              className="text-white font-extrabold"
              style={{ fontSize: "clamp(5rem,20vw,9rem)" }}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 0.55, type: "spring", stiffness: 260 }}
            >
              {countdown === 0 ? "GO!" : countdown}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Word grid */}
      <div className="flex-1 px-4 pb-4">
        <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto h-full">
          {grid.map(word => {
            const isTarget = word.id === targetWord.id;
            const isWrong = wrongCells.has(word.id);
            const isCorrectCell = correctCellId === word.id;
            const isRevealed = phase === "timeout" && isTarget;

            return (
              <motion.button
                key={word.id}
                className={`
                  relative flex flex-col items-center justify-center rounded-2xl
                  min-h-[90px] p-3 text-center font-bold text-xl border-2
                  transition-colors select-none active:scale-95
                  ${isCorrectCell
                    ? "bg-green-400 border-green-300 text-white"
                    : isRevealed
                    ? "bg-amber-400 border-amber-300 text-white"
                    : "bg-white/10 border-white/20 text-white hover:bg-white/20"}
                `}
                animate={
                  isWrong
                    ? { x: [-6, 6, -5, 5, -3, 3, 0] }
                    : isCorrectCell
                    ? { scale: [1, 1.18, 1.1] }
                    : isRevealed
                    ? { scale: [1, 1.08, 1.05] }
                    : {}
                }
                transition={{ duration: 0.45 }}
                onClick={e => handleTap(word, e.currentTarget as HTMLElement)}
                disabled={phase !== "playing"}
              >
                {word.imageUrl && (
                  <img
                    src={word.imageUrl}
                    alt=""
                    className="w-10 h-10 object-cover rounded-lg mb-1 opacity-80"
                  />
                )}
                <span className="leading-tight">{word.targetWord}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Correct celebration overlay */}
      <AnimatePresence>
        {phase === "correct" && reactionTime != null && (
          <motion.div
            className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 pb-10"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
          >
            <div className="bg-green-500/90 backdrop-blur-sm rounded-2xl px-8 py-4 text-center shadow-xl">
              <p className="text-white text-3xl font-extrabold">{reactionLabel}</p>
              <p className="text-green-200 text-lg">{reactionTime.toFixed(1)}s</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeout overlay */}
      <AnimatePresence>
        {phase === "timeout" && (
          <motion.div
            className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 pb-10"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="bg-slate-700/90 backdrop-blur-sm rounded-2xl px-8 py-4 text-center shadow-xl">
              <p className="text-white text-2xl font-bold">Time's up! 👆</p>
              <p className="text-slate-300">It was highlighted above</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
