import { 
  type User, type InsertUser,
  type Vocabulary, type InsertVocabulary,
  type LearningProgress, type InsertLearningProgress,
  type SessionStats, type InsertSessionStats
} from "@shared/schema";
import { randomUUID } from "crypto";
import { russianVocabulary } from "./russianVocabulary";

export const DEFAULT_IMAGE_PROMPT = "Simple, bright cartoon illustration of {word}, child-friendly educational style, flat design, pastel background, clean lines, suitable for 6-year-old children learning vocabulary. No text or letters in the image.";

export interface IStorage {
  // Settings
  getDefaultImagePrompt(): Promise<string>;
  setDefaultImagePrompt(prompt: string): Promise<void>;
  
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Vocabulary
  getAllVocabulary(): Promise<Vocabulary[]>;
  getVocabularyById(id: string): Promise<Vocabulary | undefined>;
  getVocabularyByCategory(category: string): Promise<Vocabulary[]>;
  createVocabulary(vocab: InsertVocabulary): Promise<Vocabulary>;
  updateVocabularyImage(id: string, imageUrl: string): Promise<void>;
  updateVocabularyAudio(id: string, audioUrl: string): Promise<void>;
  
  // Level-based vocabulary (100 words per level)
  getVocabularyForLevel(level: number): Promise<Vocabulary[]>;
  getLevelInfo(): Promise<{ currentLevel: number; wordsLearned: number; totalWords: number; allLevelWords: { word: Vocabulary; isLearned: boolean }[] }>;
  
  // Learning Progress
  getLearningProgress(wordId: string): Promise<LearningProgress | undefined>;
  getAllLearningProgress(): Promise<LearningProgress[]>;
  createLearningProgress(progress: InsertLearningProgress): Promise<LearningProgress>;
  updateLearningProgress(id: string, updates: Partial<LearningProgress>): Promise<void>;
  getWordsToLearn(limit: number): Promise<Vocabulary[]>;
  getWordsToReview(): Promise<(Vocabulary & { progress: LearningProgress })[]>;
  
  // Session Stats
  getTodayStats(): Promise<SessionStats | undefined>;
  getOrCreateTodayStats(): Promise<SessionStats>;
  updateTodayStats(updates: Partial<SessionStats>): Promise<void>;
  getStreak(): Promise<number>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private vocabulary: Map<string, Vocabulary>;
  private learningProgress: Map<string, LearningProgress>;
  private sessionStats: Map<string, SessionStats>;
  private defaultImagePrompt: string;

  constructor() {
    this.users = new Map();
    this.vocabulary = new Map();
    this.learningProgress = new Map();
    this.sessionStats = new Map();
    this.defaultImagePrompt = DEFAULT_IMAGE_PROMPT;
    
    // Initialize with Russian vocabulary
    this.initializeVocabulary();
  }

  // Settings
  async getDefaultImagePrompt(): Promise<string> {
    return this.defaultImagePrompt;
  }

  async setDefaultImagePrompt(prompt: string): Promise<void> {
    this.defaultImagePrompt = prompt;
  }

  private initializeVocabulary() {
    russianVocabulary.forEach(word => {
      const id = randomUUID();
      this.vocabulary.set(id, {
        id,
        russian: word.russian,
        english: word.english,
        imageUrl: null,
        audioUrl: null,
        frequencyRank: word.frequencyRank,
        category: word.category,
      });
    });
  }

