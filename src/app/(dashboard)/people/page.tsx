"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Grid3X3, List } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { AddEmployeeModal } from "@/components/people/add-employee-modal";

function getInitials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

function statusVariant(status: string): "success" | "warning" | "secondary" {
  if (status === 'ACTIVE') return 'success';
  if (status === 'ON_LEAVE') return 'warning';
  return 'secondary';
}

function statusLabel(status: string): string {
  if (status === 'ACTIVE') return 'Active';
  if (status === 'ON_LEAVE') return 'On Leave';
  if (status === 'INACTIVE') return 'Inactive';
  if (status === 'TERMINATED') return 'Terminated';
  return status;
}

const DEPARTMENTS = [
  'All',
  'Engineering',
  'Product',
  'Design',
  'Marketing',
  'Sales',
  'HR',
  'Finance',
  'Operations',
  'Executive',
];

export default function PeoplePage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'INACTIVE' | 'TERMINATED' | undefined>(undefined);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [addOpen, setAddOpen] = useState(false);

  // Debounce search 300ms
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading } = trpc.employee.list.useQuery({
    limit: 100,
    search: search || undefined,
    department: department || undefined,
    status: statusFilter || undefined,
  });

  const employees = data?.employees ?? [];

  const isFirstLoad = isLoading && !data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">People</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={16} className="mr-2" />Add Employee
        </Button>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <Input
            placeholder="Search employees..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={department ?? 'All'}
          onValueChange={v => setDepartment(v === 'All' ? undefined : v)}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            {DEPARTMENTS.map(d => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter ?? 'All'}
          onValueChange={v => setStatusFilter(v === 'All' ? undefined : v as 'ACTIVE' | 'INACTIVE' | 'TERMINATED')}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
            <SelectItem value="TERMINATED">Terminated</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex border dark:border-charcoal-700 rounded-md">
          <Button variant={view === "grid" ? "default" : "ghost"} size="icon" onClick={() => setView("grid")}>
            <Grid3X3 size={18} />
          </Button>
          <Button variant={view === "list" ? "default" : "ghost"} size="icon" onClick={() => setView("list")}>
            <List size={18} />
          </Button>
        </div>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400">
        {isFirstLoad ? 'Loading...' : `${employees.length} employees`}
        {isLoading && !isFirstLoad && <span className="ml-2 text-gray-400 animate-pulse">updating…</span>}
      </p>

      {isFirstLoad ? (
        <div className={view === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-2"}>
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-20 bg-gray-100 dark:bg-charcoal-800 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className={view === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-2"}>
          {employees.map(emp => (
            <Link key={emp.id} href={`/people/${emp.id}`}>
              <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary-100 text-primary-600 font-bold">
                      {getInitials(emp.firstName, emp.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{emp.firstName} {emp.lastName}</p>
                    <p className="text-xs text-gray-400">{(emp as any).department?.name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{emp.email}</p>
                  </div>
                  <Badge variant={statusVariant(emp.status)}>{statusLabel(emp.status)}</Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <AddEmployeeModal open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
