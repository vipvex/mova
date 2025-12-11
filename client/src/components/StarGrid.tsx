import { useEffect, useState, useCallback } from "react";
import { Star, GraduationCap, RefreshCw, Settings, BookOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { playStarUnlock, playSuccessChime, resumeAudioContext } from "@/lib/sounds";
import type { VocabularyWord } from "@/lib/api";

interface WordStatus {
  word: VocabularyWord;
  isLearned: boolean;
}

interface StarGridProps {
  currentLevel: number;
  wordsLearned: number;
  totalWords: number;
  allLevelWords: WordStatus[];
  wordsToReview: number;
  streak: number;
  newlyLearnedIds?: string[];
  onStartLearn: () => void;
  onStartReview: () => void;
  onStartGrammar: () => void;
  onAnimationComplete?: () => void;
  languageLabel?: string;
}

export default function StarGrid({
  currentLevel,
  wordsLearned,
  totalWords,
  allLevelWords,
  wordsToReview,
  streak,
  newlyLearnedIds = [],
  onStartLearn,
  onStartReview,
  onStartGrammar,
  onAnimationComplete,
  languageLabel = 'Russian',
}: StarGridProps) {
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const [completedAnimations, setCompletedAnimations] = useState<Set<string>>(new Set());
  const progress = totalWords > 0 ? (wordsLearned / totalWords) * 100 : 0;
  const isLevelComplete = wordsLearned === totalWords && totalWords > 0;

  useEffect(() => {
    if (newlyLearnedIds.length === 0) return;

    resumeAudioContext();

    const animateStars = async () => {
      for (let i = 0; i < newlyLearnedIds.length; i++) {
        const id = newlyLearnedIds[i];
        
        await new Promise(resolve => setTimeout(resolve, 600));
        
        setAnimatingIds(prev => new Set(Array.from(prev).concat(id)));
        playStarUnlock(i);
        
        await new Promise(resolve => setTimeout(resolve, 400));
        
        setCompletedAnimations(prev => new Set(Array.from(prev).concat(id)));
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      playSuccessChime();
      
      onAnimationComplete?.();
    };

    animateStars();

    return () => {
      setAnimatingIds(new Set());
      setCompletedAnimations(new Set());
    };
  }, [newlyLearnedIds, onAnimationComplete]);

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
          Learn {languageLabel}!
        </h1>
        <p className="text-muted-foreground">
          {wordsLearned} of {totalWords} stars collected
        </p>
        <div className="w-full max-w-xs mx-auto h-3 bg-muted rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
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
            isAnimating={animatingIds.has(item.word.id)}
            hasCompletedAnimation={completedAnimations.has(item.word.id)}
            isNewlyLearned={newlyLearnedIds.includes(item.word.id)}
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
          disabled={isLevelComplete || newlyLearnedIds.length > 0}
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
          disabled={wordsToReview === 0 || newlyLearnedIds.length > 0}
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

        <Button
          size="lg"
          variant="outline"
          className="w-full min-h-14 text-lg font-bold rounded-2xl gap-3"
          onClick={onStartGrammar}
          disabled={newlyLearnedIds.length > 0}
          data-testid="button-start-grammar"
        >
          <BookOpen className="w-6 h-6" />
          Practice Grammar
        </Button>
      </div>
    </div>
  );
}

interface StarCellProps {
  word: VocabularyWord;
  isLearned: boolean;
  index: number;
  isAnimating: boolean;
  hasCompletedAnimation: boolean;
  isNewlyLearned: boolean;
}

function StarCell({ word, isLearned, index, isAnimating, hasCompletedAnimation, isNewlyLearned }: StarCellProps) {
  const shouldShowAsLearned = isLearned && (!isNewlyLearned || hasCompletedAnimation);
  const showUnlockAnimation = isAnimating && !hasCompletedAnimation;

  return (
    <div
      className={`
        aspect-square rounded-lg flex items-center justify-center
        transition-all duration-300 relative overflow-visible
        ${shouldShowAsLearned 
          ? "bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40" 
          : "bg-muted/50"
        }
      `}
      data-testid={`star-cell-${index}`}
      title={isLearned ? `${word.targetWord} - ${word.english}` : "Not yet learned"}
    >
      <AnimatePresence mode="wait">
        {showUnlockAnimation ? (
          <motion.div
            key="unlock"
            className="absolute inset-0 flex items-center justify-center"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ 
              scale: [0, 1.5, 1],
              rotate: [-180, 0, 0],
            }}
            transition={{ 
              duration: 0.6,
              times: [0, 0.6, 1],
              ease: "easeOut"
            }}
          >
            <motion.div
              className="absolute inset-0 rounded-lg"
              initial={{ opacity: 0 }}
              animate={{ 
                opacity: [0, 1, 0],
                scale: [1, 2, 2.5],
              }}
              transition={{ duration: 0.8 }}
              style={{
                background: "radial-gradient(circle, rgba(251,191,36,0.6) 0%, rgba(251,191,36,0) 70%)",
              }}
            />
            <Star
              className="w-6 h-6 sm:w-7 sm:h-7 text-amber-400 fill-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,1)] z-10"
            />
          </motion.div>
        ) : (
          <motion.div
            key="star"
            initial={hasCompletedAnimation ? { scale: 1.2 } : false}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <Star
              className={`
                w-4 h-4 sm:w-5 sm:h-5
                transition-all duration-500
                ${shouldShowAsLearned 
                  ? "text-amber-400 fill-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]" 
                  : "text-muted-foreground/30"
                }
              `}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {shouldShowAsLearned && (
        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-amber-200/20 to-pink-200/20 dark:from-amber-500/10 dark:to-pink-500/10 pointer-events-none" />
      )}

      {hasCompletedAnimation && (
        <motion.div
          className="absolute inset-0 rounded-lg pointer-events-none"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
          style={{
            boxShadow: "0 0 20px 5px rgba(251,191,36,0.5)",
          }}
        />
      )}
    </div>
  );
}
