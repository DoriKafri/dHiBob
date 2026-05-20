"use client";
import React, { useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Mail, MapPin, FileText, Plus, Camera, Trash2, X, PenTool } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { useSession } from "next-auth/react";
import { profileDocsFolder, avatarsFolder } from "@/lib/people-folder";
import { currencySymbol, convertCurrency, type ExchangeRates } from "@/lib/currency";
import { SignaturePad } from "@/components/documents/signature-pad";
import { SignatureDialog } from "@/components/documents/signature-dialog";
import { PlacementDialog } from "@/components/documents/placement-dialog";

function statusVariant(status: string): "success" | "warning" | "secondary" | "destructive" {
  if (status === 'ACTIVE') return 'success';
  if (status === 'ON_LEAVE') return 'warning';
  if (status === 'TERMINATED') return 'destructive';
  return 'secondary';
}

function statusLabel(status: string): string {
  if (status === 'ACTIVE') return 'Active';
  if (status === 'ON_LEAVE') return 'On Leave';
  if (status === 'INACTIVE') return 'Inactive';
  if (status === 'TERMINATED') return 'Terminated';
  return status;
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

const tabTriggerClass =
  "data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary-500 rounded-none px-4 pb-3 text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 data-[state=active]:text-charcoal-900 dark:data-[state=active]:text-white transition-colors";

function FieldCell({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      {label && <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>}
      <p className="text-sm text-charcoal-900 dark:text-white">{value || '—'}</p>
    </div>
  );
}

function EditableField({
  label,
  value,
  onSave,
}: {
  label: string;
  value?: string | null;
  onSave: (val: string) => unknown;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== (value ?? '')) {
      onSave(trimmed);
    }
  };

  return (
    <div>
      {label && <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { setEditing(false); }
          }}
          className="text-sm w-full border-b border-primary-400 dark:border-primary-500 outline-none bg-transparent text-charcoal-900 dark:text-white py-0.5"
        />
      ) : (
        <p
          onClick={() => { setDraft(value || ''); setEditing(true); }}
          className="text-sm text-charcoal-900 dark:text-white cursor-text hover:bg-gray-50 dark:hover:bg-charcoal-800 rounded px-1 -mx-1 min-h-[1.25rem]"
        >
          {value || '—'}
        </p>
      )}
    </div>
  );
}

/** Date picker field — click to open native date picker, saves on change */
function DateField({ label, value, onSave }: {
  label: string;
  value?: string | null;
  onSave?: (val: string) => unknown;
}) {
  const [editing, setEditing] = useState(false);

  // Convert display value to YYYY-MM-DD for the date input
  function toIso(v: string | null | undefined): string {
    if (!v) return '';
    const s = String(v);
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // ISO string with time — extract date part
    if (s.includes('T')) return s.slice(0, 10);
    // Try parsing but use UTC parts to avoid timezone shift
    try {
      const d = new Date(s);
      if (isNaN(d.getTime())) return '';
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    } catch { return ''; }
  }

  // Format for display
  function toDisplay(v: string | null | undefined): string {
    if (!v) return '';
    const iso = toIso(v);
    if (!iso) return String(v);
    const [year, month, day] = iso.split('-').map(Number);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[month - 1]} ${day}, ${year}`;
  }

  if (!onSave) {
    return (
      <div>
        {label && <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>}
        <p className="text-sm text-charcoal-900 dark:text-white min-h-[1.25rem]">{toDisplay(value) || '—'}</p>
      </div>
    );
  }

  return (
    <div>
      {label && <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>}
      {editing ? (
        <input
          type="date"
          autoFocus
          defaultValue={toIso(value)}
          onBlur={e => { setEditing(false); if (e.target.value && e.target.value !== toIso(value)) onSave(e.target.value); }}
          onChange={e => { if (e.target.value) { onSave(e.target.value); setEditing(false); } }}
          className="text-sm w-full border-b border-primary-400 dark:border-primary-500 outline-none bg-transparent text-charcoal-900 dark:text-white py-0.5"
        />
      ) : (
        <p
          onClick={() => setEditing(true)}
          className="text-sm text-charcoal-900 dark:text-white cursor-pointer hover:bg-gray-50 dark:hover:bg-charcoal-800 rounded px-1 -mx-1 min-h-[1.25rem]"
        >
          {toDisplay(value) || <span className="text-gray-400">Select date...</span>}
        </p>
      )}
    </div>
  );
}

const BADGE_COLORS: Record<string, string> = {
  intern:       'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  contract:     'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  promotion:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  adjustment:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  // Contract Type
  'full-time':  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'part-time':  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  freelance:    'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  // Salary Type
  'base salary':'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  bonus:        'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  commission:   'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  equity:       'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  // Job Percentage
  '100%':       'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  '90%':        'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  '80%':        'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  '75%':        'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  '70%':        'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  '60%':        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  '50%':        'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  '40%':        'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  '30%':        'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  '25%':        'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
  '20%':        'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  '10%':        'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  // Gender
  'male':       'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'female':     'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  'non-binary': 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  'prefer not to say': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  // Worker Type
  'in-house':   'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  // Currency
  usd:          'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  eur:          'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  gbp:          'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  ils:          'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  cad:          'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  aud:          'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  chf:          'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  jpy:          'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  inr:          'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  brl:          'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300',
  pln:          'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};
function badgeColor(val: string) {
  return BADGE_COLORS[val.toLowerCase()] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';
}

const CONTRACT_TYPE_OPTIONS = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Intern'];
const SALARY_TYPE_OPTIONS   = ['Base Salary', 'Bonus', 'Commission', 'Equity', 'Other'];
const CURRENCY_OPTIONS      = ['USD', 'EUR', 'GBP', 'ILS', 'CAD', 'AUD', 'CHF', 'JPY', 'INR', 'BRL', 'PLN'];

function DropdownBadgeField({
  label,
  value,
  options,
  onSave,
}: {
  label: string;
  value?: string | null;
  options: string[];
  onSave?: (val: string) => unknown;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; openAbove: boolean } | null>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);

  function openDropdown() {
    if (!onSave) return;
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Check if dropdown would go off-screen bottom — if so, open above
      const spaceBelow = window.innerHeight - rect.bottom;
      const openAbove = spaceBelow < 200;
      setCoords({
        top: openAbove ? rect.top - 4 : rect.bottom + 4,
        left: rect.left,
        openAbove,
      });
    }
    setOpen(true);
  }

  return (
    <div className="relative">
      {label && <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>}
      {value ? (
        <span
          ref={triggerRef as React.Ref<HTMLSpanElement>}
          onClick={openDropdown}
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeColor(value)} ${onSave ? 'cursor-pointer hover:opacity-80' : ''}`}
        >
          {value}{onSave && <span className="ml-1 opacity-60">▾</span>}
        </span>
      ) : (
        <p
          ref={triggerRef as React.Ref<HTMLParagraphElement>}
          onClick={openDropdown}
          className={`text-sm text-gray-400 dark:text-gray-500 min-h-[1.25rem] ${onSave ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-charcoal-800 rounded px-1 -mx-1' : ''}`}
        >
          {onSave ? 'Select…' : '—'}
        </p>
      )}
      {open && onSave && coords && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[101] bg-white dark:bg-charcoal-900 border border-gray-200 dark:border-charcoal-700 rounded-md shadow-xl py-1 min-w-[140px]"
            style={coords.openAbove
              ? { bottom: window.innerHeight - coords.top, left: coords.left }
              : { top: coords.top, left: coords.left }}
          >
            {options.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => { onSave(opt); setOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-charcoal-800 transition-colors flex items-center gap-2"
              >
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeColor(opt)}`}>{opt}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EditableBadgeField({
  label,
  value,
  onSave,
}: {
  label: string;
  value?: string | null;
  onSave?: (val: string) => unknown;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== (value ?? '')) onSave?.(trimmed);
  };

  return (
    <div>
      {label && <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') setEditing(false);
          }}
          className="text-sm w-full border-b border-primary-400 dark:border-primary-500 outline-none bg-transparent text-charcoal-900 dark:text-white py-0.5"
        />
      ) : value ? (
        <span
          onClick={() => onSave && (setDraft(value), setEditing(true))}
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeColor(value)} ${onSave ? 'cursor-text' : ''}`}
        >
          {value}
        </span>
      ) : (
        <p
          onClick={() => onSave && (setDraft(''), setEditing(true))}
          className={`text-sm text-gray-400 dark:text-gray-500 min-h-[1.25rem] ${onSave ? 'cursor-text hover:bg-gray-50 dark:hover:bg-charcoal-800 rounded px-1 -mx-1' : ''}`}
        >
          —
        </p>
      )}
    </div>
  );
}

