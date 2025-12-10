import ActionButtons from '../ActionButtons';

export default function ActionButtonsExample() {
  return (
    <ActionButtons 
      onStillLearning={() => console.log('Still learning clicked')}
      onKnowIt={() => console.log('Know it clicked')}
    />
  );
}
