import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, Volume2, Check, X, RotateCcw, ChevronRight, Loader2 } from "lucide-react";
import { transcribeAudio, playAudio, generateAudio, generateConfirmationAudio, type Language } from "@/lib/api";
import { playSuccessChime } from "@/lib/sounds";

interface VoiceReviewProps {
  targetWord: string;
  englishWord: string;
  wordId: string;
  audioUrl: string | null;
  imageUrl: string | null;
  language: Language;
  onCorrect: () => void;
  onIncorrect: () => void;
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

export default function VoiceReview({
  targetWord,
  englishWord,
  wordId,
  audioUrl,
  imageUrl,
  language,
  onCorrect,
  onIncorrect,
}: VoiceReviewProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [lastResult, setLastResult] = useState<'correct' | 'incorrect' | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [currentAudioUrl, setCurrentAudioUrl] = useState(audioUrl);
  const [isPlayingConfirmation, setIsPlayingConfirmation] = useState(false);
  const [microphoneError, setMicrophoneError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCorrectRef = useRef(false);
  const isStoppingRef = useRef(false);

  const maxAttempts = 3;

  useEffect(() => {
    setAttempts(0);
    setTranscription(null);
    setLastResult(null);
    setIsRecording(false);
    setIsProcessing(false);
    setCurrentAudioUrl(audioUrl);
    isCorrectRef.current = false;
    isStoppingRef.current = false;
    setMicrophoneError(null);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    
    if (!audioUrl) {
      generateAudio(wordId)
        .then(url => setCurrentAudioUrl(url))
        .catch(console.error);
    }
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [wordId, audioUrl]);

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
      const confirmUrl = await generateConfirmationAudio(targetWord, language);
      await playAudio(confirmUrl);
    } catch (error) {
      console.error("Confirmation audio failed:", error);
    } finally {
      setIsPlayingConfirmation(false);
      onCorrect();
    }
  }, [targetWord, language, onCorrect]);

  const processRecording = useCallback(async (audioBlob: Blob, mimeType: string) => {
    return new Promise<void>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        
        try {
          const result = await transcribeAudio(base64, mimeType, language);
          setTranscription(result.text);
          
          const normalizedTranscription = normalizeWord(result.text, language);
          const normalizedTarget = normalizeWord(targetWord, language);
          
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
          console.error("Transcription failed:", error);
          setTranscription("(Could not understand audio)");
          setLastResult('incorrect');
          setAttempts(prev => prev + 1);
        } finally {
          setIsProcessing(false);
          resolve();
        }
      };
      
      reader.readAsDataURL(audioBlob);
    });
  }, [targetWord, language, playConfirmationAndContinue]);

  const startRecording = useCallback(async () => {
    try {
      isCorrectRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });
      
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        isStoppingRef.current = false; // Mark stopping complete
        
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        
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
      
      timeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          setIsRecording(false);
          setIsProcessing(true);
          isStoppingRef.current = true; // Mark as stopping
          mediaRecorderRef.current.stop();
        }
      }, RECORDING_DURATION_MS);
      
    } catch (error) {
      console.error("Failed to start recording:", error);
      if (error instanceof Error) {
        if (error.name === 'NotFoundError' || error.name === 'NotAllowedError') {
          setMicrophoneError("Could not access microphone. Please allow microphone access and try again.");
        } else {
          setMicrophoneError("Could not start recording. Please try again.");
        }
      }
    }
  }, [processRecording]);

  const handleTryAgain = useCallback(() => {
    // Clear any pending retry timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    
    setTranscription(null);
    setLastResult(null);
    setMicrophoneError(null);
    
    // Auto-start recording after processing completes
    const checkAndStart = () => {
      // Cancel if mic error occurred
      if (microphoneError) {
        retryTimeoutRef.current = null;
        return;
      }
      
      retryTimeoutRef.current = null;
      // Check recorder is fully stopped and not processing
      const recorderStopped = !mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive';
      const notStopping = !isStoppingRef.current;
      // Also check stream is cleaned up
      const streamClosed = !streamRef.current || streamRef.current.getTracks().every(t => t.readyState === 'ended');
      // Check we're not currently processing
      const notProcessing = !isProcessing;
      
      if (recorderStopped && notStopping && streamClosed && notProcessing) {
        startRecording();
      } else {
        // Retry after another delay if still stopping
        retryTimeoutRef.current = setTimeout(checkAndStart, 300);
      }
    };
    
    retryTimeoutRef.current = setTimeout(checkAndStart, 500);
  }, [startRecording, microphoneError, isProcessing]);

  const handleManualOverride = useCallback(() => {
    setLastResult('correct');
    playSuccessChime();
    setTimeout(() => playConfirmationAndContinue(), 300);
  }, [playConfirmationAndContinue]);

  const handleMarkIncorrect = useCallback(() => {
    onIncorrect();
  }, [onIncorrect]);

  const attemptsRemaining = maxAttempts - attempts;
  const isOutOfAttempts = attempts >= maxAttempts;

  return (
    <Card className="p-6 flex flex-col items-center gap-4 rounded-3xl max-w-lg mx-auto w-full">
      {imageUrl && (
        <div className="w-full aspect-square max-w-[400px] rounded-2xl overflow-hidden bg-muted">
          <img 
            src={imageUrl} 
            alt={englishWord}
            className="w-full h-full object-cover"
            data-testid="img-word"
          />
        </div>
      )}
      
      <div className="text-center">
        <h2 className="text-4xl font-bold mb-1" data-testid="text-english-word">{englishWord}</h2>
      </div>

      <div className="flex gap-2 items-center">
        <Badge variant="secondary" className="text-sm">
          {attemptsRemaining} {attemptsRemaining === 1 ? 'attempt' : 'attempts'} left
        </Badge>
      </div>

      {transcription !== null && !isRecording && (
        <div 
          className={`w-full p-4 rounded-xl text-center ${
            lastResult === 'correct' 
              ? 'bg-green-100 dark:bg-green-900/30 border-2 border-green-500' 
              : lastResult === 'incorrect'
              ? 'bg-red-100 dark:bg-red-900/30 border-2 border-red-500'
              : 'bg-muted'
          }`}
          data-testid="transcription-result"
        >
          <p className="text-sm text-muted-foreground mb-1">You said:</p>
          <p className="text-2xl font-bold" data-testid="text-transcription">{transcription}</p>
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

      <div className="flex flex-col gap-3 w-full">
        {!lastResult && !isProcessing && !isPlayingConfirmation && (
          <Button
            size="lg"
            onClick={startRecording}
            disabled={isRecording}
            className={`min-h-16 text-xl font-bold rounded-2xl ${
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
                Start Recording
              </>
            )}
          </Button>
        )}

        {lastResult === 'incorrect' && !isOutOfAttempts && (
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
              <p>No more attempts. Let's practice this one again later!</p>
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
                onClick={handleMarkIncorrect}
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
    </Card>
  );
}
