import { 
  type User, type InsertUser,
  type Vocabulary, type InsertVocabulary,
  type LearningProgress, type InsertLearningProgress,
  type SessionStats, type InsertSessionStats,
  type GrammarExercise, type InsertGrammarExercise,
  type GrammarProgress, type InsertGrammarProgress,
  type Language
} from "@shared/schema";
import { randomUUID } from "crypto";
import { russianVocabulary } from "./russianVocabulary";
import { spanishVocabulary } from "./spanishVocabulary";
import { russianGrammarExercises, spanishGrammarExercises } from "./grammarExercises";

export const DEFAULT_IMAGE_PROMPT = "Simple, bright cartoon illustration of {word}, child-friendly educational style, flat design, pastel background, clean lines, suitable for 6-year-old children learning vocabulary. No text or letters in the image.";

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

export const storage = new MemStorage();
