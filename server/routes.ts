import type { Express } from "express";
import { createServer, type Server } from "http";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { calculateSM2, mapButtonToQuality, getInitialProgress } from "./spacedRepetition";
import OpenAI from "openai";
import { ElevenLabsClient } from "elevenlabs";
import { z } from "zod";
import { type Language, languageEnum, stories } from "@shared/schema";
import { saveImageFromBase64, deleteImage as deleteImageFile, imageExists } from "./media";
import { GoogleGenAI, Modality } from "@google/genai";
import { russianVocabulary } from "./russianVocabulary";
import { spanishVocabulary } from "./spanishVocabulary";
import { db } from "./db";
import { eq, and, asc, desc } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Gemini AI for image generation (using Replit AI Integrations - no API key needed, charges billed to Replit credits)
const geminiAI = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

// Helper function to generate images using Gemini
async function generateGeminiImage(prompt: string): Promise<string> {
  const response = await geminiAI.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in Gemini response");
  }

  return imagePart.inlineData.data;
}

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

  // Speech-to-text transcription using ElevenLabs Scribe v2
  app.post("/api/transcribe", async (req, res) => {
    try {
      const { audioData, mimeType, language } = req.body;
      
      if (!audioData) {
        return res.status(400).json({ error: "No audio data provided" });
      }

      const audioBuffer = Buffer.from(audioData, 'base64');
      console.log(`Transcribing audio: mimeType: ${mimeType || 'audio/webm'}, buffer size: ${audioBuffer.length} bytes, language: ${language}`);
      
      // Use ElevenLabs Scribe v2 for speech-to-text
      // Map language to ISO-639 code
      const langCode = language === 'spanish' ? 'es' : 'ru';
      
      // Create form data using Web FormData API (compatible with Node fetch)
      const formData = new FormData();
      const audioBlob = new Blob([audioBuffer], { type: mimeType || 'audio/webm' });
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model_id', 'scribe_v1');
      formData.append('language_code', langCode);
      
      console.log("Calling ElevenLabs Scribe v2 API...");
      
      const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY!,
        },
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("ElevenLabs STT error:", response.status, errorText);
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json() as { text?: string };
      console.log("ElevenLabs transcription result:", result);

      res.json({ 
        text: result.text?.trim() || '',
        success: true 
      });
    } catch (error: any) {
      console.error("Error transcribing audio:", error);
      console.error("Error details:", error?.message);
      res.status(500).json({ error: "Failed to transcribe audio", details: error?.message || String(error) });
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
      const { mode, language: userLanguage } = req.body || {};
      
      const word = await storage.getVocabularyById(wordId);
      if (!word) {
        return res.status(404).json({ error: "Word not found" });
      }

      // Determine language: prefer word's language, fallback to user's language, then 'russian'
      const lang = word.language || userLanguage || 'russian';

      // For learning mode, generate "это, {word}." audio with proper intonation (not cached)
      if (mode === 'learn') {
        let learnText: string;
        if (lang === 'spanish') {
          learnText = `esto es, ${word.targetWord}.`;
        } else {
          learnText = `это, ${word.targetWord}.`;
        }
        const audioUrl = await generateElevenLabsTTS(learnText);
        return res.json({ audioUrl });
      }

      // For regular mode, use cached audio if available
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
      const prompt = promptTemplate.replace(/{word}/g, word.targetWord);

      const base64Data = await generateGeminiImage(prompt);

      const imageUrl = await saveImageFromBase64(wordId, base64Data);
      await storage.updateVocabularyImage(wordId, imageUrl);

      res.json({ imageUrl });
    } catch (error: any) {
      console.error("Error generating image:", error);
      console.error("Error message:", error?.message);
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
        prompt = promptTemplate.replace(/{word}/g, word.targetWord);
      }

      const base64Data = await generateGeminiImage(prompt);

      const imageUrl = await saveImageFromBase64(wordId, base64Data);
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

  // Get words with missing local image files (expired URLs or not saved locally)
  app.get("/api/admin/words/missing-images", requireAdminAuth, async (req, res) => {
    try {
      const language = req.query.language as Language | undefined;
      const vocabulary = await storage.getAllVocabulary(language);
      const wordsWithMissingImages = vocabulary.filter(w => {
        if (!w.imageUrl) return false;
        if (w.imageUrl.startsWith('/media/images/')) {
          const filename = w.imageUrl.split('/').pop()?.replace('.png', '') || '';
          return !imageExists(filename);
        }
        return true;
      });
      res.json(wordsWithMissingImages);
    } catch (error) {
      console.error("Error fetching words with missing images:", error);
      res.status(500).json({ error: "Failed to fetch words" });
    }
  });

  // Batch image generation state
  interface BatchJobStatus {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    total: number;
    completed: number;
    failed: string[];
    successful: string[];
    startedAt: Date;
    completedAt?: Date;
  }
  
  const batchJobs = new Map<string, BatchJobStatus>();
  const CONCURRENT_LIMIT = 3; // Process 3 images at a time

  // Helper to process images with concurrency limit
  async function processImagesWithConcurrency(
    wordIds: string[],
    jobId: string,
    promptTemplate: string
  ) {
    const job = batchJobs.get(jobId);
    if (!job) return;

    const queue = [...wordIds];
    const inProgress = new Set<Promise<void>>();

    const processOne = async (wordId: string) => {
      try {
        const word = await storage.getVocabularyById(wordId);
        if (!word) {
          job.failed.push(wordId);
          return;
        }

        const prompt = promptTemplate.replace(/{word}/g, word.targetWord);
        
        const base64Data = await generateGeminiImage(prompt);

        const imageUrl = await saveImageFromBase64(wordId, base64Data);
        await storage.updateVocabularyImage(wordId, imageUrl);
        job.successful.push(wordId);
      } catch (error) {
        console.error(`Failed to generate image for ${wordId}:`, error);
        job.failed.push(wordId);
      } finally {
        job.completed++;
      }
    };

    while (queue.length > 0 || inProgress.size > 0) {
      // Fill up to concurrent limit
      while (queue.length > 0 && inProgress.size < CONCURRENT_LIMIT) {
        const wordId = queue.shift()!;
        const promise = processOne(wordId).finally(() => {
          inProgress.delete(promise);
        });
        inProgress.add(promise);
      }

      // Wait for at least one to complete before continuing
      if (inProgress.size > 0) {
        await Promise.race(inProgress);
      }
    }

    job.status = 'completed';
    job.completedAt = new Date();
  }

  // Start batch image generation
  const batchGenerateSchema = z.object({
    wordIds: z.array(z.string()).min(1).max(200),
  });

  app.post("/api/admin/batch-generate-images", requireAdminAuth, async (req, res) => {
    try {
      const parsed = batchGenerateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      const { wordIds } = parsed.data;
      const jobId = randomBytes(8).toString('hex');
      
      const job: BatchJobStatus = {
        id: jobId,
        status: 'processing',
        total: wordIds.length,
        completed: 0,
        failed: [],
        successful: [],
        startedAt: new Date(),
      };
      
      batchJobs.set(jobId, job);

      // Get prompt template
      const promptTemplate = await storage.getDefaultImagePrompt();

      // Start processing in background
      processImagesWithConcurrency(wordIds, jobId, promptTemplate).catch(error => {
        console.error("Batch processing error:", error);
        const job = batchJobs.get(jobId);
        if (job) {
          job.status = 'failed';
          job.completedAt = new Date();
        }
      });

      res.json({ jobId, status: 'processing', total: wordIds.length });
    } catch (error) {
      console.error("Error starting batch generation:", error);
      res.status(500).json({ error: "Failed to start batch generation" });
    }
  });

  // Get batch job status
  app.get("/api/admin/batch-generate-images/:jobId", requireAdminAuth, async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = batchJobs.get(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json({
        id: job.id,
        status: job.status,
        total: job.total,
        completed: job.completed,
        failedCount: job.failed.length,
        successCount: job.successful.length,
        failed: job.failed,
      });
    } catch (error) {
      console.error("Error fetching batch status:", error);
      res.status(500).json({ error: "Failed to fetch batch status" });
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
      const prompt = promptTemplate.replace(/{word}/g, word.targetWord);

      const base64Data = await generateGeminiImage(prompt);

      const imageUrl = await saveImageFromBase64(wordId, base64Data);
      await storage.updateVocabularyImage(wordId, imageUrl);
      res.json({ wordId, imageUrl });
    } catch (error) {
      console.error("Error generating image:", error);
      res.status(500).json({ error: "Failed to generate image" });
    }
  });

  // Delete image for a word
  app.delete("/api/admin/words/:wordId/image", requireAdminAuth, async (req, res) => {
    try {
      const { wordId } = req.params;
      
      const word = await storage.getVocabularyById(wordId);
      if (!word) {
        return res.status(404).json({ error: "Word not found" });
      }

      deleteImageFile(wordId);
      await storage.clearVocabularyImage(wordId);
      res.json({ success: true, wordId });
    } catch (error) {
      console.error("Error deleting image:", error);
      res.status(500).json({ error: "Failed to delete image" });
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

  // Sync vocabulary - add new words without duplicates
  app.post("/api/admin/sync-vocabulary", requireAdminAuth, async (req, res) => {
    try {
      // Get all existing words from database
      const existingRussianWords = await storage.getAllVocabulary("russian");
      const existingSpanishWords = await storage.getAllVocabulary("spanish");
      
      const existingRussianSet = new Set(existingRussianWords.map((w) => w.targetWord.toLowerCase()));
      const existingSpanishSet = new Set(existingSpanishWords.map((w) => w.targetWord.toLowerCase()));
      
      let addedRussian = 0;
      let addedSpanish = 0;
      
      // Find new Russian words
      const newRussianWords = russianVocabulary.filter(
        (w) => !existingRussianSet.has(w.russian.toLowerCase())
      );
      
      // Find new Spanish words
      const newSpanishWords = spanishVocabulary.filter(
        (w) => !existingSpanishSet.has(w.spanish.toLowerCase())
      );
      
      // Add new Russian words
      const startOrderRussian = existingRussianWords.length;
      for (let i = 0; i < newRussianWords.length; i++) {
        const word = newRussianWords[i];
        await storage.createVocabulary({
          targetWord: word.russian,
          english: word.english,
          language: "russian",
          frequencyRank: word.frequencyRank,
          displayOrder: startOrderRussian + i,
          category: word.category,
          partOfSpeech: word.partOfSpeech || null,
        });
        addedRussian++;
      }
      
      // Add new Spanish words
      const startOrderSpanish = existingSpanishWords.length;
      for (let i = 0; i < newSpanishWords.length; i++) {
        const word = newSpanishWords[i];
        await storage.createVocabulary({
          targetWord: word.spanish,
          english: word.english,
          language: "spanish",
          frequencyRank: word.frequencyRank,
          displayOrder: startOrderSpanish + i,
          category: word.category,
          partOfSpeech: null,
        });
        addedSpanish++;
      }
      
      res.json({
        success: true,
        addedRussian,
        addedSpanish,
        totalRussian: existingRussianWords.length + addedRussian,
        totalSpanish: existingSpanishWords.length + addedSpanish,
      });
    } catch (error) {
      console.error("Error syncing vocabulary:", error);
      res.status(500).json({ error: "Failed to sync vocabulary" });
    }
  });

  // ============ STORY MODE API ENDPOINTS ============

  // Get all published stories for a user
  app.get("/api/users/:userId/stories", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const stories = await storage.getStoriesForUser(userId, user.language as Language);
      const progress = await storage.getAllUserStoryProgress(userId);
      const progressMap = new Map(progress.map(p => [p.storyId, p]));
      
      const storiesWithProgress = stories.map(story => ({
        ...story,
        progress: progressMap.get(story.id) || null,
      }));
      
      res.json(storiesWithProgress);
    } catch (error) {
      console.error("Error fetching stories:", error);
      res.status(500).json({ error: "Failed to fetch stories" });
    }
  });

  // Get a specific story with pages and quizzes
  app.get("/api/stories/:storyId", async (req, res) => {
    try {
      const { storyId } = req.params;
      const story = await storage.getStoryById(storyId);
      if (!story) {
        return res.status(404).json({ error: "Story not found" });
      }
      const pages = await storage.getStoryPages(storyId);
      const quizzes = await storage.getStoryQuizzes(storyId);
      res.json({ ...story, pages, quizzes });
    } catch (error) {
      console.error("Error fetching story:", error);
      res.status(500).json({ error: "Failed to fetch story" });
    }
  });

  // Get user's progress on a story
  app.get("/api/users/:userId/stories/:storyId/progress", async (req, res) => {
    try {
      const { userId, storyId } = req.params;
      const progress = await storage.getUserStoryProgress(userId, storyId);
      res.json(progress || { currentPage: 0, isCompleted: false });
    } catch (error) {
      console.error("Error fetching story progress:", error);
      res.status(500).json({ error: "Failed to fetch progress" });
    }
  });

  // Update user's progress on a story
  app.post("/api/users/:userId/stories/:storyId/progress", async (req, res) => {
    try {
      const { userId, storyId } = req.params;
      const { currentPage, isCompleted, quizScore } = req.body;
      
      const updates: { currentPage?: number; isCompleted?: boolean; quizScore?: number; completedAt?: Date } = {};
      if (typeof currentPage === 'number') updates.currentPage = currentPage;
      if (typeof isCompleted === 'boolean') {
        updates.isCompleted = isCompleted;
        if (isCompleted) updates.completedAt = new Date();
      }
      if (typeof quizScore === 'number') updates.quizScore = quizScore;
      
      const progress = await storage.createOrUpdateUserStoryProgress(userId, storyId, updates);
      res.json(progress);
    } catch (error) {
      console.error("Error updating story progress:", error);
      res.status(500).json({ error: "Failed to update progress" });
    }
  });

  // Generate TTS for a story page sentence
  app.post("/api/stories/:storyId/pages/:pageNumber/tts", async (req, res) => {
    try {
      const { storyId, pageNumber } = req.params;
      const page = await storage.getStoryPageByNumber(storyId, parseInt(pageNumber));
      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }
      
      // If page already has audio, return it
      if (page.audioUrl) {
        return res.json({ audioUrl: page.audioUrl });
      }
      
      // Generate new audio
      const audioUrl = await generateElevenLabsTTS(page.sentence);
      
      // Save the audio URL to the page
      await storage.updateStoryPage(page.id, { audioUrl });
      
      res.json({ audioUrl });
    } catch (error) {
      console.error("Error generating story page TTS:", error);
      res.status(500).json({ error: "Failed to generate audio" });
    }
  });

  // Transcribe audio for story page verification (voice recognition)
  app.post("/api/stories/transcribe", async (req, res) => {
    try {
      const audioBase64 = req.body.audio;
      const language = req.body.language || 'ru';
      
      if (!audioBase64) {
        return res.status(400).json({ error: "No audio data provided" });
      }

      const audioBuffer = Buffer.from(audioBase64, 'base64');
      const blob = new Blob([audioBuffer], { type: 'audio/webm' });
      
      const result = await elevenlabs.speechToText.convert({
        file: blob,
        model_id: "scribe_v1",
        language_code: language === 'spanish' ? 'es' : 'ru',
      });

      res.json({ text: result.text || '' });
    } catch (error) {
      console.error("Error transcribing story audio:", error);
      res.status(500).json({ error: "Failed to transcribe audio" });
    }
  });

  // ============ ADMIN STORY MANAGEMENT ENDPOINTS ============

  // Get all users for admin (for story target selection)
  app.get("/api/admin/users", requireAdminAuth, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get all stories for admin (including drafts)
  app.get("/api/admin/stories", requireAdminAuth, async (req, res) => {
    try {
      const { language } = req.query;
      if (!language || typeof language !== 'string') {
        return res.status(400).json({ error: "language query parameter required" });
      }
      
      // Get all stories for this language (both draft and published)
      const allStories = await db.select().from(stories)
        .where(eq(stories.language, language as Language))
        .orderBy(desc(stories.createdAt));
      
      res.json(allStories);
    } catch (error) {
      console.error("Error fetching admin stories:", error);
      res.status(500).json({ error: "Failed to fetch stories" });
    }
  });

  // Create a new story
  app.post("/api/admin/stories", requireAdminAuth, async (req, res) => {
    try {
      const { title, targetUserId, language } = req.body;
      if (!title || !targetUserId || !language) {
        return res.status(400).json({ error: "title, targetUserId, and language are required" });
      }
      
      const story = await storage.createStory({
        title,
        targetUserId,
        language,
        status: 'draft',
        pageCount: 0,
      });
      
      res.json(story);
    } catch (error) {
      console.error("Error creating story:", error);
      res.status(500).json({ error: "Failed to create story" });
    }
  });

  // Update a story
  app.patch("/api/admin/stories/:storyId", requireAdminAuth, async (req, res) => {
    try {
      const { storyId } = req.params;
      const updates = req.body;
      const story = await storage.updateStory(storyId, updates);
      if (!story) {
        return res.status(404).json({ error: "Story not found" });
      }
      res.json(story);
    } catch (error) {
      console.error("Error updating story:", error);
      res.status(500).json({ error: "Failed to update story" });
    }
  });

  // Delete a story
  app.delete("/api/admin/stories/:storyId", requireAdminAuth, async (req, res) => {
    try {
      const { storyId } = req.params;
      await storage.deleteStory(storyId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting story:", error);
      res.status(500).json({ error: "Failed to delete story" });
    }
  });

  // Publish a story
  app.post("/api/admin/stories/:storyId/publish", requireAdminAuth, async (req, res) => {
    try {
      const { storyId } = req.params;
      const story = await storage.publishStory(storyId);
      if (!story) {
        return res.status(404).json({ error: "Story not found" });
      }
      res.json(story);
    } catch (error) {
      console.error("Error publishing story:", error);
      res.status(500).json({ error: "Failed to publish story" });
    }
  });

  // Add a page to a story
  app.post("/api/admin/stories/:storyId/pages", requireAdminAuth, async (req, res) => {
    try {
      const { storyId } = req.params;
      const { sentence, englishTranslation, pageNumber } = req.body;
      
      if (!sentence || typeof pageNumber !== 'number') {
        return res.status(400).json({ error: "sentence and pageNumber are required" });
      }
      
      const page = await storage.createStoryPage({
        storyId,
        pageNumber,
        sentence,
        englishTranslation: englishTranslation || null,
      });
      
      res.json(page);
    } catch (error) {
      console.error("Error creating story page:", error);
      res.status(500).json({ error: "Failed to create page" });
    }
  });

  // Update a story page
  app.patch("/api/admin/stories/pages/:pageId", requireAdminAuth, async (req, res) => {
    try {
      const { pageId } = req.params;
      const updates = req.body;
      const page = await storage.updateStoryPage(pageId, updates);
      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }
      res.json(page);
    } catch (error) {
      console.error("Error updating story page:", error);
      res.status(500).json({ error: "Failed to update page" });
    }
  });

  // Delete a story page
  app.delete("/api/admin/stories/pages/:pageId", requireAdminAuth, async (req, res) => {
    try {
      const { pageId } = req.params;
      await storage.deleteStoryPage(pageId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting story page:", error);
      res.status(500).json({ error: "Failed to delete page" });
    }
  });

  // Generate image for a story page
  app.post("/api/admin/stories/pages/:pageId/generate-image", requireAdminAuth, async (req, res) => {
    try {
      const { pageId } = req.params;
      const { prompt } = req.body;
      
      // Use the prompt provided or generate a default one
      const imagePrompt = prompt || "Simple children's book illustration, friendly cartoon style, white background";
      
      const base64Data = await generateGeminiImage(imagePrompt);
      const imageUrl = await saveImageFromBase64(`story-page-${pageId}`, base64Data);
      
      await storage.updateStoryPage(pageId, { imageUrl });
      
      res.json({ imageUrl });
    } catch (error) {
      console.error("Error generating story page image:", error);
      res.status(500).json({ error: "Failed to generate image" });
    }
  });

  // Add a quiz question to a story
  app.post("/api/admin/stories/:storyId/quizzes", requireAdminAuth, async (req, res) => {
    try {
      const { storyId } = req.params;
      const { questionNumber, question, correctAnswer, wrongOption1, wrongOption2 } = req.body;
      
      if (!question || !correctAnswer || !wrongOption1 || !wrongOption2 || typeof questionNumber !== 'number') {
        return res.status(400).json({ error: "questionNumber, question, correctAnswer, wrongOption1, and wrongOption2 are required" });
      }
      
      const quiz = await storage.createStoryQuiz({
        storyId,
        questionNumber,
        question,
        correctAnswer,
        wrongOption1,
        wrongOption2,
      });
      
      res.json(quiz);
    } catch (error) {
      console.error("Error creating story quiz:", error);
      res.status(500).json({ error: "Failed to create quiz" });
    }
  });

  // Update a quiz question
  app.patch("/api/admin/stories/quizzes/:quizId", requireAdminAuth, async (req, res) => {
    try {
      const { quizId } = req.params;
      const updates = req.body;
      const quiz = await storage.updateStoryQuiz(quizId, updates);
      if (!quiz) {
        return res.status(404).json({ error: "Quiz not found" });
      }
      res.json(quiz);
    } catch (error) {
      console.error("Error updating story quiz:", error);
      res.status(500).json({ error: "Failed to update quiz" });
    }
  });

  // Delete a quiz question
  app.delete("/api/admin/stories/quizzes/:quizId", requireAdminAuth, async (req, res) => {
    try {
      const { quizId } = req.params;
      await storage.deleteStoryQuiz(quizId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting story quiz:", error);
      res.status(500).json({ error: "Failed to delete quiz" });
    }
  });

  // Generate a complete story using AI based on user's vocabulary
  app.post("/api/admin/stories/generate", requireAdminAuth, async (req, res) => {
    try {
      const { userId, theme } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Get user's learned vocabulary
      const allProgress = await storage.getAllLearningProgress(userId);
      const learnedWordIds = allProgress.filter(p => p.isLearned).map(p => p.wordId);
      const allVocab = await storage.getAllVocabulary(user.language as Language);
      const learnedWords = allVocab.filter(w => learnedWordIds.includes(w.id));
      
      if (learnedWords.length < 10) {
        return res.status(400).json({ error: "User needs at least 10 learned words to generate a story" });
      }
      
      // Create word list for the AI prompt
      const wordList = learnedWords.slice(0, 50).map(w => `${w.targetWord} (${w.english})`).join(', ');
      const languageName = user.language === 'russian' ? 'Russian' : 'Spanish';
      const storyTheme = theme || 'a fun adventure';
      
      // Use OpenAI to generate the story
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a children's story writer creating simple stories for 6-year-olds learning ${languageName}. 
Write stories using ONLY the provided vocabulary words. Keep sentences very short (2-7 words each).
Use simple, clear language. Make stories fun and educational.
Return a JSON object with this exact structure:
{
  "title": "Story title in ${languageName}",
  "pages": [
    { "sentence": "Single sentence in ${languageName}", "englishTranslation": "English translation", "imagePrompt": "Simple description for illustration" }
  ],
  "quizzes": [
    { "question": "Question in English about the story", "correctAnswer": "Correct answer in ${languageName}", "wrongOption1": "Wrong answer in ${languageName}", "wrongOption2": "Wrong answer in ${languageName}" }
  ]
}`
          },
          {
            role: "user",
            content: `Create a ${languageName} story about ${storyTheme} for a 6-year-old.
Use ONLY these vocabulary words: ${wordList}
The story should have 8-12 pages with one short sentence each (2-7 words).
Include 3-5 comprehension quiz questions at the end.
Make it fun and engaging!`
          }
        ],
        response_format: { type: "json_object" },
      });
      
      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No content in AI response");
      }
      
      const storyData = JSON.parse(content);
      
      // Create the story in the database
      const story = await storage.createStory({
        title: storyData.title,
        targetUserId: userId,
        language: user.language,
        status: 'draft',
        pageCount: storyData.pages.length,
      });
      
      // Create pages
      for (let i = 0; i < storyData.pages.length; i++) {
        const pageData = storyData.pages[i];
        await storage.createStoryPage({
          storyId: story.id,
          pageNumber: i + 1,
          sentence: pageData.sentence,
          englishTranslation: pageData.englishTranslation,
        });
      }
      
      // Create quizzes
      for (let i = 0; i < storyData.quizzes.length; i++) {
        const quizData = storyData.quizzes[i];
        await storage.createStoryQuiz({
          storyId: story.id,
          questionNumber: i + 1,
          question: quizData.question,
          correctAnswer: quizData.correctAnswer,
          wrongOption1: quizData.wrongOption1,
          wrongOption2: quizData.wrongOption2,
        });
      }
      
      // Fetch the complete story with pages and quizzes
      const pages = await storage.getStoryPages(story.id);
      const quizzes = await storage.getStoryQuizzes(story.id);
      
      res.json({ ...story, pages, quizzes, imagePrompts: storyData.pages.map((p: any) => p.imagePrompt) });
    } catch (error) {
      console.error("Error generating story:", error);
      res.status(500).json({ error: "Failed to generate story" });
    }
  });

  return httpServer;
}
