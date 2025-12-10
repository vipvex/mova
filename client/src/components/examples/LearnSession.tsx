import LearnSession from '../LearnSession';
import { VocabularyWord } from '@/lib/api';

const mockWords: VocabularyWord[] = [
  { id: '1', russian: 'Яблоко', english: 'Apple', imageUrl: null, audioUrl: null, frequencyRank: 1, category: 'food' },
  { id: '2', russian: 'Солнце', english: 'Sun', imageUrl: null, audioUrl: null, frequencyRank: 2, category: 'nature' },
  { id: '3', russian: 'Кошка', english: 'Cat', imageUrl: null, audioUrl: null, frequencyRank: 3, category: 'animals' },
];

export default function LearnSessionExample() {
  return (
    <LearnSession
      words={mockWords}
      streak={5}
      onBack={() => console.log('Back clicked')}
      onComplete={(count) => console.log(`Learned ${count} words`)}
    />
  );
}
