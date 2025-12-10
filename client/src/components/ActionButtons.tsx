import { Button } from "@/components/ui/button";
import { BookOpen, Check } from "lucide-react";

interface ActionButtonsProps {
  onStillLearning: () => void;
  onKnowIt: () => void;
  disabled?: boolean;
}

export default function ActionButtons({ onStillLearning, onKnowIt, disabled = false }: ActionButtonsProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 w-full max-w-lg mx-auto px-4">
      <Button
        size="lg"
        variant="secondary"
        className="flex-1 min-h-16 text-xl font-bold rounded-2xl gap-3"
        onClick={onStillLearning}
        disabled={disabled}
        data-testid="button-still-learning"
      >
        <BookOpen className="w-6 h-6" />
        Still Learning
      </Button>
      <Button
        size="lg"
        className="flex-1 min-h-16 text-xl font-bold rounded-2xl gap-3"
        onClick={onKnowIt}
        disabled={disabled}
        data-testid="button-know-it"
      >
        <Check className="w-6 h-6" />
        I Know It!
      </Button>
    </div>
  );
}
