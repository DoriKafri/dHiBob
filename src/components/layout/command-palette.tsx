"use client";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import {
  Search, Users, User, Calendar, FileText, Ticket, Monitor, Key,
  BarChart3, ClipboardList, BookOpen, Briefcase, UserCheck, UserMinus,
  Network, LayoutDashboard, Settings, TrendingUp, Home,
} from "lucide-react";

interface SearchResult {
  id: string;
  type: "employee" | "page" | "ticket" | "document";
  title: string;
  subtitle?: string;
  href: string;
  icon: React.ReactNode;
}

const PAGES: SearchResult[] = [
  { id: "p-home",         type: "page", title: "Home",           href: "/home",         icon: <Home size={16} /> },
  { id: "p-people",       type: "page", title: "People",         href: "/people",       icon: <Users size={16} /> },
  { id: "p-orgchart",     type: "page", title: "Org Chart",      href: "/org-chart",    icon: <Network size={16} /> },
  { id: "p-timeoff",      type: "page", title: "Time Off",       href: "/time-off",     icon: <Calendar size={16} /> },
  { id: "p-expenses",     type: "page", title: "Expenses",       href: "/expenses",     icon: <FileText size={16} /> },
  { id: "p-performance",  type: "page", title: "Performance",    href: "/performance",  icon: <TrendingUp size={16} /> },
  { id: "p-hiring",       type: "page", title: "Hiring",         href: "/hiring",       icon: <Briefcase size={16} /> },
  { id: "p-onboarding",   type: "page", title: "Onboarding",     href: "/onboarding",   icon: <UserCheck size={16} /> },
  { id: "p-offboarding",  type: "page", title: "Offboarding",    href: "/offboarding",  icon: <UserMinus size={16} /> },
  { id: "p-learning",     type: "page", title: "Learning",       href: "/learning",     icon: <BookOpen size={16} /> },
  { id: "p-surveys",      type: "page", title: "Surveys",        href: "/surveys",      icon: <BarChart3 size={16} /> },
  { id: "p-analytics",    type: "page", title: "Analytics",      href: "/analytics",    icon: <TrendingUp size={16} /> },
  { id: "p-reports",      type: "page", title: "Reports",        href: "/reports",      icon: <ClipboardList size={16} /> },
  { id: "p-documents",    type: "page", title: "Documents",      href: "/documents",    icon: <FileText size={16} /> },
  { id: "p-hrportal",     type: "page", title: "HR Portal",      href: "/hr-portal",    icon: <LayoutDashboard size={16} /> },
  { id: "p-tickets",      type: "page", title: "IT Tickets",     href: "/it-tickets",   icon: <Ticket size={16} /> },
  { id: "p-assets",       type: "page", title: "IT Assets",      href: "/it-assets",    icon: <Monitor size={16} /> },
  { id: "p-licenses",     type: "page", title: "IT Licenses",    href: "/it-licenses",  icon: <Key size={16} /> },
  { id: "p-settings",     type: "page", title: "Settings",       href: "/settings",     icon: <Settings size={16} /> },
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch employees for search (cached by tRPC)
  const { data: employeesData } = trpc.employee.list.useQuery(
    { limit: 500 },
    { enabled: open }
  );

  // Fetch tickets for search
  const { data: ticketsData } = trpc.tickets.list.useQuery(
    {},
    { enabled: open && !!session }
  );

  const results = useMemo<SearchResult[]>(() => {
    const q = query.toLowerCase().trim();
    if (!q) {
      // Show recent/suggested pages when no query
      return PAGES.slice(0, 8);
    }

    const matched: SearchResult[] = [];

    // Search pages
    PAGES.forEach(p => {
      if (p.title.toLowerCase().includes(q)) {
        matched.push(p);
      }
    });

    // Search employees
    const employees = (employeesData as any)?.employees ?? [];
    employees.forEach((e: any) => {
      const name = `${e.firstName} ${e.lastName}`;
      const email = e.email || "";
      if (name.toLowerCase().includes(q) || email.toLowerCase().includes(q)) {
        matched.push({
          id: `e-${e.id}`,
          type: "employee",
          title: name,
          subtitle: `${e.department?.name || ''} · ${email}`,
          href: `/people/${e.id}`,
          icon: <User size={16} />,
        });
      }
    });

    // Search tickets
    (ticketsData ?? []).forEach((t: any) => {
      if (t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)) {
        matched.push({
          id: `t-${t.id}`,
          type: "ticket",
          title: t.title,
          subtitle: `${t.status} · ${t.category}`,
          href: `/it-tickets`,
          icon: <Ticket size={16} />,
        });
      }
    });

    return matched.slice(0, 12);
  }, [query, employeesData, ticketsData]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIdx(0);
  }, [results.length]);

  const navigate = useCallback((result: SearchResult) => {
    router.push(result.href);
    onOpenChange(false);
  }, [router, onOpenChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIdx]) {
      e.preventDefault();
      navigate(results[selectedIdx]);
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  if (!open) return null;

  const typeLabel: Record<string, string> = {
    employee: "Employee",
    page: "Page",
    ticket: "Ticket",
    document: "Document",
  };

  const typeColor: Record<string, string> = {
    employee: "text-blue-500",
    page: "text-gray-400",
    ticket: "text-amber-500",
    document: "text-emerald-500",
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm" onClick={() => onOpenChange(false)} />

      {/* Palette */}
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 z-[201] w-full max-w-lg">
        <div className="bg-white dark:bg-charcoal-900 rounded-xl shadow-2xl border border-gray-200 dark:border-charcoal-700 overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-charcoal-700">
            <Search size={18} className="text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search employees, pages, tickets..."
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400 text-gray-900 dark:text-white"
              autoComplete="off"
            />
            <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-charcoal-800 rounded">ESC</kbd>
          </div>

          {/* Results */}
          <div className="max-h-[360px] overflow-y-auto py-1">
            {results.length === 0 && query ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                No results for &quot;{query}&quot;
              </div>
            ) : (
              results.map((r, i) => (
                <button
                  key={r.id}
                  onClick={() => navigate(r)}
                  onMouseEnter={() => setSelectedIdx(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === selectedIdx
                      ? "bg-primary-50 dark:bg-primary-900/20"
                      : "hover:bg-gray-50 dark:hover:bg-charcoal-800"
                  }`}
                >
                  <span className={`shrink-0 ${typeColor[r.type] || 'text-gray-400'}`}>{r.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-gray-900 dark:text-white">{r.title}</p>
                    {r.subtitle && <p className="text-[11px] text-gray-400 truncate">{r.subtitle}</p>}
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">{typeLabel[r.type]}</span>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-gray-100 dark:border-charcoal-700 flex items-center justify-between text-[10px] text-gray-400">
            <span>↑↓ Navigate · ↵ Open · ESC Close</span>
            <span>⌘K to toggle</span>
          </div>
        </div>
      </div>
    </>
  );
}
