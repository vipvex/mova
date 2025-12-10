import ProgressHeader from '../ProgressHeader';

export default function ProgressHeaderExample() {
  return (
    <ProgressHeader 
      currentCard={3} 
      totalCards={10} 
      streak={5} 
      onBack={() => console.log('Back clicked')} 
    />
  );
}
