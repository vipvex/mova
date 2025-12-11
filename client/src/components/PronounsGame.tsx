import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowLeft, Volume2, Mic, Check, X, Loader2, Star, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { generateTextAudio, playAudio, transcribeAudio, Language } from "@/lib/api";
import { apiRequest } from "@/lib/queryClient";

// Simple sound effects using Web Audio API
const playCorrectSound = () => {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
  oscillator.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
  oscillator.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.2); // G5
  gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
  oscillator.start(audioCtx.currentTime);
  oscillator.stop(audioCtx.currentTime + 0.4);
};

const playIncorrectSound = () => {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  oscillator.frequency.setValueAtTime(200, audioCtx.currentTime);
  oscillator.frequency.setValueAtTime(150, audioCtx.currentTime + 0.15);
  gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
  oscillator.start(audioCtx.currentTime);
  oscillator.stop(audioCtx.currentTime + 0.3);
};

import girlImg from "@assets/generated_images/cartoon_girl_for_pronouns.png";
import boyImg from "@assets/generated_images/cartoon_boy_for_pronouns.png";
import adultImg from "@assets/generated_images/cartoon_adult_for_pronouns.png";
import momDaughterImg from "@assets/generated_images/mom_and_daughter_cartoon.png";
import familyImg from "@assets/generated_images/family_group_cartoon.png";
import pointingImg from "@assets/generated_images/pointing_hand_for_you.png";
import groupImg from "@assets/generated_images/group_of_children.png";

interface PronounData {
  pronoun: string;
  english: string;
  image: string;
  description: string;
}

const RUSSIAN_PRONOUNS: PronounData[] = [
  { pronoun: "Я", english: "I", image: "self", description: "Me/I" },
  { pronoun: "Ты", english: "You (informal)", image: pointingImg, description: "You (one person)" },
  { pronoun: "Он", english: "He", image: boyImg, description: "He/Boy" },
  { pronoun: "Она", english: "She", image: girlImg, description: "She/Girl" },
  { pronoun: "Мы", english: "We", image: familyImg, description: "We/Family" },
  { pronoun: "Вы", english: "You (formal/plural)", image: adultImg, description: "You (formal)" },
  { pronoun: "Они", english: "They", image: groupImg, description: "They/Group" },
];

const SPANISH_PRONOUNS: PronounData[] = [
  { pronoun: "Yo", english: "I", image: "self", description: "Me/I" },
  { pronoun: "Tú", english: "You (informal)", image: pointingImg, description: "You (one person)" },
  { pronoun: "Él", english: "He", image: boyImg, description: "He/Boy" },
  { pronoun: "Ella", english: "She", image: girlImg, description: "She/Girl" },
  { pronoun: "Nosotros", english: "We", image: familyImg, description: "We/Family" },
  { pronoun: "Ustedes", english: "You (formal/plural)", image: adultImg, description: "You (formal)" },
  { pronoun: "Ellos", english: "They", image: groupImg, description: "They/Group" },
];

interface PronounsGameProps {
  userId: string;
  exerciseId: string;
  language: Language;
  selfPhoto?: string;
  onBack: () => void;
  onComplete: () => void;
}

