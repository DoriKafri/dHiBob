"use client";
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Monitor, Trash2, Pencil, Download, MessageSquare, Send, FileText, Upload, X } from "lucide-react";
import { format } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import * as XLSX from "xlsx";

const TYPES = ['Laptop', 'Monitor', 'Phone', 'Keyboard', 'Mouse', 'Headset', 'Tablet', 'Other'];
const STATUSES = ['Available', 'In Use', 'Repair', 'Retired'];
const OS_OPTIONS = ['Windows', 'macOS', 'Ubuntu', 'Linux', 'ChromeOS', 'Other'];

/** Auto-derive warranty status from the end date. */
function getWarrantyStatus(warrantyEndDate: string | Date | null | undefined): string | null {
  if (!warrantyEndDate) return null;
  const end = new Date(warrantyEndDate);
  if (isNaN(end.getTime())) return null;
  return end >= new Date() ? 'Under warranty' : 'Out of warranty';
}

const STATUS_COLORS: Record<string, string> = {
  'Available': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30',
  'In Use': 'bg-sky-200 text-sky-800 dark:bg-sky-500/30 dark:text-sky-200',
  'Repair': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
  'Retired': 'bg-gray-100 text-gray-500 dark:bg-gray-800',
};

const WARRANTY_COLORS: Record<string, string> = {
  'Under warranty': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30',
  'Out of warranty': 'bg-red-100 text-red-700 dark:bg-red-900/30',
};

