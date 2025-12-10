import LearnSession, { Word } from '../LearnSession';
import appleImage from '@assets/generated_images/cartoon_apple_for_flashcard.png';
import sunImage from '@assets/generated_images/cartoon_sun_for_flashcard.png';
import catImage from '@assets/generated_images/cartoon_cat_for_flashcard.png';

const mockWords: Word[] = [
  { id: '1', russian: 'Яблоко', english: 'Apple', imageUrl: appleImage },
  { id: '2', russian: 'Солнце', english: 'Sun', imageUrl: sunImage },
  { id: '3', russian: 'Кошка', english: 'Cat', imageUrl: catImage },
];

export default function LearnSessionExample() {
  return (
    <LearnSession
      words={mockWords}
      streak={5}
      onBack={() => console.log('Back clicked')}
      onPlayAudio={(word) => console.log('Playing audio for:', word.russian)}
      onComplete={(count) => console.log(`Learned ${count} words`)}
    />
  );
}
