import { useEffect, useState, useCallback } from "react";
import { Star, GraduationCap, RefreshCw, Library, Gamepad2, Trophy, Zap, Flame, ChevronLeft, ChevronRight, Image, Grid3X3 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { playStarUnlock, playSuccessChime, resumeAudioContext } from "@/lib/sounds";
import { fetchLevelPage, type VocabularyWord, type PageLevelInfo } from "@/lib/api";

interface WordStatus {
  word: VocabularyWord;
  isLearned: boolean;
}

interface StarGridProps {
  userId: string;
  currentLevel: number;
  wordsLearned: number;
  totalWords: number;
  allLevelWords: WordStatus[];
  wordsToReview: number;
  streak: number;
  newlyLearnedIds?: string[];
  onStartLearn: () => void;
  onStartReview: () => void;
  onStartStories: () => void;
  onStartGames: () => void;
  onAnimationComplete?: () => void;
  languageLabel?: string;
  totalLearnedOverall?: number;
  totalLevelPages?: number;
}

export default function StarGrid({
  userId,
  currentLevel,
  wordsLearned,
  totalWords,
  allLevelWords,
  wordsToReview,
  streak,
  newlyLearnedIds = [],
  onStartLearn,
  onStartReview,
  onStartStories,
  onStartGames,
  onAnimationComplete,
  languageLabel = 'Russian',
  totalLearnedOverall = 0,
  totalLevelPages,
}: StarGridProps) {
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const [completedAnimations, setCompletedAnimations] = useState<Set<string>>(new Set());
  const [showPictures, setShowPictures] = useState(false);
  const [browsingLevel, setBrowsingLevel] = useState<number | null>(null);
  const [browsingData, setBrowsingData] = useState<PageLevelInfo | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(false);

  const isBrowsing = browsingLevel !== null;
  const displayWords = isBrowsing && browsingData ? browsingData.allLevelWords : allLevelWords;
  const displayLevel = isBrowsing && browsingData ? browsingData.currentLevel : currentLevel;
  const displayWordsLearned = isBrowsing && browsingData ? browsingData.wordsLearned : wordsLearned;
  const displayTotalWords = isBrowsing && browsingData ? browsingData.totalWords : totalWords;
  const totalLevels = browsingData?.totalLevels ?? totalLevelPages ?? Math.max(currentLevel + 2, 1);

  const progress = displayTotalWords > 0 ? (displayWordsLearned / displayTotalWords) * 100 : 0;
  const isLevelComplete = wordsLearned === totalWords && totalWords > 0;

  const navigateToLevel = useCallback(async (level: number) => {
    if (level === currentLevel) {
      setBrowsingLevel(null);
      setBrowsingData(null);
      return;
    }
    setIsLoadingPage(true);
    try {
      const data = await fetchLevelPage(userId, level);
      setBrowsingLevel(level);
      setBrowsingData(data);
    } catch (error) {
      console.error("Failed to load level:", error);
    } finally {
      setIsLoadingPage(false);
    }
  }, [userId, currentLevel]);

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
      <ScoreDisplay
        totalLearned={totalLearnedOverall}
        levelWords={wordsLearned}
        streak={streak}
      />

      <div className="w-full max-w-lg mx-auto flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          disabled={displayLevel <= 0 || isLoadingPage}
          onClick={() => navigateToLevel(displayLevel - 1)}
          data-testid="button-prev-level"
          className="rounded-full"
        >
          <ChevronLeft className="w-6 h-6" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Page {displayLevel + 1}{totalLevels > 1 ? ` of ${totalLevels}` : ''}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPictures(!showPictures)}
            className="rounded-full gap-1.5 h-8 px-3"
            data-testid="button-toggle-pictures"
          >
            {showPictures ? <Grid3X3 className="w-4 h-4" /> : <Image className="w-4 h-4" />}
            {showPictures ? 'Stars' : 'Pictures'}
          </Button>
          {isBrowsing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setBrowsingLevel(null); setBrowsingData(null); }}
              className="rounded-full h-8 px-3 text-xs"
              data-testid="button-back-to-current"
            >
              Back to current
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          disabled={displayLevel >= totalLevels - 1 || isLoadingPage}
          onClick={() => navigateToLevel(displayLevel + 1)}
          data-testid="button-next-level"
          className="rounded-full"
        >
          <ChevronRight className="w-6 h-6" />
        </Button>
      </div>

      {isLoadingPage ? (
        <div className="w-full max-w-lg mx-auto flex items-center justify-center py-12">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            <Star className="w-10 h-10 text-amber-400" />
          </motion.div>
        </div>
      ) : showPictures ? (
        <div 
          className="grid grid-cols-10 gap-1 sm:gap-2 w-full max-w-lg mx-auto"
          data-testid="picture-grid"
        >
          {displayWords.map((item, index) => (
            <PictureCell
              key={item.word.id}
              word={item.word}
              isLearned={item.isLearned}
              index={index}
            />
          ))}
        </div>
      ) : (
        <div 
          className="grid grid-cols-10 gap-1 sm:gap-2 w-full max-w-lg mx-auto"
          data-testid="star-grid"
        >
          {displayWords.map((item, index) => (
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
          {Array.from({ length: Math.max(0, 100 - displayWords.length) }).map((_, i) => (
            <div 
              key={`empty-${i}`}
              className="aspect-square rounded-lg bg-muted/30"
            />
          ))}
        </div>
      )}

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
          className="w-full min-h-14 text-lg font-bold rounded-2xl gap-3 border-emerald-500/50 text-emerald-600 dark:text-emerald-400"
          onClick={onStartStories}
          disabled={newlyLearnedIds.length > 0}
          data-testid="button-start-stories"
        >
          <Library className="w-6 h-6" />
          Read Stories
        </Button>

        <Button
          size="lg"
          variant="outline"
          className="w-full min-h-14 text-lg font-bold rounded-2xl gap-3 border-emerald-500/50 text-emerald-600 dark:text-emerald-400"
          onClick={onStartGames}
          disabled={newlyLearnedIds.length > 0}
          data-testid="button-start-games"
        >
          <Gamepad2 className="w-6 h-6" />
          Play Games
        </Button>
      </div>

      {/* Fluency Progress */}
      <FluencyProgress totalLearned={totalLearnedOverall} />
    </div>
  );
}

function ScoreDisplay({ totalLearned, levelWords, streak }: { totalLearned: number; levelWords: number; streak: number }) {
  const baseScore = totalLearned;
  const streakBonus = streak;
  const totalScore = baseScore + streakBonus;

  const getRank = (score: number) => {
    if (score >= 100) return { title: "Super Star", color: "from-yellow-400 to-amber-500" };
    if (score >= 50) return { title: "Rising Star", color: "from-teal-400 to-emerald-500" };
    if (score >= 20) return { title: "Word Explorer", color: "from-blue-400 to-cyan-500" };
    if (score >= 5) return { title: "Beginner", color: "from-green-400 to-emerald-500" };
    return { title: "Just Starting", color: "from-slate-400 to-slate-500" };
  };

  const rank = getRank(totalScore);

  return (
    <motion.div
      className="w-full max-w-md"
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, type: "spring", bounce: 0.3 }}
    >
      <div className={`relative w-full rounded-3xl bg-gradient-to-br ${rank.color} p-1 shadow-lg`}>
        <div className="rounded-[1.25rem] bg-background/95 dark:bg-background/90 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ rotate: [0, -10, 10, -10, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3 }}
              >
                <Trophy className="w-10 h-10 text-yellow-500 drop-shadow-md" />
              </motion.div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" data-testid="text-rank">
                  {rank.title}
                </p>
                <motion.p
                  className="text-4xl font-black tabular-nums"
                  key={totalScore}
                  initial={{ scale: 1.3, color: "hsl(var(--primary))" }}
                  animate={{ scale: 1, color: "hsl(var(--foreground))" }}
                  transition={{ duration: 0.4 }}
                  data-testid="text-score"
                >
                  {totalScore.toLocaleString()}
                </motion.p>
              </div>
            </div>

            <div className="flex flex-col gap-1 items-end text-right">
              <div className="flex items-center gap-1 text-sm">
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                <span className="font-semibold" data-testid="text-word-points">{baseScore}</span>
              </div>
              <div className="flex items-center gap-1 text-sm text-orange-500">
                <Flame className="w-4 h-4" />
                <span className="font-semibold" data-testid="text-streak-bonus">{streakBonus} day{streakBonus !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function PictureCell({ word, isLearned, index }: { word: VocabularyWord; isLearned: boolean; index: number }) {
  return (
    <div
      className={`
        overflow-hidden relative
        ${isLearned 
          ? "border border-amber-400" 
          : "opacity-60 grayscale border border-transparent"
        }
      `}
      style={{ aspectRatio: '1 / 1' }}
      data-testid={`picture-cell-${index}`}
      title={`${word.targetWord} - ${word.english}${isLearned ? ' ✓' : ''}`}
    >
      {word.imageUrl ? (
        <img 
          src={word.imageUrl} 
          alt={word.english}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          width={80}
          height={80}
        />
      ) : (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <span className="text-[8px] sm:text-xs font-bold text-muted-foreground">
            {word.english.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60" style={{ lineHeight: 0 }}>
        <p className="text-[5px] sm:text-[6px] text-white text-center font-medium truncate" style={{ lineHeight: '1.2', padding: '1px 2px' }}>
          {word.targetWord}
        </p>
      </div>
      {isLearned && (
        <div className="absolute top-0 right-0">
          <Star className="w-2 h-2 text-amber-400 fill-amber-400" />
        </div>
      )}
    </div>
  );
}

function FluencyProgress({ totalLearned }: { totalLearned: number }) {
  const FLUENCY_TARGET = 2000;
  const WORDS_PER_DAY = 10;
  
  const percentage = Math.min((totalLearned / FLUENCY_TARGET) * 100, 100);
  const wordsRemaining = Math.max(FLUENCY_TARGET - totalLearned, 0);
  const daysRemaining = Math.ceil(wordsRemaining / WORDS_PER_DAY);
  
  return (
    <div className="w-full max-w-md mt-6 p-4 rounded-2xl bg-muted/30" data-testid="fluency-progress-container">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-muted-foreground">Fluency Progress</span>
        <span className="text-sm font-bold" data-testid="text-fluency-percentage">
          {Math.round(percentage)}%
        </span>
      </div>
      
      <div className="w-full h-3 bg-muted rounded-full overflow-hidden mb-2">
        <motion.div 
          className="h-full bg-gradient-to-r from-green-500 to-emerald-500"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          data-testid="fluency-progress-bar"
        />
      </div>
      
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span data-testid="text-words-learned-total">
          {totalLearned} of {FLUENCY_TARGET} words
        </span>
        {wordsRemaining > 0 ? (
          <span data-testid="text-days-to-fluency">
            ~{daysRemaining} days to fluency
          </span>
        ) : (
          <span className="text-green-600 font-medium" data-testid="text-fluent">
            Fluent!
          </span>
        )}
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
          ? "bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/40 dark:to-emerald-900/40" 
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
        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-amber-200/20 to-green-200/20 dark:from-amber-500/10 dark:to-green-500/10 pointer-events-none" />
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
