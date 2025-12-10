import { Button } from "@/components/ui/button";
import StatCard from "./StatCard";
import { BookOpen, Star, Flame, Clock, Play } from "lucide-react";

interface DashboardProps {
  wordsToday: number;
  totalWords: number;
  streak: number;
  nextReviewMinutes: number;
  onStartPractice: () => void;
}

export default function Dashboard({ 
  wordsToday, 
  totalWords, 
  streak, 
  nextReviewMinutes,
  onStartPractice 
}: DashboardProps) {
  return (
    <div className="flex flex-col items-center gap-8 p-6 max-w-2xl mx-auto">
      <div className="text-center space-y-2">
        <h1 className="text-4xl sm:text-5xl font-bold" data-testid="text-welcome">
          Let's Learn Russian!
        </h1>
        <p className="text-xl text-muted-foreground">
          Practice makes perfect
        </p>
      </div>

      <div className="w-full grid grid-cols-2 gap-4">
        <StatCard 
          value={wordsToday} 
          label="Words Today" 
          icon={BookOpen} 
          iconColor="text-blue-500"
        />
        <StatCard 
          value={totalWords} 
          label="Total Learned" 
          icon={Star} 
          iconColor="text-amber-500"
        />
        <StatCard 
          value={streak} 
          label="Day Streak" 
          icon={Flame} 
          iconColor="text-orange-500"
        />
        <StatCard 
          value={nextReviewMinutes > 0 ? `${nextReviewMinutes}m` : "Now!"} 
          label="Next Review" 
          icon={Clock} 
          iconColor="text-green-500"
        />
      </div>

      <Button
        size="lg"
        className="w-full max-w-md min-h-20 text-2xl font-bold rounded-2xl gap-3 mt-4"
        onClick={onStartPractice}
        data-testid="button-start-practice"
      >
        <Play className="w-8 h-8" />
        Start Practice
      </Button>
    </div>
  );
}
