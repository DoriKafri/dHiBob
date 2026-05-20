"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, SlidersHorizontal } from "lucide-react";
import * as XLSX from "xlsx";
import { formatCurrency } from "@/lib/currency";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortDir = "asc" | "desc" | null;
type TabKey = "termination" | "active" | "compensation" | "expenses" | "custom";

/** Format any date-like value to YYYY-MM-DD */
function fmtDate(val: unknown): string {
  if (!val) return '—';
  const s = String(val);
  if (s.includes('T')) return s.slice(0, 10);
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch {}
  return s;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      data-testid="skeleton"
      className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className ?? ""}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Excel download helper
// ---------------------------------------------------------------------------

function downloadExcel(filename: string, visibleColumns: Column[], rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const sheetData = [
    visibleColumns.map((c) => c.label),
    ...rows.map((row) =>
      visibleColumns.map((col) => {
        const val = row[col.key];
        if (col.format) return col.format(val, row);
        if (val instanceof Date) return val.toISOString().slice(0, 10);
        if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}T/)) return val.slice(0, 10);
        return val ?? "";
      })
    ),
  ];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, filename);
}

// ---------------------------------------------------------------------------
// SortableTable
// ---------------------------------------------------------------------------

interface Column {
  key: string;
  label: string;
  format?: (val: unknown, row?: Record<string, unknown>) => string;
  visible: boolean;
}

