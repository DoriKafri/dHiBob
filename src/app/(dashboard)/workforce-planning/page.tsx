"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Users, TrendingUp, Target, Calendar } from "lucide-react";

export default function WorkforcePlanningPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Workforce Planning</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Current Headcount" value={247} icon={<Users size={20} />} />
        <StatCard title="Planned Hires Q2" value={15} icon={<TrendingUp size={20} />} />
        <StatCard title="Attrition Forecast" value="6%" icon={<Target size={20} />} />
        <StatCard title="Budget Remaining" value="$340K" icon={<Calendar size={20} />} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle>Headcount Forecast</CardTitle></CardHeader><CardContent className="h-64 flex items-center justify-center text-gray-400">Forecast chart placeholder</CardContent></Card>
        <Card><CardHeader><CardTitle>Department Growth Plan</CardTitle></CardHeader><CardContent className="h-64 flex items-center justify-center text-gray-400">Growth plan chart placeholder</CardContent></Card>
      </div>
    </div>
  );
}
