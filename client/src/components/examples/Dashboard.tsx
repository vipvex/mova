import Dashboard from '../Dashboard';

export default function DashboardExample() {
  return (
    <Dashboard
      wordsToday={3}
      totalWords={23}
      streak={5}
      wordsToReview={8}
      wordsToLearn={5}
      onStartLearn={() => console.log('Start learn clicked')}
      onStartReview={() => console.log('Start review clicked')}
    />
  );
}
