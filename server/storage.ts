import { 
  type User, type InsertUser,
  type Vocabulary, type InsertVocabulary,
  type LearningProgress, type InsertLearningProgress,
  type SessionStats, type InsertSessionStats,
  type GrammarExercise, type InsertGrammarExercise,
  type GrammarProgress, type InsertGrammarProgress,
  type Language,
  users, vocabulary, learningProgress, sessionStats, grammarExercises, grammarProgress
} from "@shared/schema";
import { db } from "./db";
import { eq, and, lte, asc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { russianVocabulary } from "./russianVocabulary";
import { spanishVocabulary } from "./spanishVocabulary";
import { russianGrammarExercises, spanishGrammarExercises } from "./grammarExercises";

export const DEFAULT_IMAGE_PROMPT = `Make a simple flashcard image for kids ages 6-7. No letters or numbers. White background. Make the image of a "{word}".`;

export interface IStorage {
  getDefaultImagePrompt(): Promise<string>;
  setDefaultImagePrompt(prompt: string): Promise<void>;
  
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUserLanguage(id: string, language: Language): Promise<void>;
  
  getAllVocabulary(language?: Language): Promise<Vocabulary[]>;
  getVocabularyById(id: string): Promise<Vocabulary | undefined>;
  getVocabularyByCategory(category: string, language?: Language): Promise<Vocabulary[]>;
  createVocabulary(vocab: InsertVocabulary): Promise<Vocabulary>;
  updateVocabularyImage(id: string, imageUrl: string): Promise<void>;
  clearVocabularyImage(id: string): Promise<void>;
  updateVocabularyAudio(id: string, audioUrl: string): Promise<void>;
  updateVocabularyDisplayOrder(id: string, displayOrder: number): Promise<void>;
  reorderVocabulary(wordIds: string[]): Promise<void>;
  
  getVocabularyForLevel(level: number, language: Language): Promise<Vocabulary[]>;
  getLevelInfo(userId: string, language: Language): Promise<{ currentLevel: number; wordsLearned: number; totalWords: number; allLevelWords: { word: Vocabulary; isLearned: boolean }[] }>;
  
  getLearningProgress(userId: string, wordId: string): Promise<LearningProgress | undefined>;
  getAllLearningProgress(userId: string): Promise<LearningProgress[]>;
  createLearningProgress(progress: InsertLearningProgress): Promise<LearningProgress>;
  updateLearningProgress(id: string, updates: Partial<LearningProgress>): Promise<void>;
  getWordsToLearn(userId: string, language: Language, limit: number): Promise<Vocabulary[]>;
  getWordsToReview(userId: string, language: Language): Promise<(Vocabulary & { progress: LearningProgress })[]>;
  
  getTodayStats(userId: string): Promise<SessionStats | undefined>;
  getOrCreateTodayStats(userId: string): Promise<SessionStats>;
  updateTodayStats(userId: string, updates: Partial<SessionStats>): Promise<void>;
  getStreak(userId: string): Promise<number>;
  
  getGrammarExercises(language: Language): Promise<GrammarExercise[]>;
  getGrammarExerciseById(id: string): Promise<GrammarExercise | undefined>;
  getGrammarProgress(userId: string, exerciseId: string): Promise<GrammarProgress | undefined>;
  getAllGrammarProgress(userId: string): Promise<GrammarProgress[]>;
  createOrUpdateGrammarProgress(userId: string, exerciseId: string): Promise<GrammarProgress>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private vocabulary: Map<string, Vocabulary>;
  private learningProgress: Map<string, LearningProgress>;
  private sessionStats: Map<string, SessionStats>;
  private grammarExercises: Map<string, GrammarExercise>;
  private grammarProgress: Map<string, GrammarProgress>;
  private defaultImagePrompt: string;

  constructor() {
    this.users = new Map();
    this.vocabulary = new Map();
    this.learningProgress = new Map();
    this.sessionStats = new Map();
    this.grammarExercises = new Map();
    this.grammarProgress = new Map();
    this.defaultImagePrompt = DEFAULT_IMAGE_PROMPT;
    
    this.initializeVocabulary();
    this.initializeGrammarExercises();
  }

  async getDefaultImagePrompt(): Promise<string> {
    return this.defaultImagePrompt;
  }

  async setDefaultImagePrompt(prompt: string): Promise<void> {
    this.defaultImagePrompt = prompt;
  }

  private initializeVocabulary() {
    russianVocabulary.forEach((word, index) => {
      const id = randomUUID();
      this.vocabulary.set(id, {
        id,
        targetWord: word.russian,
        english: word.english,
        language: "russian",
        imageUrl: null,
        audioUrl: null,
        frequencyRank: word.frequencyRank,
        displayOrder: index,
        category: word.category,
        partOfSpeech: word.partOfSpeech || null,
      });
    });
    
    spanishVocabulary.forEach((word, index) => {
      const id = randomUUID();
      this.vocabulary.set(id, {
        id,
        targetWord: word.spanish,
        english: word.english,
        language: "spanish",
        imageUrl: null,
        audioUrl: null,
        frequencyRank: word.frequencyRank,
        displayOrder: index,
        category: word.category,
        partOfSpeech: null,
      });
    });
  }

  private initializeGrammarExercises() {
    russianGrammarExercises.forEach((exercise) => {
      const id = randomUUID();
      this.grammarExercises.set(id, {
        id,
        name: exercise.name,
        description: exercise.description,
        language: exercise.language,
        category: exercise.category,
        difficulty: exercise.difficulty,
        displayOrder: exercise.displayOrder,
      });
    });
    
    spanishGrammarExercises.forEach((exercise) => {
      const id = randomUUID();
      this.grammarExercises.set(id, {
        id,
        name: exercise.name,
        description: exercise.description,
        language: exercise.language,
        category: exercise.category,
        difficulty: exercise.difficulty,
        displayOrder: exercise.displayOrder,
      });
    });
  }

  private getTodayDateString(): string {
    return new Date().toISOString().split('T')[0];
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      id,
      username: insertUser.username,
      password: insertUser.password,
      language: insertUser.language || "russian"
    };
    this.users.set(id, user);
    return user;
  }

  async updateUserLanguage(id: string, language: Language): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.language = language;
      this.users.set(id, user);
    }
  }

  async getAllVocabulary(language?: Language): Promise<Vocabulary[]> {
    const all = Array.from(this.vocabulary.values());
    if (language) {
      return all.filter(v => v.language === language).sort((a, b) => a.displayOrder - b.displayOrder);
    }
    return all.sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async getVocabularyById(id: string): Promise<Vocabulary | undefined> {
    return this.vocabulary.get(id);
  }

  async getVocabularyByCategory(category: string, language?: Language): Promise<Vocabulary[]> {
    return Array.from(this.vocabulary.values())
      .filter(v => v.category === category && (!language || v.language === language))
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async createVocabulary(vocab: InsertVocabulary): Promise<Vocabulary> {
    const id = randomUUID();
    const allVocab = await this.getAllVocabulary(vocab.language as Language);
    const maxOrder = Math.max(0, ...allVocab.map(v => v.displayOrder));
    const newVocab: Vocabulary = {
      id,
      targetWord: vocab.targetWord,
      english: vocab.english,
      language: vocab.language || "russian",
      imageUrl: vocab.imageUrl ?? null,
      audioUrl: vocab.audioUrl ?? null,
      frequencyRank: vocab.frequencyRank,
      displayOrder: vocab.displayOrder ?? maxOrder + 1,
      category: vocab.category ?? null,
      partOfSpeech: vocab.partOfSpeech ?? null,
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

  async clearVocabularyImage(id: string): Promise<void> {
    const vocab = this.vocabulary.get(id);
    if (vocab) {
      vocab.imageUrl = null;
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

  async updateVocabularyDisplayOrder(id: string, displayOrder: number): Promise<void> {
    const vocab = this.vocabulary.get(id);
    if (vocab) {
      vocab.displayOrder = displayOrder;
      this.vocabulary.set(id, vocab);
    }
  }

  async reorderVocabulary(wordIds: string[]): Promise<void> {
    const firstWord = this.vocabulary.get(wordIds[0]);
    if (!firstWord) return;
    
    const language = firstWord.language as Language;
    const allVocab = await this.getAllVocabulary(language);
    const reorderedSet = new Set(wordIds);
    
    const updatedVocab: Vocabulary[] = [];
    for (const vocab of allVocab) {
      if (!reorderedSet.has(vocab.id)) {
        updatedVocab.push(vocab);
      }
    }
    
    const insertIndex = updatedVocab.findIndex(v => v.displayOrder > firstWord.displayOrder);
    const insertPosition = insertIndex === -1 ? updatedVocab.length : insertIndex;
    
    const finalList: Vocabulary[] = [
      ...updatedVocab.slice(0, insertPosition),
      ...wordIds.map(id => this.vocabulary.get(id)!).filter(Boolean),
      ...updatedVocab.slice(insertPosition),
    ];
    
    finalList.forEach((vocab, index) => {
      if (vocab) {
        vocab.displayOrder = index;
        this.vocabulary.set(vocab.id, vocab);
      }
    });
  }

  async getLearningProgress(userId: string, wordId: string): Promise<LearningProgress | undefined> {
    return Array.from(this.learningProgress.values()).find(p => p.userId === userId && p.wordId === wordId);
  }

  async getAllLearningProgress(userId: string): Promise<LearningProgress[]> {
    return Array.from(this.learningProgress.values()).filter(p => p.userId === userId);
  }

  async createLearningProgress(progress: InsertLearningProgress): Promise<LearningProgress> {
    const id = randomUUID();
    const newProgress: LearningProgress = {
      id,
      userId: progress.userId,
      wordId: progress.wordId,
      isLearned: progress.isLearned ?? false,
      learnedAt: progress.learnedAt ?? null,
      reviewCount: progress.reviewCount ?? 0,
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

  async getWordsToLearn(userId: string, language: Language, limit: number): Promise<Vocabulary[]> {
    const userProgress = await this.getAllLearningProgress(userId);
    const learnedWordIds = new Set(
      userProgress.filter(p => p.isLearned).map(p => p.wordId)
    );
    
    const allVocab = await this.getAllVocabulary(language);
    return allVocab
      .filter(v => !learnedWordIds.has(v.id))
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .slice(0, limit);
  }

  async getWordsToReview(userId: string, language: Language): Promise<(Vocabulary & { progress: LearningProgress })[]> {
    const now = new Date();
    const userProgress = await this.getAllLearningProgress(userId);
    const progressList = userProgress.filter(p => p.isLearned && p.nextReviewDate && new Date(p.nextReviewDate) <= now);
    
    const result: (Vocabulary & { progress: LearningProgress })[] = [];
    
    for (const progress of progressList) {
      const vocab = this.vocabulary.get(progress.wordId);
      if (vocab && vocab.language === language) {
        result.push({ ...vocab, progress });
      }
    }
    
    return result.sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async getTodayStats(userId: string): Promise<SessionStats | undefined> {
    const today = this.getTodayDateString();
    return Array.from(this.sessionStats.values()).find(s => s.userId === userId && s.date === today);
  }

  async getOrCreateTodayStats(userId: string): Promise<SessionStats> {
    const existing = await this.getTodayStats(userId);
    if (existing) return existing;

    const id = randomUUID();
    const streak = await this.getStreak(userId);
    const newStats: SessionStats = {
      id,
      userId,
      date: this.getTodayDateString(),
      wordsLearned: 0,
      wordsReviewed: 0,
      streak: streak + 1,
    };
    this.sessionStats.set(id, newStats);
    return newStats;
  }

  async updateTodayStats(userId: string, updates: Partial<SessionStats>): Promise<void> {
    const stats = await this.getOrCreateTodayStats(userId);
    Object.assign(stats, updates);
    this.sessionStats.set(stats.id, stats);
  }

  async getStreak(userId: string): Promise<number> {
    const stats = Array.from(this.sessionStats.values())
      .filter(s => s.userId === userId)
      .sort((a, b) => b.date.localeCompare(a.date));
    
    if (stats.length === 0) return 0;
    
    const today = this.getTodayDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    const lastStatDate = stats[0].date;
    if (lastStatDate !== today && lastStatDate !== yesterdayStr) {
      return 0;
    }
    
    return stats[0].streak ?? 0;
  }

  async getVocabularyForLevel(level: number, language: Language): Promise<Vocabulary[]> {
    const allVocab = await this.getAllVocabulary(language);
    const startIndex = level * 100;
    const endIndex = startIndex + 100;
    return allVocab.slice(startIndex, endIndex);
  }

  async getLevelInfo(userId: string, language: Language): Promise<{ currentLevel: number; wordsLearned: number; totalWords: number; allLevelWords: { word: Vocabulary; isLearned: boolean }[] }> {
    const allVocab = await this.getAllVocabulary(language);
    const userProgress = await this.getAllLearningProgress(userId);
    const learnedWordIds = new Set(
      userProgress.filter(p => p.isLearned).map(p => p.wordId)
    );
    
    const WORDS_PER_LEVEL = 100;
    let currentLevel = 0;
    
    for (let level = 0; level < Math.ceil(allVocab.length / WORDS_PER_LEVEL); level++) {
      const levelWords = allVocab.slice(level * WORDS_PER_LEVEL, (level + 1) * WORDS_PER_LEVEL);
      const learnedInLevel = levelWords.filter(w => learnedWordIds.has(w.id)).length;
      
      if (learnedInLevel < levelWords.length) {
        currentLevel = level;
        break;
      }
      currentLevel = level + 1;
    }
    
    const maxLevel = Math.ceil(allVocab.length / WORDS_PER_LEVEL) - 1;
    currentLevel = Math.min(currentLevel, maxLevel);
    
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

  async getGrammarExercises(language: Language): Promise<GrammarExercise[]> {
    return Array.from(this.grammarExercises.values())
      .filter(e => e.language === language)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async getGrammarExerciseById(id: string): Promise<GrammarExercise | undefined> {
    return this.grammarExercises.get(id);
  }

  async getGrammarProgress(userId: string, exerciseId: string): Promise<GrammarProgress | undefined> {
    const key = `${userId}-${exerciseId}`;
    return this.grammarProgress.get(key);
  }

  async getAllGrammarProgress(userId: string): Promise<GrammarProgress[]> {
    return Array.from(this.grammarProgress.values())
      .filter(p => p.userId === userId);
  }

  async createOrUpdateGrammarProgress(userId: string, exerciseId: string): Promise<GrammarProgress> {
    const key = `${userId}-${exerciseId}`;
    const existing = this.grammarProgress.get(key);
    
    if (existing) {
      const updated: GrammarProgress = {
        ...existing,
        practiceCount: existing.practiceCount + 1,
        lastPracticedAt: new Date(),
      };
      this.grammarProgress.set(key, updated);
      return updated;
    }
    
    const newProgress: GrammarProgress = {
      id: randomUUID(),
      userId,
      exerciseId,
      practiceCount: 1,
      lastPracticedAt: new Date(),
      bestScore: 0,
    };
    this.grammarProgress.set(key, newProgress);
    return newProgress;
  }
}

// DatabaseStorage implementation for PostgreSQL persistence
export class DatabaseStorage implements IStorage {
  private defaultImagePrompt: string = DEFAULT_IMAGE_PROMPT;
  private initialized = false;

  private getTodayDateString(): string {
    return new Date().toISOString().split('T')[0];
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Create tables if they don't exist (for production deployments)
    await this.createTablesIfNotExist();
    
    // Check if vocabulary exists, if not seed it
    const existingVocab = await db.select().from(vocabulary).limit(1);
    if (existingVocab.length === 0) {
      await this.seedVocabulary();
    }
    
    // Check if grammar exercises exist, if not seed them
    const existingExercises = await db.select().from(grammarExercises).limit(1);
    if (existingExercises.length === 0) {
      await this.seedGrammarExercises();
    }
    
    this.initialized = true;
  }

  private async createTablesIfNotExist(): Promise<void> {
    const { pool } = await import("./db");
    
    // Enable pgcrypto extension for gen_random_uuid()
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'russian'
      );
      
      CREATE TABLE IF NOT EXISTS vocabulary (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        target_word TEXT NOT NULL,
        english TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'russian',
        image_url TEXT,
        audio_url TEXT,
        frequency_rank INTEGER NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        category TEXT
      );
      
      CREATE TABLE IF NOT EXISTS learning_progress (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL,
        word_id VARCHAR NOT NULL REFERENCES vocabulary(id),
        is_learned BOOLEAN DEFAULT false,
        learned_at TIMESTAMP,
        review_count INTEGER DEFAULT 0,
        ease_factor INTEGER DEFAULT 250,
        interval INTEGER DEFAULT 0,
        repetitions INTEGER DEFAULT 0,
        next_review_date TIMESTAMP,
        last_review_date TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS session_stats (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL,
        date TEXT NOT NULL,
        words_learned INTEGER DEFAULT 0,
        words_reviewed INTEGER DEFAULT 0,
        streak INTEGER DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS grammar_exercises (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        language TEXT NOT NULL,
        category TEXT NOT NULL,
        difficulty INTEGER NOT NULL DEFAULT 1,
        display_order INTEGER NOT NULL DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS grammar_progress (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL,
        exercise_id VARCHAR NOT NULL,
        practice_count INTEGER NOT NULL DEFAULT 0,
        last_practiced_at TIMESTAMP,
        best_score INTEGER DEFAULT 0
      );
    `);
  }

  private async seedVocabulary(): Promise<void> {
    for (let i = 0; i < russianVocabulary.length; i++) {
      const word = russianVocabulary[i];
      await db.insert(vocabulary).values({
        targetWord: word.russian,
        english: word.english,
        language: "russian",
        frequencyRank: word.frequencyRank,
        displayOrder: i,
        category: word.category,
      });
    }
    
    for (let i = 0; i < spanishVocabulary.length; i++) {
      const word = spanishVocabulary[i];
      await db.insert(vocabulary).values({
        targetWord: word.spanish,
        english: word.english,
        language: "spanish",
        frequencyRank: word.frequencyRank,
        displayOrder: i,
        category: word.category,
      });
    }
  }

  private async seedGrammarExercises(): Promise<void> {
    for (const exercise of russianGrammarExercises) {
      await db.insert(grammarExercises).values({
        name: exercise.name,
        description: exercise.description,
        language: exercise.language,
        category: exercise.category,
        difficulty: exercise.difficulty,
        displayOrder: exercise.displayOrder,
      });
    }
    
    for (const exercise of spanishGrammarExercises) {
      await db.insert(grammarExercises).values({
        name: exercise.name,
        description: exercise.description,
        language: exercise.language,
        category: exercise.category,
        difficulty: exercise.difficulty,
        displayOrder: exercise.displayOrder,
      });
    }
  }

  async getDefaultImagePrompt(): Promise<string> {
    return this.defaultImagePrompt;
  }

  async setDefaultImagePrompt(prompt: string): Promise<void> {
    this.defaultImagePrompt = prompt;
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values({
      username: insertUser.username,
      password: insertUser.password,
      language: insertUser.language || "russian",
    }).returning();
    return user;
  }

  async updateUserLanguage(id: string, language: Language): Promise<void> {
    await db.update(users).set({ language }).where(eq(users.id, id));
  }

  async getAllVocabulary(language?: Language): Promise<Vocabulary[]> {
    if (language) {
      return await db.select().from(vocabulary)
        .where(eq(vocabulary.language, language))
        .orderBy(asc(vocabulary.displayOrder));
    }
    return await db.select().from(vocabulary).orderBy(asc(vocabulary.displayOrder));
  }

  async getVocabularyById(id: string): Promise<Vocabulary | undefined> {
    const [vocab] = await db.select().from(vocabulary).where(eq(vocabulary.id, id));
    return vocab || undefined;
  }

  async getVocabularyByCategory(category: string, language?: Language): Promise<Vocabulary[]> {
    if (language) {
      return await db.select().from(vocabulary)
        .where(and(eq(vocabulary.category, category), eq(vocabulary.language, language)))
        .orderBy(asc(vocabulary.displayOrder));
    }
    return await db.select().from(vocabulary)
      .where(eq(vocabulary.category, category))
      .orderBy(asc(vocabulary.displayOrder));
  }

  async createVocabulary(vocab: InsertVocabulary): Promise<Vocabulary> {
    const allVocab = await this.getAllVocabulary(vocab.language as Language);
    const maxOrder = allVocab.length > 0 ? Math.max(...allVocab.map(v => v.displayOrder)) : -1;
    
    const [newVocab] = await db.insert(vocabulary).values({
      targetWord: vocab.targetWord,
      english: vocab.english,
      language: vocab.language || "russian",
      imageUrl: vocab.imageUrl ?? null,
      audioUrl: vocab.audioUrl ?? null,
      frequencyRank: vocab.frequencyRank,
      displayOrder: vocab.displayOrder ?? maxOrder + 1,
      category: vocab.category ?? null,
    }).returning();
    return newVocab;
  }

  async updateVocabularyImage(id: string, imageUrl: string): Promise<void> {
    await db.update(vocabulary).set({ imageUrl }).where(eq(vocabulary.id, id));
  }

  async clearVocabularyImage(id: string): Promise<void> {
    await db.update(vocabulary).set({ imageUrl: null }).where(eq(vocabulary.id, id));
  }

  async updateVocabularyAudio(id: string, audioUrl: string): Promise<void> {
    await db.update(vocabulary).set({ audioUrl }).where(eq(vocabulary.id, id));
  }

  async updateVocabularyDisplayOrder(id: string, displayOrder: number): Promise<void> {
    await db.update(vocabulary).set({ displayOrder }).where(eq(vocabulary.id, id));
  }

  async reorderVocabulary(wordIds: string[]): Promise<void> {
    for (let i = 0; i < wordIds.length; i++) {
      await db.update(vocabulary).set({ displayOrder: i }).where(eq(vocabulary.id, wordIds[i]));
    }
  }

  async getLearningProgress(userId: string, wordId: string): Promise<LearningProgress | undefined> {
    const [progress] = await db.select().from(learningProgress)
      .where(and(eq(learningProgress.userId, userId), eq(learningProgress.wordId, wordId)));
    return progress || undefined;
  }

  async getAllLearningProgress(userId: string): Promise<LearningProgress[]> {
    return await db.select().from(learningProgress).where(eq(learningProgress.userId, userId));
  }

  async createLearningProgress(progress: InsertLearningProgress): Promise<LearningProgress> {
    const [newProgress] = await db.insert(learningProgress).values({
      userId: progress.userId,
      wordId: progress.wordId,
      isLearned: progress.isLearned ?? false,
      learnedAt: progress.learnedAt ?? null,
      reviewCount: progress.reviewCount ?? 0,
      easeFactor: progress.easeFactor ?? 250,
      interval: progress.interval ?? 0,
      repetitions: progress.repetitions ?? 0,
      nextReviewDate: progress.nextReviewDate ?? null,
      lastReviewDate: progress.lastReviewDate ?? null,
    }).returning();
    return newProgress;
  }

  async updateLearningProgress(id: string, updates: Partial<LearningProgress>): Promise<void> {
    await db.update(learningProgress).set(updates).where(eq(learningProgress.id, id));
  }

  async getWordsToLearn(userId: string, language: Language, limit: number): Promise<Vocabulary[]> {
    const userProgress = await this.getAllLearningProgress(userId);
    const learnedWordIds = new Set(userProgress.filter(p => p.isLearned).map(p => p.wordId));
    
    const allVocab = await this.getAllVocabulary(language);
    return allVocab.filter(v => !learnedWordIds.has(v.id)).slice(0, limit);
  }

  async getWordsToReview(userId: string, language: Language): Promise<(Vocabulary & { progress: LearningProgress })[]> {
    const now = new Date();
    const userProgress = await this.getAllLearningProgress(userId);
    const dueProgress = userProgress.filter(p => p.isLearned && p.nextReviewDate && new Date(p.nextReviewDate) <= now);
    
    const result: (Vocabulary & { progress: LearningProgress })[] = [];
    for (const progress of dueProgress) {
      const vocab = await this.getVocabularyById(progress.wordId);
      if (vocab && vocab.language === language) {
        result.push({ ...vocab, progress });
      }
    }
    return result.sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async getTodayStats(userId: string): Promise<SessionStats | undefined> {
    const today = this.getTodayDateString();
    const [stats] = await db.select().from(sessionStats)
      .where(and(eq(sessionStats.userId, userId), eq(sessionStats.date, today)));
    return stats || undefined;
  }

  async getOrCreateTodayStats(userId: string): Promise<SessionStats> {
    const existing = await this.getTodayStats(userId);
    if (existing) return existing;

    const streak = await this.getStreak(userId);
    const [newStats] = await db.insert(sessionStats).values({
      userId,
      date: this.getTodayDateString(),
      wordsLearned: 0,
      wordsReviewed: 0,
      streak: streak + 1,
    }).returning();
    return newStats;
  }

  async updateTodayStats(userId: string, updates: Partial<SessionStats>): Promise<void> {
    const stats = await this.getOrCreateTodayStats(userId);
    await db.update(sessionStats).set(updates).where(eq(sessionStats.id, stats.id));
  }

  async getStreak(userId: string): Promise<number> {
    const stats = await db.select().from(sessionStats)
      .where(eq(sessionStats.userId, userId))
      .orderBy(sql`${sessionStats.date} DESC`);
    
    if (stats.length === 0) return 0;
    
    const today = this.getTodayDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    const lastStatDate = stats[0].date;
    if (lastStatDate !== today && lastStatDate !== yesterdayStr) {
      return 0;
    }
    
    return stats[0].streak ?? 0;
  }

  async getVocabularyForLevel(level: number, language: Language): Promise<Vocabulary[]> {
    const allVocab = await this.getAllVocabulary(language);
    const startIndex = level * 100;
    return allVocab.slice(startIndex, startIndex + 100);
  }

  async getLevelInfo(userId: string, language: Language): Promise<{ currentLevel: number; wordsLearned: number; totalWords: number; allLevelWords: { word: Vocabulary; isLearned: boolean }[] }> {
    const allVocab = await this.getAllVocabulary(language);
    const userProgress = await this.getAllLearningProgress(userId);
    const learnedWordIds = new Set(userProgress.filter(p => p.isLearned).map(p => p.wordId));
    
    const WORDS_PER_LEVEL = 100;
    let currentLevel = 0;
    
    for (let level = 0; level < Math.ceil(allVocab.length / WORDS_PER_LEVEL); level++) {
      const levelWords = allVocab.slice(level * WORDS_PER_LEVEL, (level + 1) * WORDS_PER_LEVEL);
      const learnedInLevel = levelWords.filter(w => learnedWordIds.has(w.id)).length;
      
      if (learnedInLevel < levelWords.length) {
        currentLevel = level;
        break;
      }
      currentLevel = level + 1;
    }
    
    const maxLevel = Math.ceil(allVocab.length / WORDS_PER_LEVEL) - 1;
    currentLevel = Math.min(currentLevel, maxLevel);
    
    const levelWords = allVocab.slice(currentLevel * WORDS_PER_LEVEL, (currentLevel + 1) * WORDS_PER_LEVEL);
    const wordsLearned = levelWords.filter(w => learnedWordIds.has(w.id)).length;
    
    return {
      currentLevel,
      wordsLearned,
      totalWords: levelWords.length,
      allLevelWords: levelWords.map(word => ({ word, isLearned: learnedWordIds.has(word.id) }))
    };
  }

  async getGrammarExercises(language: Language): Promise<GrammarExercise[]> {
    return await db.select().from(grammarExercises)
      .where(eq(grammarExercises.language, language))
      .orderBy(asc(grammarExercises.displayOrder));
  }

  async getGrammarExerciseById(id: string): Promise<GrammarExercise | undefined> {
    const [exercise] = await db.select().from(grammarExercises).where(eq(grammarExercises.id, id));
    return exercise || undefined;
  }

  async getGrammarProgress(userId: string, exerciseId: string): Promise<GrammarProgress | undefined> {
    const [progress] = await db.select().from(grammarProgress)
      .where(and(eq(grammarProgress.userId, userId), eq(grammarProgress.exerciseId, exerciseId)));
    return progress || undefined;
  }

  async getAllGrammarProgress(userId: string): Promise<GrammarProgress[]> {
    return await db.select().from(grammarProgress).where(eq(grammarProgress.userId, userId));
  }

  async createOrUpdateGrammarProgress(userId: string, exerciseId: string): Promise<GrammarProgress> {
    const existing = await this.getGrammarProgress(userId, exerciseId);
    
    if (existing) {
      const [updated] = await db.update(grammarProgress)
        .set({ practiceCount: existing.practiceCount + 1, lastPracticedAt: new Date() })
        .where(eq(grammarProgress.id, existing.id))
        .returning();
      return updated;
    }
    
    const [newProgress] = await db.insert(grammarProgress).values({
      userId,
      exerciseId,
      practiceCount: 1,
      lastPracticedAt: new Date(),
      bestScore: 0,
    }).returning();
    return newProgress;
  }
}

// Use DatabaseStorage for persistent data
export const storage = new DatabaseStorage();

// Initialize database on startup
storage.initialize().catch(console.error);
