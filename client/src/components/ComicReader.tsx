import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Volume2, Mic, MicOff, CheckCircle, XCircle, Loader2, BookOpen, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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

interface ComicReaderProps {
  storyId: string;
  userId: string;
  username: string;
  language: string;
  onBack: () => void;
}

type ReaderView = 'reading' | 'quiz' | 'complete';

const RUSSIAN_ACKNOWLEDGMENTS = [
  "Молодец", "Отлично", "Супер", "Браво", "Здорово", "Правильно", "Умница",
];

const SPANISH_ACKNOWLEDGMENTS = [
  "Muy bien", "Excelente", "Fantástico", "Bravo", "Genial", "Correcto", "Increíble",
];

const PANELS_PER_PAGE = 2;

export default function ComicReader({ storyId, userId, username, language, onBack }: ComicReaderProps) {
  const queryClient = useQueryClient();
  const [comicPage, setComicPage] = useState(0);
  const [view, setView] = useState<ReaderView>('reading');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording' | 'processing' | 'success' | 'retry'>('idle');
  const [lastTranscription, setLastTranscription] = useState('');
  const [voiceAttempts, setVoiceAttempts] = useState(0);
  const [activePanel, setActivePanel] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Map<number, boolean>>(new Map());
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [showTranslation, setShowTranslation] = useState(false);
  const [acknowledgmentIndex, setAcknowledgmentIndex] = useState(0);
  const [flipDirection, setFlipDirection] = useState<1 | -1>(1);
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

  const speakTextMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await apiRequest('POST', '/api/tts/text', { text, language });
      return response.json();
    },
  });

  const totalPages = story?.pageCount ?? 0;
  const totalComicPages = Math.ceil(totalPages / PANELS_PER_PAGE);
  const panelsOnCurrentPage = story?.pages.filter(p => {
    const panelIndex = p.pageNumber - 1;
    return Math.floor(panelIndex / PANELS_PER_PAGE) === comicPage;
  }) ?? [];

  const currentPanel = panelsOnCurrentPage[activePanel];
  const overallProgress = totalPages > 0 ? (((comicPage * PANELS_PER_PAGE) + activePanel + 1) / totalPages) * 100 : 0;

  const playAudioForPanel = useCallback(async (pageNumber: number) => {
    try {
      const result = await ttsMutation.mutateAsync(pageNumber);
      if (result.audioUrl && audioRef.current) {
        audioRef.current.src = result.audioUrl;
        audioRef.current.play();
      }
    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  }, [ttsMutation]);

  const playCurrentAudio = useCallback(async () => {
    if (!currentPanel) return;
    await playAudioForPanel(currentPanel.pageNumber);
  }, [currentPanel, playAudioForPanel]);

  useEffect(() => {
    if (view === 'reading' && currentPanel && comicPage === 0 && activePanel === 0) {
      const timer = setTimeout(() => {
        playAudioForPanel(currentPanel.pageNumber);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [view, story]);

  const advanceToNextPanel = useCallback(() => {
    setVoiceAttempts(0);
    setRecordingStatus('idle');
    setLastTranscription('');
    setShowTranslation(false);

    const globalIndex = comicPage * PANELS_PER_PAGE + activePanel;
    if (globalIndex < totalPages - 1) {
      const nextGlobalIndex = globalIndex + 1;
      const nextComicPage = Math.floor(nextGlobalIndex / PANELS_PER_PAGE);
      const nextPanelIndex = nextGlobalIndex % PANELS_PER_PAGE;

      if (nextComicPage !== comicPage) {
        setFlipDirection(1);
      }
      setComicPage(nextComicPage);
      setActivePanel(nextPanelIndex);
      progressMutation.mutate({ currentPage: nextGlobalIndex + 1 });
      setTimeout(() => {
        const nextPageNumber = nextGlobalIndex + 1;
        playAudioForPanel(nextPageNumber);
      }, 500);
    } else {
      if (story?.quizzes && story.quizzes.length > 0) {
        setView('quiz');
      } else {
        progressMutation.mutate({ isCompleted: true, quizScore: 0 });
        setView('complete');
      }
    }
  }, [comicPage, activePanel, totalPages, progressMutation, playAudioForPanel, story]);

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
            const expected = currentPanel?.sentence.toLowerCase().trim() ?? '';
            setLastTranscription(transcribed);

            const similarity = calculateSimilarity(transcribed, expected);

            if (similarity >= 0.8) {
              setRecordingStatus('success');
              setVoiceAttempts(0);

              const acknowledgments = language === 'russian' ? RUSSIAN_ACKNOWLEDGMENTS : SPANISH_ACKNOWLEDGMENTS;
              const phrase = acknowledgments[acknowledgmentIndex % acknowledgments.length];
              const successMessage = language === 'russian'
                ? `${phrase}, ${username}!`
                : `¡${phrase}, ${username}!`;

              speakTextMutation.mutate(successMessage, {
                onSuccess: (result) => {
                  if (result.audioUrl && audioRef.current) {
                    audioRef.current.src = result.audioUrl;
                    audioRef.current.play();
                  }
                }
              });
              setAcknowledgmentIndex(prev => prev + 1);
              setTimeout(() => advanceToNextPanel(), 2000);
            } else {
              setVoiceAttempts(prev => prev + 1);
              setRecordingStatus('retry');
            }
          } catch (error) {
            console.error('Transcription failed:', error);
            setVoiceAttempts(prev => prev + 1);
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
      }, 5000);
    } catch (error) {
      console.error('Failed to start recording:', error);
      setRecordingStatus('retry');
    }
  }, [currentPanel, transcribeMutation, advanceToNextPanel, language, username, acknowledgmentIndex, speakTextMutation]);

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

  const goToPrevComicPage = useCallback(() => {
    if (comicPage > 0) {
      setFlipDirection(-1);
      setComicPage(prev => prev - 1);
      setActivePanel(0);
      setVoiceAttempts(0);
      setRecordingStatus('idle');
      setLastTranscription('');
      setShowTranslation(false);
    }
  }, [comicPage]);

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
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 12 }}
              className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center"
            >
              <CheckCircle className="w-12 h-12 text-green-600" />
            </motion.div>
            <h2 className="text-2xl font-bold mb-2">Story Complete!</h2>
            <p className="text-muted-foreground mb-4">
              You finished "{story.title}"
            </p>
            {totalQuestions > 0 && (
              <p className="text-lg font-semibold mb-6">
                Quiz Score: {correctCount}/{totalQuestions} correct
              </p>
            )}
            <Button onClick={onBack} className="w-full" data-testid="button-comic-done">
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
                  return (
                    <Button
                      key={index}
                      variant="outline"
                      className={`w-full min-h-14 text-left justify-start ${
                        answered && isCorrect ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''
                      } ${
                        answered && !isCorrect && wasCorrect === false && option !== quiz.correctAnswer
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
    <div className="min-h-screen bg-yellow-50 dark:bg-zinc-950 flex flex-col">
      <audio ref={audioRef} className="hidden" />

      <div className="flex items-center justify-between p-3 bg-white dark:bg-zinc-900 border-b-2 border-black dark:border-zinc-700">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-comic-back">
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <span className="font-bold text-sm tracking-wide uppercase" data-testid="text-comic-page-number">
          Page {comicPage + 1} of {totalComicPages}
        </span>
        <div className="w-10" />
      </div>

      <Progress value={overallProgress} className="h-1.5" />

      <div className="flex-1 flex flex-col p-3 sm:p-4 max-w-3xl mx-auto w-full">
        <AnimatePresence mode="wait" custom={flipDirection}>
          <motion.div
            key={comicPage}
            custom={flipDirection}
            initial={{ rotateY: 90 * flipDirection, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: -90 * flipDirection, opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            style={{ transformPerspective: 1200 }}
            className="flex-1 flex flex-col"
          >
            <div className="flex-1 grid gap-3" style={{
              gridTemplateRows: panelsOnCurrentPage.length > 1 ? 'repeat(2, 1fr)' : '1fr'
            }}>
              {panelsOnCurrentPage.map((panel, idx) => {
                const isActive = idx === activePanel;
                return (
                  <div
                    key={panel.id}
                    className={`relative rounded-xl overflow-hidden border-4 transition-all duration-300 cursor-pointer ${
                      isActive
                        ? 'border-blue-500 shadow-lg shadow-blue-200 dark:shadow-blue-900/40 scale-[1.01]'
                        : 'border-black dark:border-zinc-600 opacity-60'
                    }`}
                    onClick={() => {
                      setActivePanel(idx);
                      setVoiceAttempts(0);
                      setRecordingStatus('idle');
                      setLastTranscription('');
                      setShowTranslation(false);
                    }}
                    data-testid={`comic-panel-${panel.pageNumber}`}
                  >
                    {panel.imageUrl ? (
                      <img
                        src={panel.imageUrl}
                        alt="Comic panel"
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="w-full h-full min-h-[180px] bg-gradient-to-br from-amber-50 to-yellow-100 dark:from-zinc-800 dark:to-zinc-700 flex items-center justify-center">
                        <BookOpen className="w-16 h-16 text-amber-300/50 dark:text-zinc-500" />
                      </div>
                    )}

                    <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
                      <div className="relative mx-3 mb-3">
                        <div className="bg-white dark:bg-zinc-800 rounded-2xl border-2 border-black dark:border-zinc-500 px-4 py-2 shadow-md relative">
                          <div className="absolute -top-2 left-6 w-4 h-4 bg-white dark:bg-zinc-800 border-l-2 border-t-2 border-black dark:border-zinc-500 transform rotate-45" />
                          <p className="text-base sm:text-lg font-bold text-center leading-snug" data-testid={`comic-sentence-${panel.pageNumber}`}>
                            {panel.sentence}
                          </p>
                          {showTranslation && isActive && panel.englishTranslation && (
                            <p className="text-xs text-muted-foreground text-center mt-1">
                              {panel.englishTranslation}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {!isActive && (
                      <div className="absolute inset-0 bg-black/10 dark:bg-black/30" />
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="pt-4 space-y-3">
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={playCurrentAudio}
              disabled={ttsMutation.isPending}
              className="gap-2"
              data-testid="button-comic-listen"
            >
              {ttsMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
              Listen
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTranslation(!showTranslation)}
              data-testid="button-comic-translation"
            >
              {showTranslation ? 'Hide' : 'Show'} Translation
            </Button>

            {comicPage > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={goToPrevComicPage}
                className="gap-1"
                data-testid="button-comic-prev"
              >
                <ArrowLeft className="w-4 h-4" />
                Prev
              </Button>
            )}
          </div>

          {recordingStatus === 'retry' && (
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2 text-amber-600">
                <RotateCcw className="w-4 h-4" />
                <span className="font-medium text-sm">Try again! (Attempt {voiceAttempts}/3)</span>
              </div>
              {lastTranscription && (
                <p className="text-xs text-muted-foreground">
                  I heard: "{lastTranscription}"
                </p>
              )}
              {voiceAttempts >= 1 && (
                <div className="flex gap-2 justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={advanceToNextPanel}
                    className="text-green-600 border-green-600 hover:bg-green-50 text-xs"
                    data-testid="button-comic-mark-correct"
                  >
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Mark Correct
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={advanceToNextPanel}
                    className="text-gray-600 text-xs"
                    data-testid="button-comic-skip"
                  >
                    Skip
                  </Button>
                </div>
              )}
            </div>
          )}

          {recordingStatus === 'processing' && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Checking...</span>
            </div>
          )}

          {recordingStatus === 'success' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center justify-center gap-2 text-green-600"
            >
              <CheckCircle className="w-5 h-5" />
              <span className="font-bold">
                {language === 'russian'
                  ? RUSSIAN_ACKNOWLEDGMENTS[acknowledgmentIndex % RUSSIAN_ACKNOWLEDGMENTS.length]
                  : SPANISH_ACKNOWLEDGMENTS[acknowledgmentIndex % SPANISH_ACKNOWLEDGMENTS.length]}!
              </span>
            </motion.div>
          )}

          <Button
            size="lg"
            className={`w-full min-h-14 text-lg gap-3 ${
              isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'
            }`}
            onClick={isRecording ? stopRecording : startRecording}
            disabled={recordingStatus === 'processing' || recordingStatus === 'success'}
            data-testid="button-comic-record"
          >
            {isRecording ? (
              <>
                <MicOff className="w-5 h-5" />
                Recording... (tap to stop)
              </>
            ) : (
              <>
                <Mic className="w-5 h-5" />
                {recordingStatus === 'retry' ? 'Try Again' : 'Read Aloud'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function calculateSimilarity(str1: string, str2: string): number {
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .split(/\s+/)
      .filter(Boolean);

  const words1 = normalize(str1);
  const words2 = normalize(str2);

  if (words1.length === 0 && words2.length === 0) return 1;
  if (words1.length === 0 || words2.length === 0) return 0;

  const freq1 = new Map<string, number>();
  const freq2 = new Map<string, number>();

  for (const w of words1) freq1.set(w, (freq1.get(w) || 0) + 1);
  for (const w of words2) freq2.set(w, (freq2.get(w) || 0) + 1);

  const allWords = new Set([...Array.from(freq1.keys()), ...Array.from(freq2.keys())]);
  let intersection = 0;
  let union = 0;

  for (const word of Array.from(allWords)) {
    const c1 = freq1.get(word) || 0;
    const c2 = freq2.get(word) || 0;
    intersection += Math.min(c1, c2);
    union += Math.max(c1, c2);
  }

  return union > 0 ? intersection / union : 0;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
