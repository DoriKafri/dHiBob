"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Users, TrendingUp, Clock, Target } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Headcount" value={247} change={3.2} icon={<Users size={20} />} />
        <StatCard title="Turnover Rate" value="8.2%" change={-1.5} icon={<TrendingUp size={20} />} />
        <StatCard title="Avg Tenure" value="2.4y" icon={<Clock size={20} />} />
        <StatCard title="eNPS Score" value={42} change={5} icon={<Target size={20} />} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle>Headcount by Department</CardTitle></CardHeader><CardContent className="h-64 flex items-center justify-center text-gray-400">Recharts bar chart placeholder</CardContent></Card>
        <Card><CardHeader><CardTitle>Turnover Trend</CardTitle></CardHeader><CardContent className="h-64 flex items-center justify-center text-gray-400">Recharts line chart placeholder</CardContent></Card>
        <Card><CardHeader><CardTitle>Gender Distribution</CardTitle></CardHeader><CardContent className="h-64 flex items-center justify-center text-gray-400">Recharts pie chart placeholder</CardContent></Card>
        <Card><CardHeader><CardTitle>Time to Hire Trend</CardTitle></CardHeader><CardContent className="h-64 flex items-center justify-center text-gray-400">Recharts area chart placeholder</CardContent></Card>
      </div>
    </div>
  );
}
