"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { Calendar, Plus, Clock, CheckCircle, XCircle } from "lucide-react";

const balances = [{ type: "Vacation", used: 5, total: 20 }, { type: "Sick Leave", used: 2, total: 10 }, { type: "Personal", used: 1, total: 5 }];
const requests = [
  { id: 1, type: "Vacation", startDate: "Apr 1", endDate: "Apr 5", days: 5, status: "Approved", reason: "Family trip" },
  { id: 2, type: "Sick Leave", startDate: "Mar 15", endDate: "Mar 15", days: 1, status: "Approved", reason: "Doctor appointment" },
  { id: 3, type: "Vacation", startDate: "May 20", endDate: "May 23", days: 4, status: "Pending", reason: "Conference travel" },
];

export default function TimeOffPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Time Off</h1><Button><Plus size={16} className="mr-2" />Request Time Off</Button></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {balances.map(b => <Card key={b.type}><CardContent className="p-6"><p className="text-sm text-gray-500">{b.type}</p><div className="mt-2 flex items-baseline gap-2"><span className="text-3xl font-bold">{b.total - b.used}</span><span className="text-sm text-gray-400">of {b.total} days remaining</span></div><div className="mt-3 h-2 bg-gray-100 rounded-full"><div className="h-2 bg-primary-500 rounded-full" style={{ width: (b.used / b.total * 100) + "%" }} /></div></CardContent></Card>)}
      </div>
      <Card><CardHeader><CardTitle>Recent Requests</CardTitle></CardHeader><CardContent><div className="space-y-4">{requests.map(r => <div key={r.id} className="flex items-center justify-between p-3 border rounded-lg"><div className="flex items-center gap-3"><Calendar size={20} className="text-gray-400" /><div><p className="font-medium">{r.type}: {r.startDate} - {r.endDate}</p><p className="text-sm text-gray-500">{r.reason} · {r.days} day(s)</p></div></div><Badge variant={r.status === "Approved" ? "success" : r.status === "Pending" ? "warning" : "destructive"}>{r.status}</Badge></div>)}</div></CardContent></Card>
    </div>
  );
}
