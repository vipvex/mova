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
import { fetchStats, fetchLevelInfo, fetchWordsToLearn, fetchWordsToReview, fetchDailyMissions, fetchWordsToReviewOld, fetchWordsLearnedToday, VocabularyWord } from "@/lib/api";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, LogOut, User, Settings, ListTree } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

type View = 'dashboard' | 'learn' | 'review' | 'pronouns-game' | 'games' | 'word-catch';

export default function Home() {
  const { currentUser, logout } = useUser();
  const [, navigate] = useLocation();
  const [view, setView] = useState<View>('dashboard');
  const [learnWords, setLearnWords] = useState<VocabularyWord[]>([]);
  const [reviewWords, setReviewWords] = useState<VocabularyWord[]>([]);
  const [reviewPromptMode, setReviewPromptMode] = useState<'default' | 'today-new'>('default');
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

  const { data: missions } = useQuery({
    queryKey: ['/api/users', userId, 'daily-missions'],
    queryFn: () => fetchDailyMissions(userId),
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
      const words = await fetchWordsToLearn(userId, 10);
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
      setReviewPromptMode('default');
      setReviewWords(shuffled.slice(0, 20));
      setView('review');
    } catch (error) {
      console.error("Failed to fetch words to review:", error);
    }
  }, [userId]);

  const handleMissionReviewOld = useCallback(async () => {
    try {
      const words = await fetchWordsToReviewOld(userId);
      // Front-load the 3 best-known words (highest reviewCount) for quick easy wins,
      // then shuffle the rest to fill the session up to 10.
      const sortedByFamiliarity = [...words].sort(
        (a, b) => (b.progress?.reviewCount ?? 0) - (a.progress?.reviewCount ?? 0),
      );
      const easyWins = sortedByFamiliarity.slice(0, 3);
      const rest = sortedByFamiliarity.slice(3);
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      const ordered = [...easyWins, ...rest].slice(0, 10);
      setReviewPromptMode('default');
      setReviewWords(ordered);
      setView('review');
    } catch (error) {
      console.error("Failed to fetch review-old words:", error);
    }
  }, [userId]);

  const handleMissionReviewNew = useCallback(async () => {
    try {
      const words = await fetchWordsLearnedToday(userId);
      const shuffled = [...words];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      setReviewPromptMode('today-new');
      setReviewWords(shuffled);
      setView('review');
    } catch (error) {
      console.error("Failed to fetch learned-today words:", error);
    }
  }, [userId]);

  const handleBackToDashboard = useCallback((learnedIds: string[]) => {
    setNewlyLearnedIds(learnedIds);
    setLearnWords([]);
    setView('dashboard');
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'level'] });
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'daily-missions'] });
  }, [queryClient, userId]);

  const handleReviewBackToDashboard = useCallback(() => {
    setView('dashboard');
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'level'] });
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'daily-missions'] });
  }, [queryClient, userId]);

  const handleAnimationComplete = useCallback(() => {
    setNewlyLearnedIds([]);
  }, []);

  const handleLearnComplete = useCallback((wordsLearned: number, learnedIds: string[]) => {
    console.log(`Learned ${wordsLearned} words:`, learnedIds);
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'level'] });
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'daily-missions'] });
  }, [queryClient, userId]);

  const handleReviewComplete = useCallback((known: number, reviewed: number) => {
    console.log(`Reviewed ${reviewed} words, knew ${known}`);
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'level'] });
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'daily-missions'] });
  }, [queryClient, userId]);

  const handleLevelContinue = useCallback(() => {
    setShowLevelCelebration(false);
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'level'] });
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'daily-missions'] });
  }, [queryClient, userId]);

  const handleStartStories = useCallback(() => {
    navigate('/stories');
  }, [navigate]);

  const handleStartGames = useCallback(() => {
    setView('games');
  }, []);

  const handleStartWordCatch = useCallback(() => {
    setView('word-catch');
  }, []);

  const handleGamesBack = useCallback(() => {
    setView('dashboard');
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'daily-missions'] });
  }, [queryClient, userId]);

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
        promptMode={reviewPromptMode}
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <p className="text-xl text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-6">
      <div className="max-w-2xl mx-auto px-4 mb-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-800 flex items-center justify-center">
              <User className="w-4 h-4 text-sky-600 dark:text-sky-300" />
            </div>
            <span className="font-medium">{currentUser?.username}</span>
            <span className="text-xl">{languageFlag}</span>
          </div>
          <div className="flex items-center gap-1">
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
            <Link href="/admin">
              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-settings">
                <Settings className="w-4 h-4" />
              </Button>
            </Link>
          </div>
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
        streak={stats?.streak ?? 0}
        newlyLearnedIds={newlyLearnedIds}
        missions={missions}
        onStartLearn={handleStartLearn}
        onStartReview={handleStartReview}
        onMissionReviewOld={handleMissionReviewOld}
        onMissionReviewNew={handleMissionReviewNew}
        onStartStories={handleStartStories}
        onStartGames={handleStartGames}
        onStartWordCatch={handleStartWordCatch}
        onAnimationComplete={handleAnimationComplete}
        languageLabel={languageLabel}
        totalLearnedOverall={stats?.totalLearned ?? 0}
        totalLevelPages={levelInfo?.totalLevels}
      />

      <div className="max-w-md mx-auto px-4 mt-6">
        <Link href="/curriculum">
          <Button
            size="lg"
            variant="outline"
            className="w-full min-h-14 text-lg font-bold rounded-2xl gap-3"
            data-testid="button-curriculum"
          >
            <ListTree className="w-6 h-6" />
            Curriculum
          </Button>
        </Link>
      </div>
    </div>
  );
}
