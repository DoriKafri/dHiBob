"use client";

import React, { useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Plus, DollarSign, Clock, CheckCircle, XCircle, Download, FileText, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";

const EXPENSE_TYPES = [
  'Travel', 'Meals & Entertainment', 'Office Supplies', 'Software & Subscriptions',
  'Training & Education', 'Equipment', 'Communication', 'Transportation', 'Accommodation', 'Other',
];

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "default"> = {
  APPROVED: "success", PENDING: "warning", REJECTED: "destructive",
};

function fmtDate(val: any): string {
  if (!val) return '—';
  const s = String(val);
  if (s.includes('T')) return s.slice(0, 10);
  return s;
}

export default function ExpensesPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'SUPER_ADMIN' || session?.user?.role === 'ADMIN' || session?.user?.role === 'HR';
  const utils = trpc.useUtils();
  const [addOpen, setAddOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [activeTab, setActiveTab] = useState('current');

  // Compute date range from month + year filters
  const dateRange = (() => {
    if (!monthFilter && !yearFilter) return {};
    const y = yearFilter ? parseInt(yearFilter) : new Date().getFullYear();
    if (monthFilter) {
      const m = parseInt(monthFilter);
      // Use ISO strings to avoid timezone issues
      const start = `${y}-${String(m).padStart(2, '0')}-01T00:00:00.000Z`;
      const nextMonth = m === 12 ? `${y + 1}-01-01T00:00:00.000Z` : `${y}-${String(m + 1).padStart(2, '0')}-01T00:00:00.000Z`;
      return { startDate: new Date(start), endDate: new Date(new Date(nextMonth).getTime() - 1) };
    }
    return { startDate: new Date(`${y}-01-01T00:00:00.000Z`), endDate: new Date(`${y}-12-31T23:59:59.999Z`) };
  })();

  const { data: expenses, isLoading } = trpc.expenses.list.useQuery({
    status: statusFilter ? statusFilter as any : undefined,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });
  const { data: summary } = trpc.expenses.summary.useQuery();

  const submitMutation = trpc.expenses.submit.useMutation({ onSuccess: () => { utils.expenses.invalidate(); setAddOpen(false); } });
  const approveMutation = trpc.expenses.approve.useMutation({ onSuccess: () => utils.expenses.invalidate() });
  const rejectMutation = trpc.expenses.reject.useMutation({ onSuccess: () => utils.expenses.invalidate() });
  const deleteMutation = trpc.expenses.delete.useMutation({ onSuccess: () => utils.expenses.invalidate() });

  const [form, setForm] = useState({
    expenseType: '', supplierName: '', amount: '', currency: 'USD',
    expenseDate: '', payrollMonth: '', invoiceFile: '', invoiceFileName: '', notes: '',
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setForm(f => ({ ...f, invoiceFileName: file.name }));
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, invoiceFile: reader.result as string }));
    reader.readAsDataURL(file);
  }

  function handleExport() {
    if (!expenses || expenses.length === 0) return;
    const data = expenses.map((e: any) => ({
      'Full Name': `${e.employee.firstName} ${e.employee.lastName}`,
      'Department': e.employee.department?.name ?? '',
      'Expense Type': e.expenseType,
      'Supplier': e.supplierName ?? '',
      'Amount': e.amount,
      'Currency': e.currency,
      'Date': fmtDate(e.expenseDate),
      'Payroll Month': e.payrollMonth ?? '',
      'Status': e.status,
      'Notes': e.notes ?? '',
      'Submitted': fmtDate(e.createdAt),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");
    XLSX.writeFile(wb, `expense-report${yearFilter ? `-${yearFilter}` : ''}${monthFilter ? `-${monthFilter}` : ''}.xlsx`);
  }

  // Split expenses into current (pending) and history (approved/rejected)
  const currentExpenses = (expenses || []).filter((e: any) => e.status === 'PENDING');
  const historyExpenses = (expenses || []).filter((e: any) => e.status !== 'PENDING');

  // Compute filtered stats from the current query results
  const filteredPending = currentExpenses.length;
  const filteredApproved = (expenses || []).filter((e: any) => e.status === 'APPROVED');
  const filteredApprovedTotal = filteredApproved.reduce((s: number, e: any) => s + e.amount, 0);
  const filteredRejected = (expenses || []).filter((e: any) => e.status === 'REJECTED').length;
  const hasFilter = !!(monthFilter || yearFilter || statusFilter);

  function renderTable(items: any[], showActions: boolean) {
    if (items.length === 0) return (
      <div className="p-12 text-center text-gray-500 dark:text-gray-300">
        <DollarSign size={48} className="mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">No expenses found.</p>
      </div>
    );
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-300">
              <th className="text-left p-3 font-medium">Employee</th>
              <th className="text-left p-3 font-medium">Type</th>
              <th className="text-left p-3 font-medium">Supplier</th>
              <th className="text-left p-3 font-medium">Amount</th>
              <th className="text-left p-3 font-medium">Date</th>
              <th className="text-left p-3 font-medium">Payroll Month</th>
              <th className="text-left p-3 font-medium">Invoice</th>
              <th className="text-left p-3 font-medium">Status</th>
              {showActions && <th className="text-left p-3 font-medium w-28"></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((expense: any) => (
              <tr key={expense.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 group">
                <td className="p-3 font-medium">{expense.employee.firstName} {expense.employee.lastName}</td>
                <td className="p-3 text-gray-600 dark:text-gray-300">{expense.expenseType}</td>
                <td className="p-3 text-gray-600 dark:text-gray-300">{expense.supplierName || '—'}</td>
                <td className="p-3 font-semibold">{expense.currency === 'USD' ? '$' : expense.currency + ' '}{expense.amount.toLocaleString()}</td>
                <td className="p-3 text-gray-500 dark:text-gray-300">{fmtDate(expense.expenseDate)}</td>
                <td className="p-3 text-gray-500 dark:text-gray-300">{expense.payrollMonth || '—'}</td>
                <td className="p-3">
                  {expense.invoiceFileUrl ? (
                    <a href={expense.invoiceFileUrl} target="_blank" rel="noopener noreferrer" download={expense.invoiceFileName ?? undefined} className="text-primary-500 hover:text-primary-600 flex items-center gap-1">
                      <FileText size={14} /> {expense.invoiceFileName || 'Download'}
                    </a>
                  ) : '—'}
                </td>
                <td className="p-3"><Badge variant={STATUS_VARIANT[expense.status]}>{expense.status}</Badge></td>
                {showActions && (
                  <td className="p-3">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isAdmin && expense.status === 'PENDING' && (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600" onClick={() => approveMutation.mutate({ id: expense.id })}>Approve</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => rejectMutation.mutate({ id: expense.id })}>Reject</Button>
                        </>
                      )}
                      <button onClick={() => deleteMutation.mutate({ id: expense.id })} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Expenses</h1>
        <div className="flex gap-2">
          {expenses && expenses.length > 0 && (
            <Button variant="outline" onClick={handleExport} className="gap-2">
              <Download size={16} /> Export
            </Button>
          )}
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <Plus size={16} /> Submit Expense
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Pending" value={hasFilter ? filteredPending : (summary?.pending ?? '—')} icon={<Clock size={20} />} />
        <StatCard title="Approved" value={hasFilter ? filteredApproved.length : (summary?.approvedCount ?? '—')} icon={<CheckCircle size={20} />} />
        <StatCard title="Total Approved" value={`$${(hasFilter ? filteredApprovedTotal : (summary?.approvedTotal ?? 0)).toLocaleString()}`} icon={<DollarSign size={20} />} />
        <StatCard title="Rejected" value={hasFilter ? filteredRejected : (summary?.rejected ?? '—')} icon={<XCircle size={20} />} />
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 text-gray-900 dark:text-white min-w-[140px]">
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 text-gray-900 dark:text-white min-w-[140px]">
          <option value="">All Months</option>
          {['January','February','March','April','May','June','July','August','September','October','November','December'].map((name, i) => (
            <option key={i} value={String(i + 1).padStart(2, '0')}>{name}</option>
          ))}
        </select>
        <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 text-gray-900 dark:text-white min-w-[100px]">
          <option value="">All Years</option>
          {Array.from({ length: new Date().getFullYear() - 2010 + 51 }, (_, i) => 2010 + i).map(y => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
        {(monthFilter || yearFilter) && (
          <button onClick={() => { setMonthFilter(''); setYearFilter(''); }} className="text-xs text-primary-500 hover:text-primary-600">Clear</button>
        )}
      </div>

      {/* Tabs: Current / History */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="current">
            Pending {currentExpenses.length > 0 && <Badge variant="warning" className="ml-1.5 text-[10px] px-1.5">{currentExpenses.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="history">History ({historyExpenses.length})</TabsTrigger>
          <TabsTrigger value="all">All ({(expenses || []).length})</TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="mt-4">
          <Card><CardContent className="p-0">
            {isLoading ? <div className="p-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />)}</div> : renderTable(currentExpenses, true)}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card><CardContent className="p-0">
            {isLoading ? <div className="p-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />)}</div> : renderTable(historyExpenses, true)}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <Card><CardContent className="p-0">
            {isLoading ? <div className="p-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />)}</div> : renderTable(expenses || [], true)}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Submit Expense Modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Submit Expense</DialogTitle></DialogHeader>
          <form onSubmit={e => {
            e.preventDefault();
            submitMutation.mutate({
              expenseType: form.expenseType,
              supplierName: form.supplierName || undefined,
              amount: parseFloat(form.amount),
              currency: form.currency,
              expenseDate: new Date(form.expenseDate),
              payrollMonth: form.payrollMonth || undefined,
              invoiceFile: form.invoiceFile || undefined,
              invoiceFileName: form.invoiceFileName || undefined,
              notes: form.notes || undefined,
            });
            setForm({ expenseType: '', supplierName: '', amount: '', currency: 'USD', expenseDate: '', payrollMonth: '', invoiceFile: '', invoiceFileName: '', notes: '' });
          }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Expense Type</label>
              <select value={form.expenseType} onChange={e => setForm(f => ({ ...f, expenseType: e.target.value }))} required
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 text-gray-900 dark:text-white">
                <option value="">Select type...</option>
                {EXPENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Expense Date</label>
                <Input type="date" value={form.expenseDate} onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Payroll Month</label>
                <div className="flex gap-2">
                  <select
                    value={form.payrollMonth.split('-')[1] || ''}
                    onChange={e => {
                      const yr = form.payrollMonth.split('-')[0] || String(new Date().getFullYear());
                      setForm(f => ({ ...f, payrollMonth: e.target.value ? `${yr}-${e.target.value}` : '' }));
                    }}
                    className="flex-1 border border-gray-200 dark:border-charcoal-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 text-gray-900 dark:text-white"
                  >
                    <option value="">Month…</option>
                    {['January','February','March','April','May','June','July','August','September','October','November','December'].map((name, i) => (
                      <option key={i} value={String(i + 1).padStart(2, '0')}>{name}</option>
                    ))}
                  </select>
                  <select
                    value={form.payrollMonth.split('-')[0] || ''}
                    onChange={e => {
                      const mo = form.payrollMonth.split('-')[1] || '01';
                      setForm(f => ({ ...f, payrollMonth: e.target.value ? `${e.target.value}-${mo}` : '' }));
                    }}
                    className="w-24 border border-gray-200 dark:border-charcoal-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 text-gray-900 dark:text-white"
                  >
                    <option value="">Year…</option>
                    {Array.from({ length: 41 }, (_, i) => new Date().getFullYear() + 20 - i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Amount</label>
                <Input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Currency</label>
                <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800">
                  {['USD','EUR','GBP','ILS','CAD','AUD','PLN'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Supplier Name</label>
              <Input value={form.supplierName} onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} placeholder="Optional" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Invoice File</label>
              <input type="file" onChange={handleFileChange} className="text-sm" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
              {form.invoiceFileName && <p className="text-xs text-gray-500 dark:text-gray-300 mt-1">{form.invoiceFileName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitMutation.isLoading || !form.expenseType || !form.amount || !form.expenseDate}>
                {submitMutation.isLoading ? "Submitting..." : "Submit"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
