import type { Express } from "express";
import { createServer, type Server } from "http";
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

      // Update progress
      await storage.updateLearningProgress(progress.id, {
        easeFactor: sm2Result.easeFactor,
        interval: sm2Result.interval,
        repetitions: sm2Result.repetitions,
        nextReviewDate: sm2Result.nextReviewDate,
        lastReviewDate: new Date(),
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

      // Generate image using DALL-E
      const imageResponse = await openai.images.generate({
        model: "dall-e-3",
        prompt: `Simple, bright cartoon illustration of ${word.english}, child-friendly educational style, flat design, pastel background, clean lines, suitable for 6-year-old children learning vocabulary. No text or letters in the image.`,
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

  return httpServer;
}