  private getTodayDateString(): string {
    return new Date().toISOString().split('T')[0];
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Vocabulary
  async getAllVocabulary(): Promise<Vocabulary[]> {
    return Array.from(this.vocabulary.values()).sort((a, b) => a.frequencyRank - b.frequencyRank);
  }

  async getVocabularyById(id: string): Promise<Vocabulary | undefined> {
    return this.vocabulary.get(id);
  }

  async getVocabularyByCategory(category: string): Promise<Vocabulary[]> {
    return Array.from(this.vocabulary.values())
      .filter(v => v.category === category)
      .sort((a, b) => a.frequencyRank - b.frequencyRank);
  }

  async createVocabulary(vocab: InsertVocabulary): Promise<Vocabulary> {
    const id = randomUUID();
    const newVocab: Vocabulary = {
      id,
      russian: vocab.russian,
      english: vocab.english,
      imageUrl: vocab.imageUrl ?? null,
      audioUrl: vocab.audioUrl ?? null,
      frequencyRank: vocab.frequencyRank,
      category: vocab.category ?? null,
    };
    this.vocabulary.set(id, newVocab);
    return newVocab;
  }

  async updateVocabularyImage(id: string, imageUrl: string): Promise<void> {
    const vocab = this.vocabulary.get(id);
    if (vocab) {
      vocab.imageUrl = imageUrl;
      this.vocabulary.set(id, vocab);
    }
  }

  async updateVocabularyAudio(id: string, audioUrl: string): Promise<void> {
    const vocab = this.vocabulary.get(id);
    if (vocab) {
      vocab.audioUrl = audioUrl;
      this.vocabulary.set(id, vocab);
    }
  }

  // Learning Progress
  async getLearningProgress(wordId: string): Promise<LearningProgress | undefined> {
    return Array.from(this.learningProgress.values()).find(p => p.wordId === wordId);
  }

  async getAllLearningProgress(): Promise<LearningProgress[]> {
    return Array.from(this.learningProgress.values());
  }

  async createLearningProgress(progress: InsertLearningProgress): Promise<LearningProgress> {
    const id = randomUUID();
    const newProgress: LearningProgress = {
      id,
      wordId: progress.wordId,
      isLearned: progress.isLearned ?? false,
      easeFactor: progress.easeFactor ?? 250,
      interval: progress.interval ?? 0,
      repetitions: progress.repetitions ?? 0,
      nextReviewDate: progress.nextReviewDate ?? null,
      lastReviewDate: progress.lastReviewDate ?? null,
    };
    this.learningProgress.set(id, newProgress);
    return newProgress;
  }

  async updateLearningProgress(id: string, updates: Partial<LearningProgress>): Promise<void> {
    const progress = this.learningProgress.get(id);
    if (progress) {
      Object.assign(progress, updates);
      this.learningProgress.set(id, progress);
    }
  }

  async getWordsToLearn(limit: number): Promise<Vocabulary[]> {
    const learnedWordIds = new Set(
      Array.from(this.learningProgress.values())
        .filter(p => p.isLearned)
        .map(p => p.wordId)
    );
    
    return Array.from(this.vocabulary.values())
      .filter(v => !learnedWordIds.has(v.id))
      .sort((a, b) => a.frequencyRank - b.frequencyRank)
      .slice(0, limit);
  }

  async getWordsToReview(): Promise<(Vocabulary & { progress: LearningProgress })[]> {
    const now = new Date();
    const progressList = Array.from(this.learningProgress.values())
      .filter(p => p.isLearned && p.nextReviewDate && new Date(p.nextReviewDate) <= now);
    
    const result: (Vocabulary & { progress: LearningProgress })[] = [];
    
    for (const progress of progressList) {
      const vocab = this.vocabulary.get(progress.wordId);
      if (vocab) {
        result.push({ ...vocab, progress });
      }
    }
    
    return result.sort((a, b) => a.frequencyRank - b.frequencyRank);
  }

  // Session Stats
  async getTodayStats(): Promise<SessionStats | undefined> {
    const today = this.getTodayDateString();
    return Array.from(this.sessionStats.values()).find(s => s.date === today);
  }

  async getOrCreateTodayStats(): Promise<SessionStats> {
    const existing = await this.getTodayStats();
    if (existing) return existing;

    const id = randomUUID();
    const streak = await this.getStreak();
    const newStats: SessionStats = {
      id,
      date: this.getTodayDateString(),
      wordsLearned: 0,
      wordsReviewed: 0,
      streak: streak + 1,
    };
    this.sessionStats.set(id, newStats);
    return newStats;
  }

  async updateTodayStats(updates: Partial<SessionStats>): Promise<void> {
    const stats = await this.getOrCreateTodayStats();
    Object.assign(stats, updates);
    this.sessionStats.set(stats.id, stats);
  }

  async getStreak(): Promise<number> {
    const stats = Array.from(this.sessionStats.values())
      .sort((a, b) => b.date.localeCompare(a.date));
    
    if (stats.length === 0) return 0;
    
    const today = this.getTodayDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    // Check if we have today's or yesterday's stats to continue streak
    const lastStatDate = stats[0].date;
    if (lastStatDate !== today && lastStatDate !== yesterdayStr) {
      return 0;
    }
    
    return stats[0].streak ?? 0;
  }

  // Level-based vocabulary (100 words per level)
  async getVocabularyForLevel(level: number): Promise<Vocabulary[]> {
    const allVocab = await this.getAllVocabulary();
    const startIndex = level * 100;
    const endIndex = startIndex + 100;
    return allVocab.slice(startIndex, endIndex);
  }

  async getLevelInfo(): Promise<{ currentLevel: number; wordsLearned: number; totalWords: number; allLevelWords: { word: Vocabulary; isLearned: boolean }[] }> {
    const allVocab = await this.getAllVocabulary();
    const learnedWordIds = new Set(
      Array.from(this.learningProgress.values())
        .filter(p => p.isLearned)
        .map(p => p.wordId)
    );
    
    // Find current level based on how many words have been learned
    const WORDS_PER_LEVEL = 100;
    let currentLevel = 0;
    
    // Check each level to see if it's complete
    for (let level = 0; level < Math.ceil(allVocab.length / WORDS_PER_LEVEL); level++) {
      const levelWords = allVocab.slice(level * WORDS_PER_LEVEL, (level + 1) * WORDS_PER_LEVEL);
      const learnedInLevel = levelWords.filter(w => learnedWordIds.has(w.id)).length;
      
      if (learnedInLevel < levelWords.length) {
        // This level is not complete yet
        currentLevel = level;
        break;
      }
      currentLevel = level + 1; // Move to next level if current is complete
    }
    
    // Make sure we don't go beyond available levels
    const maxLevel = Math.ceil(allVocab.length / WORDS_PER_LEVEL) - 1;
    currentLevel = Math.min(currentLevel, maxLevel);
    
    // Get words for current level
    const levelWords = allVocab.slice(currentLevel * WORDS_PER_LEVEL, (currentLevel + 1) * WORDS_PER_LEVEL);
    const wordsLearned = levelWords.filter(w => learnedWordIds.has(w.id)).length;
    
    const allLevelWords = levelWords.map(word => ({
      word,
      isLearned: learnedWordIds.has(word.id)
    }));
    
    return {
      currentLevel,
      wordsLearned,
      totalWords: levelWords.length,
      allLevelWords
    };
  }
}

export const storage = new MemStorage();
