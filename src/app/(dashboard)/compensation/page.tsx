// src/app/(dashboard)/compensation/page.tsx
"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { DollarSign, TrendingUp, Users, Target } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function CompensationPage() {
  const { data: stats, isLoading } = trpc.compensation.getStats.useQuery();

  if (isLoading) return <div>Loading compensation data...</div>;
  if (!stats) return <div>No data available</div>;

  const formatCurrency = (val: number) => `$${Math.round(val / 1000)}K`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Compensation</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Avg Salary" value={formatCurrency(stats.avgSalary)} icon={<DollarSign size={20} />} />
        <StatCard title="Avg Compa-Ratio" value={stats.avgCompaRatio.toString()} icon={<Target size={20} />} />
        <StatCard title="Budget Used" value={`${stats.budgetUsed}%`} icon={<TrendingUp size={20} />} />
        <StatCard title="Equity Grants" value={stats.equityGrants} icon={<Users size={20} />} />
      </div>
      <Card>
        <CardHeader><CardTitle>Salary Bands</CardTitle></CardHeader>
        <CardContent className="h-64 flex items-center justify-center text-gray-400 border-t border-gray-100 dark:border-charcoal-700">
          Recharts Band Visualization Pending
        </CardContent>
      </Card>
    </div>
  );
}