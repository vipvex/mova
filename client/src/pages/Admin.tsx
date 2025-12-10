import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter 
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
  Save
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

interface AdminWord {
  id: string;
  russian: string;
  english: string;
  imageUrl: string | null;
  audioUrl: string | null;
  frequencyRank: number;
  category: string | null;
  isLearned: boolean;
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

async function fetchWordsWithoutImagesAuth(token: string): Promise<AdminWord[]> {
  const response = await fetch("/api/admin/words/no-images", {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to fetch words");
  return response.json();
}

async function fetchAdminWordsAuth(token: string): Promise<AdminWord[]> {
  const response = await fetch("/api/admin/words", {
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

export default function Admin() {
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
  
  const [showSettings, setShowSettings] = useState(false);
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: words = [], isLoading } = useQuery({
    queryKey: ['/api/admin/words', authToken],
    queryFn: () => authToken ? fetchAdminWordsAuth(authToken) : Promise.resolve([]),
    enabled: isAuthenticated && !!authToken,
  });

  const { data: settings } = useQuery({
    queryKey: ['/api/admin/settings', authToken],
    queryFn: () => authToken ? fetchSettings(authToken) : Promise.resolve({ defaultImagePrompt: "" }),
    enabled: isAuthenticated && !!authToken,
  });

  const handleOpenSettings = useCallback(() => {
    setDefaultPrompt(settings?.defaultImagePrompt || "");
    setShowSettings(true);
    setSettingsSaved(false);
    setSettingsError(null);
  }, [settings]);

  const handleSaveSettings = useCallback(async () => {
    if (!authToken) return;
    
    // Validate that {word} placeholder is present
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
      queryClient.invalidateQueries({ queryKey: ['/api/admin/words', authToken] });
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
      const wordsWithoutImages = await fetchWordsWithoutImagesAuth(authToken);
      setBatchProgress({ current: 0, total: wordsWithoutImages.length });
      
      for (let i = 0; i < wordsWithoutImages.length; i++) {
        const word = wordsWithoutImages[i];
        try {
          await generateImage(word.id, authToken);
          setBatchProgress({ current: i + 1, total: wordsWithoutImages.length });
        } catch (error) {
          setBatchErrors(prev => [...prev, `Failed: ${word.english}`]);
        }
        
        // Small delay to avoid rate limiting
        if (i < wordsWithoutImages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/admin/words', authToken] });
    } catch (error) {
      console.error("Batch generation failed:", error);
    } finally {
      setIsBatchGenerating(false);
    }
  }, [queryClient, authToken]);

  const wordsWithoutImages = words.filter(w => !w.imageUrl);
  const learnedWords = words.filter(w => w.isLearned);

  // Login screen
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
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button size="icon" variant="ghost" data-testid="button-admin-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold">Word Database</h1>
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
            </div>
            
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
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-120px)]">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
              {words.map((word) => (
                <Card 
                  key={word.id} 
                  className="overflow-hidden"
                  data-testid={`card-word-${word.id}`}
                >
                  <div className="relative aspect-square bg-muted">
                    {word.imageUrl ? (
                      <img 
                        src={word.imageUrl} 
                        alt={word.english}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <Image className="w-12 h-12" />
                      </div>
                    )}
                    
                    <Button
                      size="icon"
                      variant="secondary"
                      className="absolute top-2 right-2"
                      onClick={() => {
                        setEditingWord(word);
                        setCustomPrompt("");
                      }}
                      data-testid={`button-edit-${word.id}`}
                    >
                      <Edit3 className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <div className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-lg">{word.russian}</p>
                        <p className="text-muted-foreground">{word.english}</p>
                      </div>
                      {word.isLearned ? (
                        <Badge variant="default" className="gap-1 shrink-0 text-xs">
                          <Check className="w-3 h-3" />
                          Learned
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 shrink-0 text-xs">
                          <X className="w-3 h-3" />
                          New
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex gap-1 flex-wrap">
                      {word.category && (
                        <Badge variant="secondary" className="text-xs">
                          {word.category}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        #{word.frequencyRank}
                      </Badge>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </main>

      <Dialog open={!!editingWord} onOpenChange={() => setEditingWord(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit Image: {editingWord?.russian} ({editingWord?.english})
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {editingWord?.imageUrl && (
              <div className="rounded-lg overflow-hidden">
                <img 
                  src={editingWord.imageUrl} 
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
