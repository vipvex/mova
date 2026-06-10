import { useEffect, useState, useCallback } from "react";
import { Star, Library, Gamepad2, Trophy, Zap, Flame, ChevronLeft, ChevronRight, Image, Grid3X3, Palette } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { playStarUnlock, playSuccessChime, resumeAudioContext } from "@/lib/sounds";
import { fetchLevelPage, type VocabularyWord, type PageLevelInfo, type DailyMissions as DailyMissionsData } from "@/lib/api";
import DailyMissions from "@/components/DailyMissions";

interface WordStatus {
  word: VocabularyWord;
  isLearned: boolean;
}

const GRID_BACKGROUND_IMAGES = [
  { name: "Bliss Hills", url: "/backgrounds/bliss-hills.png" },
  { name: "Pastel Sunset", url: "/backgrounds/pastel-sunset-hills.png" },
  { name: "Misty Meadow", url: "/backgrounds/misty-meadow.png" },
  { name: "Calm Sky", url: "/backgrounds/calm-sky-clouds.png" },
  { name: "Ocean Sunset", url: "/backgrounds/ocean-horizon-sunset.png" },
  { name: "Mountain Lake", url: "/backgrounds/mountain-lake-reflection.png" },
  { name: "Forest Sunbeams", url: "/backgrounds/forest-sunbeams.png" },
  { name: "Lavender Dusk", url: "/backgrounds/lavender-field-dusk.png" },
  { name: "Wheat Field", url: "/backgrounds/wheat-field-golden.png" },
  { name: "Cherry Blossom", url: "/backgrounds/cherry-blossom-sky.png" },
  { name: "Tropical Shore", url: "/backgrounds/calm-tropical-shore.png" },
  { name: "Foggy Pines", url: "/backgrounds/foggy-pines-dawn.png" },
  { name: "Starry Hills", url: "/backgrounds/starry-night-hills.png" },
  { name: "Autumn Forest", url: "/backgrounds/autumn-forest-path.png" },
] as const;

function pickDailyBackground() {
  const today = new Date();
  const key = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % GRID_BACKGROUND_IMAGES.length;
  return GRID_BACKGROUND_IMAGES[idx];
}

type BgChoice = { name: string; url: string | null };

const GRID_BACKGROUNDS: BgChoice[] = [
  { name: "Daily", url: "" }, // resolved at render time
  { name: "None", url: null },
  ...GRID_BACKGROUND_IMAGES.map(b => ({ name: b.name, url: b.url })),
];