interface DocEntry {
  name: string;
  key?: string;
  url?: string;
}

/** Parse the stored JSON value into a normalized array of file entries.
 *  Backward-compat: single-object values are wrapped into a one-element array. */
function parseDocEntries(value?: string | null): DocEntry[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((e: any) => e && (e.key || e.url || e.name));
    if (parsed && typeof parsed === 'object' && (parsed.key || parsed.url || parsed.name)) return [parsed];
    return [];
  } catch {
    // Legacy plain-text value — treat as a single entry with just a name
    return value.trim() ? [{ name: value }] : [];
  }
}

function EmployeeITSection({ employeeId }: { employeeId: string }) {
  const { data: assets, isLoading: assetsLoading } = trpc.employee.getEmployeeAssets.useQuery({ employeeId });
  const { data: licenseAssignments, isLoading: licensesLoading } = trpc.employee.getEmployeeLicenses.useQuery({ employeeId });

  return (
    <>
      {/* Assigned Hardware */}
      <SectionCard title="Assigned Hardware" subtitle="Equipment assigned to this employee via IT Assets">
        {assetsLoading ? (
          <div className="animate-pulse h-12 bg-gray-100 dark:bg-charcoal-800 rounded" />
        ) : !assets?.length ? (
          <p className="text-sm text-gray-400">No hardware assigned.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  {['Item', 'Model', 'Serial Number', 'Type', 'OS', 'Status', 'Warranty'].map(h => (
                    <th key={h} className="px-3 py-2 text-xs font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assets.map((a: any) => (
                  <tr key={a.id} className="border-b">
                    <td className="px-3 py-2 font-medium">{a.item}</td>
                    <td className="px-3 py-2 text-gray-600">{a.model || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 font-mono text-xs">{a.serialNumber || '—'}</td>
                    <td className="px-3 py-2 text-gray-500">{a.type}</td>
                    <td className="px-3 py-2 text-gray-500">{a.factoryOS || '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${a.status === 'In Use' ? 'bg-sky-200 text-sky-800 dark:bg-sky-500/30 dark:text-sky-200' : 'bg-gray-100 text-gray-600'}`}>{a.status}</span>
                    </td>
                    <td className="px-3 py-2">
                      {(() => {
                      const ws = a.warrantyEndDate
                        ? new Date(a.warrantyEndDate) >= new Date() ? 'Under warranty' : 'Out of warranty'
                        : null;
                      return ws ? (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${ws === 'Under warranty' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{ws}</span>
                      ) : '—';
                    })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Assigned Licenses */}
      <SectionCard title="Software Licenses" subtitle="Licenses assigned to this employee via IT Licenses">
        {licensesLoading ? (
          <div className="animate-pulse h-12 bg-gray-100 dark:bg-charcoal-800 rounded" />
        ) : !licenseAssignments?.length ? (
          <p className="text-sm text-gray-400">No licenses assigned.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {licenseAssignments.map((la: any) => {
              const l = la.license;
              const catConfig: Record<string, { bg: string; border: string; icon: string; accent: string }> = {
                AI: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800', icon: 'bg-emerald-500', accent: 'text-emerald-600 dark:text-emerald-400' },
                Communication: { bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200 dark:border-purple-800', icon: 'bg-purple-500', accent: 'text-purple-600 dark:text-purple-400' },
                Development: { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', icon: 'bg-amber-500', accent: 'text-amber-600 dark:text-amber-400' },
                Identity: { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', icon: 'bg-blue-500', accent: 'text-blue-600 dark:text-blue-400' },
                Security: { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800', icon: 'bg-red-500', accent: 'text-red-600 dark:text-red-400' },
                General: { bg: 'bg-gray-50 dark:bg-charcoal-800/50', border: 'border-gray-200 dark:border-charcoal-700', icon: 'bg-gray-500', accent: 'text-gray-600 dark:text-gray-400' },
              };
              const c = catConfig[l.category] || catConfig.General;
              const isReserved = la.status === 'RESERVED';
              return (
                <div key={la.id} className={`relative rounded-xl border p-4 ${c.bg} ${c.border} transition-shadow hover:shadow-md`}>
                  {isReserved && (
                    <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">Reserved</span>
                  )}
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg ${c.icon} flex items-center justify-center shrink-0`}>
                      <span className="text-white font-bold text-sm">{l.item.charAt(0)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{l.item}</p>
                      {l.planName && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{l.planName}</p>}
                      <p className={`text-[10px] font-medium mt-1 ${c.accent}`}>{l.category}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </>
  );
}

function docEntryHref(entry: DocEntry): string {
  if (entry.key) return `/api/files/redirect?key=${encodeURIComponent(entry.key)}`;
  if (entry.url) return entry.url;
  return '#';
}

function DocumentField({
  label,
  value,
  onSave,
  folder = 'profile_docs',
  mode = 'multi',
}: {
  label: string;
  value?: string | null;
  onSave?: (val: string) => unknown;
  folder?: string;
  /** "multi" = unlimited uploads, appends to list. "single" = one file, upload replaces. */
  mode?: 'single' | 'multi';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const entries = parseDocEntries(value);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onSave) return;
    e.target.value = '';
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', folder);
      const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || 'Upload failed');
      }
      const { key, name } = await res.json();
      const updated = mode === 'single'
        ? [{ name, key }]               // replace — caller handles archiving
        : [...entries, { name, key }];   // append
      await onSave(JSON.stringify(updated));
    } catch (err) {
      console.error('[DocumentField] upload error:', err);
      alert(`Upload failed: ${(err as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (index: number) => {
    if (!onSave) return;
    const removed = entries[index];
    // Delete the actual file from storage (S3 or local disk)
    if (removed?.key) {
      try {
        await fetch(`/api/files/delete?key=${encodeURIComponent(removed.key)}`, { method: 'DELETE' });
      } catch (err) {
        console.error('[DocumentField] delete error:', err);
      }
    }
    const updated = entries.filter((_, i) => i !== index);
    await onSave(updated.length > 0 ? JSON.stringify(updated) : '');
  };

  return (
    <div>
      {label && <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>}
      <div className="space-y-1">
        {entries.length > 0 ? (
          entries.map((entry, i) => (
            <div key={`${entry.key ?? entry.name}-${i}`} className="flex items-center gap-1.5 group">
              <a
                href={docEntryHref(entry)}
                target="_blank"
                rel="noopener noreferrer"
                download={entry.name}
                className="flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 hover:underline max-w-[160px] truncate"
                title={entry.name}
              >
                <FileText size={14} className="shrink-0" />
                <span className="truncate">{entry.name}</span>
              </a>
              {onSave && (
                <button
                  type="button"
                  onClick={() => handleRemove(i)}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity shrink-0"
                  title="Remove file"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500">
            <FileText size={14} />
            <span>{uploading ? 'Uploading…' : 'No files'}</span>
          </span>
        )}
        {onSave && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs text-primary-500 hover:text-primary-600 disabled:opacity-50 mt-1"
            title="Add another file"
          >
            <Plus size={12} strokeWidth={2.5} />
            <span>{uploading ? 'Uploading…' : 'Add file'}</span>
          </button>
        )}
        <input ref={inputRef} type="file" className="hidden" onChange={handleFile} />
      </div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border border-gray-100 dark:border-charcoal-800 shadow-sm bg-white dark:bg-charcoal-900 mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-bold text-charcoal-900 dark:text-white">{title}</CardTitle>
        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function StatusDropdown({
  status,
  onChange,
  onTerminate,
}: {
  status: string;
  onChange: (s: 'ACTIVE' | 'INACTIVE') => unknown;
  onTerminate: (endDate: string, reason: string) => unknown;
}) {
  const [open, setOpen] = useState(false);
  const [showTermModal, setShowTermModal] = useState(false);
  const [termDate, setTermDate] = useState(new Date().toISOString().slice(0, 10));
  const [termReason, setTermReason] = useState('');

  function submitTerminate() {
    if (!termDate) return;
    onTerminate(termDate, termReason);
    setShowTermModal(false);
    setTermReason('');
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="focus:outline-none"
        title="Change status"
      >
        <Badge variant={statusVariant(status)} className="cursor-pointer hover:opacity-80 transition-opacity pr-1.5">
          {statusLabel(status)}<span className="ml-1 opacity-70">▾</span>
        </Badge>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-white dark:bg-charcoal-900 border border-gray-200 dark:border-charcoal-700 rounded-md shadow-lg py-1 min-w-[140px]">
            {(['ACTIVE', 'INACTIVE'] as const).map(val => (
              <button
                key={val}
                type="button"
                onClick={() => { onChange(val); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-charcoal-800 transition-colors ${status === val ? 'font-semibold' : ''}`}
              >
                {val === 'ACTIVE' ? 'Active' : 'Not Active'}
              </button>
            ))}
            {status !== 'TERMINATED' && (
              <>
                <div className="my-1 border-t border-gray-100 dark:border-charcoal-700" />
                <button
                  type="button"
                  onClick={() => { setOpen(false); setShowTermModal(true); }}
                  className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  Terminate…
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Termination modal */}
      {showTermModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-charcoal-900 rounded-lg shadow-xl p-6 w-full max-w-sm mx-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Terminate Employee</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last working day <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={termDate}
                  onChange={e => setTermDate(e.target.value)}
                  className="w-full border border-gray-300 dark:border-charcoal-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason</label>
                <select
                  value={termReason}
                  onChange={e => setTermReason(e.target.value)}
                  className="w-full border border-gray-300 dark:border-charcoal-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  <option value="">Select a reason…</option>
                  <option value="Company Decision">Company Decision</option>
                  <option value="Employee Decision">Employee Decision</option>
                  <option value="Resignation">Resignation</option>
                  <option value="Layoff">Layoff</option>
                  <option value="Performance">Performance</option>
                  <option value="Contract End">Contract End</option>
                  <option value="Mutual Agreement">Mutual Agreement</option>
                  <option value="Retirement">Retirement</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowTermModal(false)}
                className="flex-1 px-4 py-2 text-sm font-medium border border-gray-300 dark:border-charcoal-600 rounded-md hover:bg-gray-50 dark:hover:bg-charcoal-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitTerminate}
                disabled={!termDate}
                className="flex-1 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Terminate
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Renders EditableField when onSave is provided, FieldCell otherwise.
 *  Must be defined at module level — never inside a render function — so
 *  React keeps a stable component identity and doesn't reset local state. */
function F({ label, value, onSave }: { label: string; value: string; onSave?: (v: string) => unknown }) {
  return onSave
    ? <EditableField label={label} value={value || null} onSave={onSave} />
    : <FieldCell label={label} value={value || null} />;
}

/** Manager picker — dropdown to select this employee's Team Leader (TL) */
function ManagerPicker({ label, currentManagerId, currentManagerName, onSave }: {
  label: string;
  currentManagerId?: string | null;
  currentManagerName: string;
  onSave?: (managerId: string) => unknown;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const { data: employees } = trpc.employee.list.useQuery({ limit: 100 }, { enabled: open });

  const empList = ((employees as any)?.employees ?? []).filter((e: any) =>
    !search || `${e.firstName} ${e.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  function openPicker() {
    if (!onSave) return;
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(true);
    setSearch('');
  }

  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <div
        ref={triggerRef}
        onClick={openPicker}
        className={`text-sm min-h-[1.25rem] ${onSave ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-charcoal-800 rounded px-1 -mx-1' : ''}`}
      >
        {currentManagerName || (onSave ? <span className="text-gray-400">Select manager...</span> : <span className="text-gray-400">—</span>)}
      </div>
      {open && coords && onSave && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
          <div className="fixed z-[101] bg-white dark:bg-charcoal-900 border border-gray-200 dark:border-charcoal-700 rounded-lg shadow-xl py-1 min-w-[240px] max-h-[300px]" style={{ top: coords.top, left: coords.left }}>
            <div className="px-3 py-2 border-b border-gray-100 dark:border-charcoal-700">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full text-sm border-0 outline-none bg-transparent"
                autoFocus
              />
            </div>
            <div className="max-h-[240px] overflow-y-auto">
              <button
                type="button"
                onClick={() => { onSave(''); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 dark:hover:bg-charcoal-800"
              >
                No manager
              </button>
              {empList.map((emp: any) => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => { onSave(emp.id); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-charcoal-800 flex items-center gap-2 ${emp.id === currentManagerId ? 'font-semibold' : ''}`}
                >
                  {emp.avatar ? (
                    <img src={emp.avatar} className="w-5 h-5 rounded-full object-cover" alt="" />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-purple-500 text-white text-[10px] font-medium inline-flex items-center justify-center">
                      {emp.firstName?.[0]}{emp.lastName?.[0]}
                    </span>
                  )}
                  {emp.firstName} {emp.lastName}
                  {(emp as any).department?.name && <span className="text-[10px] text-gray-400 ml-auto">{(emp as any).department.name}</span>}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function EmployeeProfilePage({ params }: { params: { id: string } }) {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const role = session?.user.role;
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const isAdmin = isSuperAdmin || role === 'ADMIN' || role === 'HR' || role === 'OPERATOR';
  const isSelf = session?.user.employeeId === params.id;
  const canEditAvatar = isAdmin || isSelf;
  const canSeeSensitive = isAdmin || isSelf;
  const canSeeSalary = (isAdmin && role !== 'OPERATOR') || isSelf;
  const canSeeFiles = isAdmin || isSelf; // employees can't see other employees' files

  const { data: employee, isLoading, error } = trpc.employee.getById.useQuery(
    { id: params.id },
    { retry: false }
  );
  const { data: exchangeRates } = trpc.employee.getExchangeRates.useQuery();

  const utils = trpc.useContext();
  const invalidate = () => utils.employee.getById.invalidate({ id: params.id });

  const updateEmployee = trpc.employee.update.useMutation({ onSuccess: invalidate });
  const terminateEmployee = trpc.employee.terminate.useMutation({ onSuccess: invalidate });
  const updateRole = trpc.employee.updateRole.useMutation({ onSuccess: invalidate });
  const updatePersonalInfo = trpc.employee.updatePersonalInfo.useMutation({ onSuccess: invalidate });
  const updateWorkInfo = trpc.employee.updateWorkInfo.useMutation({ onSuccess: invalidate });

  // Signature request helpers
  const { data: companyDocs } = trpc.document.list.useQuery({});
  const createDoc = trpc.document.createForSignature.useMutation();
  const requestSignature = trpc.signature.requestSignature.useMutation();
  const { data: pendingSignatures, refetch: refetchPending } = trpc.signature.getPending.useQuery();
  const signMutation = trpc.signature.sign.useMutation({ onSuccess: () => { refetchPending(); invalidate(); } });
  const declineMutation = trpc.signature.decline.useMutation({ onSuccess: () => { refetchPending(); invalidate(); } });
  const [signingRecord, setSigningRecord] = useState<{ id: string; documentName: string; requesterName?: string; placements?: string | null } | null>(null);
  const [placementDocId, setPlacementDocId] = useState<string | null>(null);
  const [placementDocName, setPlacementDocName] = useState('');

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', avatarsFolder({ id: params.id, firstName: employee?.firstName, lastName: employee?.lastName }));
      const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || 'Upload failed');
      }
      const { key } = await res.json();
      // Store the redirect URL so any <img src> resolves to a fresh presigned URL per fetch.
      await updateEmployee.mutateAsync({ id: params.id, avatar: `/api/files/redirect?key=${encodeURIComponent(key)}` } as any);
    } catch (err) {
      console.error('[avatar] upload error:', err);
      alert(`Avatar upload failed: ${(err as Error).message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="space-y-6">
        <p className="text-gray-500 dark:text-gray-400">Employee not found.</p>
      </div>
    );
  }

  const personalInfo = JSON.parse(employee.personalInfo || '{}');
  const workInfo = JSON.parse(employee.workInfo || '{}');

  // Per-person S3 folder for any uploads done from this profile
  const docsFolder = profileDocsFolder({ id: employee.id, firstName: employee.firstName, lastName: employee.lastName });

  const jobTitle = workInfo.jobTitle || '';
  const fullName = `${employee.firstName} ${employee.lastName}`;
  // relational display — text override wins if set by admin
  const managerDisplay = workInfo.reportsTo || (employee.manager
    ? `${employee.manager.firstName} ${employee.manager.lastName}`
    : '');
  const officeDisplay = workInfo.office || (employee as any).site?.name || '';
  const departmentName = (employee as any).department?.name ?? '—';
  const startDateFormatted = employee.startDate
    ? format(new Date(employee.startDate), 'MMM d, yyyy')
    : '—';

  // personalInfo fields
  const middleName = personalInfo.middleName || '';
  const phone = personalInfo.phone || '';
  const dateOfBirth = personalInfo.dateOfBirth || '';
  const gender = personalInfo.gender || '';
  const personalEmail = personalInfo.personalEmail || '';
  const allergies = personalInfo.allergies || '';
  const shirtSize = personalInfo.shirtSize || '';
  const nationality = personalInfo.nationality || '';
  const nationalId = personalInfo.nationalId || '';
  const passportNumber = personalInfo.passportNumber || '';
  const address = personalInfo.address || '';
  const city = personalInfo.city || '';
  const stateProvince = personalInfo.stateProvince || '';
  const country = personalInfo.country || '';
  const zipCode = personalInfo.zipCode || '';
  const addressNotes = personalInfo.addressNotes || '';
  const emergencyContactName = personalInfo.emergencyContactName || '';
  const emergencyContactRelationship = personalInfo.emergencyContactRelationship || '';
  const emergencyContactPhone = personalInfo.emergencyContactPhone || '';
  const bankName = personalInfo.bankName || '';
  const bankBranch = personalInfo.bankBranch || '';
  const bankAccount = personalInfo.bankAccount || '';
  const bankAccountName = personalInfo.bankAccountName || '';
  const familyDetails: Array<{ fullName?: string; relationship?: string; dateOfBirth?: string; note?: string; _new?: boolean }> =
    Array.isArray(personalInfo.familyDetails) ? personalInfo.familyDetails.filter(
      (m: any) => m && (m.fullName || m.relationship || m.dateOfBirth || m.note || m._new)
    ) : [];

  // workInfo fields
  const hrContact = workInfo.hrContact || '';
  const bootcampNo = workInfo.bootcampNo || '';
  const mindspaceCardNo = workInfo.mindspaceCardNo || '';
  const terminationDate = workInfo.terminationDate || (employee.endDate ? format(new Date(employee.endDate), 'MMM d, yyyy') : '');
  const terminationReason = workInfo.terminationReason || '';
  const compensationDate = workInfo.compensationDate || startDateFormatted;
  const contractType = workInfo.contractType || '';
  const salaryType = workInfo.salaryType || '';
  const salaryAmount = workInfo.salaryAmount || '';
  const salaryCurrency = workInfo.salaryCurrency || '';
  const compensationNote = workInfo.compensationNote || '';
  const assets: Array<{ category?: string; description?: string; dateLoaned?: string; dateReturned?: string; assetsCost?: string; notes?: string }> =
    Array.isArray(workInfo.assets) ? workInfo.assets : [];
  const salaryHistory: Array<{ effectiveDate?: string; contractType?: string; salaryType?: string; salaryAmount?: string; contractDoc?: string; salaryCurrency?: string; note?: string }> =
    Array.isArray(workInfo.salaryHistory) ? workInfo.salaryHistory : [];
  const certifications: Array<{ name?: string; issuingAuthority?: string; issueDate?: string; expiryDate?: string; documentUrl?: string }> =
    Array.isArray(workInfo.certifications) ? workInfo.certifications : [];

  // Save helpers
  const canEdit = isAdmin || isSelf;
  const pi = (field: string) => canEdit
    ? (val: string) => updatePersonalInfo.mutateAsync({ id: params.id, [field]: val } as any)
    : undefined;
  const wi = (field: string) => canEdit
    ? (val: string) => updateWorkInfo.mutateAsync({ id: params.id, [field]: val } as any)
    : undefined;

  // Per-row save helpers for arrays
  const saveFamilyField = (idx: number, field: string) => canEdit
    ? (val: string) => {
        const updated = familyDetails.map((m, i) => {
          if (i !== idx) return m;
          const { _new, ...rest } = m;
          return { ...rest, [field]: val };
        });
        return updatePersonalInfo.mutateAsync({ id: params.id, familyDetails: updated } as any);
      }
    : undefined;
  const addFamilyMember = () => {
    const updated = [...familyDetails, { fullName: '', relationship: '', _new: true }];
    updatePersonalInfo.mutateAsync({ id: params.id, familyDetails: updated } as any);
  };
  const deleteFamilyMember = (idx: number) => {
    const updated = familyDetails.filter((_, i) => i !== idx);
    updatePersonalInfo.mutateAsync({ id: params.id, familyDetails: updated } as any);
  };

  const saveSalaryField = (idx: number, field: string) => isAdmin
    ? (val: string) => {
        const base = salaryHistory.length > 0 ? salaryHistory : [{}];
        const updated = base.map((e, i) => i === idx ? { ...e, [field]: val } : e);
        return updateWorkInfo.mutateAsync({ id: params.id, salaryHistory: updated } as any);
      }
    : undefined;

  const addSalaryEntry = () => {
    const updated = [...salaryHistory, { effectiveDate: '', contractType: '', salaryType: '', salaryAmount: '', contractDoc: '', salaryCurrency: '', note: '' }];
    updateWorkInfo.mutateAsync({ id: params.id, salaryHistory: updated } as any);
  };
  const deleteSalaryEntry = (idx: number) => {
    const updated = salaryHistory.filter((_, i) => i !== idx);
    updateWorkInfo.mutateAsync({ id: params.id, salaryHistory: updated } as any);
  };

  const saveAssetField = (idx: number, field: string) => isAdmin
    ? (val: string) => {
        const base = assets.length > 0 ? assets : [{}];
        const updated = base.map((a, i) => i === idx ? { ...a, [field]: val } : a);
        return updateWorkInfo.mutateAsync({ id: params.id, assets: updated } as any);
      }
    : undefined;

  const addAssetEntry = () => {
    const updated = [...assets, { category: '', description: '', dateLoaned: '', dateReturned: '', assetsCost: '', assetCurrency: workInfo.assetBudgetCurrency || 'ILS', notes: '' }];
    updateWorkInfo.mutateAsync({ id: params.id, assets: updated } as any);
  };

  // Certifications helpers — employees can manage their own
  const saveCertField = (idx: number, field: string) => (isAdmin || isSelf)
    ? (val: string) => {
        const base = certifications.length > 0 ? certifications : [{}];
        const updated = base.map((e, i) => i === idx ? { ...e, [field]: val } : e);
        return updateWorkInfo.mutateAsync({ id: params.id, certifications: updated } as any);
      }
    : undefined;

  const addCertEntry = () => {
    const updated = [...certifications, { name: '', issuingAuthority: '', issueDate: '', expiryDate: '', documentUrl: '' }];
    updateWorkInfo.mutateAsync({ id: params.id, certifications: updated } as any);
  };

  const deleteCertEntry = (idx: number) => {
    const updated = certifications.filter((_, i) => i !== idx);
    updateWorkInfo.mutateAsync({ id: params.id, certifications: updated } as any);
  };

  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card className="border-none shadow-sm bg-white dark:bg-charcoal-900">
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            <div className="relative group shrink-0">
              <Avatar className="h-20 w-20">
                {employee.avatar && <AvatarImage src={employee.avatar} alt={fullName} className="object-cover" />}
                <AvatarFallback className="text-2xl bg-primary-100 text-primary-600 font-bold">
                  {getInitials(employee.firstName, employee.lastName)}
                </AvatarFallback>
              </Avatar>
              {canEditAvatar && (
                <>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Upload photo"
                  >
                    <Camera size={22} className="text-white" />
                  </button>
                  <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
                </>
              )}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{fullName}</h1>
                {isAdmin ? (
                  <div className="relative">
                    <StatusDropdown
                      status={employee.status}
                      onChange={(s) => updateEmployee.mutateAsync({ id: params.id, status: s } as any)}
                      onTerminate={(endDate, reason) => terminateEmployee.mutateAsync({ id: params.id, endDate: new Date(endDate), reason })}
                    />
                  </div>
                ) : (
                  <Badge variant={statusVariant(employee.status)}>{statusLabel(employee.status)}</Badge>
                )}
                {isAdmin && (employee as any).user && (
                  <select
                    value={(employee as any).user.role}
                    onChange={e => updateRole.mutateAsync({ employeeId: params.id, role: e.target.value as any })}
                    className="text-xs border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-charcoal-800 text-gray-700 dark:text-gray-300"
                  >
                    <option value="EMPLOYEE">Employee</option>
                    <option value="IT">IT</option>
                    <option value="OPERATOR">Operator</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                )}
              </div>
              <p className="text-gray-500 dark:text-gray-400 font-medium">
                {jobTitle || '—'} • {departmentName}
                {managerDisplay && <span className="text-gray-400"> • TL: <a href={employee.manager ? `/people/${employee.manager.id}` : '#'} className="text-primary-500 hover:underline">{managerDisplay}</a></span>}
              </p>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1 font-medium"><Mail size={14} className="text-gray-400" />{employee.email}</span>
                {officeDisplay && (
                  <span className="flex items-center gap-1 font-medium"><MapPin size={14} className="text-gray-400" />{officeDisplay}</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 7-tab layout */}
      <Tabs defaultValue={searchParams.get('tab') || 'profile'}>
        <TabsList className="bg-transparent border-b border-gray-200 dark:border-charcoal-800 rounded-none h-auto p-0 w-full justify-start gap-1">
          <TabsTrigger value="profile" className={tabTriggerClass}>Profile</TabsTrigger>
          {canSeeSensitive && <TabsTrigger value="work" className={tabTriggerClass}>Work</TabsTrigger>}
          {canSeeSensitive && <TabsTrigger value="assets" className={tabTriggerClass}>Assets</TabsTrigger>}

          {(canSeeSensitive || isSelf) && <TabsTrigger value="it-equipment" className={tabTriggerClass}>IT Equipment & Licenses</TabsTrigger>}
          {canSeeSensitive && <TabsTrigger value="bank" className={tabTriggerClass}>Bank Details</TabsTrigger>}
          {canSeeSensitive && <TabsTrigger value="pension" className={tabTriggerClass}>Pension</TabsTrigger>}
        </TabsList>

        {/* Profile tab (merged Profile + Personal) */}
        <TabsContent value="profile" className="mt-6 space-y-4">
          <SectionCard
            title="General Info"
            subtitle="See and edit the employee's personal and public information"
          >
            <div className="grid grid-cols-5 gap-4 mb-4">
              <F label="First Name" value={employee.firstName}
                onSave={canEdit ? (val) => updateEmployee.mutateAsync({ id: params.id, firstName: val }) : undefined} />
              <F label="Middle Name" value={middleName} onSave={pi('middleName')} />
              <F label="Last Name" value={employee.lastName}
                onSave={canEdit ? (val) => updateEmployee.mutateAsync({ id: params.id, lastName: val }) : undefined} />
              <F label="Work Email" value={employee.email}
                onSave={isAdmin ? (val) => updateEmployee.mutateAsync({ id: params.id, email: val } as any) : undefined} />
              <F label="Phone Number" value={phone} onSave={pi('phone')} />
            </div>
            <div className="grid grid-cols-5 gap-4 mb-4">
              <DateField label="Date of Birth" value={dateOfBirth} onSave={pi('dateOfBirth')} />
              <DropdownBadgeField label="Gender" value={gender} options={['Male', 'Female', 'Non-binary', 'Prefer not to say']} onSave={canEdit ? (val) => { const fn = pi('gender'); if (fn) fn(val); } : undefined} />
              <F label="Personal Email" value={personalEmail} onSave={pi('personalEmail')} />
              <F label="Allergies/food preference" value={allergies} onSave={pi('allergies')} />
              <F label="Shirt Size" value={shirtSize} onSave={pi('shirtSize')} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              {canSeeFiles && <DocumentField label="Documents" value={personalInfo.documents} folder={docsFolder} onSave={canEdit ? pi('documents') : undefined} />}
              {canSeeFiles && <DocumentField label="CV" value={personalInfo.cv} folder={docsFolder} mode="single" onSave={canEdit ? async (val) => {
                // Auto-archive: push the current CV into the cvOld array before replacing
                const currentCvEntries = parseDocEntries(personalInfo.cv);
                const oldEntries = parseDocEntries(personalInfo.cvOld);
                const mergedOld = [...oldEntries, ...currentCvEntries];
                await updatePersonalInfo.mutateAsync({
                  id: params.id,
                  cv: val,
                  cvOld: mergedOld.length > 0 ? JSON.stringify(mergedOld) : undefined,
                } as any);
              } : undefined} />}
              {canSeeFiles && <DocumentField label="CV Old" value={personalInfo.cvOld} folder={docsFolder} onSave={canEdit ? pi('cvOld') : undefined} />}
            </div>
          </SectionCard>

          <SectionCard
            title="Certifications"
            subtitle="Professional certifications and licenses"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-charcoal-700">
                    <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-2 pr-4">Name</th>
                    <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-2 pr-4">Issuing Authority</th>
                    <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-2 pr-4">Issue Date</th>
                    <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-2 pr-4">Expiry Date</th>
                    <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-2 pr-4">Document</th>
                    {(isAdmin || isSelf) && <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-2 w-10"></th>}
                  </tr>
                </thead>
                <tbody>
                  {(certifications.length > 0 ? certifications : [{}]).map((cert, idx) => {
                    let expiryBadge: React.ReactNode = null;
                    if (cert.expiryDate) {
                      const expiry = new Date(cert.expiryDate);
                      const now = new Date();
                      const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                      if (daysUntil < 0) {
                        expiryBadge = <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">Expired</span>;
                      } else if (daysUntil <= 90) {
                        expiryBadge = <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Expiring soon</span>;
                      }
                    }
                    return (
                      <tr key={idx} className="border-b border-gray-100 dark:border-charcoal-800">
                        <td className="py-2 pr-4">
                          <F label="" value={cert.name || ''} onSave={saveCertField(idx, 'name')} />
                        </td>
                        <td className="py-2 pr-4">
                          <F label="" value={cert.issuingAuthority || ''} onSave={saveCertField(idx, 'issuingAuthority')} />
                        </td>
                        <td className="py-2 pr-4">
                          <DateField label="" value={cert.issueDate || ''} onSave={saveCertField(idx, 'issueDate')} />
                        </td>
                        <td className="py-2 pr-4">
                          <div className="flex items-center">
                            <DateField label="" value={cert.expiryDate || ''} onSave={saveCertField(idx, 'expiryDate')} />
                            {expiryBadge}
                          </div>
                        </td>
                        <td className="py-2 pr-4">
                          <DocumentField label="" value={cert.documentUrl || null} folder={docsFolder} onSave={(isAdmin || isSelf) ? saveCertField(idx, 'documentUrl') : undefined} />
                        </td>
                        {(isAdmin || isSelf) && (
                          <td className="py-2">
                            <button
                              onClick={() => deleteCertEntry(idx)}
                              className="text-gray-400 hover:text-red-500 transition-colors"
                              title="Delete certification"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(isAdmin || isSelf) && (
              <button
                onClick={addCertEntry}
                className="mt-4 flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600 font-medium"
              >
                <Plus size={14} /> Add certification
              </button>
            )}
          </SectionCard>

          {canSeeSensitive && <SectionCard
            title="Identification"
            subtitle="Store all forms of personal identification here"
          >
            <div className="grid grid-cols-4 gap-4">
              <F label="Nationality" value={nationality} onSave={pi('nationality')} />
              <F label="Employee ID" value={personalInfo.employeeNumber || employee.id} onSave={pi('employeeNumber')} />
              <F label="National ID" value={nationalId} onSave={pi('nationalId')} />
              <F label="Passport Number" value={passportNumber} onSave={pi('passportNumber')} />
            </div>
          </SectionCard>}

          {canSeeSensitive && <SectionCard
            title="Address"
            subtitle="See and edit the employee's current address"
          >
            <div className="grid grid-cols-5 gap-4 mb-4">
              <F label="Address" value={address} onSave={pi('address')} />
              <F label="City" value={city} onSave={pi('city')} />
              <F label="State/Province" value={stateProvince} onSave={pi('stateProvince')} />
              <F label="Country" value={country} onSave={pi('country')} />
              <F label="Zip Code" value={zipCode} onSave={pi('zipCode')} />
            </div>
            <div>
              <F label="Notes" value={addressNotes} onSave={pi('addressNotes')} />
            </div>
          </SectionCard>}

          {canSeeSensitive && <SectionCard
            title="Emergency Contact"
            subtitle="See and edit the contact details of the employee's emergency contact"
          >
            <div className="grid grid-cols-3 gap-4">
              <F label="Full Name" value={emergencyContactName} onSave={pi('emergencyContactName')} />
              <F label="Relationship" value={emergencyContactRelationship} onSave={pi('emergencyContactRelationship')} />
              <F label="Phone Number" value={emergencyContactPhone} onSave={pi('emergencyContactPhone')} />
            </div>
          </SectionCard>}

          {canSeeSensitive && <SectionCard title="Family Details">
            {familyDetails.length === 0 && !canEdit && (
              <p className="text-sm text-gray-500 dark:text-gray-400">No family members recorded.</p>
            )}
            {familyDetails.map((member, i) => (
              <div key={i} className="mb-4 border-b border-gray-100 dark:border-charcoal-800 pb-4 last:border-0 last:pb-0">
                <div className="grid grid-cols-3 gap-4">
                  <F label="Full Name" value={member.fullName || ''} onSave={saveFamilyField(i, 'fullName')} />
                  <F label="Relationship" value={member.relationship || ''} onSave={saveFamilyField(i, 'relationship')} />
                  {canEdit && (
                    <div className="flex items-end justify-end">
                      <button
                        onClick={() => deleteFamilyMember(i)}
                        className="text-gray-400 hover:text-red-500 transition-colors mb-1"
                        title="Remove family member"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
                {(member.dateOfBirth || member.note || canEdit) && (
                  <div className="grid grid-cols-3 gap-4 mt-2">
                    <DateField label="Date of Birth" value={member.dateOfBirth || ''} onSave={saveFamilyField(i, 'dateOfBirth')} />
                    <F label="Note" value={member.note || ''} onSave={saveFamilyField(i, 'note')} />
                  </div>
                )}
              </div>
            ))}
            {canEdit && (
              <button
                onClick={addFamilyMember}
                className="mt-2 flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600 font-medium"
              >
                <Plus size={14} /> Add family member
              </button>
            )}
          </SectionCard>}
        </TabsContent>

        {/* Work tab */}
        {canSeeSensitive && <TabsContent value="work" className="mt-6 space-y-4">
          <SectionCard
            title="Initiation"
            subtitle="Information of when the employee's contract with the company started"
          >
            <div className="grid grid-cols-3 gap-4">
              <DateField label="Start Date" value={startDateFormatted}
                onSave={isAdmin ? (val) => updateEmployee.mutateAsync({ id: params.id, startDate: val } as any) : undefined} />
              <F label="Bootcamp No." value={bootcampNo} onSave={wi('bootcampNo')} />
              <F label="Mindspace Card No." value={mindspaceCardNo} onSave={wi('mindspaceCardNo')} />
            </div>
          </SectionCard>

          <SectionCard
            title="Termination"
            subtitle="Optional information for when the employee's contract with the company ends"
          >
            <div className="grid grid-cols-2 gap-4">
              <DateField label="Termination Date" value={terminationDate} onSave={wi('terminationDate')} />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Termination Reason</p>
                <select
                  value={terminationReason}
                  onChange={e => wi('terminationReason')?.(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full border border-gray-200 dark:border-charcoal-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-charcoal-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400"
                >
                  <option value="">Select a reason…</option>
                  <option value="Company Decision">Company Decision</option>
                  <option value="Employee Decision">Employee Decision</option>
                  <option value="Resignation">Resignation</option>
                  <option value="Layoff">Layoff</option>
                  <option value="Performance">Performance</option>
                  <option value="Contract End">Contract End</option>
                  <option value="Mutual Agreement">Mutual Agreement</option>
                  <option value="Retirement">Retirement</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </SectionCard>

          {/* Role section */}
          {canSeeSensitive && (
          <SectionCard
            title="Role"
            subtitle="See and edit the employee's role and work environment"
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-gray-500">Effective Date:</span>
              <DateField label="" value={startDateFormatted}
                onSave={isAdmin ? (val) => updateEmployee.mutateAsync({ id: params.id, startDate: val } as any) : undefined} />
            </div>
            <div className="grid grid-cols-7 gap-4">
              <F label="Job" value={jobTitle} onSave={wi('jobTitle')} />
              <DropdownBadgeField label="Job %" value={workInfo.jobPercentage || ''} options={['100%', '90%', '80%', '75%', '70%', '60%', '50%', '40%', '30%', '25%', '20%', '10%']} onSave={isAdmin ? (val) => { const fn = wi('jobPercentage'); if (fn) fn(val); } : undefined} />
              <ManagerPicker
                label="Team Leader (TL)"
                currentManagerId={employee.manager?.id}
                currentManagerName={managerDisplay}
                onSave={isAdmin ? (managerId) => updateEmployee.mutateAsync({ id: params.id, manager: managerId || undefined } as any) : undefined}
              />
              <FieldCell
                label="Group Leader (GL)"
                value={
                  (employee.manager as any)?.manager
                    ? `${(employee.manager as any).manager.firstName} ${(employee.manager as any).manager.lastName}`
                    : null
                }
              />
              <F label="Office" value={officeDisplay} onSave={wi('office')} />
              <F label="HR" value={hrContact} onSave={wi('hrContact')} />
              <DropdownBadgeField label="Worker Type" value={workInfo.workerType || ''} options={['In-house', 'Freelance']} onSave={isAdmin ? (val) => { const fn = wi('workerType'); if (fn) fn(val); } : undefined} />
            </div>
            {(employee as any).directReports?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-charcoal-800">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">Direct Reports ({(employee as any).directReports.length})</p>
                <div className="flex flex-wrap gap-2">
                  {(employee as any).directReports.map((dr: any) => (
                    <a key={dr.id} href={`/people/${dr.id}`} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-charcoal-800 rounded-lg hover:bg-gray-100 dark:hover:bg-charcoal-700 transition-colors">
                      <span className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 text-[10px] font-bold inline-flex items-center justify-center">{dr.firstName?.[0]}{dr.lastName?.[0]}</span>
                      <span className="text-sm font-medium">{dr.firstName} {dr.lastName}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>
          )}

          {/* Pending Signatures — shown to the employee viewing their own profile */}
          {isSelf && pendingSignatures && pendingSignatures.length > 0 && (
            <SectionCard title="">
              <div className="border border-amber-200 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-3 flex items-center gap-2">
                  <PenTool size={16} />
                  Documents Awaiting Your Signature ({pendingSignatures.length})
                </h3>
                <div className="space-y-2">
                  {pendingSignatures.map((rec: any) => (
                    <div key={rec.id} className="flex items-center justify-between bg-white dark:bg-charcoal-800 rounded-md p-3 border border-amber-100 dark:border-amber-800">
                      <div>
                        <p className="font-medium text-sm">{rec.document.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Requested {rec.requestedAt ? new Date(rec.requestedAt).toLocaleDateString() : ''}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSigningRecord({ id: rec.id, documentName: rec.document.name, requesterName: rec.requester ? `${rec.requester.firstName} ${rec.requester.lastName}` : '', placements: (rec as any).placements || null })}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors"
                        >
                          <PenTool size={14} /> Sign
                        </button>
                        <button
                          onClick={() => declineMutation.mutate({ signatureRecordId: rec.id })}
                          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-charcoal-600 rounded-md hover:bg-gray-50 dark:hover:bg-charcoal-700 transition-colors"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          )}

          {/* Signing dialog — shows PDF with placements when available */}
          <SignatureDialog
            open={!!signingRecord}
            onOpenChange={(open) => { if (!open) setSigningRecord(null); }}
            signatureRecord={signingRecord ? {
              id: signingRecord.id,
              documentName: signingRecord.documentName,
              requesterName: signingRecord.requesterName || '',
              placements: signingRecord.placements || null,
            } : null}
            onComplete={() => {
              setSigningRecord(null);
              refetchPending();
              invalidate();
            }}
          />

          {/* PlacementDialog — admin marks signature spots on PDF before sending */}
          <PlacementDialog
            open={!!placementDocId}
            onOpenChange={(open) => { if (!open) setPlacementDocId(null); }}
            documentId={placementDocId || ""}
            documentName={placementDocName}
            presetSignerId={params.id}
            onComplete={() => { setPlacementDocId(null); invalidate(); }}
          />

          {/* Compensation History table */}
          {canSeeSalary && (() => {
            const displayHistory = salaryHistory.length > 0 ? salaryHistory : [{}];
            const sortedHistory = displayHistory
              .map((entry, idx) => ({ entry, idx }))
              .sort((a, b) => {
                const da = a.entry.effectiveDate ? new Date(a.entry.effectiveDate).getTime() : 0;
                const db = b.entry.effectiveDate ? new Date(b.entry.effectiveDate).getTime() : 0;
                return db - da;
              });
            return (
              <SectionCard title="Compensation History">
                <div className="overflow-x-auto overflow-y-visible">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-charcoal-700">
                        {['Effective date', 'Contract Type', 'Salary Type', 'Salary Amount', 'Base (80%)', 'Additional (20%)', 'Contract Documents', 'Salary Currency', 'Note', ...(isAdmin ? [''] : [])].map(col => (
                          <th key={col || 'actions'} className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-2 pr-4 whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedHistory.map(({ entry, idx }) => (
                        <tr key={idx} className="border-b border-gray-100 dark:border-charcoal-800 last:border-0">
                          <td className="py-3 pr-6 min-w-[130px]">
                            <DateField label="" value={entry.effectiveDate || ''} onSave={saveSalaryField(idx, 'effectiveDate')} />
                          </td>
                          <td className="py-3 pr-6 min-w-[140px]">
                            <DropdownBadgeField label="" value={entry.contractType || ''} options={CONTRACT_TYPE_OPTIONS} onSave={isAdmin ? saveSalaryField(idx, 'contractType') : undefined} />
                          </td>
                          <td className="py-3 pr-6 min-w-[140px]">
                            <DropdownBadgeField label="" value={entry.salaryType || ''} options={SALARY_TYPE_OPTIONS} onSave={isAdmin ? saveSalaryField(idx, 'salaryType') : undefined} />
                          </td>
                          <td className="py-3 pr-6 min-w-[120px]">
                            <F label="" value={entry.salaryAmount || ''} onSave={saveSalaryField(idx, 'salaryAmount')} />
                          </td>
                          <td className="py-3 pr-6 min-w-[110px]">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {entry.salaryAmount ? `${currencySymbol(entry.salaryCurrency)}${Math.round(parseFloat(entry.salaryAmount) * 0.8).toLocaleString()}` : '—'}
                            </span>
                          </td>
                          <td className="py-3 pr-6 min-w-[110px]">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {entry.salaryAmount ? `${currencySymbol(entry.salaryCurrency)}${Math.round(parseFloat(entry.salaryAmount) * 0.2).toLocaleString()}` : '—'}
                            </span>
                          </td>
                          <td className="py-3 pr-6 min-w-[160px]">
                            <div className="flex items-center gap-1">
                              <DocumentField label="" value={entry.contractDoc || null} folder={docsFolder} onSave={isAdmin ? saveSalaryField(idx, 'contractDoc') : undefined} />
                              {entry.contractDoc && (() => {
                                const docEntries = parseDocEntries(entry.contractDoc);
                                const fileKey = docEntries[0]?.key;
                                const fileName = docEntries[0]?.name || `Contract - ${employee.firstName} ${employee.lastName}`;
                                const doc = fileKey ? (companyDocs ?? []).find((d: any) => d.filePath === fileKey) : null;
                                const status = doc?.signatureStatus;
                                if (status === 'SIGNED') {
                                  return (
                                    <span className="ml-1 inline-flex items-center gap-1">
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">Signed</span>
                                      <button
                                        type="button"
                                        className="text-[10px] font-medium text-primary-500 hover:text-primary-600 hover:underline"
                                        onClick={async () => {
                                          try {
                                            const records = await utils.signature.getByDocument.fetch({ documentId: doc!.id });
                                            const signed = records.find((r: any) => r.status === 'SIGNED' && r.signedPdfPath);
                                            if (signed) {
                                              const result = await utils.signature.getSignedPdf.fetch({ signatureRecordId: signed.id });
                                              window.open(result.url, '_blank');
                                            }
                                          } catch {
                                            alert('Could not load signed document');
                                          }
                                        }}
                                      >
                                        View
                                      </button>
                                    </span>
                                  );
                                }
                                if (status === 'PENDING_SIGNATURE') {
                                  return <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Pending</span>;
                                }
                                if (isAdmin && fileKey) {
                                  return (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        let docRecord = doc;
                                        if (!docRecord) {
                                          docRecord = await createDoc.mutateAsync({
                                            name: fileName,
                                            filePath: fileKey,
                                            employeeId: params.id,
                                            type: 'CONTRACT',
                                            folder: docsFolder,
                                          });
                                        }
                                        if (docRecord?.id) {
                                          setPlacementDocId(docRecord.id);
                                          setPlacementDocName(docRecord.name || fileName);
                                        }
                                      }}
                                      className="p-1 text-gray-400 hover:text-primary-500 transition-colors"
                                      title="Send for signature"
                                    >
                                      <PenTool size={13} />
                                    </button>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          </td>
                          <td className="py-3 pr-6 min-w-[120px]">
                            <DropdownBadgeField label="" value={entry.salaryCurrency || ''} options={CURRENCY_OPTIONS} onSave={isAdmin ? saveSalaryField(idx, 'salaryCurrency') : undefined} />
                          </td>
                          <td className="py-3 min-w-[160px]">
                            <F label="" value={entry.note || ''} onSave={saveSalaryField(idx, 'note')} />
                          </td>
                          {isAdmin && (
                            <td className="py-3 pl-2">
                              <button
                                onClick={() => deleteSalaryEntry(idx)}
                                className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-400 hover:text-red-600 transition-colors"
                                title="Delete entry"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {isAdmin && (
                  <button onClick={addSalaryEntry} className="mt-4 flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600 font-medium">
                    <Plus size={14} /> Add salary entry
                  </button>
                )}
              </SectionCard>
            );
          })()}
        </TabsContent>}

        {/* Assets tab */}
        {canSeeSensitive && <TabsContent value="assets" className="mt-6 space-y-4">
          {/* Budget summary */}
          {(() => {
            const budgetAmount = parseFloat(workInfo.assetBudget || '2000') || 0;
            const budgetCcy = workInfo.assetBudgetCurrency || 'ILS';
            // Convert every asset's cost to the budget currency, then sum
            const totalSpent = assets.reduce((sum: number, a: any) => {
              const cost = parseFloat(a.assetsCost || '0') || 0;
              if (cost === 0) return sum;
              const aCcy = a.assetCurrency || 'ILS';
              return sum + convertCurrency(cost, aCcy, budgetCcy, exchangeRates as ExchangeRates | undefined);
            }, 0);
            const remaining = budgetAmount - totalSpent;
            const hasConversion = assets.some((a: any) => (a.assetCurrency || 'ILS') !== budgetCcy && parseFloat(a.assetsCost || '0') > 0);
            const sym = currencySymbol(budgetCcy);
            return (
              <SectionCard title="Equipment Budget" subtitle="One-time budget for office and home equipment purchases">
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <F label="Budget Amount" value={workInfo.assetBudget || '2000'} onSave={wi('assetBudget')} />
                  <DropdownBadgeField label="Currency" value={budgetCcy} options={['ILS', 'USD', 'EUR', 'GBP', 'PLN']} onSave={isAdmin ? (val) => { const fn = wi('assetBudgetCurrency'); if (fn) fn(val); } : undefined} />
                  <FieldCell label="Total Spent" value={totalSpent > 0 ? `${sym}${totalSpent.toLocaleString()}` : '—'} />
                  <FieldCell
                    label="Remaining"
                    value={budgetAmount > 0 ? `${sym}${remaining.toLocaleString()}` : '—'}
                  />
                </div>
                {budgetAmount > 0 && (
                  <div className="mt-2">
                    <div className="h-2 rounded-full bg-gray-200 dark:bg-charcoal-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${remaining <= 0 ? 'bg-red-500' : remaining < budgetAmount * 0.25 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.max(0, Math.min(100, (remaining / budgetAmount) * 100))}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {remaining <= 0 ? 'Budget fully used' : `${Math.round((remaining / budgetAmount) * 100)}% remaining`}
                      {hasConversion && ' · includes approximate currency conversion'}
                    </p>
                  </div>
                )}
              </SectionCard>
            );
          })()}

          {/* Individual assets */}
          {(assets.length > 0 ? assets : [{}]).map((asset: any, i) => (
            <SectionCard key={i} title={`Asset ${i + 1}`}>
              <div className="grid grid-cols-6 gap-4 mb-4">
                <F label="Category" value={asset.category || ''} onSave={saveAssetField(i, 'category')} />
                <F label="Description" value={asset.description || ''} onSave={saveAssetField(i, 'description')} />
                <DateField label="Date Loaned" value={asset.dateLoaned || ''} onSave={saveAssetField(i, 'dateLoaned')} />
                <DateField label="Date Returned" value={asset.dateReturned || ''} onSave={saveAssetField(i, 'dateReturned')} />
                <F label="Cost" value={asset.assetsCost || ''} onSave={saveAssetField(i, 'assetsCost')} />
                <DropdownBadgeField label="Currency" value={asset.assetCurrency || 'ILS'} options={['ILS', 'USD', 'EUR', 'GBP', 'PLN']} onSave={isAdmin ? (val) => { const fn = saveAssetField(i, 'assetCurrency'); if (fn) fn(val); } : undefined} />
              </div>
              <div>
                <F label="Notes" value={asset.notes || ''} onSave={saveAssetField(i, 'notes')} />
              </div>
            </SectionCard>
          ))}
          {isAdmin && (
            <button
              onClick={addAssetEntry}
              className="flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600 font-medium"
            >
              <Plus size={14} /> Add asset
            </button>
          )}
        </TabsContent>}

        {/* Certifications tab */}

        {/* IT Equipment & Licenses tab */}
        {(canSeeSensitive || isSelf) && <TabsContent value="it-equipment" className="mt-6 space-y-4">
          <EmployeeITSection employeeId={params.id} />
        </TabsContent>}

        {/* Bank Details tab */}
        {canSeeSensitive && <TabsContent value="bank" className="mt-6 space-y-4">
          <SectionCard
            title="Bank Details"
            subtitle="See and edit the employee's bank account information"
          >
            <div className="grid grid-cols-4 gap-4 mb-4">
              <F label="Bank Name" value={bankName} onSave={pi('bankName')} />
              <F label="Branch Name" value={bankBranch} onSave={pi('bankBranch')} />
              <F label="Account Number" value={bankAccount} onSave={pi('bankAccount')} />
              <F label="Account Name" value={bankAccountName} onSave={pi('bankAccountName')} />
            </div>
            <div className="grid grid-cols-4 gap-4">
              <DocumentField
                label="Bank Management Approval"
                value={personalInfo.bankApprovalDoc}
                folder={docsFolder}
                onSave={canEdit ? pi('bankApprovalDoc') : undefined}
              />
            </div>
          </SectionCard>
        </TabsContent>}

        {/* Pension tab */}
        {canSeeSensitive && <TabsContent value="pension" className="mt-6 space-y-4">
          <SectionCard
            title="Pension"
            subtitle="See and edit the employee's pension fund details"
          >
            <div className="grid grid-cols-4 gap-4 mb-4">
              <F label="Pension Fund Name" value={workInfo.pensionFundName || ''} onSave={wi('pensionFundName')} />
              <F label="Pension ID" value={workInfo.pensionId || ''} onSave={wi('pensionId')} />
              <DateField label="Start Date" value={workInfo.pensionStartDate || ''} onSave={wi('pensionStartDate')} />
              <F label="Employee Contribution (%)" value={workInfo.pensionEmployeeContribution || ''} onSave={wi('pensionEmployeeContribution')} />
            </div>
            <div className="grid grid-cols-4 gap-4">
              <F label="Employer Contribution (%)" value={workInfo.pensionEmployerContribution || ''} onSave={wi('pensionEmployerContribution')} />
              <DocumentField
                label="Pension Document"
                value={workInfo.pensionDoc}
                folder={docsFolder}
                onSave={canEdit ? wi('pensionDoc') : undefined}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Training Fund"
            subtitle="See and edit the employee's training fund details"
          >
            <div className="grid grid-cols-4 gap-4 mb-4">
              <F label="Training Fund Name" value={workInfo.trainingFundName || ''} onSave={wi('trainingFundName')} />
              <F label="Training Fund ID" value={workInfo.trainingFundId || ''} onSave={wi('trainingFundId')} />
              <DateField label="Start Date" value={workInfo.trainingFundStartDate || ''} onSave={wi('trainingFundStartDate')} />
              <F label="Employee Contribution (%)" value={workInfo.trainingFundEmployeeContribution || ''} onSave={wi('trainingFundEmployeeContribution')} />
            </div>
            <div className="grid grid-cols-4 gap-4">
              <F label="Employer Contribution (%)" value={workInfo.trainingFundEmployerContribution || ''} onSave={wi('trainingFundEmployerContribution')} />
              <DocumentField
                label="Training Fund Document"
                value={workInfo.trainingFundDoc}
                folder={docsFolder}
                onSave={canEdit ? wi('trainingFundDoc') : undefined}
              />
            </div>
          </SectionCard>
        </TabsContent>}

      </Tabs>
    </div>
  );
}
