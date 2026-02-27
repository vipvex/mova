import { useState, useCallback, useEffect } from "react";
import ProgressHeader from "./ProgressHeader";
import VoiceReview from "./VoiceReview";
import SessionComplete from "./SessionComplete";
import { VocabularyWord, generateImage, reviewWord, type Language } from "@/lib/api";
import { Loader2 } from "lucide-react";

interface PracticeSessionProps {
  words: VocabularyWord[];
  streak: number;
  totalWordsLearned: number;
  onBack: () => void;
  onComplete?: (known: number, reviewed: number) => void;
  userId: string;
  language: Language;
}

export default function PracticeSession({ 
  words, 
  streak, 
  totalWordsLearned,
  onBack,
  onComplete,
  userId,
  language,
}: PracticeSessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [knownCount, setKnownCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentWord = words[currentIndex];

  useEffect(() => {
    if (!currentWord) return;
    
    setCurrentImageUrl(currentWord.imageUrl);

    if (!currentWord.imageUrl) {
      setIsLoadingImage(true);
      generateImage(currentWord.id)
        .then(url => setCurrentImageUrl(url))
        .catch(console.error)
        .finally(() => setIsLoadingImage(false));
    }
  }, [currentIndex, currentWord?.id]);

  const handleCorrect = useCallback(async () => {
    if (!currentWord || isSubmitting) return;
    
    setIsSubmitting(true);
    
    try {
      await reviewWord(userId, currentWord.id, true);
      setKnownCount(prev => prev + 1);

      if (currentIndex >= words.length - 1) {
        setIsComplete(true);
        onComplete?.(knownCount + 1, words.length);
      } else {
        setCurrentIndex(prev => prev + 1);
      }
    } catch (error) {
      console.error("Failed to submit review:", error);
    } finally {
      setIsSubmitting(false);
    }
  }, [currentIndex, words.length, knownCount, currentWord, isSubmitting, onComplete, userId]);

  const handleIncorrect = useCallback(async () => {
    if (!currentWord || isSubmitting) return;
    
    setIsSubmitting(true);
    
    try {
      await reviewWord(userId, currentWord.id, false);

      if (currentIndex >= words.length - 1) {
        setIsComplete(true);
        onComplete?.(knownCount, words.length);
      } else {
        setCurrentIndex(prev => prev + 1);
      }
    } catch (error) {
      console.error("Failed to submit review:", error);
    } finally {
      setIsSubmitting(false);
    }
  }, [currentIndex, words.length, knownCount, currentWord, isSubmitting, onComplete, userId]);

  const handlePracticeMore = useCallback(() => {
    setCurrentIndex(0);
    setKnownCount(0);
    setIsComplete(false);
    setCurrentImageUrl(null);
  }, []);

  if (isComplete) {
    return (
      <div className="min-h-screen bg-background">
        <ProgressHeader 
          currentCard={words.length} 
          totalCards={words.length} 
          streak={streak}
          onBack={onBack}
        />
        <main className="py-8">
          <SessionComplete
            wordsReviewed={words.length}
            wordsKnown={knownCount}
            totalWords={totalWordsLearned + knownCount}
            onPracticeMore={handlePracticeMore}
            onGoHome={onBack}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ProgressHeader 
        currentCard={currentIndex + 1} 
        totalCards={words.length} 
        streak={streak}
        onBack={onBack}
      />
      
      <main className="flex-1 flex flex-col justify-center py-6 px-4 gap-8">
        {currentWord && (
          <>
            {isLoadingImage ? (
              <div className="flex flex-col items-center justify-center gap-4 py-12">
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
                <p className="text-muted-foreground text-lg">Loading...</p>
              </div>
            ) : (
              <VoiceReview
                targetWord={currentWord.targetWord}
                englishWord={currentWord.english}
                wordId={currentWord.id}
                audioUrl={currentWord.audioUrl}
                imageUrl={currentImageUrl}
                language={language}
                onCorrect={handleCorrect}
                onIncorrect={handleIncorrect}
                onImageRegenerated={(newUrl) => setCurrentImageUrl(newUrl)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export type { VocabularyWord as Word };
