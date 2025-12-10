import Flashcard from '../Flashcard';

export default function FlashcardExample() {
  return (
    <Flashcard 
      russianWord="Яблоко"
      englishWord="Apple"
      imageUrl="https://placehold.co/400x400/E8E8E8/333333?text=Apple"
      onPlayAudio={() => console.log('Playing audio for Яблоко')}
    />
  );
}
