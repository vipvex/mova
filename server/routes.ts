import type { Express } from "express";
import { createServer, type Server } from "http";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { calculateSM2, mapButtonToQuality, getInitialProgress } from "./spacedRepetition";
import OpenAI from "openai";
import { ElevenLabsClient } from "elevenlabs";
import { z } from "zod";
import { type Language, languageEnum } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

// ElevenLabs voice IDs - configurable via environment variable
// Default: "Rachel" - warm, friendly female voice that works well for multiple languages
// You can set ELEVENLABS_VOICE_ID to any voice ID from the ElevenLabs library
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

// Helper function to generate TTS audio using ElevenLabs
async function generateElevenLabsTTS(text: string): Promise<string> {
  console.log(`Generating TTS for text: "${text}" using voice ID: ${ELEVENLABS_VOICE_ID}`);
  try {
    const audioStream = await elevenlabs.textToSpeech.convert(ELEVENLABS_VOICE_ID, {
      text: text,
      model_id: "eleven_multilingual_v2", // Supports Russian, Spanish, and many other languages
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    });
    
    // Convert the stream to a buffer
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    console.log(`TTS generated successfully, buffer size: ${buffer.length} bytes`);
    const base64Audio = buffer.toString('base64');
    return `data:audio/mpeg;base64,${base64Audio}`;
  } catch (error: any) {
    console.error("ElevenLabs TTS error:", error.message || error);
    if (error.statusCode) {
      console.error("ElevenLabs status code:", error.statusCode);
    }
    if (error.body) {
      console.error("ElevenLabs error body:", error.body);
    }
    throw error;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ==================== USER ROUTES ====================
  
  // Get all users
  app.get("/api/users", async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users.map(u => ({ id: u.id, username: u.username, language: u.language })));
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Create a new user
  const createUserSchema = z.object({
    username: z.string().min(1).max(50),
    language: languageEnum,
  });

  app.post("/api/users", async (req, res) => {
    try {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      const existingUser = await storage.getUserByUsername(parsed.data.username);
      if (existingUser) {
        return res.status(409).json({ error: "Username already exists" });
      }

      const user = await storage.createUser({
        username: parsed.data.username,
        password: "",
        language: parsed.data.language,
      });
      
      res.json({ id: user.id, username: user.username, language: user.language });
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  // Get user by ID
  app.get("/api/users/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ id: user.id, username: user.username, language: user.language });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // Update user language
  app.patch("/api/users/:userId/language", async (req, res) => {
    try {
      const { userId } = req.params;
      const { language } = req.body;
      
      const parsed = languageEnum.safeParse(language);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid language" });
      }

      await storage.updateUserLanguage(userId, parsed.data);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating user language:", error);
      res.status(500).json({ error: "Failed to update language" });
    }
  });

  // ==================== VOCABULARY ROUTES ====================

  // Get all vocabulary (optionally filtered by language)
  app.get("/api/vocabulary", async (req, res) => {
    try {
      const language = req.query.language as Language | undefined;
      const vocabulary = await storage.getAllVocabulary(language);
      res.json(vocabulary);
    } catch (error) {
      console.error("Error fetching vocabulary:", error);
      res.status(500).json({ error: "Failed to fetch vocabulary" });
    }
  });

  // Get vocabulary by category
  app.get("/api/vocabulary/category/:category", async (req, res) => {
    try {
      const { category } = req.params;
      const language = req.query.language as Language | undefined;
      const vocabulary = await storage.getVocabularyByCategory(category, language);
      res.json(vocabulary);
    } catch (error) {
      console.error("Error fetching vocabulary by category:", error);
      res.status(500).json({ error: "Failed to fetch vocabulary" });
    }
  });

  // Get level info for a user
  app.get("/api/users/:userId/level", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const levelInfo = await storage.getLevelInfo(userId, user.language as Language);
      res.json(levelInfo);
    } catch (error) {
      console.error("Error fetching level info:", error);
      res.status(500).json({ error: "Failed to fetch level info" });
    }
  });

  // Get words to learn for a user
  app.get("/api/users/:userId/words/learn", async (req, res) => {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 5;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const words = await storage.getWordsToLearn(userId, user.language as Language, limit);
      res.json(words);
    } catch (error) {
      console.error("Error fetching words to learn:", error);
      res.status(500).json({ error: "Failed to fetch words to learn" });
    }
  });

  // Get words due for review for a user
  app.get("/api/users/:userId/words/review", async (req, res) => {
    try {
      const { userId } = req.params;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const words = await storage.getWordsToReview(userId, user.language as Language);
      res.json(words);
    } catch (error) {
      console.error("Error fetching words to review:", error);
      res.status(500).json({ error: "Failed to fetch words to review" });
    }
  });

  // Mark word as learned for a user
  app.post("/api/users/:userId/words/:wordId/learn", async (req, res) => {
    try {
      const { userId, wordId } = req.params;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const word = await storage.getVocabularyById(wordId);
      if (!word) {
        return res.status(404).json({ error: "Word not found" });
      }

      let progress = await storage.getLearningProgress(userId, wordId);
      
      if (!progress) {
        const initial = getInitialProgress();
        progress = await storage.createLearningProgress({
          userId,
          wordId,
          isLearned: true,
          learnedAt: new Date(),
          reviewCount: 0,
          easeFactor: initial.easeFactor,
          interval: initial.interval,
          repetitions: initial.repetitions,
          nextReviewDate: initial.nextReviewDate,
          lastReviewDate: new Date(),
        });
      } else {
        const initial = getInitialProgress();
        await storage.updateLearningProgress(progress.id, {
          isLearned: true,
          learnedAt: progress.learnedAt || new Date(),
          easeFactor: initial.easeFactor,
          interval: initial.interval,
          repetitions: initial.repetitions,
          nextReviewDate: initial.nextReviewDate,
          lastReviewDate: new Date(),
        });
      }

      const stats = await storage.getOrCreateTodayStats(userId);
      await storage.updateTodayStats(userId, {
        wordsLearned: (stats.wordsLearned ?? 0) + 1,
      });

      res.json({ success: true, progress });
    } catch (error) {
      console.error("Error marking word as learned:", error);
      res.status(500).json({ error: "Failed to mark word as learned" });
    }
  });

  // Review a word for a user
  const reviewSchema = z.object({
    knowsIt: z.boolean(),
  });

  app.post("/api/users/:userId/words/:wordId/review", async (req, res) => {
    try {
      const { userId, wordId } = req.params;
      const parsed = reviewSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      const { knowsIt } = parsed.data;
      
      const progress = await storage.getLearningProgress(userId, wordId);
      if (!progress) {
        return res.status(404).json({ error: "Word not in learning progress" });
      }

      const quality = mapButtonToQuality(knowsIt);
      const sm2Result = calculateSM2(
        quality,
        progress.easeFactor ?? 250,
        progress.interval ?? 0,
        progress.repetitions ?? 0
      );

      await storage.updateLearningProgress(progress.id, {
        easeFactor: sm2Result.easeFactor,
        interval: sm2Result.interval,
        repetitions: sm2Result.repetitions,
        nextReviewDate: sm2Result.nextReviewDate,
        lastReviewDate: new Date(),
        reviewCount: (progress.reviewCount ?? 0) + 1,
      });

      const stats = await storage.getOrCreateTodayStats(userId);
      await storage.updateTodayStats(userId, {
        wordsReviewed: (stats.wordsReviewed ?? 0) + 1,
      });

      res.json({ success: true, nextReview: sm2Result.nextReviewDate });
    } catch (error) {
      console.error("Error reviewing word:", error);
      res.status(500).json({ error: "Failed to review word" });
    }
  });

  // Get session stats for a user
  app.get("/api/users/:userId/stats", async (req, res) => {
    try {
      const { userId } = req.params;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const stats = await storage.getOrCreateTodayStats(userId);
      const allProgress = await storage.getAllLearningProgress(userId);
      const wordsToReview = await storage.getWordsToReview(userId, user.language as Language);
      const wordsToLearn = await storage.getWordsToLearn(userId, user.language as Language, 100);
      
      const totalLearned = allProgress.filter(p => p.isLearned).length;
      
      res.json({
        wordsToday: (stats.wordsLearned ?? 0) + (stats.wordsReviewed ?? 0),
        totalLearned,
        streak: stats.streak ?? 0,
        wordsToReview: wordsToReview.length,
        wordsToLearn: wordsToLearn.length,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // ==================== TTS ROUTES ====================

  // Speech-to-text transcription using Whisper API
  app.post("/api/transcribe", async (req, res) => {
    try {
      const { audioData, mimeType, language } = req.body;
      
      if (!audioData) {
        return res.status(400).json({ error: "No audio data provided" });
      }

      const audioBuffer = Buffer.from(audioData, 'base64');
      const blob = new Blob([audioBuffer], { type: mimeType || 'audio/webm' });
      const file = new File([blob], 'audio.webm', { 
        type: mimeType || 'audio/webm' 
      });

      // Use the appropriate language code for Whisper
      const whisperLang = language === 'spanish' ? 'es' : 'ru';

      const transcription = await openai.audio.transcriptions.create({
        model: "whisper-1",
        file: file,
        language: whisperLang,
        response_format: "text",
      });

      res.json({ 
        text: typeof transcription === 'string' ? transcription.trim() : String(transcription).trim(),
        success: true 
      });
    } catch (error) {
      console.error("Error transcribing audio:", error);
      res.status(500).json({ error: "Failed to transcribe audio" });
    }
  });

  // Generate TTS for arbitrary text (for grammar exercises)
  // NOTE: This route must come BEFORE /api/tts/:wordId to avoid matching "text" as wordId
  app.post("/api/tts/text", async (req, res) => {
    try {
      const { text, language } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      const audioUrl = await generateElevenLabsTTS(text);
      res.json({ audioUrl });
    } catch (error) {
      console.error("Error generating TTS:", error);
      res.status(500).json({ error: "Failed to generate audio" });
    }
  });

  // Generate confirmation TTS audio
  // NOTE: This route must come BEFORE /api/tts/:wordId to avoid matching "confirmation" as wordId
  app.post("/api/tts/confirmation", async (req, res) => {
    try {
      const { targetWord, language } = req.body;
      
      if (!targetWord) {
        return res.status(400).json({ error: "Target word is required" });
      }

      let confirmationText: string;
      if (language === 'spanish') {
        confirmationText = `¡Sí! Esa palabra es ${targetWord}!`;
      } else {
        confirmationText = `Да! Это слово ${targetWord}!`;
      }

      const audioUrl = await generateElevenLabsTTS(confirmationText);
      res.json({ audioUrl });
    } catch (error) {
      console.error("Error generating confirmation TTS:", error);
      res.status(500).json({ error: "Failed to generate confirmation audio" });
    }
  });

  // Generate TTS audio for a vocabulary word by ID
  // NOTE: This wildcard route must come AFTER specific routes like /text and /confirmation
  app.post("/api/tts/:wordId", async (req, res) => {
    try {
      const { wordId } = req.params;
      
      const word = await storage.getVocabularyById(wordId);
      if (!word) {
        return res.status(404).json({ error: "Word not found" });
      }

      if (word.audioUrl) {
        return res.json({ audioUrl: word.audioUrl });
      }

      const audioUrl = await generateElevenLabsTTS(word.targetWord);
      await storage.updateVocabularyAudio(wordId, audioUrl);

      res.json({ audioUrl });
    } catch (error) {
      console.error("Error generating TTS:", error);
      res.status(500).json({ error: "Failed to generate audio" });
    }
  });

  // Generate image for a word
  app.post("/api/image/:wordId", async (req, res) => {
    try {
      const { wordId } = req.params;
      
      const word = await storage.getVocabularyById(wordId);
      if (!word) {
        return res.status(404).json({ error: "Word not found" });
      }

      if (word.imageUrl) {
        return res.json({ imageUrl: word.imageUrl });
      }

      const promptTemplate = await storage.getDefaultImagePrompt();
      const prompt = promptTemplate.replace(/{word}/g, word.english);

      const imageResponse = await openai.images.generate({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
      });

      const imageUrl = imageResponse.data?.[0]?.url;
      
      if (!imageUrl) {
        return res.status(500).json({ error: "Failed to generate image" });
      }

      await storage.updateVocabularyImage(wordId, imageUrl);

      res.json({ imageUrl });
    } catch (error) {
      console.error("Error generating image:", error);
      res.status(500).json({ error: "Failed to generate image" });
    }
  });

  // ==================== ADMIN ROUTES ====================

  const adminTokens = new Set<string>();

  function generateAdminToken(): string {
    return randomBytes(32).toString('hex');
  }

  function requireAdminAuth(req: any, res: any, next: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.slice(7);
    if (!adminTokens.has(token)) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    next();
  }

  const adminAuthSchema = z.object({
    password: z.string(),
  });

  app.post("/api/admin/auth", async (req, res) => {
    try {
      const parsed = adminAuthSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request" });
      }

      const { password } = parsed.data;
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (password === adminPassword) {
        const token = generateAdminToken();
        adminTokens.add(token);
        setTimeout(() => adminTokens.delete(token), 60 * 60 * 1000);
        res.json({ success: true, token });
      } else {
        res.status(401).json({ error: "Invalid password" });
      }
    } catch (error) {
      console.error("Error authenticating:", error);
      res.status(500).json({ error: "Authentication failed" });
    }
  });

  // Get all words for admin (filtered by language)
  app.get("/api/admin/words", requireAdminAuth, async (req, res) => {
    try {
      const language = req.query.language as Language | undefined;
      const vocabulary = await storage.getAllVocabulary(language);
      
      const wordsWithStatus = vocabulary.map(word => ({
        ...word,
        isLearned: false,
        learnedAt: null,
        lastReviewDate: null,
        reviewCount: 0,
        nextReviewDate: null,
        repetitions: 0,
      }));

      res.json(wordsWithStatus);
    } catch (error) {
      console.error("Error fetching admin words:", error);
      res.status(500).json({ error: "Failed to fetch words" });
    }
  });

  // Reorder words (admin only)
  const reorderSchema = z.object({
    wordIds: z.array(z.string()),
    targetIndex: z.number(),
  });

  app.post("/api/admin/words/reorder", requireAdminAuth, async (req, res) => {
    try {
      const parsed = reorderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request" });
      }

      const { wordIds, targetIndex } = parsed.data;
      const firstWord = await storage.getVocabularyById(wordIds[0]);
      if (!firstWord) {
        return res.status(404).json({ error: "Word not found" });
      }
      
      const allVocab = await storage.getAllVocabulary(firstWord.language as Language);
      const movingIds = new Set(wordIds);
      
      const remaining = allVocab.filter(v => !movingIds.has(v.id));
      
      const movingWords = wordIds
        .map(id => allVocab.find(v => v.id === id))
        .filter(Boolean) as typeof allVocab;
      
      const clampedIndex = Math.max(0, Math.min(targetIndex, remaining.length));
      const newOrder = [
        ...remaining.slice(0, clampedIndex),
        ...movingWords,
        ...remaining.slice(clampedIndex),
      ];
      
      for (let i = 0; i < newOrder.length; i++) {
        await storage.updateVocabularyDisplayOrder(newOrder[i].id, i);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering words:", error);
      res.status(500).json({ error: "Failed to reorder words" });
    }
  });

  // Regenerate image with custom prompt
  const regenerateImageSchema = z.object({
    customPrompt: z.string().optional(),
  });

  app.post("/api/admin/words/:wordId/regenerate-image", requireAdminAuth, async (req, res) => {
    try {
      const { wordId } = req.params;
      const parsed = regenerateImageSchema.safeParse(req.body);
      
      const word = await storage.getVocabularyById(wordId);
      if (!word) {
        return res.status(404).json({ error: "Word not found" });
      }

      const customPrompt = parsed.success ? parsed.data.customPrompt : undefined;
      
      let prompt: string;
      if (customPrompt) {
        prompt = customPrompt;
      } else {
        const promptTemplate = await storage.getDefaultImagePrompt();
        prompt = promptTemplate.replace(/{word}/g, word.english);
      }

      const imageResponse = await openai.images.generate({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
      });

      const imageUrl = imageResponse.data?.[0]?.url;
      
      if (!imageUrl) {
        return res.status(500).json({ error: "Failed to generate image" });
      }

      await storage.updateVocabularyImage(wordId, imageUrl);

      res.json({ imageUrl });
    } catch (error) {
      console.error("Error regenerating image:", error);
      res.status(500).json({ error: "Failed to regenerate image" });
    }
  });

  // Get words without images
  app.get("/api/admin/words/no-images", requireAdminAuth, async (req, res) => {
    try {
      const language = req.query.language as Language | undefined;
      const vocabulary = await storage.getAllVocabulary(language);
      const wordsWithoutImages = vocabulary.filter(w => !w.imageUrl);
      res.json(wordsWithoutImages);
    } catch (error) {
      console.error("Error fetching words without images:", error);
      res.status(500).json({ error: "Failed to fetch words" });
    }
  });

  // Generate image for a specific word
  app.post("/api/admin/words/:wordId/generate-image", requireAdminAuth, async (req, res) => {
    try {
      const { wordId } = req.params;
      
      const word = await storage.getVocabularyById(wordId);
      if (!word) {
        return res.status(404).json({ error: "Word not found" });
      }

      const promptTemplate = await storage.getDefaultImagePrompt();
      const prompt = promptTemplate.replace(/{word}/g, word.english);

      const imageResponse = await openai.images.generate({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
      });

      const imageUrl = imageResponse.data?.[0]?.url;
      
      if (!imageUrl) {
        return res.status(500).json({ error: "Failed to generate image" });
      }

      await storage.updateVocabularyImage(wordId, imageUrl);
      res.json({ wordId, imageUrl });
    } catch (error) {
      console.error("Error generating image:", error);
      res.status(500).json({ error: "Failed to generate image" });
    }
  });

  // Get settings
  app.get("/api/admin/settings", requireAdminAuth, async (req, res) => {
    try {
      const defaultImagePrompt = await storage.getDefaultImagePrompt();
      res.json({ defaultImagePrompt });
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  // Update default image prompt
  const updateSettingsSchema = z.object({
    defaultImagePrompt: z.string()
      .min(10, "Prompt must be at least 10 characters")
      .refine((val) => val.includes("{word}"), {
        message: "Prompt must contain {word} placeholder",
      }),
  });

  app.put("/api/admin/settings", requireAdminAuth, async (req, res) => {
    try {
      const parsed = updateSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      await storage.setDefaultImagePrompt(parsed.data.defaultImagePrompt);
      res.json({ success: true, defaultImagePrompt: parsed.data.defaultImagePrompt });
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Get grammar exercises for a language
  app.get("/api/users/:userId/grammar-exercises", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const exercises = await storage.getGrammarExercises(user.language as "russian" | "spanish");
      const progress = await storage.getAllGrammarProgress(userId);
      
      const progressMap = new Map(progress.map(p => [p.exerciseId, p]));
      
      const exercisesWithProgress = exercises.map(exercise => ({
        ...exercise,
        practiceCount: progressMap.get(exercise.id)?.practiceCount || 0,
        lastPracticedAt: progressMap.get(exercise.id)?.lastPracticedAt || null,
      }));
      
      res.json(exercisesWithProgress);
    } catch (error) {
      console.error("Error fetching grammar exercises:", error);
      res.status(500).json({ error: "Failed to fetch grammar exercises" });
    }
  });

  // Get single grammar exercise
  app.get("/api/grammar-exercises/:exerciseId", async (req, res) => {
    try {
      const { exerciseId } = req.params;
      const exercise = await storage.getGrammarExerciseById(exerciseId);
      if (!exercise) {
        return res.status(404).json({ error: "Exercise not found" });
      }
      res.json(exercise);
    } catch (error) {
      console.error("Error fetching grammar exercise:", error);
      res.status(500).json({ error: "Failed to fetch grammar exercise" });
    }
  });

  // Record grammar practice
  app.post("/api/users/:userId/grammar-exercises/:exerciseId/practice", async (req, res) => {
    try {
      const { userId, exerciseId } = req.params;
      const progress = await storage.createOrUpdateGrammarProgress(userId, exerciseId);
      res.json(progress);
    } catch (error) {
      console.error("Error recording grammar practice:", error);
      res.status(500).json({ error: "Failed to record practice" });
    }
  });

  return httpServer;
}
