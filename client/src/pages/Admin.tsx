import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { 
  ArrowLeft, 
  Lock, 
  RefreshCw, 
  ImagePlus, 
  Check, 
  X,
  Loader2,
  Edit3,
  BookOpen,
  Image,
  Settings,
  Save,
  GripVertical,
  Volume2,
  Calendar,
  RotateCcw,
  Trash2
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import type { Language } from "@/lib/api";

interface AdminWord {
  id: string;
  targetWord: string;
  english: string;
  language: string;
  imageUrl: string | null;
  audioUrl: string | null;
  frequencyRank: number;
  displayOrder: number;
  category: string | null;
  isLearned: boolean;
  learnedAt: string | null;
  lastReviewDate: string | null;
  reviewCount: number;
  nextReviewDate: string | null;
  repetitions: number;
}

async function verifyPassword(password: string): Promise<{ success: boolean; token?: string }> {
  try {
    const response = await apiRequest("POST", "/api/admin/auth", { password });
    if (response.ok) {
      const data = await response.json();
      return { success: true, token: data.token };
    }
    return { success: false };
  } catch {
    return { success: false };
  }
}

async function regenerateImage(wordId: string, token: string, customPrompt?: string): Promise<string> {
  const response = await fetch(`/api/admin/words/${wordId}/regenerate-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ customPrompt }),
  });
  if (!response.ok) throw new Error("Failed to regenerate image");
  const data = await response.json();
  return data.imageUrl;
}

async function generateImage(wordId: string, token: string): Promise<string> {
  const response = await fetch(`/api/admin/words/${wordId}/generate-image`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new Error("Failed to generate image");
  const data = await response.json();
  return data.imageUrl;
}

async function generateAudio(wordId: string): Promise<string> {
  const response = await fetch(`/api/tts/${wordId}`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Failed to generate audio");
  const data = await response.json();
  return data.audioUrl;
}

async function deleteImage(wordId: string, token: string): Promise<void> {
  const response = await fetch(`/api/admin/words/${wordId}/image`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new Error("Failed to delete image");
}

async function fetchWordsWithoutImagesAuth(token: string, language?: Language): Promise<AdminWord[]> {
  const url = language ? `/api/admin/words/no-images?language=${language}` : "/api/admin/words/no-images";
  const response = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to fetch words");
  return response.json();
}

async function fetchWordsWithMissingImagesAuth(token: string, language?: Language): Promise<AdminWord[]> {
  const url = language ? `/api/admin/words/missing-images?language=${language}` : "/api/admin/words/missing-images";
  const response = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to fetch words");
  return response.json();
}

interface BatchJobStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total: number;
  completed: number;
  failedCount: number;
  successCount: number;
  failed: string[];
}

async function startBatchGeneration(token: string, wordIds: string[]): Promise<{ jobId: string }> {
  const response = await fetch("/api/admin/batch-generate-images", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ wordIds }),
  });
  if (!response.ok) throw new Error("Failed to start batch generation");
  return response.json();
}

async function getBatchJobStatus(token: string, jobId: string): Promise<BatchJobStatus> {
  const response = await fetch(`/api/admin/batch-generate-images/${jobId}`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to get batch status");
  return response.json();
}

async function fetchAdminWordsAuth(token: string, language?: Language): Promise<AdminWord[]> {
  const url = language ? `/api/admin/words?language=${language}` : "/api/admin/words";
  const response = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to fetch words");
  return response.json();
}

async function fetchSettings(token: string): Promise<{ defaultImagePrompt: string }> {
  const response = await fetch("/api/admin/settings", {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to fetch settings");
  return response.json();
}

async function updateSettings(token: string, defaultImagePrompt: string): Promise<void> {
  const response = await fetch("/api/admin/settings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ defaultImagePrompt }),
  });
  if (!response.ok) throw new Error("Failed to update settings");
}

async function reorderWords(token: string, wordIds: string[], targetIndex: number): Promise<void> {
  const response = await fetch("/api/admin/words/reorder", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ wordIds, targetIndex }),
  });
  if (!response.ok) throw new Error("Failed to reorder words");
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateString: string | null): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Admin() {
  const { currentUser } = useUser();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  const [editingWord, setEditingWord] = useState<AdminWord | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchErrors, setBatchErrors] = useState<string[]>([]);
  
  const [isRegeneratingMissing, setIsRegeneratingMissing] = useState(false);
  const [missingProgress, setMissingProgress] = useState({ current: 0, total: 0 });
  const [missingImagesCount, setMissingImagesCount] = useState(0);
  
  const [isRegeneratingSelected, setIsRegeneratingSelected] = useState(false);
  const [selectedProgress, setSelectedProgress] = useState({ current: 0, total: 0 });
  
  const [imageCacheBuster, setImageCacheBuster] = useState(Date.now());
  
  const [showSettings, setShowSettings] = useState(false);
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draggedIds, setDraggedIds] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const queryClient = useQueryClient();
  
  const userLanguage = currentUser?.language as Language | undefined;
  const languageLabel = userLanguage === 'spanish' ? 'Spanish' : 'Russian';

  const { data: words = [], isLoading } = useQuery({
    queryKey: ['/api/admin/words', authToken, userLanguage],
    queryFn: () => authToken ? fetchAdminWordsAuth(authToken, userLanguage) : Promise.resolve([]),
    enabled: isAuthenticated && !!authToken,
  });

  const { data: settings } = useQuery({
    queryKey: ['/api/admin/settings', authToken],
    queryFn: () => authToken ? fetchSettings(authToken) : Promise.resolve({ defaultImagePrompt: "" }),
    enabled: isAuthenticated && !!authToken,
  });

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  useEffect(() => {
    async function checkMissingImages() {
      if (isAuthenticated && authToken) {
        try {
          const missingImages = await fetchWordsWithMissingImagesAuth(authToken, userLanguage);
          setMissingImagesCount(missingImages.length);
        } catch (error) {
          console.error("Failed to check missing images:", error);
        }
      }
    }
    checkMissingImages();
  }, [isAuthenticated, authToken, userLanguage, words]);

  const { toast } = useToast();
  
  const handleRegenerateMissingImages = useCallback(async () => {
    if (!authToken) return;
    
    setIsRegeneratingMissing(true);
    try {
      const wordsWithMissingImages = await fetchWordsWithMissingImagesAuth(authToken, userLanguage);
      
      if (wordsWithMissingImages.length === 0) {
        toast({
          title: "No images to regenerate",
          description: "All images are up to date",
        });
        setIsRegeneratingMissing(false);
        return;
      }
      
      const wordIds = wordsWithMissingImages.map(w => w.id);
      setMissingProgress({ current: 0, total: wordIds.length });

      const { jobId } = await startBatchGeneration(authToken, wordIds);
      
      const pollInterval = setInterval(async () => {
        try {
          const status = await getBatchJobStatus(authToken, jobId);
          setMissingProgress({ current: status.completed, total: status.total });
          
          if (status.status === 'completed' || status.status === 'failed') {
            clearInterval(pollInterval);
            
            queryClient.invalidateQueries({ queryKey: ['/api/admin/words', authToken, userLanguage] });
            
            const updatedMissing = await fetchWordsWithMissingImagesAuth(authToken, userLanguage);
            setMissingImagesCount(updatedMissing.length);
            
            if (status.failedCount > 0) {
              toast({
                title: "Some images failed",
                description: `${status.successCount} succeeded, ${status.failedCount} failed`,
                variant: "destructive",
              });
            } else {
              toast({
                title: "Images regenerated",
                description: `Successfully generated ${status.successCount} images (3 at a time)`,
              });
            }
            
            setImageCacheBuster(Date.now());
            setIsRegeneratingMissing(false);
            setMissingProgress({ current: 0, total: 0 });
          }
        } catch (error) {
          console.error("Error polling batch status:", error);
          clearInterval(pollInterval);
          setIsRegeneratingMissing(false);
          setMissingProgress({ current: 0, total: 0 });
        }
      }, 1500);
      
    } catch (error) {
      console.error("Error regenerating missing images:", error);
      toast({
        title: "Error",
        description: "Failed to start batch regeneration",
        variant: "destructive",
      });
      setIsRegeneratingMissing(false);
      setMissingProgress({ current: 0, total: 0 });
    }
  }, [authToken, userLanguage, queryClient, toast]);

  const handleRegenerateSelected = useCallback(async () => {
    if (!authToken || selectedIds.size === 0) return;
    
    setIsRegeneratingSelected(true);
    try {
      const wordIds = Array.from(selectedIds);
      setSelectedProgress({ current: 0, total: wordIds.length });

      const { jobId } = await startBatchGeneration(authToken, wordIds);
      
      const pollInterval = setInterval(async () => {
        try {
          const status = await getBatchJobStatus(authToken, jobId);
          setSelectedProgress({ current: status.completed, total: status.total });
          
          if (status.status === 'completed' || status.status === 'failed') {
            clearInterval(pollInterval);
            
            queryClient.invalidateQueries({ queryKey: ['/api/admin/words', authToken, userLanguage] });
            
            if (status.failedCount > 0) {
              toast({
                title: "Some images failed",
                description: `${status.successCount} succeeded, ${status.failedCount} failed`,
                variant: "destructive",
              });
            } else {
              toast({
                title: "Images regenerated",
                description: `Successfully regenerated ${status.successCount} selected images`,
              });
            }
            
            setImageCacheBuster(Date.now());
            setSelectedIds(new Set());
            setIsRegeneratingSelected(false);
            setSelectedProgress({ current: 0, total: 0 });
          }
        } catch (error) {
          console.error("Error polling batch status:", error);
          clearInterval(pollInterval);
          setIsRegeneratingSelected(false);
          setSelectedProgress({ current: 0, total: 0 });
        }
      }, 1500);
      
    } catch (error) {
      console.error("Error regenerating selected images:", error);
      toast({
        title: "Error",
        description: "Failed to start batch regeneration",
        variant: "destructive",
      });
      setIsRegeneratingSelected(false);
      setSelectedProgress({ current: 0, total: 0 });
    }
  }, [authToken, selectedIds, queryClient, userLanguage, toast]);

  const handlePlayAudio = useCallback(async (word: AdminWord) => {
    if (playingAudioId === word.id) {
      audioRef.current?.pause();
      setPlayingAudioId(null);
      return;
    }

    try {
      let audioUrl = word.audioUrl;
      
      if (!audioUrl) {
        setLoadingAudioId(word.id);
        audioUrl = await generateAudio(word.id);
        queryClient.invalidateQueries({ queryKey: ['/api/admin/words', authToken, userLanguage] });
      }

      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      audio.onended = () => setPlayingAudioId(null);
      audio.onerror = () => setPlayingAudioId(null);
      
      await audio.play();
      setPlayingAudioId(word.id);
    } catch (error) {
      console.error("Failed to play audio:", error);
    } finally {
      setLoadingAudioId(null);
    }
  }, [playingAudioId, authToken, queryClient]);

  const handleOpenSettings = useCallback(() => {
    setDefaultPrompt(settings?.defaultImagePrompt || "");
    setShowSettings(true);
    setSettingsSaved(false);
    setSettingsError(null);
  }, [settings]);

  const handleSaveSettings = useCallback(async () => {
    if (!authToken) return;
    
    if (!defaultPrompt.includes("{word}")) {
      setSettingsError("Prompt must contain {word} placeholder");
      return;
    }
    
    setIsSavingSettings(true);
    setSettingsError(null);
    try {
      await updateSettings(authToken, defaultPrompt);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings', authToken] });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSettingsError("Failed to save settings. Please try again.");
    } finally {
      setIsSavingSettings(false);
    }
  }, [authToken, defaultPrompt, queryClient]);

  const handleLogin = useCallback(async () => {
    setIsLoggingIn(true);
    setAuthError(false);
    
    const result = await verifyPassword(password);
    if (result.success && result.token) {
      setAuthToken(result.token);
      setIsAuthenticated(true);
    } else {
      setAuthError(true);
    }
    setIsLoggingIn(false);
  }, [password]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  }, [handleLogin]);

  const handleRegenerateImage = useCallback(async () => {
    if (!editingWord || !authToken) return;
    
    setIsRegenerating(true);
    try {
      await regenerateImage(editingWord.id, authToken, customPrompt || undefined);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/words', authToken, userLanguage] });
      setImageCacheBuster(Date.now());
      setEditingWord(null);
      setCustomPrompt("");
    } catch (error) {
      console.error("Failed to regenerate image:", error);
    } finally {
      setIsRegenerating(false);
    }
  }, [editingWord, customPrompt, queryClient, authToken]);

  const handleBatchGenerate = useCallback(async () => {
    if (!authToken) return;
    
    setIsBatchGenerating(true);
    setBatchErrors([]);
    
    try {
      const wordsWithoutImages = await fetchWordsWithoutImagesAuth(authToken, userLanguage);
      setBatchProgress({ current: 0, total: wordsWithoutImages.length });
      
      for (let i = 0; i < wordsWithoutImages.length; i++) {
        const word = wordsWithoutImages[i];
        try {
          await generateImage(word.id, authToken);
          setBatchProgress({ current: i + 1, total: wordsWithoutImages.length });
          setImageCacheBuster(Date.now());
          queryClient.invalidateQueries({ queryKey: ['/api/admin/words', authToken, userLanguage] });
        } catch (error) {
          setBatchErrors(prev => [...prev, `Failed: ${word.english}`]);
        }
        
        if (i < wordsWithoutImages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      console.error("Batch generation failed:", error);
    } finally {
      setIsBatchGenerating(false);
    }
  }, [queryClient, authToken, userLanguage]);

  const handleDeleteImage = useCallback(async (wordId: string) => {
    if (!authToken) return;
    
    setDeletingImageId(wordId);
    try {
      await deleteImage(wordId, authToken);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/words', authToken, userLanguage] });
    } catch (error) {
      console.error("Failed to delete image:", error);
    } finally {
      setDeletingImageId(null);
    }
  }, [authToken, queryClient, userLanguage]);

  const handleSelectWord = useCallback((wordId: string, checked: boolean, shiftKey: boolean) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(wordId);
      } else {
        newSet.delete(wordId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(words.map(w => w.id)));
    } else {
      setSelectedIds(new Set());
    }
  }, [words]);

  const handleDragStart = useCallback((e: React.DragEvent, word: AdminWord) => {
    e.dataTransfer.effectAllowed = "move";
    
    const idsToMove = selectedIds.has(word.id) 
      ? Array.from(selectedIds)
      : [word.id];
    
    setDraggedIds(idsToMove);
    setIsDragging(true);
    
    e.dataTransfer.setData("text/plain", JSON.stringify(idsToMove));
  }, [selectedIds]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDraggedIds([]);
    setDropTargetIndex(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetIndex(index);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    
    if (!authToken || draggedIds.length === 0) return;
    
    try {
      await reorderWords(authToken, draggedIds, targetIndex);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/words', authToken, userLanguage] });
    } catch (error) {
      console.error("Failed to reorder words:", error);
    }
    
    handleDragEnd();
  }, [authToken, draggedIds, queryClient, handleDragEnd]);

  const wordsWithoutImages = words.filter(w => !w.imageUrl);
  const learnedWords = words.filter(w => w.isLearned);
  const allSelected = words.length > 0 && selectedIds.size === words.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < words.length;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-sm p-8">
          <div className="flex flex-col items-center gap-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Parent Access</h1>
            
            <div className="w-full space-y-4">
              <Input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                data-testid="input-admin-password"
              />
              {authError && (
                <p className="text-sm text-destructive text-center">
                  Incorrect password
                </p>
              )}
              <Button
                className="w-full"
                onClick={handleLogin}
                disabled={isLoggingIn || !password}
                data-testid="button-admin-login"
              >
                {isLoggingIn ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Login"
                )}
              </Button>
            </div>
            
            <Link href="/">
              <Button variant="ghost" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to App
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background border-b px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button size="icon" variant="ghost" data-testid="button-admin-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold">{languageLabel} Word Database</h1>
          </div>
          
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex gap-3">
              <Badge variant="secondary" className="gap-1">
                <BookOpen className="w-3 h-3" />
                {learnedWords.length} learned
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Image className="w-3 h-3" />
                {wordsWithoutImages.length} need images
              </Badge>
              {selectedIds.size > 0 && (
                <Badge variant="default" className="gap-1">
                  {selectedIds.size} selected
                </Badge>
              )}
            </div>
            
            {selectedIds.size > 0 && (
              <Button
                variant="default"
                onClick={handleRegenerateSelected}
                disabled={isRegeneratingSelected}
                className="gap-2"
                data-testid="button-regenerate-selected"
              >
                {isRegeneratingSelected ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {selectedProgress.current}/{selectedProgress.total}
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Regenerate {selectedIds.size} Selected
                  </>
                )}
              </Button>
            )}
            
            <Button
              variant="outline"
              onClick={handleOpenSettings}
              className="gap-2"
              data-testid="button-open-settings"
            >
              <Settings className="w-4 h-4" />
              Settings
            </Button>
            
            <Button
              onClick={handleBatchGenerate}
              disabled={isBatchGenerating || wordsWithoutImages.length === 0}
              className="gap-2"
              data-testid="button-generate-all-images"
            >
              {isBatchGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {batchProgress.current}/{batchProgress.total}
                </>
              ) : (
                <>
                  <ImagePlus className="w-4 h-4" />
                  Generate All Images
                </>
              )}
            </Button>
            
            {missingImagesCount > 0 && (
              <Button
                variant="secondary"
                onClick={handleRegenerateMissingImages}
                disabled={isRegeneratingMissing}
                className="gap-2"
                data-testid="button-regenerate-missing-images"
              >
                {isRegeneratingMissing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {missingProgress.current}/{missingProgress.total}
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Fix {missingImagesCount} Expired
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="w-10 p-3">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={handleSelectAll}
                        className={someSelected ? "opacity-50" : ""}
                        data-testid="checkbox-select-all"
                      />
                    </th>
                    <th className="w-8 p-3"></th>
                    <th className="w-20 p-3 text-left text-xs font-medium text-muted-foreground uppercase">Image</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">Word</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">English</th>
                    <th className="w-16 p-3 text-center text-xs font-medium text-muted-foreground uppercase">Audio</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">Learned</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">Last Review</th>
                    <th className="w-20 p-3 text-center text-xs font-medium text-muted-foreground uppercase">Reviews</th>
                    <th className="w-16 p-3 text-center text-xs font-medium text-muted-foreground uppercase">Order</th>
                    <th className="w-16 p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {words.map((word, index) => {
                    const isSelected = selectedIds.has(word.id);
                    const isBeingDragged = draggedIds.includes(word.id);
                    const isDropTarget = dropTargetIndex === index;
                    
                    return (
                      <tr
                        key={word.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, word)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        className={`
                          border-b transition-colors
                          ${isSelected ? "bg-primary/5" : "hover:bg-muted/50"}
                          ${isBeingDragged ? "opacity-50" : ""}
                          ${isDropTarget ? "border-t-2 border-t-primary" : ""}
                        `}
                        data-testid={`row-word-${word.id}`}
                      >
                        <td className="p-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => handleSelectWord(word.id, !!checked, false)}
                            data-testid={`checkbox-word-${word.id}`}
                          />
                        </td>
                        <td className="p-3 cursor-grab active:cursor-grabbing">
                          <GripVertical className="w-4 h-4 text-muted-foreground" />
                        </td>
                        <td className="p-3">
                          <div className="w-16 h-16 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                            {word.imageUrl ? (
                              <img 
                                src={`${word.imageUrl}?t=${imageCacheBuster}`} 
                                alt={word.english}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Image className="w-6 h-6 text-muted-foreground" />
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="font-bold text-lg">{word.targetWord}</span>
                        </td>
                        <td className="p-3">
                          <span className="text-muted-foreground">{word.english}</span>
                        </td>
                        <td className="p-3 text-center">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handlePlayAudio(word)}
                            disabled={loadingAudioId === word.id}
                            data-testid={`button-audio-${word.id}`}
                          >
                            {loadingAudioId === word.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : playingAudioId === word.id ? (
                              <Volume2 className="w-4 h-4 text-primary animate-pulse" />
                            ) : (
                              <Volume2 className="w-4 h-4" />
                            )}
                          </Button>
                        </td>
                        <td className="p-3">
                          {word.isLearned ? (
                            <Badge variant="default" className="gap-1 text-xs">
                              <Check className="w-3 h-3" />
                              Learned
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-xs">
                              <X className="w-3 h-3" />
                              New
                            </Badge>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {formatDate(word.learnedAt)}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <RotateCcw className="w-3 h-3" />
                            {formatDateTime(word.lastReviewDate)}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span className="text-sm font-medium">{word.reviewCount}</span>
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant="outline" className="text-xs">
                            #{word.displayOrder + 1}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setEditingWord(word);
                                setCustomPrompt("");
                              }}
                              data-testid={`button-edit-${word.id}`}
                            >
                              <Edit3 className="w-4 h-4" />
                            </Button>
                            {word.imageUrl && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteImage(word.id)}
                                disabled={deletingImageId === word.id}
                                data-testid={`button-delete-image-${word.id}`}
                              >
                                {deletingImageId === word.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                )}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <Dialog open={!!editingWord} onOpenChange={() => setEditingWord(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit Image: {editingWord?.targetWord} ({editingWord?.english})
            </DialogTitle>
            <DialogDescription>
              Customize the image generation prompt for this word
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {editingWord?.imageUrl && (
              <div className="rounded-lg overflow-hidden">
                <img 
                  src={`${editingWord.imageUrl}?t=${imageCacheBuster}`} 
                  alt={editingWord.english}
                  className="w-full h-48 object-cover"
                />
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Custom Prompt (optional)
              </label>
              <Textarea
                placeholder={`e.g., "A cute cartoon cat playing with yarn, pastel colors, child-friendly style"`}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={3}
                data-testid="input-custom-prompt"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to use the default prompt for "{editingWord?.english}"
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingWord(null)}
              disabled={isRegenerating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRegenerateImage}
              disabled={isRegenerating}
              className="gap-2"
              data-testid="button-regenerate-confirm"
            >
              {isRegenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Regenerate Image
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {batchErrors.length > 0 && (
        <div className="fixed bottom-4 right-4 max-w-sm">
          <Card className="p-4">
            <p className="font-semibold mb-2">Some images failed:</p>
            <ul className="text-sm text-muted-foreground">
              {batchErrors.slice(0, 5).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {batchErrors.length > 5 && (
                <li>...and {batchErrors.length - 5} more</li>
              )}
            </ul>
          </Card>
        </div>
      )}

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Image Generation Settings
            </DialogTitle>
            <DialogDescription>
              Configure the default prompt template for AI image generation
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Default Image Prompt Template
              </label>
              <Textarea
                placeholder="Enter the default prompt template..."
                value={defaultPrompt}
                onChange={(e) => setDefaultPrompt(e.target.value)}
                rows={5}
                className="font-mono text-sm"
                data-testid="input-default-prompt"
              />
              <p className="text-xs text-muted-foreground">
                Use <code className="bg-muted px-1 rounded">{"{word}"}</code> as a placeholder for the English word. 
                For example: "A cute cartoon {"{word}"} for children"
              </p>
            </div>
            
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs font-medium mb-1 text-muted-foreground">Preview with "cat":</p>
              <p className="text-sm">
                {defaultPrompt.replace(/{word}/g, "cat") || "(Enter a prompt to see preview)"}
              </p>
            </div>
            
            {settingsError && (
              <p className="text-sm text-destructive">{settingsError}</p>
            )}
            
            {!defaultPrompt.includes("{word}") && defaultPrompt.length > 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Warning: Your prompt must include {"{word}"} placeholder for the English word to be inserted.
              </p>
            )}
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSettings(false)}
              disabled={isSavingSettings}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveSettings}
              disabled={isSavingSettings || !defaultPrompt.trim()}
              className="gap-2"
              data-testid="button-save-settings"
            >
              {isSavingSettings ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : settingsSaved ? (
                <>
                  <Check className="w-4 h-4" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Settings
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
