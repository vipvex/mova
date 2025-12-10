import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import StarGrid from "@/components/StarGrid";
import PracticeSession from "@/components/PracticeSession";
import LearnSession from "@/components/LearnSession";
import { fetchStats, fetchLevelInfo, fetchWordsToLearn, fetchWordsToReview, VocabularyWord } from "@/lib/api";
import { Loader2 } from "lucide-react";

type View = 'dashboard' | 'learn' | 'review';

export default function Home() {
  const [view, setView] = useState<View>('dashboard');
  const [learnWords, setLearnWords] = useState<VocabularyWord[]>([]);
  const [reviewWords, setReviewWords] = useState<VocabularyWord[]>([]);
  const queryClient = useQueryClient();

  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['/api/stats'],
    queryFn: fetchStats,
    refetchInterval: 30000,
  });

  const { data: levelInfo, isLoading: isLoadingLevel } = useQuery({
    queryKey: ['/api/level'],
    queryFn: fetchLevelInfo,
    refetchInterval: 30000,
  });

  const handleStartLearn = useCallback(async () => {
    try {
      const words = await fetchWordsToLearn(5);
      setLearnWords(words);
      setView('learn');
    } catch (error) {
      console.error("Failed to fetch words to learn:", error);
    }
  }, []);

  const handleStartReview = useCallback(async () => {
    try {
      const words = await fetchWordsToReview();
      setReviewWords(words);
      setView('review');
    } catch (error) {
      console.error("Failed to fetch words to review:", error);
    }
  }, []);

  const handleBackToDashboard = useCallback(() => {
    setView('dashboard');
    // Refresh stats and level info when returning to dashboard
    queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/level'] });
  }, [queryClient]);

  const handleLearnComplete = useCallback((wordsLearned: number) => {
    console.log(`Learned ${wordsLearned} words`);
    queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/level'] });
  }, [queryClient]);

  const handleReviewComplete = useCallback((known: number, reviewed: number) => {
    console.log(`Reviewed ${reviewed} words, knew ${known}`);
    queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/level'] });
  }, [queryClient]);

  if (view === 'learn' && learnWords.length > 0) {
    return (
      <LearnSession
        words={learnWords}
        streak={stats?.streak ?? 0}
        onBack={handleBackToDashboard}
        onComplete={handleLearnComplete}
      />
    );
  }

  if (view === 'review' && reviewWords.length > 0) {
    return (
      <PracticeSession
        words={reviewWords}
        streak={stats?.streak ?? 0}
        totalWordsLearned={stats?.totalLearned ?? 0}
        onBack={handleBackToDashboard}
        onComplete={handleReviewComplete}
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
      <StarGrid
        currentLevel={levelInfo?.currentLevel ?? 0}
        wordsLearned={levelInfo?.wordsLearned ?? 0}
        totalWords={levelInfo?.totalWords ?? 100}
        allLevelWords={levelInfo?.allLevelWords ?? []}
        wordsToReview={stats?.wordsToReview ?? 0}
        streak={stats?.streak ?? 0}
        onStartLearn={handleStartLearn}
        onStartReview={handleStartReview}
      />
    </div>
  );
}
