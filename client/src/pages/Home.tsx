import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import StarGrid from "@/components/StarGrid";
import PracticeSession from "@/components/PracticeSession";
import LearnSession from "@/components/LearnSession";
import LevelCelebration from "@/components/LevelCelebration";
import PronounsGame from "@/components/PronounsGame";
import GamesMenu from "@/components/GamesMenu";
import WordCatchGame from "@/components/WordCatchGame";
import { fetchStats, fetchLevelInfo, fetchWordsToLearn, fetchWordsToReview, VocabularyWord } from "@/lib/api";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, LogOut, User } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";

type View = 'dashboard' | 'learn' | 'review' | 'pronouns-game' | 'games' | 'word-catch';

export default function Home() {
  const { currentUser, logout } = useUser();
  const [, navigate] = useLocation();
  const [view, setView] = useState<View>('dashboard');
  const [learnWords, setLearnWords] = useState<VocabularyWord[]>([]);
  const [reviewWords, setReviewWords] = useState<VocabularyWord[]>([]);
  const [newlyLearnedIds, setNewlyLearnedIds] = useState<string[]>([]);
  const [showLevelCelebration, setShowLevelCelebration] = useState(false);
  const [previousWordsLearned, setPreviousWordsLearned] = useState<number | null>(null);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('');
  const queryClient = useQueryClient();

  const userId = currentUser?.id ?? '';
  const language = currentUser?.language ?? 'russian';

  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['/api/users', userId, 'stats'],
    queryFn: () => fetchStats(userId),
    refetchInterval: 30000,
    enabled: !!userId,
  });

  const { data: levelInfo, isLoading: isLoadingLevel } = useQuery({
    queryKey: ['/api/users', userId, 'level'],
    queryFn: () => fetchLevelInfo(userId),
    refetchInterval: 30000,
    enabled: !!userId,
  });

  useEffect(() => {
    if (levelInfo && previousWordsLearned !== null) {
      if (levelInfo.wordsLearned === levelInfo.totalWords && 
          previousWordsLearned < levelInfo.totalWords &&
          levelInfo.totalWords > 0) {
        setShowLevelCelebration(true);
      }
    }
    if (levelInfo) {
      setPreviousWordsLearned(levelInfo.wordsLearned);
    }
  }, [levelInfo?.wordsLearned, levelInfo?.totalWords, previousWordsLearned]);

  const handleStartLearn = useCallback(async () => {
    try {
      const words = await fetchWordsToLearn(userId, 5);
      setLearnWords(words);
      setView('learn');
    } catch (error) {
      console.error("Failed to fetch words to learn:", error);
    }
  }, [userId]);

  const handleStartReview = useCallback(async () => {
    try {
      const words = await fetchWordsToReview(userId);
      // Shuffle words randomly using Fisher-Yates algorithm
      const shuffled = [...words];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      setReviewWords(shuffled);
      setView('review');
    } catch (error) {
      console.error("Failed to fetch words to review:", error);
    }
  }, [userId]);

  const handleBackToDashboard = useCallback((learnedIds: string[]) => {
    setNewlyLearnedIds(learnedIds);
    setLearnWords([]);
    setView('dashboard');
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'level'] });
  }, [queryClient, userId]);

  const handleReviewBackToDashboard = useCallback(() => {
    setView('dashboard');
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'level'] });
  }, [queryClient, userId]);

  const handleAnimationComplete = useCallback(() => {
    setNewlyLearnedIds([]);
  }, []);

  const handleLearnComplete = useCallback((wordsLearned: number, learnedIds: string[]) => {
    console.log(`Learned ${wordsLearned} words:`, learnedIds);
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'level'] });
  }, [queryClient, userId]);

  const handleReviewComplete = useCallback((known: number, reviewed: number) => {
    console.log(`Reviewed ${reviewed} words, knew ${known}`);
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'level'] });
  }, [queryClient, userId]);

  const handleLevelContinue = useCallback(() => {
    setShowLevelCelebration(false);
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'level'] });
  }, [queryClient, userId]);

  const handleStartStories = useCallback(() => {
    navigate('/stories');
  }, [navigate]);

  const handleStartGames = useCallback(() => {
    setView('games');
  }, []);

  const handleGamesBack = useCallback(() => {
    setView('dashboard');
  }, []);

  const handleSelectGame = useCallback((gameId: string) => {
    if (gameId === 'word-catch') {
      setView('word-catch');
    } else if (gameId === 'personal-pronouns') {
      setView('pronouns-game');
    }
  }, []);

  const handlePronounsGameBack = useCallback(() => {
    setView('games');
  }, []);

  const handlePronounsGameComplete = useCallback(() => {
    setView('games');
  }, []);

  const languageLabel = language === 'russian' ? 'Russian' : 'Spanish';
  const languageFlag = language === 'russian' ? '🇷🇺' : '🇪🇸';

  if (view === 'learn' && learnWords.length > 0) {
    return (
      <LearnSession
        words={learnWords}
        streak={stats?.streak ?? 0}
        onBack={handleBackToDashboard}
        onComplete={handleLearnComplete}
        userId={userId}
        language={language}
      />
    );
  }

  if (view === 'review' && reviewWords.length > 0) {
    return (
      <PracticeSession
        words={reviewWords}
        streak={stats?.streak ?? 0}
        totalWordsLearned={stats?.totalLearned ?? 0}
        onBack={handleReviewBackToDashboard}
        onComplete={handleReviewComplete}
        userId={userId}
        language={language}
      />
    );
  }

  if (view === 'pronouns-game') {
    return (
      <PronounsGame
        userId={userId}
        exerciseId={selectedExerciseId}
        language={language as 'russian' | 'spanish'}
        username={currentUser?.username || ''}
        onBack={handlePronounsGameBack}
        onComplete={handlePronounsGameComplete}
      />
    );
  }

  if (view === 'games') {
    return (
      <GamesMenu
        userId={userId}
        onBack={handleGamesBack}
        onSelectGame={handleSelectGame}
        languageLabel={languageLabel}
      />
    );
  }

  if (view === 'word-catch') {
    return (
      <WordCatchGame
        userId={userId}
        language={language}
        onBack={handleGamesBack}
      />
    );
  }

  if (isLoadingStats || isLoadingLevel) {
    return (
      <div className="h-[100dvh] bg-background flex items-center justify-center overflow-hidden">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <p className="text-xl text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      <div className="max-w-2xl mx-auto px-4 py-2 w-full shrink-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-800 flex items-center justify-center">
              <User className="w-4 h-4 text-sky-600 dark:text-sky-300" />
            </div>
            <span className="font-medium">{currentUser?.username}</span>
            <span className="text-xl">{languageFlag}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="gap-1"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
            Switch User
          </Button>
        </div>
      </div>

      {showLevelCelebration && (
        <LevelCelebration
          level={(levelInfo?.currentLevel ?? 0) + 1}
          onContinue={handleLevelContinue}
        />
      )}
      <StarGrid
        userId={userId}
        currentLevel={levelInfo?.currentLevel ?? 0}
        wordsLearned={levelInfo?.wordsLearned ?? 0}
        totalWords={levelInfo?.totalWords ?? 100}
        allLevelWords={levelInfo?.allLevelWords ?? []}
        wordsToReview={stats?.wordsToReview ?? 0}
        streak={stats?.streak ?? 0}
        newlyLearnedIds={newlyLearnedIds}
        onStartLearn={handleStartLearn}
        onStartReview={handleStartReview}
        onStartStories={handleStartStories}
        onStartGames={handleStartGames}
        onAnimationComplete={handleAnimationComplete}
        languageLabel={languageLabel}
        totalLearnedOverall={stats?.totalLearned ?? 0}
        totalLevelPages={levelInfo?.totalLevels}
      />
    </div>
  );
}
