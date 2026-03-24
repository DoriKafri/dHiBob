"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Users, Calendar, FileText } from "lucide-react";

export default function PayrollPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Payroll</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total Payroll" value="$1.2M" icon={<DollarSign size={20} />} />
        <StatCard title="Employees" value={247} icon={<Users size={20} />} />
        <StatCard title="Next Run" value="Apr 1" icon={<Calendar size={20} />} />
        <StatCard title="Pending Reviews" value={3} icon={<FileText size={20} />} />
      </div>
      <Card><CardHeader><CardTitle>Recent Pay Runs</CardTitle></CardHeader><CardContent><div className="space-y-3">{[{period: "Mar 1-15", amount: "$580,000", status: "Completed", date: "Mar 15"}, {period: "Feb 16-28", amount: "$565,000", status: "Completed", date: "Feb 28"}, {period: "Feb 1-15", amount: "$572,000", status: "Completed", date: "Feb 15"}].map(p => <div key={p.period} className="flex items-center justify-between p-3 border rounded-lg"><div><p className="font-medium">Pay Period: {p.period}</p><p className="text-sm text-gray-500">Processed {p.date}</p></div><div className="text-right"><p className="font-bold">{p.amount}</p><Badge variant="success">{p.status}</Badge></div></div>)}</div></CardContent></Card>
    </div>
  );
}
