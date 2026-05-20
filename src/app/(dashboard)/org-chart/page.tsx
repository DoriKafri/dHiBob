"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Search, X, Maximize2, Target } from "lucide-react";
import { TreeView, OrgEmployee, DEPT_COLORS, DEFAULT_COLORS } from "@/components/org-chart/tree-view";

function parseJobTitle(workInfo: any): string {
  if (!workInfo) return "";
  try {
    const parsed = typeof workInfo === "string" ? JSON.parse(workInfo) : workInfo;
    return parsed?.jobTitle || "";
  } catch {
    return "";
  }
}

export default function OrgChartPage() {
  const { data: session } = useSession();
  const { data, isLoading } = trpc.employee.getOrgChartData.useQuery();
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [autoFocused, setAutoFocused] = useState(false);

  const employees: OrgEmployee[] = useMemo(() => {
    if (!data) return [];
    return (data as any[]).map(e => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      avatar: e.avatar,
      managerId: e.managerId,
      jobTitle: parseJobTitle(e.workInfo),
      department: e.department,
      directReportsCount: e._count?.directReports ?? 0,
    }));
  }, [data]);

  const byId = useMemo(() => {
    const m = new Map<string, OrgEmployee>();
    employees.forEach(e => m.set(e.id, e));
    return m;
  }, [employees]);

  // Resolve root: prefer focused person's top-of-chain, else the top-level employee
  // with the largest subtree (so we land on the CEO, not a top-level employee who happens
  // to have no reports).
  const rootId = useMemo(() => {
    if (!employees.length) return "";
    if (focusedId) {
      let cur = byId.get(focusedId);
      while (cur?.managerId && byId.has(cur.managerId)) {
        cur = byId.get(cur.managerId);
      }
      if (cur) return cur.id;
    }
    const topLevel = employees.filter(e => !e.managerId || !byId.has(e.managerId as string));
    if (!topLevel.length) return employees[0].id;

    // Count transitive descendants to pick the biggest tree (iterative, cycle-safe)
    const childrenByParent = new Map<string, string[]>();
    employees.forEach(e => {
      if (e.managerId) {
        if (!childrenByParent.has(e.managerId)) childrenByParent.set(e.managerId, []);
        childrenByParent.get(e.managerId)!.push(e.id);
      }
    });
    const countFrom = (startId: string): number => {
      const seen = new Set<string>();
      const stack = [startId];
      let total = 0;
      while (stack.length) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const kids = childrenByParent.get(id) ?? [];
        for (const k of kids) {
          if (!seen.has(k)) {
            total++;
            stack.push(k);
          }
        }
      }
      return total;
    };
    const counts = new Map(topLevel.map(e => [e.id, countFrom(e.id)]));
    topLevel.sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
    return topLevel[0].id;
  }, [employees, byId, focusedId]);

  // Default expansion: open root + immediate level; when focusing on someone, open the full chain to them.
  useEffect(() => {
    if (!employees.length || !rootId) return;
    const next = new Set<string>();
    next.add(rootId);
    if (focusedId) {
      let cur = byId.get(focusedId);
      while (cur) {
        next.add(cur.id);
        if (!cur.managerId) break;
        cur = byId.get(cur.managerId);
      }
    } else {
      // Expand only the root's direct children are visible; don't auto-open further
    }
    setExpandedIds(next);
    if (!focusedId) return;
    setHighlightedId(focusedId);
    const t = setTimeout(() => setHighlightedId(null), 2500);
    return () => clearTimeout(t);
  }, [rootId, focusedId, byId, employees.length]);

  // Auto-focus on the logged-in user on first load
  useEffect(() => {
    if (autoFocused || !session?.user?.employeeId || !employees.length) return;
    const myId = session.user.employeeId;
    if (byId.has(myId)) {
      setFocusedId(myId);
      setAutoFocused(true);
    }
  }, [session, employees.length, byId, autoFocused]);

  const departments = useMemo(() => {
    const s = new Set<string>();
    employees.forEach(e => { if (e.department?.name) s.add(e.department.name); });
    return Array.from(s).sort();
  }, [employees]);

  // When dept filter is active, restrict the employees passed to tree to that dept + their ancestors
  const visibleEmployees = useMemo(() => {
    if (!deptFilter) return employees;
    const keep = new Set<string>();
    employees.forEach(e => {
      if (e.department?.name === deptFilter) {
        keep.add(e.id);
        let cur = byId.get(e.id);
        while (cur?.managerId && byId.has(cur.managerId)) {
          keep.add(cur.managerId);
          cur = byId.get(cur.managerId);
        }
      }
    });
    return employees.filter(e => keep.has(e.id)).map(e => {
      // Recompute directReportsCount among the visible subset
      const count = employees.filter(x => x.managerId === e.id && keep.has(x.id)).length;
      return { ...e, directReportsCount: count };
    });
  }, [employees, deptFilter, byId]);

  const searchMatches = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return employees
      .filter(e => `${e.firstName} ${e.lastName}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, employees]);

  const handleToggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleExpandAll = () => {
    setExpandedIds(new Set(employees.map(e => e.id)));
  };
  const handleCollapseAll = () => {
    setExpandedIds(new Set(rootId ? [rootId] : []));
  };
  const handleClearFocus = () => setFocusedId(null);

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-160px)] flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading org chart…</div>
      </div>
    );
  }

  const focusedEmp = focusedId ? byId.get(focusedId) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Org Chart</h1>
          {focusedEmp && (
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
              <Target size={12} /> Focused on {focusedEmp.firstName} {focusedEmp.lastName}
              <button onClick={handleClearFocus} className="ml-1 text-primary-500 hover:underline">
                (clear)
              </button>
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search employee…"
              className="pl-9 w-56"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
            {searchMatches.length > 0 && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSearch("")} />
                <div className="absolute left-0 top-full mt-1 z-20 bg-white dark:bg-charcoal-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 w-full max-h-[240px] overflow-y-auto">
                  {searchMatches.map(emp => {
                    const colors = DEPT_COLORS[emp.department?.name || ""] || DEFAULT_COLORS;
                    return (
                      <button
                        key={emp.id}
                        onClick={() => {
                          setFocusedId(emp.id);
                          setSearch("");
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors.dot }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{emp.firstName} {emp.lastName}</p>
                          {emp.department?.name && <p className="text-[10px] text-gray-400">{emp.department.name}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Dept filter pills */}
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setDeptFilter("")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                !deptFilter
                  ? "bg-gray-800 text-white dark:bg-white dark:text-gray-900"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200"
              }`}
            >
              All
            </button>
            {departments.map(dept => {
              const colors = DEPT_COLORS[dept] || DEFAULT_COLORS;
              return (
                <button
                  key={dept}
                  onClick={() => setDeptFilter(deptFilter === dept ? "" : dept)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    deptFilter === dept
                      ? "bg-gray-800 text-white dark:bg-white dark:text-gray-900"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.dot }} />
                  {dept}
                </button>
              );
            })}
          </div>

          <div className="flex gap-1.5">
            <button
              onClick={handleExpandAll}
              className="px-3 py-1.5 text-xs rounded-md border border-gray-200 dark:border-charcoal-700 hover:bg-gray-50 dark:hover:bg-charcoal-800 flex items-center gap-1.5"
              title="Expand all"
            >
              <Maximize2 size={12} /> Expand all
            </button>
            <button
              onClick={handleCollapseAll}
              className="px-3 py-1.5 text-xs rounded-md border border-gray-200 dark:border-charcoal-700 hover:bg-gray-50 dark:hover:bg-charcoal-800"
              title="Collapse all"
            >
              Collapse all
            </button>
          </div>
        </div>
      </div>

      <div className="h-[calc(100vh-220px)] border rounded-xl bg-gradient-to-br from-gray-50 to-white dark:bg-charcoal-800 dark:bg-none border-gray-200 dark:border-charcoal-700 overflow-hidden">
        <TreeView
          rootId={rootId}
          employees={visibleEmployees}
          expandedIds={expandedIds}
          onToggleExpand={handleToggleExpand}
          highlightedId={highlightedId}
        />
      </div>

      <div className="text-xs text-gray-400 flex items-center gap-4 flex-wrap">
        <span>💡 Click a card to open profile · Click ⌄ to expand/collapse · Search to focus on a person · Scroll to zoom · Drag to pan</span>
      </div>
    </div>
  );
}
