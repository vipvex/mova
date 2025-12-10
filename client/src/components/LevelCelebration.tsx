import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Trophy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playLevelComplete, playConfettiPop } from "@/lib/sounds";

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  delay: number;
  size: number;
  rotation: number;
}

interface LevelCelebrationProps {
  level: number;
  onContinue: () => void;
}

export default function LevelCelebration({ level, onContinue }: LevelCelebrationProps) {
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);
  const [showContent, setShowContent] = useState(false);

  const colors = [
    "bg-amber-400", "bg-pink-500", "bg-purple-500", "bg-blue-500",
    "bg-green-500", "bg-orange-500", "bg-red-500", "bg-cyan-500"
  ];

  useEffect(() => {
    playLevelComplete();
    
    const pieces: ConfettiPiece[] = [];
    for (let i = 0; i < 100; i++) {
      pieces.push({
        id: i,
        x: Math.random() * 100,
        color: colors[Math.floor(Math.random() * colors.length)],
        delay: Math.random() * 2,
        size: Math.random() * 8 + 4,
        rotation: Math.random() * 360,
      });
    }
    setConfetti(pieces);

    const popInterval = setInterval(() => {
      playConfettiPop();
    }, 300);

    setTimeout(() => clearInterval(popInterval), 2000);

    setTimeout(() => setShowContent(true), 500);

    return () => clearInterval(popInterval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 overflow-hidden">
      {confetti.map((piece) => (
        <motion.div
          key={piece.id}
          className={`absolute ${piece.color} rounded-sm`}
          style={{
            width: piece.size,
            height: piece.size,
            left: `${piece.x}%`,
            top: -20,
          }}
          initial={{ y: -20, rotate: 0, opacity: 1 }}
          animate={{
            y: window.innerHeight + 100,
            rotate: piece.rotation + 720,
            opacity: [1, 1, 0],
          }}
          transition={{
            duration: 3 + Math.random() * 2,
            delay: piece.delay,
            ease: "easeIn",
          }}
        />
      ))}

      <AnimatePresence>
        {showContent && (
          <motion.div
            className="relative z-10 flex flex-col items-center gap-6 p-8 text-center"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 12, stiffness: 200 }}
          >
            <motion.div
              className="relative"
              animate={{
                scale: [1, 1.1, 1],
                rotate: [0, 5, -5, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatType: "reverse",
              }}
            >
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-amber-400 via-orange-500 to-pink-500 flex items-center justify-center shadow-2xl">
                <Trophy className="w-16 h-16 text-white drop-shadow-lg" />
              </div>
              
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute"
                  style={{
                    top: "50%",
                    left: "50%",
                  }}
                  animate={{
                    x: [0, Math.cos((i * Math.PI * 2) / 8) * 80],
                    y: [0, Math.sin((i * Math.PI * 2) / 8) * 80],
                    opacity: [0, 1, 0],
                    scale: [0.5, 1.5, 0.5],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    delay: i * 0.1,
                  }}
                >
                  <Star className="w-6 h-6 text-amber-300 fill-amber-300" />
                </motion.div>
              ))}
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <h1 className="text-5xl sm:text-6xl font-extrabold text-white mb-2 drop-shadow-lg">
                LEVEL {level} COMPLETE!
              </h1>
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="w-8 h-8 text-amber-400" />
                <p className="text-2xl text-amber-300 font-bold">
                  100 Words Mastered!
                </p>
                <Sparkles className="w-8 h-8 text-amber-400" />
              </div>
            </motion.div>

            <motion.div
              className="flex flex-wrap justify-center gap-2 max-w-md"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {[...Array(10)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    y: [0, -10, 0],
                    scale: [1, 1.2, 1],
                  }}
                  transition={{
                    duration: 0.5,
                    delay: i * 0.1,
                    repeat: Infinity,
                    repeatDelay: 1,
                  }}
                >
                  <Star className="w-8 h-8 text-amber-400 fill-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.8)]" />
                </motion.div>
              ))}
            </motion.div>

            <motion.p
              className="text-xl text-white/90 font-semibold"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              You're a Russian Language Superstar!
            </motion.p>

            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 1 }}
            >
              <Button
                size="lg"
                className="min-h-16 px-12 text-xl font-bold rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 border-0"
                onClick={onContinue}
                data-testid="button-level-continue"
              >
                Continue to Level {level + 1}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
