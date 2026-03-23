import { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowLeft, Volume2, Check, Flame, Loader2, Mic, X, RotateCcw, ChevronRight, Pencil, Star, User } from "lucide-react";
import { VocabularyWord, generateAudio, generateImage, regenerateImage, playAudio, markWordLearned, transcribeAudio, generateConfirmationAudio, generateExampleSentence, fetchLearnedWords, type Language, type ExampleSentence } from "@/lib/api";
import ExampleSentencePhase from "@/components/ExampleSentencePhase";
import RecognitionGame from "@/components/RecognitionGame";
import { playSuccessChime, playWordLearned } from "@/lib/sounds";
import { calculateSimilarity, isPronunciationCorrect, scoreLabel, splitIntoSyllables } from "@/lib/pronunciation";
import { useSyllableHighlight } from "@/hooks/useSyllableHighlight";
import { useSettings, type AudioSpeed } from "@/contexts/SettingsContext";

interface LearnSessionProps {
  words: VocabularyWord[];
  streak: number;
  onBack: (learnedIds: string[]) => void;
  onComplete?: (wordsLearned: number, learnedIds: string[]) => void;
  userId: string;
  language: Language;
}

const RECORDING_DURATION_MS = 3000;

const SPEED_OPTIONS: { value: AudioSpeed; label: string }[] = [
  { value: 0.5, label: "0.5×" },
  { value: 0.75, label: "0.75×" },
  { value: 1.0, label: "1×" },
  { value: 1.25, label: "1.25×" },
];

