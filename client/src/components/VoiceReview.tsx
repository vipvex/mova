import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Mic, Volume2, Check, X, RotateCcw, ChevronRight, Loader2, Pencil, User } from "lucide-react";
import { transcribeAudio, playAudio, generateAudio, regenerateImage, generateConfirmationAudio, type Language } from "@/lib/api";
import { playSuccessChime } from "@/lib/sounds";
import { calculateSimilarity, isPronunciationCorrect, scoreLabel, splitIntoSyllables } from "@/lib/pronunciation";
import { useSyllableHighlight } from "@/hooks/useSyllableHighlight";
import { useSettings, type AudioSpeed } from "@/contexts/SettingsContext";

interface VoiceReviewProps {
  targetWord: string;
  englishWord: string;
  wordId: string;
  audioUrl: string | null;
  imageUrl: string | null;
  language: Language;
  onCorrect: () => void;
  onIncorrect: () => void;
  onImageRegenerated?: (newUrl: string) => void;
}

const RECORDING_DURATION_MS = 3000;

const SPEED_OPTIONS: { value: AudioSpeed; label: string }[] = [
  { value: 0.5, label: "0.5×" },
  { value: 0.75, label: "0.75×" },
  { value: 1.0, label: "1×" },
  { value: 1.25, label: "1.25×" },
];