export default function PronounsGame({
  userId,
  exerciseId,
  language,
  selfPhoto,
  onBack,
  onComplete,
}: PronounsGameProps) {
  const [level, setLevel] = useState<1 | 2>(1);
  const [currentRound, setCurrentRound] = useState(0);
  const [score, setScore] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showFeedback, setShowFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [gameComplete, setGameComplete] = useState(false);
  const [questionOrder, setQuestionOrder] = useState<number[]>([]);
  const [audioCache, setAudioCache] = useState<Record<string, string>>({});
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [transcriptionResult, setTranscriptionResult] = useState<string | null>(null);
  const [starsUnlocked, setStarsUnlocked] = useState<boolean[]>(Array(10).fill(false));
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const pronouns = language === "russian" ? RUSSIAN_PRONOUNS : SPANISH_PRONOUNS;
  const ROUNDS_PER_LEVEL = 10;

  useEffect(() => {
    // Generate 10 rounds by cycling through pronouns multiple times
    const baseOrder = Array.from({ length: pronouns.length }, (_, i) => i);
    // Shuffle base order
    for (let i = baseOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [baseOrder[i], baseOrder[j]] = [baseOrder[j], baseOrder[i]];
    }
    // Repeat to get 10+ items, then take first 10
    const extended = [...baseOrder, ...baseOrder].slice(0, ROUNDS_PER_LEVEL);
    // Shuffle again for variety
    for (let i = extended.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [extended[i], extended[j]] = [extended[j], extended[i]];
    }
    setQuestionOrder(extended);
    setTotalQuestions(ROUNDS_PER_LEVEL);
    // Reset stars when level changes
    setStarsUnlocked(Array(10).fill(false));
    setTranscriptionResult(null);
  }, [level, pronouns.length]);

  useEffect(() => {
    const preloadAudio = async () => {
      if (level === 1 && questionOrder.length > 0 && currentRound < questionOrder.length) {
        const currentPronoun = pronouns[questionOrder[currentRound]];
        if (!audioCache[currentPronoun.pronoun]) {
          setIsLoadingAudio(true);
          try {
            const audioUrl = await generateTextAudio(currentPronoun.pronoun, language);
            setAudioCache(prev => ({ ...prev, [currentPronoun.pronoun]: audioUrl }));
          } catch (error) {
            console.error("Failed to preload audio:", error);
          }
          setIsLoadingAudio(false);
        }
      }
    };
    preloadAudio();
  }, [currentRound, questionOrder, level, pronouns, language, audioCache]);

  const currentPronounIndex = questionOrder[currentRound] ?? 0;
  const currentPronoun = pronouns[currentPronounIndex];

  const playPronounAudio = useCallback(async () => {
    if (!currentPronoun) return;
    setIsPlaying(true);
    try {
      let audioUrl = audioCache[currentPronoun.pronoun];
      if (!audioUrl) {
        audioUrl = await generateTextAudio(currentPronoun.pronoun, language);
        setAudioCache(prev => ({ ...prev, [currentPronoun.pronoun]: audioUrl }));
      }
      await playAudio(audioUrl);
    } catch (error) {
      console.error("Audio playback failed:", error);
    }
    setIsPlaying(false);
  }, [currentPronoun, audioCache, language]);

  useEffect(() => {
    if (level === 1 && !showFeedback && !gameComplete && questionOrder.length > 0 && !isLoadingAudio) {
      const timer = setTimeout(() => {
        playPronounAudio();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentRound, level, showFeedback, gameComplete, questionOrder.length, isLoadingAudio]);

  // Play AI voice feedback
  const playVoiceFeedback = useCallback(async (isCorrect: boolean, correctPronoun: string) => {
    try {
      let feedbackText: string;
      if (isCorrect) {
        feedbackText = language === "russian" ? "Молодец!" : "¡Muy bien!";
      } else {
        feedbackText = language === "russian" 
          ? `Нет, это ${correctPronoun}` 
          : `No, es ${correctPronoun}`;
      }
      const audioUrl = await generateTextAudio(feedbackText, language);
      await playAudio(audioUrl);
    } catch (error) {
      console.error("Failed to play voice feedback:", error);
    }
  }, [language]);

  const handleImageTap = useCallback(async (index: number) => {
    if (showFeedback || level !== 1) return;
    
    const isCorrect = index === currentPronounIndex;
    const wasLevel1 = level === 1;
    const roundToAdvance = currentRound;
    
    setShowFeedback(isCorrect ? "correct" : "incorrect");
    
    // Play sound effect
    if (isCorrect) {
      playCorrectSound();
      setScore(prev => prev + 1);
      // Unlock star for this round
      setStarsUnlocked(prev => {
        const newStars = [...prev];
        newStars[roundToAdvance] = true;
        return newStars;
      });
    } else {
      playIncorrectSound();
    }

    // Play AI voice feedback and wait for it to complete
    await playVoiceFeedback(isCorrect, currentPronoun.pronoun);

    // Now advance to next round after audio finishes
    setShowFeedback(null);
    if (roundToAdvance + 1 >= ROUNDS_PER_LEVEL) {
      if (wasLevel1) {
        setLevel(2);
        setCurrentRound(0);
      } else {
        setGameComplete(true);
        recordProgress();
      }
    } else {
      setCurrentRound(prev => prev + 1);
    }
  }, [showFeedback, level, currentPronounIndex, currentRound, currentPronoun, playVoiceFeedback]);

  const startRecording = useCallback(async () => {
    if (level !== 2 || isRecording) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await processRecording(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);

      recordingTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
        }
      }, 3000);
    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  }, [level, isRecording]);

  const processRecording = async (audioBlob: Blob) => {
    const roundToAdvance = currentRound;
    const pronounToCheck = currentPronoun;
    
    try {
      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = (reader.result as string).split(",")[1];
          resolve(result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });
      
      const result = await transcribeAudio(base64Audio, audioBlob.type, language);
      
      const spokenText = result.text.toLowerCase().replace(/[.,!?]/g, "").trim();
      const expectedText = pronounToCheck.pronoun.toLowerCase();
      
      // Store transcription result for parent debugging
      setTranscriptionResult(result.text);
      
      const isCorrect = spokenText === expectedText || 
                        spokenText.includes(expectedText) ||
                        expectedText.includes(spokenText);
      
      setShowFeedback(isCorrect ? "correct" : "incorrect");
      
      // Play sound effect
      if (isCorrect) {
        playCorrectSound();
        setScore(prev => prev + 1);
        // Unlock star for this round
        setStarsUnlocked(prev => {
          const newStars = [...prev];
          newStars[roundToAdvance] = true;
          return newStars;
        });
      } else {
        playIncorrectSound();
      }

      // Play AI voice feedback and wait for it to complete
      await playVoiceFeedback(isCorrect, pronounToCheck.pronoun);

      // Now advance to next round after audio finishes
      setShowFeedback(null);
      setTranscriptionResult(null);
      if (roundToAdvance + 1 >= ROUNDS_PER_LEVEL) {
        setGameComplete(true);
        recordProgress();
      } else {
        setCurrentRound(prev => prev + 1);
      }
    } catch (error) {
      console.error("Transcription failed:", error);
      playIncorrectSound();
      setShowFeedback("incorrect");
      setTranscriptionResult("(Failed to transcribe)");
      
      // Wait before advancing
      await new Promise(resolve => setTimeout(resolve, 1500));
      setShowFeedback(null);
      setTranscriptionResult(null);
    }
  };

  const recordProgress = async () => {
    try {
      await apiRequest("POST", `/api/users/${userId}/grammar-exercises/${exerciseId}/practice`);
    } catch (error) {
      console.error("Failed to record progress:", error);
    }
  };

  const restartGame = () => {
    setLevel(1);
    setCurrentRound(0);
    setScore(0);
    setGameComplete(false);
    setShowFeedback(null);
    setStarsUnlocked(Array(10).fill(false));
    setTranscriptionResult(null);
    const baseOrder = Array.from({ length: pronouns.length }, (_, i) => i);
    for (let i = baseOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [baseOrder[i], baseOrder[j]] = [baseOrder[j], baseOrder[i]];
    }
    const extended = [...baseOrder, ...baseOrder].slice(0, ROUNDS_PER_LEVEL);
    for (let i = extended.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [extended[i], extended[j]] = [extended[j], extended[i]];
    }
    setQuestionOrder(extended);
  };

  const getImageSrc = (imageData: string) => {
    if (imageData === "self") {
      return selfPhoto || girlImg;
    }
    return imageData;
  };

  if (gameComplete) {
    const totalPossible = ROUNDS_PER_LEVEL * 2;
    const percentage = Math.round((score / totalPossible) * 100);
    
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md w-full">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="mb-6"
          >
            <div className="w-24 h-24 mx-auto bg-yellow-100 dark:bg-yellow-900/40 rounded-full flex items-center justify-center mb-4">
              <Star className="w-12 h-12 text-yellow-500 fill-yellow-500" />
            </div>
          </motion.div>
          
          <h2 className="text-3xl font-bold mb-2" data-testid="text-game-complete">
            {language === "russian" ? "Отлично!" : "¡Excelente!"}
          </h2>
          <p className="text-muted-foreground mb-6">
            You scored {score} out of {totalPossible} ({percentage}%)
          </p>
          
          <div className="flex flex-col gap-3">
            <Button onClick={restartGame} size="lg" className="gap-2" data-testid="button-play-again">
              <RotateCcw className="w-5 h-5" />
              Play Again
            </Button>
            <Button variant="outline" onClick={onComplete} size="lg" data-testid="button-finish">
              Finish
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-6">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              data-testid="button-game-back"
            >
              <ArrowLeft className="w-6 h-6" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-game-title">
                {language === "russian" ? "Местоимения" : "Pronombres"}
              </h1>
              <p className="text-muted-foreground">
                Level {level}: {level === 1 ? "Listen & Tap" : "See & Speak"}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Score</p>
              <p className="font-bold text-green-600 dark:text-green-400">{score}</p>
            </div>
          </div>
        </div>

        {/* 10 Star Progress Grid */}
        <Card className="p-4 mb-6">
          <div className="flex items-center justify-center gap-2" data-testid="star-progress-grid">
            {starsUnlocked.map((unlocked, index) => (
              <motion.div
                key={index}
                initial={false}
                animate={unlocked ? { scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] } : {}}
                transition={{ duration: 0.3 }}
              >
                <Star
                  className={`w-6 h-6 sm:w-8 sm:h-8 transition-colors ${
                    index < currentRound
                      ? unlocked
                        ? "text-yellow-500 fill-yellow-500"
                        : "text-muted-foreground/30"
                      : index === currentRound
                      ? "text-yellow-400"
                      : "text-muted-foreground/20"
                  }`}
                  data-testid={`star-${index}`}
                />
              </motion.div>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground mt-2">
            Round {currentRound + 1} of {ROUNDS_PER_LEVEL}
          </p>
        </Card>

        {level === 1 ? (
          <div className="space-y-6">
            <Card className="p-6 text-center">
              <p className="text-lg text-muted-foreground mb-4">
                Listen and tap the correct picture
              </p>
              <Button
                size="lg"
                onClick={playPronounAudio}
                disabled={isPlaying || isLoadingAudio}
                className="gap-2"
                data-testid="button-play-audio"
              >
                {isPlaying || isLoadingAudio ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <Volume2 className="w-6 h-6" />
                )}
                {isLoadingAudio ? "Loading..." : "Play Sound"}
              </Button>
            </Card>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {pronouns.map((p, index) => (
                <motion.div
                  key={p.pronoun}
                  whileTap={{ scale: 0.95 }}
                >
                  <Card
                    className={`p-3 cursor-pointer overflow-visible transition-all ${
                      showFeedback && index === currentPronounIndex
                        ? "ring-4 ring-green-500"
                        : showFeedback === "incorrect" && index !== currentPronounIndex
                        ? ""
                        : "hover-elevate active-elevate-2"
                    }`}
                    onClick={() => handleImageTap(index)}
                    data-testid={`card-pronoun-${index}`}
                  >
                    <div className="aspect-square rounded-md overflow-hidden mb-2 bg-muted">
                      <img
                        src={getImageSrc(p.image)}
                        alt={p.description}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <p className="text-xs text-center text-muted-foreground truncate">
                      {p.description}
                    </p>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <Card className="p-6 text-center">
              <p className="text-lg text-muted-foreground mb-4">
                Say the pronoun for this picture
              </p>
              <div className="w-48 h-48 mx-auto rounded-lg overflow-hidden bg-muted mb-4">
                <img
                  src={getImageSrc(currentPronoun.image)}
                  alt={currentPronoun.description}
                  className="w-full h-full object-cover"
                  data-testid="img-target-pronoun"
                />
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {currentPronoun.english}
              </p>
              
              <Button
                size="lg"
                onClick={startRecording}
                disabled={isRecording || showFeedback !== null}
                className={`gap-2 ${isRecording ? "bg-red-500 hover:bg-red-600" : ""}`}
                data-testid="button-record"
              >
                {isRecording ? (
                  <>
                    <Mic className="w-6 h-6 animate-pulse" />
                    Recording...
                  </>
                ) : (
                  <>
                    <Mic className="w-6 h-6" />
                    Tap to Speak
                  </>
                )}
              </Button>
              
              {/* Transcription Result Display for Parent Debugging */}
              {transcriptionResult && (
                <div className="mt-4 p-3 bg-muted rounded-md" data-testid="transcription-result">
                  <p className="text-xs text-muted-foreground mb-1">What was heard:</p>
                  <p className="text-lg font-semibold" data-testid="text-transcription">
                    "{transcriptionResult}"
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Expected: {currentPronoun.pronoun}
                  </p>
                </div>
              )}
            </Card>
          </div>
        )}

        <AnimatePresence>
          {showFeedback && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="fixed inset-0 flex items-center justify-center pointer-events-none z-50"
            >
              <div
                className={`w-32 h-32 rounded-full flex items-center justify-center ${
                  showFeedback === "correct"
                    ? "bg-green-500"
                    : "bg-red-500"
                }`}
              >
                {showFeedback === "correct" ? (
                  <Check className="w-16 h-16 text-white" />
                ) : (
                  <X className="w-16 h-16 text-white" />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
