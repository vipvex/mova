import { useState, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Volume2, ArrowRight, Check, Flame, Loader2 } from "lucide-react";
import { VocabularyWord, generateAudio, generateImage, playAudio, markWordLearned } from "@/lib/api";

interface LearnSessionProps {
  words: VocabularyWord[];
  streak: number;
  onBack: (learnedIds: string[]) => void;
  onComplete?: (wordsLearned: number, learnedIds: string[]) => void;
}

export default function LearnSession({ 
  words, 
  streak,
  onBack,
  onComplete
}: LearnSessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [hasHeardWord, setHasHeardWord] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [learnedWordIds, setLearnedWordIds] = useState<string[]>([]);

  const currentWord = words[currentIndex];
  const progress = words.length > 0 ? ((currentIndex + 1) / words.length) * 100 : 0;

  // Load image and audio for current word
  useEffect(() => {
    if (!currentWord) return;
    
    setCurrentImageUrl(currentWord.imageUrl);
    setCurrentAudioUrl(currentWord.audioUrl);
    setHasHeardWord(false);

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
        .then(url => {
          setCurrentAudioUrl(url);
          // Auto-play after loading
          setTimeout(() => handlePlayAudioWithUrl(url), 500);
        })
        .catch(console.error)
        .finally(() => setIsLoadingAudio(false));
    } else {
      // Auto-play existing audio
      setTimeout(() => handlePlayAudioWithUrl(currentWord.audioUrl!), 500);
    }
  }, [currentIndex, currentWord?.id]);

  const handlePlayAudioWithUrl = useCallback((audioUrl: string) => {
    setIsAudioPlaying(true);
    setHasHeardWord(true);
    playAudio(audioUrl)
      .catch(console.error)
      .finally(() => setIsAudioPlaying(false));
  }, []);

  const handlePlayAudio = useCallback(() => {
    if (currentAudioUrl) {
      handlePlayAudioWithUrl(currentAudioUrl);
    } else if (currentWord && !isLoadingAudio) {
      setIsLoadingAudio(true);
      generateAudio(currentWord.id)
        .then(url => {
          setCurrentAudioUrl(url);
          handlePlayAudioWithUrl(url);
        })
        .catch(console.error)
        .finally(() => setIsLoadingAudio(false));
    }
  }, [currentAudioUrl, currentWord, isLoadingAudio, handlePlayAudioWithUrl]);

  const handleNext = useCallback(async () => {
    // Mark word as learned
    if (currentWord) {
      try {
        await markWordLearned(currentWord.id);
        setLearnedWordIds(prev => [...prev, currentWord.id]);
      } catch (error) {
        console.error("Failed to mark word as learned:", error);
      }
    }

    if (currentIndex >= words.length - 1) {
      setIsComplete(true);
      const allLearnedIds = currentWord ? [...learnedWordIds, currentWord.id] : learnedWordIds;
      onComplete?.(allLearnedIds.length, allLearnedIds);
    } else {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, words.length, currentWord, onComplete, learnedWordIds]);

  const handleLearnMore = useCallback(() => {
    setCurrentIndex(0);
    setIsComplete(false);
    setHasHeardWord(false);
    setCurrentImageUrl(null);
    setCurrentAudioUrl(null);
    setLearnedWordIds([]);
  }, []);

  const handleBack = useCallback(() => {
    onBack(learnedWordIds);
  }, [onBack, learnedWordIds]);

  if (isComplete) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-50 flex items-center justify-between gap-4 px-4 py-3 bg-background border-b">
          <Button size="icon" variant="ghost" onClick={handleBack} data-testid="button-back">
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
              You learned {learnedWordIds.length} new words!
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
              onClick={handleBack}
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
        <Button size="icon" variant="ghost" onClick={handleBack} data-testid="button-back">
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
              className="relative w-full aspect-square max-w-sm rounded-2xl overflow-hidden bg-muted cursor-pointer flex items-center justify-center"
              onClick={handlePlayAudio}
              data-testid="learn-image-container"
            >
              {isLoadingImage ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-12 h-12 animate-spin text-primary" />
                  <p className="text-muted-foreground">Creating picture...</p>
                </div>
              ) : currentImageUrl ? (
                <img 
                  src={currentImageUrl} 
                  alt={`${currentWord.russian} - ${currentWord.english}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-6xl">
                  {currentWord.english.charAt(0).toUpperCase()}
                </div>
              )}
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
              disabled={isLoadingAudio}
              data-testid="button-hear-word"
            >
              {isLoadingAudio ? (
                <Loader2 className="w-7 h-7 animate-spin" />
              ) : (
                <Volume2 className={`w-7 h-7 ${isAudioPlaying ? 'animate-pulse text-primary' : ''}`} />
              )}
              {isLoadingAudio ? 'Loading...' : hasHeardWord ? 'Hear Again' : 'Hear Word'}
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

export type { VocabularyWord as Word };
