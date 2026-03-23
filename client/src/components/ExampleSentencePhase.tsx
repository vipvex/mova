import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Volume2, ChevronRight, Loader2, X } from "lucide-react";
import { playAudio, type ExampleSentence, type VocabularyWord, type Language } from "@/lib/api";

interface ExampleSentencePhaseProps {
  word: VocabularyWord;
  sentence: ExampleSentence | null;
  isLoading: boolean;
  language: Language;
  onContinue: () => void;
  onSkip: () => void;
}

export default function ExampleSentencePhase({
  word,
  sentence,
  isLoading,
  language,
  onContinue,
  onSkip,
}: ExampleSentencePhaseProps) {
  const [showHint, setShowHint] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Auto-play TTS when sentence arrives
  useEffect(() => {
    if (!sentence?.audioUrl) return;
    const t = setTimeout(async () => {
      setIsPlayingAudio(true);
      try { await playAudio(sentence.audioUrl!); } catch {}
      setIsPlayingAudio(false);
    }, 600);
    return () => clearTimeout(t);
  }, [sentence?.audioUrl]);

  const handleReplay = useCallback(async () => {
    if (!sentence?.audioUrl || isPlayingAudio) return;
    setIsPlayingAudio(true);
    try { await playAudio(sentence.audioUrl); } catch {}
    setIsPlayingAudio(false);
  }, [sentence?.audioUrl, isPlayingAudio]);

  // Highlight the target word inside the sentence
  function renderHighlighted(text: string, target: string) {
    const lower = text.toLowerCase();
    const idx = lower.indexOf(target.toLowerCase());
    if (idx === -1) return <span>{text}</span>;
    return (
      <>
        {text.slice(0, idx)}
        <span className="text-amber-300 font-extrabold drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]">
          {text.slice(idx, idx + target.length)}
        </span>
        {text.slice(idx + target.length)}
      </>
    );
  }

  return (
    <motion.div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(160deg, #1e1b4b 0%, #312e81 40%, #4c1d95 100%)" }}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">✨</span>
          <span className="text-white/70 text-sm font-semibold uppercase tracking-widest">Story Time</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-white/50 hover:text-white hover:bg-white/10 rounded-xl"
          onClick={onSkip}
        >
          <X className="w-4 h-4 mr-1" /> Skip
        </Button>
      </div>

      {/* Target word chip */}
      <div className="flex justify-center pt-2 pb-4">
        <motion.div
          className="bg-amber-400/20 border border-amber-400/40 rounded-full px-6 py-2"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 300 }}
        >
          <span className="text-amber-300 text-2xl font-extrabold">{word.targetWord}</span>
          <span className="text-white/50 text-lg ml-2">= {word.english}</span>
        </motion.div>
      </div>

      {/* Scene image */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        <motion.div
          className="w-full max-w-sm aspect-square rounded-3xl overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center"
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
        >
          {isLoading || (!sentence?.imageUrl && !sentence) ? (
            <div className="flex flex-col items-center gap-3 text-center p-8">
              <Loader2 className="w-12 h-12 animate-spin text-purple-300" />
              <p className="text-purple-200 text-lg font-semibold">Cooking up a story…</p>
              <p className="text-purple-300/60 text-sm">(this only happens once!)</p>
            </div>
          ) : sentence?.imageUrl ? (
            <img
              src={sentence.imageUrl}
              alt="story scene"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-8xl select-none">🎭</div>
          )}
        </motion.div>

        {/* Sentence text */}
        <AnimatePresence>
          {sentence && (
            <motion.div
              className="text-center space-y-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              <p className="text-white text-2xl font-bold leading-relaxed">
                {renderHighlighted(sentence.sentence, word.targetWord)}
              </p>

              {/* Replay button */}
              <Button
                size="sm"
                variant="ghost"
                className="text-purple-200 hover:text-white hover:bg-white/10 rounded-xl gap-2"
                onClick={handleReplay}
                disabled={isPlayingAudio || !sentence.audioUrl}
              >
                <Volume2 className={`w-4 h-4 ${isPlayingAudio ? "animate-pulse" : ""}`} />
                {isPlayingAudio ? "Playing…" : "Hear again"}
              </Button>

              {/* English hint toggle */}
              {sentence.englishHint && (
                <div>
                  {showHint ? (
                    <motion.p
                      className="text-purple-300/80 text-base italic"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      {sentence.englishHint}
                    </motion.p>
                  ) : (
                    <button
                      className="text-purple-400/60 text-sm underline underline-offset-2"
                      onClick={() => setShowHint(true)}
                    >
                      Show English
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Continue */}
      <div className="px-6 pb-8 pt-4">
        <Button
          size="lg"
          className="w-full min-h-16 text-xl font-bold rounded-2xl bg-amber-400 hover:bg-amber-300 text-purple-900"
          onClick={onContinue}
          disabled={isLoading && !sentence}
        >
          Got it! <ChevronRight className="w-6 h-6 ml-2" />
        </Button>
      </div>
    </motion.div>
  );
}
