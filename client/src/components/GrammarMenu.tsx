import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Clock, Hash, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

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

interface GrammarMenuProps {
  userId: string;
  languageLabel: string;
  onBack: () => void;
  onSelectExercise: (exerciseId: string) => void;
}

export default function GrammarMenu({
  userId,
  languageLabel,
  onBack,
  onSelectExercise,
}: GrammarMenuProps) {
  const { data: exercises, isLoading } = useQuery<GrammarExerciseWithProgress[]>({
    queryKey: ['/api/users', userId, 'grammar-exercises'],
    enabled: !!userId,
  });

  const categoryColors: Record<string, string> = {
    pronouns: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    verbs: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    nouns: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    cases: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    adjectives: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
    numbers: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
    vocabulary: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    questions: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    articles: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <p className="text-xl text-muted-foreground">Loading exercises...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-6">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            data-testid="button-grammar-back"
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-grammar-title">
              Practice Grammar
            </h1>
            <p className="text-muted-foreground">{languageLabel} exercises</p>
          </div>
        </div>

        <div className="space-y-3">
          {exercises?.map((exercise) => (
            <Card
              key={exercise.id}
              className="p-4 cursor-pointer hover-elevate active-elevate-2 overflow-visible"
              onClick={() => onSelectExercise(exercise.id)}
              data-testid={`card-exercise-${exercise.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-semibold text-lg" data-testid={`text-exercise-name-${exercise.id}`}>
                      {exercise.name}
                    </h3>
                    <Badge 
                      variant="secondary" 
                      className={`text-xs ${categoryColors[exercise.category] || ''}`}
                    >
                      {exercise.category}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm mb-2">
                    {exercise.description}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Hash className="w-3 h-3" />
                      <span data-testid={`text-practice-count-${exercise.id}`}>
                        {exercise.practiceCount} {exercise.practiceCount === 1 ? 'practice' : 'practices'}
                      </span>
                    </div>
                    {exercise.lastPracticedAt && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span data-testid={`text-last-practiced-${exercise.id}`}>
                          {formatDistanceToNow(new Date(exercise.lastPracticedAt), { addSuffix: true })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                  <BookOpen className="w-5 h-5 text-primary" />
                </div>
              </div>
            </Card>
          ))}

          {(!exercises || exercises.length === 0) && (
            <div className="text-center py-12 text-muted-foreground">
              No grammar exercises available yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
