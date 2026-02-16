import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Volume2, Trophy, Play, Loader2 } from "lucide-react";
import { fetchLevelInfo, generateAudio, playAudio, stopAudio, type Language, type VocabularyWord } from "@/lib/api";
import { playSuccessChime } from "@/lib/sounds";

interface FallingWord {
  id: string;
  word: VocabularyWord;
  x: number;
  y: number;
  speed: number;
  caught: boolean;
}

interface WordCatchGameProps {
  userId: string;
  language: Language;
  onBack: () => void;
}

const GAME_HEIGHT = 500;
const GAME_DURATION_MS = 60000;
const SPAWN_INTERVAL_MS = 1800;
const CARD_SIZE = 72;

export default function WordCatchGame({ userId, language, onBack }: WordCatchGameProps) {
  const [gameState, setGameState] = useState<"loading" | "ready" | "not-enough" | "playing" | "ended">("loading");
  const [learnedWords, setLearnedWords] = useState<VocabularyWord[]>([]);
  const [fallingWords, setFallingWords] = useState<FallingWord[]>([]);
  const [targetWord, setTargetWord] = useState<VocabularyWord | null>(null);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_MS / 1000);
  const [combo, setCombo] = useState(0);
  const [showCorrect, setShowCorrect] = useState<string | null>(null);
  const [showWrong, setShowWrong] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const gameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fallingWordsRef = useRef<FallingWord[]>([]);
  const targetWordRef = useRef<VocabularyWord | null>(null);
  const scoreRef = useRef(0);
  const missesRef = useRef(0);
  const comboRef = useRef(0);
  const learnedWordsRef = useRef<VocabularyWord[]>([]);
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const audioTokenRef = useRef(0);
  const gameStateRef = useRef<string>("loading");

  const stopGame = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (gameTimerRef.current) {
      clearInterval(gameTimerRef.current);
      gameTimerRef.current = null;
    }
    stopAudio();
    gameStateRef.current = "ended";
    setGameState("ended");
  }, []);

  useEffect(() => {
    async function loadWords() {
      try {
        const levelInfo = await fetchLevelInfo(userId);
        const learned = levelInfo.allLevelWords
          .filter(w => w.isLearned && w.word.imageUrl)
          .map(w => w.word);
        setLearnedWords(learned);
        learnedWordsRef.current = learned;
        if (learned.length >= 4) {
          gameStateRef.current = "ready";
          setGameState("ready");
        } else {
          gameStateRef.current = "not-enough";
          setGameState("not-enough");
        }
      } catch (error) {
        console.error("Failed to load words:", error);
        gameStateRef.current = "not-enough";
        setGameState("not-enough");
      }
    }
    loadWords();
  }, [userId]);

  const pickNewTarget = useCallback(() => {
    const words = learnedWordsRef.current;
    if (words.length === 0) return;
    const word = words[Math.floor(Math.random() * words.length)];
    setTargetWord(word);
    targetWordRef.current = word;

    audioTokenRef.current += 1;
    const token = audioTokenRef.current;

    generateAudio(word.id)
      .then(url => {
        if (audioTokenRef.current !== token) return;
        setIsPlayingAudio(true);
        return playAudio(url);
      })
      .then(() => {
        if (audioTokenRef.current === token) setIsPlayingAudio(false);
      })
      .catch(() => {
        if (audioTokenRef.current === token) setIsPlayingAudio(false);
      });
  }, []);

  const replayTargetAudio = useCallback(async () => {
    if (!targetWordRef.current || isPlayingAudio) return;
    audioTokenRef.current += 1;
    const token = audioTokenRef.current;
    try {
      setIsPlayingAudio(true);
      const url = await generateAudio(targetWordRef.current.id);
      if (audioTokenRef.current !== token) return;
      await playAudio(url);
    } catch (e) {
      console.error(e);
    } finally {
      if (audioTokenRef.current === token) setIsPlayingAudio(false);
    }
  }, [isPlayingAudio]);

  const spawnWord = useCallback(() => {
    const words = learnedWordsRef.current;
    if (words.length === 0) return;

    const gameWidth = gameAreaRef.current?.clientWidth ?? 400;
    const maxX = gameWidth - CARD_SIZE - 8;
    const word = words[Math.floor(Math.random() * words.length)];
    const newFalling: FallingWord = {
      id: `${word.id}-${Date.now()}-${Math.random()}`,
      word,
      x: Math.random() * maxX + 4,
      y: -CARD_SIZE,
      speed: 40 + Math.random() * 30,
      caught: false,
    };
    fallingWordsRef.current = [...fallingWordsRef.current, newFalling];
    setFallingWords([...fallingWordsRef.current]);
  }, []);

  const gameLoop = useCallback((timestamp: number) => {
    if (gameStateRef.current !== "playing") return;

    if (lastTimeRef.current === 0) lastTimeRef.current = timestamp;
    const delta = (timestamp - lastTimeRef.current) / 1000;
    lastTimeRef.current = timestamp;

    spawnTimerRef.current += delta * 1000;
    if (spawnTimerRef.current >= SPAWN_INTERVAL_MS) {
      spawnTimerRef.current -= SPAWN_INTERVAL_MS;
      spawnWord();
    }

    let missed = false;
    const updated = fallingWordsRef.current
      .map(fw => ({ ...fw, y: fw.y + fw.speed * delta }))
      .filter(fw => {
        if (fw.caught) return false;
        if (fw.y > GAME_HEIGHT) {
          if (targetWordRef.current && fw.word.id === targetWordRef.current.id) {
            missed = true;
          }
          return false;
        }
        return true;
      });

    if (missed) {
      missesRef.current += 1;
      comboRef.current = 0;
      setMisses(missesRef.current);
      setCombo(0);
      pickNewTarget();
    }

    fallingWordsRef.current = updated;
    setFallingWords([...updated]);
    animFrameRef.current = requestAnimationFrame(gameLoop);
  }, [spawnWord, pickNewTarget]);

  const startGame = useCallback(() => {
    gameStateRef.current = "playing";
    setGameState("playing");
    setScore(0);
    setMisses(0);
    setCombo(0);
    setTimeLeft(GAME_DURATION_MS / 1000);
    scoreRef.current = 0;
    missesRef.current = 0;
    comboRef.current = 0;
    fallingWordsRef.current = [];
    setFallingWords([]);
    lastTimeRef.current = 0;
    spawnTimerRef.current = 0;

    pickNewTarget();

    animFrameRef.current = requestAnimationFrame(gameLoop);

    let remaining = GAME_DURATION_MS / 1000;
    gameTimerRef.current = setInterval(() => {
      remaining -= 1;
      setTimeLeft(remaining);
      if (remaining <= 0) {
        stopGame();
      }
    }, 1000);
  }, [gameLoop, pickNewTarget, stopGame]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
      stopAudio();
    };
  }, []);

  const handleCardClick = useCallback((fw: FallingWord) => {
    if (!targetWordRef.current || gameStateRef.current !== "playing") return;

    if (fw.word.id === targetWordRef.current.id) {
      comboRef.current += 1;
      const comboBonus = comboRef.current > 1 ? comboRef.current : 1;
      scoreRef.current += comboBonus;
      setScore(scoreRef.current);
      setCombo(comboRef.current);
      setShowCorrect(fw.id);
      setTimeout(() => setShowCorrect(null), 400);
      playSuccessChime();

      fallingWordsRef.current = fallingWordsRef.current.map(f =>
        f.id === fw.id ? { ...f, caught: true } : f
      );
      setFallingWords([...fallingWordsRef.current]);

      pickNewTarget();
    } else {
      comboRef.current = 0;
      setCombo(0);
      setShowWrong(fw.id);
      setTimeout(() => setShowWrong(null), 400);
    }
  }, [pickNewTarget]);

  if (gameState === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (gameState === "not-enough") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 gap-6">
        <h1 className="text-2xl font-bold">Not Enough Words Yet</h1>
        <p className="text-muted-foreground text-center max-w-sm">
          Learn at least 4 words with images to play Word Catch!
        </p>
        <p className="text-sm text-muted-foreground">{learnedWords.length} / 4 words ready</p>
        <Button variant="ghost" onClick={onBack} data-testid="button-game-back-nowords">
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  if (gameState === "ready") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 gap-6">
        <h1 className="text-3xl font-bold">Word Catch</h1>
        <p className="text-muted-foreground text-center max-w-sm">
          Listen to the word, then tap the matching picture before it falls to the bottom!
        </p>
        <p className="text-sm text-muted-foreground">{learnedWords.length} words available</p>
        <Button size="lg" onClick={startGame} data-testid="button-start-game">
          <Play className="w-6 h-6 mr-2" />
          Start Game
        </Button>
        <Button variant="ghost" onClick={onBack} data-testid="button-game-back">
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  if (gameState === "ended") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 gap-6">
        <Trophy className="w-16 h-16 text-yellow-500" />
        <h1 className="text-3xl font-bold">Game Over!</h1>
        <div className="flex flex-col items-center gap-2">
          <p className="text-4xl font-bold text-primary">{scoreRef.current} points</p>
          <p className="text-muted-foreground">{missesRef.current} missed</p>
        </div>
        <Button size="lg" onClick={startGame} data-testid="button-play-again">
          <Play className="w-6 h-6 mr-2" />
          Play Again
        </Button>
        <Button variant="ghost" onClick={onBack} data-testid="button-game-back-end">
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Games
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background border-b px-4 py-2 flex items-center justify-between gap-4">
        <Button size="icon" variant="ghost" onClick={stopGame} data-testid="button-quit-game">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3">
          <Badge variant="default" data-testid="badge-score">
            <Trophy className="w-3 h-3 mr-1" />
            {score}
          </Badge>
          {combo > 1 && (
            <Badge variant="secondary" className="animate-pulse" data-testid="badge-combo">
              x{combo}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="icon"
            variant="outline"
            onClick={replayTargetAudio}
            disabled={isPlayingAudio}
            data-testid="button-replay-audio"
          >
            <Volume2 className="w-5 h-5" />
          </Button>
          <Badge variant={timeLeft <= 10 ? "destructive" : "outline"} className="font-mono" data-testid="badge-timer">
            {timeLeft}s
          </Badge>
        </div>
      </header>

      {targetWord && (
        <div className="text-center py-2 bg-muted/30 border-b">
          <p className="text-lg font-bold" data-testid="text-target-word">
            {language === "russian" ? "Найди:" : "Encuentra:"} <span className="text-primary text-xl">{targetWord.english}</span>
          </p>
        </div>
      )}

      <div
        ref={gameAreaRef}
        className="flex-1 relative overflow-hidden"
        style={{ minHeight: GAME_HEIGHT }}
        data-testid="game-area"
      >
        {fallingWords.map(fw => (
          <div
            key={fw.id}
            className={`absolute cursor-pointer transition-transform duration-100 ${
              showCorrect === fw.id ? 'scale-125 opacity-0' : ''
            } ${showWrong === fw.id ? 'animate-shake' : ''}`}
            style={{
              left: fw.x,
              top: fw.y,
              width: CARD_SIZE,
              height: CARD_SIZE + 18,
            }}
            onClick={() => handleCardClick(fw)}
            data-testid={`falling-card-${fw.word.id}`}
          >
            <div className={`rounded-md overflow-hidden border-2 ${
              showCorrect === fw.id ? 'border-green-500 bg-green-100 dark:bg-green-900' :
              showWrong === fw.id ? 'border-red-500 bg-red-100 dark:bg-red-900' :
              'border-border bg-background'
            } shadow-md`}>
              <div style={{ width: CARD_SIZE, height: CARD_SIZE }} className="flex items-center justify-center bg-muted/20">
                {fw.word.imageUrl ? (
                  <img
                    src={fw.word.imageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <span className="text-xs font-bold text-muted-foreground">{fw.word.targetWord}</span>
                )}
              </div>
              <div className="text-center py-0.5 bg-background">
                <p className="text-[9px] font-bold truncate px-0.5">{fw.word.targetWord}</p>
              </div>
            </div>
          </div>
        ))}

        <div className="absolute bottom-0 left-0 right-0 h-1 bg-destructive/30" />
      </div>
    </div>
  );
}
