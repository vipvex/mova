import { useState, useCallback, useEffect } from "react";
import ProgressHeader from "./ProgressHeader";
import Flashcard from "./Flashcard";
import ActionButtons from "./ActionButtons";
import SessionComplete from "./SessionComplete";
import { VocabularyWord, generateAudio, generateImage, playAudio, reviewWord } from "@/lib/api";
import { Loader2 } from "lucide-react";

interface PracticeSessionProps {
  words: VocabularyWord[];
  streak: number;
  totalWordsLearned: number;
  onBack: () => void;
  onComplete?: (known: number, reviewed: number) => void;
}

export default function PracticeSession({ 
  words, 
  streak, 
  totalWordsLearned,
  onBack,
  onComplete
}: PracticeSessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [knownCount, setKnownCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentWord = words[currentIndex];

  // Load image and audio for current word
  useEffect(() => {
    if (!currentWord) return;
    
    setCurrentImageUrl(currentWord.imageUrl);
    setCurrentAudioUrl(currentWord.audioUrl);

    // Generate image if not available
    if (!currentWord.imageUrl) {
      setIsLoadingImage(true);
      generateImage(currentWord.id)
        .then(url => setCurrentImageUrl(url))
        .catch(console.error)
        .finally(() => setIsLoadingImage(false));
    }

    // Generate audio if not available
    if (!currentWord.audioUrl) {
      setIsLoadingAudio(true);
      generateAudio(currentWord.id)
        .then(url => setCurrentAudioUrl(url))
        .catch(console.error)
        .finally(() => setIsLoadingAudio(false));
    }
  }, [currentIndex, currentWord?.id]);

  const handlePlayAudio = useCallback(() => {
    if (currentAudioUrl) {
      setIsAudioPlaying(true);
      playAudio(currentAudioUrl)
        .catch(console.error)
        .finally(() => setIsAudioPlaying(false));
    } else if (currentWord && !isLoadingAudio) {
      setIsLoadingAudio(true);
      generateAudio(currentWord.id)
        .then(url => {
          setCurrentAudioUrl(url);
          setIsAudioPlaying(true);
          return playAudio(url);
        })
        .catch(console.error)
        .finally(() => {
          setIsLoadingAudio(false);
          setIsAudioPlaying(false);
        });
    }
  }, [currentAudioUrl, currentWord, isLoadingAudio]);

  const handleNext = useCallback(async (known: boolean) => {
    if (!currentWord || isSubmitting) return;
    
    setIsSubmitting(true);
    
    try {
      // Submit review to backend
      await reviewWord(currentWord.id, known);
      
      if (known) {
        setKnownCount(prev => prev + 1);
      }

      if (currentIndex >= words.length - 1) {
        setIsComplete(true);
        onComplete?.(known ? knownCount + 1 : knownCount, words.length);
      } else {
        setCurrentIndex(prev => prev + 1);
      }
    } catch (error) {
      console.error("Failed to submit review:", error);
    } finally {
      setIsSubmitting(false);
    }
  }, [currentIndex, words.length, knownCount, currentWord, isSubmitting, onComplete]);

  const handlePracticeMore = useCallback(() => {
    setCurrentIndex(0);
    setKnownCount(0);
    setIsComplete(false);
    setCurrentImageUrl(null);
    setCurrentAudioUrl(null);
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

  // Show loading if we have no current word image yet
  const displayImageUrl = currentImageUrl || null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ProgressHeader 
        currentCard={currentIndex + 1} 
        totalCards={words.length} 
        streak={streak}
        onBack={onBack}
      />
      
      <main className="flex-1 flex flex-col justify-center py-6 gap-8">
        {currentWord && (
          <>
            {isLoadingImage ? (
              <div className="flex flex-col items-center justify-center gap-4 py-12">
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
                <p className="text-muted-foreground text-lg">Creating picture...</p>
              </div>
            ) : (
              <Flashcard
                russianWord={currentWord.russian}
                englishWord={currentWord.english}
                imageUrl={displayImageUrl || ''}
                onPlayAudio={handlePlayAudio}
                isAudioPlaying={isAudioPlaying || isLoadingAudio}
              />
            )}
          </>
        )}
        
        <ActionButtons
          onStillLearning={() => handleNext(false)}
          onKnowIt={() => handleNext(true)}
          disabled={isSubmitting || isLoadingImage}
        />
      </main>
    </div>
  );
}

export type { VocabularyWord as Word };
