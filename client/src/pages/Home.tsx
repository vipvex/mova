import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import StarGrid from "@/components/StarGrid";
import PracticeSession from "@/components/PracticeSession";
import LearnSession from "@/components/LearnSession";
import LevelCelebration from "@/components/LevelCelebration";
import GrammarMenu from "@/components/GrammarMenu";
import PronounsGame from "@/components/PronounsGame";
import { fetchStats, fetchLevelInfo, fetchWordsToLearn, fetchWordsToReview, VocabularyWord } from "@/lib/api";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, LogOut, User } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";

type View = 'dashboard' | 'learn' | 'review' | 'grammar' | 'pronouns-game';

export default function Home() {
  const { currentUser, logout } = useUser();
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
      setReviewWords(words);
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

  const handleStartGrammar = useCallback(() => {
    setView('grammar');
  }, []);

  const handleGrammarBack = useCallback(() => {
    setView('dashboard');
  }, []);

  const handleSelectExercise = useCallback((exerciseId: string, exerciseName: string) => {
    setSelectedExerciseId(exerciseId);
    // Route to specific game based on exercise name
    const lowerName = exerciseName.toLowerCase();
    if (lowerName.includes('pronoun')) {
      setView('pronouns-game');
    } else {
      // For exercises without a game yet, show a toast or stay on grammar menu
      console.log("Exercise not yet implemented:", exerciseName);
      // Stay on grammar menu for now - game coming soon
    }
  }, []);

  const handlePronounsGameBack = useCallback(async () => {
    // Record practice before going back
    if (selectedExerciseId) {
      try {
        await apiRequest('POST', `/api/users/${userId}/grammar-exercises/${selectedExerciseId}/practice`);
      } catch (error) {
        console.error("Failed to record practice:", error);
      }
    }
    setView('grammar');
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'grammar-exercises'] });
  }, [queryClient, userId, selectedExerciseId]);

  const handlePronounsGameComplete = useCallback(async () => {
    // Record practice on completion
    if (selectedExerciseId) {
      try {
        await apiRequest('POST', `/api/users/${userId}/grammar-exercises/${selectedExerciseId}/practice`);
      } catch (error) {
        console.error("Failed to record practice:", error);
      }
    }
    setView('grammar');
    queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'grammar-exercises'] });
  }, [queryClient, userId, selectedExerciseId]);

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

  if (view === 'grammar') {
    return (
      <GrammarMenu
        userId={userId}
        languageLabel={languageLabel}
        onBack={handleGrammarBack}
        onSelectExercise={handleSelectExercise}
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
    <div className="min-h-screen bg-background py-6">
      <div className="max-w-2xl mx-auto px-4 mb-4">
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
        currentLevel={levelInfo?.currentLevel ?? 0}
        wordsLearned={levelInfo?.wordsLearned ?? 0}
        totalWords={levelInfo?.totalWords ?? 100}
        allLevelWords={levelInfo?.allLevelWords ?? []}
        wordsToReview={stats?.wordsToReview ?? 0}
        streak={stats?.streak ?? 0}
        newlyLearnedIds={newlyLearnedIds}
        onStartLearn={handleStartLearn}
        onStartReview={handleStartReview}
        onStartGrammar={handleStartGrammar}
        onAnimationComplete={handleAnimationComplete}
        languageLabel={languageLabel}
      />
    </div>
  );
}
