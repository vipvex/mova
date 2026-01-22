import { useState, useCallback, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Volume2, Check, Flame, Loader2, Mic, X, RotateCcw, ChevronRight } from "lucide-react";
import { VocabularyWord, generateAudio, generateImage, playAudio, markWordLearned, transcribeAudio, generateConfirmationAudio, type Language } from "@/lib/api";
import { playSuccessChime } from "@/lib/sounds";

interface LearnSessionProps {
  words: VocabularyWord[];
  streak: number;
  onBack: (learnedIds: string[]) => void;
  onComplete?: (wordsLearned: number, learnedIds: string[]) => void;
  userId: string;
  language: Language;
}

function normalizeWord(text: string, language: Language): string {
  let normalized = text
    .toLowerCase()
    .replace(/[.,!?;:'"«»\-—–¡¿]/g, '')
    .trim();
  
  if (language === 'russian') {
    normalized = normalized.replace(/ё/g, 'е');
  }
  
  return normalized;
}

const RECORDING_DURATION_MS = 3000;

export default function LearnSession({ 
  words, 
  streak,
  onBack,
  onComplete,
  userId,
  language,
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

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [lastResult, setLastResult] = useState<'correct' | 'incorrect' | null>(null);
  const [isPlayingConfirmation, setIsPlayingConfirmation] = useState(false);
  const [microphoneError, setMicrophoneError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCorrectRef = useRef(false);
  const isStoppingRef = useRef(false);

  const maxAttempts = 3;
  const currentWord = words[currentIndex];
  const progress = words.length > 0 ? ((currentIndex + 1) / words.length) * 100 : 0;
  const attemptsRemaining = maxAttempts - attempts;
  const isOutOfAttempts = attempts >= maxAttempts;

  useEffect(() => {
    if (!currentWord) return;
    
    setCurrentImageUrl(currentWord.imageUrl);
    setCurrentAudioUrl(currentWord.audioUrl);
    setHasHeardWord(false);
    setAttempts(0);
    setTranscription(null);
    setLastResult(null);
    setIsRecording(false);
    setIsProcessing(false);
    isCorrectRef.current = false;
    isStoppingRef.current = false;
    setMicrophoneError(null);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!currentWord.imageUrl) {
      setIsLoadingImage(true);
      generateImage(currentWord.id)
        .then(url => setCurrentImageUrl(url))
        .catch(console.error)
        .finally(() => setIsLoadingImage(false));
    }

    setIsLoadingAudio(true);
    generateAudio(currentWord.id, { mode: 'learn', language })
      .then(url => {
        setCurrentAudioUrl(url);
        setTimeout(() => handlePlayAudioWithUrl(url), 500);
      })
      .catch(console.error)
      .finally(() => setIsLoadingAudio(false));

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [currentIndex, currentWord?.id, language]);

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
      generateAudio(currentWord.id, { mode: 'learn', language })
        .then(url => {
          setCurrentAudioUrl(url);
          handlePlayAudioWithUrl(url);
        })
        .catch(console.error)
        .finally(() => setIsLoadingAudio(false));
    }
  }, [currentAudioUrl, currentWord, isLoadingAudio, handlePlayAudioWithUrl, language]);

  const moveToNextWord = useCallback(async () => {
    if (currentWord) {
      try {
        await markWordLearned(userId, currentWord.id);
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
  }, [currentIndex, words.length, currentWord, onComplete, learnedWordIds, userId]);

  const playConfirmationAndContinue = useCallback(async () => {
    if (!currentWord) return;
    setIsPlayingConfirmation(true);
    try {
      const confirmUrl = await generateConfirmationAudio(currentWord.targetWord, language);
      await playAudio(confirmUrl);
    } catch (error) {
      console.error("Confirmation audio failed:", error);
    } finally {
      setIsPlayingConfirmation(false);
      moveToNextWord();
    }
  }, [currentWord, language, moveToNextWord]);

  const processRecording = useCallback(async (audioBlob: Blob, mimeType: string) => {
    if (!currentWord) return;

    return new Promise<void>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        
        try {
          const result = await transcribeAudio(base64, mimeType, language);
          setTranscription(result.text);
          
          const normalizedTranscription = normalizeWord(result.text, language);
          const normalizedTarget = normalizeWord(currentWord.targetWord, language);
          
          if (normalizedTranscription === normalizedTarget || 
              normalizedTranscription.includes(normalizedTarget) ||
              normalizedTarget.includes(normalizedTranscription)) {
            isCorrectRef.current = true;
            setLastResult('correct');
            playSuccessChime();
            setTimeout(() => playConfirmationAndContinue(), 300);
          } else {
            setLastResult('incorrect');
            setAttempts(prev => prev + 1);
          }
        } catch (error) {
          console.error("Transcription error:", error);
          setLastResult('incorrect');
          setAttempts(prev => prev + 1);
        } finally {
          setIsProcessing(false);
          resolve();
        }
      };
      reader.readAsDataURL(audioBlob);
    });
  }, [currentWord, language, playConfirmationAndContinue]);

  const startRecording = useCallback(async () => {
    if (isRecording || isProcessing || isCorrectRef.current) return;

    setMicrophoneError(null);
    audioChunksRef.current = [];
    isStoppingRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (isStoppingRef.current) return;
        isStoppingRef.current = true;

        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;

        if (audioChunksRef.current.length > 0 && !isCorrectRef.current) {
          setIsProcessing(true);
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          await processRecording(audioBlob, mimeType);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);

      timeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
        }
      }, RECORDING_DURATION_MS);

    } catch (error) {
      console.error("Microphone access error:", error);
      setMicrophoneError("Could not access microphone. Please check permissions.");
    }
  }, [isRecording, isProcessing, processRecording]);

  const handleTryAgain = useCallback(() => {
    setTranscription(null);
    setLastResult(null);
  }, []);

  const handleManualOverride = useCallback(() => {
    playSuccessChime();
    setTimeout(() => playConfirmationAndContinue(), 300);
  }, [playConfirmationAndContinue]);

  const handleLearnMore = useCallback(() => {
    setCurrentIndex(0);
    setIsComplete(false);
    setHasHeardWord(false);
    setCurrentImageUrl(null);
    setCurrentAudioUrl(null);
    setLearnedWordIds([]);
    setAttempts(0);
    setTranscription(null);
    setLastResult(null);
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

      <main className="flex-1 flex flex-col justify-center py-6 gap-6 px-4">
        {currentWord && (
          <Card className="w-full max-w-md mx-auto p-6 flex flex-col items-center gap-4 rounded-3xl">
            <div 
              className="relative w-full aspect-square max-w-xs rounded-2xl overflow-hidden bg-muted cursor-pointer flex items-center justify-center"
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
                  alt={`${currentWord.targetWord} - ${currentWord.english}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-6xl">
                  {currentWord.english.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-3xl font-extrabold" data-testid="text-target-word">
                {currentWord.targetWord}
              </h2>
              <p className="text-xl text-muted-foreground font-semibold" data-testid="text-english-word">
                {currentWord.english}
              </p>
            </div>

            <Button
              size="lg"
              variant="secondary"
              className="w-full max-w-xs min-h-14 text-lg font-bold rounded-2xl gap-3"
              onClick={handlePlayAudio}
              disabled={isLoadingAudio}
              data-testid="button-hear-word"
            >
              {isLoadingAudio ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <Volume2 className={`w-6 h-6 ${isAudioPlaying ? 'animate-pulse text-primary' : ''}`} />
              )}
              {isLoadingAudio ? 'Loading...' : hasHeardWord ? 'Hear Again' : 'Hear Word'}
            </Button>

            {transcription !== null && !isRecording && (
              <div 
                className={`w-full p-3 rounded-xl text-center ${
                  lastResult === 'correct' 
                    ? 'bg-green-100 dark:bg-green-900/30 border-2 border-green-500' 
                    : lastResult === 'incorrect'
                    ? 'bg-red-100 dark:bg-red-900/30 border-2 border-red-500'
                    : 'bg-muted'
                }`}
                data-testid="transcription-result"
              >
                <p className="text-sm text-muted-foreground mb-1">You said:</p>
                <p className="text-xl font-bold" data-testid="text-transcription">{transcription}</p>
                {lastResult === 'correct' && (
                  <div className="flex items-center justify-center gap-2 mt-2 text-green-600">
                    <Check className="w-5 h-5" />
                    <span className="font-semibold">Correct!</span>
                  </div>
                )}
                {lastResult === 'incorrect' && (
                  <div className="flex items-center justify-center gap-2 mt-2 text-red-600">
                    <X className="w-5 h-5" />
                    <span className="font-semibold">Try again!</span>
                  </div>
                )}
              </div>
            )}

            {microphoneError && (
              <div className="w-full p-3 rounded-xl text-center bg-amber-100 dark:bg-amber-900/30 border-2 border-amber-500">
                <p className="text-sm text-amber-700 dark:text-amber-300">{microphoneError}</p>
              </div>
            )}

            {(isProcessing || isPlayingConfirmation) && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{isPlayingConfirmation ? "Great job!" : "Listening..."}</span>
              </div>
            )}
          </Card>
        )}

        <div className="w-full max-w-md mx-auto flex flex-col gap-3">
          {hasHeardWord && !lastResult && !isProcessing && !isPlayingConfirmation && (
            <>
              <p className="text-center text-muted-foreground">Now say the word!</p>
              <div className="flex gap-2 items-center justify-center">
                <Badge variant="secondary" className="text-sm">
                  {attemptsRemaining} {attemptsRemaining === 1 ? 'attempt' : 'attempts'} left
                </Badge>
              </div>
              <Button
                size="lg"
                onClick={startRecording}
                disabled={isRecording}
                className={`w-full min-h-16 text-xl font-bold rounded-2xl ${
                  isRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : ''
                }`}
                data-testid="button-record"
              >
                {isRecording ? (
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 bg-white rounded-full animate-ping" />
                    <span>Listening...</span>
                  </div>
                ) : (
                  <>
                    <Mic className="w-6 h-6 mr-2" />
                    Say the Word
                  </>
                )}
              </Button>
            </>
          )}

          {lastResult === 'incorrect' && !isOutOfAttempts && (
            <>
              <Button
                size="lg"
                onClick={handleTryAgain}
                className="w-full min-h-14 text-lg font-bold rounded-2xl"
                data-testid="button-try-again"
              >
                <RotateCcw className="w-5 h-5 mr-2" />
                Try Again ({attemptsRemaining} left)
              </Button>
              <div className="flex gap-2">
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleManualOverride}
                  className="flex-1 min-h-12 text-sm font-semibold rounded-xl"
                  data-testid="button-manual-correct"
                >
                  <Check className="w-4 h-4 mr-1" />
                  Mark Correct
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={moveToNextWord}
                  className="flex-1 min-h-12 text-sm font-semibold rounded-xl"
                  data-testid="button-skip"
                >
                  Skip
                </Button>
              </div>
            </>
          )}

          {isOutOfAttempts && lastResult === 'incorrect' && (
            <>
              <div className="text-center text-muted-foreground py-2">
                <p>No more attempts. Let's try this one again later!</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleManualOverride}
                  className="flex-1 min-h-14 text-lg font-semibold rounded-xl"
                  data-testid="button-manual-correct-final"
                >
                  <Check className="w-5 h-5 mr-2" />
                  Mark as Correct
                </Button>
                <Button
                  size="lg"
                  onClick={moveToNextWord}
                  className="flex-1 min-h-14 text-lg font-semibold rounded-xl"
                  data-testid="button-next-word"
                >
                  <ChevronRight className="w-5 h-5 mr-2" />
                  Next Word
                </Button>
              </div>
            </>
          )}

          {!hasHeardWord && !isLoadingAudio && (
            <p className="text-center text-muted-foreground">
              Listen to the word first, then say it!
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center max-w-md mx-auto">
          Parent tip: If the app misunderstands, use "Mark Correct" to override.
        </p>
      </main>
    </div>
  );
}

export type { VocabularyWord as Word };