export default function ITAssetsPage() {
  const utils = trpc.useContext();
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [osFilter, setOsFilter] = useState('');
  const [cpuFilter, setCpuFilter] = useState('');
  const [ramFilter, setRamFilter] = useState('');
  const [storageFilter, setStorageFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);
  const [notesAssetId, setNotesAssetId] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');

  const { data: assets, isLoading } = trpc.itAssets.list.useQuery({
    type: typeFilter || undefined,
    status: statusFilter || undefined,
  });
  const { data: stats } = trpc.itAssets.stats.useQuery();
  const { data: employees } = trpc.employee.list.useQuery({ limit: 500 });

  const { data: notesAsset } = trpc.itAssets.getById.useQuery(
    { id: notesAssetId! },
    { enabled: !!notesAssetId }
  );

  const createMutation = trpc.itAssets.create.useMutation({ onSuccess: () => { utils.itAssets.invalidate(); setCreateOpen(false); } });
  const updateMutation = trpc.itAssets.update.useMutation({ onSuccess: () => { utils.itAssets.invalidate(); setEditId(null); } });
  const deleteMutation = trpc.itAssets.delete.useMutation({ onSuccess: () => utils.itAssets.invalidate() });
  const addNoteMutation = trpc.itAssets.addNote.useMutation({ onSuccess: () => { utils.itAssets.getById.invalidate({ id: notesAssetId! }); setNewNote(''); } });
  const deleteNoteMutation = trpc.itAssets.deleteNote.useMutation({ onSuccess: () => utils.itAssets.getById.invalidate({ id: notesAssetId! }) });

  // Unique values for dynamic filter dropdowns
  const uniqueVals = (key: string) => Array.from(new Set((assets ?? []).map((a: any) => a[key]).filter(Boolean))).sort();
  const osOptions = uniqueVals('factoryOS');
  const cpuOptions = uniqueVals('cpu');
  const ramOptions = uniqueVals('ram');
  const storageOptions = uniqueVals('storage');

  const COLUMNS: Array<{ label: string; key: string }> = [
    { label: 'Item', key: 'item' },
    { label: 'Serial Number', key: 'serialNumber' },
    { label: 'Model', key: 'model' },
    { label: 'Type', key: 'type' },
    { label: 'Assigned', key: '_assignee' },
    { label: 'OS', key: 'factoryOS' },
    { label: 'Status', key: 'status' },
    { label: 'Warranty', key: '_warranty' },
    { label: 'Warranty End', key: 'warrantyEndDate' },
    { label: 'Cost', key: 'purchaseCost' },
    { label: 'CPU', key: 'cpu' },
    { label: 'RAM', key: 'ram' },
    { label: 'Storage', key: 'storage' },
    { label: 'File', key: '_file' },
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

  const filtered = (assets ?? []).filter((a: any) => {
    if (osFilter && a.factoryOS !== osFilter) return false;
    if (cpuFilter && a.cpu !== cpuFilter) return false;
    if (ramFilter && a.ram !== ramFilter) return false;
    if (storageFilter && a.storage !== storageFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [a.item, a.serialNumber, a.model, a.assignee?.firstName, a.assignee?.lastName].some(v => (v || '').toLowerCase().includes(q));
  });

  const sorted = sortKey && sortDir ? [...filtered].sort((a: any, b: any) => {
    let av: any, bv: any;
    if (sortKey === '_assignee') {
      av = a.assignee ? `${a.assignee.firstName} ${a.assignee.lastName}` : '';
      bv = b.assignee ? `${b.assignee.firstName} ${b.assignee.lastName}` : '';
    } else if (sortKey === '_warranty') {
      av = getWarrantyStatus(a.warrantyEndDate) || '';
      bv = getWarrantyStatus(b.warrantyEndDate) || '';
    } else if (sortKey === 'warrantyEndDate') {
      av = a.warrantyEndDate ? new Date(a.warrantyEndDate).getTime() : 0;
      bv = b.warrantyEndDate ? new Date(b.warrantyEndDate).getTime() : 0;
      return sortDir === 'asc' ? av - bv : bv - av;
    } else if (sortKey === 'purchaseCost') {
      av = a.purchaseCost || 0;
      bv = b.purchaseCost || 0;
      return sortDir === 'asc' ? av - bv : bv - av;
    } else {
      av = (a[sortKey] || '').toString().toLowerCase();
      bv = (b[sortKey] || '').toString().toLowerCase();
    }
    const cmp = String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  }) : filtered;

  const editAsset = editId ? assets?.find((a: any) => a.id === editId) : null;

  function AssetForm({ onSubmit, defaults, submitLabel }: { onSubmit: (data: any) => void; defaults?: any; submitLabel: string }) {
    const [fileInfo, setFileInfo] = useState<{ key: string; name: string; size: number } | null>(
      defaults?.fileKey ? { key: defaults.fileKey, name: defaults.fileName || 'file', size: defaults.fileSize || 0 } : null
    );
    const [uploading, setUploading] = useState(false);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('folder', 'it_assets');
        const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
        if (!res.ok) throw new Error('Upload failed');
        const result = await res.json();
        setFileInfo({ key: result.key, name: result.name, size: result.size });
      } catch { alert('File upload failed'); }
      setUploading(false);
    };

    return (
      <form onSubmit={e => {
        e.preventDefault();
        const fd = new FormData(e.target as HTMLFormElement);
        const data: any = {};
        for (const [k, v] of fd.entries()) {
          if (v === '' || k === 'fileInput') continue;
          if (k === 'purchaseCost') { data[k] = parseFloat(v as string); continue; }
          if (k === 'totalSeats') { data[k] = parseInt(v as string); continue; }
          data[k] = v;
        }
        if (!fd.get('assigneeId')) data.assigneeId = null;
        if (fileInfo) {
          data.fileKey = fileInfo.key;
          data.fileName = fileInfo.name;
          data.fileSize = fileInfo.size;
        } else if (defaults?.fileKey) {
          data.fileKey = null;
          data.fileName = null;
          data.fileSize = null;
        }
        onSubmit(data);
      }} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Item/Brand *</label><Input name="item" required defaultValue={defaults?.item || ''} placeholder="e.g. Lenovo" /></div>
          <div><label className="block text-sm font-medium mb-1">Model</label><Input name="model" defaultValue={defaults?.model || ''} placeholder="e.g. ThinkPad P14s Gen 2" /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Serial Number</label><Input name="serialNumber" defaultValue={defaults?.serialNumber || ''} /></div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select name="type" defaultValue={defaults?.type || 'Laptop'} className="w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 dark:border-charcoal-600">
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Assigned To</label>
            <select name="assigneeId" defaultValue={defaults?.assigneeId || ''} className="w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 dark:border-charcoal-600">
              <option value="">Unassigned</option>
              {(employees as any)?.employees
                ?.slice()
                .sort((a: any, b: any) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
                .map((e: any) => (
                <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Factory OS</label>
            <select name="factoryOS" defaultValue={defaults?.factoryOS || ''} className="w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 dark:border-charcoal-600">
              <option value="">—</option>
              {OS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select name="status" defaultValue={defaults?.status || 'Available'} className="w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 dark:border-charcoal-600">
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="block text-sm font-medium mb-1">Warranty End Date</label><Input type="date" name="warrantyEndDate" defaultValue={defaults?.warrantyEndDate ? format(new Date(defaults.warrantyEndDate), 'yyyy-MM-dd') : ''} /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-sm font-medium mb-1">Purchase Cost</label><Input type="number" step="0.01" name="purchaseCost" defaultValue={defaults?.purchaseCost || ''} placeholder="0.00" /></div>
          <div>
            <label className="block text-sm font-medium mb-1">Currency</label>
            <select name="currency" defaultValue={defaults?.currency || 'ILS'} className="w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 dark:border-charcoal-600">
              <option value="ILS">ILS</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="PLN">PLN</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
          <div><label className="block text-sm font-medium mb-1">Purchase Date</label><Input type="date" name="purchaseDate" defaultValue={defaults?.purchaseDate ? format(new Date(defaults.purchaseDate), 'yyyy-MM-dd') : ''} /></div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div><label className="block text-sm font-medium mb-1">CPU</label><Input name="cpu" defaultValue={defaults?.cpu || ''} placeholder="i7-1165G7" /></div>
          <div><label className="block text-sm font-medium mb-1">RAM</label><Input name="ram" defaultValue={defaults?.ram || ''} placeholder="16" /></div>
          <div><label className="block text-sm font-medium mb-1">Storage</label><Input name="storage" defaultValue={defaults?.storage || ''} placeholder="512" /></div>
          <div><label className="block text-sm font-medium mb-1">GPU</label><Input name="gpu" defaultValue={defaults?.gpu || ''} /></div>
        </div>
        <div><label className="block text-sm font-medium mb-1">Notes</label><Input name="notes" defaultValue={defaults?.notes || ''} /></div>
        <div>
          <label className="block text-sm font-medium mb-1">Attachment (Invoice, Receipt, etc.)</label>
          {fileInfo ? (
            <div className="flex items-center gap-2 p-2 border rounded-md bg-gray-50 dark:bg-charcoal-800 dark:border-charcoal-600">
              <FileText size={16} className="text-blue-500 shrink-0" />
              <span className="text-sm truncate flex-1">{fileInfo.name}</span>
              <button type="button" onClick={() => setFileInfo(null)} className="p-0.5 text-gray-400 hover:text-red-500"><X size={14} /></button>
            </div>
          ) : (
            <div className="relative">
              <Input type="file" name="fileInput" onChange={handleFileUpload} disabled={uploading} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" />
              {uploading && <span className="absolute right-3 top-2 text-xs text-gray-400">Uploading...</span>}
            </div>
          )}
        </div>
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
        <h1 className="text-2xl font-bold">IT Assets</h1>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => {
            if (!sorted.length) return;
            const rows = sorted.map((a: any) => ({
              Item: a.item, 'Serial Number': a.serialNumber || '', Model: a.model || '', Type: a.type,
              'Assigned To': a.assignee ? `${a.assignee.firstName} ${a.assignee.lastName}` : '',
              OS: a.factoryOS || '', Status: a.status,
              Warranty: getWarrantyStatus(a.warrantyEndDate) || '',
              'Warranty End': a.warrantyEndDate ? format(new Date(a.warrantyEndDate), 'yyyy-MM-dd') : '',
              Cost: a.purchaseCost ? `${a.currency || 'ILS'} ${a.purchaseCost}` : '',
              CPU: a.cpu || '', RAM: a.ram || '', Storage: a.storage || '', GPU: a.gpu || '',
              Notes: a.notes || '', File: a.fileName || '',
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'IT Assets');
            XLSX.writeFile(wb, 'it-assets.xlsx');
          }}><Download size={16} /> Export</Button>
          <Button onClick={() => setCreateOpen(true)} className="gap-2"><Plus size={16} /> Add Asset</Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total", value: stats.total, color: "text-gray-600" },
            { label: "In Use", value: stats.inUse, color: "text-blue-500" },
            { label: "Available", value: stats.available, color: "text-emerald-500" },
            { label: "In Repair", value: stats.repair, color: "text-amber-500" },
          ].map(s => (
            <Card key={s.label}><CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </CardContent></Card>
          ))}
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assets..." className="max-w-[200px]" />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 dark:border-charcoal-600">
          <option value="">All Types</option>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 dark:border-charcoal-600">
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {osOptions.length > 1 && (
          <select value={osFilter} onChange={e => setOsFilter(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 dark:border-charcoal-600">
            <option value="">All OS</option>
            {osOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        {cpuOptions.length > 1 && (
          <select value={cpuFilter} onChange={e => setCpuFilter(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 dark:border-charcoal-600">
            <option value="">All CPUs</option>
            {cpuOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {ramOptions.length > 1 && (
          <select value={ramFilter} onChange={e => setRamFilter(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 dark:border-charcoal-600">
            <option value="">All RAM</option>
            {ramOptions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        {storageOptions.length > 1 && (
          <select value={storageFilter} onChange={e => setStorageFilter(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 dark:border-charcoal-600">
            <option value="">All Storage</option>
            {storageOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 dark:bg-charcoal-800 rounded animate-pulse" />)}</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-300">
          <Monitor size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No assets found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                {COLUMNS.map(col => (
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
              {sorted.map((a: any) => (
                <React.Fragment key={a.id}>
                <tr className="border-b hover:bg-gray-50 dark:hover:bg-charcoal-800 group">
                  <td className="px-3 py-2 font-medium">{a.item}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-mono text-xs">{a.serialNumber || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{a.model || '—'}</td>
                  <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{a.type}</Badge></td>
                  <td className="px-3 py-2">{a.assignee ? `${a.assignee.firstName} ${a.assignee.lastName}` : '—'}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-300">{a.factoryOS || '—'}</td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[a.status] || ''}`}>{a.status}</span></td>
                  {(() => { const ws = getWarrantyStatus(a.warrantyEndDate); return (
                    <td className="px-3 py-2">{ws ? <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${WARRANTY_COLORS[ws] || ''}`}>{ws}</span> : '—'}</td>
                  ); })()}
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-300 text-xs">{a.warrantyEndDate ? format(new Date(a.warrantyEndDate), 'MMM d, yyyy') : '—'}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-300 text-xs">{a.purchaseCost ? `${a.currency || 'ILS'} ${a.purchaseCost.toLocaleString()}` : '—'}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-300 text-xs">{a.cpu || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-300 text-xs">{a.ram || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-300 text-xs">{a.storage || '—'}</td>
                  <td className="px-3 py-2">{a.fileKey ? (
                    <a href={`/api/files/download?path=${encodeURIComponent(a.fileKey)}&download=1`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 flex items-center gap-1" title={a.fileName || 'Download'}>
                      <FileText size={14} /><span className="text-xs truncate max-w-[80px]">{a.fileName || 'File'}</span>
                    </a>
                  ) : '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setNotesAssetId(notesAssetId === a.id ? null : a.id)} className="p-1 text-blue-400 hover:text-blue-600" title="Notes"><MessageSquare size={14} /></button>
                      <button onClick={() => setEditId(a.id)} className="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-300"><Pencil size={14} /></button>
                      <button onClick={() => { if (confirm('Delete this asset?')) deleteMutation.mutate({ id: a.id }); }} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
                {/* Inline notes panel */}
                {notesAssetId === a.id && (
                  <tr className="bg-gray-50 dark:bg-charcoal-800/50">
                    <td colSpan={15} className="px-6 py-4">
                      <div className="max-w-2xl">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold flex items-center gap-1.5">
                            <MessageSquare size={14} /> Notes — {a.item} {a.model || ''}
                          </h4>
                          <button onClick={() => setNotesAssetId(null)} className="text-gray-400 hover:text-gray-600 text-xs">Close</button>
                        </div>
                        <div className="space-y-3 mb-4">
                          {notesAsset?.assetNotes?.length ? notesAsset.assetNotes.map((note: any) => (
                            <div key={note.id} className="flex gap-3 group/note">
                              <Avatar className="h-7 w-7 shrink-0">
                                <AvatarFallback className="text-[10px]">{note.author.firstName?.[0]}{note.author.lastName?.[0]}</AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs">
                                  <span className="font-medium">{note.author.firstName} {note.author.lastName}</span>
                                  <span className="text-gray-400 ml-2">{format(new Date(note.createdAt), "MMM d, yyyy 'at' HH:mm")}</span>
                                  <button
                                    onClick={() => deleteNoteMutation.mutate({ id: note.id })}
                                    className="ml-2 opacity-0 group-hover/note:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                                    title="Delete note"
                                  ><Trash2 size={10} /></button>
                                </p>
                                <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 whitespace-pre-line">{note.content}</p>
                              </div>
                            </div>
                          )) : (
                            <p className="text-xs text-gray-400 dark:text-gray-500">No notes yet.</p>
                          )}
                        </div>
                        <form
                          onSubmit={e => { e.preventDefault(); if (newNote.trim()) addNoteMutation.mutate({ assetId: a.id, content: newNote.trim() }); }}
                          className="flex gap-2"
                        >
                          <Input
                            value={newNote}
                            onChange={e => setNewNote(e.target.value)}
                            placeholder="Add a note..."
                            className="flex-1 text-sm"
                          />
                          <Button type="submit" size="sm" disabled={!newNote.trim() || addNoteMutation.isPending} className="gap-1">
                            <Send size={14} /> Add
                          </Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Asset</DialogTitle></DialogHeader>
          <AssetForm onSubmit={data => createMutation.mutate(data)} submitLabel="Add Asset" />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editId} onOpenChange={open => { if (!open) setEditId(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Asset</DialogTitle></DialogHeader>
          {editAsset && <AssetForm defaults={editAsset} onSubmit={data => updateMutation.mutate({ id: editId!, ...data })} submitLabel="Save Changes" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
