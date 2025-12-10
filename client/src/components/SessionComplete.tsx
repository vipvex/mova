import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Star, ArrowRight, Home } from "lucide-react";

interface SessionCompleteProps {
  wordsReviewed: number;
  wordsKnown: number;
  totalWords: number;
  onPracticeMore: () => void;
  onGoHome: () => void;
}

export default function SessionComplete({ 
  wordsReviewed, 
  wordsKnown, 
  totalWords,
  onPracticeMore,
  onGoHome
}: SessionCompleteProps) {
  const percentage = wordsReviewed > 0 ? Math.round((wordsKnown / wordsReviewed) * 100) : 0;
  const isGreat = percentage >= 80;

  return (
    <div className="flex flex-col items-center gap-8 p-6 max-w-md mx-auto text-center">
      <div className={`w-24 h-24 rounded-full flex items-center justify-center ${isGreat ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-primary/10'}`}>
        {isGreat ? (
          <Trophy className="w-12 h-12 text-amber-500" />
        ) : (
          <Star className="w-12 h-12 text-primary" />
        )}
      </div>

      <div>
        <h1 className="text-4xl font-bold mb-2" data-testid="text-session-title">
          {isGreat ? "Amazing Job!" : "Great Practice!"}
        </h1>
        <p className="text-xl text-muted-foreground">
          You're doing wonderfully!
        </p>
      </div>

      <Card className="w-full p-6 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-lg text-muted-foreground">Words Reviewed</span>
          <span className="text-2xl font-bold" data-testid="text-words-reviewed">{wordsReviewed}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-lg text-muted-foreground">Words Known</span>
          <span className="text-2xl font-bold text-green-600" data-testid="text-words-known">{wordsKnown}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-lg text-muted-foreground">Total Learned</span>
          <span className="text-2xl font-bold text-primary" data-testid="text-total-words">{totalWords}</span>
        </div>
      </Card>

      <div className="flex flex-col gap-4 w-full">
        <Button
          size="lg"
          className="min-h-16 text-xl font-bold rounded-2xl gap-3"
          onClick={onPracticeMore}
          data-testid="button-practice-more"
        >
          Practice More
          <ArrowRight className="w-6 h-6" />
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="min-h-14 text-lg font-semibold rounded-2xl gap-2"
          onClick={onGoHome}
          data-testid="button-go-home"
        >
          <Home className="w-5 h-5" />
          Done for Today
        </Button>
      </div>
    </div>
  );
}