export default function LearnSession({
  words,
  streak,
  onBack,
  onComplete,
  userId,
  language,
}: LearnSessionProps) {
  const { voiceType, setVoiceType, audioSpeed, setAudioSpeed, childVoiceEnabled } = useSettings();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [hasHeardWord, setHasHeardWord] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [learnedWordIds, setLearnedWordIds] = useState<string[]>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [lastResult, setLastResult] = useState<"correct" | "incorrect" | null>(null);
  const [pronunciationScore, setPronunciationScore] = useState<number | null>(null);
  const [isPlayingConfirmation, setIsPlayingConfirmation] = useState(false);
  const [microphoneError, setMicrophoneError] = useState<string | null>(null);
  const [showEditImage, setShowEditImage] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);
  const [burstStarIndex, setBurstStarIndex] = useState<number | null>(null);

  const [phase, setPhase] = useState<'pronounce' | 'example' | 'recognition'>('pronounce');
  const [exampleSentence, setExampleSentence] = useState<ExampleSentence | null>(null);
  const [isLoadingExample, setIsLoadingExample] = useState(false);
  const [recognitionDistractors, setRecognitionDistractors] = useState<VocabularyWord[]>([]);
  const [allLearnedWords, setAllLearnedWords] = useState<VocabularyWord[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCorrectRef = useRef(false);
  const isStoppingRef = useRef(false);

  const maxAttempts = 3;
  const currentWord = words[currentIndex];
  const attemptsRemaining = maxAttempts - attempts;
  const isOutOfAttempts = attempts >= maxAttempts;

  // Syllable splitting + highlighting
  const syllables = currentWord ? splitIntoSyllables(currentWord.targetWord, language) : [];
  const { activeSyllableIndex } = useSyllableHighlight(syllables, currentAudioUrl, isAudioPlaying);

  useEffect(() => {
    if (!currentWord) return;

    setCurrentImageUrl(currentWord.imageUrl);
    setCurrentAudioUrl(currentWord.audioUrl);
    setHasHeardWord(false);
    setAttempts(0);
    setTranscription(null);
    setLastResult(null);
    setPronunciationScore(null);
    setIsRecording(false);
    setIsProcessing(false);
    isCorrectRef.current = false;
    isStoppingRef.current = false;
    setMicrophoneError(null);
    setPhase('pronounce');
    setExampleSentence(null);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!currentWord.imageUrl) {
      setIsLoadingImage(true);
      generateImage(currentWord.id)
        .then((url) => setCurrentImageUrl(url))
        .catch(console.error)
        .finally(() => setIsLoadingImage(false));
    }

    setIsLoadingAudio(true);
    generateAudio(currentWord.id, { mode: "learn", language, voiceType, speed: audioSpeed })
      .then((url) => {
        setCurrentAudioUrl(url);
        setTimeout(() => handlePlayAudioWithUrl(url), 500);
      })
      .catch(console.error)
      .finally(() => setIsLoadingAudio(false));

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [currentIndex, currentWord?.id, language, voiceType]);

  // Load all learned words once at mount (and when language changes)
  useEffect(() => {
    fetchLearnedWords(userId, language)
      .then(setAllLearnedWords)
      .catch(console.error);
  }, [userId, language]);

  // Prefetch example sentence whenever current word or learned-word pool changes
  useEffect(() => {
    if (!currentWord) return;
    setIsLoadingExample(true);
    const knownWords = allLearnedWords.map(w => w.targetWord);
    generateExampleSentence(currentWord.id, userId, language, knownWords, voiceType, audioSpeed)
      .then(setExampleSentence)
      .catch(console.error)
      .finally(() => setIsLoadingExample(false));
  }, [currentIndex, currentWord?.id, userId, language, allLearnedWords.length]);

  // Compute distractors for recognition game
  useEffect(() => {
    if (!currentWord) return;
    const candidates = allLearnedWords.filter(w => w.id !== currentWord.id);
    const shuffled = [...candidates];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setRecognitionDistractors(shuffled.slice(0, 5));
  }, [currentIndex, currentWord?.id, allLearnedWords.length]);

  const handleRegenerateImage = useCallback(
    async (prompt?: string) => {
      if (!currentWord) return;
      setIsRegeneratingImage(true);
      setShowEditImage(false);
      try {
        const url = await regenerateImage(currentWord.id, prompt);
        setCurrentImageUrl(url + "?t=" + Date.now());
      } catch (error) {
        console.error("Failed to regenerate image:", error);
      } finally {
        setIsRegeneratingImage(false);
        setCustomPrompt("");
      }
    },
    [currentWord]
  );

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
      generateAudio(currentWord.id, { mode: "learn", language, voiceType, speed: audioSpeed })
        .then((url) => {
          setCurrentAudioUrl(url);
          handlePlayAudioWithUrl(url);
        })
        .catch(console.error)
        .finally(() => setIsLoadingAudio(false));
    }
  }, [currentAudioUrl, currentWord, isLoadingAudio, handlePlayAudioWithUrl, language, voiceType]);

  const moveToNextWord = useCallback(
    async (celebrate = false) => {
      setIsTransitioning(true);
      try {
        if (celebrate) {
          playWordLearned();
          setBurstStarIndex(currentIndex);
          await new Promise((res) => setTimeout(res, 700));
          setBurstStarIndex(null);
        }

        if (currentWord) {
          try {
            await markWordLearned(userId, currentWord.id);
            setLearnedWordIds((prev) => [...prev, currentWord.id]);
            setAllLearnedWords((prev) =>
              prev.find(w => w.id === currentWord.id) ? prev : [...prev, currentWord]
            );
          } catch (error) {
            console.error("Failed to mark word as learned:", error);
          }
        }

        if (currentIndex >= words.length - 1) {
          setIsComplete(true);
          const allLearnedIds = currentWord
            ? [...learnedWordIds, currentWord.id]
            : learnedWordIds;
          onComplete?.(allLearnedIds.length, allLearnedIds);
        } else {
          setCurrentIndex((prev) => prev + 1);
        }
      } finally {
        setIsTransitioning(false);
      }
    },
    [currentIndex, words.length, currentWord, onComplete, learnedWordIds, userId]
  );

  const playConfirmationAndContinue = useCallback(async () => {
    if (!currentWord) return;
    setIsPlayingConfirmation(true);
    try {
      const confirmUrl = await generateConfirmationAudio(currentWord.targetWord, language, voiceType, audioSpeed);
      await playAudio(confirmUrl);
    } catch (error) {
      console.error("Confirmation audio failed:", error);
    } finally {
      setIsPlayingConfirmation(false);
      setPhase('example');
    }
  }, [currentWord, language, voiceType, audioSpeed]);

  const processRecording = useCallback(
    async (audioBlob: Blob, mimeType: string) => {
      if (!currentWord) return;

      return new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(",")[1];

          try {
            const result = await transcribeAudio(base64, mimeType, language);
            setTranscription(result.text);

            const score = calculateSimilarity(result.text, currentWord.targetWord, language);
            setPronunciationScore(score);

            if (isPronunciationCorrect(score)) {
              isCorrectRef.current = true;
              setLastResult("correct");
              playSuccessChime();
              setTimeout(() => playConfirmationAndContinue(), 300);
            } else {
              setLastResult("incorrect");
              setAttempts((prev) => prev + 1);
            }
          } catch (error) {
            console.error("Transcription error:", error);
            setLastResult("incorrect");
            setAttempts((prev) => prev + 1);
          } finally {
            setIsProcessing(false);
            resolve();
          }
        };
        reader.readAsDataURL(audioBlob);
      });
    },
    [currentWord, language, playConfirmationAndContinue]
  );

  const startRecording = useCallback(async () => {
    if (isRecording || isProcessing || isCorrectRef.current) return;

    setMicrophoneError(null);
    audioChunksRef.current = [];
    isStoppingRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        if (isStoppingRef.current) return;
        isStoppingRef.current = true;

        stream.getTracks().forEach((track) => track.stop());
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
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
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
    setPronunciationScore(null);
  }, []);

  const handleManualOverride = useCallback(() => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    playConfirmationAndContinue();
  }, [playConfirmationAndContinue, isTransitioning]);

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
    setPronunciationScore(null);
  }, []);

  const handleBack = useCallback(() => {
    onBack(learnedWordIds);
  }, [onBack, learnedWordIds]);

  const handleExampleContinue = useCallback(() => {
    if (recognitionDistractors.length >= 2) {
      setPhase('recognition');
    } else {
      moveToNextWord(true);
    }
  }, [recognitionDistractors.length, moveToNextWord]);

  const handleRecognitionComplete = useCallback(() => {
    moveToNextWord(true);
  }, [moveToNextWord]);

  // Score bar color
  function scoreColor(score: number) {
    if (score >= 75) return "bg-green-500";
    if (score >= 55) return "bg-amber-400";
    return "bg-red-500";
  }

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

  if (phase === 'example' && currentWord) {
    return (
      <ExampleSentencePhase
        word={currentWord}
        sentence={exampleSentence}
        isLoading={isLoadingExample}
        language={language}
        onContinue={handleExampleContinue}
        onSkip={handleExampleContinue}
      />
    );
  }

  if (phase === 'recognition' && currentWord) {
    return (
      <RecognitionGame
        targetWord={currentWord}
        distractors={recognitionDistractors}
        language={language}
        onComplete={handleRecognitionComplete}
        onSkip={handleRecognitionComplete}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 flex items-center justify-between gap-4 px-4 py-3 bg-background border-b">
        <Button size="icon" variant="ghost" onClick={handleBack} data-testid="button-back">
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-1 flex-wrap justify-center" data-testid="progress-stars">
            {Array.from({ length: words.length }).map((_, i) => (
              <motion.span
                key={i}
                data-testid={`star-${i}`}
                animate={
                  burstStarIndex === i
                    ? {
                        scale: [1, 1.8, 1.2, 1],
                        rotate: [0, -15, 15, 0],
                        filter: [
                          "brightness(1)",
                          "brightness(2)",
                          "brightness(1.5)",
                          "brightness(1)",
                        ],
                      }
                    : { scale: 1, rotate: 0 }
                }
                transition={{ duration: 0.6, ease: "easeOut" }}
              >
                <Star
                  className={`w-10 h-10 transition-colors duration-300 ${
                    i < currentIndex || burstStarIndex === i
                      ? "text-amber-400 fill-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.9)]"
                      : i === currentIndex
                      ? "text-amber-300 fill-amber-100"
                      : "text-muted-foreground/30"
                  }`}
                />
              </motion.span>
            ))}
          </div>
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
              {isLoadingImage || isRegeneratingImage ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-12 h-12 animate-spin text-primary" />
                  <p className="text-muted-foreground">
                    {isRegeneratingImage ? "Making new picture..." : "Creating picture..."}
                  </p>
                </div>
              ) : currentImageUrl ? (
                <img
                  src={currentImageUrl}
                  alt={`${currentWord.targetWord} - ${currentWord.english}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-6xl">{currentWord.english.charAt(0).toUpperCase()}</div>
              )}
              {!isLoadingImage && !isRegeneratingImage && (
                <button
                  className="absolute top-2 right-2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowEditImage(true);
                  }}
                  data-testid="button-edit-image"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Word display with syllable highlighting */}
            <div className="text-center space-y-1">
              <h2 className="text-3xl font-extrabold" data-testid="text-target-word">
                {syllables.map((syl, i) =>
                  syl === " " ? (
                    <span key={i}>&nbsp;</span>
                  ) : (
                    <span
                      key={i}
                      className={`transition-colors duration-150 ${
                        activeSyllableIndex === i
                          ? "text-primary underline decoration-2"
                          : ""
                      }`}
                    >
                      {syl}
                    </span>
                  )
                )}
              </h2>
              <p className="text-xl text-muted-foreground font-semibold" data-testid="text-english-word">
                {currentWord.english}
              </p>
            </div>

            {/* Audio controls row */}
            <div className="w-full max-w-xs flex gap-2 items-center">
              <Button
                size="lg"
                variant="secondary"
                className="flex-1 min-h-14 text-lg font-bold rounded-2xl gap-3"
                onClick={handlePlayAudio}
                disabled={isLoadingAudio || isAudioPlaying}
                data-testid="button-hear-word"
              >
                {isLoadingAudio ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <Volume2
                    className={`w-6 h-6 ${isAudioPlaying ? "animate-pulse text-primary" : ""}`}
                  />
                )}
                {isLoadingAudio
                  ? "Loading..."
                  : isAudioPlaying
                  ? "Playing..."
                  : hasHeardWord
                  ? "Hear Again"
                  : "Hear Word"}
              </Button>

              {/* Speed select */}
              <Select
                value={String(audioSpeed)}
                onValueChange={(v) => setAudioSpeed(parseFloat(v) as AudioSpeed)}
              >
                <SelectTrigger className="w-20 rounded-xl" data-testid="select-speed">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPEED_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Voice toggle */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="shrink-0">
                      <Button
                        size="icon"
                        variant={voiceType === "child" ? "default" : "outline"}
                        className="rounded-xl h-14 w-14 w-full"
                        onClick={() => setVoiceType(voiceType === "native" ? "child" : "native")}
                        disabled={!childVoiceEnabled}
                        data-testid="button-voice-toggle"
                      >
                        <User className="w-5 h-5" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px] text-center text-sm">
                    {childVoiceEnabled
                      ? voiceType === "child"
                        ? "Using child voice — tap to switch to native"
                        : "Using native voice — tap to switch to child"
                      : "Clone a voice in ElevenLabs and set ELEVENLABS_CHILD_VOICE_ID in your .env to enable"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Transcription + score result */}
            {transcription !== null && !isRecording && (
              <div
                className={`w-full p-3 rounded-xl text-center ${
                  lastResult === "correct"
                    ? "bg-green-100 dark:bg-green-900/30 border-2 border-green-500"
                    : lastResult === "incorrect"
                    ? "bg-red-100 dark:bg-red-900/30 border-2 border-red-500"
                    : "bg-muted"
                }`}
                data-testid="transcription-result"
              >
                <p className="text-sm text-muted-foreground mb-1">You said:</p>
                <p className="text-xl font-bold" data-testid="text-transcription">
                  {transcription}
                </p>

                {pronunciationScore !== null && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <Progress
                        value={pronunciationScore}
                        className={`h-2 flex-1 [&>div]:${scoreColor(pronunciationScore)}`}
                      />
                      <span className="text-sm font-bold w-10 text-right">
                        {pronunciationScore}%
                      </span>
                    </div>
                    <p
                      className={`text-sm font-semibold ${
                        lastResult === "correct" ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {lastResult === "correct" ? (
                        <span className="flex items-center justify-center gap-1">
                          <Check className="w-4 h-4" />
                          {scoreLabel(pronunciationScore)}
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-1">
                          <X className="w-4 h-4" />
                          {scoreLabel(pronunciationScore)}
                        </span>
                      )}
                    </p>
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
                  {attemptsRemaining} {attemptsRemaining === 1 ? "attempt" : "attempts"} left
                </Badge>
              </div>
              <Button
                size="lg"
                onClick={startRecording}
                disabled={isRecording || isAudioPlaying}
                className={`w-full min-h-16 text-xl font-bold rounded-2xl ${
                  isRecording ? "bg-red-500 hover:bg-red-600 animate-pulse" : ""
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

          {lastResult === "incorrect" && !isOutOfAttempts && (
            <>
              <Button
                size="lg"
                onClick={handleTryAgain}
                disabled={isTransitioning}
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
                  disabled={isTransitioning}
                  className="flex-1 min-h-12 text-sm font-semibold rounded-xl"
                  data-testid="button-manual-correct"
                >
                  <Check className="w-4 h-4 mr-1" />
                  Mark Correct
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => moveToNextWord()}
                  disabled={isTransitioning}
                  className="flex-1 min-h-12 text-sm font-semibold rounded-xl"
                  data-testid="button-skip"
                >
                  Skip
                </Button>
              </div>
            </>
          )}

          {isOutOfAttempts && lastResult === "incorrect" && (
            <>
              <div className="text-center text-muted-foreground py-2">
                <p>No more attempts. Let's try this one again later!</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleManualOverride}
                  disabled={isTransitioning}
                  className="flex-1 min-h-14 text-lg font-semibold rounded-xl"
                  data-testid="button-manual-correct-final"
                >
                  <Check className="w-5 h-5 mr-2" />
                  Mark as Correct
                </Button>
                <Button
                  size="lg"
                  onClick={() => moveToNextWord()}
                  disabled={isTransitioning}
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

      <Dialog open={showEditImage} onOpenChange={setShowEditImage}>
        <DialogContent className="max-w-sm rounded-2xl" data-testid="dialog-edit-image">
          <DialogHeader>
            <DialogTitle>Edit Image</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Button
              onClick={() => handleRegenerateImage()}
              className="min-h-12 text-base font-semibold rounded-xl"
              data-testid="button-regenerate-default"
            >
              <RotateCcw className="w-5 h-5 mr-2" />
              Generate New Image
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  or describe what you want
                </span>
              </div>
            </div>
            <Input
              placeholder="e.g. a cartoon cat playing outside"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customPrompt.trim()) {
                  handleRegenerateImage(customPrompt.trim());
                }
              }}
              data-testid="input-custom-prompt"
            />
            <Button
              onClick={() => handleRegenerateImage(customPrompt.trim())}
              disabled={!customPrompt.trim()}
              variant="secondary"
              className="min-h-12 text-base font-semibold rounded-xl"
              data-testid="button-regenerate-custom"
            >
              <Pencil className="w-5 h-5 mr-2" />
              Generate with Description
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export type { VocabularyWord as Word };
