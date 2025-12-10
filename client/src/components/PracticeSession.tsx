import { useState, useCallback } from "react";
import ProgressHeader from "./ProgressHeader";
import Flashcard from "./Flashcard";
import ActionButtons from "./ActionButtons";
import SessionComplete from "./SessionComplete";

export interface Word {
  id: string;
  russian: string;
  english: string;
  imageUrl: string;
}

interface PracticeSessionProps {
  words: Word[];
  streak: number;
  totalWordsLearned: number;
  onBack: () => void;
  onPlayAudio?: (word: Word) => void;
  onComplete?: (known: number, reviewed: number) => void;
}

export default function PracticeSession({ 
  words, 
  streak, 
  totalWordsLearned,
  onBack,
  onPlayAudio,
  onComplete
}: PracticeSessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [knownCount, setKnownCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  const currentWord = words[currentIndex];

  const handlePlayAudio = useCallback(() => {
    if (currentWord && onPlayAudio) {
      setIsAudioPlaying(true);
      onPlayAudio(currentWord);
      setTimeout(() => setIsAudioPlaying(false), 1500);
    }
  }, [currentWord, onPlayAudio]);

  const handleNext = useCallback((known: boolean) => {
    if (known) {
      setKnownCount(prev => prev + 1);
    }

    if (currentIndex >= words.length - 1) {
      setIsComplete(true);
      onComplete?.(known ? knownCount + 1 : knownCount, words.length);
    } else {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, words.length, knownCount, onComplete]);

  const handlePracticeMore = useCallback(() => {
    setCurrentIndex(0);
    setKnownCount(0);
    setIsComplete(false);
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
      
      <main className="flex-1 flex flex-col justify-center py-6 gap-8">
        {currentWord && (
          <Flashcard
            russianWord={currentWord.russian}
            englishWord={currentWord.english}
            imageUrl={currentWord.imageUrl}
            onPlayAudio={handlePlayAudio}
            isAudioPlaying={isAudioPlaying}
          />
        )}
        
        <ActionButtons
          onStillLearning={() => handleNext(false)}
          onKnowIt={() => handleNext(true)}
        />
      </main>
    </div>
  );
}
