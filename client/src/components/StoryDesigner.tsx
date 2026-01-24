import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookOpen,
  Plus,
  Sparkles,
  Loader2,
  Trash2,
  Edit3,
  Eye,
  Send,
  FileText,
  Image as ImageIcon,
  Volume2,
  Users,
  UserCircle,
  Wand2,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Language } from "@/lib/api";

interface User {
  id: string;
  username: string;
  language: string;
}

interface Story {
  id: string;
  title: string;
  targetUserId: string;
  language: string;
  status: string;
  pageCount: number;
  coverImageUrl: string | null;
  createdAt: string;
  publishedAt: string | null;
}

interface StoryPage {
  id: string;
  storyId: string;
  pageNumber: number;
  sentence: string;
  englishTranslation: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
}

interface StoryQuiz {
  id: string;
  storyId: string;
  questionNumber: number;
  question: string;
  correctAnswer: string;
  wrongOption1: string;
  wrongOption2: string;
}

interface StoryReference {
  id: string;
  storyId: string;
  name: string;
  description: string;
  referenceImageUrl: string | null;
  createdAt: string;
}

interface StoryDetails extends Story {
  pages: StoryPage[];
  quizzes: StoryQuiz[];
}

interface StoryPreview {
  preview: boolean;
  userId: string;
  language: string;
  title: string;
  englishTitle: string;
  lesson: string;
  storyArc: string;
  characters?: Array<{
    name: string;
    description: string;
  }>;
  pages: Array<{
    sentence: string;
    englishTranslation: string;
    imagePrompt: string;
  }>;
  quizzes: Array<{
    question: string;
    correctAnswer: string;
    wrongOption1: string;
    wrongOption2: string;
  }>;
}

interface StoryDesignerProps {
  authToken: string;
  userLanguage: Language;
}

