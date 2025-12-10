import SessionComplete from '../SessionComplete';

export default function SessionCompleteExample() {
  return (
    <SessionComplete
      wordsReviewed={5}
      wordsKnown={4}
      totalWords={23}
      onPracticeMore={() => console.log('Practice more clicked')}
      onGoHome={() => console.log('Go home clicked')}
    />
  );
}