interface StarGridProps {
  userId: string;
  currentLevel: number;
  wordsLearned: number;
  totalWords: number;
  allLevelWords: WordStatus[];
  streak: number;
  newlyLearnedIds?: string[];
  missions?: DailyMissionsData;
  onStartLearn: () => void;
  onStartReview: () => void;
  onMissionReviewOld: () => void;
  onMissionReviewNew: () => void;
  onStartStories: () => void;
  onStartGames: () => void;
  onStartWordCatch: () => void;
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
  streak,
  newlyLearnedIds = [],
  missions,
  onStartLearn,
  onStartReview,
  onMissionReviewOld,
  onMissionReviewNew,
  onStartStories,
  onStartGames,
  onStartWordCatch,
  onAnimationComplete,
  languageLabel = 'Russian',
  totalLearnedOverall = 0,
  totalLevelPages,
}: StarGridProps) {
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const [completedAnimations, setCompletedAnimations] = useState<Set<string>>(new Set());
  const [showPictures, setShowPictures] = useState(false);
  const [bgIndex, setBgIndex] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const stored = window.localStorage.getItem("debug-grid-bg-index");
    const n = stored ? parseInt(stored, 10) : 0;
    return Number.isFinite(n) && n >= 0 && n < GRID_BACKGROUNDS.length ? n : 0;
  });
  const cycleBg = useCallback(() => {
    setBgIndex(prev => {
      const next = (prev + 1) % GRID_BACKGROUNDS.length;
      window.localStorage.setItem("debug-grid-bg-index", String(next));
      return next;
    });
  }, []);
  const activeBgChoice = GRID_BACKGROUNDS[bgIndex];
  const dailyBg = pickDailyBackground();
  const activeBgUrl =
    activeBgChoice.name === "Daily" ? dailyBg.url : activeBgChoice.url;
  const activeBgLabel =
    activeBgChoice.name === "Daily"
      ? `Daily: ${dailyBg.name}`
      : activeBgChoice.name;

  useEffect(() => {
    const body = document.body;
    if (!activeBgUrl) {
      body.style.backgroundImage = "";
      body.style.backgroundSize = "";
      body.style.backgroundPosition = "";
      body.style.backgroundAttachment = "";
      body.style.backgroundRepeat = "";
      return;
    }
    body.style.backgroundImage = `url(${activeBgUrl})`;
    body.style.backgroundSize = "cover";
    body.style.backgroundPosition = "center";
    body.style.backgroundAttachment = "fixed";
    body.style.backgroundRepeat = "no-repeat";
    return () => {
      body.style.backgroundImage = "";
      body.style.backgroundSize = "";
      body.style.backgroundPosition = "";
      body.style.backgroundAttachment = "";
      body.style.backgroundRepeat = "";
    };
  }, [activeBgUrl]);
  const [browsingLevel, setBrowsingLevel] = useState<number | null>(null);
  const [browsingData, setBrowsingData] = useState<PageLevelInfo | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(false);

  const isBrowsing = browsingLevel !== null;
  const displayWords = isBrowsing && browsingData ? browsingData.allLevelWords : allLevelWords;
  const displayLevel = isBrowsing && browsingData ? browsingData.currentLevel : currentLevel;
  const displayWordsLearned = isBrowsing && browsingData ? browsingData.wordsLearned : wordsLearned;
  const displayTotalWords = isBrowsing && browsingData ? browsingData.totalWords : totalWords;
  const totalLevels = browsingData?.totalLevels ?? totalLevelPages ?? Math.max(currentLevel + 2, 1);


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
      {missions && (
        <DailyMissions
          missions={missions}
          disabled={newlyLearnedIds.length > 0}
          hasLearnedWords={totalLearnedOverall >= 5}
          onWordCatch={onStartWordCatch}
          onReviewOld={onMissionReviewOld}
          onLearnNew={onStartLearn}
          onReviewNew={onMissionReviewNew}
        />
      )}

      <div
        className={
          activeBgUrl
            ? "w-full rounded-2xl p-2 sm:p-3 bg-white/40 dark:bg-black/30 backdrop-blur-md shadow-sm"
            : "w-full"
        }
      >
        <div className="w-full mx-auto flex items-center justify-between mb-2 sm:mb-3">
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
            <Button
              variant="outline"
              size="sm"
              onClick={cycleBg}
              className="rounded-full gap-1.5 h-8 px-3"
              title={`Background: ${activeBgLabel} (click to cycle)`}
              data-testid="button-cycle-bg"
            >
              <Palette className="w-4 h-4" />
              {activeBgLabel}
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
            className="grid grid-cols-10 gap-1.5 sm:gap-2.5 w-full mx-auto"
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
            className="grid grid-cols-10 gap-1.5 sm:gap-2.5 w-full mx-auto"
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
      </div>

      <div className="w-full max-w-md flex flex-col gap-3">
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

      <ScoreDisplay
        totalLearned={totalLearnedOverall}
        levelWords={wordsLearned}
        streak={streak}
      />
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
          width={80}
          height={80}
        />
      ) : (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <span className="text-xs sm:text-sm font-bold text-muted-foreground">
            {word.english.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60" style={{ lineHeight: 0 }}>
        <p className="text-[7px] sm:text-[9px] text-white text-center font-medium truncate" style={{ lineHeight: '1.2', padding: '1px 2px' }}>
          {word.targetWord}
        </p>
      </div>
      {isLearned && (
        <div className="absolute top-0 right-0">
          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
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