export default function StoryDesigner({ authToken, userLanguage }: StoryDesignerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [storyPreview, setStoryPreview] = useState<StoryPreview | null>(null);
  const [editingStory, setEditingStory] = useState<StoryDetails | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [newStoryTitle, setNewStoryTitle] = useState("");
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [generatePageCount, setGeneratePageCount] = useState("10");
  
  // Character reference management state
  const [showReferencesDialog, setShowReferencesDialog] = useState(false);
  const [referencesStoryId, setReferencesStoryId] = useState<string | null>(null);
  const [newRefName, setNewRefName] = useState("");
  const [newRefDescription, setNewRefDescription] = useState("");
  const [generatingRefImageId, setGeneratingRefImageId] = useState<string | null>(null);

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
    queryFn: async () => {
      const response = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    },
    enabled: !!authToken,
  });

  const filteredUsers = users.filter(u => u.language === userLanguage);

  const { data: stories = [], isLoading: storiesLoading } = useQuery<Story[]>({
    queryKey: ['/api/admin/stories', userLanguage],
    queryFn: async () => {
      const response = await fetch(`/api/admin/stories?language=${userLanguage}`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      if (!response.ok) throw new Error('Failed to fetch stories');
      return response.json();
    },
    enabled: !!authToken,
  });

  // Query for story references (when references dialog is open)
  const { data: storyReferences = [], refetch: refetchReferences } = useQuery<StoryReference[]>({
    queryKey: ['/api/admin/stories', referencesStoryId, 'references'],
    queryFn: async () => {
      if (!referencesStoryId) return [];
      const response = await fetch(`/api/admin/stories/${referencesStoryId}/references`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      if (!response.ok) throw new Error('Failed to fetch references');
      return response.json();
    },
    enabled: !!authToken && !!referencesStoryId,
  });

  // Mutations for character references
  const createReferenceMutation = useMutation({
    mutationFn: async (data: { storyId: string; name: string; description: string }) => {
      const response = await apiRequest('POST', `/api/admin/stories/${data.storyId}/references`, {
        name: data.name,
        description: data.description,
      }, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      return response.json();
    },
    onSuccess: () => {
      refetchReferences();
      setNewRefName("");
      setNewRefDescription("");
      toast({ title: "Reference created", description: "Character/object reference added." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create reference", variant: "destructive" });
    },
  });

  const generateRefImageMutation = useMutation({
    mutationFn: async (referenceId: string) => {
      setGeneratingRefImageId(referenceId);
      const response = await apiRequest('POST', `/api/admin/stories/references/${referenceId}/generate-image`, undefined, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      return response.json();
    },
    onSuccess: () => {
      setGeneratingRefImageId(null);
      refetchReferences();
      toast({ title: "Image generated", description: "Reference image has been created." });
    },
    onError: () => {
      setGeneratingRefImageId(null);
      toast({ title: "Error", description: "Failed to generate image", variant: "destructive" });
    },
  });

  const deleteReferenceMutation = useMutation({
    mutationFn: async (referenceId: string) => {
      await apiRequest('DELETE', `/api/admin/stories/references/${referenceId}`, undefined, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
    },
    onSuccess: () => {
      refetchReferences();
      toast({ title: "Reference deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete reference", variant: "destructive" });
    },
  });

  const handleOpenReferencesDialog = useCallback((storyId: string) => {
    setReferencesStoryId(storyId);
    setShowReferencesDialog(true);
  }, []);

  const handleCloseReferencesDialog = useCallback(() => {
    setShowReferencesDialog(false);
    setReferencesStoryId(null);
    setNewRefName("");
    setNewRefDescription("");
  }, []);

  const handleCreateReference = useCallback(() => {
    if (!referencesStoryId || !newRefName.trim() || !newRefDescription.trim()) return;
    createReferenceMutation.mutate({
      storyId: referencesStoryId,
      name: newRefName.trim(),
      description: newRefDescription.trim(),
    });
  }, [referencesStoryId, newRefName, newRefDescription, createReferenceMutation]);

  const createStoryMutation = useMutation({
    mutationFn: async (data: { title: string; targetUserId: string; language: string }) => {
      const response = await apiRequest('POST', '/api/admin/stories', data, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stories', userLanguage] });
      setShowCreateDialog(false);
      setNewStoryTitle("");
      setSelectedUserId("");
      toast({ title: "Story created", description: "You can now add pages to the story." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create story", variant: "destructive" });
    },
  });

  const previewStoryMutation = useMutation({
    mutationFn: async (data: { targetUserId: string; theme?: string; pageCount: number }) => {
      const response = await apiRequest('POST', '/api/admin/stories/preview', {
        userId: data.targetUserId,
        theme: data.theme,
        pageCount: data.pageCount,
      }, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      return response.json() as Promise<StoryPreview>;
    },
    onSuccess: (preview) => {
      setStoryPreview(preview);
      setShowGenerateDialog(false);
      setShowPreviewDialog(true);
      toast({ title: "Preview ready", description: "Review the story before saving." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to generate preview", variant: "destructive" });
    },
  });

  const confirmStoryMutation = useMutation({
    mutationFn: async (preview: StoryPreview) => {
      const response = await apiRequest('POST', '/api/admin/stories/confirm', {
        userId: preview.userId,
        title: preview.title,
        language: preview.language,
        pages: preview.pages,
        quizzes: preview.quizzes,
        characters: preview.characters || [],
      }, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stories', userLanguage] });
      setShowPreviewDialog(false);
      setStoryPreview(null);
      setGeneratePrompt("");
      setSelectedUserId("");
      toast({ title: "Story saved", description: "The story has been created and saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to save story", variant: "destructive" });
    },
  });

  const generateStoryMutation = useMutation({
    mutationFn: async (data: { targetUserId: string; theme?: string; pageCount: number }) => {
      const response = await apiRequest('POST', '/api/admin/stories/generate', {
        userId: data.targetUserId,
        theme: data.theme,
        pageCount: data.pageCount,
      }, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stories', userLanguage] });
      setShowGenerateDialog(false);
      setGeneratePrompt("");
      setSelectedUserId("");
      toast({ title: "Story generated", description: "AI story has been created from user's vocabulary." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to generate story", variant: "destructive" });
    },
  });

  const deleteStoryMutation = useMutation({
    mutationFn: async (storyId: string) => {
      await apiRequest('DELETE', `/api/admin/stories/${storyId}`, undefined, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stories', userLanguage] });
      toast({ title: "Story deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete story", variant: "destructive" });
    },
  });

  const publishStoryMutation = useMutation({
    mutationFn: async (storyId: string) => {
      const response = await apiRequest('POST', `/api/admin/stories/${storyId}/publish`, undefined, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stories', userLanguage] });
      toast({ title: "Story published", description: "The story is now available to the user." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to publish story", variant: "destructive" });
    },
  });

  const [generatingImagesForStory, setGeneratingImagesForStory] = useState<string | null>(null);

  const generateAllImagesMutation = useMutation({
    mutationFn: async (storyId: string) => {
      setGeneratingImagesForStory(storyId);
      const response = await apiRequest('POST', `/api/admin/stories/${storyId}/generate-all-images`, undefined, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratingImagesForStory(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stories', userLanguage] });
      toast({ title: "Images generated", description: data.message || "All story images have been generated." });
    },
    onError: () => {
      setGeneratingImagesForStory(null);
      toast({ title: "Error", description: "Failed to generate images", variant: "destructive" });
    },
  });

  const fetchStoryDetails = useCallback(async (storyId: string) => {
    const response = await fetch(`/api/stories/${storyId}`);
    if (!response.ok) throw new Error('Failed to fetch story details');
    return response.json() as Promise<StoryDetails>;
  }, []);

  const handleViewStory = useCallback(async (storyId: string) => {
    try {
      const details = await fetchStoryDetails(storyId);
      setEditingStory(details);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load story details", variant: "destructive" });
    }
  }, [fetchStoryDetails, toast]);

  const handleCreateStory = useCallback(() => {
    if (!newStoryTitle.trim() || !selectedUserId) return;
    createStoryMutation.mutate({
      title: newStoryTitle,
      targetUserId: selectedUserId,
      language: userLanguage,
    });
  }, [newStoryTitle, selectedUserId, userLanguage, createStoryMutation]);

  const handleGeneratePreview = useCallback(() => {
    if (!selectedUserId) return;
    previewStoryMutation.mutate({
      targetUserId: selectedUserId,
      theme: generatePrompt || undefined,
      pageCount: parseInt(generatePageCount) || 10,
    });
  }, [selectedUserId, generatePrompt, generatePageCount, previewStoryMutation]);

  const handleConfirmStory = useCallback(() => {
    if (!storyPreview) return;
    confirmStoryMutation.mutate(storyPreview);
  }, [storyPreview, confirmStoryMutation]);

  const handleRegeneratePreview = useCallback(() => {
    setShowPreviewDialog(false);
    setStoryPreview(null);
    setShowGenerateDialog(true);
  }, []);

  const getUserName = useCallback((userId: string) => {
    const user = users.find(u => u.id === userId);
    return user?.username || 'Unknown';
  }, [users]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Published</Badge>;
      case 'draft':
        return <Badge variant="outline">Draft</Badge>;
      case 'review':
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Review</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (storiesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Story Designer</h2>
          <p className="text-sm text-muted-foreground">
            Create and manage stories for {userLanguage === 'russian' ? 'Russian' : 'Spanish'} learners
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowCreateDialog(true)}
            className="gap-2"
            data-testid="button-create-story"
          >
            <Plus className="w-4 h-4" />
            Manual Story
          </Button>
          <Button
            onClick={() => setShowGenerateDialog(true)}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            data-testid="button-generate-story"
          >
            <Sparkles className="w-4 h-4" />
            AI Generate
          </Button>
        </div>
      </div>

      {stories.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <BookOpen className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Stories Yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first story using the buttons above.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {stories.map((story) => (
            <Card key={story.id} className="overflow-hidden">
              <div className="flex items-center gap-4 p-4">
                <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 flex items-center justify-center flex-shrink-0">
                  {story.coverImageUrl ? (
                    <img src={story.coverImageUrl} alt={story.title} className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <BookOpen className="w-8 h-8 text-emerald-500/50" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold truncate">{story.title}</h3>
                    {getStatusBadge(story.status)}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {getUserName(story.targetUserId)}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {story.pageCount} pages
                    </span>
                    <span>
                      Created {new Date(story.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleViewStory(story.id)}
                    data-testid={`button-view-story-${story.id}`}
                    title="View story"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenReferencesDialog(story.id)}
                    data-testid={`button-references-${story.id}`}
                    title="Manage character references for image consistency"
                  >
                    <UserCircle className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => generateAllImagesMutation.mutate(story.id)}
                    disabled={generatingImagesForStory === story.id}
                    title="Generate all images with character consistency"
                    data-testid={`button-generate-images-${story.id}`}
                  >
                    {generatingImagesForStory === story.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ImageIcon className="w-4 h-4" />
                    )}
                  </Button>
                  {story.status !== 'published' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => publishStoryMutation.mutate(story.id)}
                      disabled={publishStoryMutation.isPending}
                      data-testid={`button-publish-story-${story.id}`}
                      title="Publish story"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteStoryMutation.mutate(story.id)}
                    disabled={deleteStoryMutation.isPending}
                    data-testid={`button-delete-story-${story.id}`}
                    title="Delete story"
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Story</DialogTitle>
            <DialogDescription>
              Create a manual story and add pages yourself
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Story Title</label>
              <Input
                placeholder="Enter story title..."
                value={newStoryTitle}
                onChange={(e) => setNewStoryTitle(e.target.value)}
                data-testid="input-story-title"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Target User</label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger data-testid="select-target-user">
                  <SelectValue placeholder="Select a user..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateStory}
              disabled={createStoryMutation.isPending || !newStoryTitle.trim() || !selectedUserId}
              className="gap-2"
              data-testid="button-confirm-create-story"
            >
              {createStoryMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Create Story
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-500" />
              AI Story Generator
            </DialogTitle>
            <DialogDescription>
              Generate a personalized story using the user's learned vocabulary
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Target User</label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger data-testid="select-generate-user">
                  <SelectValue placeholder="Select a user..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The story will only use words this user has learned
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Story Theme (optional)</label>
              <Textarea
                placeholder="e.g., A day at the park, An adventure with animals..."
                value={generatePrompt}
                onChange={(e) => setGeneratePrompt(e.target.value)}
                rows={2}
                data-testid="input-generate-theme"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Number of Pages</label>
              <Select value={generatePageCount} onValueChange={setGeneratePageCount}>
                <SelectTrigger data-testid="select-page-count">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 6, 7, 8, 9, 10, 12, 15, 18, 20, 25, 30].map((count) => (
                    <SelectItem key={count} value={count.toString()}>
                      {count} pages
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleGeneratePreview}
              disabled={previewStoryMutation.isPending || !selectedUserId}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              data-testid="button-confirm-generate-story"
            >
              {previewStoryMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating Preview...
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4" />
                  Preview Story
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPreviewDialog} onOpenChange={(open) => { if (!open) { setShowPreviewDialog(false); setStoryPreview(null); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-blue-500" />
              Story Preview
            </DialogTitle>
            <DialogDescription>
              Review the story before saving to the database
            </DialogDescription>
          </DialogHeader>
          
          {storyPreview && (
            <ScrollArea className="max-h-[65vh] pr-4">
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold">{storyPreview.englishTitle || storyPreview.title}</h3>
                    <Badge variant="outline">{storyPreview.pages.length} pages</Badge>
                  </div>
                  
                  {storyPreview.lesson && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        <strong>Lesson:</strong> {storyPreview.lesson}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2 text-blue-600 dark:text-blue-400">
                    <FileText className="w-4 h-4" />
                    Story Arc (Hero's Journey)
                  </h4>
                  <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                    <CardContent className="p-4">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {storyPreview.storyArc}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <BookOpen className="w-4 h-4" />
                    {storyPreview.language === 'russian' ? 'Russian' : 'Spanish'} Pages (Chunked)
                  </h4>
                  <div className="grid gap-2">
                    {storyPreview.pages.map((page, index) => (
                      <Card key={index} className="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
                        <CardContent className="p-3">
                          <div className="flex items-start gap-3">
                            <Badge variant="outline" className="text-xs flex-shrink-0">
                              {index + 1}
                            </Badge>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-base">{page.sentence}</p>
                              <p className="text-sm text-muted-foreground">{page.englishTranslation}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {storyPreview.quizzes && storyPreview.quizzes.length > 0 && (
                  <div className="space-y-3 pt-4 border-t">
                    <h4 className="font-semibold">Quiz Questions ({storyPreview.quizzes.length})</h4>
                    <div className="grid gap-2">
                      {storyPreview.quizzes.map((quiz, index) => (
                        <Card key={index}>
                          <CardContent className="p-3">
                            <p className="font-medium text-sm mb-2">
                              Q{index + 1}: {quiz.question}
                            </p>
                            <div className="flex flex-wrap gap-1">
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs">
                                {quiz.correctAnswer}
                              </Badge>
                              <Badge variant="outline" className="text-xs">{quiz.wrongOption1}</Badge>
                              <Badge variant="outline" className="text-xs">{quiz.wrongOption2}</Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => { setShowPreviewDialog(false); setStoryPreview(null); }}
              data-testid="button-cancel-preview"
            >
              Cancel
            </Button>
            <Button 
              variant="outline"
              onClick={handleRegeneratePreview}
              className="gap-2"
              data-testid="button-regenerate-preview"
            >
              <Sparkles className="w-4 h-4" />
              Try Again
            </Button>
            <Button
              onClick={handleConfirmStory}
              disabled={confirmStoryMutation.isPending}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              data-testid="button-confirm-save-story"
            >
              {confirmStoryMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Save Story
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingStory} onOpenChange={() => setEditingStory(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              {editingStory?.title}
            </DialogTitle>
            <DialogDescription>
              {editingStory?.pages.length} pages • {editingStory?.quizzes.length} quiz questions
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4">
              {editingStory?.pages.map((page) => (
                <Card key={page.id} className="overflow-hidden">
                  <div className="flex gap-4 p-4">
                    <div className="w-24 h-24 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      {page.imageUrl ? (
                        <img src={page.imageUrl} alt="" className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-xs">
                          Page {page.pageNumber}
                        </Badge>
                        {page.audioUrl && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Volume2 className="w-3 h-3" />
                            Audio
                          </Badge>
                        )}
                      </div>
                      <p className="font-medium text-lg mb-1">{page.sentence}</p>
                      {page.englishTranslation && (
                        <p className="text-sm text-muted-foreground">{page.englishTranslation}</p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}

              {editingStory?.quizzes && editingStory.quizzes.length > 0 && (
                <div className="pt-4 border-t">
                  <h4 className="font-semibold mb-3">Quiz Questions</h4>
                  {editingStory.quizzes.map((quiz) => (
                    <Card key={quiz.id} className="mb-2">
                      <CardContent className="p-4">
                        <p className="font-medium mb-2">
                          Q{quiz.questionNumber}: {quiz.question}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            ✓ {quiz.correctAnswer}
                          </Badge>
                          <Badge variant="outline">{quiz.wrongOption1}</Badge>
                          <Badge variant="outline">{quiz.wrongOption2}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingStory(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Character/Object References Dialog for Image Consistency */}
      <Dialog open={showReferencesDialog} onOpenChange={(open) => {
        if (!open) handleCloseReferencesDialog();
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCircle className="w-5 h-5 text-emerald-500" />
              Character & Object References
            </DialogTitle>
            <DialogDescription>
              Add reference images for characters and objects to maintain consistent appearance across all story illustrations.
              Generate images first, then generate story illustrations - they will use these references.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[50vh] pr-4">
            <div className="space-y-4">
              {/* Add New Reference Form */}
              <Card className="border-dashed">
                <CardContent className="p-4 space-y-3">
                  <h4 className="font-medium text-sm">Add New Reference</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Name</label>
                      <Input
                        placeholder="e.g., Main character, Red ball..."
                        value={newRefName}
                        onChange={(e) => setNewRefName(e.target.value)}
                        data-testid="input-ref-name"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Description</label>
                      <Input
                        placeholder="e.g., A friendly orange cat with blue eyes..."
                        value={newRefDescription}
                        onChange={(e) => setNewRefDescription(e.target.value)}
                        data-testid="input-ref-description"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleCreateReference}
                    disabled={createReferenceMutation.isPending || !newRefName.trim() || !newRefDescription.trim()}
                    className="gap-2"
                    data-testid="button-add-reference"
                  >
                    {createReferenceMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    Add Reference
                  </Button>
                </CardContent>
              </Card>

              {/* Existing References */}
              {storyReferences.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <UserCircle className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>No references yet. Add characters and objects above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {storyReferences.map((ref) => (
                    <Card key={ref.id} className="overflow-hidden">
                      <div className="flex gap-4 p-4">
                        <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 relative group">
                          {ref.referenceImageUrl ? (
                            <img
                              src={ref.referenceImageUrl}
                              alt={ref.name}
                              className="w-full h-full object-cover rounded-lg"
                            />
                          ) : (
                            <UserCircle className="w-8 h-8 text-muted-foreground/30" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold">{ref.name}</h4>
                          <p className="text-sm text-muted-foreground line-clamp-2">{ref.description}</p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => generateRefImageMutation.mutate(ref.id)}
                            disabled={generatingRefImageId === ref.id}
                            className="gap-1"
                            data-testid={`button-generate-ref-image-${ref.id}`}
                          >
                            {generatingRefImageId === ref.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Wand2 className="w-3 h-3" />
                            )}
                            {ref.referenceImageUrl ? 'Regenerate' : 'Generate'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteReferenceMutation.mutate(ref.id)}
                            disabled={deleteReferenceMutation.isPending}
                            className="text-destructive hover:text-destructive"
                            data-testid={`button-delete-ref-${ref.id}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>

          <DialogFooter>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mr-auto">
              {storyReferences.filter(r => r.referenceImageUrl).length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {storyReferences.filter(r => r.referenceImageUrl).length} reference image(s) ready
                </Badge>
              )}
            </div>
            <Button variant="outline" onClick={handleCloseReferencesDialog}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
