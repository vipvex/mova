import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Volume2, Trophy, Play, Loader2, Star } from "lucide-react";
import { generateAudio, generateTextAudio, playAudio, stopAudio, type Language, type VocabularyWord } from "@/lib/api";
import { playSuccessChime, playErrorBuzz, playLevelComplete, playConfettiPop } from "@/lib/sounds";

interface FallingWord {
  id: string;
  word: VocabularyWord;
  lane: number;
  y: number;
  caught: boolean;
  dissolving: boolean;
}

interface ConfettiParticle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
}

interface WordCatchGameProps {
  userId: string;
  language: Language;
  onBack: () => void;
}

const FALL_SPEED = 72;
const LABEL_HEIGHT = 34;
const LANE_GAP = 6;
const NUM_LANES = 5;
const SIDE_PADDING = 6;
const SPAWN_MIN_MS = 400;
const SPAWN_MAX_MS = 1000;
const CONFETTI_COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FF69B4', '#7B68EE', '#FFA500'];

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let confettiIdCounter = 0;

function createConfettiBurst(x: number, y: number, count: number = 30): ConfettiParticle[] {
  const particles: ConfettiParticle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 150 + Math.random() * 250;
    particles.push({
      id: confettiIdCounter++,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 100,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 6 + Math.random() * 8,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 720,
    });
  }
  return particles;
}

