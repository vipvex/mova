import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Flame } from "lucide-react";

interface ProgressHeaderProps {
  currentCard: number;
  totalCards: number;
  streak: number;
  onBack?: () => void;
  showBack?: boolean;
}

export default function ProgressHeader({ 
  currentCard, 
  totalCards, 
  streak, 
  onBack,
  showBack = true 
}: ProgressHeaderProps) {
  const progress = totalCards > 0 ? (currentCard / totalCards) * 100 : 0;

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
      
      <div className="flex-1 max-w-md">
        <Progress value={progress} className="h-3" data-testid="progress-bar" />
        <p className="text-center text-sm text-muted-foreground mt-1">
          {currentCard} of {totalCards}
        </p>
      </div>
      
      <div className="flex items-center gap-1" data-testid="streak-counter">
        <Flame className="w-6 h-6 text-orange-500" />
        <span className="text-xl font-bold">{streak}</span>
      </div>
    </header>
  );
}
