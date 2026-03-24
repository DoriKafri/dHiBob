"use client";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserPlus, Calendar, TrendingUp, Gift, Clock } from "lucide-react";

const stats = [
  { title: "Total Employees", value: 247, change: 3.2, icon: <Users size={20} /> },
  { title: "New Hires (Month)", value: 12, change: 15, icon: <UserPlus size={20} /> },
  { title: "Open Positions", value: 8, change: -5, icon: <TrendingUp size={20} /> },
  { title: "Time Off Today", value: 5, icon: <Calendar size={20} /> },
];

const celebrations = [
  { name: "Sarah Chen", event: "Birthday", date: "Today", avatar: "SC" },
  { name: "Mike Johnson", event: "Work Anniversary (3 years)", date: "Tomorrow", avatar: "MJ" },
  { name: "Lisa Wang", event: "Birthday", date: "Mar 26", avatar: "LW" },
];

const announcements = [
  { title: "Q1 All-Hands Meeting", date: "Mar 28, 2026", description: "Join us for the quarterly review at 2:00 PM EST." },
  { title: "New Benefits Portal", date: "Mar 25, 2026", description: "Check out the updated benefits enrollment platform." },
  { title: "Office Closure", date: "Apr 1, 2026", description: "Office closed for spring holiday." },
];

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-gray-900">Welcome back, Jane!</h1><p className="text-gray-500">Here is what is happening in your organization today.</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">{stats.map(s => <StatCard key={s.title} {...s} />)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle className="text-lg flex items-center gap-2"><Gift size={20} className="text-primary-500" />Celebrations</CardTitle></CardHeader><CardContent><div className="space-y-4">{celebrations.map(c => <div key={c.name} className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-sm font-bold">{c.avatar}</div><div className="flex-1"><p className="font-medium">{c.name}</p><p className="text-sm text-gray-500">{c.event}</p></div><span className="text-sm text-gray-400">{c.date}</span></div>)}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-lg flex items-center gap-2"><Clock size={20} className="text-secondary-500" />Announcements</CardTitle></CardHeader><CardContent><div className="space-y-4">{announcements.map(a => <div key={a.title} className="border-l-2 border-secondary-500 pl-3"><p className="font-medium">{a.title}</p><p className="text-sm text-gray-500 mt-1">{a.description}</p><p className="text-xs text-gray-400 mt-1">{a.date}</p></div>)}</div></CardContent></Card>
      </div>
    </div>
  );
}
