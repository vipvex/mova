# Multi-Language Learning App

## Overview

A child-friendly language learning application designed for 6-year-olds. The app supports **Russian** and **Spanish** vocabulary learning (user-selectable at login). It teaches vocabulary through flashcards with AI-generated images and audio, using spaced repetition (SM-2 algorithm) to optimize learning retention. The interface follows educational design patterns inspired by apps like Duolingo Kids, with large touch targets, encouraging feedback, and simplified navigation.

## User Preferences

Preferred communication style: Simple, everyday language.

## Multi-Language Support

### Language Selection
- Users select their target language (Russian or Spanish) at account creation
- Each user has independent learning progress for their selected language
- Vocabulary is filtered by language throughout the application

### Language-Specific Features
- **Vocabulary**: Separate word sets for Russian (Cyrillic) and Spanish (Latin characters)
- **Voice Recognition**: OpenAI Whisper configured for the target language (ru/es)
- **Audio Pronunciation**: ElevenLabs text-to-speech with multilingual v2 model for natural voice audio
- **Admin Panel**: Filters vocabulary by the logged-in user's selected language

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state, React useState for local state
- **User Context**: UserContext for managing current user and language across components
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Build Tool**: Vite with React plugin
- **Font**: Nunito (Google Fonts) - child-friendly, rounded typeface

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Pattern**: RESTful JSON API under `/api/*` prefix with user-scoped endpoints (`/api/users/:userId/...`)
- **External AI Services**: 
  - ElevenLabs for text-to-speech audio generation (supports Russian and Spanish)
  - OpenAI Whisper for voice recognition (supports Russian and Spanish)
  - Google Gemini 2.5 Flash Image for vocabulary flashcard image generation (via Replit AI Integrations)
- **Session Storage**: In-memory storage with PostgreSQL-ready schema

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Validation**: Zod schemas generated from Drizzle schemas via drizzle-zod
- **Current Storage**: PostgreSQL database via DatabaseStorage class (persistent across restarts)

### Core Data Models
1. **Users** - Username with language preference (russian/spanish)
2. **Vocabulary** - targetWord/English pairs with language field, images, audio, frequency rank, category
3. **LearningProgress** - SM-2 spaced repetition tracking (ease factor, interval, repetitions, review dates), user-specific
4. **SessionStats** - Daily learning statistics and streak tracking, user-specific
5. **GrammarExercises** - Grammar practice exercises with name, description, category, difficulty per language
6. **GrammarProgress** - User-specific practice count and last practiced timestamp per exercise
7. **Stories** - Personalized stories with title, target user, language, status (draft/published), page count, cover image
8. **StoryPages** - Individual story pages with page number, sentence (in target language), English translation, illustration, audio
9. **StoryQuizzes** - Comprehension quizzes with question, correct answer, and wrong options
10. **UserStoryProgress** - Tracks user's progress through stories (current page, completion status, quiz score)

### Spaced Repetition System
- Implements SM-2 algorithm for optimal review scheduling
- Quality ratings 0-5 mapped to "Still Learning" and "I Know It" buttons
- Tracks ease factor, interval, and repetition count per word per user

### Key Application Features
- Multi-user login with language selection (Russian/Spanish)
- Dashboard with learning statistics and streak tracking
- Learn mode for new vocabulary introduction
- Review mode with voice recognition (auto-stop after 3 seconds)
- Flashcards with target word, English translation, AI-generated images
- Audio pronunciation via text-to-speech with language-specific confirmation
- Gamified 10x10 star grid to track progress
- Grammar practice menu with 15+ exercises per language (pronouns, verbs, nouns, etc.)
- Personal Pronouns game with two-level gameplay:
  - Level 1 (Recognition): Listen to audio, tap the correct cartoon character
  - Level 2 (Production): See the image, speak the pronoun using voice recognition
  - 7 pronouns per language with unique cartoon character images
  - Auto-stop recording after 3 seconds
  - Progress tracking and score display
- Admin panel with password protection filtering by user's language
- **Story Mode**: Personalized reading stories using only vocabulary the child has learned
  - Story library showing available stories with cover images and progress
  - Story Reader with illustrated pages, TTS narration, and voice repetition practice
  - Voice matching requires 80%+ accuracy (bag-of-words Jaccard similarity) to advance
  - Comprehension quizzes at the end of each story
  - Progress tracking (current page, completion status, quiz scores)
- **Admin Story Designer**:
  - Create stories manually with page-by-page content
  - Generate stories with AI using child's learned vocabulary (requires 10+ learned words)
  - **Preview Workflow**: Two-step story generation process:
    1. Generate preview showing: English narrative (adult-level) + chunked target language pages
    2. Review and confirm before saving to database
    3. Option to regenerate if unsatisfied
  - **Grammar Words**: Stories use connecting words (в, на, с, к for Russian; en, a, con, de for Spanish) for implicit grammar learning, even if not explicitly learned
  - Generate illustrations for pages using Gemini AI
  - Publish/unpublish stories for users
  - Manage quizzes for comprehension testing

## External Dependencies

### AI Services
- **ElevenLabs API** (`ELEVENLABS_API_KEY` environment variable) - Text-to-speech for pronunciation using multilingual v2 model with Rachel voice
- **OpenAI API** (`OPENAI_API_KEY` environment variable) - Whisper for voice recognition
- **Google Gemini** (via Replit AI Integrations) - Image generation using gemini-2.5-flash-image model, no API key needed, charges billed to Replit credits

### Database
- **PostgreSQL** (`DATABASE_URL` environment variable) - Primary data store configured via Drizzle ORM
- **connect-pg-simple** - Session storage for Express

### UI Component Libraries
- **@radix-ui** - Headless UI primitives (dialogs, tooltips, accordions, etc.)
- **shadcn/ui** - Pre-styled component collection built on Radix
- **lucide-react** - Icon library
- **embla-carousel-react** - Carousel component
- **framer-motion** - Animations for star unlocking

### Build & Development
- **Vite** - Frontend bundler with HMR
- **esbuild** - Server bundling for production
- **tsx** - TypeScript execution for development
- **Replit plugins** - Error overlay, cartographer, dev banner for Replit environment

## Security

- Admin panel protected by password (stored in `ADMIN_PASSWORD` environment variable)
- Session secret for Express sessions (stored in `SESSION_SECRET` environment variable)
