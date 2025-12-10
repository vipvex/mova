import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Dashboard from "@/components/Dashboard";
import PracticeSession from "@/components/PracticeSession";
import LearnSession from "@/components/LearnSession";
import { fetchStats, fetchWordsToLearn, fetchWordsToReview, VocabularyWord } from "@/lib/api";
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
    refetchInterval: 30000, // Refresh stats every 30 seconds
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
    // Refresh stats when returning to dashboard
    queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
  }, [queryClient]);

  const handleLearnComplete = useCallback((wordsLearned: number) => {
    console.log(`Learned ${wordsLearned} words`);
    queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
  }, [queryClient]);

  const handleReviewComplete = useCallback((known: number, reviewed: number) => {
    console.log(`Reviewed ${reviewed} words, knew ${known}`);
    queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
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

  if (isLoadingStats) {
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
    <div className="min-h-screen bg-background py-8">
      <Dashboard
        wordsToday={stats?.wordsToday ?? 0}
        totalWords={stats?.totalLearned ?? 0}
        streak={stats?.streak ?? 0}
        wordsToReview={stats?.wordsToReview ?? 0}
        wordsToLearn={stats?.wordsToLearn ?? 0}
        onStartLearn={handleStartLearn}
        onStartReview={handleStartReview}
      />
    </div>
  );
}
