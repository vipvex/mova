import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Crosshair, Users, Lock, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface GrammarExerciseWithProgress {
  id: string;
  name: string;
  description: string;
  language: string;
  category: string;
  difficulty: number;
  displayOrder: number;
  practiceCount: number;
  lastPracticedAt: string | null;
}

interface GamesMenuProps {
  userId: string;
  onBack: () => void;
  onSelectGame: (gameId: string, exerciseId?: string) => void;
  languageLabel: string;
}

const BUILT_IN_GAMES = [
  {
    id: "word-catch",
    title: "Word Catch",
    description: "Listen to the word, then catch the matching picture before it falls!",
    icon: Crosshair,
    unlocked: true,
  },
  {
    id: "personal-pronouns",
    title: "Personal Pronouns",
    description: "Learn pronouns by matching them with fun cartoon characters!",
    icon: Users,
    unlocked: true,
  },
];

export default function GamesMenu({ userId, onBack, onSelectGame, languageLabel }: GamesMenuProps) {
  const { data: exercises, isLoading } = useQuery<GrammarExerciseWithProgress[]>({
    queryKey: ['/api/users', userId, 'grammar-exercises'],
    enabled: !!userId,
  });

  const lockedExercises = (exercises ?? []).filter(
    (ex) => !ex.name.toLowerCase().includes("pronoun")
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background border-b px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Button size="icon" variant="ghost" onClick={onBack} data-testid="button-games-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold">{languageLabel} Games</h1>
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto p-4 space-y-3">
        {BUILT_IN_GAMES.map((game) => (
          <Card
            key={game.id}
            className="hover-elevate cursor-pointer p-4 overflow-visible"
            onClick={() => onSelectGame(game.id)}
            data-testid={`card-game-${game.id}`}
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <game.icon className="w-7 h-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold">{game.title}</h2>
                <p className="text-sm text-muted-foreground">{game.description}</p>
              </div>
            </div>
          </Card>
        ))}

        {isLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {lockedExercises.length > 0 && (
          <div className="pt-4">
            <p className="text-sm font-medium text-muted-foreground mb-3 px-1">Coming Soon</p>
            <div className="space-y-3">
              {lockedExercises.map((exercise) => (
                <Card
                  key={exercise.id}
                  className="p-4 opacity-50 pointer-events-none select-none"
                  data-testid={`card-game-locked-${exercise.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center shrink-0">
                      <Lock className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-lg">{exercise.name}</h3>
                        <Badge variant="secondary" className="text-xs">
                          {exercise.category}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{exercise.description}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