export default function VoiceReview({
  targetWord,
  englishWord,
  wordId,
  audioUrl,
  imageUrl,
  language,
  onCorrect,
  onIncorrect,
  onImageRegenerated,
}: VoiceReviewProps) {
  const { voiceType, setVoiceType, audioSpeed, setAudioSpeed, childVoiceEnabled } = useSettings();

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [lastResult, setLastResult] = useState<"correct" | "incorrect" | null>(null);
  const [pronunciationScore, setPronunciationScore] = useState<number | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [currentAudioUrl, setCurrentAudioUrl] = useState(audioUrl);
  const [isPlayingConfirmation, setIsPlayingConfirmation] = useState(false);
  const [microphoneError, setMicrophoneError] = useState<string | null>(null);
  const [showWord, setShowWord] = useState(false);
  const [showEditImage, setShowEditImage] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);
  const [displayImageUrl, setDisplayImageUrl] = useState(imageUrl);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCorrectRef = useRef(false);
  const isStoppingRef = useRef(false);

  const maxAttempts = 3;

  // Syllable splitting + highlighting
  const syllables = splitIntoSyllables(targetWord, language);
  const { activeSyllableIndex } = useSyllableHighlight(syllables, currentAudioUrl, isPlayingAudio);

  useEffect(() => {
    setAttempts(0);
    setTranscription(null);
    setLastResult(null);
    setPronunciationScore(null);
    setIsRecording(false);
    setIsProcessing(false);
    setCurrentAudioUrl(audioUrl);
    isCorrectRef.current = false;
    isStoppingRef.current = false;
    setMicrophoneError(null);
    setShowWord(false);
    setDisplayImageUrl(imageUrl);

    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (retryTimeoutRef.current) { clearTimeout(retryTimeoutRef.current); retryTimeoutRef.current = null; }

    if (!audioUrl) {
      generateAudio(wordId, { voiceType, speed: audioSpeed })
        .then((url) => setCurrentAudioUrl(url))
        .catch(console.error);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [wordId, audioUrl, imageUrl]);

  const handleRegenerateImage = useCallback(
    async (prompt?: string) => {
      setIsRegeneratingImage(true);
      setShowEditImage(false);
      try {
        const url = await regenerateImage(wordId, prompt);
        const newUrl = url + "?t=" + Date.now();
        setDisplayImageUrl(newUrl);
        onImageRegenerated?.(newUrl);
      } catch (error) {
        console.error("Failed to regenerate image:", error);
      } finally {
        setIsRegeneratingImage(false);
        setCustomPrompt("");
      }
    },
    [wordId, onImageRegenerated]
  );

  const handlePlayAudio = useCallback(async () => {
    if (currentAudioUrl && !isPlayingAudio) {
      setIsPlayingAudio(true);
      try {
        await playAudio(currentAudioUrl);
      } catch (error) {
        console.error("Audio playback failed:", error);
      } finally {
        setIsPlayingAudio(false);
      }
    }
  }, [currentAudioUrl, isPlayingAudio]);

  const playConfirmationAndContinue = useCallback(async () => {
    setIsPlayingConfirmation(true);
    try {
      const confirmUrl = await generateConfirmationAudio(targetWord, language, voiceType, audioSpeed);
      await playAudio(confirmUrl);
    } catch (error) {
      console.error("Confirmation audio failed:", error);
    } finally {
      setIsPlayingConfirmation(false);
      onCorrect();
    }
  }, [targetWord, language, voiceType, audioSpeed, onCorrect]);

  const processRecording = useCallback(
    async (audioBlob: Blob, mimeType: string) => {
      return new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(",")[1];

          try {
            const result = await transcribeAudio(base64, mimeType, language);
            setTranscription(result.text);

            const score = calculateSimilarity(result.text, targetWord, language);
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
            console.error("Transcription failed:", error);
            setTranscription("(Could not understand audio)");
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
    [targetWord, language, playConfirmationAndContinue]
  );

  const startRecording = useCallback(async () => {
    try {
      isCorrectRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4",
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        isStoppingRef.current = false;

        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }

        if (isCorrectRef.current || audioChunksRef.current.length === 0) {
          setIsProcessing(false);
          return;
        }

        setIsProcessing(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        await processRecording(audioBlob, mediaRecorder.mimeType);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setTranscription(null);
      setLastResult(null);
      setPronunciationScore(null);

      timeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          setIsRecording(false);
          setIsProcessing(true);
          isStoppingRef.current = true;
          mediaRecorderRef.current.stop();
        }
      }, RECORDING_DURATION_MS);
    } catch (error) {
      console.error("Failed to start recording:", error);
      if (error instanceof Error) {
        if (error.name === "NotFoundError" || error.name === "NotAllowedError") {
          setMicrophoneError("Could not access microphone. Please allow microphone access and try again.");
        } else {
          setMicrophoneError("Could not start recording. Please try again.");
        }
      }
    }
  }, [processRecording]);

  const handleTryAgain = useCallback(() => {
    if (retryTimeoutRef.current) { clearTimeout(retryTimeoutRef.current); retryTimeoutRef.current = null; }

    setTranscription(null);
    setLastResult(null);
    setPronunciationScore(null);
    setMicrophoneError(null);

    const checkAndStart = () => {
      if (microphoneError) { retryTimeoutRef.current = null; return; }
      retryTimeoutRef.current = null;
      const recorderStopped = !mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive";
      const notStopping = !isStoppingRef.current;
      const streamClosed = !streamRef.current || streamRef.current.getTracks().every((t) => t.readyState === "ended");
      const notProcessing = !isProcessing;
      if (recorderStopped && notStopping && streamClosed && notProcessing) {
        startRecording();
      } else {
        retryTimeoutRef.current = setTimeout(checkAndStart, 300);
      }
    };

    retryTimeoutRef.current = setTimeout(checkAndStart, 500);
  }, [startRecording, microphoneError, isProcessing]);

  const handleManualOverride = useCallback(() => {
    setLastResult("correct");
    playSuccessChime();
    setTimeout(() => playConfirmationAndContinue(), 300);
  }, [playConfirmationAndContinue]);

  const handleMarkIncorrect = useCallback(() => {
    onIncorrect();
  }, [onIncorrect]);

  const attemptsRemaining = maxAttempts - attempts;
  const isOutOfAttempts = attempts >= maxAttempts;

  function scoreColor(score: number) {
    if (score >= 75) return "bg-green-500";
    if (score >= 55) return "bg-amber-400";
    return "bg-red-500";
  }

  return (
    <Card className="p-6 flex flex-col items-center gap-4 rounded-3xl max-w-lg mx-auto w-full">
      {(displayImageUrl || isRegeneratingImage) && (
        <div className="relative w-full aspect-square max-w-[400px] rounded-2xl overflow-hidden bg-muted flex items-center justify-center">
          {isRegeneratingImage ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <p className="text-muted-foreground">Making new picture...</p>
            </div>
          ) : (
            <img
              src={displayImageUrl!}
              alt={englishWord}
              className="w-full h-full object-cover"
              data-testid="img-word"
            />
          )}
          {displayImageUrl && !isRegeneratingImage && (
            <button
              className="absolute top-2 right-2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
              onClick={() => setShowEditImage(true)}
              data-testid="button-edit-image-review"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Word display with syllable highlighting */}
      <div className="text-center">
        {showWord ? (
          <h2 className="text-4xl font-bold mb-1" data-testid="text-english-word">
            {syllables.map((syl, i) =>
              syl === " " ? (
                <span key={i}>&nbsp;</span>
              ) : (
                <span
                  key={i}
                  className={`transition-colors duration-150 ${
                    activeSyllableIndex === i ? "text-primary underline decoration-2" : ""
                  }`}
                >
                  {syl}
                </span>
              )
            )}
          </h2>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => {
                    const password = prompt("Enter password:");
                    if (password === "iloveathena") {
                      setShowWord(true);
                    }
                  }}
                  data-testid="button-show-word"
                >
                  Show Word
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-base font-semibold">{englishWord}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Audio controls row */}
      <div className="flex gap-2 items-center w-full">
        <Button
          size="sm"
          variant="outline"
          onClick={handlePlayAudio}
          disabled={isPlayingAudio || !currentAudioUrl}
          className="gap-1 rounded-xl"
          data-testid="button-play-audio"
        >
          <Volume2 className={`w-4 h-4 ${isPlayingAudio ? "animate-pulse text-primary" : ""}`} />
          {isPlayingAudio ? "Playing..." : "Hear Word"}
        </Button>

        {/* Speed select */}
        <Select
          value={String(audioSpeed)}
          onValueChange={(v) => setAudioSpeed(parseFloat(v) as AudioSpeed)}
        >
          <SelectTrigger className="w-20 rounded-xl h-9" data-testid="select-speed">
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
              <span>
                <Button
                  size="sm"
                  variant={voiceType === "child" ? "default" : "outline"}
                  className="rounded-xl gap-1"
                  onClick={() => setVoiceType(voiceType === "native" ? "child" : "native")}
                  disabled={!childVoiceEnabled}
                  data-testid="button-voice-toggle"
                >
                  <User className="w-4 h-4" />
                  {voiceType === "child" ? "Child" : "Native"}
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

        <div className="ml-auto">
          <Badge variant="secondary" className="text-sm">
            {attemptsRemaining} {attemptsRemaining === 1 ? "attempt" : "attempts"} left
          </Badge>
        </div>
      </div>

      {/* Transcription + score */}
      {transcription !== null && !isRecording && (
        <div
          className={`w-full p-4 rounded-xl text-center ${
            lastResult === "correct"
              ? "bg-green-100 dark:bg-green-900/30 border-2 border-green-500"
              : lastResult === "incorrect"
              ? "bg-red-100 dark:bg-red-900/30 border-2 border-red-500"
              : "bg-muted"
          }`}
          data-testid="transcription-result"
        >
          <p className="text-sm text-muted-foreground mb-1">You said:</p>
          <p className="text-2xl font-bold" data-testid="text-transcription">
            {transcription}
          </p>

          {pronunciationScore !== null && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2">
                <Progress
                  value={pronunciationScore}
                  className={`h-2 flex-1 [&>div]:${scoreColor(pronunciationScore)}`}
                />
                <span className="text-sm font-bold w-10 text-right">{pronunciationScore}%</span>
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

      <div className="flex flex-col gap-3 w-full">
        {!lastResult && !isProcessing && !isPlayingConfirmation && (
          <Button
            size="lg"
            onClick={startRecording}
            disabled={isRecording}
            className={`min-h-16 text-xl font-bold rounded-2xl ${
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
                Start Recording
              </>
            )}
          </Button>
        )}

        {lastResult === "incorrect" && !isOutOfAttempts && (
          <>
            <Button
              size="lg"
              onClick={handleTryAgain}
              className="min-h-16 text-xl font-bold rounded-2xl"
              data-testid="button-try-again"
            >
              <RotateCcw className="w-6 h-6 mr-2" />
              Try Again ({attemptsRemaining} left)
            </Button>
            <div className="flex gap-2">
              <Button
                size="lg"
                variant="outline"
                onClick={handleManualOverride}
                disabled={isProcessing || isPlayingConfirmation}
                className="flex-1 min-h-12 text-sm font-semibold rounded-xl"
                data-testid="button-manual-correct"
              >
                <Check className="w-4 h-4 mr-1" />
                Mark Correct
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={handleMarkIncorrect}
                disabled={isProcessing || isPlayingConfirmation}
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
              <p>No more attempts. Let's practice this one again later!</p>
            </div>
            <div className="flex gap-2">
              <Button
                size="lg"
                variant="outline"
                onClick={handleManualOverride}
                disabled={isProcessing || isPlayingConfirmation}
                className="flex-1 min-h-14 text-lg font-semibold rounded-xl"
                data-testid="button-manual-correct-final"
              >
                <Check className="w-5 h-5 mr-2" />
                Mark as Correct
              </Button>
              <Button
                size="lg"
                onClick={handleMarkIncorrect}
                disabled={isProcessing || isPlayingConfirmation}
                className="flex-1 min-h-14 text-lg font-semibold rounded-xl"
                data-testid="button-needs-practice"
              >
                <ChevronRight className="w-5 h-5 mr-2" />
                Next Word
              </Button>
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Parent tip: If the app misunderstands your child, use "Mark Correct" to override.
      </p>

      <Dialog open={showEditImage} onOpenChange={setShowEditImage}>
        <DialogContent className="max-w-sm rounded-2xl" data-testid="dialog-edit-image-review">
          <DialogHeader>
            <DialogTitle>Edit Image</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Button
              onClick={() => handleRegenerateImage()}
              className="min-h-12 text-base font-semibold rounded-xl"
              data-testid="button-regenerate-default-review"
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
              data-testid="input-custom-prompt-review"
            />
            <Button
              onClick={() => handleRegenerateImage(customPrompt.trim())}
              disabled={!customPrompt.trim()}
              variant="secondary"
              className="min-h-12 text-base font-semibold rounded-xl"
              data-testid="button-regenerate-custom-review"
            >
              <Pencil className="w-5 h-5 mr-2" />
              Generate with Description
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
