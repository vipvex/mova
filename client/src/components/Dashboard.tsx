import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import StatCard from "./StatCard";
import { BookOpen, Star, Flame, Clock, GraduationCap, RefreshCw, Settings, Trophy } from "lucide-react";
import { Link } from "wouter";

interface DashboardProps {
  wordsToday: number;
  totalWords: number;
  streak: number;
  wordsToReview: number;
  wordsToLearn: number;
  onStartLearn: () => void;
  onStartReview: () => void;
}

export default function Dashboard({ 
  wordsToday, 
  totalWords, 
  streak, 
  wordsToReview,
  wordsToLearn,
  onStartLearn,
  onStartReview 
}: DashboardProps) {
  const FLUENCY_TARGET = 2000;
  const WORDS_PER_DAY = 10;
  
  const fluencyPercent = Math.min((totalWords / FLUENCY_TARGET) * 100, 100);
  const wordsRemaining = Math.max(FLUENCY_TARGET - totalWords, 0);
  const daysUntilFluency = Math.ceil(wordsRemaining / WORDS_PER_DAY);
  
  return (
    <div className="flex flex-col items-center gap-8 p-6 max-w-2xl mx-auto">
      <div className="w-full flex justify-end">
        <Link href="/admin">
          <Button variant="ghost" size="icon" data-testid="button-settings">
            <Settings className="w-5 h-5" />
          </Button>
        </Link>
      </div>
      
      <div className="text-center space-y-2">
        <h1 className="text-4xl sm:text-5xl font-bold" data-testid="text-welcome">
          Let's Learn with Mova!
        </h1>
        <p className="text-xl text-muted-foreground">
          Practice makes perfect
        </p>
      </div>
      
      <div className="w-full bg-card border rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Trophy className="w-8 h-8 text-amber-500" />
          <div>
            <h3 className="text-lg font-bold">Path to Fluency</h3>
            <p className="text-sm text-muted-foreground">
              {fluencyPercent.toFixed(1)}% fluent ({totalWords} / {FLUENCY_TARGET} words)
            </p>
          </div>
        </div>
        
        <Progress 
          value={fluencyPercent} 
          className="h-4" 
          data-testid="progress-fluency"
        />
        
        <div className="text-center">
          {totalWords >= FLUENCY_TARGET ? (
            <p className="text-lg font-bold text-green-600 dark:text-green-400" data-testid="text-fluency-complete">
              Congratulations! You've reached conversational fluency!
            </p>
          ) : (
            <p className="text-muted-foreground" data-testid="text-days-until-fluency">
              <span className="font-semibold text-foreground">{daysUntilFluency} days</span> until fluency at {WORDS_PER_DAY} words/day
            </p>
          )}
        </div>
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
          value={wordsToReview > 0 ? wordsToReview : "None"} 
          label="Due for Review" 
          icon={Clock} 
          iconColor="text-green-500"
        />
      </div>

      <div className="w-full max-w-md flex flex-col gap-4 mt-4">
        <Button
          size="lg"
          className="w-full min-h-20 text-2xl font-bold rounded-2xl gap-3"
          onClick={onStartLearn}
          data-testid="button-start-learn"
        >
          <GraduationCap className="w-8 h-8" />
          Learn New Words
          {wordsToLearn > 0 && (
            <span className="ml-2 px-3 py-1 bg-white/20 rounded-full text-lg">
              {wordsToLearn}
            </span>
          )}
        </Button>
        
        <Button
          size="lg"
          variant="secondary"
          className="w-full min-h-16 text-xl font-bold rounded-2xl gap-3"
          onClick={onStartReview}
          disabled={wordsToReview === 0}
          data-testid="button-start-review"
        >
          <RefreshCw className="w-7 h-7" />
          Review Words
          {wordsToReview > 0 && (
            <span className="ml-2 px-3 py-1 bg-primary/20 rounded-full text-lg">
              {wordsToReview}
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
