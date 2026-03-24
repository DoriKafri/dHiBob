"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { DollarSign, TrendingUp, Users, Target } from "lucide-react";

export default function CompensationPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Compensation</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Avg Salary" value="$95K" icon={<DollarSign size={20} />} />
        <StatCard title="Median Compa-Ratio" value="1.02" icon={<Target size={20} />} />
        <StatCard title="Budget Used" value="87%" icon={<TrendingUp size={20} />} />
        <StatCard title="Equity Grants" value={42} icon={<Users size={20} />} />
      </div>
      <Card><CardHeader><CardTitle>Salary Bands</CardTitle></CardHeader><CardContent className="h-64 flex items-center justify-center text-gray-400">Compensation band chart placeholder</CardContent></Card>
    </div>
  );
}
