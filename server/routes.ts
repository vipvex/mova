import type { Express } from "express";
import { createServer, type Server } from "http";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { calculateSM2, mapButtonToQuality, getInitialProgress } from "./spacedRepetition";
import OpenAI from "openai";
import { z } from "zod";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Get all vocabulary
  app.get("/api/vocabulary", async (req, res) => {
    try {
      const vocabulary = await storage.getAllVocabulary();
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
      const vocabulary = await storage.getVocabularyByCategory(category);
      res.json(vocabulary);
    } catch (error) {
      console.error("Error fetching vocabulary by category:", error);
      res.status(500).json({ error: "Failed to fetch vocabulary" });
    }
  });

  // Get level info (current level, words learned, all words with status)
  app.get("/api/level", async (req, res) => {
    try {
      const levelInfo = await storage.getLevelInfo();
      res.json(levelInfo);
    } catch (error) {
      console.error("Error fetching level info:", error);
      res.status(500).json({ error: "Failed to fetch level info" });
    }
  });

  // Get words to learn (not yet learned)
  app.get("/api/words/learn", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      const words = await storage.getWordsToLearn(limit);
      res.json(words);
    } catch (error) {
      console.error("Error fetching words to learn:", error);
      res.status(500).json({ error: "Failed to fetch words to learn" });
    }
  });

  // Get words due for review
  app.get("/api/words/review", async (req, res) => {
    try {
      const words = await storage.getWordsToReview();
      res.json(words);
    } catch (error) {
      console.error("Error fetching words to review:", error);
      res.status(500).json({ error: "Failed to fetch words to review" });
    }
  });

  // Mark word as learned (first time learning)
  app.post("/api/words/:wordId/learn", async (req, res) => {
    try {
      const { wordId } = req.params;
      
      // Check if word exists
      const word = await storage.getVocabularyById(wordId);
      if (!word) {
        return res.status(404).json({ error: "Word not found" });
      }

      // Check if progress already exists
      let progress = await storage.getLearningProgress(wordId);
      
      if (!progress) {
        const initial = getInitialProgress();
        progress = await storage.createLearningProgress({
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

      // Update today's stats
      const stats = await storage.getOrCreateTodayStats();
      await storage.updateTodayStats({
        wordsLearned: (stats.wordsLearned ?? 0) + 1,
      });

      res.json({ success: true, progress });
    } catch (error) {
      console.error("Error marking word as learned:", error);
      res.status(500).json({ error: "Failed to mark word as learned" });
    }
  });

  // Review a word (spaced repetition update)
  const reviewSchema = z.object({
    knowsIt: z.boolean(),
  });

  app.post("/api/words/:wordId/review", async (req, res) => {
    try {
      const { wordId } = req.params;
      const parsed = reviewSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      const { knowsIt } = parsed.data;
      
      // Get current progress
      const progress = await storage.getLearningProgress(wordId);
      if (!progress) {
        return res.status(404).json({ error: "Word not in learning progress" });
      }

      // Calculate new SM-2 values
      const quality = mapButtonToQuality(knowsIt);
      const sm2Result = calculateSM2(
        quality,
        progress.easeFactor ?? 250,
        progress.interval ?? 0,
        progress.repetitions ?? 0
      );

      // Update progress (increment review count)
      await storage.updateLearningProgress(progress.id, {
        easeFactor: sm2Result.easeFactor,
        interval: sm2Result.interval,
        repetitions: sm2Result.repetitions,
        nextReviewDate: sm2Result.nextReviewDate,
        lastReviewDate: new Date(),
        reviewCount: (progress.reviewCount ?? 0) + 1,
      });

      // Update today's stats
      const stats = await storage.getOrCreateTodayStats();
      await storage.updateTodayStats({
        wordsReviewed: (stats.wordsReviewed ?? 0) + 1,
      });

      res.json({ success: true, nextReview: sm2Result.nextReviewDate });
    } catch (error) {
      console.error("Error reviewing word:", error);
      res.status(500).json({ error: "Failed to review word" });
    }
  });

  // Get session stats
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getOrCreateTodayStats();
      const allProgress = await storage.getAllLearningProgress();
      const wordsToReview = await storage.getWordsToReview();
      const wordsToLearn = await storage.getWordsToLearn(100);
      
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

  // Speech-to-text transcription using Whisper API
  app.post("/api/transcribe", async (req, res) => {
    try {
      // Expect base64 audio data in the request body
      const { audioData, mimeType } = req.body;
      
      if (!audioData) {
        return res.status(400).json({ error: "No audio data provided" });
      }

      // Convert base64 to buffer
      const audioBuffer = Buffer.from(audioData, 'base64');
      
      // Create a File-like object for the OpenAI API
      const file = new File([audioBuffer], 'audio.webm', { 
        type: mimeType || 'audio/webm' 
      });

      // Transcribe using Whisper with Russian language
      const transcription = await openai.audio.transcriptions.create({
        model: "whisper-1",
        file: file,
        language: "ru", // Force Russian language
        response_format: "text",
      });

      res.json({ 
        text: transcription.trim(),
        success: true 
      });
    } catch (error) {
      console.error("Error transcribing audio:", error);
      res.status(500).json({ error: "Failed to transcribe audio" });
    }
  });

  // Generate TTS audio for a word
  app.post("/api/tts/:wordId", async (req, res) => {
    try {
      const { wordId } = req.params;
      
      const word = await storage.getVocabularyById(wordId);
      if (!word) {
        return res.status(404).json({ error: "Word not found" });
      }

      // Check if we already have audio cached
      if (word.audioUrl) {
        return res.json({ audioUrl: word.audioUrl });
      }

      // Generate audio using OpenAI TTS
      const mp3Response = await openai.audio.speech.create({
        model: "tts-1",
        voice: "nova", // Good for clear pronunciation
        input: word.russian,
        speed: 0.85, // Slightly slower for learning
      });

      // Convert to base64 data URL
      const buffer = Buffer.from(await mp3Response.arrayBuffer());
      const base64Audio = buffer.toString('base64');
      const audioUrl = `data:audio/mp3;base64,${base64Audio}`;

      // Cache the audio URL
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

      // Check if we already have an image cached
      if (word.imageUrl) {
        return res.json({ imageUrl: word.imageUrl });
      }

      // Get the default prompt and replace {word} placeholder
      const promptTemplate = await storage.getDefaultImagePrompt();
      const prompt = promptTemplate.replace(/{word}/g, word.english);

      // Generate image using DALL-E
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

      // Cache the image URL (note: DALL-E URLs expire, in production you'd want to store the image)
      await storage.updateVocabularyImage(wordId, imageUrl);

      res.json({ imageUrl });
    } catch (error) {
      console.error("Error generating image:", error);
      res.status(500).json({ error: "Failed to generate image" });
    }
  });

  // ==================== ADMIN ROUTES ====================

  // Simple admin session token (in production, use proper session management)
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

  // Verify admin password and get session token
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
        // Token expires after 1 hour
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

  // Get all words with learning status for admin
  app.get("/api/admin/words", requireAdminAuth, async (req, res) => {
    try {
      const vocabulary = await storage.getAllVocabulary();
      const allProgress = await storage.getAllLearningProgress();
      
      // Create a map of wordId to progress
      const progressMap = new Map(allProgress.map(p => [p.wordId, p]));
      
      const wordsWithStatus = vocabulary.map(word => {
        const progress = progressMap.get(word.id);
        return {
          ...word,
          isLearned: progress?.isLearned ?? false,
          learnedAt: progress?.learnedAt ?? null,
          lastReviewDate: progress?.lastReviewDate ?? null,
          reviewCount: progress?.reviewCount ?? 0,
          nextReviewDate: progress?.nextReviewDate ?? null,
          repetitions: progress?.repetitions ?? 0,
        };
      });

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
      
      // Get all vocabulary
      const allVocab = await storage.getAllVocabulary();
      const movingIds = new Set(wordIds);
      
      // Remove moving words from their current positions
      const remaining = allVocab.filter(v => !movingIds.has(v.id));
      
      // Get the words being moved (in the order specified)
      const movingWords = wordIds
        .map(id => allVocab.find(v => v.id === id))
        .filter(Boolean) as typeof allVocab;
      
      // Insert at target position
      const clampedIndex = Math.max(0, Math.min(targetIndex, remaining.length));
      const newOrder = [
        ...remaining.slice(0, clampedIndex),
        ...movingWords,
        ...remaining.slice(clampedIndex),
      ];
      
      // Update display orders for all words
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
      
      // Use custom prompt or default prompt with {word} replaced
      let prompt: string;
      if (customPrompt) {
        prompt = customPrompt;
      } else {
        const promptTemplate = await storage.getDefaultImagePrompt();
        prompt = promptTemplate.replace(/{word}/g, word.english);
      }

      // Generate new image using DALL-E
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

      // Update the image URL
      await storage.updateVocabularyImage(wordId, imageUrl);

      res.json({ imageUrl });
    } catch (error) {
      console.error("Error regenerating image:", error);
      res.status(500).json({ error: "Failed to regenerate image" });
    }
  });

  // Get words without images (for batch generation)
  app.get("/api/admin/words/no-images", requireAdminAuth, async (req, res) => {
    try {
      const vocabulary = await storage.getAllVocabulary();
      const wordsWithoutImages = vocabulary.filter(w => !w.imageUrl);
      res.json(wordsWithoutImages);
    } catch (error) {
      console.error("Error fetching words without images:", error);
      res.status(500).json({ error: "Failed to fetch words" });
    }
  });

  // Generate image for a specific word (admin, forces regeneration)
  app.post("/api/admin/words/:wordId/generate-image", requireAdminAuth, async (req, res) => {
    try {
      const { wordId } = req.params;
      
      const word = await storage.getVocabularyById(wordId);
      if (!word) {
        return res.status(404).json({ error: "Word not found" });
      }

      // Get the default prompt and replace {word} placeholder
      const promptTemplate = await storage.getDefaultImagePrompt();
      const prompt = promptTemplate.replace(/{word}/g, word.english);

      // Generate image using DALL-E
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

  // Get settings (including default image prompt)
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

  return httpServer;
}
