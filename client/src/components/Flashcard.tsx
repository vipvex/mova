import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Volume2 } from "lucide-react";

interface FlashcardProps {
  russianWord: string;
  englishWord: string;
  imageUrl: string;
  onPlayAudio?: () => void;
  isAudioPlaying?: boolean;
}

export default function Flashcard({ 
  russianWord, 
  englishWord, 
  imageUrl, 
  onPlayAudio,
  isAudioPlaying = false
}: FlashcardProps) {
  const [showTranslation, setShowTranslation] = useState(false);

  return (
    <Card className="w-full max-w-lg mx-auto p-8 flex flex-col items-center gap-6 rounded-3xl">
      <div 
        className="relative w-full aspect-square max-w-[400px] rounded-2xl overflow-hidden bg-muted cursor-pointer"
        onClick={onPlayAudio}
        data-testid="flashcard-image-container"
      >
        <img 
          src={imageUrl} 
          alt={`${russianWord} - ${englishWord}`}
          className="w-full h-full object-cover"
          data-testid="flashcard-image"
        />
        <Button
          size="icon"
          variant="secondary"
          className="absolute bottom-4 right-4 w-14 h-14 rounded-full shadow-lg"
          onClick={(e) => {
            e.stopPropagation();
            onPlayAudio?.();
          }}
          data-testid="button-play-audio"
          aria-label="Play pronunciation"
        >
          <Volume2 className={`w-7 h-7 ${isAudioPlaying ? 'animate-pulse text-primary' : ''}`} />
        </Button>
      </div>

      <h2 
        className="text-4xl font-extrabold text-center leading-relaxed"
        data-testid="text-russian-word"
      >
        {russianWord}
      </h2>

      {showTranslation ? (
        <p 
          className="text-2xl font-semibold text-muted-foreground text-center"
          data-testid="text-english-word"
        >
          {englishWord}
        </p>
      ) : (
        <Button
          variant="ghost"
          size="lg"
          className="text-lg text-muted-foreground"
          onClick={() => setShowTranslation(true)}
          data-testid="button-show-translation"
        >
          Tap to see translation
        </Button>
      )}
    </Card>
  );
}
