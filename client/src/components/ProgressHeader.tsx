import { Button } from "@/components/ui/button";
import { ArrowLeft, Flame, Star } from "lucide-react";
import { motion } from "framer-motion";

interface ProgressHeaderProps {
  currentCard: number;
  totalCards: number;
  streak: number;
  onBack?: () => void;
  showBack?: boolean;
  burstStarIndex?: number | null;
}

export default function ProgressHeader({ 
  currentCard, 
  totalCards, 
  streak, 
  onBack,
  showBack = true,
  burstStarIndex = null,
}: ProgressHeaderProps) {
  const completed = currentCard - 1;

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between gap-4 px-4 py-3 bg-background border-b">
      {showBack ? (
        <Button 
          size="icon" 
          variant="ghost" 
          onClick={onBack}
          data-testid="button-back"
          aria-label="Go back"
        >
          <ArrowLeft className="w-6 h-6" />
        </Button>
      ) : (
        <div className="w-9" />
      )}
      
      <div className="flex-1 flex justify-center">
        <div className="flex items-center gap-1 flex-wrap justify-center" data-testid="progress-stars">
          {Array.from({ length: totalCards }).map((_, i) => (
            <motion.span
              key={i}
              data-testid={`star-${i}`}
              animate={
                burstStarIndex === i
                  ? { scale: [1, 1.8, 1.2, 1], rotate: [0, -15, 15, 0], filter: ['brightness(1)', 'brightness(2)', 'brightness(1.5)', 'brightness(1)'] }
                  : { scale: 1, rotate: 0 }
              }
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <Star
                className={`w-10 h-10 transition-colors duration-300 ${
                  i < completed || burstStarIndex === i
                    ? "text-amber-400 fill-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.9)]"
                    : i === completed
                    ? "text-amber-300 fill-amber-100"
                    : "text-muted-foreground/30"
                }`}
              />
            </motion.span>
          ))}
        </div>
      </div>
      
      <div className="flex items-center gap-1" data-testid="streak-counter">
        <Flame className="w-6 h-6 text-orange-500" />
        <span className="text-xl font-bold">{streak}</span>
      </div>
    </header>
  );
}
