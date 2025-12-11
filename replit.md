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
- **Audio Pronunciation**: Text-to-speech with language-appropriate confirmation messages
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
  - OpenAI for text-to-speech audio generation (supports Russian and Spanish)
  - OpenAI Whisper for voice recognition (supports Russian and Spanish)
  - DALL-E image generation for vocabulary flashcards
- **Session Storage**: In-memory storage with PostgreSQL-ready schema

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Validation**: Zod schemas generated from Drizzle schemas via drizzle-zod
- **Current Storage**: In-memory storage class (`MemStorage`) with interface for easy database swap

### Core Data Models
1. **Users** - Username with language preference (russian/spanish)
2. **Vocabulary** - targetWord/English pairs with language field, images, audio, frequency rank, category
3. **LearningProgress** - SM-2 spaced repetition tracking (ease factor, interval, repetitions, review dates), user-specific
4. **SessionStats** - Daily learning statistics and streak tracking, user-specific
5. **GrammarExercises** - Grammar practice exercises with name, description, category, difficulty per language
6. **GrammarProgress** - User-specific practice count and last practiced timestamp per exercise

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
- Admin panel with password protection filtering by user's language

## External Dependencies

### AI Services
- **OpenAI API** (`OPENAI_API_KEY` environment variable) - Text-to-speech for pronunciation, Whisper for voice recognition, DALL-E for image generation

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
