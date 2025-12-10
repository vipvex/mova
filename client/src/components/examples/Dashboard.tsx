import Dashboard from '../Dashboard';

export default function DashboardExample() {
  return (
    <Dashboard
      wordsToday={3}
      totalWords={23}
      streak={5}
      nextReviewMinutes={0}
      onStartPractice={() => console.log('Start practice clicked')}
    />
  );
}
