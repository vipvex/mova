import { apiRequest } from "./queryClient";

export type Language = 'russian' | 'spanish';

export interface VocabularyWord {
  id: string;
  targetWord: string;
  english: string;
  language: string;
  imageUrl: string | null;
  audioUrl: string | null;
  frequencyRank: number;
  displayOrder: number;
  category: string | null;
}

export interface Stats {
  wordsToday: number;
  totalLearned: number;
  streak: number;
  wordsToReview: number;
  wordsToLearn: number;
}

export interface LevelInfo {
  currentLevel: number;
  wordsLearned: number;
  totalWords: number;
  totalLevels?: number;
  allLevelWords: { word: VocabularyWord; isLearned: boolean }[];
}

export async function fetchStats(userId: string): Promise<Stats> {
  const response = await fetch(`/api/users/${userId}/stats`);
  if (!response.ok) throw new Error("Failed to fetch stats");
  return response.json();
}

export async function fetchLevelInfo(userId: string): Promise<LevelInfo> {
  const response = await fetch(`/api/users/${userId}/level`);
  if (!response.ok) throw new Error("Failed to fetch level info");
  return response.json();
}

export interface PageLevelInfo extends LevelInfo {
  totalLevels: number;
}

export async function fetchLevelPage(userId: string, level: number): Promise<PageLevelInfo> {
  const response = await fetch(`/api/users/${userId}/level/${level}`);
  if (!response.ok) throw new Error("Failed to fetch level page");
  return response.json();
}

export async function fetchWordsToLearn(userId: string, limit: number = 5): Promise<VocabularyWord[]> {
  const response = await fetch(`/api/users/${userId}/words/learn?limit=${limit}`);
  if (!response.ok) throw new Error("Failed to fetch words to learn");
  return response.json();
}

export async function fetchWordsToReview(userId: string): Promise<VocabularyWord[]> {
  const response = await fetch(`/api/users/${userId}/words/review`);
  if (!response.ok) throw new Error("Failed to fetch words to review");
  return response.json();
}

export async function markWordLearned(userId: string, wordId: string): Promise<void> {
  await apiRequest("POST", `/api/users/${userId}/words/${wordId}/learn`);
}

export async function reviewWord(userId: string, wordId: string, knowsIt: boolean): Promise<void> {
  await apiRequest("POST", `/api/users/${userId}/words/${wordId}/review`, { knowsIt });
}

export async function generateAudio(wordId: string, options?: { mode?: 'learn' | 'review', language?: Language, voiceType?: 'native' | 'child', speed?: number }): Promise<string> {
  const response = await apiRequest("POST", `/api/tts/${wordId}`, options || undefined);
  const data = await response.json();
  return data.audioUrl;
}

export async function generateImage(wordId: string): Promise<string> {
  const response = await apiRequest("POST", `/api/image/${wordId}`);
  const data = await response.json();
  return data.imageUrl;
}

export async function regenerateImage(wordId: string, customPrompt?: string): Promise<string> {
  const response = await apiRequest("POST", `/api/image/${wordId}/regenerate`, customPrompt ? { customPrompt } : undefined);
  const data = await response.json();
  return data.imageUrl;
}

let currentAudio: HTMLAudioElement | null = null;

export function playAudio(audioUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    currentAudio = new Audio(audioUrl);
    currentAudio.onended = () => resolve();
    currentAudio.onerror = () => reject(new Error("Audio playback failed"));
    currentAudio.play().catch(reject);
  });
}

export function stopAudio(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

export interface TranscriptionResult {
  text: string;
  success: boolean;
}

export async function transcribeAudio(audioData: string, mimeType: string, language: Language = 'russian'): Promise<TranscriptionResult> {
  const response = await apiRequest("POST", "/api/transcribe", { audioData, mimeType, language });
  const data = await response.json();
  return data;
}

export async function generateConfirmationAudio(targetWord: string, language: Language = 'russian', voiceType?: 'native' | 'child', speed?: number): Promise<string> {
  const response = await apiRequest("POST", "/api/tts/confirmation", { targetWord, language, voiceType, speed });
  const data = await response.json();
  return data.audioUrl;
}

export async function fetchVoiceConfig(): Promise<{ childVoiceEnabled: boolean }> {
  const response = await fetch("/api/voice-config");
  if (!response.ok) return { childVoiceEnabled: false };
  return response.json();
}

export interface ExampleSentence {
  id: string;
  wordId: string;
  userId: string;
  sentence: string;
  englishHint: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  sortOrder: number | null;
  language: string;
}

export async function generateExampleSentence(
  wordId: string,
  userId: string,
  language: Language,
  knownWords: string[],
  voiceType?: 'native' | 'child',
  speed?: number,
): Promise<ExampleSentence> {
  const response = await apiRequest("POST", `/api/words/${wordId}/example-sentence`, {
    userId, language, knownWords, voiceType, speed,
  });
  return response.json();
}

export async function fetchLearnedWords(userId: string, language: Language): Promise<VocabularyWord[]> {
  const response = await fetch(`/api/users/${userId}/words/learned?language=${language}`);
  if (!response.ok) throw new Error("Failed to fetch learned words");
  return response.json();
}

export async function generateTextAudio(text: string, language: Language = 'russian', voiceType?: 'native' | 'child'): Promise<string> {
  const response = await apiRequest("POST", "/api/tts/text", { text, language, voiceType });
  const data = await response.json();
  return data.audioUrl;
}

export async function updateGrammarProgress(userId: string, exerciseId: string): Promise<void> {
  await apiRequest("POST", `/api/users/${userId}/grammar-exercises/${exerciseId}/progress`);
}
