import { apiRequest } from "./queryClient";
import { withErrorNotify } from "./errorNotify";

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
  const response = await apiRequest("GET", `/api/users/${userId}/stats`);
  return response.json();
}

export async function fetchLevelInfo(userId: string): Promise<LevelInfo> {
  const response = await apiRequest("GET", `/api/users/${userId}/level`);
  return response.json();
}

export interface PageLevelInfo extends LevelInfo {
  totalLevels: number;
}

export async function fetchLevelPage(userId: string, level: number): Promise<PageLevelInfo> {
  const response = await apiRequest("GET", `/api/users/${userId}/level/${level}`);
  return response.json();
}

export async function fetchWordsToLearn(userId: string, limit: number = 5): Promise<VocabularyWord[]> {
  const response = await apiRequest("GET", `/api/users/${userId}/words/learn?limit=${limit}`);
  return response.json();
}

export async function fetchWordsToReview(userId: string): Promise<VocabularyWord[]> {
  const response = await apiRequest("GET", `/api/users/${userId}/words/review`);
  return response.json();
}

export interface DailyMissions {
  wordCatch: { completed: number; target: number };
  reviewOld: { completed: number; target: number };
  learnNew: { completed: number; target: number };
  reviewNew: { completed: number; target: number };
}

function tzQuery(): string {
  return `tzOffsetMinutes=${new Date().getTimezoneOffset()}`;
}

export async function fetchDailyMissions(userId: string): Promise<DailyMissions> {
  const response = await apiRequest("GET", `/api/users/${userId}/daily-missions?${tzQuery()}`);
  return response.json();
}

export interface VocabularyWordWithProgress extends VocabularyWord {
  progress?: { reviewCount?: number | null };
}

export async function fetchWordsToReviewOld(userId: string): Promise<VocabularyWordWithProgress[]> {
  const response = await apiRequest("GET", `/api/users/${userId}/words/review-old?${tzQuery()}`);
  return response.json();
}

export async function fetchWordsLearnedToday(userId: string): Promise<VocabularyWord[]> {
  const response = await apiRequest("GET", `/api/users/${userId}/words/learned-today?${tzQuery()}`);
  return response.json();
}

export async function recordWordCatchPlay(userId: string): Promise<void> {
  await apiRequest("POST", `/api/users/${userId}/word-catch-played`);
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

export interface ReferenceImageInput {
  /** Inline image data (used for user-uploaded reference images). */
  base64Data?: string;
  mimeType?: string;
  /** A URL the server fetches (used for the stored self-portrait). */
  url?: string;
  /** What the reference depicts, used to guide the model (defaults to the word). */
  name?: string;
}

export async function regenerateImage(
  wordId: string,
  customPrompt?: string,
  referenceImage?: ReferenceImageInput,
): Promise<string> {
  const body: { customPrompt?: string; referenceImage?: ReferenceImageInput } = {};
  if (customPrompt) body.customPrompt = customPrompt;
  if (referenceImage) body.referenceImage = referenceImage;
  const response = await apiRequest(
    "POST",
    `/api/image/${wordId}/regenerate`,
    Object.keys(body).length ? body : undefined,
  );
  const data = await response.json();
  return data.imageUrl;
}

let currentAudio: HTMLAudioElement | null = null;

export function playAudio(audioUrl: string): Promise<void> {
  return withErrorNotify("Play audio", () => new Promise<void>((resolve, reject) => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    currentAudio = new Audio(audioUrl);
    currentAudio.onended = () => resolve();
    currentAudio.onerror = () => reject(new Error("Audio playback failed"));
    currentAudio.play().catch(reject);
  }));
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
  return response.json();
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
  const response = await apiRequest("GET", `/api/users/${userId}/words/learned?language=${language}`);
  return response.json();
}

export async function generateTextAudio(text: string, language: Language = 'russian', voiceType?: 'native' | 'child', speed?: number): Promise<string> {
  const response = await apiRequest("POST", "/api/tts/text", { text, language, voiceType, speed });
  const data = await response.json();
  return data.audioUrl;
}

export async function updateGrammarProgress(userId: string, exerciseId: string): Promise<void> {
  await apiRequest("POST", `/api/users/${userId}/grammar-exercises/${exerciseId}/progress`);
}

export interface UserCurriculumWord {
  word: string;
  english: string;
  inVocab: boolean;
  isLearned: boolean;
  reviewCount: number;
}

export interface UserCurriculumSubtheme {
  name: string;
  totalWords: number;
  learnedWords: number;
  words: UserCurriculumWord[];
}

export interface UserCurriculumPhase {
  phase: number;
  name: string;
  goal: string;
  color: string;
  totalWords: number;
  learnedWords: number;
  subthemes: UserCurriculumSubtheme[];
}

export interface UserCurriculum {
  phases: UserCurriculumPhase[];
  stats: { totalWords: number; learnedWords: number };
}

export async function fetchUserCurriculum(userId: string): Promise<UserCurriculum> {
  const response = await apiRequest("GET", `/api/users/${userId}/curriculum`);
  return response.json();
}
