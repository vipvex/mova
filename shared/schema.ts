import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Vocabulary words from Russian frequency dictionary
export const vocabulary = pgTable("vocabulary", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  russian: text("russian").notNull(),
  english: text("english").notNull(),
  imageUrl: text("image_url"),
  audioUrl: text("audio_url"),
  frequencyRank: integer("frequency_rank").notNull(),
  category: text("category"),
});

export const insertVocabularySchema = createInsertSchema(vocabulary).omit({
  id: true,
});

export type InsertVocabulary = z.infer<typeof insertVocabularySchema>;
export type Vocabulary = typeof vocabulary.$inferSelect;

// Learning progress for spaced repetition
export const learningProgress = pgTable("learning_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  wordId: varchar("word_id").notNull().references(() => vocabulary.id),
  isLearned: boolean("is_learned").default(false),
  // SM-2 algorithm fields
  easeFactor: integer("ease_factor").default(250), // stored as integer (2.5 * 100)
  interval: integer("interval").default(0), // days until next review
  repetitions: integer("repetitions").default(0),
  nextReviewDate: timestamp("next_review_date"),
  lastReviewDate: timestamp("last_review_date"),
});

export const insertLearningProgressSchema = createInsertSchema(learningProgress).omit({
  id: true,
});

export type InsertLearningProgress = z.infer<typeof insertLearningProgressSchema>;
export type LearningProgress = typeof learningProgress.$inferSelect;

// Session statistics
export const sessionStats = pgTable("session_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: text("date").notNull(), // YYYY-MM-DD format
  wordsLearned: integer("words_learned").default(0),
  wordsReviewed: integer("words_reviewed").default(0),
  streak: integer("streak").default(0),
});

export const insertSessionStatsSchema = createInsertSchema(sessionStats).omit({
  id: true,
});

export type InsertSessionStats = z.infer<typeof insertSessionStatsSchema>;
export type SessionStats = typeof sessionStats.$inferSelect;
