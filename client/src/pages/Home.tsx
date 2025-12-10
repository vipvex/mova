import { useState, useCallback } from "react";
import Dashboard from "@/components/Dashboard";
import PracticeSession, { Word } from "@/components/PracticeSession";

import appleImage from '@assets/generated_images/cartoon_apple_for_flashcard.png';
import sunImage from '@assets/generated_images/cartoon_sun_for_flashcard.png';
import catImage from '@assets/generated_images/cartoon_cat_for_flashcard.png';
import houseImage from '@assets/generated_images/cartoon_house_for_flashcard.png';
import dogImage from '@assets/generated_images/cartoon_dog_for_flashcard.png';

// todo: remove mock functionality - this will be replaced with real vocabulary data from Russian frequency dictionary
const mockVocabulary: Word[] = [
  { id: '1', russian: 'Яблоко', english: 'Apple', imageUrl: appleImage },
  { id: '2', russian: 'Солнце', english: 'Sun', imageUrl: sunImage },
  { id: '3', russian: 'Кошка', english: 'Cat', imageUrl: catImage },
  { id: '4', russian: 'Дом', english: 'House', imageUrl: houseImage },
  { id: '5', russian: 'Собака', english: 'Dog', imageUrl: dogImage },
];

// todo: remove mock functionality - this will be persisted via API
const initialStats = {
  wordsToday: 0,
  totalWords: 5,
  streak: 3,
  nextReviewMinutes: 0,
};

type View = 'dashboard' | 'practice';

export default function Home() {
  const [view, setView] = useState<View>('dashboard');
  const [stats, setStats] = useState(initialStats);

  const handleStartPractice = useCallback(() => {
    setView('practice');
  }, []);

  const handleBackToDashboard = useCallback(() => {
    setView('dashboard');
  }, []);

  const handlePlayAudio = useCallback((word: Word) => {
    // todo: remove mock functionality - this will use OpenAI TTS API
    console.log('Playing audio for:', word.russian);
    
    // Use browser's speech synthesis as a placeholder
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(word.russian);
      utterance.lang = 'ru-RU';
      utterance.rate = 0.8;
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  const handleSessionComplete = useCallback((known: number, reviewed: number) => {
    // todo: remove mock functionality - this will update via API with spaced repetition algorithm
    setStats(prev => ({
      ...prev,
      wordsToday: prev.wordsToday + reviewed,
      totalWords: prev.totalWords + known,
    }));
  }, []);

  if (view === 'practice') {
    return (
      <PracticeSession
        words={mockVocabulary}
        streak={stats.streak}
        totalWordsLearned={stats.totalWords}
        onBack={handleBackToDashboard}
        onPlayAudio={handlePlayAudio}
        onComplete={handleSessionComplete}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background py-8">
      <Dashboard
        wordsToday={stats.wordsToday}
        totalWords={stats.totalWords}
        streak={stats.streak}
        nextReviewMinutes={stats.nextReviewMinutes}
        onStartPractice={handleStartPractice}
      />
    </div>
  );
}
