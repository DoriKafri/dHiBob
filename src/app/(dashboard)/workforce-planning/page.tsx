"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useTheme } from "next-themes";
import { Users, TrendingUp, DollarSign, Briefcase, Plus, Trash2, Pencil } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  IN_PROGRESS: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  FILLED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  CLOSED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export default function WorkforcePlanningPage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const textColor = isDark ? '#e5e7eb' : '#374151';
  const gridColor = isDark ? '#374151' : '#e5e7eb';
  const axisTick = { fontSize: 12, fill: textColor, fontWeight: 600 };
  const axisTickSm = { fontSize: 11, fill: textColor, fontWeight: 600 };
  const tooltipStyle = { fontWeight: 500, backgroundColor: isDark ? '#1f2937' : '#fff', border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`, color: textColor };
  const legendStyle = { fontWeight: 600, fontSize: 13, color: textColor };

  const [addOpen, setAddOpen] = useState(false);
  const [editPos, setEditPos] = useState<any>(null);

  const utils = trpc.useUtils();
  const { data: summary, isLoading: summaryLoading } = trpc.workforce.summary.useQuery();
  const { data: positions, isLoading: positionsLoading } = trpc.workforce.positions.useQuery();
  const { data: deptBreakdown, isLoading: deptLoading } = trpc.workforce.departmentBreakdown.useQuery();
  const { data: forecast, isLoading: forecastLoading } = trpc.workforce.headcountForecast.useQuery();
  const { data: departments } = trpc.workforce.departments.useQuery();
  const { data: sites } = trpc.workforce.sites.useQuery();

  const createMutation = trpc.workforce.createPosition.useMutation({ onSuccess: () => { utils.workforce.invalidate(); setAddOpen(false); } });
  const updateMutation = trpc.workforce.updatePosition.useMutation({ onSuccess: () => { utils.workforce.invalidate(); setEditPos(null); } });
  const deleteMutation = trpc.workforce.deletePosition.useMutation({ onSuccess: () => utils.workforce.invalidate() });

  const [form, setForm] = useState({ title: '', departmentId: '', siteId: '', budgetedSalary: '', currency: 'USD', status: 'OPEN' as string });

  function resetForm() { setForm({ title: '', departmentId: '', siteId: '', budgetedSalary: '', currency: 'USD', status: 'OPEN' }); }
  function openAdd() { resetForm(); setAddOpen(true); }
  function openEdit(pos: any) {
    setForm({ title: pos.title, departmentId: pos.departmentId || '', siteId: pos.siteId || '', budgetedSalary: pos.budgetedSalary?.toString() || '', currency: pos.currency || 'USD', status: pos.status });
    setEditPos(pos);
  }

  async function handleSubmit() {
    if (!form.title.trim()) return;
    const data = {
      title: form.title,
      departmentId: form.departmentId || undefined,
      siteId: form.siteId || undefined,
      budgetedSalary: form.budgetedSalary ? parseFloat(form.budgetedSalary) : undefined,
      currency: form.currency || undefined,
      status: form.status as any,
    };
    if (editPos) {
      await updateMutation.mutateAsync({ id: editPos.id, ...data });
    } else {
      await createMutation.mutateAsync(data);
    }
    resetForm();
  }

  const isFormOpen = addOpen || !!editPos;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Workforce Planning</h1>
        <Button onClick={openAdd} className="gap-2"><Plus size={16} /> New Position</Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Current Headcount" value={summaryLoading ? '—' : summary?.headcount ?? 0} icon={<Users size={20} />} />
        <StatCard title="Open Positions" value={summaryLoading ? '—' : summary?.openPositions ?? 0} icon={<Briefcase size={20} />} />
        <StatCard title="Total Budget" value={summaryLoading ? '—' : `$${((summary?.totalBudget ?? 0) / 1000).toFixed(0)}K`} icon={<DollarSign size={20} />} />
        <StatCard title="Remaining Budget" value={summaryLoading ? '—' : `$${((summary?.remainingBudget ?? 0) / 1000).toFixed(0)}K`} icon={<TrendingUp size={20} />} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Headcount Forecast */}
        <Card>
          <CardHeader><CardTitle>Headcount Forecast (12 months)</CardTitle></CardHeader>
          <CardContent className="h-72">
            {forecastLoading ? (
              <div className="h-48 animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />
            ) : !forecast || forecast.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={forecast}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="month" tick={axisTickSm} />
                  <YAxis tick={axisTick} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={legendStyle} />
                  <Line type="monotone" dataKey="current" stroke="#94a3b8" name="Current" strokeDasharray="5 5" strokeWidth={2} />
                  <Line type="monotone" dataKey="projected" stroke="#6366f1" name="Projected" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Department Breakdown */}
        <Card>
          <CardHeader><CardTitle>Department Breakdown</CardTitle></CardHeader>
          <CardContent className="h-72">
            {deptLoading ? (
              <div className="h-48 animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />
            ) : !deptBreakdown || deptBreakdown.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="name" tick={axisTickSm} />
                  <YAxis tick={axisTick} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={legendStyle} />
                  <Bar dataKey="headcount" fill="#6366f1" name="Headcount" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="openPositions" fill="#f59e0b" name="Open Positions" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Budget by Department */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Budget by Department</CardTitle></CardHeader>
          <CardContent className="h-72">
            {deptLoading ? (
              <div className="h-48 animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />
            ) : !deptBreakdown || deptBreakdown.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptBreakdown.filter((d: any) => d.budget > 0)}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="name" tick={axisTickSm} />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={axisTick} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, '']} contentStyle={tooltipStyle} />
                  <Bar dataKey="budget" fill="#10b981" name="Budgeted Salary" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Positions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Positions ({positions?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {positionsLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />)}</div>
          ) : !positions || positions.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-300 text-center py-8">No positions created yet. Click &quot;New Position&quot; to add one.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-300">
                    <th className="text-left py-2 pr-4 font-medium">Title</th>
                    <th className="text-left py-2 pr-4 font-medium">Department</th>
                    <th className="text-left py-2 pr-4 font-medium">Site</th>
                    <th className="text-left py-2 pr-4 font-medium">Status</th>
                    <th className="text-left py-2 pr-4 font-medium">Filled By</th>
                    <th className="text-left py-2 pr-4 font-medium">Budget</th>
                    <th className="text-left py-2 font-medium w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos: any) => (
                    <tr key={pos.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 group">
                      <td className="py-3 pr-4 font-medium">{pos.title}</td>
                      <td className="py-3 pr-4 text-gray-500 dark:text-gray-300">{pos.department?.name || '—'}</td>
                      <td className="py-3 pr-4 text-gray-500 dark:text-gray-300">{pos.site?.name || '—'}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[pos.status] || STATUS_COLORS.OPEN}`}>
                          {pos.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-gray-500 dark:text-gray-300">
                        {pos.employee ? `${pos.employee.firstName} ${pos.employee.lastName}` : '—'}
                      </td>
                      <td className="py-3 pr-4 text-gray-500 dark:text-gray-300">
                        {pos.budgetedSalary ? `$${pos.budgetedSalary.toLocaleString()}` : '—'}
                      </td>
                      <td className="py-3">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(pos)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Edit">
                            <Pencil size={14} className="text-gray-500 dark:text-gray-300" />
                          </button>
                          <button onClick={() => { if (confirm('Delete this position?')) deleteMutation.mutate({ id: pos.id }); }} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Delete">
                            <Trash2 size={14} className="text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Position Modal */}
      <Dialog open={isFormOpen} onOpenChange={open => { if (!open) { setAddOpen(false); setEditPos(null); resetForm(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editPos ? 'Edit Position' : 'New Position'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Senior Frontend Engineer" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Department</label>
                <select value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))} className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800">
                  <option value="">No department</option>
                  {(departments || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Site</label>
                <select value={form.siteId} onChange={e => setForm(f => ({ ...f, siteId: e.target.value }))} className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800">
                  <option value="">No site</option>
                  {(sites || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Budgeted Salary</label>
                <Input value={form.budgetedSalary} onChange={e => setForm(f => ({ ...f, budgetedSalary: e.target.value }))} placeholder="120000" type="number" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800">
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="FILLED">Filled</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setAddOpen(false); setEditPos(null); resetForm(); }}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={!form.title.trim() || createMutation.isLoading || updateMutation.isLoading}>
                {editPos ? 'Save' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
