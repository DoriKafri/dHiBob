"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, Plus, Grid3X3, List, Filter } from "lucide-react";

const employees = [
  { id: "1", name: "Sarah Chen", role: "Senior Engineer", department: "Engineering", status: "Active", avatar: "SC", email: "sarah@acme.tech", startDate: "2022-03-15" },
  { id: "2", name: "Mike Johnson", role: "Product Manager", department: "Product", status: "Active", avatar: "MJ", email: "mike@acme.tech", startDate: "2021-09-01" },
  { id: "3", name: "Lisa Wang", role: "UX Designer", department: "Design", status: "Active", avatar: "LW", email: "lisa@acme.tech", startDate: "2023-01-10" },
  { id: "4", name: "David Kim", role: "Data Analyst", department: "Analytics", status: "On Leave", avatar: "DK", email: "david@acme.tech", startDate: "2022-07-20" },
  { id: "5", name: "Emma Davis", role: "HR Specialist", department: "People", status: "Active", avatar: "ED", email: "emma@acme.tech", startDate: "2023-06-05" },
  { id: "6", name: "Alex Turner", role: "DevOps Engineer", department: "Engineering", status: "Active", avatar: "AT", email: "alex@acme.tech", startDate: "2022-11-12" },
];

export default function PeoplePage() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const filtered = employees.filter(e => e.name.toLowerCase().includes(search.toLowerCase()) || e.role.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">People</h1><Button><Plus size={16} className="mr-2" />Add Employee</Button></div>
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><Input placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" /></div>
        <Button variant="outline" size="icon"><Filter size={18} /></Button>
        <div className="flex border rounded-md"><Button variant={view === "grid" ? "default" : "ghost"} size="icon" onClick={() => setView("grid")}><Grid3X3 size={18} /></Button><Button variant={view === "list" ? "default" : "ghost"} size="icon" onClick={() => setView("list")}><List size={18} /></Button></div>
      </div>
      <div className={view === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-2"}>
        {filtered.map(emp => (
          <Card key={emp.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12"><AvatarFallback className="bg-primary-100 text-primary-600 font-bold">{emp.avatar}</AvatarFallback></Avatar>
              <div className="flex-1 min-w-0"><p className="font-semibold truncate">{emp.name}</p><p className="text-sm text-gray-500">{emp.role}</p><p className="text-xs text-gray-400">{emp.department}</p></div>
              <Badge variant={emp.status === "Active" ? "success" : "warning"}>{emp.status}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
