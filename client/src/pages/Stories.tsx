import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, BookOpen, CheckCircle, Loader2, Lock } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import StoryReader from "@/components/StoryReader";
import ComicReader from "@/components/ComicReader";

interface Story {
  id: string;
  title: string;
  targetUserId: string;
  language: string;
  status: string;
  storyType: string;
  pageCount: number;
  coverImageUrl: string | null;
  createdAt: string;
  publishedAt: string | null;
  progress: {
    currentPage: number;
    isCompleted: boolean;
    quizScore: number | null;
  } | null;
}

export default function Stories() {
  const { currentUser } = useUser();
  const [, navigate] = useLocation();
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  
  const userId = currentUser?.id ?? '';

  const { data: stories, isLoading } = useQuery<Story[]>({
    queryKey: ['/api/users', userId, 'stories'],
    enabled: !!userId,
  });

  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleSelectStory = useCallback((storyId: string) => {
    setSelectedStoryId(storyId);
  }, []);

  const handleCloseStory = useCallback(() => {
    setSelectedStoryId(null);
  }, []);

  const selectedStory = stories?.find(s => s.id === selectedStoryId);

  if (selectedStoryId && selectedStory) {
    if (selectedStory.storyType === 'comic') {
      return (
        <ComicReader
          storyId={selectedStoryId}
          userId={userId}
          username={currentUser?.username ?? ''}
          language={currentUser?.language ?? 'russian'}
          onBack={handleCloseStory}
        />
      );
    }
    return (
      <StoryReader
        storyId={selectedStoryId}
        userId={userId}
        username={currentUser?.username ?? ''}
        language={currentUser?.language ?? 'russian'}
        onBack={handleCloseStory}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <p className="text-xl text-muted-foreground">Loading stories...</p>
        </div>
      </div>
    );
  }

  const hasStories = stories && stories.length > 0;

  return (
    <div className="min-h-screen bg-background py-6">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            data-testid="button-stories-back"
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-3xl font-bold" data-testid="text-stories-title">
            Story Library
          </h1>
        </div>

        {!hasStories ? (
          <div className="text-center py-12">
            <BookOpen className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Stories Yet</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Stories will appear here once they're created for you. 
              Keep learning vocabulary - stories are made from words you know!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {stories.map((story) => (
              <StoryCard
                key={story.id}
                story={story}
                onSelect={() => handleSelectStory(story.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface StoryCardProps {
  story: Story;
  onSelect: () => void;
}

function StoryCard({ story, onSelect }: StoryCardProps) {
  const isCompleted = story.progress?.isCompleted ?? false;
  const currentPage = story.progress?.currentPage ?? 0;
  const hasStarted = currentPage > 0;
  const progress = story.pageCount > 0 ? (currentPage / story.pageCount) * 100 : 0;

  return (
    <Card 
      className="overflow-hidden cursor-pointer hover-elevate transition-transform"
      onClick={onSelect}
      data-testid={`story-card-${story.id}`}
    >
      <div className="aspect-[3/4] relative bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30">
        {story.coverImageUrl ? (
          <img 
            src={story.coverImageUrl} 
            alt={story.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="w-12 h-12 text-emerald-500/50" />
          </div>
        )}
        
        {isCompleted && (
          <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
            <CheckCircle className="w-4 h-4" />
          </div>
        )}
        
        {hasStarted && !isCompleted && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
            <div 
              className="h-full bg-emerald-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
      
      <CardContent className="p-3">
        <h3 className="font-semibold text-sm line-clamp-2" data-testid={`story-title-${story.id}`}>
          {story.title}
        </h3>
        <div className="flex items-center gap-1 mt-1">
          {story.storyType === 'comic' && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-600">
              Comic
            </Badge>
          )}
          <p className="text-xs text-muted-foreground">
            {story.pageCount} pages
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
