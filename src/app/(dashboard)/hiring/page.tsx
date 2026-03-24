"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Briefcase, Plus, Users, Clock, CheckCircle } from "lucide-react";

const pipelineStages = ["Applied", "Screening", "Interview", "Offer", "Hired"];
const jobs = [
  { title: "Senior Frontend Engineer", department: "Engineering", location: "Remote", candidates: 24, status: "Active", posted: "2 weeks ago" },
  { title: "Product Designer", department: "Design", location: "NYC", candidates: 18, status: "Active", posted: "1 week ago" },
  { title: "Data Scientist", department: "Analytics", location: "SF", candidates: 31, status: "Active", posted: "3 days ago" },
];

const candidates = [
  { name: "Alice Brown", role: "Senior Frontend Engineer", stage: "Interview", rating: 4, applied: "Mar 10" },
  { name: "Bob Martinez", role: "Product Designer", stage: "Screening", rating: 3, applied: "Mar 15" },
  { name: "Carol White", role: "Data Scientist", stage: "Offer", rating: 5, applied: "Mar 5" },
];

export default function HiringPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Hiring</h1><Button><Plus size={16} className="mr-2" />Post Job</Button></div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Open Positions" value={8} icon={<Briefcase size={20} />} />
        <StatCard title="Total Candidates" value={73} change={12} icon={<Users size={20} />} />
        <StatCard title="Avg Time to Hire" value="23d" icon={<Clock size={20} />} />
        <StatCard title="Offers Accepted" value={3} icon={<CheckCircle size={20} />} />
      </div>
      <Card><CardHeader><CardTitle>Open Positions</CardTitle></CardHeader><CardContent><div className="space-y-3">{jobs.map(j => <div key={j.title} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"><div><p className="font-medium">{j.title}</p><p className="text-sm text-gray-500">{j.department} · {j.location} · {j.candidates} candidates</p></div><div className="flex items-center gap-2"><Badge variant="success">{j.status}</Badge><span className="text-xs text-gray-400">{j.posted}</span></div></div>)}</div></CardContent></Card>
      <Card><CardHeader><CardTitle>Pipeline</CardTitle></CardHeader><CardContent><div className="flex gap-4 overflow-x-auto pb-2">{pipelineStages.map(stage => <div key={stage} className="min-w-[200px] bg-gray-50 rounded-lg p-3"><h3 className="font-medium text-sm mb-3">{stage}</h3><div className="space-y-2">{candidates.filter(c => c.stage === stage).map(c => <div key={c.name} className="bg-white p-2 rounded border text-sm"><p className="font-medium">{c.name}</p><p className="text-gray-500 text-xs">{c.role}</p></div>)}</div></div>)}</div></CardContent></Card>
    </div>
  );
}
