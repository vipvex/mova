import { useState, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Volume2, ArrowRight, Check, Flame } from "lucide-react";

export interface Word {
  id: string;
  russian: string;
  english: string;
  imageUrl: string;
}

interface LearnSessionProps {
  words: Word[];
  streak: number;
  onBack: () => void;
  onPlayAudio?: (word: Word) => void;
  onComplete?: (wordsLearned: number) => void;
}

export default function LearnSession({ 
  words, 
  streak,
  onBack,
  onPlayAudio,
  onComplete
}: LearnSessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [hasHeardWord, setHasHeardWord] = useState(false);

  const currentWord = words[currentIndex];
  const progress = words.length > 0 ? ((currentIndex + 1) / words.length) * 100 : 0;

  const handlePlayAudio = useCallback(() => {
    if (currentWord && onPlayAudio) {
      setIsAudioPlaying(true);
      setHasHeardWord(true);
      onPlayAudio(currentWord);
      setTimeout(() => setIsAudioPlaying(false), 1500);
    }
  }, [currentWord, onPlayAudio]);

  // Auto-play audio when card changes
  useEffect(() => {
    if (currentWord) {
      setHasHeardWord(false);
      const timer = setTimeout(() => {
        handlePlayAudio();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex >= words.length - 1) {
      setIsComplete(true);
      onComplete?.(words.length);
    } else {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, words.length, onComplete]);

  const handleLearnMore = useCallback(() => {
    setCurrentIndex(0);
    setIsComplete(false);
    setHasHeardWord(false);
  }, []);

  if (isComplete) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-50 flex items-center justify-between gap-4 px-4 py-3 bg-background border-b">
          <Button size="icon" variant="ghost" onClick={onBack} data-testid="button-back">
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <Flame className="w-6 h-6 text-orange-500" />
            <span className="text-xl font-bold">{streak}</span>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-6 gap-8 text-center">
          <div className="w-24 h-24 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <Check className="w-12 h-12 text-green-600" />
          </div>
          <div>
            <h1 className="text-4xl font-bold mb-2" data-testid="text-learn-complete">
              Great Learning!
            </h1>
            <p className="text-xl text-muted-foreground">
              You learned {words.length} new words!
            </p>
          </div>
          <div className="flex flex-col gap-4 w-full max-w-md">
            <Button
              size="lg"
              className="min-h-16 text-xl font-bold rounded-2xl"
              onClick={handleLearnMore}
              data-testid="button-learn-more"
            >
              Learn More Words
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="min-h-14 text-lg font-semibold rounded-2xl"
              onClick={onBack}
              data-testid="button-done-learning"
            >
              Done for Now
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 flex items-center justify-between gap-4 px-4 py-3 bg-background border-b">
        <Button size="icon" variant="ghost" onClick={onBack} data-testid="button-back">
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <div className="flex-1 max-w-md">
          <Progress value={progress} className="h-3" />
          <p className="text-center text-sm text-muted-foreground mt-1">
            Learning {currentIndex + 1} of {words.length}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Flame className="w-6 h-6 text-orange-500" />
          <span className="text-xl font-bold">{streak}</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-center py-6 gap-8 px-4">
        {currentWord && (
          <Card className="w-full max-w-md mx-auto p-8 flex flex-col items-center gap-6 rounded-3xl">
            <div 
              className="relative w-full aspect-square max-w-sm rounded-2xl overflow-hidden bg-muted cursor-pointer"
              onClick={handlePlayAudio}
              data-testid="learn-image-container"
            >
              <img 
                src={currentWord.imageUrl} 
                alt={`${currentWord.russian} - ${currentWord.english}`}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="text-center space-y-2">
              <h2 className="text-4xl font-extrabold" data-testid="text-russian-word">
                {currentWord.russian}
              </h2>
              <p className="text-2xl text-muted-foreground font-semibold" data-testid="text-english-word">
                {currentWord.english}
              </p>
            </div>

            <Button
              size="lg"
              variant="secondary"
              className="w-full max-w-xs min-h-16 text-xl font-bold rounded-2xl gap-3"
              onClick={handlePlayAudio}
              data-testid="button-hear-word"
            >
              <Volume2 className={`w-7 h-7 ${isAudioPlaying ? 'animate-pulse text-primary' : ''}`} />
              {hasHeardWord ? 'Hear Again' : 'Hear Word'}
            </Button>

            <p className="text-lg text-muted-foreground text-center">
              Listen and repeat the word!
            </p>
          </Card>
        )}

        <div className="w-full max-w-md mx-auto">
          <Button
            size="lg"
            className="w-full min-h-16 text-xl font-bold rounded-2xl gap-3"
            onClick={handleNext}
            data-testid="button-next-word"
          >
            {currentIndex >= words.length - 1 ? 'Finish' : 'Next Word'}
            <ArrowRight className="w-6 h-6" />
          </Button>
        </div>
      </main>
    </div>
  );
}
