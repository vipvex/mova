import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const languageEnum = z.enum(["russian", "spanish"]);
export type Language = z.infer<typeof languageEnum>;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  language: text("language").notNull().default("russian"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  language: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const vocabulary = pgTable("vocabulary", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  targetWord: text("target_word").notNull(),
  english: text("english").notNull(),
  language: text("language").notNull().default("russian"),
  imageUrl: text("image_url"),
  audioUrl: text("audio_url"),
  frequencyRank: integer("frequency_rank").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  category: text("category"),
});

export const insertVocabularySchema = createInsertSchema(vocabulary).omit({
  id: true,
});

export type InsertVocabulary = z.infer<typeof insertVocabularySchema>;
export type Vocabulary = typeof vocabulary.$inferSelect;

export const learningProgress = pgTable("learning_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  wordId: varchar("word_id").notNull().references(() => vocabulary.id),
  isLearned: boolean("is_learned").default(false),
  learnedAt: timestamp("learned_at"),
  reviewCount: integer("review_count").default(0),
  easeFactor: integer("ease_factor").default(250),
  interval: integer("interval").default(0),
  repetitions: integer("repetitions").default(0),
  nextReviewDate: timestamp("next_review_date"),
  lastReviewDate: timestamp("last_review_date"),
});

export const insertLearningProgressSchema = createInsertSchema(learningProgress).omit({
  id: true,
});

export type InsertLearningProgress = z.infer<typeof insertLearningProgressSchema>;
export type LearningProgress = typeof learningProgress.$inferSelect;

export const sessionStats = pgTable("session_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  date: text("date").notNull(),
  wordsLearned: integer("words_learned").default(0),
  wordsReviewed: integer("words_reviewed").default(0),
  streak: integer("streak").default(0),
});

export const insertSessionStatsSchema = createInsertSchema(sessionStats).omit({
  id: true,
});

export type InsertSessionStats = z.infer<typeof insertSessionStatsSchema>;
export type SessionStats = typeof sessionStats.$inferSelect;
