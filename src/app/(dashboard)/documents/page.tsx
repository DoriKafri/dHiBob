"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Upload, FileText, File, Image, Download } from "lucide-react";

const documents = [
  { name: "Employee Handbook 2026", type: "PDF", size: "2.4 MB", category: "Policies", updatedAt: "Mar 20", icon: FileText },
  { name: "Benefits Guide", type: "PDF", size: "1.8 MB", category: "Benefits", updatedAt: "Mar 15", icon: FileText },
  { name: "Org Chart Q1 2026", type: "Image", size: "540 KB", category: "Organization", updatedAt: "Mar 10", icon: Image },
  { name: "Offer Letter Template", type: "DOCX", size: "120 KB", category: "Templates", updatedAt: "Mar 5", icon: File },
];

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Documents</h1><Button><Upload size={16} className="mr-2" />Upload</Button></div>
      <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><Input placeholder="Search documents..." className="pl-10" /></div>
      <div className="space-y-2">{documents.map(d => { const Icon = d.icon; return <Card key={d.name}><CardContent className="p-4 flex items-center justify-between"><div className="flex items-center gap-3"><Icon size={24} className="text-gray-400" /><div><p className="font-medium">{d.name}</p><p className="text-sm text-gray-500">{d.type} · {d.size} · Updated {d.updatedAt}</p></div></div><div className="flex items-center gap-2"><Badge variant="outline">{d.category}</Badge><Button variant="ghost" size="icon"><Download size={16} /></Button></div></CardContent></Card>; })}</div>
    </div>
  );
}
