"use client";
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Key, UserPlus, X, Download } from "lucide-react";
import { format } from "date-fns";
import { currencySymbol } from "@/lib/currency";
import * as XLSX from "xlsx";

const CATEGORIES = ['Identity', 'Communication', 'AI', 'Development', 'Security', 'General', 'Other'];
const LICENSE_TYPES = ['Monthly', 'Yearly', 'Perpetual'];
const STATUSES = ['Active', 'Inactive', 'Expired'];

const CAT_COLORS: Record<string, string> = {
  Identity: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30',
  Communication: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30',
  AI: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30',
  Development: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
  Security: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  General: 'bg-gray-100 text-gray-600 dark:bg-gray-800',
  Other: 'bg-gray-100 text-gray-600 dark:bg-gray-800',
};

function EmployeeLicenseMatrix({ licenses, employees }: { licenses: any[]; employees: any[] }) {
  const utils = trpc.useContext();
  const assignMutation = trpc.itLicenses.assign.useMutation({ onSuccess: () => utils.itLicenses.invalidate() });
  const unassignMutation = trpc.itLicenses.unassign.useMutation({ onSuccess: () => utils.itLicenses.invalidate() });
  const updateAssignmentMutation = trpc.itLicenses.updateAssignment.useMutation({ onSuccess: () => utils.itLicenses.invalidate() });
  const [mSortKey, setMSortKey] = useState<string | null>(null);
  const [mSortDir, setMSortDir] = useState<'asc' | 'desc' | null>(null);

  const activeLicenses = licenses.filter((l: any) => l.status === 'Active').sort((a: any, b: any) => a.item.localeCompare(b.item));

  // Build maps for quick lookup: "licenseId:employeeId" → { id, status }
  const assignmentMap = new Map<string, { id: string; status: string }>();
  for (const l of activeLicenses) {
    for (const a of (l.assignments ?? [])) {
      assignmentMap.set(`${l.id}:${a.employeeId}`, { id: a.id, status: a.status || 'ASSIGNED' });
    }
  }

  // Enrich employees with parsed workInfo for sorting
  const enriched = employees.map((emp: any) => {
    const workInfo = (() => { try { return JSON.parse(emp.workInfo || '{}'); } catch { return {}; } })();
    return { ...emp, _name: `${emp.firstName} ${emp.lastName}`, _dept: emp.department?.name || '', _jobTitle: workInfo.jobTitle || '', _workInfo: workInfo,
      // Count how many licenses this employee has (for sorting by license columns)
      _licenseCount: activeLicenses.filter((l: any) => assignmentMap.has(`${l.id}:${emp.id}`)).length,
    };
  });

  function handleMatrixSort(key: string) {
    if (!key) return;
    if (mSortKey === key) {
      if (mSortDir === 'asc') setMSortDir('desc');
      else { setMSortKey(null); setMSortDir(null); }
    } else {
      setMSortKey(key);
      setMSortDir('asc');
    }
  }

  function matrixSortIndicator(key: string) {
    if (mSortKey !== key) return '';
    return mSortDir === 'asc' ? ' ↑' : ' ↓';
  }

  const sortedEmployees = mSortKey && mSortDir ? [...enriched].sort((a: any, b: any) => {
    let av: any, bv: any;
    if (mSortKey === '_name') { av = a._name; bv = b._name; }
    else if (mSortKey === 'email') { av = a.email; bv = b.email; }
    else if (mSortKey === '_dept') { av = a._dept; bv = b._dept; }
    else if (mSortKey === '_jobTitle') { av = a._jobTitle; bv = b._jobTitle; }
    else if (mSortKey.startsWith('lic_')) {
      // Sort by assignment status: ASSIGNED=2, RESERVED=1, none=0
      const licId = mSortKey.replace('lic_', '');
      const aEntry = assignmentMap.get(`${licId}:${a.id}`);
      const bEntry = assignmentMap.get(`${licId}:${b.id}`);
      av = aEntry ? (aEntry.status === 'ASSIGNED' ? 2 : 1) : 0;
      bv = bEntry ? (bEntry.status === 'ASSIGNED' ? 2 : 1) : 0;
      return mSortDir === 'asc' ? bv - av : av - bv; // asc = assigned first
    }
    else { av = ''; bv = ''; }
    const cmp = String(av).localeCompare(String(bv));
    return mSortDir === 'asc' ? cmp : -cmp;
  }) : [...enriched].sort((a, b) => a._name.localeCompare(b._name));

  if (!activeLicenses.length) {
    return <p className="text-sm text-gray-400 py-8 text-center">No active licenses to display.</p>;
  }

  // Three-state toggle: unassigned → assigned(✓) → reserved(R) → unassigned
  function toggleAssignment(licenseId: string, employeeId: string) {
    const key = `${licenseId}:${employeeId}`;
    const entry = assignmentMap.get(key);
    if (!entry) {
      assignMutation.mutate({ licenseId, employeeId });
    } else if (entry.status === 'ASSIGNED') {
      updateAssignmentMutation.mutate({ id: entry.id, status: 'RESERVED' });
    } else {
      unassignMutation.mutate({ id: entry.id });
    }
  }

  const thBase = "px-3 py-2 text-left font-medium text-gray-500 cursor-pointer select-none hover:text-gray-900 dark:hover:text-white";
  const thSticky0 = `${thBase} sticky left-0 bg-gray-50 dark:bg-charcoal-800 min-w-[160px] z-10`;
  const thSticky1 = `${thBase} sticky left-[160px] bg-gray-50 dark:bg-charcoal-800 min-w-[180px] z-10`;

  return (
    <div className="overflow-x-auto border rounded-lg">
      <p className="px-4 py-2 text-[10px] text-gray-400 dark:text-gray-500 border-b bg-gray-50 dark:bg-charcoal-800">Click a cell to cycle: <span className="text-emerald-500">✓ Assigned</span> → <span className="text-amber-500">R Reserved</span> → Unassigned · Click a column header to sort</p>
      <table className="text-xs">
        <thead>
          <tr className="border-b bg-gray-50 dark:bg-charcoal-800">
            <th className={thSticky0} onClick={() => handleMatrixSort('_name')}>Name{matrixSortIndicator('_name')}</th>
            <th className={thSticky1} onClick={() => handleMatrixSort('email')}>Email{matrixSortIndicator('email')}</th>
            <th className={`${thBase} min-w-[100px]`} onClick={() => handleMatrixSort('_dept')}>Department{matrixSortIndicator('_dept')}</th>
            <th className={`${thBase} min-w-[140px]`} onClick={() => handleMatrixSort('_jobTitle')}>Job Title{matrixSortIndicator('_jobTitle')}</th>
            {activeLicenses.map((l: any) => (
              <th key={l.id} className="px-2 py-2 text-center font-medium text-gray-500 min-w-[80px] whitespace-nowrap cursor-pointer select-none hover:text-gray-900 dark:hover:text-white" onClick={() => handleMatrixSort(`lic_${l.id}`)}>
                <div className="flex flex-col items-center gap-0.5">
                  <span>{l.item}{matrixSortIndicator(`lic_${l.id}`)}</span>
                  {l.pricePerSeat > 0 && <span className="text-[9px] text-gray-400">{currencySymbol(l.currency)}{l.pricePerSeat}</span>}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedEmployees.map((emp: any) => (
            <tr key={emp.id} className="border-b hover:bg-gray-50 dark:hover:bg-charcoal-800/50">
              <td className="px-3 py-1.5 font-medium sticky left-0 bg-white dark:bg-charcoal-900 z-10">{emp._name}</td>
              <td className="px-3 py-1.5 text-gray-500 dark:text-gray-300 sticky left-[160px] bg-white dark:bg-charcoal-900 z-10">{emp.email}</td>
              <td className="px-3 py-1.5 text-gray-500 dark:text-gray-300">{emp._dept}</td>
              <td className="px-3 py-1.5 text-gray-500 dark:text-gray-300">{emp._jobTitle}</td>
              {activeLicenses.map((l: any) => {
                const entry = assignmentMap.get(`${l.id}:${emp.id}`);
                const status = entry?.status;
                return (
                  <td
                    key={l.id}
                    className="px-2 py-1.5 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-charcoal-700 transition-colors"
                    onClick={() => toggleAssignment(l.id, emp.id)}
                    title={!entry ? `Assign ${l.item} to ${emp.firstName}` : status === 'ASSIGNED' ? `Mark as reserved` : `Remove ${l.item} from ${emp.firstName}`}
                  >
                    {status === 'ASSIGNED' ? (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 font-bold">✓</span>
                    ) : status === 'RESERVED' ? (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 font-bold">R</span>
                    ) : (
                      <span className="text-gray-200 dark:text-charcoal-700 hover:text-gray-400">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ITLicensesPage() {
  const utils = trpc.useContext();
  const [view, setView] = useState<'catalog' | 'matrix'>('catalog');
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [assignLicenseId, setAssignLicenseId] = useState<string | null>(null);
  const [assignEmployeeId, setAssignEmployeeId] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);

  const { data: licenses, isLoading } = trpc.itLicenses.list.useQuery();
  const { data: stats } = trpc.itLicenses.stats.useQuery();
  const { data: employees } = trpc.employee.list.useQuery({ limit: 500 });

  const createMutation = trpc.itLicenses.create.useMutation({ onSuccess: () => { utils.itLicenses.invalidate(); setCreateOpen(false); } });
  const updateMutation = trpc.itLicenses.update.useMutation({ onSuccess: () => { utils.itLicenses.invalidate(); setEditId(null); } });
  const deleteMutation = trpc.itLicenses.delete.useMutation({ onSuccess: () => utils.itLicenses.invalidate() });
  const assignMutation = trpc.itLicenses.assign.useMutation({ onSuccess: () => { utils.itLicenses.invalidate(); setAssignEmployeeId(''); } });
  const unassignMutation = trpc.itLicenses.unassign.useMutation({ onSuccess: () => utils.itLicenses.invalidate() });

  const editLicense = editId ? licenses?.find((l: any) => l.id === editId) : null;
  const assignLicense = assignLicenseId ? licenses?.find((l: any) => l.id === assignLicenseId) : null;

  function LicenseForm({ onSubmit, defaults, submitLabel }: { onSubmit: (data: any) => void; defaults?: any; submitLabel: string }) {
    const [errors, setErrors] = useState<Record<string, string>>({});

    return (
      <form onSubmit={e => {
        e.preventDefault();
        const fd = new FormData(e.target as HTMLFormElement);
        const data: any = {};
        const newErrors: Record<string, string> = {};
        for (const [k, v] of fd.entries()) {
          if (v === '') continue;
          if (k === 'totalSeats') { data[k] = parseInt(v as string); continue; }
          if (k === 'pricePerSeat') { data[k] = parseFloat(v as string); continue; }
          data[k] = v;
        }
        // Validation
        if (!data.item) newErrors.item = 'Item name is required';
        if (!data.publisher) newErrors.publisher = 'Publisher is required';
        if (data.totalSeats !== undefined && data.totalSeats < 0) newErrors.totalSeats = 'Seats cannot be negative';
        if (data.pricePerSeat !== undefined && data.pricePerSeat < 0) newErrors.pricePerSeat = 'Price cannot be negative';
        if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
        setErrors({});
        onSubmit(data);
      }} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Item <span className="text-red-500">*</span></label>
            <Input name="item" defaultValue={defaults?.item || ''} placeholder="e.g. Google Workspace" className={errors.item ? 'border-red-500' : ''} />
            {errors.item && <p className="text-xs text-red-500 mt-1">{errors.item}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Publisher <span className="text-red-500">*</span></label>
            <Input name="publisher" defaultValue={defaults?.publisher || ''} placeholder="e.g. Google" className={errors.publisher ? 'border-red-500' : ''} />
            {errors.publisher && <p className="text-xs text-red-500 mt-1">{errors.publisher}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Plan Name</label><Input name="planName" defaultValue={defaults?.planName || ''} placeholder="e.g. Business Starter" /></div>
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <select name="category" defaultValue={defaults?.category || 'General'} className="w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 dark:border-charcoal-600">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">License Type</label>
            <select name="licenseType" defaultValue={defaults?.licenseType || 'Monthly'} className="w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 dark:border-charcoal-600">
              {LICENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div><label className="block text-sm font-medium mb-1">Renewal Date</label><Input type="date" name="renewalDate" defaultValue={defaults?.renewalDate ? format(new Date(defaults.renewalDate), 'yyyy-MM-dd') : ''} /></div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select name="status" defaultValue={defaults?.status || 'Active'} className="w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 dark:border-charcoal-600">
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Total Seats</label>
            <Input type="number" min="0" name="totalSeats" defaultValue={defaults?.totalSeats ?? 0} className={errors.totalSeats ? 'border-red-500' : ''} />
            {errors.totalSeats && <p className="text-xs text-red-500 mt-1">{errors.totalSeats}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Price per Seat</label>
            <Input type="number" step="0.01" min="0" name="pricePerSeat" defaultValue={defaults?.pricePerSeat ?? 0} className={errors.pricePerSeat ? 'border-red-500' : ''} />
            {errors.pricePerSeat && <p className="text-xs text-red-500 mt-1">{errors.pricePerSeat}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Currency</label>
            <select name="currency" defaultValue={defaults?.currency || 'USD'} className="w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 dark:border-charcoal-600">
              {['USD', 'ILS', 'EUR', 'GBP', 'PLN'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div><label className="block text-sm font-medium mb-1">Notes</label><Input name="notes" defaultValue={defaults?.notes || ''} /></div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => { setCreateOpen(false); setEditId(null); }}>Cancel</Button>
          <Button type="submit">{submitLabel}</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">IT Licenses</h1>
          <div className="flex border rounded-md overflow-hidden">
            <button
              onClick={() => setView('catalog')}
              className={`px-3 py-1.5 text-xs font-medium ${view === 'catalog' ? 'bg-gray-800 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-100 dark:bg-charcoal-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}
            >Catalog</button>
            <button
              onClick={() => setView('matrix')}
              className={`px-3 py-1.5 text-xs font-medium ${view === 'matrix' ? 'bg-gray-800 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-100 dark:bg-charcoal-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}
            >Employee Matrix</button>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => {
            if (view === 'catalog') {
              if (!licenses?.length) return;
              const rows = licenses.map((l: any) => {
                const assigned = l._count.assignments;
                const monthlyCost = l.licenseType === 'Yearly' ? (l.pricePerSeat * assigned) / 12 : l.pricePerSeat * assigned;
                const annualCost = l.licenseType === 'Yearly' ? l.pricePerSeat * assigned : l.pricePerSeat * assigned * 12;
                return {
                  Item: l.item, Publisher: l.publisher || '', 'Plan Name': l.planName || '',
                  Category: l.category, 'License Type': l.licenseType,
                  'Renewal Date': l.renewalDate ? format(new Date(l.renewalDate), 'yyyy-MM-dd') : '',
                  Status: l.status, 'Total Seats': l.totalSeats, 'Assigned Seats': assigned,
                  'Price/Seat': l.pricePerSeat, Currency: l.currency,
                  'Monthly Cost': Math.round(monthlyCost), 'Annual Cost': Math.round(annualCost),
                  'Assigned Users': l.assignments.map((a: any) => `${a.employee.firstName} ${a.employee.lastName}`).join(', '),
                  Notes: l.notes || '',
                };
              });
              const ws = XLSX.utils.json_to_sheet(rows);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, 'Catalog');
              XLSX.writeFile(wb, 'it-licenses-catalog.xlsx');
            } else {
              const empList = (employees as any)?.employees ?? [];
              const activeLicenses = (licenses ?? []).filter((l: any) => l.status === 'Active').sort((a: any, b: any) => a.item.localeCompare(b.item));
              if (!empList.length || !activeLicenses.length) return;
              const assignmentStatusMap = new Map<string, string>();
              for (const l of activeLicenses) {
                for (const a of (l.assignments ?? [])) assignmentStatusMap.set(`${l.id}:${a.employeeId}`, a.status || 'ASSIGNED');
              }
              const rows = empList
                .sort((a: any, b: any) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
                .map((emp: any) => {
                  const wi = (() => { try { return JSON.parse(emp.workInfo || '{}'); } catch { return {}; } })();
                  const row: Record<string, string> = {
                    Name: `${emp.firstName} ${emp.lastName}`,
                    Email: emp.email || '',
                    Department: emp.department?.name || '',
                    'Job Title': wi.jobTitle || '',
                  };
                  for (const l of activeLicenses) {
                    const s = assignmentStatusMap.get(`${l.id}:${emp.id}`);
                    row[l.item] = s === 'ASSIGNED' ? '✓' : s === 'RESERVED' ? 'R' : '';
                  }
                  return row;
                });
              const ws = XLSX.utils.json_to_sheet(rows);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, 'Employee Matrix');
              XLSX.writeFile(wb, 'it-licenses-matrix.xlsx');
            }
          }}><Download size={16} /> Export {view === 'catalog' ? 'Catalog' : 'Matrix'}</Button>
          <Button onClick={() => setCreateOpen(true)} className="gap-2"><Plus size={16} /> Add License</Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: "Total Licenses", value: stats.totalLicenses, color: "text-gray-600" },
            { label: "Active", value: stats.activeLicenses, color: "text-emerald-500" },
            { label: "Total Seats", value: stats.totalSeats, color: "text-blue-500" },
            { label: "Assigned", value: stats.usedSeats, color: "text-violet-500" },
            { label: "Est. Monthly Cost", value: `$${stats.monthlyCost.toLocaleString()}`, color: "text-amber-500" },
          ].map(s => (
            <Card key={s.label}><CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </CardContent></Card>
          ))}
        </div>
      )}

      {view === 'matrix' && (
        <EmployeeLicenseMatrix licenses={licenses ?? []} employees={(employees as any)?.employees ?? []} />
      )}

      {view === 'catalog' && (isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 dark:bg-charcoal-800 rounded animate-pulse" />)}</div>
      ) : !licenses?.length ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-300">
          <Key size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No licenses configured.</p>
        </div>
      ) : (() => {
        const COLS: Array<{ label: string; key: string }> = [
          { label: 'Item', key: 'item' },
          { label: 'Publisher', key: 'publisher' },
          { label: 'Plan', key: 'planName' },
          { label: 'Category', key: 'category' },
          { label: 'Type', key: 'licenseType' },
          { label: 'Renewal', key: 'renewalDate' },
          { label: 'Status', key: 'status' },
          { label: 'Seats', key: '_seats' },
          { label: 'Price/Seat', key: 'pricePerSeat' },
          { label: 'Monthly Cost', key: '_monthly' },
          { label: 'Annual Cost', key: '_annual' },
          { label: '', key: '' },
        ];

        function handleSort(key: string) {
          if (!key) return;
          if (sortKey === key) {
            if (sortDir === 'asc') setSortDir('desc');
            else { setSortKey(null); setSortDir(null); }
          } else {
            setSortKey(key);
            setSortDir('asc');
          }
        }

        function sortIndicator(key: string) {
          if (sortKey !== key) return '';
          return sortDir === 'asc' ? ' ↑' : ' ↓';
        }

        // Enrich licenses with computed fields for sorting
        const enriched = (licenses ?? []).map((l: any) => {
          const assigned = l._count.assignments;
          return {
            ...l,
            _seats: assigned,
            _monthly: l.licenseType === 'Yearly' ? (l.pricePerSeat * assigned) / 12 : l.pricePerSeat * assigned,
            _annual: l.licenseType === 'Yearly' ? l.pricePerSeat * assigned : l.pricePerSeat * assigned * 12,
          };
        });

        const sorted = sortKey && sortDir ? [...enriched].sort((a: any, b: any) => {
          let av = a[sortKey], bv = b[sortKey];
          if (sortKey === 'renewalDate') {
            av = av ? new Date(av).getTime() : 0;
            bv = bv ? new Date(bv).getTime() : 0;
            return sortDir === 'asc' ? av - bv : bv - av;
          }
          if (typeof av === 'number' && typeof bv === 'number') {
            return sortDir === 'asc' ? av - bv : bv - av;
          }
          return sortDir === 'asc'
            ? String(av || '').localeCompare(String(bv || ''))
            : String(bv || '').localeCompare(String(av || ''));
        }) : enriched;

        return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                {COLS.map(col => (
                  <th
                    key={col.key || 'actions'}
                    onClick={() => handleSort(col.key)}
                    className={`px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-300 whitespace-nowrap ${col.key ? 'cursor-pointer select-none hover:text-gray-900 dark:hover:text-white' : ''}`}
                  >
                    {col.label}{sortIndicator(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((l: any) => {
                const assigned = l._seats;
                const monthlyCost = l._monthly;
                const annualCost = l._annual;
                const sym = currencySymbol(l.currency);
                return (
                  <React.Fragment key={l.id}>
                    <tr className="border-b hover:bg-gray-50 dark:hover:bg-charcoal-800 group">
                      <td className="px-3 py-2 font-medium">{l.item}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-300">{l.publisher || '—'}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-300">{l.planName || '—'}</td>
                      <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-medium ${CAT_COLORS[l.category] || ''}`}>{l.category}</span></td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{l.licenseType}</Badge></td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{l.renewalDate ? format(new Date(l.renewalDate), 'MMM d') : '—'}</td>
                      <td className="px-3 py-2"><Badge variant={l.status === 'Active' ? 'success' : l.status === 'Expired' ? 'destructive' : 'default'}>{l.status}</Badge></td>
                      <td className="px-3 py-2 text-center">{assigned}/{l.totalSeats}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-300">{sym}{l.pricePerSeat}</td>
                      <td className="px-3 py-2 font-medium">{sym}{Math.round(monthlyCost).toLocaleString()}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-300">{sym}{Math.round(annualCost).toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setAssignLicenseId(l.id)} className="p-1 text-emerald-400 hover:text-emerald-600" title="Manage users"><UserPlus size={14} /></button>
                          <button onClick={() => setEditId(l.id)} className="p-1 text-gray-400 hover:text-gray-600"><Pencil size={14} /></button>
                          <button onClick={() => { if (confirm('Delete this license?')) deleteMutation.mutate({ id: l.id }); }} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                    {/* Show assigned users inline (collapsible via the UserPlus button) */}
                    {assignLicenseId === l.id && (
                      <tr className="bg-gray-50 dark:bg-charcoal-800/50">
                        <td colSpan={12} className="px-6 py-3">
                          <div className="flex items-center gap-2 mb-2">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-300">Assigned Users ({assigned})</p>
                            <select
                              value={assignEmployeeId}
                              onChange={e => setAssignEmployeeId(e.target.value)}
                              className="text-xs border rounded px-2 py-1 bg-white dark:bg-charcoal-800 dark:border-charcoal-600"
                            >
                              <option value="">Add user...</option>
                              {(employees as any)?.employees
                                ?.filter((e: any) => !l.assignments.some((a: any) => a.employeeId === e.id))
                                .map((e: any) => (
                                  <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                                ))
                              }
                            </select>
                            {assignEmployeeId && (
                              <Button size="sm" className="h-6 text-xs" onClick={() => {
                                assignMutation.mutate({ licenseId: l.id, employeeId: assignEmployeeId });
                              }}>Assign</Button>
                            )}
                            <button onClick={() => setAssignLicenseId(null)} className="ml-auto text-gray-400 hover:text-gray-600"><X size={14} /></button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {l.assignments.map((a: any) => (
                              <span key={a.id} className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-charcoal-900 border rounded-md text-xs group/user">
                                {a.employee.firstName} {a.employee.lastName}
                                <button onClick={() => unassignMutation.mutate({ id: a.id })} className="opacity-0 group-hover/user:opacity-100 text-red-400 hover:text-red-600"><X size={10} /></button>
                              </span>
                            ))}
                            {l.assignments.length === 0 && <span className="text-xs text-gray-400">No users assigned</span>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      );
      })())}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add License</DialogTitle></DialogHeader>
          <LicenseForm onSubmit={data => createMutation.mutate(data)} submitLabel="Add License" />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editId} onOpenChange={open => { if (!open) setEditId(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit License</DialogTitle></DialogHeader>
          {editLicense && <LicenseForm defaults={editLicense} onSubmit={data => updateMutation.mutate({ id: editId!, ...data })} submitLabel="Save Changes" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
