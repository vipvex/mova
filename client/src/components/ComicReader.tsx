import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Volume2, Mic, CheckCircle, XCircle, Loader2, BookOpen, RotateCcw } from "lucide-react";
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

const PANELS_PER_PAGE = 2;

const RUSSIAN_ACKNOWLEDGMENTS = [
  "Молодец", "Отлично", "Супер", "Браво", "Здорово", "Правильно", "Умница",
];

const SPANISH_ACKNOWLEDGMENTS = [
  "Muy bien", "Excelente", "Fantástico", "Bravo", "Genial", "Correcto", "Increíble",
];

function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface ComicPanelProps {
  page: StoryPage | undefined;
  panelIndex: number;
  isActive: boolean;
  showTranslation: boolean;
  isPracticed: boolean;
  onSelect: () => void;
  onListen: () => void;
  isListening: boolean;
  comicPageIdx: number;
}

function ComicPanel({ page, panelIndex, isActive, showTranslation, isPracticed, onSelect, onListen, isListening, comicPageIdx }: ComicPanelProps) {
  if (!page) return <div className="flex-1" />;

  return (
    <div
      className={`relative flex-1 rounded-lg overflow-hidden cursor-pointer transition-all duration-200 ${
        isActive
          ? 'ring-4 ring-yellow-400 dark:ring-yellow-500 shadow-xl'
          : 'ring-2 ring-black dark:ring-zinc-600 shadow-md'
      }`}
      style={{ minHeight: 0 }}
      onClick={onSelect}
      data-testid={`comic-panel-${comicPageIdx * PANELS_PER_PAGE + panelIndex + 1}`}
    >
      {page.imageUrl ? (
        <img
          src={page.imageUrl}
          alt={`Comic panel ${panelIndex + 1}`}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-amber-50 to-yellow-100 dark:from-zinc-800 dark:to-zinc-700 flex items-center justify-center min-h-[140px]">
          <BookOpen className="w-12 h-12 text-amber-300/50 dark:text-zinc-500" />
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-3 py-2">
        <p
          className="text-white font-bold text-center leading-snug drop-shadow-sm"
          style={{ fontSize: 'clamp(0.7rem, 2.2vw, 1rem)' }}
          data-testid={`comic-sentence-${comicPageIdx * PANELS_PER_PAGE + panelIndex + 1}`}
        >
          {page.sentence}
        </p>
        {showTranslation && page.englishTranslation && (
          <p className="text-yellow-200 text-center mt-0.5" style={{ fontSize: 'clamp(0.55rem, 1.6vw, 0.75rem)' }}>
            {page.englishTranslation}
          </p>
        )}
      </div>

      {isPracticed && (
        <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1">
          <CheckCircle className="w-4 h-4 text-white" />
        </div>
      )}

      {isActive && (
        <div className="absolute top-2 left-2 bg-yellow-400 rounded-full px-2 py-0.5 text-xs font-bold text-black">
          Say it!
        </div>
      )}

      <button
        className="absolute top-2 right-2 bg-black/40 hover:bg-black/60 rounded-full p-1.5 z-10 transition-colors"
        onClick={(e) => { e.stopPropagation(); onListen(); }}
        disabled={isListening}
        data-testid={`button-panel-listen-${comicPageIdx * PANELS_PER_PAGE + panelIndex + 1}`}
        aria-label="Listen"
      >
        {isListening ? (
          <Loader2 className="w-4 h-4 text-white animate-spin" />
        ) : (
          <Volume2 className="w-4 h-4 text-white" />
        )}
      </button>
    </div>
  );
}

export default function ComicReader({ storyId, userId, username, language, onBack }: ComicReaderProps) {
  const queryClient = useQueryClient();

  const [comicPageIdx, setComicPageIdx] = useState(0);
  const [activePanelInPage, setActivePanelInPage] = useState(0);
  const [practicedPanels, setPracticedPanels] = useState<Set<number>>(new Set());
  const [view, setView] = useState<ReaderView>('reading');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording' | 'processing' | 'success' | 'retry'>('idle');
  const [lastTranscription, setLastTranscription] = useState('');
  const [voiceAttempts, setVoiceAttempts] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Map<number, boolean>>(new Map());
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [showTranslation, setShowTranslation] = useState(false);
  const [acknowledgmentIndex, setAcknowledgmentIndex] = useState(0);
  const [flipDirection, setFlipDirection] = useState<1 | -1>(1);
  const [listeningPanel, setListeningPanel] = useState<number | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayedPagesRef = useRef<Set<number>>(new Set());

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

  const totalStoryPages = story?.pageCount ?? 0;
  const totalComicPages = Math.ceil(totalStoryPages / PANELS_PER_PAGE);

  const panel1 = story?.pages.find(p => p.pageNumber === comicPageIdx * PANELS_PER_PAGE + 1);
  const panel2 = story?.pages.find(p => p.pageNumber === comicPageIdx * PANELS_PER_PAGE + 2);
  const panels = [panel1, panel2].filter(Boolean) as StoryPage[];

  const activePanel = panels[activePanelInPage] ?? panels[0];
  const overallProgress = totalComicPages > 0 ? ((comicPageIdx + 1) / totalComicPages) * 100 : 0;

  const playAudioForPage = useCallback(async (pageNumber: number, panelIdx: number) => {
    setListeningPanel(panelIdx);
    try {
      const result = await ttsMutation.mutateAsync(pageNumber);
      if (result.audioUrl && audioRef.current) {
        audioRef.current.src = result.audioUrl;
        await audioRef.current.play();
      }
    } catch (error) {
      console.error('Failed to play audio:', error);
    } finally {
      setListeningPanel(null);
    }
  }, [ttsMutation]);

  useEffect(() => {
    if (view !== 'reading') return;
    const autoKey = comicPageIdx * 10 + 0;
    if (!panel1 || autoPlayedPagesRef.current.has(autoKey)) return;
    autoPlayedPagesRef.current.add(autoKey);

    const timer = setTimeout(async () => {
      await playAudioForPage(panel1.pageNumber, 0);
      if (panel2) {
        setTimeout(() => playAudioForPage(panel2.pageNumber, 1), 600);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [view, comicPageIdx, panel1, panel2, playAudioForPage]);

  const resetPanelState = useCallback(() => {
    setVoiceAttempts(0);
    setRecordingStatus('idle');
    setLastTranscription('');
    setActivePanelInPage(0);
    setPracticedPanels(new Set());
  }, []);

  const advanceAfterPractice = useCallback(() => {
    const nextPanelIdx = activePanelInPage + 1;
    if (nextPanelIdx < panels.length) {
      setActivePanelInPage(nextPanelIdx);
      setVoiceAttempts(0);
      setRecordingStatus('idle');
      setLastTranscription('');
      const nextPanel = panels[nextPanelIdx];
      if (nextPanel) {
        setTimeout(() => playAudioForPage(nextPanel.pageNumber, nextPanelIdx), 400);
      }
    } else {
      const nextComicPage = comicPageIdx + 1;
      if (nextComicPage < totalComicPages) {
        setFlipDirection(1);
        setComicPageIdx(nextComicPage);
        resetPanelState();
        progressMutation.mutate({ currentPage: nextComicPage * PANELS_PER_PAGE + 1 });
      } else {
        if (story?.quizzes && story.quizzes.length > 0) {
          setView('quiz');
        } else {
          progressMutation.mutate({ isCompleted: true, quizScore: 0 });
          setView('complete');
        }
      }
    }
  }, [activePanelInPage, panels, comicPageIdx, totalComicPages, resetPanelState, progressMutation, story, playAudioForPage]);

  const goToNextPage = useCallback(() => {
    const nextComicPage = comicPageIdx + 1;
    if (nextComicPage < totalComicPages) {
      setFlipDirection(1);
      setComicPageIdx(nextComicPage);
      resetPanelState();
      progressMutation.mutate({ currentPage: nextComicPage * PANELS_PER_PAGE + 1 });
    } else {
      if (story?.quizzes && story.quizzes.length > 0) {
        setView('quiz');
      } else {
        progressMutation.mutate({ isCompleted: true, quizScore: 0 });
        setView('complete');
      }
    }
  }, [comicPageIdx, totalComicPages, resetPanelState, progressMutation, story]);

  const goToPrevPage = useCallback(() => {
    if (comicPageIdx > 0) {
      resetPanelState();
      setFlipDirection(-1);
      setComicPageIdx(prev => prev - 1);
    }
  }, [comicPageIdx, resetPanelState]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        if (audioChunksRef.current.length === 0) {
          setRecordingStatus('retry');
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          setRecordingStatus('processing');

          try {
            const result = await transcribeMutation.mutateAsync(base64);
            const transcribed = result.text?.toLowerCase().trim() ?? '';
            const expected = activePanel?.sentence.toLowerCase().trim() ?? '';
            setLastTranscription(transcribed);

            const similarity = calculateSimilarity(transcribed, expected);

            if (similarity >= 0.8) {
              setRecordingStatus('success');
              setPracticedPanels(prev => new Set([...prev, activePanelInPage]));

              const acknowledgments = language === 'russian' ? RUSSIAN_ACKNOWLEDGMENTS : SPANISH_ACKNOWLEDGMENTS;
              const phrase = acknowledgments[acknowledgmentIndex % acknowledgments.length];
              const successMessage = language === 'russian'
                ? `${phrase}, ${username}!`
                : `¡${phrase}, ${username}!`;

              speakTextMutation.mutate(successMessage, {
                onSuccess: (r) => {
                  if (r.audioUrl && audioRef.current) {
                    audioRef.current.src = r.audioUrl;
                    audioRef.current.play();
                  }
                }
              });
              setAcknowledgmentIndex(prev => prev + 1);
              setTimeout(() => advanceAfterPractice(), 2000);
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
  }, [activePanel, activePanelInPage, transcribeMutation, advanceAfterPractice, language, username, acknowledgmentIndex, speakTextMutation]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
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
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
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
            <p className="text-muted-foreground mb-4">You finished "{story.title}"</p>
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
            <span className="text-muted-foreground">{currentQuizIndex + 1} / {story.quizzes.length}</span>
          </div>
          <Card>
            <CardContent className="p-6">
              <p className="text-lg font-medium mb-6" data-testid="quiz-question">{quiz.question}</p>
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
          <Button variant="ghost" className="w-full mt-4" onClick={handleSkipQuiz} data-testid="button-skip-quiz">
            Skip Quiz
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-yellow-50 dark:bg-zinc-950 flex flex-col">
      <audio ref={audioRef} className="hidden" />

      <div className="flex items-center justify-between p-3 bg-white dark:bg-zinc-900 border-b-4 border-black dark:border-zinc-700">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-comic-back">
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <div className="text-center">
          <p className="font-extrabold text-sm tracking-widest uppercase leading-none">{story.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-comic-page-number">
            Page {comicPageIdx + 1} of {totalComicPages}
          </p>
        </div>
        <div className="w-10" />
      </div>

      <Progress value={overallProgress} className="h-1.5" />

      <div className="flex-1 flex flex-col p-2 sm:p-3 max-w-4xl mx-auto w-full">
        <AnimatePresence mode="wait" custom={flipDirection}>
          <motion.div
            key={comicPageIdx}
            custom={flipDirection}
            initial={{ rotateY: 90 * flipDirection, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: -90 * flipDirection, opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            style={{ transformPerspective: 1400, flex: 1, display: 'flex', flexDirection: 'column' }}
          >
            <div
              className="flex-1 border-4 border-black dark:border-zinc-600 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-2xl"
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              <div className="flex flex-row flex-1 gap-0.5 bg-black dark:bg-zinc-700 p-0.5" style={{ minHeight: 0 }}>
                {panels.map((page, idx) => (
                  <ComicPanel
                    key={page.id}
                    page={page}
                    panelIndex={idx}
                    isActive={activePanelInPage === idx && recordingStatus !== 'success'}
                    showTranslation={showTranslation}
                    isPracticed={practicedPanels.has(idx)}
                    onSelect={() => {
                      setActivePanelInPage(idx);
                      setRecordingStatus('idle');
                      setVoiceAttempts(0);
                      setLastTranscription('');
                    }}
                    onListen={() => playAudioForPage(page.pageNumber, idx)}
                    isListening={listeningPanel === idx}
                    comicPageIdx={comicPageIdx}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="pt-3 space-y-2">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {comicPageIdx > 0 && (
              <Button variant="outline" size="sm" onClick={goToPrevPage} className="gap-1 border-2 border-black dark:border-zinc-600 font-bold" data-testid="button-comic-prev">
                <ArrowLeft className="w-4 h-4" /> Prev
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTranslation(!showTranslation)}
              className="border-2 border-black dark:border-zinc-600 font-bold"
              data-testid="button-comic-translation"
            >
              {showTranslation ? 'Hide' : 'Show'} Translation
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={goToNextPage}
              className="gap-1 border-2 border-black dark:border-zinc-600 font-bold"
              data-testid="button-comic-next"
            >
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex flex-col items-center gap-2">
            {recordingStatus === 'idle' && (
              <Button
                size="lg"
                onClick={startRecording}
                className="gap-2 bg-red-500 hover:bg-red-600 text-white font-bold border-2 border-black shadow-md px-8"
                data-testid="button-comic-record"
              >
                <Mic className="w-5 h-5" />
                Say Panel {activePanelInPage + 1}!
              </Button>
            )}

            {recordingStatus === 'recording' && (
              <Button
                size="lg"
                onClick={stopRecording}
                className="gap-2 bg-red-600 text-white font-bold border-2 border-black shadow-md px-8 animate-pulse"
                data-testid="button-comic-stop"
              >
                <Mic className="w-5 h-5" />
                Stop Recording
              </Button>
            )}

            {recordingStatus === 'processing' && (
              <div className="flex items-center gap-2 text-muted-foreground py-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="font-medium">Checking...</span>
              </div>
            )}

            {recordingStatus === 'success' && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-2 text-green-600 font-bold text-lg py-1"
              >
                <CheckCircle className="w-6 h-6" />
                {language === 'russian' ? 'Отлично!' : '¡Muy bien!'}
              </motion.div>
            )}

            {recordingStatus === 'retry' && (
              <div className="text-center space-y-2 w-full">
                <div className="flex items-center justify-center gap-2 text-amber-600">
                  <RotateCcw className="w-4 h-4" />
                  <span className="font-medium text-sm">Try again! (Attempt {voiceAttempts}/3)</span>
                </div>
                {lastTranscription && (
                  <p className="text-xs text-muted-foreground">I heard: "{lastTranscription}"</p>
                )}
                <div className="flex gap-2 justify-center">
                  <Button
                    size="sm"
                    onClick={startRecording}
                    className="gap-1 bg-red-500 hover:bg-red-600 text-white font-bold"
                    data-testid="button-comic-retry"
                  >
                    <Mic className="w-4 h-4" /> Try Again
                  </Button>
                  {voiceAttempts >= 1 && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={advanceAfterPractice}
                        className="text-green-600 border-green-600 hover:bg-green-50 font-bold text-xs"
                        data-testid="button-comic-mark-correct"
                      >
                        <CheckCircle className="w-3 h-3 mr-1" /> Mark Correct
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={advanceAfterPractice}
                        className="text-gray-600 text-xs"
                        data-testid="button-comic-skip"
                      >
                        Skip
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
