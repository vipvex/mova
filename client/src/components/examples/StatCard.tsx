import StatCard from '../StatCard';
import { Star } from 'lucide-react';

export default function StatCardExample() {
  return <StatCard value={42} label="Words Learned" icon={Star} iconColor="text-amber-500" />;
}
