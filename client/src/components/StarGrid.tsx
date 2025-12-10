import { Star, GraduationCap, RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import type { Vocabulary } from "@shared/schema";

interface WordStatus {
  word: Vocabulary;
  isLearned: boolean;
}

interface StarGridProps {
  currentLevel: number;
  wordsLearned: number;
  totalWords: number;
  allLevelWords: WordStatus[];
  wordsToReview: number;
  streak: number;
  onStartLearn: () => void;
  onStartReview: () => void;
}

export default function StarGrid({
  currentLevel,
  wordsLearned,
  totalWords,
  allLevelWords,
  wordsToReview,
  streak,
  onStartLearn,
  onStartReview,
}: StarGridProps) {
  const progress = totalWords > 0 ? (wordsLearned / totalWords) * 100 : 0;
  const isLevelComplete = wordsLearned === totalWords && totalWords > 0;

  return (
    <div className="flex flex-col items-center gap-6 p-4 max-w-2xl mx-auto">
      <div className="w-full flex justify-between items-center">
        <div className="flex items-center gap-2 text-lg font-bold">
          <span className="text-muted-foreground">Level</span>
          <span className="text-2xl" data-testid="text-level">{currentLevel + 1}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 text-orange-500">
            <span className="text-lg font-bold" data-testid="text-streak">{streak}</span>
            <span className="text-sm">day streak</span>
          </div>
          <Link href="/admin">
            <Button variant="ghost" size="icon" data-testid="button-settings">
              <Settings className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="text-center space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold" data-testid="text-welcome">
          Learn Russian!
        </h1>
        <p className="text-muted-foreground">
          {wordsLearned} of {totalWords} stars collected
        </p>
        <div className="w-full max-w-xs mx-auto h-3 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
            data-testid="progress-bar"
          />
        </div>
      </div>

      <div 
        className="grid grid-cols-10 gap-1 sm:gap-2 w-full max-w-lg mx-auto"
        data-testid="star-grid"
      >
        {allLevelWords.map((item, index) => (
          <StarCell
            key={item.word.id}
            word={item.word}
            isLearned={item.isLearned}
            index={index}
          />
        ))}
        {Array.from({ length: Math.max(0, 100 - allLevelWords.length) }).map((_, i) => (
          <div 
            key={`empty-${i}`}
            className="aspect-square rounded-lg bg-muted/30"
          />
        ))}
      </div>

      <div className="w-full max-w-md flex flex-col gap-3 mt-2">
        <Button
          size="lg"
          className="w-full min-h-16 text-xl font-bold rounded-2xl gap-3"
          onClick={onStartLearn}
          disabled={isLevelComplete}
          data-testid="button-start-learn"
        >
          <GraduationCap className="w-7 h-7" />
          {isLevelComplete ? "Level Complete!" : "Learn New Words"}
          {!isLevelComplete && totalWords - wordsLearned > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-base">
              {totalWords - wordsLearned}
            </span>
          )}
        </Button>
        
        <Button
          size="lg"
          variant="secondary"
          className="w-full min-h-14 text-lg font-bold rounded-2xl gap-3"
          onClick={onStartReview}
          disabled={wordsToReview === 0}
          data-testid="button-start-review"
        >
          <RefreshCw className="w-6 h-6" />
          Review Words
          {wordsToReview > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-primary/20 rounded-full text-base">
              {wordsToReview}
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}

interface StarCellProps {
  word: Vocabulary;
  isLearned: boolean;
  index: number;
}

function StarCell({ word, isLearned, index }: StarCellProps) {
  return (
    <div
      className={`
        aspect-square rounded-lg flex items-center justify-center
        transition-all duration-300 relative overflow-visible
        ${isLearned 
          ? "bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40" 
          : "bg-muted/50"
        }
      `}
      data-testid={`star-cell-${index}`}
      title={isLearned ? `${word.russian} - ${word.english}` : "Not yet learned"}
    >
      <Star
        className={`
          w-4 h-4 sm:w-5 sm:h-5
          transition-all duration-500
          ${isLearned 
            ? "text-amber-400 fill-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)] animate-star-glow" 
            : "text-muted-foreground/30"
          }
        `}
      />
      {isLearned && (
        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-amber-200/20 to-pink-200/20 dark:from-amber-500/10 dark:to-pink-500/10 pointer-events-none" />
      )}
    </div>
  );
}
