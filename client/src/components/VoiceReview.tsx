import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Volume2, Check, X, RotateCcw, ChevronRight, Loader2 } from "lucide-react";
import { transcribeAudio, playAudio, generateAudio } from "@/lib/api";
import { playSuccessChime } from "@/lib/sounds";

interface VoiceReviewProps {
  russianWord: string;
  englishWord: string;
  wordId: string;
  audioUrl: string | null;
  onCorrect: () => void;
  onIncorrect: () => void;
}

function normalizeRussian(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,!?;:'"«»\-—–]/g, '')
    .trim();
}

export default function VoiceReview({
  russianWord,
  englishWord,
  wordId,
  audioUrl,
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
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const maxAttempts = 3;

  useEffect(() => {
    if (!audioUrl) {
      generateAudio(wordId)
        .then(url => setCurrentAudioUrl(url))
        .catch(console.error);
    }
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

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        
        if (audioChunksRef.current.length === 0) {
          setIsProcessing(false);
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          
          try {
            const result = await transcribeAudio(base64, mediaRecorder.mimeType);
            setTranscription(result.text);
            
            const normalizedTranscription = normalizeRussian(result.text);
            const normalizedTarget = normalizeRussian(russianWord);
            
            if (normalizedTranscription === normalizedTarget || 
                normalizedTranscription.includes(normalizedTarget) ||
                normalizedTarget.includes(normalizedTranscription)) {
              setLastResult('correct');
              playSuccessChime();
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
          }
        };
        
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setTranscription(null);
      setLastResult(null);
    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  }, [russianWord]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      setIsRecording(false);
      setIsProcessing(true);
      mediaRecorderRef.current.stop();
    }
  }, [isRecording]);

  const handleTryAgain = useCallback(() => {
    setTranscription(null);
    setLastResult(null);
  }, []);

  const handleContinue = useCallback(() => {
    if (lastResult === 'correct') {
      onCorrect();
    } else {
      onIncorrect();
    }
  }, [lastResult, onCorrect, onIncorrect]);

  const handleManualOverride = useCallback(() => {
    setLastResult('correct');
    playSuccessChime();
  }, []);

  const handleMarkIncorrect = useCallback(() => {
    onIncorrect();
  }, [onIncorrect]);

  const attemptsRemaining = maxAttempts - attempts;
  const isOutOfAttempts = attempts >= maxAttempts;

  return (
    <Card className="p-6 flex flex-col items-center gap-6 rounded-3xl max-w-md mx-auto w-full">
      <div className="text-center">
        <p className="text-muted-foreground mb-2">Say this word:</p>
        <h2 className="text-4xl font-bold mb-2" data-testid="text-target-word">{russianWord}</h2>
        <p className="text-xl text-muted-foreground">{englishWord}</p>
      </div>

      <Button
        size="lg"
        variant="outline"
        onClick={handlePlayAudio}
        disabled={isPlayingAudio || !currentAudioUrl}
        className="rounded-full min-h-14"
        data-testid="button-hear-word"
      >
        <Volume2 className={`w-6 h-6 mr-2 ${isPlayingAudio ? 'animate-pulse' : ''}`} />
        Hear it
      </Button>

      <div className="flex gap-2 items-center">
        <Badge variant="secondary" className="text-sm">
          {attemptsRemaining} {attemptsRemaining === 1 ? 'attempt' : 'attempts'} left
        </Badge>
      </div>

      {transcription !== null && (
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

      {isProcessing && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Listening...</span>
        </div>
      )}

      <div className="flex flex-col gap-3 w-full">
        {!lastResult && !isProcessing && (
          <Button
            size="lg"
            onClick={isRecording ? stopRecording : startRecording}
            className={`min-h-16 text-xl font-bold rounded-2xl ${
              isRecording ? 'bg-red-500 hover:bg-red-600' : ''
            }`}
            data-testid="button-record"
          >
            {isRecording ? (
              <>
                <MicOff className="w-6 h-6 mr-2" />
                Stop Recording
              </>
            ) : (
              <>
                <Mic className="w-6 h-6 mr-2" />
                Start Recording
              </>
            )}
          </Button>
        )}

        {lastResult === 'correct' && (
          <Button
            size="lg"
            onClick={handleContinue}
            className="min-h-16 text-xl font-bold rounded-2xl bg-green-600 hover:bg-green-700"
            data-testid="button-continue"
          >
            <ChevronRight className="w-6 h-6 mr-2" />
            Continue
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
                onClick={handleContinue}
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