function SortableTable({
  columns,
  rows,
  sortedRows,
  isLoading,
  onToggleColumn,
  sortKey,
  sortDir,
  onSort,
}: {
  columns: Column[];
  rows: Record<string, unknown>[];
  sortedRows: Record<string, unknown>[];
  isLoading: boolean;
  onToggleColumn: (key: string) => void;
  sortKey: string | null;
  sortDir: SortDir;
  onSort: (key: string) => void;
}) {
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  const visibleColumns = columns.filter((c) => c.visible);

  function sortIndicator(key: string) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : sortDir === "desc" ? " ↓" : "";
  }

  function formatCell(col: Column, val: unknown, row?: Record<string, unknown>): string {
    if (col.format) return col.format(val, row);
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    // Auto-detect date strings like "2020-05-12T00:00:00.000Z"
    if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}T/)) return val.slice(0, 10);
    return String(val ?? "—");
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="py-12 text-center text-gray-500">No results found for the selected filters.</div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Column toggle button */}
      <div className="flex justify-end relative">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowColumnMenu((v) => !v)}
          className="gap-2"
          aria-label="Columns"
        >
          <SlidersHorizontal size={14} />
          Columns
        </Button>
        {showColumnMenu && (
          <div className="absolute right-0 top-9 z-50 bg-white dark:bg-charcoal-800 border rounded shadow-lg p-3 min-w-[180px]">
            {columns.map((col) => (
              <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={col.visible}
                  onChange={() => onToggleColumn(col.key)}
                  aria-label={col.label}
                />
                {col.label}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b">
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  role="columnheader"
                  onClick={() => onSort(col.key)}
                  className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 cursor-pointer select-none hover:text-gray-900 dark:hover:text-white"
                >
                  {col.label}{sortIndicator(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, i) => (
              <tr key={i} className="border-b hover:bg-gray-50 dark:hover:bg-charcoal-700">
                {visibleColumns.map((col) => (
                  <td key={col.key} className="px-3 py-2 text-gray-800 dark:text-gray-200 whitespace-nowrap">
                    {formatCell(col, row[col.key], row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column definitions per tab
// ---------------------------------------------------------------------------

/** Format a salary/amount value using the row's currency code.
 *  Falls back to $ when no currency column is present in the row. */
function money(val: unknown, row?: Record<string, unknown>) {
  const n = Number(val ?? 0);
  if (n === 0) return '—';
  const code = (row?.currency ?? row?.salaryCurrency ?? 'USD') as string;
  return formatCurrency(n, code);
}

/** Same as money() but reads row.newCurrency — used for future-increase
 *  salary columns where the currency may differ from the current salary. */
function newMoney(val: unknown, row?: Record<string, unknown>) {
  const n = Number(val ?? 0);
  if (n === 0) return '—';
  const code = (row?.newCurrency ?? row?.currency ?? 'USD') as string;
  return formatCurrency(n, code);
}

const TERMINATION_COLS: Column[] = [
  { key: "name",              label: "Name",               visible: true },
  { key: "nationalId",        label: "National ID",        visible: true },
  { key: "department",        label: "Department",         visible: true },
  { key: "seniorityYears",    label: "Seniority (yrs)",    visible: true },
  { key: "terminationReason", label: "Termination Reason", visible: true },
  { key: "endDate",           label: "Termination Date",   visible: true },
  { key: "role",              label: "Role",               visible: true },
];

const ACTIVE_COLS: Column[] = [
  { key: "name",           label: "Name",            visible: true },
  { key: "nationalId",     label: "National ID",     visible: true },
  { key: "department",     label: "Department",      visible: true },
  { key: "startDate",      label: "Start Date",      visible: true },
  { key: "seniorityYears", label: "Seniority (yrs)", visible: true },
  { key: "salary",         label: "Salary",          format: money, visible: true },
  { key: "baseSalary",     label: "Base (80%)",      format: money, visible: true },
  { key: "additional",     label: "Additional (20%)", format: money, visible: true },
  { key: "role",           label: "Role",            visible: true },
];

const COMPENSATION_COLS: Column[] = [
  { key: "name",          label: "Name",           visible: true },
  { key: "nationalId",    label: "National ID",    visible: true },
  { key: "department",    label: "Department",     visible: true },
  { key: "role",          label: "Role",           visible: true },
  { key: "currentSalary", label: "Current Salary", format: money,  visible: true },
  { key: "currentBase",   label: "Base (80%)",     format: money,  visible: true },
  { key: "currentAdditional", label: "Additional (20%)", format: money, visible: true },
  { key: "newSalary",     label: "New Salary",     format: newMoney,  visible: true },
  { key: "effectiveDate", label: "Effective Date", visible: true },
  { key: "type",          label: "Type",           visible: true },
  { key: "changeReason",  label: "Note",           visible: true },
];

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const ALL_CUSTOM_COLUMNS: Column[] = [
  { key: "fullName",       label: "Full Name",        visible: true },
  { key: "firstName",      label: "First Name",       visible: false },
  { key: "lastName",       label: "Last Name",        visible: false },
  { key: "email",          label: "Email",            visible: true },
  { key: "nationalId",     label: "National ID",      visible: true },
  { key: "status",         label: "Status",           visible: true },
  { key: "department",     label: "Department",       visible: true },
  { key: "site",           label: "Site",             visible: false },
  { key: "jobTitle",       label: "Job Title",        visible: true },
  { key: "team",           label: "Team",             visible: false },
  { key: "manager",        label: "Manager",          visible: true },
  { key: "startDate",      label: "Start Date",       visible: true },
  { key: "endDate",        label: "End Date",         visible: false },
  { key: "seniorityYears", label: "Seniority (yrs)",  visible: false },
  { key: "employmentType", label: "Employment Type",  visible: false },
  { key: "gender",         label: "Gender",           visible: true },
  { key: "dateOfBirth",    label: "Date of Birth",    visible: false },
  { key: "nationality",    label: "Nationality",      visible: false },
  { key: "address",        label: "Address",          visible: false },
  { key: "city",           label: "City",             visible: false },
  { key: "country",        label: "Country",          visible: false },
  { key: "phone",          label: "Phone",            visible: false },
  { key: "emergencyContactName",  label: "Emergency Contact",      visible: false },
  { key: "emergencyContactPhone", label: "Emergency Phone",        visible: false },
  { key: "bankName",       label: "Bank Name",        visible: false },
  { key: "bankAccount",    label: "Bank Account",     visible: false },
  { key: "currentSalary",  label: "Current Salary",   format: money, visible: true },
  { key: "baseSalary",     label: "Base (80%)",       format: money, visible: false },
  { key: "additional",     label: "Additional (20%)", format: money, visible: false },
  { key: "salaryCurrency", label: "Currency",         visible: false },
  { key: "contractType",   label: "Contract Type",    visible: false },
  { key: "salaryType",     label: "Salary Type",      visible: false },
  { key: "terminationReason", label: "Termination Reason", visible: false },
];

const EXPENSE_COLS: Column[] = [
  { key: "name",          label: "Employee",      visible: true },
  { key: "nationalId",    label: "National ID",    visible: false },
  { key: "department",    label: "Department",     visible: true },
  { key: "expenseType",   label: "Type",           visible: true },
  { key: "supplierName",  label: "Supplier",       visible: true },
  { key: "amount",        label: "Amount",         visible: true, format: (v) => typeof v === 'number' ? v.toLocaleString(undefined, { minimumFractionDigits: 2 }) : String(v ?? '') },
  { key: "currency",      label: "Currency",       visible: true },
  { key: "expenseDate",   label: "Expense Date",   visible: true, format: (v) => fmtDate(v) },
  { key: "payrollMonth",  label: "Payroll Month",  visible: true },
  { key: "status",        label: "Status",         visible: true },
  { key: "notes",         label: "Notes",          visible: false },
];

const TABS: { key: TabKey; label: string }[] = [
  { key: "termination",  label: "Termination Report" },
  { key: "active",       label: "Active Employees" },
  { key: "compensation", label: "Compensation & Increases" },
  { key: "expenses",     label: "Expenses" },
  { key: "custom",       label: "Custom Report" },
];

const DEPARTMENTS = ['All', 'Executive', 'Engineering', 'Product', 'Design', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations'];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("termination");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [idFilter, setIdFilter] = useState("");

  // Column visibility state per tab
  const [terminationCols, setTerminationCols] = useState<Column[]>(TERMINATION_COLS);
  const [activeCols, setActiveCols] = useState<Column[]>(ACTIVE_COLS);
  const [compensationCols, setCompensationCols] = useState<Column[]>(COMPENSATION_COLS);
  const [customCols, setCustomCols] = useState<Column[]>(ALL_CUSTOM_COLUMNS);
  const [expenseCols, setExpenseCols] = useState<Column[]>(EXPENSE_COLS);

  // Sort state (shared, resets when tab changes)
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  function handleSort(key: string) {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortDir(null); setSortKey(null); }
      else { setSortKey(key); setSortDir("asc"); }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function handleTabChange(tab: TabKey) {
    setActiveTab(tab);
    setSortKey(null);
    setSortDir(null);
  }

  // tRPC queries — always call all hooks (React rules)
  const terminationQ = trpc.reports.getTerminationReport.useQuery({
    department: departmentFilter || undefined,
  });
  const activeQ = trpc.reports.getActiveReport.useQuery({
    department: departmentFilter || undefined,
  });
  const customQ = trpc.reports.getCustomReportData.useQuery();
  const expenseQ = trpc.reports.getExpenseReport.useQuery({
    department: departmentFilter || undefined,
  });
  const salaryQ = trpc.reports.getSalaryReport.useQuery({
    department: departmentFilter || undefined,
  });
  // Combined compensation rows: one row per future increase; employees with none appear once with blank future fields
  const compensationRows = useMemo(() =>
    (salaryQ.data?.rows ?? []).flatMap((r: any) => {
      const increases = r.futureIncreases ?? [];
      if (increases.length === 0) {
        return [{
          name: r.name, nationalId: r.nationalId, department: r.department, role: r.role,
          currentSalary: r.currentSalary, currentBase: r.currentBase, currentAdditional: r.currentAdditional,
          currency: r.currency,
          newCurrency: r.currency,
          newSalary: null, newBase: null, newAdditional: null, effectiveDate: "", type: "", changeReason: "",
        }];
      }
      return increases.map((fi: any) => ({
        name: r.name, nationalId: r.nationalId, department: r.department, role: r.role,
        currentSalary: r.currentSalary, currentBase: r.currentBase, currentAdditional: r.currentAdditional,
        currency: r.currency,
        newCurrency: fi.currency || r.currency,
        newSalary:     fi.salary,
        newBase:       fi.salary ? Math.round(fi.salary * 0.8) : null,
        newAdditional: fi.salary ? Math.round(fi.salary * 0.2) : null,
        effectiveDate: fi.effectiveDate ? new Date(fi.effectiveDate).toISOString().slice(0, 10) : "",
        type:          fi.type ?? "",
        changeReason:  fi.changeReason ?? "",
      }));
    }),
    [salaryQ.data]
  );

  function toggleColumn(
    cols: Column[],
    setCols: (c: Column[]) => void,
    key: string
  ) {
    setCols(cols.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)));
  }

  // Filter rows by month and/or national ID
  function filterRows(data: any[], dateKey: string): any[] {
    let filtered = data;
    if (monthFilter) {
      filtered = filtered.filter(row => {
        const val = row[dateKey];
        if (!val) return false;
        const dateStr = val instanceof Date ? val.toISOString() : String(val);
        return dateStr.includes(`-${monthFilter}-`);
      });
    }
    if (idFilter) {
      const q = idFilter.toLowerCase();
      filtered = filtered.filter(row => (row.nationalId || '').toLowerCase().includes(q));
    }
    return filtered;
  }

  // Resolve current tab's data
  const { rows, cols, setCols, isLoading } = useMemo(() => {
    switch (activeTab) {
      case "termination":
        return { rows: filterRows(terminationQ.data?.rows ?? [], 'endDate'), cols: terminationCols, setCols: setTerminationCols, isLoading: terminationQ.isLoading };
      case "active":
        return { rows: filterRows(activeQ.data?.rows ?? [], 'startDate'), cols: activeCols, setCols: setActiveCols, isLoading: activeQ.isLoading };
      case "compensation":
        return { rows: filterRows(compensationRows, 'effectiveDate'), cols: compensationCols, setCols: setCompensationCols, isLoading: salaryQ.isLoading };
      case "expenses":
        return { rows: filterRows(expenseQ.data?.rows ?? [], 'expenseDate'), cols: expenseCols, setCols: setExpenseCols, isLoading: expenseQ.isLoading };
      case "custom":
        return { rows: filterRows(customQ.data ?? [], 'startDate'), cols: customCols, setCols: setCustomCols, isLoading: customQ.isLoading };
    }
  }, [activeTab, terminationQ, activeQ, salaryQ, expenseQ, terminationCols, activeCols, compensationCols, expenseCols, compensationRows, monthFilter, idFilter]);

  // Sorted rows (same logic used by both table display and export)
  const sortedRows = useMemo(() => {
    if (!sortKey || !sortDir) return rows as Record<string, unknown>[];
    return [...(rows as Record<string, unknown>[])].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av instanceof Date && bv instanceof Date) {
        return sortDir === "asc" ? av.getTime() - bv.getTime() : bv.getTime() - av.getTime();
      }
      const as = String(av ?? "");
      const bs = String(bv ?? "");
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [rows, sortKey, sortDir]);

  // Excel export — uses sortedRows and only visible columns
  function handleDownload() {
    const visibleCols = cols.filter((c) => c.visible);
    const filenames: Record<TabKey, string> = {
      termination:  "termination-report.xlsx",
      active:       "active-employees-report.xlsx",
      compensation: "compensation-report.xlsx",
      expenses:     "expense-reimbursement-report.xlsx",
      custom:       "custom-report.xlsx",
    };
    downloadExcel(filenames[activeTab], visibleCols, sortedRows);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-charcoal-900 dark:text-white">Reports</h1>
        <Button type="button" variant="outline" className="gap-2" onClick={handleDownload} aria-label="Export Excel">
          <Download size={16} />
          Export Excel
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value === 'All' ? '' : e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 text-gray-900 dark:text-white min-w-[160px]"
        >
          {DEPARTMENTS.map(d => (
            <option key={d} value={d}>{d === 'All' ? 'All Departments' : d}</option>
          ))}
        </select>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-charcoal-800 text-gray-900 dark:text-white min-w-[140px]"
        >
          <option value="">All months</option>
          {['January','February','March','April','May','June','July','August','September','October','November','December'].map((name, i) => (
            <option key={i} value={String(i + 1).padStart(2, '0')}>{name}</option>
          ))}
        </select>
        <Input
          placeholder="Filter by National ID…"
          value={idFilter}
          onChange={(e) => setIdFilter(e.target.value)}
          className="max-w-[180px]"
        />
      </div>

      {/* Tab bar */}
      <div role="tablist" className="flex border-b gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-primary-500 text-primary-600 dark:text-primary-400"
                : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-4">
          <SortableTable
            columns={cols}
            rows={rows as Record<string, unknown>[]}
            sortedRows={sortedRows}
            isLoading={isLoading}
            onToggleColumn={(key) => toggleColumn(cols, setCols, key)}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
          />
        </CardContent>
      </Card>
    </div>
  );
}
