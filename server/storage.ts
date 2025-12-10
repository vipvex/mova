import { 
  type User, type InsertUser,
  type Vocabulary, type InsertVocabulary,
  type LearningProgress, type InsertLearningProgress,
  type SessionStats, type InsertSessionStats
} from "@shared/schema";
import { randomUUID } from "crypto";
import { russianVocabulary } from "./russianVocabulary";

export interface IStorage {
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

  constructor() {
    this.users = new Map();
    this.vocabulary = new Map();
    this.learningProgress = new Map();
    this.sessionStats = new Map();
    
    // Initialize with Russian vocabulary
    this.initializeVocabulary();
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
}

export const storage = new MemStorage();
