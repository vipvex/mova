import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Crosshair } from "lucide-react";

interface GamesMenuProps {
  onBack: () => void;
  onSelectGame: (gameId: string) => void;
  languageLabel: string;
}

const GAMES = [
  {
    id: "word-catch",
    title: "Word Catch",
    description: "Listen to the word, then catch the matching picture before it falls!",
    icon: Crosshair,
  },
];

export default function GamesMenu({ onBack, onSelectGame, languageLabel }: GamesMenuProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background border-b px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Button size="icon" variant="ghost" onClick={onBack} data-testid="button-games-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">{languageLabel} Games</h1>
        </div>
      </header>
      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {GAMES.map(game => (
          <Card
            key={game.id}
            className="hover-elevate cursor-pointer p-4"
            onClick={() => onSelectGame(game.id)}
            data-testid={`card-game-${game.id}`}
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <game.icon className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold">{game.title}</h2>
                <p className="text-sm text-muted-foreground">{game.description}</p>
              </div>
            </div>
          </Card>
        ))}
      </main>
    </div>
  );
}