export default function WordCatchGame({ userId, language, onBack }: WordCatchGameProps) {
  const [gameState, setGameState] = useState<"loading" | "ready" | "not-enough" | "playing" | "ended">("loading");
  const [learnedWords, setLearnedWords] = useState<VocabularyWord[]>([]);
  const [fallingWords, setFallingWords] = useState<FallingWord[]>([]);
  const [targetWord, setTargetWord] = useState<VocabularyWord | null>(null);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [combo, setCombo] = useState(0);
  const [round, setRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(0);
  const [showCorrect, setShowCorrect] = useState<string | null>(null);
  const [showWrong, setShowWrong] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [confetti, setConfetti] = useState<ConfettiParticle[]>([]);
  const [correctPos, setCorrectPos] = useState<{x: number, y: number} | null>(null);

  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const fallingWordsRef = useRef<FallingWord[]>([]);
  const targetWordRef = useRef<VocabularyWord | null>(null);
  const scoreRef = useRef(0);
  const missesRef = useRef(0);
  const comboRef = useRef(0);
  const learnedWordsRef = useRef<VocabularyWord[]>([]);
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const audioTokenRef = useRef(0);
  const gameStateRef = useRef<string>("loading");
  const confettiRef = useRef<ConfettiParticle[]>([]);

  const remainingWordsRef = useRef<VocabularyWord[]>([]);
  const roundRef = useRef(1);
  const spawnQueueRef = useRef<VocabularyWord[]>([]);
  const targetSpawnedRef = useRef(false);
  const pendingSpeakRef = useRef<VocabularyWord | null>(null);
  const nextSpawnAtRef = useRef(0);

  const getCardSize = useCallback(() => {
    const gameWidth = gameAreaRef.current?.clientWidth ?? 700;
    const available = gameWidth - SIDE_PADDING * 2 - (NUM_LANES - 1) * LANE_GAP;
    return Math.floor(available / NUM_LANES);
  }, []);

  const getLaneX = useCallback((lane: number) => {
    const cardSize = getCardSize();
    const gameWidth = gameAreaRef.current?.clientWidth ?? 700;
    const totalWidth = NUM_LANES * cardSize + (NUM_LANES - 1) * LANE_GAP;
    const startX = Math.max(0, (gameWidth - totalWidth) / 2);
    return startX + lane * (cardSize + LANE_GAP);
  }, [getCardSize]);

  const stopGame = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    stopAudio();
    gameStateRef.current = "ended";
    setGameState("ended");
  }, []);

  useEffect(() => {
    async function loadWords() {
      try {
        const response = await fetch(`/api/users/${userId}/words/learned-all`);
        if (!response.ok) throw new Error("Failed to fetch learned words");
        const allLearned: VocabularyWord[] = await response.json();
        const withImages = allLearned.filter(w => w.imageUrl);
        setLearnedWords(withImages);
        learnedWordsRef.current = withImages;
        if (withImages.length >= 4) {
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

  const speakTargetWord = useCallback((word: VocabularyWord) => {
    audioTokenRef.current += 1;
    const token = audioTokenRef.current;
    pendingSpeakRef.current = null;

    const doSpeak = () => {
      if (audioTokenRef.current !== token || gameStateRef.current !== "playing") return;
      generateAudio(word.id)
        .then(url => {
          if (audioTokenRef.current !== token || gameStateRef.current !== "playing") return;
          stopAudio();
          setIsPlayingAudio(true);
          return playAudio(url);
        })
        .then(() => {
          if (audioTokenRef.current === token) setIsPlayingAudio(false);
        })
        .catch((err) => {
          console.error("Audio failed, will retry:", err);
          if (audioTokenRef.current === token) {
            setIsPlayingAudio(false);
            setTimeout(() => {
              if (audioTokenRef.current === token && gameStateRef.current === "playing") {
                generateAudio(word.id)
                  .then(url => {
                    if (audioTokenRef.current !== token) return;
                    stopAudio();
                    setIsPlayingAudio(true);
                    return playAudio(url);
                  })
                  .then(() => { if (audioTokenRef.current === token) setIsPlayingAudio(false); })
                  .catch(() => { if (audioTokenRef.current === token) setIsPlayingAudio(false); });
              }
            }, 800);
          }
        });
    };

    doSpeak();
  }, []);

  const speakWrongAnswer = useCallback((clickedWord: VocabularyWord, targetW: VocabularyWord) => {
    const phrase = language === "russian"
      ? `Это ${clickedWord.targetWord}. Где ${targetW.targetWord}?`
      : `Esto es ${clickedWord.targetWord}. ¿Dónde está ${targetW.targetWord}?`;

    const wrongAudio = new Audio();
    generateTextAudio(phrase, language)
      .then(url => {
        if (gameStateRef.current !== "playing") return;
        wrongAudio.src = url;
        return wrongAudio.play();
      })
      .catch(err => console.error("Wrong answer audio failed:", err));
  }, [language]);

  const speakCorrectAnswer = useCallback((word: VocabularyWord): Promise<void> => {
    const phrase = language === "russian"
      ? `Да, это ${word.targetWord}!`
      : `Sí, eso es ${word.targetWord}!`;

    return new Promise((resolve) => {
      const correctAudio = new Audio();
      generateTextAudio(phrase, language)
        .then(url => {
          if (gameStateRef.current !== "playing") { resolve(); return; }
          correctAudio.src = url;
          correctAudio.onended = () => resolve();
          correctAudio.onerror = () => resolve();
          return correctAudio.play();
        })
        .catch(err => {
          console.error("Correct answer audio failed:", err);
          resolve();
        });
    });
  }, [language]);

  const pickNewTarget = useCallback(() => {
    if (remainingWordsRef.current.length === 0) {
      playLevelComplete();
      stopGame();
      return;
    }

    const word = remainingWordsRef.current[0];
    remainingWordsRef.current = remainingWordsRef.current.slice(1);

    setTargetWord(word);
    targetWordRef.current = word;
    roundRef.current += 1;
    setRound(roundRef.current);
    targetSpawnedRef.current = false;
    pendingSpeakRef.current = word;

    setTimeout(() => {
      if (pendingSpeakRef.current === word && gameStateRef.current === "playing") {
        speakTargetWord(word);
      }
    }, 400);
  }, [speakTargetWord, stopGame]);

  const replayTargetAudio = useCallback(() => {
    if (!targetWordRef.current) return;
    speakTargetWord(targetWordRef.current);
  }, [speakTargetWord]);

  const getFreeLane = useCallback((): number => {
    const activeFalling = fallingWordsRef.current.filter(fw => !fw.caught && !fw.dissolving);

    const laneTopY: number[] = new Array(NUM_LANES).fill(99999);
    for (const fw of activeFalling) {
      if (fw.y < laneTopY[fw.lane]) {
        laneTopY[fw.lane] = fw.y;
      }
    }

    const cardSize = getCardSize();
    const minClearance = cardSize + LABEL_HEIGHT + 30;
    const freeLanes = [];
    for (let i = 0; i < NUM_LANES; i++) {
      if (laneTopY[i] > minClearance) {
        freeLanes.push(i);
      }
    }

    if (freeLanes.length > 0) {
      return freeLanes[Math.floor(Math.random() * freeLanes.length)];
    }
    return -1;
  }, [getCardSize]);

  const spawnWord = useCallback(() => {
    const lane = getFreeLane();
    if (lane === -1) return;

    const activeFalling = fallingWordsRef.current.filter(fw => !fw.caught && !fw.dissolving);
    const onScreenWordIds = new Set(activeFalling.map(fw => fw.word.id));

    let word: VocabularyWord;

    if (!targetSpawnedRef.current && targetWordRef.current) {
      word = targetWordRef.current;
      targetSpawnedRef.current = true;
    } else {
      const words = learnedWordsRef.current;
      if (words.length === 0) return;

      if (spawnQueueRef.current.length === 0) {
        spawnQueueRef.current = shuffleArray(words);
      }

      let found = false;
      for (let attempt = 0; attempt < spawnQueueRef.current.length; attempt++) {
        const candidate = spawnQueueRef.current[attempt];
        if (!onScreenWordIds.has(candidate.id)) {
          word = candidate;
          spawnQueueRef.current.splice(attempt, 1);
          found = true;
          break;
        }
      }

      if (!found!) {
        if (spawnQueueRef.current.length > 0) {
          word = spawnQueueRef.current.shift()!;
        } else {
          word = words[Math.floor(Math.random() * words.length)];
        }
      }
    }

    const newFalling: FallingWord = {
      id: `${word!.id}-${Date.now()}-${Math.random()}`,
      word: word!,
      lane,
      y: -(getCardSize() + LABEL_HEIGHT),
      caught: false,
      dissolving: false,
    };
    fallingWordsRef.current = [...fallingWordsRef.current, newFalling];
    setFallingWords([...fallingWordsRef.current]);
  }, [getFreeLane]);

  const gameLoop = useCallback((timestamp: number) => {
    if (gameStateRef.current !== "playing") return;

    if (lastTimeRef.current === 0) lastTimeRef.current = timestamp;
    const delta = (timestamp - lastTimeRef.current) / 1000;
    lastTimeRef.current = timestamp;

    const areaHeight = gameAreaRef.current?.clientHeight ?? 600;

    spawnTimerRef.current += delta * 1000;
    if (spawnTimerRef.current >= nextSpawnAtRef.current) {
      spawnTimerRef.current = 0;
      nextSpawnAtRef.current = SPAWN_MIN_MS + Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS);
      spawnWord();
    }

    let missed = false;
    const cardSize = getCardSize();
    const offscreenY = areaHeight + cardSize + LABEL_HEIGHT + 50;
    const updated = fallingWordsRef.current
      .map(fw => {
        if (fw.dissolving || fw.caught) return fw;
        return { ...fw, y: fw.y + FALL_SPEED * delta };
      })
      .filter(fw => {
        if (fw.dissolving) return false;
        if (fw.caught) return false;
        if (fw.y > offscreenY) {
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
      targetSpawnedRef.current = false;
      speakTargetWord(targetWordRef.current!);
    }

    if (confettiRef.current.length > 0) {
      confettiRef.current = confettiRef.current
        .map(p => ({
          ...p,
          x: p.x + p.vx * delta,
          y: p.y + p.vy * delta,
          vy: p.vy + 400 * delta,
          vx: p.vx * 0.99,
          rotation: p.rotation + p.rotationSpeed * delta,
        }))
        .filter(p => p.y < areaHeight + 100);
      setConfetti([...confettiRef.current]);
    }

    fallingWordsRef.current = updated;
    setFallingWords([...updated]);
    animFrameRef.current = requestAnimationFrame(gameLoop);
  }, [spawnWord, speakTargetWord]);

  const startGame = useCallback(() => {
    const shuffled = shuffleArray(learnedWordsRef.current);
    const ROUNDS_PER_GAME = 20;
    const gameWords = shuffled.slice(0, ROUNDS_PER_GAME);
    const firstWord = gameWords[0];
    remainingWordsRef.current = gameWords.slice(1);
    spawnQueueRef.current = shuffleArray(learnedWordsRef.current);

    gameStateRef.current = "playing";
    setGameState("playing");
    setScore(0);
    setMisses(0);
    setCombo(0);
    setTotalRounds(gameWords.length);
    roundRef.current = 1;
    setRound(1);
    scoreRef.current = 0;
    missesRef.current = 0;
    comboRef.current = 0;
    fallingWordsRef.current = [];
    setFallingWords([]);
    confettiRef.current = [];
    setConfetti([]);
    lastTimeRef.current = 0;
    spawnTimerRef.current = 0;
    nextSpawnAtRef.current = SPAWN_MIN_MS + Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS);
    targetSpawnedRef.current = false;
    pendingSpeakRef.current = null;

    setTargetWord(firstWord);
    targetWordRef.current = firstWord;

    setTimeout(() => {
      if (gameStateRef.current === "playing") {
        speakTargetWord(firstWord);
      }
    }, 500);

    animFrameRef.current = requestAnimationFrame(gameLoop);
  }, [gameLoop, speakTargetWord]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      stopAudio();
    };
  }, []);

  const handleCardClick = useCallback((fw: FallingWord) => {
    if (!targetWordRef.current || gameStateRef.current !== "playing") return;
    if (fw.dissolving || fw.caught) return;

    if (fw.word.id === targetWordRef.current.id) {
      comboRef.current += 1;
      const comboBonus = comboRef.current > 1 ? comboRef.current : 1;
      scoreRef.current += comboBonus;
      setScore(scoreRef.current);
      setCombo(comboRef.current);
      setShowCorrect(fw.id);
      playSuccessChime();
      playConfettiPop();

      const cs = getCardSize();
      const cardCenterX = getLaneX(fw.lane) + cs / 2;
      const cardCenterY = fw.y + cs / 2;
      setCorrectPos({ x: cardCenterX, y: cardCenterY });

      const burst = createConfettiBurst(cardCenterX, cardCenterY, 35);
      confettiRef.current = [...confettiRef.current, ...burst];
      setConfetti([...confettiRef.current]);

      fallingWordsRef.current = fallingWordsRef.current.map(f =>
        f.id === fw.id ? { ...f, caught: true, dissolving: true } : f
      );
      setFallingWords([...fallingWordsRef.current]);

      setTimeout(() => {
        fallingWordsRef.current = fallingWordsRef.current.filter(f => f.id !== fw.id);
        setFallingWords([...fallingWordsRef.current]);
        setShowCorrect(null);
        setCorrectPos(null);
      }, 700);

      speakCorrectAnswer(fw.word).then(() => {
        if (gameStateRef.current === "playing") {
          pickNewTarget();
        }
      });
    } else {
      comboRef.current = 0;
      setCombo(0);
      setShowWrong(fw.id);
      playErrorBuzz();
      speakWrongAnswer(fw.word, targetWordRef.current);
      setTimeout(() => setShowWrong(null), 500);
    }
  }, [pickNewTarget, speakWrongAnswer, speakCorrectAnswer, getLaneX]);

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
        <p className="text-sm text-muted-foreground">{learnedWords.length} words to catch</p>
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
    const perfect = missesRef.current === 0;
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 gap-6">
        <div className="flex items-center gap-1 flex-wrap justify-center">
          {Array.from({ length: Math.min(scoreRef.current, 20) }).map((_, i) => (
            <Star key={i} className="w-10 h-10 text-yellow-400 fill-yellow-400 drop-shadow-md" />
          ))}
          {scoreRef.current > 20 && (
            <span className="text-xl font-bold text-yellow-500 ml-1">+{scoreRef.current - 20}</span>
          )}
        </div>
        <h1 className="text-3xl font-bold">{perfect ? "Perfect!" : "Great Job!"}</h1>
        <div className="flex flex-col items-center gap-2">
          <p className="text-4xl font-bold text-primary">{scoreRef.current} {scoreRef.current === 1 ? 'star' : 'stars'}</p>
          <p className="text-muted-foreground">{totalRounds} words caught</p>
          {missesRef.current > 0 && (
            <p className="text-sm text-muted-foreground">{missesRef.current} missed</p>
          )}
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
        <div className="flex items-center gap-1 flex-wrap" data-testid="star-score-display">
          {Array.from({ length: totalRounds }).map((_, i) => (
            <Star
              key={i}
              className={`w-7 h-7 ${
                i < score
                  ? 'text-yellow-400 fill-yellow-400 drop-shadow-sm'
                  : 'text-muted-foreground/30 fill-muted-foreground/10'
              }`}
            />
          ))}
          {combo > 1 && (
            <Badge variant="secondary" className="animate-pulse ml-1" data-testid="badge-combo">
              x{combo}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="icon"
            variant="outline"
            onClick={replayTargetAudio}
            data-testid="button-replay-audio"
          >
            <Volume2 className="w-5 h-5" />
          </Button>
          <Badge variant="outline" className="font-mono" data-testid="badge-round">
            {round}/{totalRounds}
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
        style={{ minHeight: 500 }}
        data-testid="game-area"
      >
        {fallingWords.map(fw => {
          const cs = getCardSize();
          return (
            <div
              key={fw.id}
              className={`absolute cursor-pointer game-card-hover ${
                fw.dissolving ? 'animate-explode pointer-events-none' : ''
              } ${showWrong === fw.id ? 'animate-shake' : ''}`}
              style={{
                left: getLaneX(fw.lane),
                top: fw.y,
                width: cs,
                height: cs + LABEL_HEIGHT,
              }}
              onClick={() => handleCardClick(fw)}
              data-testid={`falling-card-${fw.word.id}`}
            >
              <div className={`rounded-lg overflow-hidden border-2 ${
                showCorrect === fw.id ? 'border-green-500 shadow-lg shadow-green-500/50' :
                showWrong === fw.id ? 'border-red-500 bg-red-100 dark:bg-red-900' :
                'border-border bg-background'
              } shadow-md`}>
                <div style={{ width: cs, height: cs }} className="flex items-center justify-center bg-muted/20">
                  {fw.word.imageUrl ? (
                    <img
                      src={fw.word.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <span className="text-2xl font-bold text-muted-foreground">{fw.word.targetWord}</span>
                  )}
                </div>
                <div className="text-center flex items-center justify-center bg-background" style={{ height: LABEL_HEIGHT }}>
                  <p className="text-lg font-bold truncate px-1">{fw.word.targetWord}</p>
                </div>
              </div>
            </div>
          );
        })}

        {confetti.map(p => (
          <div
            key={p.id}
            className="absolute pointer-events-none"
            style={{
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              borderRadius: Math.random() > 0.5 ? '50%' : '2px',
              transform: `rotate(${p.rotation}deg)`,
            }}
          />
        ))}

        {correctPos && (
          <div
            className="absolute pointer-events-none animate-score-pop"
            style={{ left: correctPos.x - 30, top: correctPos.y - 40 }}
          >
            <span className="text-3xl font-black text-green-500 drop-shadow-lg">
              {comboRef.current > 1 ? `+${comboRef.current}` : '+1'}
            </span>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 h-1 bg-destructive/30" />
      </div>
    </div>
  );
}
