import Flashcard from '../Flashcard';
import appleImage from '@assets/generated_images/cartoon_apple_for_flashcard.png';

export default function FlashcardExample() {
  return (
    <Flashcard 
      russianWord="Яблоко"
      englishWord="Apple"
      imageUrl={appleImage}
      onPlayAudio={() => console.log('Playing audio for Яблоко')}
    />
  );
}
