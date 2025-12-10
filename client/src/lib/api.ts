import { apiRequest } from "./queryClient";

export interface VocabularyWord {
  id: string;
  russian: string;
  english: string;
  imageUrl: string | null;
  audioUrl: string | null;
  frequencyRank: number;
  category: string | null;
}

export interface Stats {
  wordsToday: number;
  totalLearned: number;
  streak: number;
  wordsToReview: number;
  wordsToLearn: number;
}

export async function fetchStats(): Promise<Stats> {
  const response = await fetch("/api/stats");
  if (!response.ok) throw new Error("Failed to fetch stats");
  return response.json();
}

export async function fetchWordsToLearn(limit: number = 5): Promise<VocabularyWord[]> {
  const response = await fetch(`/api/words/learn?limit=${limit}`);
  if (!response.ok) throw new Error("Failed to fetch words to learn");
  return response.json();
}

export async function fetchWordsToReview(): Promise<VocabularyWord[]> {
  const response = await fetch("/api/words/review");
  if (!response.ok) throw new Error("Failed to fetch words to review");
  return response.json();
}

export async function markWordLearned(wordId: string): Promise<void> {
  await apiRequest("POST", `/api/words/${wordId}/learn`);
}

export async function reviewWord(wordId: string, knowsIt: boolean): Promise<void> {
  await apiRequest("POST", `/api/words/${wordId}/review`, { knowsIt });
}

export async function generateAudio(wordId: string): Promise<string> {
  const response = await apiRequest("POST", `/api/tts/${wordId}`);
  const data = await response.json();
  return data.audioUrl;
}

export async function generateImage(wordId: string): Promise<string> {
  const response = await apiRequest("POST", `/api/image/${wordId}`);
  const data = await response.json();
  return data.imageUrl;
}

// Audio playback helper
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
