import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Volume2, Mic, MicOff, CheckCircle, XCircle, Loader2, BookOpen, RotateCcw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface StoryPage {
  id: string;
  storyId: string;
  pageNumber: number;
  sentence: string;
  englishTranslation: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
}

interface StoryQuiz {
  id: string;
  storyId: string;
  questionNumber: number;
  question: string;
  correctAnswer: string;
  wrongOption1: string;
  wrongOption2: string;
}

interface Story {
  id: string;
  title: string;
  targetUserId: string;
  language: string;
  status: string;
  pageCount: number;
  coverImageUrl: string | null;
  pages: StoryPage[];
  quizzes: StoryQuiz[];
}

interface StoryReaderProps {
  storyId: string;
  userId: string;
  language: string;
  onBack: () => void;
}

type ReaderView = 'reading' | 'quiz' | 'complete';

export default function StoryReader({ storyId, userId, language, onBack }: StoryReaderProps) {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(0);
  const [view, setView] = useState<ReaderView>('reading');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording' | 'processing' | 'success' | 'retry'>('idle');
  const [lastTranscription, setLastTranscription] = useState('');
  const [quizAnswers, setQuizAnswers] = useState<Map<number, boolean>>(new Map());
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [showTranslation, setShowTranslation] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: story, isLoading } = useQuery<Story>({
    queryKey: ['/api/stories', storyId],
    enabled: !!storyId,
  });

  const ttsMutation = useMutation({
    mutationFn: async (pageNumber: number) => {
      const response = await apiRequest('POST', `/api/stories/${storyId}/pages/${pageNumber}/tts`);
      return response.json();
    },
  });

  const transcribeMutation = useMutation({
    mutationFn: async (audioBase64: string) => {
      const response = await apiRequest('POST', '/api/stories/transcribe', {
        audio: audioBase64,
        language: language === 'russian' ? 'ru' : 'es',
      });
      return response.json();
    },
  });

  const progressMutation = useMutation({
    mutationFn: async (data: { currentPage?: number; isCompleted?: boolean; quizScore?: number }) => {
      const response = await apiRequest('POST', `/api/users/${userId}/stories/${storyId}/progress`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'stories'] });
    },
  });

  const currentPageData = story?.pages.find(p => p.pageNumber === currentPage + 1);
  const totalPages = story?.pageCount ?? 0;
  const progress = totalPages > 0 ? ((currentPage + 1) / totalPages) * 100 : 0;

  const playAudio = useCallback(async () => {
    if (!currentPageData) return;

    try {
      const result = await ttsMutation.mutateAsync(currentPageData.pageNumber);
      if (result.audioUrl && audioRef.current) {
        audioRef.current.src = result.audioUrl;
        audioRef.current.play();
      }
    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  }, [currentPageData, ttsMutation]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        
        if (audioChunksRef.current.length === 0) {
          setRecordingStatus('retry');
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          setRecordingStatus('processing');
          
          try {
            const result = await transcribeMutation.mutateAsync(base64);
            const transcribed = result.text?.toLowerCase().trim() ?? '';
            const expected = currentPageData?.sentence.toLowerCase().trim() ?? '';
            
            setLastTranscription(transcribed);
            
            const similarity = calculateSimilarity(transcribed, expected);
            
            if (similarity >= 0.8) {
              setRecordingStatus('success');
              setTimeout(() => {
                if (currentPage < totalPages - 1) {
                  setCurrentPage(prev => prev + 1);
                  setRecordingStatus('idle');
                  setShowTranslation(false);
                  progressMutation.mutate({ currentPage: currentPage + 2 });
                } else {
                  setView('quiz');
                }
              }, 1500);
            } else {
              setRecordingStatus('retry');
            }
          } catch (error) {
            console.error('Transcription failed:', error);
            setRecordingStatus('retry');
          }
        };
      };

      setIsRecording(true);
      setRecordingStatus('recording');
      mediaRecorder.start();

      recordingTimeoutRef.current = setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          setIsRecording(false);
        }
      }, 3000);
    } catch (error) {
      console.error('Failed to start recording:', error);
      setRecordingStatus('retry');
    }
  }, [currentPage, currentPageData, totalPages, transcribeMutation, progressMutation]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
    }
  }, []);

  const handleQuizAnswer = useCallback((questionIndex: number, answer: string, correctAnswer: string) => {
    const isCorrect = answer === correctAnswer;
    setQuizAnswers(prev => new Map(prev).set(questionIndex, isCorrect));
    
    setTimeout(() => {
      if (currentQuizIndex < (story?.quizzes.length ?? 0) - 1) {
        setCurrentQuizIndex(prev => prev + 1);
      } else {
        const correctCount = Array.from(quizAnswers.values()).filter(v => v).length + (isCorrect ? 1 : 0);
        const totalQuestions = story?.quizzes.length ?? 0;
        const score = Math.round((correctCount / totalQuestions) * 100);
        progressMutation.mutate({ isCompleted: true, quizScore: score });
        setView('complete');
      }
    }, 1000);
  }, [currentQuizIndex, story?.quizzes.length, quizAnswers, progressMutation]);

  const handleSkipQuiz = useCallback(() => {
    progressMutation.mutate({ isCompleted: true, quizScore: 0 });
    setView('complete');
  }, [progressMutation]);

  useEffect(() => {
    return () => {
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!story) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-lg text-muted-foreground">Story not found</p>
      </div>
    );
  }

  if (view === 'complete') {
    const correctCount = Array.from(quizAnswers.values()).filter(v => v).length;
    const totalQuestions = story.quizzes.length;
    
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Story Complete!</h2>
            <p className="text-muted-foreground mb-4">
              You finished "{story.title}"
            </p>
            {totalQuestions > 0 && (
              <p className="text-lg font-semibold mb-6">
                Quiz Score: {correctCount}/{totalQuestions} correct
              </p>
            )}
            <Button onClick={onBack} className="w-full" data-testid="button-story-done">
              Back to Library
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (view === 'quiz' && story.quizzes.length > 0) {
    const quiz = story.quizzes[currentQuizIndex];
    const answered = quizAnswers.has(currentQuizIndex);
    const wasCorrect = quizAnswers.get(currentQuizIndex);
    const options = shuffleArray([quiz.correctAnswer, quiz.wrongOption1, quiz.wrongOption2]);

    return (
      <div className="min-h-screen bg-background py-6 px-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">Story Quiz</h2>
            <span className="text-muted-foreground">
              {currentQuizIndex + 1} / {story.quizzes.length}
            </span>
          </div>

          <Card>
            <CardContent className="p-6">
              <p className="text-lg font-medium mb-6" data-testid="quiz-question">
                {quiz.question}
              </p>

              <div className="space-y-3">
                {options.map((option, index) => {
                  const isCorrect = option === quiz.correctAnswer;
                  const showResult = answered && (option === quiz.correctAnswer || (wasCorrect === false && option === quiz.wrongOption1));
                  
                  return (
                    <Button
                      key={index}
                      variant="outline"
                      className={`w-full min-h-14 text-left justify-start ${
                        answered && isCorrect ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''
                      } ${
                        answered && !isCorrect && quizAnswers.get(currentQuizIndex) === false && option !== quiz.correctAnswer
                          ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''
                      }`}
                      onClick={() => !answered && handleQuizAnswer(currentQuizIndex, option, quiz.correctAnswer)}
                      disabled={answered}
                      data-testid={`quiz-option-${index}`}
                    >
                      {option}
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Button
            variant="ghost"
            className="w-full mt-4"
            onClick={handleSkipQuiz}
            data-testid="button-skip-quiz"
          >
            Skip Quiz
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <audio ref={audioRef} className="hidden" />
      
      <div className="flex items-center justify-between p-4 border-b">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-reader-back">
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <span className="font-medium text-sm">
          Page {currentPage + 1} of {totalPages}
        </span>
        <div className="w-10" />
      </div>

      <Progress value={progress} className="h-1" />

      <div className="flex-1 flex flex-col p-4 max-w-2xl mx-auto w-full">
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          {currentPageData?.imageUrl ? (
            <img 
              src={currentPageData.imageUrl} 
              alt="Story illustration"
              className="max-w-full max-h-64 rounded-xl object-contain"
            />
          ) : (
            <div className="w-64 h-48 rounded-xl bg-muted/30 flex items-center justify-center">
              <BookOpen className="w-16 h-16 text-muted-foreground/30" />
            </div>
          )}

          <div className="text-center space-y-4">
            <p className="text-2xl sm:text-3xl font-bold" data-testid="story-sentence">
              {currentPageData?.sentence}
            </p>
            
            {showTranslation && currentPageData?.englishTranslation && (
              <p className="text-lg text-muted-foreground">
                {currentPageData.englishTranslation}
              </p>
            )}
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="lg"
              onClick={playAudio}
              disabled={ttsMutation.isPending}
              className="gap-2"
              data-testid="button-play-audio"
            >
              {ttsMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
              Listen
            </Button>

            <Button
              variant="outline"
              size="lg"
              onClick={() => setShowTranslation(!showTranslation)}
              data-testid="button-toggle-translation"
            >
              {showTranslation ? 'Hide' : 'Show'} Translation
            </Button>
          </div>
        </div>

        <div className="pt-6 space-y-4">
          {recordingStatus === 'success' && (
            <div className="flex items-center justify-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Great job!</span>
            </div>
          )}

          {recordingStatus === 'retry' && (
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2 text-amber-600">
                <RotateCcw className="w-5 h-5" />
                <span className="font-medium">Try again!</span>
              </div>
              {lastTranscription && (
                <p className="text-sm text-muted-foreground">
                  I heard: "{lastTranscription}"
                </p>
              )}
            </div>
          )}

          {recordingStatus === 'processing' && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Checking...</span>
            </div>
          )}

          <Button
            size="lg"
            className={`w-full min-h-16 text-xl gap-3 ${
              isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'
            }`}
            onClick={isRecording ? stopRecording : startRecording}
            disabled={recordingStatus === 'processing' || recordingStatus === 'success'}
            data-testid="button-record"
          >
            {isRecording ? (
              <>
                <MicOff className="w-6 h-6" />
                Recording... (tap to stop)
              </>
            ) : (
              <>
                <Mic className="w-6 h-6" />
                {recordingStatus === 'retry' ? 'Try Again' : 'Read Aloud'}
              </>
            )}
          </Button>

          {currentPage === 0 && recordingStatus === 'idle' && (
            <p className="text-center text-sm text-muted-foreground">
              Tap "Listen" to hear the sentence, then read it aloud!
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  const s2 = str2.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  
  if (s1.length === 0 && s2.length === 0) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  const set1 = new Set(s1);
  const set2 = new Set(s2);
  const intersection = s1.filter(x => set2.has(x));
  const unionArr = Array.from(new Set(s1.concat(s2)));
  
  return intersection.length / unionArr.length;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
