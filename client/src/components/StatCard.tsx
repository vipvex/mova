import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  value: string | number;
  label: string;
  icon: LucideIcon;
  iconColor?: string;
}

export default function StatCard({ value, label, icon: Icon, iconColor = "text-primary" }: StatCardProps) {
  return (
    <Card className="p-6 flex flex-col items-center gap-2" data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <Icon className={`w-8 h-8 ${iconColor}`} />
      <span className="text-4xl font-bold">{value}</span>
      <span className="text-lg text-muted-foreground text-center">{label}</span>
    </Card>
  );
}
