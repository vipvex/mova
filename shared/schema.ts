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
  partOfSpeech: text("part_of_speech"),
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

// Grammar exercises table
export const grammarExercises = pgTable("grammar_exercises", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull(),
  language: text("language").notNull(),
  category: text("category").notNull(),
  difficulty: integer("difficulty").notNull().default(1),
  displayOrder: integer("display_order").notNull().default(0),
});

export const insertGrammarExerciseSchema = createInsertSchema(grammarExercises).omit({
  id: true,
});

export type InsertGrammarExercise = z.infer<typeof insertGrammarExerciseSchema>;
export type GrammarExercise = typeof grammarExercises.$inferSelect;

// Grammar practice progress table
export const grammarProgress = pgTable("grammar_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  exerciseId: varchar("exercise_id").notNull(),
  practiceCount: integer("practice_count").notNull().default(0),
  lastPracticedAt: timestamp("last_practiced_at"),
  bestScore: integer("best_score").default(0),
});

export const insertGrammarProgressSchema = createInsertSchema(grammarProgress).omit({
  id: true,
});

export type InsertGrammarProgress = z.infer<typeof insertGrammarProgressSchema>;
export type GrammarProgress = typeof grammarProgress.$inferSelect;

// Stories table - personalized stories for each user
export const stories = pgTable("stories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  coverImageUrl: text("cover_image_url"),
  language: text("language").notNull(),
  targetUserId: varchar("target_user_id").notNull(),
  status: text("status").notNull().default("draft"),
  pageCount: integer("page_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  publishedAt: timestamp("published_at"),
});

export const insertStorySchema = createInsertSchema(stories).omit({
  id: true,
  createdAt: true,
});

export type InsertStory = z.infer<typeof insertStorySchema>;
export type Story = typeof stories.$inferSelect;

// Story pages - individual pages in a story
export const storyPages = pgTable("story_pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  storyId: varchar("story_id").notNull(),
  pageNumber: integer("page_number").notNull(),
  sentence: text("sentence").notNull(),
  englishTranslation: text("english_translation"),
  imageUrl: text("image_url"),
  audioUrl: text("audio_url"),
});

export const insertStoryPageSchema = createInsertSchema(storyPages).omit({
  id: true,
});

export type InsertStoryPage = z.infer<typeof insertStoryPageSchema>;
export type StoryPage = typeof storyPages.$inferSelect;

// Story quizzes - comprehension questions at the end
export const storyQuizzes = pgTable("story_quizzes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  storyId: varchar("story_id").notNull(),
  questionNumber: integer("question_number").notNull(),
  question: text("question").notNull(),
  correctAnswer: text("correct_answer").notNull(),
  wrongOption1: text("wrong_option_1").notNull(),
  wrongOption2: text("wrong_option_2").notNull(),
  questionImageUrl: text("question_image_url"),
});

export const insertStoryQuizSchema = createInsertSchema(storyQuizzes).omit({
  id: true,
});

export type InsertStoryQuiz = z.infer<typeof insertStoryQuizSchema>;
export type StoryQuiz = typeof storyQuizzes.$inferSelect;

// User story progress - tracking completion
export const userStoryProgress = pgTable("user_story_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  storyId: varchar("story_id").notNull(),
  currentPage: integer("current_page").notNull().default(0),
  isCompleted: boolean("is_completed").default(false),
  quizScore: integer("quiz_score"),
  completedAt: timestamp("completed_at"),
  startedAt: timestamp("started_at").defaultNow(),
});

export const insertUserStoryProgressSchema = createInsertSchema(userStoryProgress).omit({
  id: true,
  startedAt: true,
});

export type InsertUserStoryProgress = z.infer<typeof insertUserStoryProgressSchema>;
export type UserStoryProgress = typeof userStoryProgress.$inferSelect;
