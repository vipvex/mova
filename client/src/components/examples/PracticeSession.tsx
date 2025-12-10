import PracticeSession from '../PracticeSession';
import { VocabularyWord } from '@/lib/api';

const mockWords: VocabularyWord[] = [
  { id: '1', russian: 'Дом', english: 'House', imageUrl: null, audioUrl: null, frequencyRank: 1, category: 'home' },
  { id: '2', russian: 'Собака', english: 'Dog', imageUrl: null, audioUrl: null, frequencyRank: 2, category: 'animals' },
];

export default function PracticeSessionExample() {
  return (
    <PracticeSession
      words={mockWords}
      streak={5}
      totalWordsLearned={20}
      onBack={() => console.log('Back clicked')}
      onComplete={(known, reviewed) => console.log(`Session complete: ${known}/${reviewed}`)}
    />
  );
}
