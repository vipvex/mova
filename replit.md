# Russian Language Learning App

## Overview

A child-friendly Russian language learning application designed for 6-year-olds. The app teaches Russian vocabulary through flashcards with AI-generated images and audio, using spaced repetition (SM-2 algorithm) to optimize learning retention. The interface follows educational design patterns inspired by apps like Duolingo Kids, with large touch targets, encouraging feedback, and simplified navigation.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state, React useState for local state
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Build Tool**: Vite with React plugin
- **Font**: Nunito (Google Fonts) - child-friendly, rounded typeface

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Pattern**: RESTful JSON API under `/api/*` prefix
- **External AI Services**: 
  - OpenAI for text-to-speech audio generation
  - Image generation for vocabulary flashcards
- **Session Storage**: In-memory storage with PostgreSQL-ready schema

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Validation**: Zod schemas generated from Drizzle schemas via drizzle-zod
- **Current Storage**: In-memory storage class (`MemStorage`) with interface for easy database swap

### Core Data Models
1. **Users** - Basic authentication (username/password)
2. **Vocabulary** - Russian/English word pairs with images, audio, frequency rank, category
3. **LearningProgress** - SM-2 spaced repetition tracking (ease factor, interval, repetitions, review dates)
4. **SessionStats** - Daily learning statistics and streak tracking

### Spaced Repetition System
- Implements SM-2 algorithm for optimal review scheduling
- Quality ratings 0-5 mapped to "Still Learning" and "I Know It" buttons
- Tracks ease factor, interval, and repetition count per word

### Key Application Features
- Dashboard with learning statistics and streak tracking
- Learn mode for new vocabulary introduction
- Review mode for spaced repetition practice
- Flashcards with Russian word, English translation, AI-generated images
- Audio pronunciation via text-to-speech
- Admin panel with password protection for vocabulary management

## External Dependencies

### AI Services
- **OpenAI API** (`OPENAI_API_KEY` environment variable) - Text-to-speech for Russian pronunciation and image generation for flashcards

### Database
- **PostgreSQL** (`DATABASE_URL` environment variable) - Primary data store configured via Drizzle ORM
- **connect-pg-simple** - Session storage for Express

### UI Component Libraries
- **@radix-ui** - Headless UI primitives (dialogs, tooltips, accordions, etc.)
- **shadcn/ui** - Pre-styled component collection built on Radix
- **lucide-react** - Icon library
- **embla-carousel-react** - Carousel component
- **cmdk** - Command palette component

### Build & Development
- **Vite** - Frontend bundler with HMR
- **esbuild** - Server bundling for production
- **tsx** - TypeScript execution for development
- **Replit plugins** - Error overlay, cartographer, dev banner for Replit environment